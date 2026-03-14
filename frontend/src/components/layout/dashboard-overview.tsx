"use client";

import { useState, useEffect, useRef } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Code2,
  GitBranch,
  Loader2,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Wifi,
  Server,
  Shield,
  Cpu,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/stores/app-store";
import { useTranslation } from "@/hooks/use-translation";
import { PHASE_LABELS } from "@/types";
import { ActivityFeed } from "@/components/layout/activity-feed";
import { cn } from "@/lib/utils";

function Sparkline({ data, color = "stroke-blue-500", fillColor = "fill-blue-500/10" }: { data: number[]; color?: string; fillColor?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const padding = 2;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * (w - padding * 2),
    y: padding + (1 - (v - min) / range) * (h - padding * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={areaPath} className={fillColor} />
      <path d={linePath} className={cn(color, "fill-none")} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2" className={color.replace("stroke-", "fill-")} />
    </svg>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  trend,
  progress,
  sparkData,
  sparkColor,
  sparkFill,
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  trend?: string;
  progress?: number;
  sparkData?: number[];
  sparkColor?: string;
  sparkFill?: string;
}) {
  return (
    <Card className="p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {title}
          </p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div
            className={cn(
              "h-11 w-11 rounded-xl flex items-center justify-center",
              color
            )}
          >
            <Icon className="h-5 w-5 text-white" />
          </div>
          {sparkData && sparkData.length >= 2 && (
            <Sparkline data={sparkData} color={sparkColor} fillColor={sparkFill} />
          )}
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-3">
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all duration-700",
                progress >= 75 ? "bg-emerald-500" : progress >= 50 ? "bg-amber-500" : "bg-blue-500"
              )}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
      {trend && (
        <div className="flex items-center gap-1 mt-3 text-xs text-emerald-500">
          <TrendingUp className="h-3 w-3" />
          {trend}
        </div>
      )}
    </Card>
  );
}

function QuickAction({
  title,
  description,
  icon: Icon,
  onClick,
  color,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-accent transition-all text-left group w-full"
    >
      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          color
        )}
      >
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-60 mt-2" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-11 w-11 rounded-xl" />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardOverview() {
  const {
    stats,
    pipelines,
    issues,
    backendConfig,
    loading,
    setActivePanel,
    createConversation,
    fetchAll,
    wsStatus,
    conversations,
  } = useAppStore();

  const { t } = useTranslation();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (autoRefresh) {
      setCountdown(30);
      intervalRef.current = setInterval(() => {
        fetchAll();
        setCountdown(30);
      }, 30000);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => (c > 0 ? c - 1 : 30));
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown(30);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, fetchAll]);

  const activePipelines = pipelines.filter(
    (p) => p.phase !== "done" && p.phase !== "failed"
  );
  const completedPipelines = pipelines.filter((p) => p.phase === "done");
  const activeIssues = issues.filter((i) => i.status === "working");
  const completionRate =
    stats && stats.total > 0
      ? Math.round((stats.done / stats.total) * 100)
      : 0;

  // Generate sparkline data from issues timeline (group by day)
  const issueSparkData = (() => {
    if (issues.length === 0) return undefined;
    const now = Date.now();
    const dayMs = 86400000;
    const days = Array.from({ length: 7 }, (_, i) => {
      const dayStart = now - (6 - i) * dayMs;
      return issues.filter(
        (issue) => new Date(issue.created_at).getTime() <= dayStart
      ).length;
    });
    return days;
  })();

  const pipelineSparkData = (() => {
    if (pipelines.length === 0) return undefined;
    const now = Date.now();
    const dayMs = 86400000;
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = now - (6 - i) * dayMs;
      return pipelines.filter(
        (p) => new Date(p.created_at).getTime() <= dayStart
      ).length;
    });
  })();

  const completionSparkData = (() => {
    if (issues.length === 0) return undefined;
    const now = Date.now();
    const dayMs = 86400000;
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = now - (6 - i) * dayMs;
      const total = issues.filter(
        (issue) => new Date(issue.created_at).getTime() <= dayStart
      ).length;
      const done = issues.filter(
        (issue) =>
          issue.status === "done" &&
          new Date(issue.updated_at).getTime() <= dayStart
      ).length;
      return total > 0 ? Math.round((done / total) * 100) : 0;
    });
  })();

  const agentSparkData = (() => {
    if (issues.length === 0) return undefined;
    const now = Date.now();
    const dayMs = 86400000;
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = now - (6 - i) * dayMs;
      return issues.filter(
        (issue) =>
          issue.status === "working" &&
          new Date(issue.updated_at).getTime() <= dayStart
      ).length;
    });
  })();

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 overflow-y-auto h-full">
      {/* Hero Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-powered development at your fingertips
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAutoRefresh(!autoRefresh);
            }}
            className={cn(
              "gap-1.5 text-xs",
              autoRefresh && "border-emerald-500/50 text-emerald-500"
            )}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                autoRefresh && "animate-spin"
              )}
              style={autoRefresh ? { animationDuration: "3s" } : undefined}
            />
            {autoRefresh ? `${countdown}s` : "Auto"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActivePanel("board")}
            className="gap-1.5"
          >
            <BarChart3 className="h-4 w-4" />
            Board
          </Button>
          <Button
            size="sm"
            onClick={() => setActivePanel("pipeline")}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New Pipeline
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Issues"
          value={stats?.total || 0}
          subtitle={`${stats?.working || 0} in progress`}
          icon={Target}
          color="bg-blue-500"
          sparkData={issueSparkData}
          sparkColor="stroke-blue-400"
          sparkFill="fill-blue-500/10"
        />
        <StatCard
          title="Active Agents"
          value={activeIssues.length}
          subtitle={`${backendConfig?.backend || "claude"} engine`}
          icon={Bot}
          color="bg-violet-500"
          sparkData={agentSparkData}
          sparkColor="stroke-violet-400"
          sparkFill="fill-violet-500/10"
        />
        <StatCard
          title="Completion Rate"
          value={`${completionRate}%`}
          subtitle={`${stats?.done || 0} completed`}
          icon={CheckCircle2}
          color="bg-emerald-500"
          progress={completionRate}
          trend={completionRate > 50 ? "On track" : undefined}
          sparkData={completionSparkData}
          sparkColor="stroke-emerald-400"
          sparkFill="fill-emerald-500/10"
        />
        <StatCard
          title="Pipelines"
          value={pipelines.length}
          subtitle={`${activePipelines.length} active`}
          icon={GitBranch}
          color="bg-amber-500"
          sparkData={pipelineSparkData}
          sparkColor="stroke-amber-400"
          sparkFill="fill-amber-500/10"
        />
      </div>

      {/* Today's Summary */}
      {(() => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const ts = todayStart.getTime();
        const createdToday = issues.filter((i) => new Date(i.created_at).getTime() >= ts).length;
        const completedToday = issues.filter((i) => i.status === "done" && new Date(i.updated_at).getTime() >= ts).length;
        const pipelinesStarted = pipelines.filter((p) => new Date(p.created_at).getTime() >= ts).length;
        const failedToday = issues.filter((i) => i.status === "failed" && new Date(i.updated_at).getTime() >= ts).length;

        if (createdToday === 0 && completedToday === 0 && pipelinesStarted === 0 && failedToday === 0) return null;

        return (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">Today:</span>
            {createdToday > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 px-2 py-0.5 border-blue-500/30 text-blue-400">
                <Plus className="h-3 w-3" /> {createdToday} created
              </Badge>
            )}
            {completedToday > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 px-2 py-0.5 border-emerald-500/30 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> {completedToday} completed
              </Badge>
            )}
            {pipelinesStarted > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 px-2 py-0.5 border-violet-500/30 text-violet-400">
                <Sparkles className="h-3 w-3" /> {pipelinesStarted} pipeline{pipelinesStarted > 1 ? "s" : ""}
              </Badge>
            )}
            {failedToday > 0 && (
              <Badge variant="outline" className="text-[11px] gap-1 px-2 py-0.5 border-red-500/30 text-red-400">
                <AlertCircle className="h-3 w-3" /> {failedToday} failed
              </Badge>
            )}
          </div>
        );
      })()}

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Issue Status Distribution */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Issue Distribution</h3>
          {stats && stats.total > 0 ? (
            <div className="space-y-3">
              {([
                { label: "To Do", value: stats.todo, color: "bg-slate-500" },
                { label: "Working", value: stats.working, color: "bg-blue-500" },
                { label: "Review", value: stats.review, color: "bg-amber-500" },
                { label: "Done", value: stats.done, color: "bg-emerald-500" },
                { label: "Failed", value: stats.failed, color: "bg-red-500" },
              ] as const).map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-14 text-right shrink-0">
                    {row.label}
                  </span>
                  <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2",
                        row.color
                      )}
                      style={{
                        width: `${Math.max(row.value > 0 ? 8 : 0, (row.value / stats.total) * 100)}%`,
                      }}
                    >
                      {row.value > 0 && (
                        <span className="text-[10px] font-bold text-white">
                          {row.value}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {/* Stacked bar summary */}
              <div className="flex rounded-full h-3 overflow-hidden mt-2">
                {([
                  { value: stats.todo, color: "bg-slate-500" },
                  { value: stats.working, color: "bg-blue-500" },
                  { value: stats.review, color: "bg-amber-500" },
                  { value: stats.done, color: "bg-emerald-500" },
                  { value: stats.failed, color: "bg-red-500" },
                ] as const).map((seg, i) =>
                  seg.value > 0 ? (
                    <div
                      key={i}
                      className={cn("transition-all duration-700", seg.color)}
                      style={{ width: `${(seg.value / stats.total) * 100}%` }}
                    />
                  ) : null
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No issues to display
            </p>
          )}
        </Card>

        {/* Pipeline Overview */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Pipeline Status</h3>
          {pipelines.length > 0 ? (
            <div className="space-y-3">
              {(() => {
                const phases = {
                  active: activePipelines.filter((p) => !p.phase.startsWith("awaiting")).length,
                  awaiting: activePipelines.filter((p) => p.phase.startsWith("awaiting")).length,
                  completed: completedPipelines.length,
                  failed: pipelines.filter((p) => p.phase === "failed").length,
                };
                const total = pipelines.length;
                return (
                  <>
                    {([
                      { label: "Active", value: phases.active, color: "bg-blue-500", textColor: "text-blue-500" },
                      { label: "Awaiting", value: phases.awaiting, color: "bg-amber-500", textColor: "text-amber-500" },
                      { label: "Completed", value: phases.completed, color: "bg-emerald-500", textColor: "text-emerald-500" },
                      { label: "Failed", value: phases.failed, color: "bg-red-500", textColor: "text-red-500" },
                    ] as const).map((row) => (
                      <div key={row.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2.5 w-2.5 rounded-full", row.color)} />
                          <span className="text-xs">{row.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm font-bold", row.textColor)}>
                            {row.value}
                          </span>
                          <span className="text-[10px] text-muted-foreground w-10 text-right">
                            {total > 0 ? Math.round((row.value / total) * 100) : 0}%
                          </span>
                        </div>
                      </div>
                    ))}
                    {/* Donut-style ring */}
                    <div className="flex items-center justify-center pt-2">
                      <div className="relative h-24 w-24">
                        <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                          {(() => {
                            const segments = [
                              { value: phases.active, color: "stroke-blue-500" },
                              { value: phases.awaiting, color: "stroke-amber-500" },
                              { value: phases.completed, color: "stroke-emerald-500" },
                              { value: phases.failed, color: "stroke-red-500" },
                            ];
                            let offset = 0;
                            return segments.map((seg, i) => {
                              const pct = total > 0 ? (seg.value / total) * 100 : 0;
                              const el = pct > 0 ? (
                                <circle
                                  key={i}
                                  cx="18"
                                  cy="18"
                                  r="15.9155"
                                  fill="none"
                                  className={seg.color}
                                  strokeWidth="3"
                                  strokeDasharray={`${pct} ${100 - pct}`}
                                  strokeDashoffset={`${-offset}`}
                                  strokeLinecap="round"
                                />
                              ) : null;
                              offset += pct;
                              return el;
                            });
                          })()}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <p className="text-lg font-bold">{total}</p>
                            <p className="text-[10px] text-muted-foreground">total</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No pipelines to display
            </p>
          )}
        </Card>
      </div>

      {/* Priority Breakdown */}
      {issues.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Priority Breakdown</h3>
          <div className="flex items-center gap-4">
            {(() => {
              const counts = {
                critical: issues.filter((i) => i.priority === "critical").length,
                high: issues.filter((i) => i.priority === "high").length,
                medium: issues.filter((i) => i.priority === "medium").length,
                low: issues.filter((i) => i.priority === "low").length,
              };
              const total = issues.length;
              const items = [
                { label: "Critical", value: counts.critical, color: "bg-red-500", textColor: "text-red-500" },
                { label: "High", value: counts.high, color: "bg-orange-500", textColor: "text-orange-500" },
                { label: "Medium", value: counts.medium, color: "bg-yellow-500", textColor: "text-yellow-500" },
                { label: "Low", value: counts.low, color: "bg-green-500", textColor: "text-green-500" },
              ];
              return (
                <>
                  <div className="flex-1 space-y-2">
                    {items.map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 w-16 shrink-0">
                          <span className={cn("h-2 w-2 rounded-full", item.color)} />
                          <span className="text-[11px] text-muted-foreground">{item.label}</span>
                        </div>
                        <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-700 flex items-center justify-end pr-1.5", item.color)}
                            style={{ width: `${Math.max(item.value > 0 ? 8 : 0, (item.value / total) * 100)}%` }}
                          >
                            {item.value > 0 && (
                              <span className="text-[9px] font-bold text-white">{item.value}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">
                          {Math.round((item.value / total) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    {items.map((item) => (
                      <div key={item.label} className="text-center">
                        <span className={cn("text-lg font-bold", item.textColor)}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </Card>
      )}

      {/* Velocity Chart */}
      {issues.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Issue Velocity (Last 7 Days)</h3>
          {(() => {
            const now = Date.now();
            const dayMs = 86400000;
            const days = Array.from({ length: 7 }, (_, i) => {
              const dayStart = now - (6 - i) * dayMs;
              const dayEnd = dayStart + dayMs;
              const completed = issues.filter(
                (issue) =>
                  issue.status === "done" &&
                  new Date(issue.updated_at).getTime() >= dayStart &&
                  new Date(issue.updated_at).getTime() < dayEnd
              ).length;
              const created = issues.filter(
                (issue) =>
                  new Date(issue.created_at).getTime() >= dayStart &&
                  new Date(issue.created_at).getTime() < dayEnd
              ).length;
              const label = new Date(dayStart).toLocaleDateString(undefined, { weekday: "short" });
              return { completed, created, label };
            });
            const maxVal = Math.max(...days.map((d) => Math.max(d.completed, d.created)), 1);
            const barH = 80;

            return (
              <div className="flex items-end gap-2">
                {days.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="flex items-end gap-0.5 w-full" style={{ height: `${barH}px` }}>
                      <div
                        className="flex-1 bg-blue-500/30 rounded-t transition-all duration-500 relative group"
                        style={{ height: `${Math.max((day.created / maxVal) * barH, day.created > 0 ? 4 : 0)}px` }}
                        title={`${day.created} created`}
                      >
                        {day.created > 0 && (
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-blue-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            {day.created}
                          </span>
                        )}
                      </div>
                      <div
                        className="flex-1 bg-emerald-500 rounded-t transition-all duration-500 relative group"
                        style={{ height: `${Math.max((day.completed / maxVal) * barH, day.completed > 0 ? 4 : 0)}px` }}
                        title={`${day.completed} completed`}
                      >
                        {day.completed > 0 && (
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-emerald-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            {day.completed}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground">{day.label}</span>
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-blue-500/30" />
              <span className="text-[10px] text-muted-foreground">Created</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              <span className="text-[10px] text-muted-foreground">Completed</span>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
            {t("dashboard.quickActions")}
          </h3>
          <div className="space-y-2">
            <QuickAction
              title="Start Pipeline"
              description="AI-powered end-to-end development"
              icon={Sparkles}
              onClick={() => setActivePanel("pipeline")}
              color="bg-gradient-to-br from-violet-500 to-indigo-600"
            />
            <QuickAction
              title="Chat with AI"
              description="Ask questions, get code, create issues"
              icon={Code2}
              onClick={() => {
                createConversation();
                setActivePanel("chat");
              }}
              color="bg-gradient-to-br from-blue-500 to-cyan-500"
            />
            <QuickAction
              title="View Board"
              description="Kanban board with all your issues"
              icon={BarChart3}
              onClick={() => setActivePanel("board")}
              color="bg-gradient-to-br from-emerald-500 to-green-500"
            />
            <QuickAction
              title="Settings"
              description="Configure backend, quality gates"
              icon={Zap}
              onClick={() => setActivePanel("settings")}
              color="bg-gradient-to-br from-amber-500 to-orange-500"
            />
          </div>
        </div>

        {/* Active Pipelines */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
            {t("dashboard.activePipelines")}
          </h3>
          {activePipelines.length === 0 ? (
            <Card className="p-6 text-center">
              <GitBranch className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No active pipelines
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setActivePanel("pipeline")}
              >
                Start one
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {activePipelines.slice(0, 5).map((p) => (
                <Card key={p.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {p.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {PHASE_LABELS[p.phase]}
                        </Badge>
                        {p.phase.startsWith("awaiting") && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/20">
                            Action needed
                          </Badge>
                        )}
                      </div>
                    </div>
                    {p.phase === "coding" ? (
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                    ) : p.phase.startsWith("awaiting") ? (
                      <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                    ) : (
                      <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recent Issues */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
            Recent Issues
          </h3>
          {issues.length === 0 ? (
            <Card className="p-6 text-center">
              <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No issues yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setActivePanel("board")}
              >
                Create one
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              {issues.slice(0, 6).map((issue) => (
                <Card key={issue.key} className="p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        issue.status === "done" && "bg-emerald-500",
                        issue.status === "working" && "bg-blue-500",
                        issue.status === "todo" && "bg-slate-500",
                        issue.status === "review" && "bg-amber-500",
                        issue.status === "failed" && "bg-red-500"
                      )}
                    />
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {issue.key}
                    </span>
                    <p className="text-sm truncate flex-1">{issue.title}</p>
                    {issue.status === "working" && (
                      <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />
                    )}
                    {issue.status === "failed" && (
                      <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
            {t("dashboard.activityFeed")}
          </h3>
          <Card className="p-3">
            <ActivityFeed />
          </Card>
        </div>
      </div>

      {/* System Health Monitor */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">System Health</h3>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              wsStatus === "connected"
                ? "border-emerald-500 text-emerald-500"
                : wsStatus === "connecting"
                  ? "border-amber-500 text-amber-500"
                  : "border-red-500 text-red-500"
            )}
          >
            {wsStatus === "connected" ? "All Systems Operational" : wsStatus === "connecting" ? "Connecting..." : "Disconnected"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "WebSocket",
              status: wsStatus === "connected" ? "healthy" : wsStatus === "connecting" ? "degraded" : "down",
              icon: Wifi,
              detail: wsStatus,
            },
            {
              label: "AI Engine",
              status: backendConfig ? "healthy" : "degraded",
              icon: Cpu,
              detail: backendConfig ? `${backendConfig.backend} / ${backendConfig.model}` : "Loading...",
            },
            {
              label: "API Server",
              status: stats ? "healthy" : "degraded",
              icon: Server,
              detail: stats ? `${stats.total} issues tracked` : "Checking...",
            },
            {
              label: "Data Sync",
              status: issues.length > 0 || pipelines.length > 0 || conversations.length > 0 ? "healthy" : "idle",
              icon: Shield,
              detail: `${issues.length} issues · ${pipelines.length} pipelines`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
            >
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                item.status === "healthy" && "bg-emerald-500/10",
                item.status === "degraded" && "bg-amber-500/10",
                item.status === "down" && "bg-red-500/10",
                item.status === "idle" && "bg-slate-500/10"
              )}>
                <item.icon className={cn(
                  "h-4 w-4",
                  item.status === "healthy" && "text-emerald-500",
                  item.status === "degraded" && "text-amber-500",
                  item.status === "down" && "text-red-500",
                  item.status === "idle" && "text-slate-500"
                )} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    item.status === "healthy" && "bg-emerald-500",
                    item.status === "degraded" && "bg-amber-500 animate-pulse",
                    item.status === "down" && "bg-red-500 animate-pulse",
                    item.status === "idle" && "bg-slate-500"
                  )} />
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {item.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border">
        <p>
          {t("app.version")} &middot; {t("app.description")} &middot;{" "}
          {backendConfig?.backend
            ? `${backendConfig.backend.charAt(0).toUpperCase() + backendConfig.backend.slice(1)} Engine`
            : "Loading..."}
        </p>
      </div>
    </div>
  );
}
