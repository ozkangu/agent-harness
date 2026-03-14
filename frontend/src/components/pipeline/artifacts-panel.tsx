"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  ListChecks,
  Code2,
  TestTube,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Eye,
  Folder,
  FolderOpen,
  GitBranch,
  ExternalLink,
  File,
  FileCode,
  FileJson,
  FileType,
  Hash,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CodeEditor } from "@/components/editor/code-editor";
import { pipelinesApi } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import type { PipelineArtifacts, StoryItem } from "@/types";
import { cn } from "@/lib/utils";

interface TreeNode {
  name: string;
  type: "folder" | "file";
  children?: TreeNode[];
  icon?: React.ElementType;
  meta?: string;
  href?: string;
}

function getFileIcon(name: string): React.ElementType {
  if (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".js") || name.endsWith(".jsx")) return FileCode;
  if (name.endsWith(".json")) return FileJson;
  if (name.endsWith(".md")) return FileText;
  if (name.endsWith(".css") || name.endsWith(".scss")) return FileType;
  return File;
}

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isFolder = node.type === "folder";
  const Icon = node.icon || (isFolder ? (expanded ? FolderOpen : Folder) : getFileIcon(node.name));

  return (
    <div>
      <button
        onClick={() => {
          if (isFolder) setExpanded(!expanded);
          if (node.href) window.open(node.href, "_blank");
        }}
        className={cn(
          "flex items-center gap-1.5 w-full text-left py-1 px-1.5 rounded hover:bg-accent/50 transition-colors text-xs",
          node.href && "cursor-pointer"
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {isFolder ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon className={cn(
          "h-3.5 w-3.5 shrink-0",
          isFolder ? "text-amber-400" : "text-blue-400"
        )} />
        <span className="truncate flex-1">{node.name}</span>
        {node.meta && (
          <span className="text-[10px] text-muted-foreground shrink-0">{node.meta}</span>
        )}
        {node.href && (
          <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>
      {isFolder && expanded && node.children && (
        <div>
          {node.children.map((child, i) => (
            <TreeItem key={`${child.name}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactSummary({ artifacts }: { artifacts: PipelineArtifacts }) {
  const items = [
    { label: "Context", available: !!artifacts.repo_context, icon: FileText, color: "text-blue-400" },
    { label: "Analysis", available: !!artifacts.analysis_doc, icon: Code2, color: "text-amber-400" },
    { label: "Stories", available: !!(artifacts.stories_parsed && artifacts.stories_parsed.length > 0), icon: ListChecks, color: "text-violet-400" },
    { label: "Review", available: !!artifacts.review_report, icon: FileText, color: "text-violet-400", verdict: artifacts.review_verdict },
    { label: "Tests", available: !!artifacts.test_report, icon: TestTube, color: "text-emerald-400", verdict: artifacts.test_verdict },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border",
            item.available
              ? "border-border bg-muted/30"
              : "border-transparent text-muted-foreground/30"
          )}
        >
          <item.icon className={cn("h-3 w-3", item.available ? item.color : "text-muted-foreground/30")} />
          <span>{item.label}</span>
          {item.verdict && (
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] px-1 py-0 ml-1",
                item.verdict.toLowerCase() === "pass"
                  ? "border-emerald-500 text-emerald-500"
                  : "border-red-500 text-red-500"
              )}
            >
              {item.verdict}
            </Badge>
          )}
          {item.available && !item.verdict && (
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
          )}
        </div>
      ))}
    </div>
  );
}

function StoryCard({ story, index }: { story: StoryItem; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 w-full text-left"
      >
        <div className="h-6 w-6 rounded bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-[10px] font-bold text-violet-500">
            {index + 1}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{story.title}</p>
          <div className="flex items-center gap-2 mt-1">
            {story.priority && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {story.priority}
              </Badge>
            )}
            {story.estimate && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                {story.estimate}
              </Badge>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 ml-8 space-y-2">
          {story.description && (
            <p className="text-xs text-muted-foreground">{story.description}</p>
          )}
          {story.acceptance_criteria && story.acceptance_criteria.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">
                Acceptance Criteria
              </p>
              <ul className="space-y-1">
                {story.acceptance_criteria.map((ac, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                    {ac}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ArtifactSection({
  title,
  icon: Icon,
  content,
  color,
  badge,
  viewAsCode,
  language,
}: {
  title: string;
  icon: React.ElementType;
  content: string | null;
  color: string;
  badge?: { text: string; variant: "success" | "error" };
  viewAsCode?: boolean;
  language?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [codeView, setCodeView] = useState(false);

  if (!content) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full p-3 hover:bg-accent/50 transition-colors text-left"
      >
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-sm font-medium flex-1">{title}</span>
        {badge && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              badge.variant === "success"
                ? "border-emerald-500 text-emerald-500"
                : "border-red-500 text-red-500"
            )}
          >
            {badge.text}
          </Badge>
        )}
        {viewAsCode && expanded && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => {
              e.stopPropagation();
              setCodeView(!codeView);
            }}
          >
            <Eye className="h-3 w-3" />
          </Button>
        )}
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border">
          {codeView && viewAsCode ? (
            <CodeEditor
              initialContent={content}
              language={language || "markdown"}
              title={title}
              maxHeight="400px"
            />
          ) : (
            <div className="p-3 bg-muted/20">
              <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                {content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ArtifactsPanelProps {
  pipelineId: number;
}

export function ArtifactsPanel({ pipelineId }: ArtifactsPanelProps) {
  const [artifacts, setArtifacts] = useState<PipelineArtifacts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    pipelinesApi
      .artifacts(pipelineId)
      .then(setArtifacts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pipelineId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!artifacts) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <p className="text-sm">No artifacts available yet</p>
      </div>
    );
  }

  const issues = useAppStore((s) => s.issues);
  const relatedIssues = issues.filter((i) => i.pipeline_id === pipelineId);

  // Build file tree from related issues
  const issueTree: TreeNode[] = relatedIssues.length > 0
    ? [{
        name: "Issues & Branches",
        type: "folder",
        icon: GitBranch,
        children: relatedIssues.map((issue) => ({
          name: `${issue.key}: ${issue.title}`,
          type: "folder" as const,
          icon: Hash,
          meta: issue.status,
          children: [
            ...(issue.branch_name ? [{
              name: issue.branch_name,
              type: "file" as const,
              icon: GitBranch,
              meta: "branch",
            }] : []),
            ...(issue.pr_url ? [{
              name: "Pull Request",
              type: "file" as const,
              icon: ExternalLink,
              meta: "PR",
              href: issue.pr_url,
            }] : []),
          ],
        })),
      }]
    : [];

  const artifactTree: TreeNode[] = [
    ...(artifacts.repo_context ? [{
      name: "repo-context.md",
      type: "file" as const,
      icon: FileText,
      meta: `${Math.round(artifacts.repo_context.length / 1024)}KB`,
    }] : []),
    ...(artifacts.analysis_doc ? [{
      name: "analysis-document.md",
      type: "file" as const,
      icon: Code2,
      meta: `${Math.round(artifacts.analysis_doc.length / 1024)}KB`,
    }] : []),
    ...(artifacts.stories_json ? [{
      name: "stories.json",
      type: "file" as const,
      icon: FileJson,
      meta: `${artifacts.stories_parsed?.length || 0} stories`,
    }] : []),
    ...(artifacts.review_report ? [{
      name: "code-review.md",
      type: "file" as const,
      icon: FileText,
      meta: artifacts.review_verdict || "",
    }] : []),
    ...(artifacts.test_report ? [{
      name: "test-report.md",
      type: "file" as const,
      icon: TestTube,
      meta: artifacts.test_verdict || "",
    }] : []),
  ];

  const fullTree: TreeNode[] = [
    {
      name: "artifacts",
      type: "folder",
      icon: Folder,
      children: artifactTree,
    },
    ...issueTree,
  ];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pipeline Artifacts</h3>
          <span className="text-[10px] text-muted-foreground">
            {artifactTree.length} artifacts &middot; {relatedIssues.length} issues
          </span>
        </div>

        {/* Artifact Summary */}
        <ArtifactSummary artifacts={artifacts} />

        {/* File Tree Explorer */}
        <Card className="p-2">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <Folder className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-medium">Explorer</span>
          </div>
          <Separator className="mb-1" />
          <div className="space-y-0">
            {fullTree.map((node, i) => (
              <TreeItem key={`${node.name}-${i}`} node={node} />
            ))}
          </div>
        </Card>

        {/* Stories */}
        {artifacts.stories_parsed && artifacts.stories_parsed.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-medium">
                User Stories ({artifacts.stories_parsed.length})
              </span>
            </div>
            <div className="space-y-2">
              {artifacts.stories_parsed.map((story, i) => (
                <StoryCard key={story.id || i} story={story} index={i} />
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Reports */}
        <div className="space-y-2">
          <ArtifactSection
            title="Repo Context"
            icon={FileText}
            content={artifacts.repo_context}
            color="text-blue-400"
            viewAsCode
            language="markdown"
          />
          <ArtifactSection
            title="Analysis Document"
            icon={Code2}
            content={artifacts.analysis_doc}
            color="text-amber-400"
            viewAsCode
            language="markdown"
          />
          <ArtifactSection
            title="Code Review"
            icon={FileText}
            content={artifacts.review_report}
            color="text-violet-400"
            viewAsCode
            language="markdown"
            badge={
              artifacts.review_verdict
                ? {
                    text: artifacts.review_verdict,
                    variant:
                      artifacts.review_verdict.toLowerCase() === "pass"
                        ? "success"
                        : "error",
                  }
                : undefined
            }
          />
          <ArtifactSection
            title="Test Report"
            icon={TestTube}
            content={artifacts.test_report}
            color="text-emerald-400"
            viewAsCode
            language="markdown"
            badge={
              artifacts.test_verdict
                ? {
                    text: artifacts.test_verdict,
                    variant:
                      artifacts.test_verdict.toLowerCase() === "pass"
                        ? "success"
                        : "error",
                  }
                : undefined
            }
          />
        </div>
      </div>
    </ScrollArea>
  );
}
