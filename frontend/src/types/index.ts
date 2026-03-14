export type IssueStatus = "todo" | "working" | "review" | "done" | "failed";
export type IssuePriority = "low" | "medium" | "high" | "critical";
export type MessageRole = "user" | "assistant" | "system";

export type PipelinePhase =
  | "repo_context"
  | "clarification"
  | "awaiting_clarification"
  | "analysis_document"
  | "ba_analysis"
  | "awaiting_approval_1"
  | "coding"
  | "awaiting_approval_2"
  | "code_review"
  | "awaiting_approval_3"
  | "test_validation"
  | "awaiting_approval_4"
  | "done"
  | "failed";

export interface Issue {
  id: number;
  key: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: string;
  labels: string[];
  created_at: string;
  updated_at: string;
  attempt_count: number;
  session_id: string | null;
  branch_name: string | null;
  pr_url: string | null;
  error_log: string | null;
  pipeline_id: number | null;
  story_id: string | null;
  agent_name: string | null;
  task_type: string;
}

export interface Pipeline {
  id: number;
  name: string;
  requirement: string;
  phase: PipelinePhase;
  repo_context: string | null;
  analysis_doc: string | null;
  stories_json: string | null;
  review_report: string | null;
  test_report: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  pipeline_id: number | null;
  conversation_id: number | null;
  role: MessageRole;
  content: string;
  phase: PipelinePhase | null;
  metadata: string | null;
  created_at: string;
}

export interface Conversation {
  id: number;
  title: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface PipelineArtifacts {
  repo_context: string | null;
  analysis_doc: string | null;
  stories_json: string | null;
  stories_parsed: StoryItem[] | null;
  review_report: string | null;
  review_verdict: string | null;
  test_report: string | null;
  test_verdict: string | null;
}

export interface StoryItem {
  id: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  priority: string;
  estimate: string;
}

export interface QualityRun {
  id: number;
  issue_key: string;
  lint_ok: boolean;
  test_ok: boolean;
  type_ok: boolean;
  structural_ok: boolean;
  details: string;
  created_at: string;
}

export interface DashboardStats {
  total: number;
  todo: number;
  working: number;
  review: number;
  done: number;
  failed: number;
}

export interface BackendConfig {
  backend: string;
  model: string;
  backends: string[];
}

export type WSEventType =
  | "issue_created"
  | "issue_updated"
  | "issue_deleted"
  | "pipeline_phase_changed"
  | "chat_message"
  | "stories_generated"
  | "pipeline_completed"
  | "conversation_message"
  | "quick_task_completed"
  | "runner_output";

export interface WSEvent {
  type: WSEventType;
  data: Record<string, unknown>;
}

export const PHASE_LABELS: Record<PipelinePhase, string> = {
  repo_context: "Repo Analysis",
  clarification: "Clarification",
  awaiting_clarification: "Awaiting Input",
  analysis_document: "Analysis",
  ba_analysis: "Story Planning",
  awaiting_approval_1: "Review Stories",
  coding: "Coding",
  awaiting_approval_2: "Review Code",
  code_review: "Code Review",
  awaiting_approval_3: "Review Report",
  test_validation: "Testing",
  awaiting_approval_4: "Review Tests",
  done: "Done",
  failed: "Failed",
};

export const PHASE_ORDER: PipelinePhase[] = [
  "repo_context",
  "clarification",
  "awaiting_clarification",
  "analysis_document",
  "ba_analysis",
  "awaiting_approval_1",
  "coding",
  "awaiting_approval_2",
  "code_review",
  "awaiting_approval_3",
  "test_validation",
  "awaiting_approval_4",
  "done",
];

export const STATUS_COLORS: Record<IssueStatus, string> = {
  todo: "bg-slate-500",
  working: "bg-blue-500",
  review: "bg-amber-500",
  done: "bg-emerald-500",
  failed: "bg-red-500",
};

export interface ActivityEvent {
  id: string;
  type: WSEventType;
  title: string;
  description: string;
  timestamp: string;
  icon?: string;
}

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  description?: string;
}

export interface ApprovalRequest {
  id: string;
  issueKey: string;
  fromStatus: IssueStatus;
  toStatus: IssueStatus;
  agentName: string;
  summary: string;
  details: string[];
  timestamp: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
}
