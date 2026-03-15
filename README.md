# Maestro Platform

Autonomous AI-powered SDLC orchestrator with per-phase backend selection, MCP integration, and enterprise security.

Maestro manages the full lifecycle of software tasks: from free-form chat and intent classification through pipeline-driven multi-phase workflows, all backed by pluggable CLI backends (Claude, Copilot, Codex) with per-phase configuration, MCP tool federation, and opt-in enterprise security.

## Architecture

```
maestro/
  board.py           # Kanban board: SQLite CRUD, issue lifecycle
  chat.py            # Pipeline + conversation message persistence
  config.py          # WORKFLOW.md parser (YAML frontmatter + Jinja2)
  constants.py       # Default paths, ports, prefixes
  context.py         # AGENTS.md loader, repo map, constraint assembly, MCP tools
  conversation.py    # Chat-first intent classification & routing
  entropy.py         # Manual codebase health scanning
  main.py            # CLI entry point (Click), component wiring
  asgi.py            # Production ASGI entry point for uvicorn
  models.py          # Data models, enums, SQL schema (16 tables)
  orchestrator.py    # Async poll loop, agent dispatch, retry logic
  pipeline.py        # 14-phase state machine, approval gates
  planner.py         # AI-powered repo analysis, story generation (per-phase runners)
  quality.py         # Continuous lint/test/typecheck quality gate
  runner.py          # Multi-backend CLI runner (Claude/Copilot/Codex), secret filtering
  runner_pool.py     # Per-phase backend selection and runner caching
  watcher.py         # File watcher for issues/ directory
  web.py             # FastAPI REST API + WebSocket (75+ endpoints)
  workspace.py       # Per-issue git workspace isolation
  mcp_server.py      # Cortex as MCP server (FastMCP) -- expose tools to external clients
  mcp_client.py      # MCP client manager -- connect to external MCP servers
  auth.py            # JWT authentication, RBAC (admin/engineer/viewer), API keys
  audit.py           # Immutable audit trail with query and CSV export
  secrets.py         # Encrypted credential storage (AES-256 / XOR fallback)
  policy.py          # SOUL.md policy engine, tool approval, budget limits
  middleware.py      # Auth middleware + rate limiting (120 req/min)

frontend/            # Next.js 16+ React application
  src/
    app/             # App router pages with AuthGuard
    components/
      auth/          # Login page, auth guard wrapper
      board/         # Kanban board with drag-and-drop
      chat/          # AI chat panel with intent routing
      layout/        # Header, sidebar, settings (phase backends, MCP, security)
      pipeline/      # Pipeline view with per-phase backend badges
      ui/            # shadcn/ui components
    hooks/           # WebSocket (auth-aware), translations, virtual list
    lib/             # API client (auth headers, 11 namespaces), utilities
    stores/          # Zustand global state (auth, MCP, phase backends)
    types/           # TypeScript interfaces (20+ types)

tests/               # pytest suite
```

## Key Features

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

Each phase can use a different AI backend via per-phase configuration.

### Per-Phase Backend Selection

`RunnerPool` maintains runners keyed by backend type, with per-phase override mapping:

```yaml
# WORKFLOW.md
phase_backends:
  repo_context:
    backend: claude
    model: sonnet
  coding:
    backend: codex
  code_review:
    backend: claude
    model: opus
```

- Override any phase at runtime via API or Settings UI
- Runner cache avoids recreating identical backends
- Backward compatible: missing `phase_backends` section uses global backend

### MCP Integration (Model Context Protocol)

**Cortex as MCP Server** -- Expose context engine to external tools:
- Tools: `get_repo_map`, `get_agents_md`, `get_constraints`, `build_full_context`, `list_pipelines`, `get_pipeline_status`
- Resources: `cortex://repo-map`, `cortex://agents-md`
- Connect from VS Code Copilot, Claude Desktop, or any MCP-compatible client

**Cortex as MCP Client** -- Connect to external MCP servers:
- Stdio transport support for tool servers
- Automatic tool discovery on connection
- Tools injected into agent context ("Available MCP Tools" section)
- Add/remove/toggle servers via Settings UI

### Enterprise Security

Opt-in security layer. Disabled by default (`CORTEX_AUTH_ENABLED=false`).

**Authentication & RBAC:**
- JWT tokens (PyJWT HS256, 24h expiry)
- Three roles: `admin`, `engineer`, `viewer`
- 18 granular permissions (issues.read, pipelines.write, secrets.write, etc.)
- API key support with optional expiry
- Default admin user auto-created on first startup

**Audit Trail:**
- All operations logged to `audit_log` table
- Filterable by action, resource, user, date range
- CSV export endpoint

**Encrypted Secrets:**
- AES-256 encryption via `cryptography.Fernet` (with XOR fallback)
- Secrets injectable into runners as environment variables
- Values never exposed in API responses or WebSocket output

**Policy Engine:**
- SOUL.md auto-loading as security policy
- Tool approval/denial rules per pipeline
- Budget limits with scope-based tracking

**Rate Limiting:**
- Token-bucket per IP, 120 requests/minute default

### Context Engineering

The `ContextEngine` assembles enriched context for agent prompts:

1. **AGENTS.md files** -- Project conventions and constraints from any directory
2. **Repo map** -- Tree structure of the codebase
3. **Constraint files** -- Linter configs, pyproject.toml, tsconfig.json, etc.
4. **Failure feedback** -- Previous error analysis for retries
5. **MCP tools** -- Available tools from connected MCP servers

Context is injected into the WORKFLOW.md template via `{{ context }}`.

### Quality Gate

After each agent run, `QualityGate` automatically checks:

- **Lint** (ruff) -- Code style and errors
- **Tests** (pytest) -- Test suite passes
- **Typecheck** (mypy) -- Type correctness (if available)
- **Structural** -- No debug breakpoints left

Failed quality checks trigger retries. Results are stored in `quality_runs` table.

## Quick Start

```bash
# Install (requires uv: https://docs.astral.sh/uv/)
uv sync

# Create workflow config
cp WORKFLOW.example.md WORKFLOW.md
# Edit WORKFLOW.md with your backend settings

# Start (CLI mode)
uv run maestro start

# Start (production uvicorn)
uv run uvicorn maestro.asgi:app --host 0.0.0.0 --port 8420

# Open http://localhost:8420
```

### With Enterprise Security

```bash
# Enable authentication
export CORTEX_AUTH_ENABLED=true
export CORTEX_ADMIN_PASSWORD=my-secure-password
export CORTEX_ENCRYPTION_KEY=my-encryption-key

uv run maestro start
# Login at http://localhost:8420 (admin / my-secure-password)
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

# Per-phase backend overrides (optional)
phase_backends:
  repo_context:
    backend: claude
    model: sonnet
  coding:
    backend: codex
  code_review:
    backend: claude
    model: opus
---
```

The body is a Jinja2 template rendered per-issue with `{{ issue.* }}` and `{{ context }}` variables.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CORTEX_AUTH_ENABLED` | `false` | Enable JWT authentication and RBAC |
| `CORTEX_ADMIN_PASSWORD` | `admin` | Default admin password (first run only) |
| `CORTEX_JWT_SECRET` | random | HS256 signing key for JWT tokens |
| `CORTEX_ENCRYPTION_KEY` | random | AES-256 key for secret encryption |

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
GET    /api/pipelines/{id}/active-backend   Current phase's backend
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

### Per-Phase Backend
```
GET    /api/config/phase-backends           Get all phase backend config
POST   /api/config/phase-backends           Set phase override {phase, backend, model}
DELETE /api/config/phase-backends/{phase}   Remove phase override
```

### MCP
```
GET    /api/mcp/server/status               Cortex MCP server status
GET    /api/mcp/servers                     List external MCP servers
POST   /api/mcp/servers                     Add server {name, transport, command, args}
GET    /api/mcp/servers/{id}                Server details + tools
DELETE /api/mcp/servers/{id}                Remove server
POST   /api/mcp/servers/{id}/toggle         Enable/disable {enabled}
POST   /api/mcp/servers/{id}/reconnect      Force reconnect
GET    /api/mcp/tools                       All tools across servers
POST   /api/mcp/tools/call                  Call tool {server_id, tool, arguments}
```

### Authentication
```
POST   /api/auth/login                      Login {username, password} -> {token, user}
POST   /api/auth/logout                     Logout
GET    /api/auth/me                         Current user
GET    /api/auth/users                      List users (admin)
POST   /api/auth/users                      Create user (admin)
POST   /api/auth/api-keys                   Create API key
```

### Audit
```
GET    /api/audit                           Query audit log (filterable)
GET    /api/audit/export                    Export as CSV
```

### Secrets
```
GET    /api/secrets                         List secret names (no values)
POST   /api/secrets                         Set secret {name, value, description}
DELETE /api/secrets/{name}                  Delete secret
```

### Policies
```
GET    /api/policies                        List security policies
POST   /api/policies                        Create policy
PUT    /api/policies/{id}                   Update policy
DELETE /api/policies/{id}                   Delete policy
```

### Budget
```
GET    /api/budget                          Check budget limits
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
GET    /api/health                          Health check + service status
```

### WebSocket
```
WS     /ws                                  Real-time events (auth-aware)
```

Events: `issue_created`, `issue_updated`, `issue_deleted`, `pipeline_phase_changed`, `chat_message`, `stories_generated`, `pipeline_completed`, `conversation_message`, `quick_task_completed`, `runner_output`

## Database Schema

SQLite with WAL mode. 16 tables:

| Table | Purpose |
|---|---|
| `pipelines` | Pipeline state, artifacts, phase, backend config |
| `issues` | Kanban cards, status, retry tracking |
| `messages` | Chat messages (pipeline + conversation) |
| `activity_log` | Issue event history |
| `conversations` | Free-form chat sessions |
| `context_documents` | Cached AGENTS.md content |
| `quality_runs` | Quality check results |
| `entropy_tasks` | Codebase health findings |
| `phase_backend_config` | Per-phase backend overrides |
| `mcp_servers` | External MCP server connections |
| `users` | User accounts with roles |
| `api_keys` | API key authentication |
| `sessions` | User sessions |
| `audit_log` | Immutable audit trail |
| `secrets` | Encrypted credentials |
| `security_policies` | Policy rules and budget limits |
| `budget_limits` | Budget tracking per scope |

## Testing

```bash
uv run pytest tests/ -q          # Run all tests
uv run pytest tests/ -x          # Stop on first failure
uv run pytest tests/test_web.py  # Single module
```

## Backend Support

| Backend | Binary | Notes |
|---|---|---|
| Claude | `claude` | Claude Code CLI with `--output-format stream-json` |
| Copilot | `github-copilot-cli` | GitHub Copilot CLI with `--allow-all` |
| Codex | `codex` | OpenAI Codex CLI with `--full-auto` |

Switch backends globally via UI or `POST /api/config/backend`. Override per-phase via `POST /api/config/phase-backends`.

## Security Model

```
CORTEX_AUTH_ENABLED=false (default)
  -> No authentication required
  -> All users have admin-level access
  -> Suitable for local development

CORTEX_AUTH_ENABLED=true
  -> JWT authentication on all endpoints (except /api/health, /api/auth/login)
  -> RBAC with admin/engineer/viewer roles
  -> Audit logging on all write operations
  -> Rate limiting (120 req/min per IP)
  -> Encrypted secrets storage
  -> Policy engine with tool approval rules
```

### Role Permissions

| Permission | Admin | Engineer | Viewer |
|---|---|---|---|
| Issues (read/write/delete) | all | read/write | read |
| Pipelines (read/write/delete) | all | read/write | read |
| Config (read/write) | all | read | read |
| MCP (read/write) | all | read | - |
| Audit (read/export) | all | read | read |
| Users (read/write) | all | - | - |
| Secrets (read/write) | all | - | - |
| Security (read/write) | all | - | - |
