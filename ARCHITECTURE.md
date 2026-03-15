# Maestro Platform -- Architecture

This document describes the internal architecture of Maestro: module responsibilities, data flow, component interactions, security model, and database schema.

## System Overview

Maestro is a single-process Python application with an embedded FastAPI web server and a Next.js frontend. All state lives in a single SQLite database (WAL mode). The system coordinates multiple AI CLI backends (Claude, Copilot, Codex) through an async event loop.

```
                          ┌───────────────────────────────────┐
                          │          Next.js Frontend          │
                          │  (React, Zustand, shadcn/ui)       │
                          └──────────┬────────────┬────────────┘
                                     │ REST       │ WebSocket
                                     ▼            ▼
┌───────────┐    ┌──────────────────────────────────────────────┐
│  CLI      │    │              FastAPI Web Server               │
│ (Click)   │    │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│           │    │  │ Auth MW  │→ │ Rate MW  │→ │ Endpoints │  │
│  maestro  │    │  └──────────┘  └──────────┘  └─────┬─────┘  │
│  start    │    │                                     │        │
│  create   │    └─────────────────────────────────────┼────────┘
│  list     │                                          │
│  show     │     ┌─────────────────────┬──────────────┼───────────────┐
│  retry    │     │                     │              │               │
└───────────┘     ▼                     ▼              ▼               ▼
          ┌──────────────┐  ┌──────────────────┐ ┌──────────┐  ┌──────────┐
          │  Pipeline    │  │  Conversation    │ │  Board   │  │ Security │
          │  Manager     │  │  Manager         │ │  (CRUD)  │  │ Layer    │
          └──────┬───────┘  └────────┬─────────┘ └────┬─────┘  └────┬─────┘
                 │                   │                 │              │
                 ▼                   │                 │              ▼
          ┌──────────────┐           │                 │       ┌──────────┐
          │  Planner     │           │                 │       │  Auth    │
          │  Agent       │◄──────────┘                 │       │  Audit   │
          └──────┬───────┘                             │       │  Secrets │
                 │                                     │       │  Policy  │
                 ▼                                     ▼       └──────────┘
          ┌──────────────┐                      ┌──────────┐
          │  Runner Pool │                      │  SQLite  │
          │  (per-phase) │                      │  (WAL)   │
          └──────┬───────┘                      └──────────┘
                 │
      ┌──────────┼──────────┐
      ▼          ▼          ▼
┌──────────┐ ┌────────┐ ┌───────┐
│  Claude  │ │Copilot │ │ Codex │
│  CLI     │ │  CLI   │ │  CLI  │
└──────────┘ └────────┘ └───────┘
```

---

## Module Responsibilities

### Core Engine

| Module | File | Purpose |
|--------|------|---------|
| **Board** | `maestro/board.py` | SQLite CRUD for issues, activity log, dashboard stats. Handles schema creation and additive migrations. |
| **Models** | `maestro/models.py` | All data classes (`Issue`, `Pipeline`, `Message`, etc.), enums (`PipelinePhase`, `IssueStatus`, `BackendType`), SQL schema (16 tables), and valid state transitions. |
| **Constants** | `maestro/constants.py` | Default paths (`maestro.db`), ports (8420), prefixes (`MST-`). |

### Pipeline System

| Module | File | Purpose |
|--------|------|---------|
| **PipelineManager** | `maestro/pipeline.py` | 14-phase state machine. Manages phase transitions, approval gates (`AWAITING_APPROVAL_*`), auto-approval, and event-driven coding completion. |
| **PlannerAgent** | `maestro/planner.py` | AI-powered phase executors. Each pipeline phase maps to a method that selects the appropriate runner from `RunnerPool` and executes the AI backend. |
| **ChatStore** | `maestro/chat.py` | Persists pipeline messages and conversation messages to SQLite. |

### Orchestrator

| Module | File | Purpose |
|--------|------|---------|
| **Orchestrator** | `maestro/orchestrator.py` | Async poll loop. Picks TODO issues, dispatches agents, manages retries (max 3), and coordinates with `QualityGate` for post-run validation. |
| **IssueWatcher** | `maestro/watcher.py` | Watches the `issues/` directory for new Markdown files and auto-creates board issues. |
| **Workspace** | `maestro/workspace.py` | Per-issue git branch isolation. Creates branches, manages worktrees. |

### Runner System

| Module | File | Purpose |
|--------|------|---------|
| **Runner** | `maestro/runner.py` | Abstract `BaseRunner` + three implementations: `ClaudeRunner`, `CopilotCLIRunner`, `CodexRunner`. Handles subprocess execution, JSONL streaming, stall/turn timeouts, and secret filtering. |
| **RunnerPool** | `maestro/runner_pool.py` | Maintains a cache of runners keyed by `"{backend}:{model}:{binary}"`. Resolves per-phase overrides to the correct runner instance. |

### Context & Quality

| Module | File | Purpose |
|--------|------|---------|
| **ContextEngine** | `maestro/context.py` | Assembles enriched context from AGENTS.md files, repo tree map, constraint files (pyproject.toml, tsconfig.json, etc.), and MCP tools. |
| **QualityGate** | `maestro/quality.py` | Post-run validation: lint (ruff), tests (pytest), typecheck (mypy), structural checks. Failed checks trigger retries. |
| **EntropyManager** | `maestro/entropy.py` | Manual codebase health scanning. Identifies technical debt and improvement opportunities. |

### Conversation

| Module | File | Purpose |
|--------|------|---------|
| **ConversationManager** | `maestro/conversation.py` | Dual-mode chat. Classifies user intent via LLM: `chat`, `quick_task`, `create_issue`, `start_pipeline`. Routes accordingly. |

### Configuration

| Module | File | Purpose |
|--------|------|---------|
| **WorkflowLoader** | `maestro/config.py` | Parses `WORKFLOW.md` (YAML frontmatter + Jinja2 template). Extracts `copilot`, `orchestrator`, and `phase_backends` sections. |

### MCP Integration

| Module | File | Purpose |
|--------|------|---------|
| **MCP Server** | `maestro/mcp_server.py` | Exposes Maestro as an MCP server via FastMCP. 6 tools (`get_repo_map`, `get_agents_md`, `get_constraints`, `build_full_context`, `list_pipelines`, `get_pipeline_status`) + 2 resources (`cortex://repo-map`, `cortex://agents-md`). |
| **MCP Client** | `maestro/mcp_client.py` | Connects to external MCP servers via stdio transport. Auto-discovers tools on connection. Tools are injected into agent context. |

### Enterprise Security

| Module | File | Purpose |
|--------|------|---------|
| **Auth** | `maestro/auth.py` | JWT authentication (PyJWT, HS256, 24h expiry), RBAC (admin/engineer/viewer), API key support, password hashing (bcrypt, with transparent legacy SHA-256 migration). |
| **Audit** | `maestro/audit.py` | Immutable audit trail. Logs all write operations with user, action, resource, IP, timestamp. Supports query filtering and CSV export. |
| **Secrets** | `maestro/secrets.py` | Encrypted credential storage. AES-256 via Fernet (with XOR fallback). Secrets injected into runners as environment variables. Values never exposed in API responses. |
| **Policy** | `maestro/policy.py` | SOUL.md policy engine. Tool approval/denial rules, budget limits with scope-based tracking. Auto-loads SOUL.md from repo root. |
| **Middleware** | `maestro/middleware.py` | `AuthMiddleware` (Bearer/ApiKey/query param verification) + `RateLimitMiddleware` (token-bucket, 120 req/min per IP). |

### Web Layer

| Module | File | Purpose |
|--------|------|---------|
| **Web** | `maestro/web.py` | FastAPI application factory. 75+ REST endpoints across 13 groups. WebSocket for real-time events. CORS, static files, middleware wiring. |
| **Main** | `maestro/main.py` | CLI entry point (Click). Initializes all components, wires dependencies, starts uvicorn programmatically. |
| **ASGI** | `maestro/asgi.py` | Production ASGI entry point. Raw ASGI protocol with lifespan management. Usage: `uvicorn maestro.asgi:app --host 0.0.0.0 --port 8420` |

---

## Data Flow

### Pipeline Execution Flow

```
User creates pipeline (UI or API)
    │
    ▼
PipelineManager.create_pipeline()
    │
    ├── Phase: REPO_CONTEXT ─────────► PlannerAgent.analyze_repo()
    │                                       │
    │                                       ├── RunnerPool.get_runner_for_phase(REPO_CONTEXT)
    │                                       ├── ContextEngine.build_context()
    │                                       └── Runner.run(prompt, workdir)
    │
    ├── Phase: CLARIFICATION ────────► PlannerAgent.generate_clarifications()
    │
    ├── Phase: AWAITING_CLARIFICATION  (if questions generated -- waits for user input)
    │
    ├── Phase: ANALYSIS_DOCUMENT ────► PlannerAgent.generate_analysis_doc()
    │
    ├── Phase: BA_ANALYSIS ──────────► PlannerAgent.generate_stories()
    │
    ├── Phase: AWAITING_APPROVAL_1     (always manual -- user reviews stories)
    │
    ├── Phase: CODING ───────────────► Orchestrator._run_agent()
    │                                       │
    │                                       ├── RunnerPool.get_runner_for_phase(CODING)
    │                                       ├── SecretManager.get_env_for_runner()
    │                                       ├── Runner.run(prompt, env_extra=secrets)
    │                                       └── QualityGate.run_checks()
    │
    ├── Phase: AWAITING_APPROVAL_2     (user reviews code)
    │
    ├── Phase: CODE_REVIEW ──────────► PlannerAgent.run_code_review()
    │
    ├── Phase: AWAITING_APPROVAL_3     (user reviews report)
    │
    ├── Phase: TEST_VALIDATION ──────► PlannerAgent.run_test_validation()
    │
    ├── Phase: AWAITING_APPROVAL_4     (user reviews test report)
    │
    └── Phase: DONE
```

### Chat / Conversation Flow

```
User sends message
    │
    ▼
ConversationManager.handle_message()
    │
    ├── LLM intent classification
    │       │
    │       ├── "chat" ────────► Direct AI response with context
    │       ├── "quick_task" ──► Create issue + dispatch agent
    │       ├── "create_issue" ► Add issue to board
    │       └── "start_pipeline"► Escalate to full pipeline
    │
    └── WebSocket broadcast ──► Frontend real-time update
```

### Runner Execution Flow

```
RunnerPool.get_runner_for_phase(phase)
    │
    ├── Check _overrides[phase]
    │       ├── Found: override.to_backend_config(default)
    │       └── Not found: use _default_config
    │
    ├── _cache_key = "{backend}:{model}:{binary}"
    │       ├── Cache hit: return existing runner
    │       └── Cache miss: create_runner(config)
    │
    └── Runner.run(prompt, ...)
            │
            ├── build_args() ─► [binary, flags, prompt, ...]
            ├── asyncio.create_subprocess_exec()
            ├── Stream JSONL output ──► on_output callback ──► WebSocket
            ├── Monitor stall/turn timeouts
            ├── Filter secret values from output
            └── Return RunResult(success, session_id, output_lines)
```

---

## Security Architecture

### Opt-in Model

```
CORTEX_AUTH_ENABLED=false (default)
    │
    └── AuthMiddleware sets anonymous admin user on every request
        No authentication, no RBAC enforcement
        Suitable for local development

CORTEX_AUTH_ENABLED=true
    │
    ├── AuthMiddleware verifies credentials on every request
    │       ├── Bearer token (JWT)
    │       ├── X-Api-Key header
    │       └── ?token= query param (WebSocket)
    │
    ├── RBAC enforcement on endpoints
    │       ├── Admin:    full access
    │       ├── Engineer: read/write issues and pipelines
    │       └── Viewer:   read-only
    │
    ├── RateLimitMiddleware: 120 req/min per IP
    │
    ├── AuditLogger: all write operations logged
    │
    └── SecretManager: AES-256 encrypted storage
```

### Authentication Flow

```
POST /api/auth/login {username, password}
    │
    ├── AuthManager.authenticate()
    │       ├── Look up user by username
    │       ├── Verify password (bcrypt; legacy SHA-256 auto-migrated)
    │       └── Generate JWT (PyJWT HS256, 24h expiry)
    │
    └── Return {token, user}

Subsequent requests:
    Authorization: Bearer <token>
    │
    └── AuthMiddleware.dispatch()
            ├── _verify_token(token)
            │       ├── jwt.decode(token, secret, algorithms=["HS256"])
            │       ├── Check expiry (< 24h)
            │       └── Fetch user from DB
            │
            └── Set request.state.user
```

### RBAC Permission Matrix

```
Permission          Admin    Engineer    Viewer
───────────────────────────────────────────────
issues.read          yes       yes        yes
issues.write         yes       yes         no
issues.delete        yes        no         no
pipelines.read       yes       yes        yes
pipelines.write      yes       yes         no
pipelines.delete     yes        no         no
config.read          yes       yes        yes
config.write         yes        no         no
mcp.read             yes       yes         no
mcp.write            yes        no         no
audit.read           yes       yes        yes
audit.export         yes        no         no
users.read           yes        no         no
users.write          yes        no         no
secrets.read         yes        no         no
secrets.write        yes        no         no
security.read        yes        no         no
security.write       yes        no         no
```

### Secret Management

```
SecretManager
    │
    ├── set_secret(name, value)
    │       ├── Encrypt with Fernet (AES-256-CBC)
    │       │   Key: CORTEX_ENCRYPTION_KEY → SHA-256 → base64 → Fernet key
    │       │   Fallback: XOR cipher if cryptography not installed
    │       └── Store encrypted_value in SQLite
    │
    ├── get_env_for_runner() → dict[str, str]
    │       ├── Decrypt all secrets
    │       └── Return as {name: value} for subprocess env
    │
    └── Values NEVER exposed in:
            ├── API responses (list_secrets returns names only)
            ├── WebSocket output (runner.py filters secret_values)
            └── Audit log entries
```

---

## MCP Integration Topology

```
                    External MCP Clients
                    (VS Code, Claude Desktop)
                            │
                            ▼
                    ┌──────────────┐
                    │  MCP Server  │   ← maestro/mcp_server.py
                    │  (FastMCP)   │
                    │              │
                    │  Tools:      │
                    │   get_repo_map
                    │   get_agents_md
                    │   get_constraints
                    │   build_full_context
                    │   list_pipelines
                    │   get_pipeline_status
                    │              │
                    │  Resources:  │
                    │   cortex://repo-map
                    │   cortex://agents-md
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │  Context     │
                    │  Engine      │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │  MCP Client  │   ← maestro/mcp_client.py
                    │  Manager     │
                    │              │
                    │  Connects to │
                    │  external    │
                    │  MCP servers │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Server A │ │ Server B │ │ Server C │
        │ (stdio)  │ │ (stdio)  │ │ (stdio)  │
        └──────────┘ └──────────┘ └──────────┘

Tool flow:
  1. MCPClientManager connects to external servers
  2. Auto-discovers tools on each server
  3. ContextEngine includes MCP tools in agent prompts
  4. Agents can reference external tools in their output
  5. Direct tool calls via POST /api/mcp/tools/call
```

---

## Per-Phase Backend Architecture

```
WORKFLOW.md
    │
    ├── copilot:           ← Global default
    │     backend: claude
    │     model: sonnet
    │
    └── phase_backends:    ← Per-phase overrides (optional)
          repo_context:
            backend: claude
            model: sonnet
          coding:
            backend: codex
          code_review:
            backend: claude
            model: opus

                    ┌──────────────┐
                    │  RunnerPool  │
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   _default_config    _overrides{}       _runners{}
   (BackendConfig)    (phase→override)   (cache_key→runner)
        │                  │                  │
        │                  │                  │
        └────────┬─────────┘                  │
                 │                            │
    get_runner_for_phase(phase)               │
         │                                    │
         ├── Override exists?                  │
         │     YES: override.to_backend_config(default)
         │     NO:  use _default_config       │
         │                                    │
         ├── cache_key = "backend:model:binary"
         │                                    │
         └── _runners[cache_key] ─────────────┘
                 │
                 ▼
            BaseRunner
```

### Phase-to-Runner Mapping

```
Phase               │ Method                        │ Runner Selected
────────────────────┼───────────────────────────────┼────────────────
REPO_CONTEXT        │ PlannerAgent.analyze_repo()   │ get_runner_for_phase(REPO_CONTEXT)
CLARIFICATION       │ PlannerAgent.generate_clari…  │ get_runner_for_phase(CLARIFICATION)
ANALYSIS_DOCUMENT   │ PlannerAgent.generate_analy…  │ get_runner_for_phase(ANALYSIS_DOCUMENT)
BA_ANALYSIS         │ PlannerAgent.generate_stori…  │ get_runner_for_phase(BA_ANALYSIS)
CODING              │ Orchestrator._run_agent()     │ get_runner_for_phase(CODING)
CODE_REVIEW         │ PlannerAgent.run_code_review()│ get_runner_for_phase(CODE_REVIEW)
TEST_VALIDATION     │ PlannerAgent.run_test_valid…  │ get_runner_for_phase(TEST_VALIDATION)
```

---

## Database Schema

SQLite with WAL mode. 16 tables.

### Entity Relationship

```
                    ┌───────────┐
                    │   users   │
                    └─────┬─────┘
                          │ 1:N
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐
        │ api_keys │ │sessions│ │audit_log │
        └──────────┘ └────────┘ └──────────┘

        ┌──────────┐      ┌─────────────┐
        │  issues  │ N:1  │  pipelines  │
        │          │──────│             │
        └────┬─────┘      └──────┬──────┘
             │ 1:N               │ 1:N
             ▼                   ▼
        ┌──────────────┐  ┌──────────┐
        │ activity_log │  │ messages │
        └──────────────┘  └──────────┘

        ┌───────────────┐  ┌──────────────┐
        │ conversations │  │ mcp_servers  │
        └───────┬───────┘  └──────────────┘
                │ 1:N
                ▼
        ┌──────────────────┐
        │ messages         │
        │ (conversation_id)│
        └──────────────────┘

Independent tables:
  ┌─────────────────────┐  ┌─────────────────────┐
  │ context_documents   │  │ quality_runs        │
  └─────────────────────┘  └─────────────────────┘
  ┌─────────────────────┐  ┌─────────────────────┐
  │ entropy_tasks       │  │ phase_backend_config│
  └─────────────────────┘  └─────────────────────┘
  ┌─────────────────────┐  ┌─────────────────────┐
  │ secrets             │  │ security_policies   │
  └─────────────────────┘  └─────────────────────┘
  ┌─────────────────────┐
  │ budget_limits       │
  └─────────────────────┘
```

### Table Details

| Table | Columns | Purpose |
|-------|---------|---------|
| `issues` | id, key, title, description, status, priority, labels, session_id, branch_name, pr_url, error_log, attempt_count, pipeline_id, story_id, depends_on, blocked_reason, agent_name, task_type, created_at, updated_at | Kanban board cards |
| `pipelines` | id, issue_key, phase, artifacts_json, stories_json, clarification_questions_json, clarification_answers_json, analysis_doc, backend_config_json, created_at, updated_at | Pipeline state and artifacts |
| `messages` | id, pipeline_id, conversation_id, role, content, phase, task_type, context_snapshot, created_at | Chat messages for both pipelines and conversations |
| `activity_log` | id, issue_key, event, details, timestamp | Issue event history |
| `conversations` | id, title, status, created_at, updated_at | Free-form chat sessions |
| `context_documents` | id, path, content_hash, content, updated_at | Cached AGENTS.md content |
| `quality_runs` | id, issue_key, pipeline_id, lint_ok, test_ok, typecheck_ok, structural_ok, details_json, created_at | Quality gate results |
| `entropy_tasks` | id, issue_key, finding_type, description, severity, file_path, created_at | Codebase health findings |
| `phase_backend_config` | id, phase (UNIQUE), backend, model, binary, budget_usd, extra_args, created_at, updated_at | Per-phase backend overrides |
| `mcp_servers` | id, name, transport, command, args, env, enabled, status, tools, created_at, updated_at | External MCP server connections |
| `users` | id, username (UNIQUE), email (UNIQUE), password_hash, role, team, is_active, created_at, updated_at | User accounts |
| `api_keys` | id, name, key_prefix, key_hash, user_id (FK), permissions, expires_at, created_at, last_used_at | API key authentication |
| `sessions` | id (PK), user_id (FK), created_at, expires_at, ip_address, user_agent | User sessions |
| `audit_log` | id, user_id, username, action, resource_type, resource_id, result, details, ip_address, user_agent, timestamp | Immutable audit trail |
| `secrets` | id, name (UNIQUE), encrypted_value, description, created_by, created_at, updated_at | Encrypted credentials |
| `security_policies` | id, name, description, rules (JSON), scope, scope_id, enabled, created_at, updated_at | Policy rules |
| `budget_limits` | id, scope, scope_id, max_budget_usd, current_spend_usd, reset_period, last_reset, created_at | Budget tracking |

---

## Frontend Architecture

### Stack

- **Framework:** Next.js 16+ with App Router
- **State:** Zustand (single store with slices)
- **UI:** shadcn/ui (Radix primitives + Tailwind CSS)
- **Real-time:** Native WebSocket with auto-reconnect
- **Auth:** JWT token in localStorage, injected via API client

### Component Tree

```
App (layout.tsx)
    │
    ├── AuthGuard ──────────────────────────────────────┐
    │       │                                           │
    │       ├── (authenticated)                    (not authenticated)
    │       │       │                                   │
    │       │       ▼                                   ▼
    │       │   Dashboard (page.tsx)              LoginPage
    │       │       │
    │       │       ├── Header
    │       │       │     ├── LanguageToggle
    │       │       │     ├── ConnectionStatus
    │       │       │     └── User menu
    │       │       │
    │       │       ├── Sidebar
    │       │       │     ├── Navigation links
    │       │       │     └── Backend status
    │       │       │
    │       │       ├── Tabs ──────────────────────────────┐
    │       │       │     ├── Board ──► KanbanBoard        │
    │       │       │     │               └── IssueDetail  │
    │       │       │     │                                │
    │       │       │     ├── Pipeline ──► PipelineView    │
    │       │       │     │                 ├── Progress   │
    │       │       │     │                 ├── Messages   │
    │       │       │     │                 └── Artifacts  │
    │       │       │     │                                │
    │       │       │     ├── Chat ──► ChatPanel            │
    │       │       │     │                                │
    │       │       │     └── Settings ──► SettingsPanel   │
    │       │       │                       ├── General    │
    │       │       │                       ├── PhaseBackends
    │       │       │                       ├── MCP        │
    │       │       │                       ├── Security   │
    │       │       │                       ├── Audit Log  │
    │       │       │                       └── Secrets    │
    │       │       │                                      │
    │       │       ├── DashboardOverview                  │
    │       │       ├── ActivityFeed                       │
    │       │       └── OnboardingTour                     │
    │       │                                              │
    │       └──────────────────────────────────────────────┘
    │
    ├── ToastContainer
    ├── ErrorBoundary
    └── LocaleProvider
```

### State Management (Zustand)

```
AppStore
    │
    ├── Core state
    │     ├── issues: Issue[]
    │     ├── pipelines: Pipeline[]
    │     ├── conversations: Conversation[]
    │     ├── messages: Message[]
    │     └── stats: DashboardStats
    │
    ├── Phase backends
    │     └── phaseBackends: PhaseBackendMap | null
    │
    ├── MCP
    │     └── mcpServers: MCPServer[]
    │
    ├── Auth
    │     ├── currentUser: AuthUser | null
    │     ├── isAuthenticated: boolean
    │     └── authEnabled: boolean
    │
    └── Actions
          ├── fetchAll()        ── hydrate on mount
          ├── fetchIssues()     ── poll or WS-triggered
          ├── createIssue()     ── optimistic update
          ├── login(u, p)       ── JWT flow
          ├── logout()          ── clear token
          ├── checkAuth()       ── verify on mount
          ├── setPhaseBackend() ── runtime override
          ├── addMcpServer()    ── connect external
          └── ...
```

### API Client

The API client (`lib/api.ts`) is organized into 11 namespaces:

```
api
  ├── issuesApi      ── CRUD, activity, stats
  ├── pipelineApi    ── lifecycle, messages, approve/reject, artifacts
  ├── conversationApi ── create, list, messages
  ├── configApi      ── backend, auto-approve
  ├── contextApi     ── agents-md, repo-map, refresh
  ├── qualityApi     ── runs, status
  ├── entropyApi     ── scan, tasks, findings
  ├── phaseBackendsApi ── get, set, remove
  ├── mcpApi         ── servers, tools, call
  ├── authApi        ── login, logout, me, users, api-keys
  ├── auditApi       ── query, export
  ├── secretsApi     ── list, set, delete
  └── policiesApi    ── CRUD
```

All requests include `Authorization: Bearer <token>` when a token exists in localStorage. 401 responses trigger redirect to login.

### WebSocket Events

```
Event                    │ Payload                │ Trigger
─────────────────────────┼────────────────────────┼─────────────────────
issue_created            │ {issue}                │ Board.create_issue()
issue_updated            │ {issue}                │ Board.update_*()
issue_deleted            │ {key}                  │ Board.delete_issue()
pipeline_phase_changed   │ {pipeline_id, phase}   │ PipelineManager transition
chat_message             │ {pipeline_id, message} │ PlannerAgent output
stories_generated        │ {pipeline_id, stories} │ BA_ANALYSIS complete
pipeline_completed       │ {pipeline_id}          │ Phase → DONE
conversation_message     │ {conversation_id, msg} │ ConversationManager
quick_task_completed     │ {conversation_id, key} │ Quick task agent done
runner_output            │ {type, content}        │ CLI subprocess JSONL
```

When auth is enabled, the WebSocket URL includes `?token=<jwt>` for authentication.

---

## Request Lifecycle

### Authenticated API Request

```
Client                  AuthMW              RateLimitMW           Endpoint
  │                       │                      │                   │
  ├── GET /api/issues ───►│                      │                   │
  │   Authorization:      │                      │                   │
  │   Bearer <token>      │                      │                   │
  │                       ├── verify_token() ───►│                   │
  │                       │   set user on state  │                   │
  │                       │                      ├── check bucket ──►│
  │                       │                      │   < 120/min       │
  │                       │                      │                   ├── has_permission
  │                       │                      │                   │   ("issues.read")?
  │                       │                      │                   │
  │                       │                      │                   ├── Board.get_issues()
  │                       │                      │                   │
  │                       │                      │                   ├── AuditLogger.log()
  │                       │                      │                   │   (on write ops)
  │◄──────────────────────┼──────────────────────┼───── 200 JSON ───┤
```

---

## Deployment

### Single Process

Maestro runs as a single Python process:

```
maestro start
    │
    ├── SQLite DB init + migrations
    ├── RunnerPool init (per-phase backends)
    ├── MCPClientManager init (auto-connect enabled servers)
    ├── AuthManager init (create default admin if needed)
    ├── AuditLogger, SecretManager, PolicyEngine init
    ├── Orchestrator start (async poll loop)
    ├── IssueWatcher start (file system watcher)
    └── Uvicorn start (FastAPI + WebSocket on port 8420)
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CORTEX_AUTH_ENABLED` | `false` | Enable JWT auth + RBAC |
| `CORTEX_ADMIN_PASSWORD` | `admin` | Default admin password (first run only) |
| `CORTEX_JWT_SECRET` | random | HS256 signing key for JWT tokens |
| `CORTEX_ENCRYPTION_KEY` | random | AES-256 key for secret encryption |

### Dependencies

**Package management:** [uv](https://docs.astral.sh/uv/) (`uv sync` to install, `uv run` to execute)

**Backend (Python):**
- `aiosqlite` -- async SQLite
- `fastapi` + `uvicorn` -- web server
- `click` -- CLI framework
- `rich` -- terminal formatting
- `jinja2` + `pyyaml` -- WORKFLOW.md parsing
- `bcrypt` -- password hashing
- `PyJWT` -- JWT token encoding/decoding
- `mcp` -- MCP server/client (optional)
- `cryptography` -- AES-256 encryption (optional, XOR fallback)

**Frontend (Node.js):**
- `next` -- React framework
- `zustand` -- state management
- `@radix-ui/*` -- UI primitives
- `tailwindcss` -- styling
- `lucide-react` -- icons
