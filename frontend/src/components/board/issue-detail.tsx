"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  ExternalLink,
  GitBranch,
  Clock,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Tag,
  Loader2,
  Bot,
  Activity,
  Link2,
  Pencil,
  Check,
  Plus,
  ChevronDown,
  Copy,
  Send,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { issuesApi } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { MarkdownContent } from "@/components/ui/markdown-renderer";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Issue } from "@/types";
import { cn } from "@/lib/utils";

interface ActivityEntry {
  id: number;
  issue_key: string;
  event: string;
  details: string;
  timestamp: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  todo: { label: "To Do", color: "bg-slate-500", icon: Clock },
  working: { label: "Working", color: "bg-blue-500", icon: Loader2 },
  review: { label: "Review", color: "bg-amber-500", icon: Activity },
  done: { label: "Done", color: "bg-emerald-500", icon: CheckCircle2 },
  failed: { label: "Failed", color: "bg-red-500", icon: AlertCircle },
};

interface IssueDetailProps {
  issueKey: string;
  onClose: () => void;
}

export function IssueDetail({ issueKey, onClose }: IssueDetailProps) {
  const { issues, updateIssue, deleteIssue, createIssue, addToast } = useAppStore();
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<{ text: string; timestamp: string }[]>([]);
  const [links, setLinks] = useState<{ title: string; url: string }[]>([]);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const labelInputRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const issue = issues.find((i) => i.key === issueKey);

  useEffect(() => {
    setLoadingActivity(true);
    issuesApi
      .activity(issueKey)
      .then((data) => setActivity(data as unknown as ActivityEntry[]))
      .catch(() => {})
      .finally(() => setLoadingActivity(false));
  }, [issueKey]);

  // Keyboard shortcuts for status transitions
  useEffect(() => {
    if (!issue) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const statusMap: Record<string, string> = { t: "todo", w: "working", r: "review", d: "done" };
      const newStatus = statusMap[e.key.toLowerCase()];
      if (newStatus && newStatus !== issue.status) {
        e.preventDefault();
        updateIssue(issue.key, { status: newStatus } as Partial<Issue>);
        addToast({ type: "success", title: "Status changed", description: `${issue.key} → ${newStatus}` });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [issue, updateIssue, addToast]);

  useEffect(() => {
    if (showLabelInput && labelInputRef.current) {
      labelInputRef.current.focus();
    }
  }, [showLabelInput]);

  if (!issue) {
    return null;
  }

  const statusConfig = STATUS_CONFIG[issue.status] || STATUS_CONFIG.todo;
  const StatusIcon = statusConfig.icon;

  const handleSaveTitle = async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== issue.title) {
      await updateIssue(issue.key, { title: trimmed } as Partial<Issue>);
      addToast({ type: "success", title: "Title updated", description: issue.key });
    }
    setEditingTitle(false);
  };

  const handleSaveDesc = async () => {
    if (editDesc !== issue.description) {
      await updateIssue(issue.key, { description: editDesc } as Partial<Issue>);
      addToast({ type: "success", title: "Description updated", description: issue.key });
    }
    setEditingDesc(false);
  };

  const handlePriorityChange = async (priority: string) => {
    await updateIssue(issue.key, { priority } as Partial<Issue>);
    setShowPriorityMenu(false);
    addToast({ type: "success", title: "Priority updated", description: `${issue.key} set to ${priority}` });
  };

  const handleStatusChange = async (status: string) => {
    await updateIssue(issue.key, { status } as Partial<Issue>);
    setShowStatusMenu(false);
    addToast({ type: "success", title: "Status updated", description: `${issue.key} moved to ${status}` });
  };

  const handleAddLabel = async () => {
    const trimmed = newLabel.trim();
    if (trimmed && !issue.labels.includes(trimmed)) {
      await updateIssue(issue.key, { labels: [...issue.labels, trimmed] } as Partial<Issue>);
      addToast({ type: "success", title: "Label added", description: trimmed });
    }
    setNewLabel("");
    setShowLabelInput(false);
  };

  const handleRemoveLabel = async (label: string) => {
    await updateIssue(issue.key, { labels: issue.labels.filter((l) => l !== label) } as Partial<Issue>);
    addToast({ type: "info", title: "Label removed", description: label });
  };

  const handleRetry = async () => {
    await updateIssue(issue.key, { status: "todo" } as Partial<Issue>);
    addToast({ type: "success", title: "Issue reset", description: `${issue.key} moved back to todo` });
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "Delete Issue",
      description: `Are you sure you want to delete ${issue.key}? This action cannot be undone.`,
      variant: "danger",
    });
    if (!confirmed) return;
    await deleteIssue(issue.key);
    addToast({ type: "info", title: "Issue deleted", description: issue.key });
    onClose();
  };

  const handleDuplicate = async () => {
    await createIssue({
      title: `${issue.title} (copy)`,
      description: issue.description,
      priority: issue.priority,
      labels: issue.labels,
    });
    addToast({ type: "success", title: "Issue duplicated", description: `Copied from ${issue.key}` });
  };

  const priorityColors: Record<string, string> = {
    critical: "bg-red-500/10 text-red-500 border-red-500/20",
    high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    low: "bg-green-500/10 text-green-500 border-green-500/20",
  };

  return (
    <div className="fixed inset-0 z-[150]">
      {confirmDialog}
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-card border-l border-border shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2 relative">
            <span className="text-sm font-mono text-muted-foreground">
              {issue.key}
            </span>
            <Badge
              className={cn("text-[10px] px-1.5 py-0 gap-1 cursor-pointer hover:ring-1 hover:ring-white/30 transition-all", statusConfig.color, "text-white")}
              onClick={() => setShowStatusMenu(!showStatusMenu)}
            >
              <StatusIcon className="h-2.5 w-2.5" />
              {statusConfig.label}
              <ChevronDown className="h-2.5 w-2.5" />
            </Badge>
            {showStatusMenu && (
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-10 py-1 min-w-[130px]">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => handleStatusChange(key)}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2",
                        issue.status === key && "bg-accent font-medium"
                      )}
                    >
                      <div className={cn("h-2 w-2 rounded-full shrink-0", cfg.color)} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Title (editable) */}
            <div>
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                    className="text-lg font-semibold"
                    autoFocus
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSaveTitle}>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingTitle(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <h2
                  className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors group flex items-center gap-2"
                  onClick={() => { setEditTitle(issue.title); setEditingTitle(true); }}
                >
                  {issue.title}
                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
                </h2>
              )}

              {/* Description (editable) */}
              {editingDesc ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="min-h-[100px] text-sm"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveDesc} className="gap-1 text-xs">
                      <Check className="h-3 w-3" /> Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingDesc(false)} className="text-xs">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="mt-2 text-muted-foreground cursor-pointer hover:bg-muted/30 rounded-md p-1 -m-1 transition-colors group"
                  onClick={() => { setEditDesc(issue.description || ""); setEditingDesc(true); }}
                >
                  {issue.description ? (
                    <MarkdownContent content={issue.description} />
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic">Click to add description...</p>
                  )}
                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity mt-1" />
                </div>
              )}
            </div>

            <Separator />

            {/* Metadata grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Priority
                </p>
                <Badge
                  variant="outline"
                  className={cn("text-xs cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all gap-1", priorityColors[issue.priority] || "")}
                  onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                >
                  {issue.priority}
                  <ChevronDown className="h-2.5 w-2.5" />
                </Badge>
                {showPriorityMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-10 py-1 min-w-[120px]">
                    {["critical", "high", "medium", "low"].map((p) => (
                      <button
                        key={p}
                        onClick={() => handlePriorityChange(p)}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors capitalize",
                          issue.priority === p && "bg-accent font-medium"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Attempts
                </p>
                <span className="text-sm font-mono">{issue.attempt_count}</span>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Created
                </p>
                <span className="text-xs text-muted-foreground">
                  {new Date(issue.created_at).toLocaleString()}
                </span>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Updated
                </p>
                <span className="text-xs text-muted-foreground">
                  {new Date(issue.updated_at).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Labels (editable) */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Labels
              </p>
              <div className="flex flex-wrap gap-1">
                {issue.labels.map((label) => (
                  <Badge key={label} variant="secondary" className="text-xs gap-1 group/label">
                    <Tag className="h-2.5 w-2.5" />
                    {label}
                    <button
                      onClick={() => handleRemoveLabel(label)}
                      className="opacity-0 group-hover/label:opacity-100 transition-opacity ml-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
                {showLabelInput ? (
                  <div className="flex items-center gap-1">
                    <Input
                      ref={labelInputRef}
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddLabel(); if (e.key === "Escape") { setShowLabelInput(false); setNewLabel(""); } }}
                      className="h-6 text-xs w-24 px-2"
                      placeholder="Label..."
                    />
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleAddLabel}>
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowLabelInput(true)}
                    className="h-[22px] px-2 rounded-md border border-dashed border-border text-[10px] text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    Add
                  </button>
                )}
              </div>
            </div>

            {/* Agent info */}
            {issue.agent_name && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Agent
                </p>
                <Badge variant="outline" className="text-xs gap-1">
                  <Bot className="h-3 w-3" />
                  {issue.agent_name}
                </Badge>
              </div>
            )}

            {/* Branch & PR */}
            {(issue.branch_name || issue.pr_url) && (
              <>
                <Separator />
                <div className="space-y-2">
                  {issue.branch_name && (
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        {issue.branch_name}
                      </code>
                    </div>
                  )}
                  {issue.pr_url && (
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <a
                        href={issue.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline"
                      >
                        {issue.pr_url}
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Links & References */}
            <Separator />
            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Links & References
              </p>
              {/* Auto-populated links from issue data */}
              <div className="space-y-1.5">
                {issue.pr_url && (
                  <a
                    href={issue.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 hover:bg-muted transition-colors text-xs group"
                  >
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-blue-400 group-hover:underline truncate flex-1">Pull Request</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">PR</Badge>
                  </a>
                )}
                {links.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 hover:bg-muted transition-colors text-xs group">
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 group-hover:underline truncate flex-1"
                    >
                      {link.title || link.url}
                    </a>
                    <button
                      onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              {showLinkInput ? (
                <div className="mt-2 space-y-1.5 p-2 rounded-md border border-border bg-muted/10">
                  <Input
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                    placeholder="Link title (optional)"
                    className="text-xs h-7"
                    autoFocus
                  />
                  <Input
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="text-xs h-7"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newLinkUrl.trim()) {
                        setLinks((prev) => [...prev, { title: newLinkTitle.trim() || newLinkUrl.trim(), url: newLinkUrl.trim() }]);
                        setNewLinkTitle("");
                        setNewLinkUrl("");
                        setShowLinkInput(false);
                      }
                      if (e.key === "Escape") {
                        setShowLinkInput(false);
                        setNewLinkTitle("");
                        setNewLinkUrl("");
                      }
                    }}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      disabled={!newLinkUrl.trim()}
                      onClick={() => {
                        if (newLinkUrl.trim()) {
                          setLinks((prev) => [...prev, { title: newLinkTitle.trim() || newLinkUrl.trim(), url: newLinkUrl.trim() }]);
                          setNewLinkTitle("");
                          setNewLinkUrl("");
                          setShowLinkInput(false);
                        }
                      }}
                    >
                      Add Link
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] h-6 px-2"
                      onClick={() => { setShowLinkInput(false); setNewLinkTitle(""); setNewLinkUrl(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowLinkInput(true)}
                  className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md border border-dashed border-border hover:border-primary"
                >
                  <Plus className="h-2.5 w-2.5" />
                  Add Link
                </button>
              )}
            </div>

            {/* Error log */}
            {issue.error_log && (
              <>
                <Separator />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    Error Log
                  </p>
                  <div className="bg-red-950/30 border border-red-900/30 rounded-lg p-3">
                    <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap">
                      {issue.error_log}
                    </pre>
                  </div>
                </div>
              </>
            )}

            {/* Related issues (siblings from same pipeline) */}
            {issue.pipeline_id && (() => {
              const siblings = issues.filter(
                (i) => i.pipeline_id === issue.pipeline_id && i.key !== issue.key
              );
              if (siblings.length === 0) return null;
              return (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      Related Issues
                    </p>
                    <div className="space-y-1.5">
                      {siblings.map((sib) => {
                        const sibStatus = STATUS_CONFIG[sib.status] || STATUS_CONFIG.todo;
                        const priorityColors: Record<string, string> = {
                          critical: "text-red-500", high: "text-orange-500", medium: "text-yellow-500", low: "text-green-500",
                        };
                        return (
                          <div
                            key={sib.key}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors cursor-default relative group/sib"
                          >
                            <div className={cn("h-2 w-2 rounded-full shrink-0", sibStatus.color)} />
                            <span className="text-xs font-mono text-muted-foreground shrink-0">
                              {sib.key}
                            </span>
                            <span className="text-xs truncate flex-1">{sib.title}</span>
                            <Badge
                              className={cn(
                                "text-[9px] px-1 py-0 shrink-0",
                                sibStatus.color,
                                "text-white"
                              )}
                            >
                              {sibStatus.label}
                            </Badge>
                            {/* Hover preview popover */}
                            <div className="absolute left-0 bottom-full mb-1 hidden group-hover/sib:block z-20 w-64">
                              <Card className="p-3 shadow-lg border">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className={cn("h-2 w-2 rounded-full", sibStatus.color)} />
                                  <span className="text-[10px] font-mono text-muted-foreground">{sib.key}</span>
                                  <span className={cn("text-[10px] capitalize", priorityColors[sib.priority] || "text-muted-foreground")}>
                                    {sib.priority}
                                  </span>
                                </div>
                                <p className="text-xs font-medium">{sib.title}</p>
                                {sib.description && (
                                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{sib.description}</p>
                                )}
                                {sib.labels.length > 0 && (
                                  <div className="flex gap-1 mt-1.5 flex-wrap">
                                    {sib.labels.map((l) => (
                                      <Badge key={l} variant="secondary" className="text-[8px] px-1 py-0">{l}</Badge>
                                    ))}
                                  </div>
                                )}
                              </Card>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}

            <Separator />

            {/* Activity Timeline */}
            <div>
              <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Activity Timeline
              </p>
              {loadingActivity ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Loading activity...</span>
                </div>
              ) : (() => {
                // Combine API activity with issue lifecycle events
                const timelineEvents = [
                  { event: "Issue created", details: `Created with priority ${issue.priority}`, timestamp: issue.created_at, type: "created" },
                  ...activity.map((a) => ({ ...a, type: a.event.toLowerCase().includes("status") ? "status" : a.event.toLowerCase().includes("fail") || a.event.toLowerCase().includes("error") ? "error" : "update" })),
                ];

                if (timelineEvents.length === 0) {
                  return (
                    <p className="text-xs text-muted-foreground py-4">
                      No activity recorded
                    </p>
                  );
                }

                const getNodeColor = (type: string) => {
                  switch (type) {
                    case "created": return "bg-blue-500 border-blue-500";
                    case "status": return "bg-violet-500 border-violet-500";
                    case "error": return "bg-red-500 border-red-500";
                    default: return "bg-emerald-500 border-emerald-500";
                  }
                };

                return (
                  <div className="relative pl-4">
                    {/* Vertical line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                    <div className="space-y-3">
                      {timelineEvents.map((entry, i) => (
                        <div key={i} className="relative flex items-start gap-3">
                          {/* Node */}
                          <div className={cn(
                            "h-[14px] w-[14px] rounded-full border-2 shrink-0 z-10 -ml-[7px] mt-0.5 bg-card",
                            getNodeColor(entry.type)
                          )} />
                          {/* Content */}
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium">{entry.event}</p>
                              <span className="text-[9px] text-muted-foreground shrink-0">
                                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            {entry.details && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {entry.details}
                              </p>
                            )}
                            {(i === 0 || new Date(entry.timestamp).toDateString() !== new Date(timelineEvents[i - 1].timestamp).toDateString()) && (
                              <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                                {new Date(entry.timestamp).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <Separator />

            {/* Comments */}
            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments
              </p>
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No comments yet
                </p>
              )}
              {comments.length > 0 && (
                <div className="space-y-2 mb-3">
                  {comments.map((c, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-2.5">
                      <p className="text-xs whitespace-pre-wrap">{c.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(c.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && commentText.trim()) {
                      setComments((prev) => [...prev, { text: commentText.trim(), timestamp: new Date().toISOString() }]);
                      setCommentText("");
                    }
                  }}
                  placeholder="Add a comment..."
                  className="text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={!commentText.trim()}
                  onClick={() => {
                    if (commentText.trim()) {
                      setComments((prev) => [...prev, { text: commentText.trim(), timestamp: new Date().toISOString() }]);
                      setCommentText("");
                    }
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Actions footer */}
        <div className="p-4 border-t border-border space-y-2">
          <div className="flex gap-2">
            {issue.status === "failed" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDuplicate}
              className="gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="gap-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10 ml-auto"
            >
              Delete Issue
            </Button>
          </div>
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground/50">
            <span>Shortcuts:</span>
            {[
              { key: "T", label: "Todo" },
              { key: "W", label: "Working" },
              { key: "R", label: "Review" },
              { key: "D", label: "Done" },
            ].map((s) => (
              <span key={s.key} className="flex items-center gap-0.5">
                <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[8px] font-mono">{s.key}</kbd>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
