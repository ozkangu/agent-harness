---
copilot:
  binary: "claude"
  model: "sonnet"
  agent: ""
  max_autopilot_continues: 50
  deny_tools: []
  allow_tools: []

orchestrator:
  repo_url: ""
  default_branch: "main"
  max_concurrent_agents: 2
  max_retries: 3
  stall_timeout_seconds: 300
  turn_timeout_seconds: 3600
  backoff_base_seconds: 60
  backoff_max_seconds: 3600
  web_port: 8420
  db_path: "cortex.db"
  issues_dir: "issues"
  auto_approve: true
  max_inner_iterations: 3
---

You are an autonomous software engineer.

{% if context %}
{{ context }}
{% endif %}

## Task
Issue: {{ issue.key }} - {{ issue.title }}
{{ issue.description }}

## Instructions
1. Read the codebase to understand existing architecture
2. Implement the requested changes
3. Write/update tests for your changes
4. Run tests and fix any failures
5. Commit with message referencing {{ issue.key }}

{% if issue.attempt_count > 0 %}
## Previous Attempt Failed
This is retry attempt {{ issue.attempt_count + 1 }}.
Previous error: {{ issue.error_log }}
Address the failure and try again.
{% endif %}
