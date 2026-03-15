"""Runner pool with per-phase backend selection."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field, replace

from cortex.models import BackendConfig, BackendType, PipelinePhase
from cortex.runner import BaseRunner, create_runner

logger = logging.getLogger(__name__)


@dataclass
class PhaseBackendOverride:
    """Per-phase backend override configuration."""

    phase: PipelinePhase
    backend: BackendType
    model: str = ""
    binary: str = ""
    budget_usd: float | None = None
    extra_args: list[str] = field(default_factory=list)

    def to_backend_config(self, base: BackendConfig) -> BackendConfig:
        """Create a BackendConfig by overlaying this override on top of a base config."""
        return replace(
            base,
            backend=self.backend,
            model=self.model or "",
            binary=self.binary or "",
            budget_usd=self.budget_usd if self.budget_usd is not None else base.budget_usd,
            extra_args=self.extra_args if self.extra_args else base.extra_args,
        )

    def to_dict(self) -> dict:
        return {
            "phase": self.phase.value,
            "backend": self.backend.value,
            "model": self.model,
            "binary": self.binary,
            "budget_usd": self.budget_usd,
            "extra_args": self.extra_args,
        }


class RunnerPool:
    """Maintains runners keyed by backend config, with per-phase override mapping."""

    def __init__(self, default_config: BackendConfig) -> None:
        self._default_config = default_config
        self._overrides: dict[PipelinePhase, PhaseBackendOverride] = {}
        self._runners: dict[str, BaseRunner] = {}

    @staticmethod
    def _cache_key(config: BackendConfig) -> str:
        return f"{config.backend.value}:{config.model}:{config.binary}"

    def _get_or_create_runner(self, config: BackendConfig) -> BaseRunner:
        key = self._cache_key(config)
        if key not in self._runners:
            self._runners[key] = create_runner(config)
            logger.debug("Created runner for %s", key)
        return self._runners[key]

    @property
    def default_runner(self) -> BaseRunner:
        """Return the default runner."""
        return self._get_or_create_runner(self._default_config)

    def get_config_for_phase(self, phase: PipelinePhase) -> BackendConfig:
        """Return the effective BackendConfig for a phase."""
        override = self._overrides.get(phase)
        if override is not None:
            return override.to_backend_config(self._default_config)
        return self._default_config

    def get_runner_for_phase(self, phase: PipelinePhase) -> BaseRunner:
        """Return the runner for a specific pipeline phase."""
        config = self.get_config_for_phase(phase)
        return self._get_or_create_runner(config)

    def set_phase_override(self, override: PhaseBackendOverride) -> None:
        """Set a per-phase backend override."""
        self._overrides[override.phase] = override
        logger.info(
            "Phase override set: %s -> %s (model=%s)",
            override.phase.value,
            override.backend.value,
            override.model or "default",
        )

    def remove_phase_override(self, phase: PipelinePhase) -> None:
        """Remove a per-phase backend override."""
        removed = self._overrides.pop(phase, None)
        if removed:
            logger.info("Phase override removed: %s", phase.value)

    def update_default(self, config: BackendConfig) -> None:
        """Update the default backend config and clear the runner cache."""
        self._default_config = config
        self._runners.clear()
        logger.info("Default backend updated to %s (model=%s)", config.backend.value, config.model)

    def get_phase_map(self) -> dict[str, dict]:
        """Return a dict of phase -> override info for API responses."""
        result: dict[str, dict] = {}
        for phase in PipelinePhase:
            override = self._overrides.get(phase)
            if override:
                result[phase.value] = {
                    "backend": override.backend.value,
                    "model": override.model,
                    "binary": override.binary,
                    "budget_usd": override.budget_usd,
                    "overridden": True,
                }
            else:
                result[phase.value] = {
                    "backend": self._default_config.backend.value,
                    "model": self._default_config.model,
                    "binary": self._default_config.binary,
                    "budget_usd": self._default_config.budget_usd,
                    "overridden": False,
                }
        return result
