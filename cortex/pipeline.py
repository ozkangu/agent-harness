"""Pipeline state machine: phase management, auto-approval, and quality gates."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable, Awaitable

from cortex.board import Board
from cortex.chat import ChatStore
from cortex.models import (
    IssueStatus,
    MessageRole,
    PHASE_TRANSITIONS,
    PipelinePhase,
)
from cortex.planner import PlannerAgent

logger = logging.getLogger(__name__)

PHASE_LABELS: dict[PipelinePhase, str] = {
    PipelinePhase.REPO_CONTEXT: "Phase 0: Repo Context Analysis",
    PipelinePhase.CLARIFICATION: "Phase 1: Clarification Analysis",
    PipelinePhase.AWAITING_CLARIFICATION: "Awaiting Clarification",
    PipelinePhase.ANALYSIS_DOCUMENT: "Phase 2: Analysis Document",
    PipelinePhase.BA_ANALYSIS: "Phase 3: Story Planning",
    PipelinePhase.AWAITING_APPROVAL_1: "Awaiting Approval: Story Review",
    PipelinePhase.CODING: "Phase 4: Coding",
    PipelinePhase.AWAITING_APPROVAL_2: "Awaiting Approval: Code Complete",
    PipelinePhase.CODE_REVIEW: "Phase 3: Code Review",
    PipelinePhase.AWAITING_APPROVAL_3: "Awaiting Approval: Review Report",
    PipelinePhase.TEST_VALIDATION: "Phase 4: Test Validation",
    PipelinePhase.AWAITING_APPROVAL_4: "Awaiting Approval: Test Report",
    PipelinePhase.DONE: "Done",
    PipelinePhase.FAILED: "Failed",
}

# Keywords that count as approval (used in manual mode)
APPROVE_KEYWORDS = {"approve", "approved", "onay", "evet", "yes", "ok", "okay", "lgtm"}
REJECT_KEYWORDS = {"reject", "rejected", "hayir", "hayır", "no", "reddet"}

# How often to check if coding is done (seconds) — fallback only, event-driven is primary
_CODING_POLL_INTERVAL = 60


class PipelineManager:
    """Manages pipeline lifecycle: creation, phase transitions, and approval gates."""

    def __init__(
        self,
        chat_store: ChatStore,
        board: Board,
        planner: PlannerAgent,
        notify: Callable[[str, dict], Awaitable[None]] | None = None,
        auto_approve: bool = True,
        max_inner_iterations: int = 3,
    ) -> None:
        self.chat_store = chat_store
        self.board = board
        self.planner = planner
        self._notify = notify or _noop_notify
        self.auto_approve = auto_approve
        self.max_inner_iterations = max_inner_iterations
        self._running_tasks: dict[int, asyncio.Task] = {}

    async def resume_incomplete_pipelines(self) -> None:
        """Resume pipelines left mid-flight after a restart."""
        pipelines = await self.chat_store.get_pipelines()
        resumable = {
            PipelinePhase.REPO_CONTEXT,
            PipelinePhase.CLARIFICATION,
            PipelinePhase.ANALYSIS_DOCUMENT,
            PipelinePhase.BA_ANALYSIS,
            PipelinePhase.CODING,
            PipelinePhase.CODE_REVIEW,
            PipelinePhase.TEST_VALIDATION,
        }

        for pipeline in pipelines:
            if pipeline.phase not in resumable:
                continue
            if pipeline.id in self._running_tasks and not self._running_tasks[pipeline.id].done():
                continue

            await self.chat_store.add_message(
                pipeline.id,
                MessageRole.SYSTEM,
                f"Resuming pipeline after restart from phase: {PHASE_LABELS[pipeline.phase]}",
                pipeline.phase,
            )
            task = asyncio.create_task(
                self._run_phase(pipeline.id),
                name=f"pipeline-{pipeline.id}-resume",
            )
            self._running_tasks[pipeline.id] = task

    async def start_pipeline(self, requirement: str) -> dict:
        """Create a new pipeline and kick off phase 0."""
        name = requirement[:80].strip()
        pipeline = await self.chat_store.create_pipeline(name, requirement)

        mode = "auto-pilot" if self.auto_approve else "manual approval"
        await self.chat_store.add_message(
            pipeline.id, MessageRole.SYSTEM,
            f"Pipeline started: {name} (mode: {mode})",
            PipelinePhase.REPO_CONTEXT,
        )
        await self.chat_store.add_message(
            pipeline.id, MessageRole.ASSISTANT,
            "Starting pipeline. I'll analyze the repository, clarify ambiguities with you, "
            "build an analysis document, break it into stories, and orchestrate implementation.",
            PipelinePhase.REPO_CONTEXT,
        )

        await self._notify("pipeline_phase_changed", {
            "pipeline_id": pipeline.id,
            "phase": pipeline.phase.value,
            "label": PHASE_LABELS[pipeline.phase],
            "auto_approve": self.auto_approve,
        })

        # Start phase 0 asynchronously
        task = asyncio.create_task(
            self._run_phase(pipeline.id),
            name=f"pipeline-{pipeline.id}",
        )
        self._running_tasks[pipeline.id] = task

        return pipeline.to_dict()

    async def advance_phase(self, pipeline_id: int) -> dict:
        """Advance pipeline to the next phase based on current state."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        current = pipeline.phase

        if current == PipelinePhase.DONE:
            return pipeline.to_dict()

        if current == PipelinePhase.FAILED:
            # Restart from the beginning
            await self._transition(pipeline_id, PipelinePhase.REPO_CONTEXT)
            task = asyncio.create_task(
                self._run_phase(pipeline_id),
                name=f"pipeline-{pipeline_id}",
            )
            self._running_tasks[pipeline_id] = task
            pipeline = await self.chat_store.get_pipeline(pipeline_id)
            assert pipeline is not None
            return pipeline.to_dict()

        # Run the appropriate phase logic
        task = asyncio.create_task(
            self._run_phase(pipeline_id),
            name=f"pipeline-{pipeline_id}",
        )
        self._running_tasks[pipeline_id] = task

        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None
        return pipeline.to_dict()

    async def handle_user_message(self, pipeline_id: int, text: str) -> dict:
        """Handle an incoming user message."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        msg = await self.chat_store.add_message(
            pipeline_id, MessageRole.USER, text, pipeline.phase,
        )

        await self._notify("chat_message", msg.to_dict())

        if pipeline.phase == PipelinePhase.FAILED:
            await self._transition(pipeline_id, PipelinePhase.REPO_CONTEXT)
            reply = await self.chat_store.add_message(
                pipeline_id,
                MessageRole.ASSISTANT,
                "The previous run had failed. Restarting the pipeline with the current backend selection.",
                PipelinePhase.REPO_CONTEXT,
            )
            await self._notify("chat_message", reply.to_dict())
            task = asyncio.create_task(
                self._run_phase(pipeline_id),
                name=f"pipeline-{pipeline_id}-restart-from-failed",
            )
            self._running_tasks[pipeline_id] = task
            return reply.to_dict()

        # If in an awaiting state (manual mode), check for approval/rejection
        if pipeline.phase == PipelinePhase.AWAITING_CLARIFICATION:
            await self.planner.append_clarification_answer(pipeline_id, text)
            await self.chat_store.add_message(
                pipeline_id,
                MessageRole.SYSTEM,
                "Clarification received. Re-evaluating requirement completeness.",
                PipelinePhase.AWAITING_CLARIFICATION,
            )
            await self._transition(pipeline_id, PipelinePhase.CLARIFICATION)
            task = asyncio.create_task(
                self._run_phase(pipeline_id),
                name=f"pipeline-{pipeline_id}",
            )
            self._running_tasks[pipeline_id] = task
            refreshed = await self.chat_store.get_pipeline(pipeline_id)
            assert refreshed is not None
            return refreshed.to_dict()

        if pipeline.phase.value.startswith("awaiting_"):
            lower = text.strip().lower()
            if lower in APPROVE_KEYWORDS:
                return await self.approve(pipeline_id)
            elif lower in REJECT_KEYWORDS:
                return await self.reject(pipeline_id)
            reply = await self.chat_store.add_message(
                pipeline_id, MessageRole.ASSISTANT,
                "This pipeline is waiting for an explicit approval, rejection, or clarification response.",
                pipeline.phase,
            )
            await self._notify("chat_message", reply.to_dict())
            return reply.to_dict()

        # If an active phase is running, inform the user
        if pipeline_id in self._running_tasks and not self._running_tasks[pipeline_id].done():
            reply = await self.chat_store.add_message(
                pipeline_id, MessageRole.ASSISTANT,
                "The agent is currently working. Please wait for it to complete.",
                pipeline.phase,
            )
            await self._notify("chat_message", reply.to_dict())
            return reply.to_dict()

        # Recover from an idle active phase, typically after a restart.
        resumable = {
            PipelinePhase.REPO_CONTEXT,
            PipelinePhase.CLARIFICATION,
            PipelinePhase.ANALYSIS_DOCUMENT,
            PipelinePhase.BA_ANALYSIS,
            PipelinePhase.CODING,
            PipelinePhase.CODE_REVIEW,
            PipelinePhase.TEST_VALIDATION,
        }
        if pipeline.phase in resumable:
            reply = await self.chat_store.add_message(
                pipeline_id, MessageRole.ASSISTANT,
                f"Pipeline was idle in {PHASE_LABELS[pipeline.phase]}. Resuming now.",
                pipeline.phase,
            )
            await self._notify("chat_message", reply.to_dict())
            task = asyncio.create_task(
                self._run_phase(pipeline_id),
                name=f"pipeline-{pipeline_id}-resume-on-message",
            )
            self._running_tasks[pipeline_id] = task
            return reply.to_dict()

        return msg.to_dict()

    async def approve(self, pipeline_id: int) -> dict:
        """Approve the current awaiting phase and move to the next."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        if not pipeline.phase.value.startswith("awaiting_"):
            raise ValueError(f"Pipeline is not in an approval phase: {pipeline.phase.value}")

        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            f"Approved: {PHASE_LABELS[pipeline.phase]}",
            pipeline.phase,
        )

        # _run_phase handles the awaiting phase and transitions internally
        task = asyncio.create_task(
            self._run_phase(pipeline_id),
            name=f"pipeline-{pipeline_id}",
        )
        self._running_tasks[pipeline_id] = task

        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None
        return pipeline.to_dict()

    async def reject(self, pipeline_id: int) -> dict:
        """Reject the current awaiting phase."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        if not pipeline.phase.value.startswith("awaiting_"):
            raise ValueError(f"Pipeline is not in an approval phase: {pipeline.phase.value}")

        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            f"Rejected: {PHASE_LABELS[pipeline.phase]}. "
            "Going back to BA Analysis. Please refine your requirement.",
            pipeline.phase,
        )

        # Go back to BA_ANALYSIS to regenerate stories
        await self.chat_store.update_pipeline(
            pipeline_id, phase=PipelinePhase.BA_ANALYSIS.value,
        )
        await self._notify("pipeline_phase_changed", {
            "pipeline_id": pipeline_id,
            "phase": PipelinePhase.BA_ANALYSIS.value,
            "label": PHASE_LABELS[PipelinePhase.BA_ANALYSIS],
        })

        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None
        return pipeline.to_dict()

    async def check_coding_completion(self, pipeline_id: int) -> bool:
        """Check if all pipeline issues are done/review."""
        issues = await self.board.get_issues_by_pipeline(pipeline_id)
        if not issues:
            return False
        return all(
            i.status in (IssueStatus.DONE, IssueStatus.REVIEW)
            for i in issues
        )

    async def notify_issue_completed(self, issue_key: str, status: IssueStatus) -> None:
        """Event-driven callback: an issue changed status. Check if its pipeline can advance."""
        issue = await self.board.get_issue(issue_key)
        if issue is None or issue.pipeline_id is None:
            return

        pipeline_id = issue.pipeline_id
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        if pipeline is None or pipeline.phase != PipelinePhase.CODING:
            return

        done = await self.check_coding_completion(pipeline_id)
        if done:
            logger.info(
                "Pipeline %d: all coding issues complete (triggered by %s -> %s)",
                pipeline_id, issue_key, status.value,
            )
            task = asyncio.create_task(
                self._run_phase(pipeline_id),
                name=f"pipeline-{pipeline_id}-advance",
            )
            self._running_tasks[pipeline_id] = task

    # -- Internal helpers --

    async def _transition(self, pipeline_id: int, new_phase: PipelinePhase) -> None:
        """Validate and execute a phase transition."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None

        allowed = PHASE_TRANSITIONS.get(pipeline.phase, set())
        if new_phase not in allowed:
            raise ValueError(
                f"Invalid phase transition: {pipeline.phase.value} -> {new_phase.value}"
            )

        await self.chat_store.update_pipeline(
            pipeline_id, phase=new_phase.value,
        )
        await self._notify("pipeline_phase_changed", {
            "pipeline_id": pipeline_id,
            "phase": new_phase.value,
            "label": PHASE_LABELS[new_phase],
            "auto_approve": self.auto_approve,
        })
        logger.info(
            "Pipeline %d: %s -> %s", pipeline_id,
            pipeline.phase.value, new_phase.value,
        )

    async def _run_phase(self, pipeline_id: int) -> None:
        """Execute the logic for the current phase."""
        try:
            pipeline = await self.chat_store.get_pipeline(pipeline_id)
            if pipeline is None:
                return

            phase = pipeline.phase

            if phase == PipelinePhase.REPO_CONTEXT:
                await self._phase_repo_context(pipeline_id)

            elif phase == PipelinePhase.CLARIFICATION:
                await self._phase_clarification(pipeline_id)

            elif phase == PipelinePhase.AWAITING_CLARIFICATION:
                return

            elif phase == PipelinePhase.ANALYSIS_DOCUMENT:
                await self._phase_analysis_document(pipeline_id)

            elif phase == PipelinePhase.BA_ANALYSIS:
                await self._phase_ba_analysis(pipeline_id)

            elif phase == PipelinePhase.AWAITING_APPROVAL_1:
                await self._phase_awaiting_1(pipeline_id)

            elif phase == PipelinePhase.CODING:
                await self._phase_coding(pipeline_id)

            elif phase == PipelinePhase.AWAITING_APPROVAL_2:
                await self._phase_awaiting_2(pipeline_id)

            elif phase == PipelinePhase.CODE_REVIEW:
                await self._phase_code_review(pipeline_id)

            elif phase == PipelinePhase.AWAITING_APPROVAL_3:
                await self._phase_awaiting_3(pipeline_id)

            elif phase == PipelinePhase.TEST_VALIDATION:
                await self._phase_test_validation(pipeline_id)

            elif phase == PipelinePhase.AWAITING_APPROVAL_4:
                await self._phase_awaiting_4(pipeline_id)

        except Exception as exc:
            logger.exception("Pipeline %d phase failed", pipeline_id)
            try:
                await self.chat_store.update_pipeline(
                    pipeline_id,
                    phase=PipelinePhase.FAILED.value,
                    error=str(exc),
                )
                await self.chat_store.add_message(
                    pipeline_id, MessageRole.SYSTEM,
                    f"Pipeline failed: {exc}",
                    PipelinePhase.FAILED,
                )
                await self._notify("pipeline_phase_changed", {
                    "pipeline_id": pipeline_id,
                    "phase": PipelinePhase.FAILED.value,
                    "label": PHASE_LABELS[PipelinePhase.FAILED],
                })
            except Exception:
                logger.exception("Failed to record pipeline failure")

        finally:
            self._running_tasks.pop(pipeline_id, None)

    # -- Phase implementations --

    async def _phase_repo_context(self, pipeline_id: int) -> None:
        await self.planner.analyze_repo(pipeline_id)
        await self._transition(pipeline_id, PipelinePhase.CLARIFICATION)
        await self._run_phase(pipeline_id)

    async def _phase_clarification(self, pipeline_id: int) -> None:
        result = await self.planner.generate_clarifications(pipeline_id)
        summary = result.get("summary", "")
        questions = result.get("questions", [])

        if summary:
            await self.chat_store.add_message(
                pipeline_id,
                MessageRole.ASSISTANT,
                f"Clarification assessment: {summary}",
                PipelinePhase.CLARIFICATION,
            )

        if questions:
            await self._transition(pipeline_id, PipelinePhase.AWAITING_CLARIFICATION)
            question_lines = ["I need a few clarifications before I can produce the analysis document:"]
            for question in questions:
                qid = question.get("id", "Q?")
                question_text = question.get("question", "")
                rationale = question.get("rationale", "")
                question_lines.append(f"- {qid}: {question_text}")
                if rationale:
                    question_lines.append(f"  Why it matters: {rationale}")
            question_lines.append("Reply in one message; I will fold your answers back into the analysis.")
            await self.chat_store.add_message(
                pipeline_id,
                MessageRole.ASSISTANT,
                "\n".join(question_lines),
                PipelinePhase.AWAITING_CLARIFICATION,
            )
            await self._notify("clarification_requested", {
                "pipeline_id": pipeline_id,
                "questions": questions,
            })
            return

        await self._transition(pipeline_id, PipelinePhase.ANALYSIS_DOCUMENT)
        await self._run_phase(pipeline_id)

    async def _phase_analysis_document(self, pipeline_id: int) -> None:
        await self.planner.generate_analysis_doc(pipeline_id)
        await self._transition(pipeline_id, PipelinePhase.BA_ANALYSIS)
        await self._run_phase(pipeline_id)

    async def _phase_ba_analysis(self, pipeline_id: int) -> None:
        await self.planner.generate_stories(pipeline_id)

        # Story approval is ALWAYS manual — the user reviews and approves/rejects stories
        await self._transition(pipeline_id, PipelinePhase.AWAITING_APPROVAL_1)
        await self.chat_store.add_message(
            pipeline_id, MessageRole.ASSISTANT,
            "Stories generated. Please review and approve or reject.",
            PipelinePhase.AWAITING_APPROVAL_1,
        )
        await self._notify("stories_generated", {
            "pipeline_id": pipeline_id,
        })

    async def _phase_awaiting_1(self, pipeline_id: int) -> None:
        """Create issues from stories and move to coding."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None
        stories_json = pipeline.stories_json
        if stories_json:
            stories = json.loads(stories_json)
            if isinstance(stories, list):
                await self.planner.create_issues_from_stories(pipeline_id, stories)
        await self._transition(pipeline_id, PipelinePhase.CODING)
        await self.chat_store.add_message(
            pipeline_id, MessageRole.ASSISTANT,
            "Issues created on the board. Coding agents will be dispatched by the orchestrator.",
            PipelinePhase.CODING,
        )

        # Start fallback watcher for coding completion (event-driven is primary via
        # notify_issue_completed, this is a safety net with a longer interval)
        asyncio.create_task(
            self._watch_coding_completion(pipeline_id),
            name=f"pipeline-{pipeline_id}-watcher",
        )

    async def _phase_coding(self, pipeline_id: int) -> None:
        """Check if coding is complete. If quality gate passes and auto_approve, skip to DONE."""
        done = await self.check_coding_completion(pipeline_id)
        if done:
            # Check if all quality gates passed for this pipeline's issues
            all_quality_passed = await self._check_pipeline_quality(pipeline_id)

            if self.auto_approve and all_quality_passed:
                # Quality gate shortcut: skip CODE_REVIEW and TEST_VALIDATION
                await self.chat_store.add_message(
                    pipeline_id, MessageRole.SYSTEM,
                    "All coding tasks complete and quality checks passed. Skipping to DONE.",
                    PipelinePhase.CODING,
                )
                await self._transition(pipeline_id, PipelinePhase.DONE)
                await self.chat_store.add_message(
                    pipeline_id, MessageRole.SYSTEM,
                    "Pipeline completed successfully via quality gate shortcut!",
                    PipelinePhase.DONE,
                )
                await self._notify("pipeline_completed", {
                    "pipeline_id": pipeline_id,
                })
            elif self.auto_approve:
                await self.chat_store.add_message(
                    pipeline_id, MessageRole.SYSTEM,
                    "All coding tasks complete. Auto-advancing to code review.",
                    PipelinePhase.CODING,
                )
                await self._transition(pipeline_id, PipelinePhase.AWAITING_APPROVAL_2)
                await self._phase_awaiting_2(pipeline_id)
            else:
                await self._transition(pipeline_id, PipelinePhase.AWAITING_APPROVAL_2)
                await self.chat_store.add_message(
                    pipeline_id, MessageRole.ASSISTANT,
                    "All coding tasks are complete. Please review and approve to proceed "
                    "to code review.",
                    PipelinePhase.AWAITING_APPROVAL_2,
                )
        else:
            await self.chat_store.add_message(
                pipeline_id, MessageRole.SYSTEM,
                "Coding in progress. Waiting for all issues to complete.",
                PipelinePhase.CODING,
            )

    async def _check_pipeline_quality(self, pipeline_id: int) -> bool:
        """Check if all quality runs for this pipeline's issues have passed."""
        issues = await self.board.get_issues_by_pipeline(pipeline_id)
        if not issues:
            return False

        try:
            for issue in issues:
                async with self.board.db.execute(
                    """SELECT status FROM quality_runs
                       WHERE issue_key = ? ORDER BY id DESC LIMIT 1""",
                    (issue.key,),
                ) as cursor:
                    row = await cursor.fetchone()
                    if row is None:
                        return False  # No quality run for this issue
                    if row["status"] != "pass":
                        return False
            return True
        except Exception:
            logger.debug("Quality check query failed for pipeline %d", pipeline_id)
            return False

    async def _phase_awaiting_2(self, pipeline_id: int) -> None:
        await self._transition(pipeline_id, PipelinePhase.CODE_REVIEW)
        await self._run_phase(pipeline_id)

    async def _phase_code_review(self, pipeline_id: int) -> None:
        _content, verdict = await self.planner.run_code_review(pipeline_id)

        if self.auto_approve:
            if verdict.get("verdict") == "PASS":
                await self.chat_store.add_message(
                    pipeline_id, MessageRole.SYSTEM,
                    "Code review auto-approved by quality gate.",
                    PipelinePhase.CODE_REVIEW,
                )
                await self._transition(pipeline_id, PipelinePhase.AWAITING_APPROVAL_3)
                await self._phase_awaiting_3(pipeline_id)
            else:
                # Code review failed — log but proceed (agent feedback is captured)
                issues_found = verdict.get("issues", [])
                await self.chat_store.add_message(
                    pipeline_id, MessageRole.SYSTEM,
                    f"Code review found issues: {', '.join(issues_found[:3])}. "
                    "Proceeding to test validation to capture full quality picture.",
                    PipelinePhase.CODE_REVIEW,
                )
                await self._transition(pipeline_id, PipelinePhase.AWAITING_APPROVAL_3)
                await self._phase_awaiting_3(pipeline_id)
        else:
            await self._transition(pipeline_id, PipelinePhase.AWAITING_APPROVAL_3)
            await self.chat_store.add_message(
                pipeline_id, MessageRole.ASSISTANT,
                "Code review complete. Please review the report and approve or reject.",
                PipelinePhase.AWAITING_APPROVAL_3,
            )

    async def _phase_awaiting_3(self, pipeline_id: int) -> None:
        await self._transition(pipeline_id, PipelinePhase.TEST_VALIDATION)
        await self._run_phase(pipeline_id)

    async def _phase_test_validation(self, pipeline_id: int) -> None:
        _content, verdict = await self.planner.run_test_validation(pipeline_id)

        if self.auto_approve:
            if verdict.get("verdict") == "PASS":
                await self.chat_store.add_message(
                    pipeline_id, MessageRole.SYSTEM,
                    "Test validation auto-approved. Pipeline complete!",
                    PipelinePhase.TEST_VALIDATION,
                )
                await self._transition(pipeline_id, PipelinePhase.AWAITING_APPROVAL_4)
                await self._phase_awaiting_4(pipeline_id)
            else:
                issues_found = verdict.get("issues", [])
                await self.chat_store.add_message(
                    pipeline_id, MessageRole.SYSTEM,
                    f"Test validation found issues: {', '.join(issues_found[:3])}. "
                    "Completing pipeline with warnings.",
                    PipelinePhase.TEST_VALIDATION,
                )
                await self._transition(pipeline_id, PipelinePhase.AWAITING_APPROVAL_4)
                await self._phase_awaiting_4(pipeline_id)
        else:
            await self._transition(pipeline_id, PipelinePhase.AWAITING_APPROVAL_4)
            await self.chat_store.add_message(
                pipeline_id, MessageRole.ASSISTANT,
                "Test validation complete. Please review and approve to finalize.",
                PipelinePhase.AWAITING_APPROVAL_4,
            )

    async def _phase_awaiting_4(self, pipeline_id: int) -> None:
        await self._transition(pipeline_id, PipelinePhase.DONE)
        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            "Pipeline completed successfully!",
            PipelinePhase.DONE,
        )
        await self._notify("pipeline_completed", {
            "pipeline_id": pipeline_id,
        })

    # -- Coding completion watcher --

    async def _watch_coding_completion(self, pipeline_id: int) -> None:
        """Poll until all coding issues are done, then auto-advance."""
        while True:
            await asyncio.sleep(_CODING_POLL_INTERVAL)

            pipeline = await self.chat_store.get_pipeline(pipeline_id)
            if pipeline is None:
                return
            if pipeline.phase != PipelinePhase.CODING:
                return  # Phase already changed (manually or otherwise)

            done = await self.check_coding_completion(pipeline_id)
            if done:
                logger.info("Pipeline %d: all coding issues complete", pipeline_id)
                # Re-enter the coding phase handler which will advance
                task = asyncio.create_task(
                    self._run_phase(pipeline_id),
                    name=f"pipeline-{pipeline_id}-advance",
                )
                self._running_tasks[pipeline_id] = task
                return


async def _noop_notify(event: str, data: dict) -> None:
    """No-op notification handler."""
    pass
