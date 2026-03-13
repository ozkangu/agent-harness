# Maestro

Autonomous coding agent orchestrator with built-in Kanban board, chat-first interface, and continuous quality gates.

Maestro manages the full lifecycle of software tasks: from free-form chat and intent classification through pipeline-driven multi-phase workflows, all backed by pluggable CLI backends (Claude, Copilot, Codex).

## Architecture

```
maestro/
  board.py           # Kanban board: SQLite CRUD, issue lifecycle
  chat.py            # Pipeline + conversation message persistence
  config.py          # WORKFLOW.md parser (YAML frontmatter + Jinja2)
  constants.py       # Default paths, ports, prefixes
  context.py         # AGENTS.md loader, repo map, constraint assembly
  conversation.py    # Chat-first intent classification & routing
  entropy.py         # Manual codebase health scanning
  main.py            # CLI entry point (Click), component wiring
  models.py          # Data models, enums, SQL schema
  orchestrator.py    # Async poll loop, agent dispatch, retry logic
  pipeline.py        # 14-phase state machine, approval gates
  planner.py         # AI-powered repo analysis, story generation
  quality.py         # Continuous lint/test/typecheck quality gate
  runner.py          # Multi-backend CLI runner (Claude/Copilot/Codex)
  watcher.py         # File watcher for issues/ directory
  web.py             # FastAPI REST API + WebSocket
  workspace.py       # Per-issue git workspace isolation

static/
  board.html         # Main UI: chat panel + board + tabs
  board.js           # Kanban, artifacts, terminal, quality, context
  board.css          # Dark/light theme, layout, components
  chat.js            # Dual-mode chat (Chat/Pipeline), conversations
  chat.css           # Chat panel, mode toggle, quality/context styles

tests/               # pytest suite (178 tests)
```

## Key Concepts

### Dual-Mode Chat

The chat panel operates in two modes:

- **Chat mode** -- Free-form conversation with automatic intent classification. Messages are routed based on LLM analysis:
  - `chat` -- Direct conversation with context-enriched responses
  - `quick_task` -- Creates an issue and dispatches an agent
  - `create_issue` -- Adds an issue to the board
  - `start_pipeline` -- Escalates to full pipeline workflow

- **Pipeline mode** -- Full 14-phase orchestrated workflow with approval gates

### Pipeline Phases

```
REPO_CONTEXT -> CLARIFICATION -> AWAITING_CLARIFICATION (if needed)
  -> ANALYSIS_DOCUMENT -> BA_ANALYSIS -> AWAITING_APPROVAL_1 (always manual)
  -> CODING -> AWAITING_APPROVAL_2 -> CODE_REVIEW -> AWAITING_APPROVAL_3
  -> TEST_VALIDATION -> AWAITING_APPROVAL_4 -> DONE
```

With `auto_approve=true`:
- Story approval (AWAITING_APPROVAL_1) is always manual
- Code review and test validation gates auto-advance
- If all quality checks pass during CODING, pipeline can skip directly to DONE

### Context Engineering

The `ContextEngine` assembles enriched context for agent prompts:

1. **AGENTS.md files** -- Project conventions and constraints from any directory
2. **Repo map** -- Tree structure of the codebase
3. **Constraint files** -- Linter configs, pyproject.toml, tsconfig.json, etc.
4. **Failure feedback** -- Previous error analysis for retries

Context is injected into the WORKFLOW.md template via `{{ context }}`.

### Quality Gate

After each agent run, `QualityGate` automatically checks:

- **Lint** (ruff) -- Code style and errors
- **Tests** (pytest) -- Test suite passes
- **Typecheck** (mypy) -- Type correctness (if available)
- **Structural** -- No debug breakpoints left

Failed quality checks trigger retries. Results are stored in `quality_runs` table and visible in the Quality tab.

### Entropy Management

Manual codebase health scanning via `EntropyManager`:

- Context freshness (AGENTS.md existence)
- Dead code indicators (TODO/FIXME/HACK comments)
- Style consistency (linter statistics)
- Documentation staleness (old README)
- Dependency health (missing manifests)

Triggered via `POST /api/entropy/scan` -- no automatic scheduling.

## Quick Start

```bash
# Install
pip install -e ".[dev]"

# Create workflow config
cp WORKFLOW.example.md WORKFLOW.md
# Edit WORKFLOW.md with your backend settings

# Start
maestro start

# Open http://localhost:8420
```

### CLI Commands

```bash
maestro start              # Start orchestrator + web UI
maestro start --no-web     # Headless mode
maestro start --port 9000  # Custom port

maestro create "Fix login bug" -d "Users can't log in after timeout" -p high
maestro list               # List all issues
maestro list -s todo       # Filter by status
maestro show MST-1         # Show issue details
maestro retry MST-1        # Retry a failed issue
```

## Configuration

All configuration lives in `WORKFLOW.md`:

```yaml
---
copilot:
  backend: claude           # claude | copilot | codex
  binary: "claude"
  model: "sonnet"
  agent: ""
  max_autopilot_continues: 50
  budget_usd: 5.0

orchestrator:
  repo_url: ""
  default_branch: "main"
  max_concurrent_agents: 2
  max_retries: 3
  auto_approve: true
  web_port: 8420
  db_path: "maestro.db"
  hooks:
    before_run: "npm install"
    after_run: "npm test"
---
```

The body is a Jinja2 template rendered per-issue with `{{ issue.* }}` and `{{ context }}` variables.

## API Endpoints

### Issues
```
GET    /api/issues                          List issues
POST   /api/issues                          Create issue
GET    /api/issues/{key}                    Get issue + activity
PATCH  /api/issues/{key}                    Update issue
DELETE /api/issues/{key}                    Delete issue
GET    /api/issues/{key}/activity           Activity log
GET    /api/stats                           Dashboard stats
```

### Pipelines
```
GET    /api/pipelines                       List pipelines
POST   /api/pipelines                       Start pipeline
GET    /api/pipelines/{id}                  Get pipeline
GET    /api/pipelines/{id}/messages         Pipeline messages
POST   /api/pipelines/{id}/messages         Send message
POST   /api/pipelines/{id}/approve          Approve phase
POST   /api/pipelines/{id}/reject           Reject phase
GET    /api/pipelines/{id}/artifacts        Pipeline artifacts
GET    /api/pipelines/{id}/stories          Stories JSON
```

### Conversations
```
GET    /api/conversations                   List conversations
POST   /api/conversations                   Create conversation
GET    /api/conversations/{id}              Get conversation
GET    /api/conversations/{id}/messages     Conversation messages
POST   /api/conversations/{id}/messages     Send message (intent-routed)
POST   /api/chat                            Quick chat (auto-creates conversation)
```

### Context
```
GET    /api/context/agents-md               List AGENTS.md files
GET    /api/context/repo-map                Repository tree
POST   /api/context/refresh                 Refresh cache
```

### Quality
```
GET    /api/quality/runs                    Quality run history
GET    /api/quality/status                  Overall quality summary
```

### Entropy
```
POST   /api/entropy/scan                    Run codebase scan
GET    /api/entropy/tasks                   Scan results
GET    /api/entropy/findings                Issues with findings
```

### Config
```
GET    /api/config/auto-approve             Get auto-approve state
POST   /api/config/auto-approve             Set auto-approve
GET    /api/config/backend                  Get backend config
POST   /api/config/backend                  Switch backend
```

### WebSocket
```
WS     /ws                                  Real-time events
```

Events: `issue_created`, `issue_updated`, `issue_deleted`, `pipeline_phase_changed`, `chat_message`, `stories_generated`, `pipeline_completed`, `conversation_message`, `quick_task_completed`, `runner_output`

## Database Schema

SQLite with WAL mode. Tables:

| Table | Purpose |
|---|---|
| `pipelines` | Pipeline state, artifacts, phase |
| `issues` | Kanban cards, status, retry tracking |
| `messages` | Chat messages (pipeline + conversation) |
| `activity_log` | Issue event history |
| `conversations` | Free-form chat sessions |
| `context_documents` | Cached AGENTS.md content |
| `quality_runs` | Quality check results |
| `entropy_tasks` | Codebase health findings |
| `config` | Key-value settings |

## Testing

```bash
python -m pytest tests/ -q          # Run all tests
python -m pytest tests/ -x          # Stop on first failure
python -m pytest tests/test_web.py  # Single module
```

## Backend Support

| Backend | Binary | Notes |
|---|---|---|
| Claude | `claude` | Claude Code CLI with `--output-format stream-json` |
| Copilot | `github-copilot-cli` | GitHub Copilot CLI with `--allow-all` |
| Codex | `codex` | OpenAI Codex CLI with `--full-auto` |

Switch backends at runtime via the UI dropdown or `POST /api/config/backend`.
