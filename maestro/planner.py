"""Planner agent: Copilot CLI-based repo analysis, story generation, and review."""

from __future__ import annotations

import json
import logging
import re

from maestro.board import Board
from maestro.chat import ChatStore
from maestro.models import Issue, MessageRole, PipelinePhase
from maestro.runner import BaseRunner
from maestro.runner_pool import RunnerPool

logger = logging.getLogger(__name__)

REPO_ANALYSIS_PROMPT = """Analyze this repository structure, conventions, and tech stack.
Provide a concise summary covering:
- Programming languages and frameworks used
- Project structure and architecture patterns
- Key configuration files and dependencies
- Testing setup and conventions
- Build and deployment configuration

Be concise and factual. Output as structured text."""

CLARIFICATION_PROMPT = """You are a senior business analyst agent.

Requirement:
{requirement}

Repository context:
{repo_context}

Previous clarification answers:
{clarification_answers}

Determine whether the requirement is clear enough to produce an implementation analysis document.
Return ONLY a JSON object in ```json``` fences with this shape:
```json
{{
  "status": "ready" or "needs_clarification",
  "summary": "short assessment",
  "questions": [
    {{
      "id": "Q1",
      "question": "specific question to ask the user",
      "rationale": "why this matters"
    }}
  ]
}}
```

Rules:
- Ask at most 3 questions.
- If previous answers resolve the ambiguities, return `"status": "ready"` with an empty questions array.
- Only ask questions that block analysis or implementation planning."""

ANALYSIS_DOCUMENT_PROMPT = """You are a business analysis agent.

Requirement:
{requirement}

Repository context:
{repo_context}

Clarification answers:
{clarification_answers}

Produce a concise markdown analysis document with these sections:
1. Objective
2. Scope
3. Functional Requirements
4. Non-Functional Considerations
5. Assumptions
6. Open Questions
7. Story Planning Notes

Be concrete and implementation-oriented. Do not wrap the output in code fences."""

STORY_GENERATION_PROMPT = """Given this requirement:
{requirement}

And this repository context:
{repo_context}

And this analysis document:
{analysis_doc}

Generate implementation stories as a JSON array. Each story should have:
- "story_id": stable short identifier like "STORY-1"
- "title": short descriptive title
- "description": detailed implementation description with technical details
- "priority": "high", "medium", or "low"
- "labels": array of relevant labels
- "acceptance_criteria": array of acceptance criteria strings
- "depends_on": array of story_id values this story depends on
- "parallelizable": true or false

Output ONLY a valid JSON array wrapped in ```json``` code fences. No other text."""

STORY_QUALITY_GATE_PROMPT = """You are a quality gate agent. Evaluate the following implementation stories
generated from the given requirement.

Requirement:
{requirement}

Generated Stories:
{stories}

Evaluate:
1. Do the stories fully cover the requirement?
2. Are the stories specific enough for a coding agent to implement?
3. Are acceptance criteria clear and testable?
4. Are there any missing stories or gaps?

You MUST respond with a JSON object in ```json``` code fences:
```json
{{
  "verdict": "PASS" or "FAIL",
  "score": 0-100,
  "issues": ["list of issues found, empty if PASS"],
  "summary": "brief explanation"
}}
```"""

CODE_REVIEW_PROMPT = """You are a code review quality gate agent. Review the code changes made for the following stories:
{stories}

Check for:
- Code quality and best practices
- Potential bugs or edge cases
- Security concerns
- Performance issues
- Test coverage

You MUST respond with a JSON object in ```json``` code fences:
```json
{{
  "verdict": "PASS" or "FAIL",
  "score": 0-100,
  "issues": ["list of issues found, empty if PASS"],
  "summary": "brief explanation"
}}
```"""

TEST_VALIDATION_PROMPT = """You are a test validation quality gate agent. Validate the test coverage and results for the following stories:
{stories}

Check:
- All acceptance criteria are covered by tests
- Tests pass successfully
- Edge cases are handled
- Integration points are tested

You MUST respond with a JSON object in ```json``` code fences:
```json
{{
  "verdict": "PASS" or "FAIL",
  "score": 0-100,
  "issues": ["list of issues found, empty if PASS"],
  "summary": "brief explanation"
}}
```"""

INNER_LOOP_FIX_PROMPT = """The previous coding attempt for this story had issues.

Story: {title}
{description}

Error from validation:
{error}

Iteration {iteration} of {max_iterations}.

Fix the issues found. Run the relevant tests to confirm they pass.
If the fix requires changing tests, update them too."""


def extract_verdict(text: str) -> dict | None:
    """Extract a quality gate verdict JSON from agent output.

    Returns dict with keys: verdict, score, issues, summary.
    Returns None if extraction fails.
    """
    # Try code fence first
    fence_match = re.search(r"```json\s*\n?(.*?)```", text, re.DOTALL)
    if fence_match:
        try:
            obj = json.loads(fence_match.group(1).strip())
            if isinstance(obj, dict) and "verdict" in obj:
                return obj
        except json.JSONDecodeError:
            pass

    # Try raw JSON object
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        try:
            obj = json.loads(brace_match.group(0))
            if isinstance(obj, dict) and "verdict" in obj:
                return obj
        except json.JSONDecodeError:
            pass

    return None


def extract_json_object(text: str) -> dict | None:
    """Extract a JSON object from agent output."""
    # Strategy 1: Codex JSONL unwrapping
    try:
        lines = [line for line in text.splitlines() if line.strip()]
        for line in reversed(lines):
            try:
                obj = json.loads(line)
                if isinstance(obj, dict) and "item" in obj and "text" in obj["item"]:
                    text = obj["item"]["text"]  # Replace text with the inner Markdown text and proceed
                    break
            except json.JSONDecodeError:
                continue
    except Exception:
        pass

    fence_match = re.search(r"```json\s*\n?(.*?)```", text, re.DOTALL)
    if fence_match:
        try:
            obj = json.loads(fence_match.group(1).strip())
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass

    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        try:
            obj = json.loads(brace_match.group(0))
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass

    return None


def extract_json_from_output(text: str) -> list[dict] | None:
    """Extract a JSON array from Copilot CLI output.

    Tries multiple strategies:
    1. Parse Codex JSONL wrappers to extract raw text content
    2. Find ```json ... ``` code fences
    3. Find any ``` ... ``` code fences
    4. Find a raw JSON array in the text
    5. Return None if extraction fails
    """
    # Strategy 1: Codex JSONL unwrapping
    try:
        lines = [line for line in text.splitlines() if line.strip()]
        for line in reversed(lines):
            try:
                obj = json.loads(line)
                if isinstance(obj, dict) and "item" in obj and "text" in obj["item"]:
                    text = obj["item"]["text"]  # Replace text with the inner Markdown text and proceed
                    break
            except json.JSONDecodeError:
                continue
    except Exception:
        pass

    # Strategy 2: code fences
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fence_match:
        try:
            val = json.loads(fence_match.group(1).strip())
            if isinstance(val, list):
                return val
        except json.JSONDecodeError:
            pass

    # Strategy 3: find raw JSON array
    bracket_match = re.search(r"\[.*\]", text, re.DOTALL)
    if bracket_match:
        try:
            val = json.loads(bracket_match.group(0))
            if isinstance(val, list):
                return val
        except json.JSONDecodeError:
            pass

    return None


def extract_result_content(output_lines: list[dict]) -> str:
    """Extract the final result content from Copilot CLI JSONL output."""
    for line in reversed(output_lines):
        if line.get("type") == "result":
            return line.get("result", line.get("content", ""))
        if line.get("type") == "assistant":
            content = line.get("message", {}).get("content", "")
            if content:
                return content
    # Fallback: concatenate all raw/text content
    parts = []
    for line in output_lines:
        if line.get("type") == "raw":
            parts.append(line.get("content", ""))
        elif line.get("type") == "assistant":
            msg = line.get("message", {}).get("content", "")
            if msg:
                parts.append(msg)
    return "\n".join(parts)


class PlannerAgent:
    """Uses Copilot CLI to analyze repos, generate stories, and run reviews."""

    def __init__(
        self,
        runner: BaseRunner | RunnerPool,
        board: Board,
        chat_store: ChatStore,
        workdir: str | None = None,
        on_output=None,
    ) -> None:
        if isinstance(runner, RunnerPool):
            self._runner_pool: RunnerPool | None = runner
            self._runner: BaseRunner = runner.default_runner
        else:
            self._runner_pool = None
            self._runner = runner
        self.board = board
        self.chat_store = chat_store
        self.workdir = workdir
        self.on_output = on_output

    @property
    def runner(self) -> BaseRunner:
        """Backward-compatible: return default runner."""
        return self._runner

    @runner.setter
    def runner(self, value: BaseRunner) -> None:
        self._runner = value

    def _get_runner(self, phase: PipelinePhase) -> BaseRunner:
        """Get the runner for a specific phase, falling back to default."""
        if self._runner_pool is not None:
            return self._runner_pool.get_runner_for_phase(phase)
        return self._runner

    async def generate_clarifications(self, pipeline_id: int) -> dict:
        """Determine whether more clarification is needed before analysis."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None

        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            "Checking whether clarification is needed...",
            PipelinePhase.CLARIFICATION,
        )

        answers = self._format_clarification_answers(pipeline.clarification_answers_json)
        prompt = CLARIFICATION_PROMPT.format(
            requirement=pipeline.requirement,
            repo_context=pipeline.repo_context or "No repo context available.",
            clarification_answers=answers,
        )

        result = await self._get_runner(PipelinePhase.CLARIFICATION).run(
            prompt=prompt,
            workdir=self.workdir,
            on_output=self.on_output,
        )
        if not result.success:
            error = result.error or "Clarification analysis failed"
            await self.chat_store.add_message(
                pipeline_id, MessageRole.SYSTEM,
                f"Error: {error}", PipelinePhase.CLARIFICATION,
            )
            raise RuntimeError(error)

        content = extract_result_content(result.output_lines) or result.raw_output
        payload = extract_json_object(content)
        if payload is None:
            payload = {
                "status": "ready",
                "summary": "Could not parse clarification output; proceeding with available context.",
                "questions": [],
            }

        questions = payload.get("questions", [])
        if not isinstance(questions, list):
            questions = []
        payload["questions"] = questions[:3]
        payload["status"] = (
            "needs_clarification" if payload["questions"] else "ready"
        )

        await self.chat_store.update_pipeline(
            pipeline_id,
            clarification_questions_json=json.dumps(payload["questions"], ensure_ascii=False),
        )

        return payload

    async def generate_analysis_doc(self, pipeline_id: int) -> str:
        """Generate a markdown analysis document from requirement + clarification data."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None

        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            "Generating analysis document...",
            PipelinePhase.ANALYSIS_DOCUMENT,
        )

        prompt = ANALYSIS_DOCUMENT_PROMPT.format(
            requirement=pipeline.requirement,
            repo_context=pipeline.repo_context or "No repo context available.",
            clarification_answers=self._format_clarification_answers(
                pipeline.clarification_answers_json
            ),
        )

        result = await self._get_runner(PipelinePhase.ANALYSIS_DOCUMENT).run(
            prompt=prompt,
            workdir=self.workdir,
            on_output=self.on_output,
        )
        if not result.success:
            error = result.error or "Analysis document generation failed"
            await self.chat_store.add_message(
                pipeline_id, MessageRole.SYSTEM,
                f"Error: {error}", PipelinePhase.ANALYSIS_DOCUMENT,
            )
            raise RuntimeError(error)

        content = extract_result_content(result.output_lines) or result.raw_output
        await self.chat_store.update_pipeline(
            pipeline_id,
            analysis_doc=content,
        )
        await self.chat_store.add_message(
            pipeline_id, MessageRole.ASSISTANT,
            content,
            PipelinePhase.ANALYSIS_DOCUMENT,
        )
        return content

    async def append_clarification_answer(self, pipeline_id: int, text: str) -> None:
        """Persist a user clarification answer bundle."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None

        existing = self._load_json_list(pipeline.clarification_answers_json)
        existing.append({"answer": text})
        await self.chat_store.update_pipeline(
            pipeline_id,
            clarification_answers_json=json.dumps(existing, ensure_ascii=False),
        )

    async def analyze_repo(self, pipeline_id: int) -> str:
        """Run repo analysis via Copilot CLI and store result."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None

        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            "Analyzing repository structure...",
            PipelinePhase.REPO_CONTEXT,
        )

        result = await self._get_runner(PipelinePhase.REPO_CONTEXT).run(
            prompt=REPO_ANALYSIS_PROMPT,
            workdir=self.workdir,
            on_output=self.on_output,
        )

        if result.success:
            content = extract_result_content(result.output_lines) or result.raw_output
            await self.chat_store.update_pipeline(
                pipeline_id, repo_context=content,
            )
            await self.chat_store.add_message(
                pipeline_id, MessageRole.ASSISTANT, content,
                PipelinePhase.REPO_CONTEXT,
            )
            logger.info("Repo analysis complete for pipeline %d", pipeline_id)
            return content
        else:
            error = result.error or "Repo analysis failed"
            await self.chat_store.add_message(
                pipeline_id, MessageRole.SYSTEM,
                f"Error: {error}", PipelinePhase.REPO_CONTEXT,
            )
            raise RuntimeError(error)

    async def generate_stories(self, pipeline_id: int) -> list[dict]:
        """Generate stories from requirement + repo context via Copilot CLI."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None

        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            "Generating implementation stories...",
            PipelinePhase.BA_ANALYSIS,
        )

        prompt = STORY_GENERATION_PROMPT.format(
            requirement=pipeline.requirement,
            repo_context=pipeline.repo_context or "No repo context available.",
            analysis_doc=pipeline.analysis_doc or "No analysis document available.",
        )

        result = await self._get_runner(PipelinePhase.BA_ANALYSIS).run(
            prompt=prompt,
            workdir=self.workdir,
            on_output=self.on_output,
        )

        if not result.success:
            error = result.error or "Story generation failed"
            await self.chat_store.add_message(
                pipeline_id, MessageRole.SYSTEM,
                f"Error: {error}", PipelinePhase.BA_ANALYSIS,
            )
            raise RuntimeError(error)

        content = extract_result_content(result.output_lines) or result.raw_output
        stories = extract_json_from_output(content)

        if stories is None:
            # Could not parse JSON — send raw output for manual handling
            await self.chat_store.add_message(
                pipeline_id, MessageRole.ASSISTANT, content,
                PipelinePhase.BA_ANALYSIS,
            )
            await self.chat_store.update_pipeline(
                pipeline_id, stories_json=content,
            )
            raise RuntimeError("Failed to parse stories JSON from agent output")

        stories_json = json.dumps(stories, ensure_ascii=False)
        await self.chat_store.update_pipeline(
            pipeline_id, stories_json=stories_json,
        )

        # Format stories for display
        summary_parts = []
        for i, story in enumerate(stories, 1):
            title = story.get("title", "Untitled")
            desc = story.get("description", "")
            priority = story.get("priority", "medium")
            summary_parts.append(f"**Story {i}: {title}**\nPriority: {priority}\n{desc}")

        summary = "\n\n".join(summary_parts)
        await self.chat_store.add_message(
            pipeline_id, MessageRole.ASSISTANT, summary,
            PipelinePhase.BA_ANALYSIS,
            metadata=stories_json,
        )

        logger.info("Generated %d stories for pipeline %d", len(stories), pipeline_id)
        return stories

    async def create_issues_from_stories(
        self, pipeline_id: int, stories: list[dict]
    ) -> list[Issue]:
        """Create board issues from parsed stories."""
        created = []
        story_map: dict[str, Issue] = {}
        for story in stories:
            issue = await self.board.create_issue(
                title=story.get("title", "Untitled story"),
                description=self._format_story_description(story),
                priority=story.get("priority", "medium"),
                labels=story.get("labels", []),
                pipeline_id=pipeline_id,
                story_id=story.get("story_id"),
                depends_on=[],
                blocked_reason=None,
            )
            created.append(issue)
            story_id = story.get("story_id")
            if isinstance(story_id, str) and story_id:
                story_map[story_id] = issue

        for story, issue in zip(stories, created, strict=False):
            deps = []
            raw_deps = story.get("depends_on", [])
            if isinstance(raw_deps, list):
                deps = [
                    story_map[dep].key for dep in raw_deps
                    if isinstance(dep, str) and dep in story_map
                ]
            blocked_reason = f"Waiting for {', '.join(deps)}" if deps else None
            await self.board.update_issue(
                issue.key,
                depends_on=deps,  # type: ignore[arg-type]
                blocked_reason=blocked_reason,
            )

        keys = ", ".join(i.key for i in created)
        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            f"Created {len(created)} issues on the board: {keys}",
            PipelinePhase.CODING,
        )
        logger.info("Created %d issues for pipeline %d", len(created), pipeline_id)
        return created

    async def evaluate_stories(self, pipeline_id: int) -> dict:
        """Evaluate story quality via agent and return verdict dict."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None

        prompt = STORY_QUALITY_GATE_PROMPT.format(
            requirement=pipeline.requirement,
            stories=pipeline.stories_json or "[]",
        )

        result = await self._get_runner(PipelinePhase.BA_ANALYSIS).run(prompt=prompt, workdir=self.workdir, on_output=self.on_output)

        if not result.success:
            return {"verdict": "FAIL", "score": 0,
                    "issues": [result.error or "Agent failed"], "summary": "Agent error"}

        content = extract_result_content(result.output_lines) or result.raw_output
        verdict = extract_verdict(content)

        if verdict is None:
            # Could not parse verdict; default to PASS to not block
            logger.warning("Could not parse story quality verdict, defaulting to PASS")
            verdict = {"verdict": "PASS", "score": 70,
                       "issues": [], "summary": "Auto-approved (verdict parse failed)"}

        await self.chat_store.add_message(
            pipeline_id, MessageRole.ASSISTANT,
            f"**Story Quality Gate**: {verdict['verdict']} (score: {verdict.get('score', 'N/A')})\n"
            f"{verdict.get('summary', '')}",
            PipelinePhase.BA_ANALYSIS,
            metadata=json.dumps(verdict, ensure_ascii=False),
        )
        return verdict

    async def run_code_review(self, pipeline_id: int) -> tuple[str, dict]:
        """Run code review via Copilot CLI. Returns (content, verdict)."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None

        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            "Running code review...",
            PipelinePhase.CODE_REVIEW,
        )

        prompt = CODE_REVIEW_PROMPT.format(
            stories=pipeline.stories_json or "No stories available.",
        )

        result = await self._get_runner(PipelinePhase.CODE_REVIEW).run(
            prompt=prompt,
            workdir=self.workdir,
            on_output=self.on_output,
        )

        if result.success:
            content = extract_result_content(result.output_lines) or result.raw_output
            await self.chat_store.update_pipeline(
                pipeline_id, review_report=content,
            )

            verdict = extract_verdict(content)
            if verdict is None:
                verdict = {"verdict": "PASS", "score": 70,
                           "issues": [], "summary": "Auto-approved (verdict parse failed)"}

            await self.chat_store.add_message(
                pipeline_id, MessageRole.ASSISTANT,
                f"**Code Review**: {verdict['verdict']} (score: {verdict.get('score', 'N/A')})\n"
                f"{verdict.get('summary', '')}\n\n{content}",
                PipelinePhase.CODE_REVIEW,
                metadata=json.dumps(verdict, ensure_ascii=False),
            )
            logger.info("Code review complete for pipeline %d: %s", pipeline_id, verdict["verdict"])
            return content, verdict
        else:
            error = result.error or "Code review failed"
            await self.chat_store.add_message(
                pipeline_id, MessageRole.SYSTEM,
                f"Error: {error}", PipelinePhase.CODE_REVIEW,
            )
            raise RuntimeError(error)

    async def run_test_validation(self, pipeline_id: int) -> tuple[str, dict]:
        """Run test validation via Copilot CLI. Returns (content, verdict)."""
        pipeline = await self.chat_store.get_pipeline(pipeline_id)
        assert pipeline is not None

        await self.chat_store.add_message(
            pipeline_id, MessageRole.SYSTEM,
            "Running test validation...",
            PipelinePhase.TEST_VALIDATION,
        )

        prompt = TEST_VALIDATION_PROMPT.format(
            stories=pipeline.stories_json or "No stories available.",
        )

        result = await self._get_runner(PipelinePhase.TEST_VALIDATION).run(
            prompt=prompt,
            workdir=self.workdir,
            on_output=self.on_output,
        )

        if result.success:
            content = extract_result_content(result.output_lines) or result.raw_output
            await self.chat_store.update_pipeline(
                pipeline_id, test_report=content,
            )

            verdict = extract_verdict(content)
            if verdict is None:
                verdict = {"verdict": "PASS", "score": 70,
                           "issues": [], "summary": "Auto-approved (verdict parse failed)"}

            await self.chat_store.add_message(
                pipeline_id, MessageRole.ASSISTANT,
                f"**Test Validation**: {verdict['verdict']} (score: {verdict.get('score', 'N/A')})\n"
                f"{verdict.get('summary', '')}\n\n{content}",
                PipelinePhase.TEST_VALIDATION,
                metadata=json.dumps(verdict, ensure_ascii=False),
            )
            logger.info("Test validation complete for pipeline %d: %s", pipeline_id, verdict["verdict"])
            return content, verdict
        else:
            error = result.error or "Test validation failed"
            await self.chat_store.add_message(
                pipeline_id, MessageRole.SYSTEM,
                f"Error: {error}", PipelinePhase.TEST_VALIDATION,
            )
            raise RuntimeError(error)

    @staticmethod
    def _load_json_list(raw: str | None) -> list[dict]:
        if not raw:
            return []
        try:
            value = json.loads(raw)
            return value if isinstance(value, list) else []
        except json.JSONDecodeError:
            return []

    @staticmethod
    def _format_clarification_answers(raw: str | None) -> str:
        answers = PlannerAgent._load_json_list(raw)
        if not answers:
            return "No clarification answers provided yet."
        lines = []
        for idx, item in enumerate(answers, 1):
            answer = item.get("answer", "") if isinstance(item, dict) else str(item)
            lines.append(f"{idx}. {answer}")
        return "\n".join(lines)

    @staticmethod
    def _format_story_description(story: dict) -> str:
        description = story.get("description", "")
        ac = story.get("acceptance_criteria", [])
        deps = story.get("depends_on", [])
        parts = [description.strip()] if description else []
        if isinstance(ac, list) and ac:
            parts.append("Acceptance Criteria:")
            parts.extend(f"- {item}" for item in ac if isinstance(item, str))
        if isinstance(deps, list) and deps:
            parts.append(f"Depends on story IDs: {', '.join(dep for dep in deps if isinstance(dep, str))}")
        return "\n".join(parts).strip()
