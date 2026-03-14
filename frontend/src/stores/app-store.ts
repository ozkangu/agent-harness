import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Issue,
  Pipeline,
  Message,
  Conversation,
  DashboardStats,
  BackendConfig,
  PipelinePhase,
  ActivityEvent,
  Toast,
  ApprovalRequest,
  IssueStatus,
  PhaseBackendMap,
  MCPServer,
  AuthUser,
} from "@/types";
import {
  issuesApi,
  pipelinesApi,
  conversationsApi,
  statsApi,
  configApi,
  phaseBackendsApi,
  mcpApi,
  authApi,
} from "@/lib/api";

interface AppState {
  // UI state
  activePanel: "dashboard" | "board" | "chat" | "pipeline" | "settings";
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  theme: "dark" | "light";
  accentColor: string;
  locale: "en" | "tr";

  // Data
  issues: Issue[];
  pipelines: Pipeline[];
  conversations: Conversation[];
  stats: DashboardStats | null;
  backendConfig: BackendConfig | null;
  autoApprove: boolean;

  // Phase backends
  phaseBackends: PhaseBackendMap | null;

  // MCP
  mcpServers: MCPServer[];

  // Auth
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  authEnabled: boolean;

  // Active selections
  activePipelineId: number | null;
  activeConversationId: number | null;
  activeIssueKey: string | null;
  pipelineMessages: Message[];
  conversationMessages: Message[];

  // Activity feed
  activityFeed: ActivityEvent[];

  // Toast notifications
  toasts: Toast[];

  // Approval mode
  approvalMode: boolean;
  pendingApprovals: ApprovalRequest[];

  // Runner output (live terminal)
  runnerOutput: { id: string; timestamp: string; type: string; content: string }[];

  // WebSocket status
  wsStatus: "connecting" | "connected" | "disconnected";

  // Loading states
  loading: boolean;
  chatLoading: boolean;

  // Actions
  setActivePanel: (panel: AppState["activePanel"]) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleTheme: () => void;
  setAccentColor: (color: string) => void;
  setLocale: (locale: "en" | "tr") => void;

  // Data fetching
  fetchIssues: () => Promise<void>;
  fetchPipelines: () => Promise<void>;
  fetchConversations: () => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchAll: () => Promise<void>;

  // Issue actions
  createIssue: (data: {
    title: string;
    description?: string;
    priority?: string;
    labels?: string[];
  }) => Promise<void>;
  updateIssue: (key: string, data: Partial<Issue>) => Promise<void>;
  deleteIssue: (key: string) => Promise<void>;

  // Pipeline actions
  createPipeline: (requirement: string) => Promise<void>;
  deletePipeline: (id: number) => Promise<void>;
  selectPipeline: (id: number | null) => Promise<void>;
  approvePipeline: (id: number) => Promise<void>;
  rejectPipeline: (id: number) => Promise<void>;
  sendPipelineMessage: (id: number, text: string) => Promise<void>;

  // Conversation actions
  selectConversation: (id: number | null) => Promise<void>;
  createConversation: (title?: string) => Promise<void>;
  deleteConversation: (id: number) => Promise<void>;
  renameConversation: (id: number, title: string) => Promise<void>;
  sendConversationMessage: (id: number, text: string) => Promise<void>;
  quickChat: (text: string) => Promise<void>;

  // Config actions
  setAutoApprove: (value: boolean) => Promise<void>;
  setBackend: (backend: string, model?: string) => Promise<void>;

  // Phase backend actions
  fetchPhaseBackends: () => Promise<void>;
  setPhaseBackend: (phase: string, backend: string, model?: string) => Promise<void>;
  removePhaseBackend: (phase: string) => Promise<void>;

  // MCP actions
  fetchMcpServers: () => Promise<void>;
  addMcpServer: (data: { name: string; transport: string; command: string; args?: string[] }) => Promise<void>;
  removeMcpServer: (id: number) => Promise<void>;
  toggleMcpServer: (id: number, enabled: boolean) => Promise<void>;

  // Auth actions
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  fetchCurrentUser: () => Promise<void>;
  checkAuth: () => Promise<void>;

  // WebSocket
  setWsStatus: (status: "connecting" | "connected" | "disconnected") => void;

  // Activity, Toast, & Runner actions
  addActivity: (event: Omit<ActivityEvent, "id" | "timestamp">) => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  addRunnerOutput: (type: string, content: string) => void;
  clearRunnerOutput: () => void;

  // Approval mode actions
  setApprovalMode: (mode: boolean) => void;
  addApprovalRequest: (request: Omit<ApprovalRequest, "id" | "timestamp" | "status">) => void;
  approveRequest: (id: string) => void;
  rejectRequest: (id: string, reason: string) => void;
  dismissApproval: (id: string) => void;

  // WebSocket handlers
  handleIssueCreated: (issue: Issue) => void;
  handleIssueUpdated: (issue: Issue) => void;
  handleIssueDeleted: (key: string) => void;
  handlePipelinePhaseChanged: (data: {
    pipeline_id: number;
    phase: PipelinePhase;
  }) => void;
  handleChatMessage: (message: Message) => void;
  handleConversationMessage: (message: Message) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  // UI state defaults
  activePanel: "dashboard",
  sidebarOpen: true,
  sidebarCollapsed: false,
  theme: "dark",
  accentColor: "violet",
  locale: "en",

  // Data defaults
  issues: [],
  pipelines: [],
  conversations: [],
  stats: null,
  backendConfig: null,
  autoApprove: true,

  // Phase backends
  phaseBackends: null,

  // MCP
  mcpServers: [],

  // Auth
  currentUser: null,
  isAuthenticated: false,
  authEnabled: false,

  // Active selections
  activePipelineId: null,
  activeConversationId: null,
  activeIssueKey: null,
  pipelineMessages: [],
  conversationMessages: [],

  // Activity feed
  activityFeed: [],

  // Toast notifications
  toasts: [],

  // Approval mode
  approvalMode: false,
  pendingApprovals: [],

  // WebSocket
  wsStatus: "connecting",

  // Runner output
  runnerOutput: [],

  // Loading states
  loading: false,
  chatLoading: false,

  // UI actions
  setActivePanel: (panel) => set({ activePanel: panel }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  setAccentColor: (color) => set({ accentColor: color }),
  setLocale: (locale) => set({ locale }),

  // Data fetching
  fetchIssues: async () => {
    try {
      const issues = await issuesApi.list();
      set({ issues });
    } catch (e) {
      console.error("Failed to fetch issues:", e);
    }
  },

  fetchPipelines: async () => {
    try {
      const pipelines = await pipelinesApi.list();
      set({ pipelines });
    } catch (e) {
      console.error("Failed to fetch pipelines:", e);
    }
  },

  fetchConversations: async () => {
    try {
      const conversations = await conversationsApi.list();
      set({ conversations });
    } catch (e) {
      console.error("Failed to fetch conversations:", e);
    }
  },

  fetchStats: async () => {
    try {
      const stats = await statsApi.dashboard();
      set({ stats });
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  },

  fetchConfig: async () => {
    try {
      const [backendConfig, autoApproveRes] = await Promise.all([
        configApi.getBackend(),
        configApi.getAutoApprove(),
      ]);
      set({ backendConfig, autoApprove: autoApproveRes.auto_approve });
    } catch (e) {
      console.error("Failed to fetch config:", e);
    }
  },

  fetchAll: async () => {
    set({ loading: true });
    await Promise.all([
      get().fetchIssues(),
      get().fetchPipelines(),
      get().fetchConversations(),
      get().fetchStats(),
      get().fetchConfig(),
      get().fetchPhaseBackends(),
      get().fetchMcpServers(),
    ]);
    set({ loading: false });
  },

  // Issue actions
  createIssue: async (data) => {
    await issuesApi.create(data);
    await get().fetchIssues();
    await get().fetchStats();
  },

  updateIssue: async (key, data) => {
    await issuesApi.update(key, data);
    await get().fetchIssues();
    await get().fetchStats();
  },

  deleteIssue: async (key) => {
    await issuesApi.delete(key);
    await get().fetchIssues();
    await get().fetchStats();
  },

  // Pipeline actions
  createPipeline: async (requirement) => {
    await pipelinesApi.create(requirement);
    await get().fetchPipelines();
  },

  deletePipeline: async (id) => {
    try {
      await pipelinesApi.delete(id);
    } catch {}
    set((s) => ({
      pipelines: s.pipelines.filter((p) => p.id !== id),
      activePipelineId: s.activePipelineId === id ? null : s.activePipelineId,
      pipelineMessages: s.activePipelineId === id ? [] : s.pipelineMessages,
    }));
  },

  selectPipeline: async (id) => {
    set({ activePipelineId: id, pipelineMessages: [] });
    if (id) {
      const messages = await pipelinesApi.messages(id);
      set({ pipelineMessages: messages });
    }
  },

  approvePipeline: async (id) => {
    await pipelinesApi.approve(id);
    await get().fetchPipelines();
    if (get().activePipelineId === id) {
      const messages = await pipelinesApi.messages(id);
      set({ pipelineMessages: messages });
    }
  },

  rejectPipeline: async (id) => {
    await pipelinesApi.reject(id);
    await get().fetchPipelines();
  },

  sendPipelineMessage: async (id, text) => {
    set({ chatLoading: true });
    try {
      await pipelinesApi.sendMessage(id, text);
      const messages = await pipelinesApi.messages(id);
      set({ pipelineMessages: messages });
    } finally {
      set({ chatLoading: false });
    }
  },

  // Conversation actions
  selectConversation: async (id) => {
    set({ activeConversationId: id, conversationMessages: [] });
    if (id) {
      const messages = await conversationsApi.messages(id);
      set({ conversationMessages: messages });
    }
  },

  createConversation: async (title) => {
    const conv = await conversationsApi.create(title);
    await get().fetchConversations();
    await get().selectConversation(conv.id);
  },

  deleteConversation: async (id) => {
    try {
      await conversationsApi.delete(id);
    } catch {}
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
      conversationMessages: s.activeConversationId === id ? [] : s.conversationMessages,
    }));
  },

  renameConversation: async (id, title) => {
    try {
      await conversationsApi.update(id, { title });
    } catch {}
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  sendConversationMessage: async (id, text) => {
    set({ chatLoading: true });
    try {
      await conversationsApi.sendMessage(id, text);
      const messages = await conversationsApi.messages(id);
      set({ conversationMessages: messages });
    } finally {
      set({ chatLoading: false });
    }
  },

  quickChat: async (text) => {
    set({ chatLoading: true });
    try {
      await conversationsApi.quickChat(text);
      await get().fetchConversations();
      await get().fetchIssues();
    } finally {
      set({ chatLoading: false });
    }
  },

  // Config actions
  setAutoApprove: async (value) => {
    await configApi.setAutoApprove(value);
    set({ autoApprove: value });
  },

  setBackend: async (backend, model) => {
    const config = await configApi.setBackend(backend, model);
    set({ backendConfig: { ...get().backendConfig!, ...config } });
  },

  // Phase backend actions
  fetchPhaseBackends: async () => {
    try {
      const phaseBackends = await phaseBackendsApi.get() as unknown as PhaseBackendMap;
      set({ phaseBackends });
    } catch (e) {
      console.error("Failed to fetch phase backends:", e);
    }
  },

  setPhaseBackend: async (phase, backend, model) => {
    try {
      await phaseBackendsApi.set(phase, backend, model);
      await get().fetchPhaseBackends();
    } catch (e) {
      console.error("Failed to set phase backend:", e);
    }
  },

  removePhaseBackend: async (phase) => {
    try {
      await phaseBackendsApi.remove(phase);
      await get().fetchPhaseBackends();
    } catch (e) {
      console.error("Failed to remove phase backend:", e);
    }
  },

  // MCP actions
  fetchMcpServers: async () => {
    try {
      const servers = await mcpApi.listServers() as unknown as MCPServer[];
      set({ mcpServers: servers });
    } catch (e) {
      console.error("Failed to fetch MCP servers:", e);
    }
  },

  addMcpServer: async (data) => {
    try {
      await mcpApi.addServer(data);
      await get().fetchMcpServers();
    } catch (e) {
      console.error("Failed to add MCP server:", e);
    }
  },

  removeMcpServer: async (id) => {
    try {
      await mcpApi.removeServer(id);
      set((s) => ({ mcpServers: s.mcpServers.filter((s) => s.id !== id) }));
    } catch (e) {
      console.error("Failed to remove MCP server:", e);
    }
  },

  toggleMcpServer: async (id, enabled) => {
    try {
      await mcpApi.toggleServer(id, enabled);
      await get().fetchMcpServers();
    } catch (e) {
      console.error("Failed to toggle MCP server:", e);
    }
  },

  // Auth actions
  login: async (username, password) => {
    try {
      const result = await authApi.login(username, password);
      if (result.token) {
        localStorage.setItem("cortex_token", result.token);
        set({ currentUser: result.user as unknown as AuthUser, isAuthenticated: true });
        return true;
      }
      return false;
    } catch (e) {
      console.error("Login failed:", e);
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("cortex_token");
    set({ currentUser: null, isAuthenticated: false });
    authApi.logout().catch(() => {});
  },

  fetchCurrentUser: async () => {
    try {
      const user = await authApi.me();
      set({ currentUser: user as unknown as AuthUser, isAuthenticated: true });
    } catch {
      set({ currentUser: null, isAuthenticated: false });
    }
  },

  checkAuth: async () => {
    try {
      const health = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8420"}/api/health`
      ).then((r) => r.json());
      const authEnabled = health.auth_enabled || false;
      set({ authEnabled });
      if (authEnabled) {
        const token = localStorage.getItem("cortex_token");
        if (token) {
          await get().fetchCurrentUser();
        }
      } else {
        set({ isAuthenticated: true, currentUser: { id: 0, username: "anonymous", email: "", role: "admin", team: "", is_active: true, created_at: "", updated_at: "" } as AuthUser });
      }
    } catch {
      set({ authEnabled: false, isAuthenticated: true });
    }
  },

  // WebSocket
  setWsStatus: (status) => set({ wsStatus: status }),

  // Activity & Toast actions
  addActivity: (event) => {
    const activity: ActivityEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      activityFeed: [activity, ...s.activityFeed].slice(0, 50),
    }));
  },

  addToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().removeToast(id), 5000);
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  addRunnerOutput: (type, content) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
      type,
      content,
    };
    set((s) => ({
      runnerOutput: [...s.runnerOutput, entry].slice(-500),
    }));
  },

  clearRunnerOutput: () => {
    set({ runnerOutput: [] });
  },

  // Approval mode actions
  setApprovalMode: (mode) => set({ approvalMode: mode }),

  addApprovalRequest: (request) => {
    const approval: ApprovalRequest = {
      ...request,
      id: `apr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      status: "pending",
    };
    set((s) => ({
      pendingApprovals: [approval, ...s.pendingApprovals],
    }));
    get().addToast({
      type: "warning",
      title: "Approval Required",
      description: `${request.issueKey}: ${request.fromStatus} → ${request.toStatus}`,
    });
  },

  approveRequest: (id) => {
    const approval = get().pendingApprovals.find((a) => a.id === id);
    if (!approval) return;
    set((s) => ({
      pendingApprovals: s.pendingApprovals.map((a) =>
        a.id === id ? { ...a, status: "approved" as const } : a
      ),
    }));
    get().addActivity({
      type: "issue_updated",
      title: "Transition Approved",
      description: `${approval.issueKey}: ${approval.fromStatus} → ${approval.toStatus} approved`,
    });
    get().addToast({
      type: "success",
      title: "Approved",
      description: `${approval.issueKey} transition approved`,
    });
    // Auto-dismiss after marking approved
    setTimeout(() => get().dismissApproval(id), 2000);
  },

  rejectRequest: (id, reason) => {
    const approval = get().pendingApprovals.find((a) => a.id === id);
    if (!approval) return;
    set((s) => ({
      pendingApprovals: s.pendingApprovals.map((a) =>
        a.id === id ? { ...a, status: "rejected" as const, rejectionReason: reason } : a
      ),
    }));
    // Revert the issue back to its previous status
    get().updateIssue(approval.issueKey, { status: approval.fromStatus } as Partial<Issue>);
    get().addActivity({
      type: "issue_updated",
      title: "Transition Rejected",
      description: `${approval.issueKey}: reverted to ${approval.fromStatus}. Reason: ${reason}`,
    });
    get().addToast({
      type: "error",
      title: "Rejected",
      description: `${approval.issueKey} sent back to ${approval.fromStatus}`,
    });
    // Auto-dismiss after marking rejected
    setTimeout(() => get().dismissApproval(id), 3000);
  },

  dismissApproval: (id) => {
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((a) => a.id !== id),
    }));
  },

  // WebSocket handlers
  handleIssueCreated: (issue) => {
    set((s) => ({ issues: [issue, ...s.issues] }));
    get().addActivity({
      type: "issue_created",
      title: "Issue Created",
      description: `${issue.key}: ${issue.title}`,
    });
    get().addToast({
      type: "info",
      title: "New Issue",
      description: `${issue.key}: ${issue.title}`,
    });
  },

  handleIssueUpdated: (issue) => {
    const oldIssue = get().issues.find((i) => i.key === issue.key);
    const statusChanged = oldIssue && oldIssue.status !== issue.status;

    set((s) => ({
      issues: s.issues.map((i) => (i.key === issue.key ? issue : i)),
    }));

    // Create approval request if approval mode is on and status changed by an agent
    if (statusChanged && get().approvalMode && issue.agent_name) {
      const details: string[] = [];
      if (issue.branch_name) details.push(`Branch: ${issue.branch_name}`);
      if (issue.pr_url) details.push(`PR: ${issue.pr_url}`);
      if (issue.attempt_count > 0) details.push(`Attempt #${issue.attempt_count}`);
      if (issue.labels.length > 0) details.push(`Labels: ${issue.labels.join(", ")}`);

      get().addApprovalRequest({
        issueKey: issue.key,
        fromStatus: oldIssue!.status as IssueStatus,
        toStatus: issue.status as IssueStatus,
        agentName: issue.agent_name || "Agent",
        summary: `${issue.agent_name || "Agent"} moved ${issue.key} from ${oldIssue!.status} to ${issue.status}`,
        details,
      });
    }

    get().addActivity({
      type: "issue_updated",
      title: "Issue Updated",
      description: `${issue.key} -> ${issue.status}`,
    });
  },

  handleIssueDeleted: (key) => {
    set((s) => ({
      issues: s.issues.filter((i) => i.key !== key),
    }));
    get().addActivity({
      type: "issue_deleted",
      title: "Issue Deleted",
      description: key,
    });
  },

  handlePipelinePhaseChanged: (data) => {
    const pipeline = get().pipelines.find((p) => p.id === data.pipeline_id);
    set((s) => ({
      pipelines: s.pipelines.map((p) =>
        p.id === data.pipeline_id ? { ...p, phase: data.phase } : p
      ),
    }));
    get().addActivity({
      type: "pipeline_phase_changed",
      title: "Pipeline Phase Changed",
      description: `${pipeline?.name || `Pipeline #${data.pipeline_id}`} -> ${data.phase}`,
    });
    if (data.phase.startsWith("awaiting")) {
      get().addToast({
        type: "warning",
        title: "Action Required",
        description: `${pipeline?.name || "Pipeline"} needs your approval`,
      });
    }
    if (data.phase === "done") {
      get().addToast({
        type: "success",
        title: "Pipeline Complete",
        description: `${pipeline?.name || "Pipeline"} finished successfully`,
      });
    }
    if (data.phase === "failed") {
      get().addToast({
        type: "error",
        title: "Pipeline Failed",
        description: `${pipeline?.name || "Pipeline"} encountered an error`,
      });
    }
  },

  handleChatMessage: (message) => {
    if (
      message.pipeline_id &&
      message.pipeline_id === get().activePipelineId
    ) {
      set((s) => ({
        pipelineMessages: [...s.pipelineMessages, message],
      }));
    }
    get().addActivity({
      type: "chat_message",
      title: "Pipeline Message",
      description: message.content.slice(0, 100),
    });
  },

  handleConversationMessage: (message) => {
    if (
      message.conversation_id &&
      message.conversation_id === get().activeConversationId
    ) {
      set((s) => ({
        conversationMessages: [...s.conversationMessages, message],
      }));
    }
    get().addActivity({
      type: "conversation_message",
      title: "Chat Message",
      description: message.content.slice(0, 100),
    });
  },
}),
    {
      name: "cortex-preferences",
      partialize: (state) => ({
        theme: state.theme,
        accentColor: state.accentColor,
        sidebarOpen: state.sidebarOpen,
        sidebarCollapsed: state.sidebarCollapsed,
        activePanel: state.activePanel,
        autoApprove: state.autoApprove,
        approvalMode: state.approvalMode,
        authEnabled: state.authEnabled,
        locale: state.locale,
      }),
    }
  )
);
