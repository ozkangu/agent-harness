"""Conversation manager: free-form chat with LLM-based intent classification."""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable

from cortex.board import Board
from cortex.chat import ChatStore
from cortex.models import (
    ChatMessage,
    Conversation,
    MessageRole,
)
from cortex.runner import BaseRunner
from cortex.runner_pool import RunnerPool

logger = logging.getLogger(__name__)

# Intent classification prompt
_INTENT_PROMPT = """\
You are an intent classifier. Analyze the user's message and recent conversation history \
to determine the intent. Respond ONLY with a JSON object.

Recent messages:
{history}

Current message: {message}

Rules:
- Greeting, question, general discussion → "chat"
- Simple request like "add/fix/change/update something" → "quick_task"
- Complex multi-step requirement, feature request → "start_pipeline"
- "Create issue/ticket/task for ..." → "create_issue"

Respond with ONLY:
{{"intent": "chat"|"quick_task"|"create_issue"|"start_pipeline"}}
"""


class ConversationManager:
    """Manages free-form chat conversations with automatic intent routing."""

    def __init__(
        self,
        chat_store: ChatStore,
        board: Board,
        runner: BaseRunner | RunnerPool,
        context_engine=None,
        pipeline_manager=None,
        notify: Callable[[str, dict], Awaitable[None]] | None = None,
    ) -> None:
        self.chat_store = chat_store
        self.board = board
        if isinstance(runner, RunnerPool):
            self.runner = runner.default_runner
        else:
            self.runner = runner
        self.context_engine = context_engine
        self.pipeline_manager = pipeline_manager
        self._notify = notify or _noop_notify

    async def create_conversation(self, title: str = "New Chat") -> Conversation:
        """Create a new conversation."""
        return await self.chat_store.create_conversation(title)

    async def handle_message(self, conversation_id: int, text: str) -> dict:
        """Handle an incoming user message with intent-based routing."""
        conv = await self.chat_store.get_conversation(conversation_id)
        if conv is None:
            raise ValueError(f"Conversation {conversation_id} not found")

        # Store user message
        await self.chat_store.add_conversation_message(
            conversation_id, MessageRole.USER, text, task_type="pending",
        )

        # Get recent history for context
        messages = await self.chat_store.get_conversation_messages(conversation_id, limit=10)
        history = self._format_history(messages[-5:]) if len(messages) > 1 else ""

        # Classify intent
        intent = await self._classify_intent(text, history)

        # Route based on intent
        if intent == "chat":
            return await self._handle_chat(conversation_id, text, history)
        elif intent == "quick_task":
            return await self._handle_quick_task(conversation_id, text)
        elif intent == "create_issue":
            return await self._handle_create_issue(conversation_id, text)
        elif intent == "start_pipeline":
            return await self._escalate_to_pipeline(conversation_id, text)
        else:
            return await self._handle_chat(conversation_id, text, history)

    async def _classify_intent(self, text: str, history: str) -> str:
        """Use LLM to classify the intent of a message."""
        prompt = _INTENT_PROMPT.format(history=history or "(no history)", message=text)

        try:
            result = await self.runner.run(
                prompt=prompt,
                workdir=".",
                stall_timeout=30,
                turn_timeout=60,
            )
            if result.success and result.raw_output:
                output = result.raw_output.strip()
                # Try to extract JSON from output
                for line in output.split("\n"):
                    line = line.strip()
                    if line.startswith("{") and "intent" in line:
                        data = json.loads(line)
                        intent = data.get("intent", "chat")
                        if intent in ("chat", "quick_task", "create_issue", "start_pipeline"):
                            return intent
        except Exception:
            logger.exception("Intent classification failed, defaulting to chat")

        return "chat"

    async def _handle_chat(self, conv_id: int, text: str, context: str) -> dict:
        """Handle a simple chat message with context-enriched response."""
        # Build context if engine available
        ctx = ""
        if self.context_engine:
            try:
                ctx = await self.context_engine.build_context(conversation_id=conv_id)
            except Exception:
                logger.debug("Context building failed, continuing without")

        chat_prompt = f"""You are Cortex, an autonomous coding agent orchestrator assistant.
{f'Context: {ctx}' if ctx else ''}

Conversation history:
{context}

User: {text}

Respond helpfully and concisely."""

        response_text = "I'm here to help! You can ask me questions, request quick tasks, or start a full pipeline."

        try:
            result = await self.runner.run(
                prompt=chat_prompt,
                workdir=".",
                stall_timeout=60,
                turn_timeout=120,
            )
            if result.success and result.raw_output:
                response_text = result.raw_output.strip()
        except Exception:
            logger.exception("Chat response generation failed")

        msg = await self.chat_store.add_conversation_message(
            conv_id, MessageRole.ASSISTANT, response_text, task_type="chat",
        )

        await self._notify("conversation_message", {
            "conversation_id": conv_id,
            "message": msg.to_dict(),
        })

        return {"intent": "chat", "message": msg.to_dict()}

    async def _handle_quick_task(self, conv_id: int, text: str) -> dict:
        """Handle a quick task: create issue, run agent, return result."""
        # Create an issue from the request
        issue = await self.board.create_issue(
            title=text[:80],
            description=text,
            priority="medium",
            labels=["quick-task"],
        )

        msg = await self.chat_store.add_conversation_message(
            conv_id, MessageRole.ASSISTANT,
            f"Quick task created as {issue.key}: {issue.title}. The orchestrator will pick it up.",
            task_type="quick_task",
        )

        await self._notify("conversation_message", {
            "conversation_id": conv_id,
            "message": msg.to_dict(),
        })
        await self._notify("quick_task_completed", {
            "conversation_id": conv_id,
            "issue_key": issue.key,
        })

        return {"intent": "quick_task", "issue_key": issue.key, "message": msg.to_dict()}

    async def _handle_create_issue(self, conv_id: int, text: str) -> dict:
        """Create an issue on the board from the chat."""
        issue = await self.board.create_issue(
            title=text[:80],
            description=text,
            priority="medium",
        )

        msg = await self.chat_store.add_conversation_message(
            conv_id, MessageRole.ASSISTANT,
            f"Issue created: {issue.key} - {issue.title}",
            task_type="create_issue",
        )

        await self._notify("conversation_message", {
            "conversation_id": conv_id,
            "message": msg.to_dict(),
        })

        return {"intent": "create_issue", "issue_key": issue.key, "message": msg.to_dict()}

    async def _escalate_to_pipeline(self, conv_id: int, text: str) -> dict:
        """Escalate to the full pipeline workflow."""
        if self.pipeline_manager is None:
            msg = await self.chat_store.add_conversation_message(
                conv_id, MessageRole.ASSISTANT,
                "Pipeline manager is not configured. Please use the Pipeline mode instead.",
                task_type="start_pipeline",
            )
            return {"intent": "start_pipeline", "error": "not_configured", "message": msg.to_dict()}

        pipeline_result = await self.pipeline_manager.start_pipeline(text)
        pipeline_id = pipeline_result.get("id")

        # Link conversation to pipeline
        if pipeline_id:
            await self.chat_store.update_conversation(conv_id, pipeline_id=pipeline_id)

        msg = await self.chat_store.add_conversation_message(
            conv_id, MessageRole.ASSISTANT,
            f"Pipeline started (P-{pipeline_id}). Switch to Pipeline mode to track progress.",
            task_type="start_pipeline",
        )

        await self._notify("conversation_message", {
            "conversation_id": conv_id,
            "message": msg.to_dict(),
        })

        return {"intent": "start_pipeline", "pipeline_id": pipeline_id, "message": msg.to_dict()}

    @staticmethod
    def _format_history(messages: list[ChatMessage]) -> str:
        """Format recent messages for context."""
        lines = []
        for m in messages:
            role = m.role.value.capitalize()
            lines.append(f"{role}: {m.content[:200]}")
        return "\n".join(lines)


async def _noop_notify(event: str, data: dict) -> None:
    """No-op notification handler."""
    pass
