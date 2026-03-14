"use client";

import { useState, useRef, useCallback } from "react";
import {
  Plus,
  MoreHorizontal,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Eye,
  Trash2,
  RotateCcw,
  Bot,
  GripVertical,
  Search,
  Filter,
  X,
  CheckSquare,
  Square,
  ArrowRight,
  XCircle,
  Download,
  Upload,
  LayoutGrid,
  List,
  Calendar,
  GitBranch,
  ArrowUpDown,
  ShieldCheck,
  ShieldOff,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Zap,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/stores/app-store";
import { IssueDetail } from "@/components/board/issue-detail";
import { MarkdownContent } from "@/components/ui/markdown-renderer";
import type { Issue, IssueStatus, ApprovalRequest } from "@/types";
import { cn } from "@/lib/utils";

const COLUMNS: { status: IssueStatus; label: string; color: string; icon: React.ReactNode }[] = [
  { status: "todo", label: "To Do", color: "border-t-slate-500", icon: <Clock className="h-4 w-4 text-slate-500" /> },
  { status: "working", label: "Working", color: "border-t-blue-500", icon: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" /> },
  { status: "review", label: "Review", color: "border-t-amber-500", icon: <Eye className="h-4 w-4 text-amber-500" /> },
  { status: "done", label: "Done", color: "border-t-emerald-500", icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
  { status: "failed", label: "Failed", color: "border-t-red-500", icon: <AlertCircle className="h-4 w-4 text-red-500" /> },
];

function agentGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const gradients = [
    "from-violet-500 to-indigo-600",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-red-500",
    "from-pink-500 to-rose-500",
    "from-amber-500 to-yellow-500",
    "from-indigo-500 to-purple-500",
    "from-cyan-500 to-blue-500",
  ];
  return gradients[Math.abs(hash) % gradients.length];
}

function AgentAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/[-_\s]/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold shrink-0",
        agentGradient(name),
        size === "sm" ? "h-5 w-5 text-[8px]" : "h-7 w-7 text-[10px]"
      )}
      title={name}
    >
      {initials}
    </div>
  );
}

function ApprovalBanner({ approval, onApprove, onReject }: {
  approval: ApprovalRequest;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const statusLabel: Record<string, string> = {
    todo: "To Do", working: "Working", review: "Review", done: "Done", failed: "Failed"
  };

  if (approval.status === "approved") {
    return (
      <div className="mt-2 -mx-3 -mb-3 px-3 py-2 bg-emerald-500/10 border-t border-emerald-500/20 rounded-b-lg">
        <div className="flex items-center gap-1.5 text-emerald-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="text-[10px] font-medium">Approved</span>
        </div>
      </div>
    );
  }

  if (approval.status === "rejected") {
    return (
      <div className="mt-2 -mx-3 -mb-3 px-3 py-2 bg-red-500/10 border-t border-red-500/20 rounded-b-lg">
        <div className="flex items-center gap-1.5 text-red-500">
          <XCircle className="h-3.5 w-3.5" />
          <span className="text-[10px] font-medium">Rejected - Reverting...</span>
        </div>
        {approval.rejectionReason && (
          <p className="text-[10px] text-red-400 mt-1 line-clamp-2">{approval.rejectionReason}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 -mx-3 -mb-3 px-3 py-2.5 bg-amber-500/10 border-t-2 border-amber-500/40 rounded-b-lg" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Approval Required</span>
      </div>

      <p className="text-[11px] text-foreground/80 mb-1">
        <span className="font-medium">{approval.agentName}</span> wants to move this from{" "}
        <Badge variant="outline" className="text-[9px] px-1 py-0 mx-0.5">{statusLabel[approval.fromStatus] || approval.fromStatus}</Badge>
        {" "}to{" "}
        <Badge variant="outline" className="text-[9px] px-1 py-0 mx-0.5">{statusLabel[approval.toStatus] || approval.toStatus}</Badge>
      </p>

      {approval.details.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {approval.details.map((d, i) => (
            <p key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0" />
              {d}
            </p>
          ))}
        </div>
      )}

      {!showRejectInput ? (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-6 text-[10px] px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={onApprove}
          >
            <ThumbsUp className="h-3 w-3" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2.5 gap-1 border-red-500/30 text-red-500 hover:bg-red-500/10"
            onClick={() => setShowRejectInput(true)}
          >
            <ThumbsDown className="h-3 w-3" />
            Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why are you rejecting? The agent will use this feedback..."
            rows={2}
            className="text-[11px] min-h-[50px] resize-none"
            autoFocus
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-6 text-[10px] px-2.5 gap-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (!rejectReason.trim()) return;
                onReject(rejectReason.trim());
                setRejectReason("");
                setShowRejectInput(false);
              }}
              disabled={!rejectReason.trim()}
            >
              <MessageSquare className="h-3 w-3" />
              Send Feedback & Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2"
              onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function IssueCard({
  issue,
  onDragStart,
  onClick,
  selectMode,
  selected,
  onToggleSelect,
  compact,
  approval,
  onApprove,
  onReject,
}: {
  issue: Issue;
  onDragStart: (e: React.DragEvent, issue: Issue) => void;
  onClick: (key: string) => void;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (key: string) => void;
  compact?: boolean;
  approval?: ApprovalRequest;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
}) {
  const { deleteIssue, updateIssue } = useAppStore();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const priorityColors: Record<string, string> = {
    critical: "bg-red-500/10 text-red-500 border-red-500/20",
    high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    low: "bg-green-500/10 text-green-500 border-green-500/20",
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      deleteIssue(issue.key);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <Card
      className={cn(
        "p-3 hover:shadow-md transition-all group border-border/50",
        selectMode
          ? "cursor-pointer"
          : "cursor-grab active:cursor-grabbing active:shadow-lg active:scale-[1.02]",
        selected && "ring-2 ring-primary border-primary/50 bg-primary/5",
        approval?.status === "pending" && "ring-2 ring-amber-500/50 border-amber-500/30 bg-amber-500/5"
      )}
      draggable={!selectMode}
      onDragStart={(e) => !selectMode && onDragStart(e, issue)}
      onClick={() => selectMode ? onToggleSelect(issue.key) : onClick(issue.key)}
    >
      <div className="flex items-start justify-between gap-2">
        {selectMode ? (
          <div className="shrink-0 mt-0.5">
            {selected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-50 transition-opacity">
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-mono text-muted-foreground">
              {issue.key}
            </span>
            {issue.agent_name && (
              <AgentAvatar name={issue.agent_name} />
            )}
          </div>
          <p className={cn("text-sm font-medium leading-tight truncate", compact && "text-xs")}>
            {issue.title}
          </p>
          {!compact && issue.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {issue.description}
            </p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            />}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {issue.status === "failed" && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateIssue(issue.key, { status: "todo" } as Partial<Issue>); }}>
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Retry
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              {confirmDelete ? "Confirm Delete?" : "Delete"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <Badge
          variant="outline"
          className={cn("text-[10px] px-1.5 py-0", priorityColors[issue.priority] || "")}
        >
          {issue.priority}
        </Badge>
        {issue.labels.map((label) => (
          <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0">
            {label}
          </Badge>
        ))}
        {issue.attempt_count > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            #{issue.attempt_count}
          </Badge>
        )}
      </div>

      {!compact && issue.error_log && (
        <p className="text-[10px] text-red-400 mt-2 line-clamp-1 font-mono">
          {issue.error_log}
        </p>
      )}

      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground/60">
        <span className="flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          {timeAgo(issue.updated_at)}
        </span>
        <div className="flex items-center gap-1">
          {/* Quick status buttons */}
          {!selectMode && (() => {
            const transitions: Record<string, { status: IssueStatus; icon: React.ElementType; color: string; label: string }[]> = {
              todo: [{ status: "working", icon: Loader2, color: "text-blue-500 hover:bg-blue-500/10", label: "Start" }],
              working: [
                { status: "review", icon: Eye, color: "text-amber-500 hover:bg-amber-500/10", label: "Review" },
                { status: "done", icon: CheckCircle2, color: "text-emerald-500 hover:bg-emerald-500/10", label: "Done" },
              ],
              review: [{ status: "done", icon: CheckCircle2, color: "text-emerald-500 hover:bg-emerald-500/10", label: "Done" }],
              failed: [{ status: "todo", icon: RotateCcw, color: "text-slate-400 hover:bg-slate-500/10", label: "Retry" }],
            };
            const available = transitions[issue.status] || [];
            return available.map((t) => (
              <button
                key={t.status}
                onClick={(e) => {
                  e.stopPropagation();
                  updateIssue(issue.key, { status: t.status } as Partial<Issue>);
                }}
                className={cn(
                  "h-5 w-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all",
                  t.color
                )}
                title={t.label}
              >
                <t.icon className="h-3 w-3" />
              </button>
            ));
          })()}
          {issue.branch_name && (
            <span className="flex items-center gap-1 truncate ml-1">
              <GitBranch className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate max-w-[80px]">{issue.branch_name}</span>
            </span>
          )}
        </div>
      </div>

      {/* Approval banner */}
      {approval && onApprove && onReject && (
        <ApprovalBanner approval={approval} onApprove={onApprove} onReject={onReject} />
      )}

      {/* Progress indicator (only when no approval banner) */}
      {!approval && (() => {
        const progressMap: Record<string, number> = { todo: 0, working: 33, review: 66, done: 100, failed: -1 };
        const pct = progressMap[issue.status] ?? 0;
        const colorMap: Record<string, string> = { todo: "bg-slate-500", working: "bg-blue-500", review: "bg-amber-500", done: "bg-emerald-500", failed: "bg-red-500" };
        return (
          <div className="mt-2 -mx-3 -mb-3 h-1 bg-muted/30 rounded-b-lg overflow-hidden">
            <div
              className={cn("h-full rounded-b-lg transition-all duration-500", colorMap[issue.status] || "bg-muted")}
              style={{ width: pct < 0 ? "100%" : `${pct}%` }}
            />
          </div>
        );
      })()}
    </Card>
  );
}

function CreateIssueDialog() {
  const { createIssue } = useAppStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [previewMode, setPreviewMode] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await createIssue({ title: title.trim(), description: description.trim(), priority });
    setTitle("");
    setDescription("");
    setPriority("medium");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" className="gap-1.5" />}
      >
        <Plus className="h-4 w-4" />
        New Issue
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title..."
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="description">Description</Label>
              <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                <button
                  onClick={() => setPreviewMode(false)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded transition-colors",
                    !previewMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
                  )}
                >
                  Write
                </button>
                <button
                  onClick={() => setPreviewMode(true)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded transition-colors",
                    previewMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
                  )}
                >
                  Preview
                </button>
              </div>
            </div>
            {previewMode ? (
              <div className="min-h-[80px] p-3 rounded-md border border-border bg-muted/20">
                {description.trim() ? (
                  <MarkdownContent content={description} />
                ) : (
                  <p className="text-xs text-muted-foreground">Nothing to preview</p>
                )}
              </div>
            ) : (
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue... (supports **markdown**)"
                rows={3}
              />
            )}
          </div>
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSubmit} className="w-full">
            Create Issue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function KanbanBoard() {
  const { issues, stats, updateIssue, deleteIssue, createIssue, addToast, approvalMode, setApprovalMode, pendingApprovals, approveRequest, rejectRequest, addApprovalRequest } = useAppStore();
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"created" | "updated" | "priority" | "title">("created");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "timeline">("kanban");
  const [compactCards, setCompactCards] = useState(false);
  const dragItemRef = useRef<Issue | null>(null);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedKeys(new Set());
  }, []);

  const bulkMove = useCallback(async (targetStatus: IssueStatus) => {
    if (selectedKeys.size === 0) return;
    setBulkActing(true);
    try {
      await Promise.all(
        Array.from(selectedKeys).map((key) =>
          updateIssue(key, { status: targetStatus } as Partial<Issue>)
        )
      );
      addToast({
        type: "success",
        title: "Bulk Move",
        description: `${selectedKeys.size} issues moved to ${targetStatus}`,
      });
      exitSelectMode();
    } catch {
      addToast({
        type: "error",
        title: "Bulk Move Failed",
        description: "Some issues could not be moved",
      });
    } finally {
      setBulkActing(false);
    }
  }, [selectedKeys, updateIssue, addToast, exitSelectMode]);

  const bulkDelete = useCallback(async () => {
    if (selectedKeys.size === 0) return;
    setBulkActing(true);
    try {
      await Promise.all(
        Array.from(selectedKeys).map((key) => deleteIssue(key))
      );
      addToast({
        type: "success",
        title: "Bulk Delete",
        description: `${selectedKeys.size} issues deleted`,
      });
      exitSelectMode();
    } catch {
      addToast({
        type: "error",
        title: "Bulk Delete Failed",
        description: "Some issues could not be deleted",
      });
    } finally {
      setBulkActing(false);
    }
  }, [selectedKeys, deleteIssue, addToast, exitSelectMode]);

  const handleDragStart = useCallback((e: React.DragEvent, issue: Issue) => {
    dragItemRef.current = issue;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", issue.key);
    // Make the dragged element semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      setTimeout(() => {
        (e.currentTarget as HTMLElement).style.opacity = "0.4";
      }, 0);
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDragOverColumn(null);
    dragItemRef.current = null;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: IssueStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStatus: IssueStatus) => {
      e.preventDefault();
      setDragOverColumn(null);

      const issue = dragItemRef.current;
      if (!issue || issue.status === targetStatus) return;

      // In approval mode, manual (human) drag-and-drop bypasses approval
      // since the human IS doing the action themselves
      try {
        await updateIssue(issue.key, { status: targetStatus } as Partial<Issue>);
        addToast({
          type: "success",
          title: "Issue Moved",
          description: `${issue.key} moved to ${targetStatus}`,
        });
      } catch {
        addToast({
          type: "error",
          title: "Move Failed",
          description: `Could not move ${issue.key}`,
        });
      }
    },
    [updateIssue, addToast]
  );

  // Compute available labels and agents for filter dropdowns
  const allLabels = Array.from(new Set(issues.flatMap((i) => i.labels))).sort();
  const allAgents = Array.from(new Set(issues.map((i) => i.agent_name).filter(Boolean) as string[])).sort();

  const filteredIssues = issues.filter((issue) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        issue.key.toLowerCase().includes(q) ||
        issue.title.toLowerCase().includes(q) ||
        issue.description?.toLowerCase().includes(q) ||
        issue.labels.some((l) => l.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }
    if (priorityFilter && issue.priority !== priorityFilter) return false;
    if (labelFilter && !issue.labels.includes(labelFilter)) return false;
    if (agentFilter && issue.agent_name !== agentFilter) return false;
    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case "updated":
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      case "priority": {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
      }
      case "title":
        return a.title.localeCompare(b.title);
      case "created":
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const selectAllVisible = () => {
    setSelectedKeys(new Set(filteredIssues.map((i) => i.key)));
  };

  const groupedIssues = COLUMNS.reduce(
    (acc, col) => {
      acc[col.status] = filteredIssues.filter((i) => i.status === col.status);
      return acc;
    },
    {} as Record<IssueStatus, Issue[]>
  );

  const handleExport = (format: "json" | "csv") => {
    const data = filteredIssues;
    let content: string;
    let mime: string;
    let ext: string;

    if (format === "json") {
      content = JSON.stringify(data, null, 2);
      mime = "application/json";
      ext = "json";
    } else {
      const headers = ["key", "title", "status", "priority", "description", "labels", "created_at"];
      const rows = data.map((i) =>
        headers.map((h) => {
          const val = i[h as keyof Issue];
          if (Array.isArray(val)) return `"${val.join(";")}"`;
          if (typeof val === "string" && (val.includes(",") || val.includes('"')))
            return `"${val.replace(/"/g, '""')}"`;
          return String(val ?? "");
        }).join(",")
      );
      content = [headers.join(","), ...rows].join("\n");
      mime = "text/csv";
      ext = "csv";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maestro-issues-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: "success", title: "Exported", description: `${data.length} issues exported as ${ext.toUpperCase()}` });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const text = await file.text();
    let imported: { title: string; description?: string; priority?: string }[] = [];

    try {
      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        imported = (Array.isArray(parsed) ? parsed : [parsed]).map((item: Record<string, unknown>) => ({
          title: String(item.title || "Untitled"),
          description: item.description ? String(item.description) : undefined,
          priority: item.priority ? String(item.priority) : "medium",
        }));
      } else if (file.name.endsWith(".csv")) {
        const [header, ...rows] = text.split("\n").filter((l) => l.trim());
        const cols = header.split(",").map((c) => c.trim().toLowerCase());
        const titleIdx = cols.indexOf("title");
        const descIdx = cols.indexOf("description");
        const prioIdx = cols.indexOf("priority");

        if (titleIdx === -1) throw new Error("CSV must have a 'title' column");

        imported = rows.map((row) => {
          const vals = row.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          return {
            title: vals[titleIdx] || "Untitled",
            description: descIdx >= 0 ? vals[descIdx] : undefined,
            priority: prioIdx >= 0 ? vals[prioIdx] : "medium",
          };
        });
      }
    } catch (err) {
      addToast({ type: "error", title: "Import Failed", description: "Invalid file format" });
      return;
    }

    if (imported.length === 0) {
      addToast({ type: "warning", title: "No Issues", description: "No valid issues found in file" });
      return;
    }

    for (const item of imported) {
      await createIssue(item);
    }
    addToast({ type: "success", title: "Imported", description: `${imported.length} issues imported` });
  };

  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col h-full relative">
      {/* Board header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Kanban Board</h2>
            <p className="text-xs text-muted-foreground">
              {filteredIssues.length}{filteredIssues.length !== issues.length ? ` / ${issues.length}` : ""} issues
              {searchQuery || priorityFilter || labelFilter || agentFilter ? " (filtered)" : ""}
              {selectMode ? ` · ${selectedKeys.size} selected` : " · Drag to change status"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!selectMode && (
              <>
                <input
                  type="file"
                  ref={importInputRef}
                  className="hidden"
                  accept=".json,.csv"
                  onChange={handleImport}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="sm" className="gap-1.5" />}
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleExport("json")}>
                      Export as JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("csv")}>
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => importInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5 mr-2" />
                      Import File...
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <Button
              variant={selectMode ? "secondary" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            >
              <CheckSquare className="h-4 w-4" />
              {selectMode ? "Cancel" : "Select"}
            </Button>
            {!selectMode && <CreateIssueDialog />}
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search issues..."
              className="w-full pl-8 pr-8 py-1.5 rounded-md border border-border bg-background text-xs outline-none focus:ring-1 focus:ring-primary/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {["critical", "high", "medium", "low"].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(priorityFilter === p ? null : p)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-md border transition-colors capitalize",
                  priorityFilter === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {p}
              </button>
            ))}

            {/* Label filter */}
            {allLabels.length > 0 && (
              <select
                value={labelFilter || ""}
                onChange={(e) => setLabelFilter(e.target.value || null)}
                className="text-[10px] px-2 py-1 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground outline-none cursor-pointer"
              >
                <option value="">All Labels</option>
                {allLabels.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            )}

            {/* Agent filter */}
            {allAgents.length > 0 && (
              <select
                value={agentFilter || ""}
                onChange={(e) => setAgentFilter(e.target.value || null)}
                className="text-[10px] px-2 py-1 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground outline-none cursor-pointer"
              >
                <option value="">All Agents</option>
                {allAgents.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}

            {/* Sort */}
            <div className="flex items-center gap-1 ml-1">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-[10px] px-2 py-1 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground outline-none cursor-pointer"
              >
                <option value="created">Newest</option>
                <option value="updated">Recently Updated</option>
                <option value="priority">Priority</option>
                <option value="title">Title A-Z</option>
              </select>
            </div>

            {(searchQuery || priorityFilter || labelFilter || agentFilter) && (
              <button
                onClick={() => { setSearchQuery(""); setPriorityFilter(null); setLabelFilter(null); setAgentFilter(null); }}
                className="text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Approval mode toggle */}
          <button
            onClick={() => setApprovalMode(!approvalMode)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all border ml-auto",
              approvalMode
                ? "bg-amber-500/15 border-amber-500/30 text-amber-500"
                : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            title={approvalMode ? "Approval mode ON - agent transitions require human approval" : "Auto mode - transitions happen automatically"}
          >
            {approvalMode ? (
              <>
                <UserCheck className="h-3.5 w-3.5" />
                <span>Approve Mode</span>
                {pendingApprovals.filter((a) => a.status === "pending").length > 0 && (
                  <Badge className="h-4 min-w-[16px] px-1 text-[9px] bg-amber-500 text-white">
                    {pendingApprovals.filter((a) => a.status === "pending").length}
                  </Badge>
                )}
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                <span>Auto Mode</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "p-1.5 rounded transition-colors",
                viewMode === "kanban" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              title="Kanban view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={cn(
                "p-1.5 rounded transition-colors",
                viewMode === "timeline" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              title="Timeline view"
            >
              <Calendar className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setCompactCards(!compactCards)}
              className={cn(
                "p-1.5 rounded transition-colors",
                compactCards ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
              title={compactCards ? "Expanded cards" : "Compact cards"}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Board columns */}
      {viewMode === "kanban" ? (
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.status)}
              className={cn(
                "w-72 flex flex-col bg-muted/30 rounded-lg border border-border/50 border-t-2 transition-all",
                col.color,
                dragOverColumn === col.status && "ring-2 ring-primary/50 bg-primary/5 scale-[1.01]"
              )}
            >
              {/* Column header */}
              <div className="flex items-center justify-between p-3 pb-2">
                <div className="flex items-center gap-2">
                  {col.icon}
                  <span className="text-sm font-medium">{col.label}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                    {groupedIssues[col.status]?.length || 0}
                  </Badge>
                </div>
              </div>

              {/* Column cards */}
              <ScrollArea className="flex-1 px-2 pb-2">
                <div className="space-y-2 p-1" onDragEnd={handleDragEnd}>
                  {groupedIssues[col.status]?.map((issue) => {
                    const issueApproval = pendingApprovals.find(
                      (a) => a.issueKey === issue.key && (a.status === "pending" || a.status === "approved" || a.status === "rejected")
                    );
                    return (
                      <IssueCard
                        key={issue.key}
                        issue={issue}
                        onDragStart={handleDragStart}
                        onClick={setSelectedIssueKey}
                        selectMode={selectMode}
                        selected={selectedKeys.has(issue.key)}
                        onToggleSelect={toggleSelect}
                        compact={compactCards}
                        approval={issueApproval}
                        onApprove={issueApproval ? () => approveRequest(issueApproval.id) : undefined}
                        onReject={issueApproval ? (reason: string) => rejectRequest(issueApproval.id, reason) : undefined}
                      />
                    );
                  })}
                  {(groupedIssues[col.status]?.length || 0) === 0 && (
                    <div
                      className={cn(
                        "text-center py-8 text-muted-foreground rounded-lg border-2 border-dashed border-transparent transition-colors",
                        dragOverColumn === col.status && "border-primary/30"
                      )}
                    >
                      <p className="text-xs">
                        {dragOverColumn === col.status ? "Drop here" : "No issues"}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      </div>
      ) : (
      /* Timeline view */
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {/* Timeline header */}
          <div className="flex items-center gap-3 px-3 py-2 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider border-b border-border">
            <span className="w-20">Key</span>
            <span className="flex-1">Title</span>
            <span className="w-16 text-center">Status</span>
            <span className="w-16 text-center">Priority</span>
            <span className="w-28 text-right">Created</span>
            <span className="w-28 text-right">Updated</span>
          </div>
          {filteredIssues.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <List className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No issues match your filters</p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const statusConfig = COLUMNS.find((c) => c.status === issue.status);
              return (
                <button
                  key={issue.key}
                  onClick={() => setSelectedIssueKey(issue.key)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left"
                >
                  <span className="text-[10px] font-mono text-muted-foreground w-20 shrink-0">
                    {issue.key}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{issue.title}</p>
                    {issue.labels.length > 0 && (
                      <div className="flex gap-1 mt-0.5">
                        {issue.labels.slice(0, 3).map((l) => (
                          <Badge key={l} variant="secondary" className="text-[9px] px-1 py-0">
                            {l}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-16 flex justify-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        issue.status === "done" && "border-emerald-500 text-emerald-500",
                        issue.status === "working" && "border-blue-500 text-blue-500",
                        issue.status === "review" && "border-amber-500 text-amber-500",
                        issue.status === "failed" && "border-red-500 text-red-500",
                        issue.status === "todo" && "border-slate-500 text-slate-500"
                      )}
                    >
                      {statusConfig?.label || issue.status}
                    </Badge>
                  </div>
                  <div className="w-16 flex justify-center">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                      {issue.priority}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground w-28 text-right shrink-0">
                    {new Date(issue.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-[10px] text-muted-foreground w-28 text-right shrink-0">
                    {new Date(issue.updated_at).toLocaleDateString()}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
      )}
      {/* Bulk action bar */}
      {selectMode && selectedKeys.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card shadow-xl">
          <span className="text-sm font-medium mr-2">
            {selectedKeys.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1"
            onClick={selectAllVisible}
          >
            Select All ({filteredIssues.length})
          </Button>
          <div className="w-px h-5 bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="text-xs gap-1" disabled={bulkActing} />}
            >
              <ArrowRight className="h-3 w-3" />
              Move to...
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {COLUMNS.map((col) => (
                <DropdownMenuItem
                  key={col.status}
                  onClick={() => bulkMove(col.status)}
                >
                  {col.icon}
                  <span className="ml-2">{col.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="text-xs gap-1" disabled={bulkActing} />}
            >
              <Filter className="h-3 w-3" />
              Priority...
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(["critical", "high", "medium", "low"] as const).map((p) => (
                <DropdownMenuItem
                  key={p}
                  onClick={async () => {
                    setBulkActing(true);
                    try {
                      await Promise.all(
                        Array.from(selectedKeys).map((key) =>
                          updateIssue(key, { priority: p } as Partial<Issue>)
                        )
                      );
                      addToast({ type: "success", title: "Bulk Priority", description: `${selectedKeys.size} issues set to ${p}` });
                    } catch {
                      addToast({ type: "error", title: "Failed", description: "Some issues could not be updated" });
                    } finally {
                      setBulkActing(false);
                    }
                  }}
                >
                  <span className="capitalize">{p}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10"
            onClick={bulkDelete}
            disabled={bulkActing}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
          <div className="w-px h-5 bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1"
            onClick={exitSelectMode}
          >
            <XCircle className="h-3 w-3" />
            Cancel
          </Button>
          {bulkActing && <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />}
        </div>
      )}
      {selectedIssueKey && (
        <IssueDetail
          issueKey={selectedIssueKey}
          onClose={() => setSelectedIssueKey(null)}
        />
      )}
    </div>
  );
}
