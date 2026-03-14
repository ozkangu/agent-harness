"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Send,
  FileText,
  Code2,
  TestTube,
  Search,
  MessageSquare,
  BookOpen,
  ListChecks,
  Bot,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Terminal,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  GitBranch,
  Plus,
  ArrowDown,
  Columns,
  RotateCcw,
  Copy,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/stores/app-store";
import { ArtifactsPanel } from "@/components/pipeline/artifacts-panel";
import { MarkdownContent } from "@/components/ui/markdown-renderer";
import { TerminalViewer } from "@/components/pipeline/terminal-viewer";
import { PipelineCompare } from "@/components/pipeline/pipeline-compare";
import { PipelineTimeline } from "@/components/pipeline/pipeline-timeline";
import { PipelineSkeleton } from "@/components/pipeline/pipeline-skeleton";
import { TemplateGallery } from "@/components/pipeline/template-gallery";
import { useVirtualList } from "@/hooks/use-virtual-list";
import { useTranslation } from "@/hooks/use-translation";
import { PHASE_LABELS, PHASE_ORDER, type PipelinePhase, type Pipeline } from "@/types";
import { cn } from "@/lib/utils";

const PHASE_ICONS: Record<string, React.ReactNode> = {
  repo_context: <Search className="h-4 w-4" />,
  clarification: <MessageSquare className="h-4 w-4" />,
  awaiting_clarification: <Clock className="h-4 w-4" />,
  analysis_document: <BookOpen className="h-4 w-4" />,
  ba_analysis: <ListChecks className="h-4 w-4" />,
  awaiting_approval_1: <ThumbsUp className="h-4 w-4" />,
  coding: <Code2 className="h-4 w-4" />,
  awaiting_approval_2: <ThumbsUp className="h-4 w-4" />,
  code_review: <FileText className="h-4 w-4" />,
  awaiting_approval_3: <ThumbsUp className="h-4 w-4" />,
  test_validation: <TestTube className="h-4 w-4" />,
  awaiting_approval_4: <ThumbsUp className="h-4 w-4" />,
  done: <CheckCircle2 className="h-4 w-4" />,
  failed: <AlertCircle className="h-4 w-4" />,
};

const PHASE_DESCRIPTIONS: Record<string, string> = {
  repo_context: "Analyzes repository structure, files, and dependencies to understand the codebase",
  clarification: "AI asks clarifying questions about the requirement to ensure understanding",
  awaiting_clarification: "Waiting for user to answer clarification questions",
  analysis_document: "Generates a detailed analysis document with technical approach",
  ba_analysis: "Creates user stories with acceptance criteria and estimates",
  awaiting_approval_1: "Waiting for user to review and approve generated stories",
  coding: "AI writes code based on approved stories and analysis",
  awaiting_approval_2: "Waiting for user to review the generated code",
  code_review: "AI performs automated code review checking quality and best practices",
  awaiting_approval_3: "Waiting for user to review the code review report",
  test_validation: "Runs automated tests and validates the implementation",
  awaiting_approval_4: "Waiting for user to review test results",
  done: "Pipeline completed successfully",
  failed: "Pipeline encountered an error and stopped",
};

function PhaseStatus({ phase, currentPhase }: { phase: PipelinePhase; currentPhase: PipelinePhase }) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const phaseIdx = PHASE_ORDER.indexOf(phase);
  const isDone = phaseIdx < currentIdx || currentPhase === "done";
  const isCurrent = phase === currentPhase;
  const isFailed = currentPhase === "failed";

  return (
    <div className="flex items-center gap-2" title={PHASE_DESCRIPTIONS[phase] || ""}>
      <div
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center border-2 transition-all",
          isDone && "bg-emerald-500/20 border-emerald-500 text-emerald-500",
          isCurrent && !isFailed && "bg-blue-500/20 border-blue-500 text-blue-500 animate-pulse",
          isCurrent && isFailed && "bg-red-500/20 border-red-500 text-red-500",
          !isDone && !isCurrent && "border-border text-muted-foreground"
        )}
      >
        {isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : isCurrent ? (
          isFailed ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          )
        ) : (
          <Circle className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-xs font-medium",
            isDone && "text-emerald-500",
            isCurrent && !isFailed && "text-blue-500",
            isCurrent && isFailed && "text-red-500",
            !isDone && !isCurrent && "text-muted-foreground"
          )}
        >
          {PHASE_LABELS[phase]}
        </span>
        {isCurrent && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {PHASE_DESCRIPTIONS[phase]}
          </p>
        )}
      </div>
    </div>
  );
}

function PipelineProgress({ currentPhase }: { currentPhase: PipelinePhase }) {
  const { phaseBackends } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const visiblePhases = expanded
    ? PHASE_ORDER
    : PHASE_ORDER.filter((p) => !p.startsWith("awaiting"));

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Pipeline Progress</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-xs gap-1"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              All Phases
            </>
          )}
        </Button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-2 mb-4">
        <div
          className={cn(
            "h-2 rounded-full transition-all duration-500",
            currentPhase === "failed" ? "bg-red-500" : "bg-gradient-to-r from-violet-500 to-indigo-500"
          )}
          style={{
            width: `${Math.max(
              5,
              currentPhase === "done"
                ? 100
                : (PHASE_ORDER.indexOf(currentPhase) / (PHASE_ORDER.length - 1)) * 100
            )}%`,
          }}
        />
      </div>

      <div className="space-y-2">
        {visiblePhases.map((phase, idx) => (
          <div key={phase} className="flex items-center">
            <PhaseStatus phase={phase} currentPhase={currentPhase} />
            {phaseBackends && phaseBackends[phase]?.overridden && (
              <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                {(phaseBackends[phase] as { backend?: string }).backend}
              </span>
            )}
            {idx < visiblePhases.length - 1 && (
              <div className="ml-3.5 border-l border-border h-2 -mb-2" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function CreatePipelineForm() {
  const { createPipeline } = useAppStore();
  const { t } = useTranslation();
  const [requirement, setRequirement] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [targetBranch, setTargetBranch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const handleSubmit = async () => {
    if (!requirement.trim()) return;
    // Build full requirement with optional context
    let fullRequirement = requirement.trim();
    if (repoUrl.trim()) {
      fullRequirement = `[repo: ${repoUrl.trim()}]${targetBranch.trim() ? ` [branch: ${targetBranch.trim()}]` : ""}\n\n${fullRequirement}`;
    }
    await createPipeline(fullRequirement);
    setRequirement("");
    setRepoUrl("");
    setTargetBranch("");
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="max-w-lg w-full text-center">
        <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center mx-auto mb-6">
          <Sparkles className="h-10 w-10 text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Start a Pipeline</h2>
        <p className="text-muted-foreground mb-6">
          {t("pipeline.requirementHint").split(".")[0]}.
          your codebase, plan the work, generate user stories, write code,
          review, and test - all automatically.
        </p>

        <div className="space-y-3 text-left">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Requirement
              </label>
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
              <div className="min-h-[120px] p-3 rounded-md border border-border bg-muted/20">
                {requirement.trim() ? (
                  <MarkdownContent content={requirement} />
                ) : (
                  <p className="text-xs text-muted-foreground/50 italic">Nothing to preview</p>
                )}
              </div>
            ) : (
              <Textarea
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                placeholder="e.g., Add a user authentication system with login, register, and password reset functionality... (supports **markdown**)"
                aria-label={t("pipeline.requirementLabel")}
                className="min-h-[120px]"
              />
            )}
          </div>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Advanced Options
          </button>

          {showAdvanced && (
            <div className="space-y-3 bg-muted/30 rounded-lg p-3 border border-border">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Repository URL (optional)
                </label>
                <Input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/org/repo.git"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Target a specific Git repository for this pipeline
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Target Branch (optional)
                </label>
                <Input
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  placeholder="main"
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!requirement.trim()}
            className="w-full gap-2"
            size="lg"
          >
            <Sparkles className="h-4 w-4" />
            {t("pipeline.startPipeline")}
          </Button>
        </div>

        <Separator className="my-6" />
        <h3 className="text-sm font-semibold mb-3">{t("pipeline.orChooseTemplate")}</h3>
        <TemplateGallery onSelect={(req) => setRequirement(req)} />
      </div>
    </div>
  );
}

function PipelineMessageList({
  messages,
  chatLoading,
  scrollRef,
}: {
  messages: import("@/types").Message[];
  chatLoading: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const useVirtual = messages.length > 50;
  const { parentRef, virtualItems, totalSize } = useVirtualList({
    count: messages.length,
    estimateSize: () => 120,
    overscan: 10,
    enabled: useVirtual,
  });

  const renderMessage = (msg: import("@/types").Message) => (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        {msg.role === "assistant" ? (
          <Bot className="h-4 w-4 text-violet-400" />
        ) : msg.role === "system" ? (
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        ) : (
          <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
            <span className="text-[8px] text-primary-foreground">U</span>
          </div>
        )}
        <span className="text-xs font-medium capitalize">{msg.role}</span>
        {msg.phase && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {PHASE_LABELS[msg.phase]}
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {new Date(msg.created_at).toLocaleTimeString()}
        </span>
      </div>
      <div className="ml-6 text-sm whitespace-pre-wrap rounded-lg bg-muted/30 p-3">
        {msg.content}
      </div>
    </div>
  );

  if (useVirtual) {
    return (
      <div ref={parentRef} className="h-full overflow-auto p-4">
        <div className="relative w-full" style={{ height: `${totalSize}px` }}>
          {virtualItems.map((virtualItem) => (
            <div
              key={messages[virtualItem.index].id}
              className="absolute top-0 left-0 w-full"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderMessage(messages[virtualItem.index])}
            </div>
          ))}
        </div>
        {chatLoading && (
          <div className="flex items-center gap-2 text-muted-foreground ml-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">AI is working...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full p-4" ref={scrollRef}>
      {messages.map((msg) => (
        <div key={msg.id}>{renderMessage(msg)}</div>
      ))}
      {chatLoading && (
        <div className="flex items-center gap-2 text-muted-foreground ml-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">AI is working...</span>
        </div>
      )}
    </ScrollArea>
  );
}

function PipelineListSidebar({
  pipelines,
  activeId,
  onSelect,
  onClose,
  onDelete,
  compareMode,
  compareIds,
  onToggleCompare,
  onEnterCompare,
  onExitCompare,
}: {
  pipelines: Pipeline[];
  activeId: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
  onDelete: (id: number) => void;
  compareMode: boolean;
  compareIds: number[];
  onToggleCompare: (id: number) => void;
  onEnterCompare: () => void;
  onExitCompare: () => void;
}) {
  const phaseColors: Record<string, string> = {
    done: "text-emerald-500",
    failed: "text-red-500",
    coding: "text-blue-500",
  };

  return (
    <div className="w-64 border-r border-border flex flex-col h-full bg-muted/20">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Pipelines
          </h3>
          <div className="flex items-center gap-1">
            {pipelines.length >= 2 && (
              <Button
                variant={compareMode ? "default" : "ghost"}
                size="icon"
                className={cn("h-6 w-6", compareMode && "h-6 w-6")}
                onClick={compareMode ? onExitCompare : onEnterCompare}
                title={compareMode ? "Exit compare" : "Compare pipelines"}
              >
                <Columns className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onSelect(null)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {compareMode && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Select 2 pipelines to compare ({compareIds.length}/2 selected)
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {pipelines.length === 0 && (
            <div className="text-center py-8">
              <GitBranch className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No pipelines yet</p>
            </div>
          )}
          {pipelines.map((p) => {
            const isCompareSelected = compareIds.includes(p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  "group/pl flex items-center rounded-lg text-xs transition-colors",
                  compareMode && isCompareSelected
                    ? "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/30 font-medium"
                    : activeId === p.id && !compareMode
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-accent"
                )}
              >
                <button
                  onClick={() => compareMode ? onToggleCompare(p.id) : onSelect(p.id)}
                  className="flex-1 text-left px-3 py-2.5 min-w-0"
                  title={p.requirement}
                >
                  <div className="flex items-center gap-2">
                    {compareMode ? (
                      <div className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                        isCompareSelected
                          ? "bg-violet-500 border-violet-500"
                          : "border-muted-foreground/40"
                      )}>
                        {isCompareSelected && (
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        )}
                      </div>
                    ) : (
                      <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate flex-1">{p.name}</span>
                    {p.phase.startsWith("awaiting") && (
                      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1 ml-5.5">
                    <span className={cn(
                      "text-[10px]",
                      phaseColors[p.phase] || "text-muted-foreground"
                    )}>
                      {PHASE_LABELS[p.phase]}
                    </span>
                  </div>
                  {p.requirement && (
                    <p className="text-[10px] text-muted-foreground/50 mt-1 ml-5.5 truncate">
                      {p.requirement.slice(0, 60)}{p.requirement.length > 60 ? "..." : ""}
                    </p>
                  )}
                </button>
                {!compareMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                    className="opacity-0 group-hover/pl:opacity-100 transition-opacity px-2 py-1 text-muted-foreground hover:text-red-500 shrink-0"
                    title="Delete pipeline"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function PipelineView() {
  const {
    activePipelineId,
    pipelines,
    pipelineMessages,
    chatLoading,
    approvePipeline,
    rejectPipeline,
    sendPipelineMessage,
    selectPipeline,
    createPipeline,
    deletePipeline,
    addToast,
    runnerOutput,
    loading,
  } = useAppStore();

  if (loading) return <PipelineSkeleton />;

  const [input, setInput] = useState("");
  const [activeTab, setActiveTab] = useState<"messages" | "artifacts" | "terminal" | "audit">("messages");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pipeline = pipelines.find((p) => p.id === activePipelineId);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [pipelineMessages, scrollToBottom]);

  const isAwaiting = pipeline?.phase.startsWith("awaiting") ?? false;

  const handleSend = async () => {
    if (!pipeline) return;
    const text = input.trim();
    if (!text || chatLoading) return;
    setInput("");
    await sendPipelineMessage(pipeline.id, text);
  };

  const mainContent = !pipeline ? (
    <CreatePipelineForm />
  ) : (
    <div className="flex flex-col h-full">
      {/* Pipeline header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="text-lg font-semibold">{pipeline.name}</h2>
              <p className="text-xs text-muted-foreground">
                Pipeline #{pipeline.id} &middot; {PHASE_LABELS[pipeline.phase]}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {(pipeline.phase === "done" || pipeline.phase === "failed") && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await createPipeline(pipeline.requirement);
                  addToast({ type: "success", title: "Pipeline re-run started", description: pipeline.name });
                }}
                className="gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-run
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await createPipeline(pipeline.requirement);
                addToast({ type: "success", title: "Pipeline cloned", description: `Cloned from ${pipeline.name}` });
              }}
              className="gap-1"
            >
              <Copy className="h-3.5 w-3.5" />
              Clone
            </Button>
            {isAwaiting && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rejectPipeline(pipeline.id)}
                  className="gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => approvePipeline(pipeline.id)}
                  className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>

        <PipelineProgress currentPhase={pipeline.phase} />
        <PipelineTimeline pipeline={pipeline} />

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-3 bg-muted rounded-lg p-1">
          <button
            onClick={() => setActiveTab("messages")}
            className={cn(
              "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors flex items-center justify-center gap-1.5",
              activeTab === "messages" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Messages
          </button>
          <button
            onClick={() => setActiveTab("artifacts")}
            className={cn(
              "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors flex items-center justify-center gap-1.5",
              activeTab === "artifacts" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Package className="h-3.5 w-3.5" />
            Artifacts
          </button>
          <button
            onClick={() => setActiveTab("terminal")}
            className={cn(
              "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors flex items-center justify-center gap-1.5",
              activeTab === "terminal" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Terminal className="h-3.5 w-3.5" />
            Terminal
            {runnerOutput.length > 0 && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={cn(
              "flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-colors flex items-center justify-center gap-1.5",
              activeTab === "audit" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Audit
          </button>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "audit" ? (
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-3 py-2 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider border-b border-border">
              <span className="w-32">Time</span>
              <span className="w-20">Type</span>
              <span className="flex-1">Details</span>
            </div>
            {/* Pipeline created */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors">
              <span className="text-[10px] text-muted-foreground w-32 shrink-0">
                {new Date(pipeline.created_at).toLocaleString()}
              </span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 w-20 justify-center border-blue-500 text-blue-500">
                Created
              </Badge>
              <span className="text-xs flex-1 truncate">
                Pipeline &quot;{pipeline.name}&quot; created
              </span>
            </div>
            {/* Phase entries from messages */}
            {pipelineMessages
              .filter((m) => m.role === "system" || m.phase)
              .map((msg) => {
                const isApproval = msg.content?.toLowerCase().includes("approv");
                const isRejection = msg.content?.toLowerCase().includes("reject");
                const isPhaseChange = !!msg.phase;
                const badgeColor = isApproval ? "border-emerald-500 text-emerald-500"
                  : isRejection ? "border-red-500 text-red-500"
                  : isPhaseChange ? "border-violet-500 text-violet-500"
                  : "border-border text-muted-foreground";
                const label = isApproval ? "Approved" : isRejection ? "Rejected" : isPhaseChange ? "Phase" : "System";
                return (
                  <div key={msg.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors">
                    <span className="text-[10px] text-muted-foreground w-32 shrink-0">
                      {new Date(msg.created_at).toLocaleString()}
                    </span>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 w-20 justify-center", badgeColor)}>
                      {label}
                    </Badge>
                    <span className="text-xs flex-1 truncate">
                      {msg.phase ? `Phase: ${PHASE_LABELS[msg.phase as PipelinePhase] || msg.phase}` : ""}{" "}
                      {msg.content?.slice(0, 100)}
                    </span>
                  </div>
                );
              })}
            {/* Current status */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/30 transition-colors">
              <span className="text-[10px] text-muted-foreground w-32 shrink-0">
                {new Date(pipeline.updated_at).toLocaleString()}
              </span>
              <Badge variant="outline" className={cn(
                "text-[9px] px-1.5 py-0 w-20 justify-center",
                pipeline.phase === "done" ? "border-emerald-500 text-emerald-500"
                  : pipeline.phase === "failed" ? "border-red-500 text-red-500"
                  : "border-blue-500 text-blue-500"
              )}>
                Current
              </Badge>
              <span className="text-xs flex-1">
                Current phase: {PHASE_LABELS[pipeline.phase]}
              </span>
            </div>
          </div>
        </ScrollArea>
      ) : activeTab === "terminal" ? (
        <div className="flex-1 p-4">
          <TerminalViewer
            logs={runnerOutput.map((r) => ({
              id: r.id,
              timestamp: r.timestamp,
              type: r.type as "stdout" | "stderr" | "system" | "command",
              content: r.content,
            }))}
            title={`Pipeline #${pipeline.id} - Agent Output`}
            className="h-full"
          />
        </div>
      ) : activeTab === "artifacts" ? (
        <ArtifactsPanel pipelineId={pipeline.id} />
      ) : (
      <div className="flex-1 relative">
        <PipelineMessageList
          messages={pipelineMessages}
          chatLoading={chatLoading}
          scrollRef={scrollRef}
        />

        {pipelineMessages.length > 3 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 h-8 w-8 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors opacity-60 hover:opacity-100"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>
      )}

      {/* Input for messages / clarifications */}
      {pipeline && (isAwaiting || pipeline.phase === "awaiting_clarification") && (
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={
                pipeline.phase === "awaiting_clarification"
                  ? "Answer the clarification questions..."
                  : "Add feedback or comments..."
              }
            />
            <Button onClick={handleSend} disabled={!input.trim() || chatLoading} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const handleToggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const comparePipelines =
    compareMode && compareIds.length === 2
      ? [pipelines.find((p) => p.id === compareIds[0]), pipelines.find((p) => p.id === compareIds[1])]
      : [null, null];

  const showCompare = compareMode && comparePipelines[0] && comparePipelines[1];

  return (
    <div className="flex h-full">
      {sidebarOpen && (
        <PipelineListSidebar
          pipelines={pipelines}
          activeId={activePipelineId}
          onSelect={(id) => { setCompareMode(false); setCompareIds([]); selectPipeline(id); }}
          onClose={() => setSidebarOpen(false)}
          onDelete={(id) => {
            deletePipeline(id);
            addToast({ type: "info", title: "Pipeline deleted" });
          }}
          compareMode={compareMode}
          compareIds={compareIds}
          onToggleCompare={handleToggleCompare}
          onEnterCompare={() => { setCompareMode(true); setCompareIds([]); }}
          onExitCompare={() => { setCompareMode(false); setCompareIds([]); }}
        />
      )}
      <div className="flex-1 min-w-0">
        {showCompare ? (
          <PipelineCompare left={comparePipelines[0]!} right={comparePipelines[1]!} />
        ) : (
          mainContent
        )}
      </div>
    </div>
  );
}
