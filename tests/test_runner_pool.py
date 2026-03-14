"""Tests for maestro.runner_pool."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from maestro.models import BackendConfig, BackendType, PipelinePhase
from maestro.runner_pool import PhaseBackendOverride, RunnerPool

pytestmark = pytest.mark.asyncio


class TestPhaseBackendOverride:
    def test_to_backend_config_overrides_backend(self):
        base = BackendConfig(backend=BackendType.CLAUDE, model="sonnet", binary="claude")
        override = PhaseBackendOverride(
            phase=PipelinePhase.CODING,
            backend=BackendType.CODEX,
            model="",
            binary="codex",
        )
        result = override.to_backend_config(base)
        assert result.backend == BackendType.CODEX
        assert result.model == ""
        assert result.binary == "codex"

    def test_to_backend_config_inherits_budget(self):
        base = BackendConfig(backend=BackendType.CLAUDE, budget_usd=5.0)
        override = PhaseBackendOverride(
            phase=PipelinePhase.CODING,
            backend=BackendType.COPILOT,
        )
        result = override.to_backend_config(base)
        assert result.budget_usd == 5.0

    def test_to_backend_config_overrides_budget(self):
        base = BackendConfig(backend=BackendType.CLAUDE, budget_usd=5.0)
        override = PhaseBackendOverride(
            phase=PipelinePhase.CODING,
            backend=BackendType.COPILOT,
            budget_usd=10.0,
        )
        result = override.to_backend_config(base)
        assert result.budget_usd == 10.0

    def test_to_dict(self):
        override = PhaseBackendOverride(
            phase=PipelinePhase.CODING,
            backend=BackendType.CODEX,
            model="gpt-4",
        )
        d = override.to_dict()
        assert d["phase"] == "coding"
        assert d["backend"] == "codex"
        assert d["model"] == "gpt-4"


class TestRunnerPool:
    @patch("maestro.runner_pool.create_runner")
    def test_default_runner_cached(self, mock_create):
        mock_create.return_value = object()
        config = BackendConfig(backend=BackendType.CLAUDE, model="sonnet")
        pool = RunnerPool(config)
        r1 = pool.default_runner
        r2 = pool.default_runner
        assert r1 is r2
        assert mock_create.call_count == 1

    @patch("maestro.runner_pool.create_runner")
    def test_set_and_remove_override(self, mock_create):
        mock_create.return_value = object()
        config = BackendConfig(backend=BackendType.CLAUDE, model="sonnet")
        pool = RunnerPool(config)

        override = PhaseBackendOverride(
            phase=PipelinePhase.CODING,
            backend=BackendType.CODEX,
        )
        pool.set_phase_override(override)

        effective = pool.get_config_for_phase(PipelinePhase.CODING)
        assert effective.backend == BackendType.CODEX

        pool.remove_phase_override(PipelinePhase.CODING)
        effective = pool.get_config_for_phase(PipelinePhase.CODING)
        assert effective.backend == BackendType.CLAUDE

    @patch("maestro.runner_pool.create_runner")
    def test_get_phase_map(self, mock_create):
        mock_create.return_value = object()
        config = BackendConfig(backend=BackendType.CLAUDE, model="sonnet")
        pool = RunnerPool(config)

        override = PhaseBackendOverride(
            phase=PipelinePhase.CODE_REVIEW,
            backend=BackendType.COPILOT,
            model="opus",
        )
        pool.set_phase_override(override)

        phase_map = pool.get_phase_map()
        assert phase_map["code_review"]["overridden"] is True
        assert phase_map["code_review"]["backend"] == "copilot"
        assert phase_map["coding"]["overridden"] is False
        assert phase_map["coding"]["backend"] == "claude"

    @patch("maestro.runner_pool.create_runner")
    def test_update_default_clears_cache(self, mock_create):
        mock_create.return_value = object()
        config = BackendConfig(backend=BackendType.CLAUDE, model="sonnet")
        pool = RunnerPool(config)

        _ = pool.default_runner
        assert mock_create.call_count == 1

        new_config = BackendConfig(backend=BackendType.CODEX, model="gpt-4")
        pool.update_default(new_config)

        _ = pool.default_runner
        assert mock_create.call_count == 2
