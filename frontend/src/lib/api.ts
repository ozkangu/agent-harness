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
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
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
