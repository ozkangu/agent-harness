"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Shield,
  Loader2,
  RefreshCw,
  FileCode,
  TestTube,
  AlertTriangle,
  Type,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { qualityApi } from "@/lib/api";
import type { QualityRun } from "@/types";
import { cn } from "@/lib/utils";

function QualityBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs",
        ok
          ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-500"
          : "bg-red-500/5 border-red-500/20 text-red-500"
      )}
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <XCircle className="h-3.5 w-3.5" />
      )}
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function QualityPanel() {
  const [runs, setRuns] = useState<QualityRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await qualityApi.runs();
      setRuns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch quality runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500 mb-3" />
        <p className="text-sm text-muted-foreground mb-3">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchRuns} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium mb-1">No Quality Runs</p>
        <p className="text-xs text-muted-foreground">
          Quality checks will appear here when issues are processed.
        </p>
      </div>
    );
  }

  const passRate = runs.length > 0
    ? Math.round((runs.filter((r) => r.lint_ok && r.test_ok && r.type_ok && r.structural_ok).length / runs.length) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-4 gap-2">
            <QualitySummary
              label="Lint"
              icon={FileCode}
              count={runs.filter((r) => r.lint_ok).length}
              total={runs.length}
            />
            <QualitySummary
              label="Tests"
              icon={TestTube}
              count={runs.filter((r) => r.test_ok).length}
              total={runs.length}
            />
            <QualitySummary
              label="Types"
              icon={Type}
              count={runs.filter((r) => r.type_ok).length}
              total={runs.length}
            />
            <QualitySummary
              label="Structure"
              icon={Shield}
              count={runs.filter((r) => r.structural_ok).length}
              total={runs.length}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              passRate >= 80
                ? "border-emerald-500/30 text-emerald-500"
                : passRate >= 50
                  ? "border-amber-500/30 text-amber-500"
                  : "border-red-500/30 text-red-500"
            )}
          >
            {passRate}% pass rate
          </Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchRuns}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Run list */}
      <ScrollArea className="h-[400px]">
        <div className="space-y-2">
          {runs.map((run) => (
            <Card key={run.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {run.issue_key}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                </div>
                {run.lint_ok && run.test_ok && run.type_ok && run.structural_ok ? (
                  <Badge className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    All Passed
                  </Badge>
                ) : (
                  <Badge className="text-[10px] bg-red-500/10 text-red-500 border-red-500/20">
                    Failed
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <QualityBadge ok={run.lint_ok} label="Lint" />
                <QualityBadge ok={run.test_ok} label="Tests" />
                <QualityBadge ok={run.type_ok} label="Types" />
                <QualityBadge ok={run.structural_ok} label="Structural" />
              </div>
              {run.details && (
                <p className="text-[10px] text-muted-foreground mt-2 font-mono line-clamp-2">
                  {run.details}
                </p>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function QualitySummary({
  label,
  icon: Icon,
  count,
  total,
}: {
  label: string;
  icon: React.ElementType;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="text-center">
      <Icon className={cn(
        "h-4 w-4 mx-auto mb-0.5",
        pct >= 80 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-red-500"
      )} />
      <p className="text-[10px] font-medium">{count}/{total}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
