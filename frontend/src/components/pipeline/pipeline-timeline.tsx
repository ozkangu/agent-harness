"use client";

import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { PHASE_LABELS, PHASE_ORDER, type PipelinePhase, type Pipeline } from "@/types";
import { cn } from "@/lib/utils";

interface PipelineTimelineProps {
  pipeline: Pipeline;
}

function timeDiff(a: string, b: string): string {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return "";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function PipelineTimeline({ pipeline }: PipelineTimelineProps) {
  const currentIdx = PHASE_ORDER.indexOf(pipeline.phase);
  const displayPhases = PHASE_ORDER.filter((p) => !p.startsWith("awaiting"));
  const totalElapsed = timeDiff(pipeline.created_at, pipeline.updated_at);

  return (
    <Card className="p-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Timeline
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Total: {totalElapsed}</span>
        </div>
      </div>

      <div className="relative">
        {/* Horizontal track */}
        <div className="flex items-center">
          {displayPhases.map((phase, idx) => {
            const phaseIdx = PHASE_ORDER.indexOf(phase);
            const isDone = phaseIdx < currentIdx || pipeline.phase === "done";
            const isCurrent = phase === pipeline.phase;
            const isFailed = pipeline.phase === "failed" && isCurrent;
            const isFuture = !isDone && !isCurrent;

            return (
              <div key={phase} className="flex items-center flex-1 min-w-0">
                {/* Node */}
                <div className="flex flex-col items-center relative">
                  <div
                    className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center border-2 shrink-0 z-10 bg-card",
                      isDone && "border-emerald-500 text-emerald-500",
                      isCurrent && !isFailed && "border-blue-500 text-blue-500",
                      isFailed && "border-red-500 text-red-500",
                      isFuture && "border-border text-muted-foreground/30"
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : isCurrent ? (
                      isFailed ? (
                        <AlertCircle className="h-3 w-3" />
                      ) : (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )
                    ) : (
                      <Circle className="h-2.5 w-2.5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[9px] mt-1 whitespace-nowrap absolute top-7",
                      isDone && "text-emerald-500",
                      isCurrent && !isFailed && "text-blue-500 font-medium",
                      isFailed && "text-red-500 font-medium",
                      isFuture && "text-muted-foreground/40"
                    )}
                  >
                    {PHASE_LABELS[phase]}
                  </span>
                </div>

                {/* Connector line */}
                {idx < displayPhases.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-1",
                      isDone ? "bg-emerald-500" : "bg-border"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase Duration Bars */}
      {(() => {
        const totalMs = new Date(pipeline.updated_at).getTime() - new Date(pipeline.created_at).getTime();
        if (totalMs <= 0 || currentIdx <= 0) return null;

        // Estimate proportional duration per completed phase
        const completedPhases = displayPhases.filter((p) => {
          const idx = PHASE_ORDER.indexOf(p);
          return idx < currentIdx;
        });
        const activePhase = displayPhases.find((p) => p === pipeline.phase);

        if (completedPhases.length === 0 && !activePhase) return null;

        const totalParts = completedPhases.length + (activePhase ? 1 : 0);
        const perPhasePct = 100 / Math.max(totalParts, 1);
        const perPhaseMs = totalMs / Math.max(totalParts, 1);

        const phaseBarColors: Record<string, string> = {
          repo_context: "bg-blue-500",
          clarification: "bg-cyan-500",
          analysis_document: "bg-amber-500",
          ba_analysis: "bg-violet-500",
          coding: "bg-indigo-500",
          code_review: "bg-pink-500",
          test_validation: "bg-emerald-500",
          done: "bg-emerald-500",
          failed: "bg-red-500",
        };

        return (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">Phase Durations</span>
              <span className="text-[9px] text-muted-foreground">{totalElapsed} total</span>
            </div>
            <div className="flex rounded-full h-3 overflow-hidden">
              {completedPhases.map((phase) => (
                <div
                  key={phase}
                  className={cn(
                    "transition-all duration-500 relative group/bar",
                    phaseBarColors[phase] || "bg-muted"
                  )}
                  style={{ width: `${perPhasePct}%` }}
                  title={`${PHASE_LABELS[phase]}: ~${timeDiff("2000-01-01T00:00:00Z", new Date(new Date("2000-01-01T00:00:00Z").getTime() + perPhaseMs).toISOString())}`}
                />
              ))}
              {activePhase && (
                <div
                  className={cn(
                    "transition-all duration-500 relative",
                    pipeline.phase === "failed" ? "bg-red-500" : "bg-blue-500 animate-pulse"
                  )}
                  style={{ width: `${perPhasePct}%` }}
                  title={`${PHASE_LABELS[pipeline.phase]} (current)`}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
              {[...completedPhases, ...(activePhase ? [activePhase] : [])].map((phase) => (
                <div key={phase} className="flex items-center gap-1">
                  <div className={cn("h-1.5 w-1.5 rounded-full", phaseBarColors[phase] || "bg-muted")} />
                  <span className="text-[9px] text-muted-foreground">{PHASE_LABELS[phase as PipelinePhase]}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Timestamps */}
      <div className="flex items-center justify-between mt-4 text-[9px] text-muted-foreground">
        <span>{new Date(pipeline.created_at).toLocaleString()}</span>
        <span>{new Date(pipeline.updated_at).toLocaleString()}</span>
      </div>
    </Card>
  );
}
