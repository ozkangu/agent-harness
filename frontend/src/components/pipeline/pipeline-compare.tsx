"use client";

import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  Clock,
  GitBranch,
  ArrowRight,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PHASE_LABELS, PHASE_ORDER, type Pipeline, type PipelinePhase } from "@/types";
import { cn } from "@/lib/utils";

interface PipelineCompareProps {
  left: Pipeline;
  right: Pipeline;
}

function phaseIndex(phase: PipelinePhase): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx === -1 ? (phase === "done" ? PHASE_ORDER.length : -1) : idx;
}

function phasePct(phase: PipelinePhase): number {
  if (phase === "done") return 100;
  if (phase === "failed") return phaseIndex(phase) > 0 ? (phaseIndex(phase) / PHASE_ORDER.length) * 100 : 0;
  return Math.max(5, (PHASE_ORDER.indexOf(phase) / (PHASE_ORDER.length - 1)) * 100);
}

function phaseColor(phase: PipelinePhase): string {
  if (phase === "done") return "text-emerald-500";
  if (phase === "failed") return "text-red-500";
  if (phase.startsWith("awaiting")) return "text-amber-500";
  return "text-blue-500";
}

function phaseBgColor(phase: PipelinePhase): string {
  if (phase === "done") return "bg-emerald-500";
  if (phase === "failed") return "bg-red-500";
  if (phase.startsWith("awaiting")) return "bg-amber-500";
  return "bg-blue-500";
}

function timeDiff(a: string, b: string): string {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return "N/A";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function CompareRow({
  label,
  leftValue,
  rightValue,
  leftColor,
  rightColor,
}: {
  label: string;
  leftValue: React.ReactNode;
  rightValue: React.ReactNode;
  leftColor?: string;
  rightColor?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center py-2">
      <div className={cn("text-sm text-right", leftColor)}>{leftValue}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium min-w-[80px] text-center">
        {label}
      </div>
      <div className={cn("text-sm", rightColor)}>{rightValue}</div>
    </div>
  );
}

export function PipelineCompare({ left, right }: PipelineCompareProps) {
  const leftPct = phasePct(left.phase);
  const rightPct = phasePct(right.phase);
  const leftDuration = timeDiff(left.created_at, left.updated_at);
  const rightDuration = timeDiff(right.created_at, right.updated_at);

  const displayPhases = PHASE_ORDER.filter((p) => !p.startsWith("awaiting"));

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-lg font-semibold">Pipeline Comparison</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Side-by-side view of two pipelines
          </p>
        </div>

        {/* Pipeline names */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
          <Card className="p-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <GitBranch className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold truncate">{left.name}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Pipeline #{left.id}
            </p>
          </Card>
          <div className="text-muted-foreground">
            <ArrowRight className="h-4 w-4 rotate-0" />
          </div>
          <Card className="p-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <GitBranch className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-semibold truncate">{right.name}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Pipeline #{right.id}
            </p>
          </Card>
        </div>

        {/* Progress bars */}
        <Card className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Progress
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{left.name}</span>
                <span className="text-xs font-mono">{Math.round(leftPct)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={cn(
                    "h-2 rounded-full transition-all",
                    left.phase === "failed" ? "bg-red-500" : "bg-gradient-to-r from-violet-500 to-indigo-500"
                  )}
                  style={{ width: `${leftPct}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{right.name}</span>
                <span className="text-xs font-mono">{Math.round(rightPct)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={cn(
                    "h-2 rounded-full transition-all",
                    right.phase === "failed" ? "bg-red-500" : "bg-gradient-to-r from-violet-500 to-indigo-500"
                  )}
                  style={{ width: `${rightPct}%` }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Phase-by-phase comparison */}
        <Card className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Phase Comparison
          </h3>
          <div className="space-y-1">
            {displayPhases.map((phase) => {
              const leftIdx = phaseIndex(left.phase);
              const rightIdx = phaseIndex(right.phase);
              const phaseIdx = phaseIndex(phase);

              const leftDone = phaseIdx < leftIdx || left.phase === "done";
              const leftCurrent = phase === left.phase;
              const leftFailed = left.phase === "failed" && leftCurrent;

              const rightDone = phaseIdx < rightIdx || right.phase === "done";
              const rightCurrent = phase === right.phase;
              const rightFailed = right.phase === "failed" && rightCurrent;

              return (
                <div
                  key={phase}
                  className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center py-1.5"
                >
                  {/* Left status */}
                  <div className="flex items-center justify-end gap-2">
                    {leftDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : leftFailed ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    ) : leftCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Phase label */}
                  <span className="text-[11px] font-medium text-muted-foreground min-w-[100px] text-center">
                    {PHASE_LABELS[phase]}
                  </span>

                  {/* Right status */}
                  <div className="flex items-center gap-2">
                    {rightDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : rightFailed ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    ) : rightCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Metadata comparison */}
        <Card className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Details
          </h3>
          <div className="divide-y divide-border">
            <CompareRow
              label="Status"
              leftValue={
                <Badge className={cn("text-[10px] px-1.5 py-0 text-white", phaseBgColor(left.phase))}>
                  {PHASE_LABELS[left.phase]}
                </Badge>
              }
              rightValue={
                <Badge className={cn("text-[10px] px-1.5 py-0 text-white", phaseBgColor(right.phase))}>
                  {PHASE_LABELS[right.phase]}
                </Badge>
              }
            />
            <CompareRow
              label="Duration"
              leftValue={<span className="font-mono text-xs">{leftDuration}</span>}
              rightValue={<span className="font-mono text-xs">{rightDuration}</span>}
            />
            <CompareRow
              label="Created"
              leftValue={
                <span className="text-xs text-muted-foreground">
                  {new Date(left.created_at).toLocaleString()}
                </span>
              }
              rightValue={
                <span className="text-xs text-muted-foreground">
                  {new Date(right.created_at).toLocaleString()}
                </span>
              }
            />
            <CompareRow
              label="Updated"
              leftValue={
                <span className="text-xs text-muted-foreground">
                  {new Date(left.updated_at).toLocaleString()}
                </span>
              }
              rightValue={
                <span className="text-xs text-muted-foreground">
                  {new Date(right.updated_at).toLocaleString()}
                </span>
              }
            />
            <CompareRow
              label="Artifacts"
              leftValue={
                <div className="flex items-center justify-end gap-1.5">
                  {left.repo_context && <Badge variant="secondary" className="text-[9px] px-1 py-0">Repo</Badge>}
                  {left.analysis_doc && <Badge variant="secondary" className="text-[9px] px-1 py-0">Analysis</Badge>}
                  {left.stories_json && <Badge variant="secondary" className="text-[9px] px-1 py-0">Stories</Badge>}
                  {left.review_report && <Badge variant="secondary" className="text-[9px] px-1 py-0">Review</Badge>}
                  {left.test_report && <Badge variant="secondary" className="text-[9px] px-1 py-0">Tests</Badge>}
                  {!left.repo_context && !left.analysis_doc && !left.stories_json && !left.review_report && !left.test_report && (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>
              }
              rightValue={
                <div className="flex items-center gap-1.5">
                  {right.repo_context && <Badge variant="secondary" className="text-[9px] px-1 py-0">Repo</Badge>}
                  {right.analysis_doc && <Badge variant="secondary" className="text-[9px] px-1 py-0">Analysis</Badge>}
                  {right.stories_json && <Badge variant="secondary" className="text-[9px] px-1 py-0">Stories</Badge>}
                  {right.review_report && <Badge variant="secondary" className="text-[9px] px-1 py-0">Review</Badge>}
                  {right.test_report && <Badge variant="secondary" className="text-[9px] px-1 py-0">Tests</Badge>}
                  {!right.repo_context && !right.analysis_doc && !right.stories_json && !right.review_report && !right.test_report && (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>
              }
            />
          </div>
        </Card>

        {/* Comparison Insights */}
        <Card className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" />
            Insights
          </h3>
          <div className="space-y-2">
            {(() => {
              const insights: { icon: React.ElementType; text: string; color: string }[] = [];
              const leftIdx = phaseIndex(left.phase);
              const rightIdx = phaseIndex(right.phase);
              const leftMs = new Date(left.updated_at).getTime() - new Date(left.created_at).getTime();
              const rightMs = new Date(right.updated_at).getTime() - new Date(right.created_at).getTime();

              // Progress comparison
              if (leftPct > rightPct) {
                insights.push({ icon: Trophy, text: `${left.name} is further ahead (${Math.round(leftPct)}% vs ${Math.round(rightPct)}%)`, color: "text-violet-400" });
              } else if (rightPct > leftPct) {
                insights.push({ icon: Trophy, text: `${right.name} is further ahead (${Math.round(rightPct)}% vs ${Math.round(leftPct)}%)`, color: "text-indigo-400" });
              } else {
                insights.push({ icon: CheckCircle2, text: "Both pipelines are at the same progress", color: "text-emerald-400" });
              }

              // Duration comparison
              if (leftMs > 0 && rightMs > 0) {
                if (leftMs < rightMs * 0.8) {
                  insights.push({ icon: Zap, text: `${left.name} is ${Math.round((1 - leftMs / rightMs) * 100)}% faster`, color: "text-amber-400" });
                } else if (rightMs < leftMs * 0.8) {
                  insights.push({ icon: Zap, text: `${right.name} is ${Math.round((1 - rightMs / leftMs) * 100)}% faster`, color: "text-amber-400" });
                }
              }

              // Failure detection
              if (left.phase === "failed" && right.phase !== "failed") {
                insights.push({ icon: AlertCircle, text: `${left.name} has failed while ${right.name} continues`, color: "text-red-400" });
              } else if (right.phase === "failed" && left.phase !== "failed") {
                insights.push({ icon: AlertCircle, text: `${right.name} has failed while ${left.name} continues`, color: "text-red-400" });
              }

              // Completion
              if (left.phase === "done" && right.phase === "done") {
                insights.push({ icon: CheckCircle2, text: "Both pipelines completed successfully", color: "text-emerald-400" });
              }

              return insights.map((insight, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30">
                  <insight.icon className={cn("h-4 w-4 shrink-0", insight.color)} />
                  <span className="text-xs">{insight.text}</span>
                </div>
              ));
            })()}
          </div>
        </Card>
      </div>
    </ScrollArea>
  );
}
