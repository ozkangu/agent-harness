import type {
  Issue,
  Pipeline,
  Message,
  Conversation,
  PipelineArtifacts,
  DashboardStats,
  BackendConfig,
  QualityRun,
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8420";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Add auth token if present
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("cortex_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...headers, ...options?.headers },
    ...options,
  });

  // Handle auth errors
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("cortex_token");
    // Don't redirect here, let the auth guard handle it
  }

  if (!res.ok) {
    const error = await res.text().catch(() => res.statusText);
    throw new Error(`API Error ${res.status}: ${error}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Issues
export const issuesApi = {
  list: () => request<Issue[]>("/api/issues"),
  get: (key: string) => request<Issue>(`/api/issues/${key}`),
  create: (data: { title: string; description?: string; priority?: string; labels?: string[] }) =>
    request<Issue>("/api/issues", { method: "POST", body: JSON.stringify(data) }),
  update: (key: string, data: Partial<Issue>) =>
    request<Issue>(`/api/issues/${key}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (key: string) =>
    request<void>(`/api/issues/${key}`, { method: "DELETE" }),
  activity: (key: string) =>
    request<Record<string, unknown>[]>(`/api/issues/${key}/activity`),
};

// Pipelines
export const pipelinesApi = {
  list: () => request<Pipeline[]>("/api/pipelines"),
  get: (id: number) => request<Pipeline>(`/api/pipelines/${id}`),
  create: (requirement: string) =>
    request<Record<string, unknown>>("/api/pipelines", {
      method: "POST",
      body: JSON.stringify({ requirement }),
    }),
  messages: (id: number) => request<Message[]>(`/api/pipelines/${id}/messages`),
  sendMessage: (id: number, text: string) =>
    request<Record<string, unknown>>(`/api/pipelines/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  approve: (id: number) =>
    request<Record<string, unknown>>(`/api/pipelines/${id}/approve`, { method: "POST" }),
  reject: (id: number) =>
    request<Record<string, unknown>>(`/api/pipelines/${id}/reject`, { method: "POST" }),
  artifacts: (id: number) => request<PipelineArtifacts>(`/api/pipelines/${id}/artifacts`),
  stories: (id: number) => request<Record<string, unknown>[]>(`/api/pipelines/${id}/stories`),
  delete: (id: number) => request<void>(`/api/pipelines/${id}`, { method: "DELETE" }),
};

// Conversations
export const conversationsApi = {
  list: () => request<Conversation[]>("/api/conversations"),
  get: (id: number) => request<Conversation>(`/api/conversations/${id}`),
  create: (title?: string) =>
    request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  messages: (id: number) => request<Message[]>(`/api/conversations/${id}/messages`),
  sendMessage: (id: number, text: string) =>
    request<Record<string, unknown>>(`/api/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  update: (id: number, data: { title?: string }) =>
    request<Conversation>(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<void>(`/api/conversations/${id}`, { method: "DELETE" }),
  quickChat: (text: string) =>
    request<Record<string, unknown>>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};

// Stats
export const statsApi = {
  dashboard: () => request<DashboardStats>("/api/stats"),
};

// Quality
export const qualityApi = {
  runs: () => request<QualityRun[]>("/api/quality/runs"),
  status: () => request<Record<string, unknown>>("/api/quality/status"),
};

// Context
export const contextApi = {
  agentsMd: () => request<Record<string, unknown>[]>("/api/context/agents-md"),
  repoMap: () => request<Record<string, unknown>>("/api/context/repo-map"),
  refresh: () => request<Record<string, unknown>>("/api/context/refresh", { method: "POST" }),
};

// Config
export const configApi = {
  getAutoApprove: () => request<{ auto_approve: boolean }>("/api/config/auto-approve"),
  setAutoApprove: (auto_approve: boolean) =>
    request<{ auto_approve: boolean }>("/api/config/auto-approve", {
      method: "POST",
      body: JSON.stringify({ auto_approve }),
    }),
  getBackend: () => request<BackendConfig>("/api/config/backend"),
  setBackend: (backend: string, model?: string) =>
    request<BackendConfig>("/api/config/backend", {
      method: "POST",
      body: JSON.stringify({ backend, model }),
    }),
};

// Health
export const healthApi = {
  check: () => request<{ status: string; version: string; services: Record<string, boolean> }>("/api/health"),
};

// Entropy
export const entropyApi = {
  scan: () => request<Record<string, unknown>>("/api/entropy/scan", { method: "POST" }),
  tasks: () => request<Record<string, unknown>[]>("/api/entropy/tasks"),
  findings: () => request<Record<string, unknown>[]>("/api/entropy/findings"),
};

// Phase Backends
export const phaseBackendsApi = {
  get: () => request<Record<string, unknown>>("/api/config/phase-backends"),
  set: (phase: string, backend: string, model?: string) =>
    request<Record<string, unknown>>("/api/config/phase-backends", {
      method: "POST",
      body: JSON.stringify({ phase, backend, model }),
    }),
  remove: (phase: string) =>
    request<void>(`/api/config/phase-backends/${phase}`, { method: "DELETE" }),
};

// MCP
export const mcpApi = {
  serverStatus: () => request<{ enabled: boolean; status: string }>("/api/mcp/server/status"),
  listServers: () => request<Record<string, unknown>[]>("/api/mcp/servers"),
  addServer: (data: { name: string; transport: string; command: string; args?: string[]; env?: Record<string, string> }) =>
    request<Record<string, unknown>>("/api/mcp/servers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getServer: (id: number) => request<Record<string, unknown>>(`/api/mcp/servers/${id}`),
  removeServer: (id: number) => request<void>(`/api/mcp/servers/${id}`, { method: "DELETE" }),
  toggleServer: (id: number, enabled: boolean) =>
    request<Record<string, unknown>>(`/api/mcp/servers/${id}/toggle`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  reconnectServer: (id: number) =>
    request<Record<string, unknown>>(`/api/mcp/servers/${id}/reconnect`, { method: "POST" }),
  listTools: () => request<Record<string, unknown>[]>("/api/mcp/tools"),
  callTool: (server_id: number, tool: string, args?: Record<string, unknown>) =>
    request<Record<string, unknown>>("/api/mcp/tools/call", {
      method: "POST",
      body: JSON.stringify({ server_id, tool, arguments: args }),
    }),
};

// Auth
export const authApi = {
  login: (username: string, password: string) =>
    request<{ token: string; user: Record<string, unknown> }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<Record<string, unknown>>("/api/auth/me"),
  listUsers: () => request<Record<string, unknown>[]>("/api/auth/users"),
  createUser: (data: { username: string; email: string; password: string; role: string; team?: string }) =>
    request<Record<string, unknown>>("/api/auth/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createApiKey: (user_id: number, name: string, expires_days?: number) =>
    request<Record<string, unknown>>("/api/auth/api-keys", {
      method: "POST",
      body: JSON.stringify({ user_id, name, expires_days }),
    }),
};

// Audit
export const auditApi = {
  query: (filters?: { action?: string; resource_type?: string; user_id?: number; since?: string; until?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined) params.set(k, String(v));
      });
    }
    const qs = params.toString();
    return request<Record<string, unknown>[]>(`/api/audit${qs ? `?${qs}` : ""}`);
  },
  exportCsv: () => `/api/audit/export`,
};

// Secrets
export const secretsApi = {
  list: () => request<Record<string, unknown>[]>("/api/secrets"),
  set: (name: string, value: string, description?: string) =>
    request<Record<string, unknown>>("/api/secrets", {
      method: "POST",
      body: JSON.stringify({ name, value, description }),
    }),
  delete: (name: string) => request<void>(`/api/secrets/${name}`, { method: "DELETE" }),
};

// Policies
export const policiesApi = {
  list: () => request<Record<string, unknown>[]>("/api/policies"),
  create: (data: { name: string; description?: string; rules?: Record<string, unknown> }) =>
    request<Record<string, unknown>>("/api/policies", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/policies/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number) => request<void>(`/api/policies/${id}`, { method: "DELETE" }),
};
