"""WORKFLOW.md parser: YAML frontmatter + Jinja2 prompt template."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

import yaml
from jinja2 import Template

from maestro.models import (
    BackendConfig,
    BackendType,
    HooksConfig,
    Issue,
    MaestroConfig,
    OrchestratorConfig,
    PipelinePhase,
)
from maestro.runner_pool import PhaseBackendOverride
from dataclasses import replace

logger = logging.getLogger(__name__)

# Regex to match ${VAR} or ${VAR:-default}
ENV_VAR_PATTERN = re.compile(r"\$\{(\w+)(?::-([^}]*))?\}")


def resolve_env_vars(value: str) -> str:
    """Resolve ${VAR} and ${VAR:-default} patterns in a string."""

    def _replace(match: re.Match) -> str:
        var_name = match.group(1)
        default = match.group(2)
        env_val = os.environ.get(var_name)
        if env_val is not None:
            return env_val
        if default is not None:
            return default
        return match.group(0)  # Leave unchanged if no env var and no default

    return ENV_VAR_PATTERN.sub(_replace, value)


def _resolve_env_recursive(obj: object) -> object:
    """Recursively resolve env vars in a nested dict/list structure."""
    if isinstance(obj, str):
        return resolve_env_vars(obj)
    if isinstance(obj, dict):
        return {k: _resolve_env_recursive(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_resolve_env_recursive(item) for item in obj]
    return obj


def parse_workflow(content: str) -> MaestroConfig:
    """Parse a WORKFLOW.md file with YAML frontmatter and Jinja2 body."""
    # Split YAML frontmatter from body
    parts = content.split("---", 2)
    if len(parts) < 3:
        raise ValueError("WORKFLOW.md must have YAML frontmatter between --- delimiters")

    yaml_text = parts[1].strip()
    body = parts[2].strip()

    # Parse YAML with env var resolution
    raw = yaml.safe_load(yaml_text) or {}
    raw = _resolve_env_recursive(raw)

    # Build config objects
    copilot_raw = raw.get("copilot", {}) or {}

    # Parse backend type
    backend_str = copilot_raw.get("backend", "claude")
    try:
        backend_type = BackendType(backend_str)
    except ValueError:
        raise ValueError(
            f"Unknown backend: {backend_str!r}. "
            f"Valid options: {', '.join(b.value for b in BackendType)}"
        )

    # Parse budget_usd
    budget_raw = copilot_raw.get("budget_usd")
    budget_usd = float(budget_raw) if budget_raw is not None else None

    copilot = BackendConfig(
        backend=backend_type,
        binary=copilot_raw.get("binary", ""),
        model=copilot_raw.get("model", ""),
        agent=copilot_raw.get("agent", ""),
        max_autopilot_continues=int(copilot_raw.get("max_autopilot_continues", 50)),
        deny_tools=copilot_raw.get("deny_tools", []),
        allow_tools=copilot_raw.get("allow_tools", []),
        budget_usd=budget_usd,
        sandbox_mode=copilot_raw.get("sandbox_mode", ""),
        extra_args=copilot_raw.get("extra_args", []),
    )

    orch_raw = raw.get("orchestrator", {}) or {}
    hooks_raw = orch_raw.get("hooks", {}) or {}
    hooks = HooksConfig(
        after_create=hooks_raw.get("after_create"),
        before_run=hooks_raw.get("before_run"),
        after_run=hooks_raw.get("after_run"),
        before_remove=hooks_raw.get("before_remove"),
    )

    # Parse auto_approve: treat string "false" as False
    auto_approve_raw = orch_raw.get("auto_approve", True)
    if isinstance(auto_approve_raw, str):
        auto_approve = auto_approve_raw.lower() not in ("false", "0", "no")
    else:
        auto_approve = bool(auto_approve_raw)

    orchestrator = OrchestratorConfig(
        repo_url=orch_raw.get("repo_url", ""),
        default_branch=orch_raw.get("default_branch", "main"),
        max_concurrent_agents=int(orch_raw.get("max_concurrent_agents", 3)),
        max_retries=int(orch_raw.get("max_retries", 3)),
        stall_timeout_seconds=int(orch_raw.get("stall_timeout_seconds", 300)),
        turn_timeout_seconds=int(orch_raw.get("turn_timeout_seconds", 3600)),
        backoff_base_seconds=int(orch_raw.get("backoff_base_seconds", 60)),
        backoff_max_seconds=int(orch_raw.get("backoff_max_seconds", 3600)),
        web_port=int(orch_raw.get("web_port", 8420)),
        db_path=orch_raw.get("db_path", "maestro.db"),
        issues_dir=orch_raw.get("issues_dir", "issues"),
        auto_approve=auto_approve,
        max_inner_iterations=int(orch_raw.get("max_inner_iterations", 3)),
        hooks=hooks,
    )

    # Parse optional phase_backends section
    phase_backends: dict[PipelinePhase, PhaseBackendOverride] = {}
    phase_backends_raw = raw.get("phase_backends", {}) or {}
    for phase_key, phase_cfg in phase_backends_raw.items():
        try:
            phase = PipelinePhase(phase_key)
        except ValueError:
            logger.warning("Unknown phase in phase_backends: %s, skipping", phase_key)
            continue
        if not isinstance(phase_cfg, dict):
            continue
        pb_backend_str = phase_cfg.get("backend", backend_str)
        try:
            pb_backend = BackendType(pb_backend_str)
        except ValueError:
            logger.warning("Unknown backend in phase_backends.%s: %s", phase_key, pb_backend_str)
            continue
        pb_budget = phase_cfg.get("budget_usd")
        phase_backends[phase] = PhaseBackendOverride(
            phase=phase,
            backend=pb_backend,
            model=phase_cfg.get("model", ""),
            binary=phase_cfg.get("binary", ""),
            budget_usd=float(pb_budget) if pb_budget is not None else None,
            extra_args=phase_cfg.get("extra_args", []),
        )

    return MaestroConfig(
        copilot=copilot,
        orchestrator=orchestrator,
        prompt_template=body,
        phase_backends=phase_backends,
    )


def load_workflow(path: str | Path) -> MaestroConfig:
    """Load and parse a WORKFLOW.md file from disk."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Workflow file not found: {p}")
    content = p.read_text(encoding="utf-8")
    return parse_workflow(content)


def render_prompt(config: MaestroConfig, issue: Issue, context: str = "") -> str:
    """Render the prompt template with issue context and optional context injection."""
    template = Template(config.prompt_template)
    return template.render(issue=issue, context=context)


class WorkflowLoader:
    """Hot-reloading workflow config loader."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._config: MaestroConfig | None = None
        self._mtime: float = 0.0

    def load(self) -> MaestroConfig:
        """Load or reload config if the file has changed."""
        if not self.path.exists():
            if self._config is not None:
                return self._config
            raise FileNotFoundError(f"Workflow file not found: {self.path}")

        current_mtime = self.path.stat().st_mtime
        if self._config is None or current_mtime > self._mtime:
            logger.info("Loading workflow config from %s", self.path)
            self._config = load_workflow(self.path)
            self._mtime = current_mtime

        return self._config

    def set_backend(self, backend: BackendType, model: str = "") -> MaestroConfig:
        """Update the backend type in-memory and reset backend-specific binary/model overrides."""
        cfg = self.load()
        new_copilot = replace(
            cfg.copilot,
            backend=backend,
            binary="",
            model=model,
        )
        self._config = replace(cfg, copilot=new_copilot)
        return self._config

    def set_phase_backend(
        self, phase: PipelinePhase, backend: BackendType, model: str = ""
    ) -> MaestroConfig:
        """Set a per-phase backend override in-memory."""
        cfg = self.load()
        override = PhaseBackendOverride(phase=phase, backend=backend, model=model)
        new_phase_backends = dict(cfg.phase_backends)
        new_phase_backends[phase] = override
        self._config = replace(cfg, phase_backends=new_phase_backends)
        return self._config

    def remove_phase_backend(self, phase: PipelinePhase) -> MaestroConfig:
        """Remove a per-phase backend override."""
        cfg = self.load()
        new_phase_backends = dict(cfg.phase_backends)
        new_phase_backends.pop(phase, None)
        self._config = replace(cfg, phase_backends=new_phase_backends)
        return self._config
