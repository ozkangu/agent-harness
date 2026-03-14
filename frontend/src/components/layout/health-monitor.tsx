"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Wifi,
  WifiOff,
  Database,
  Cpu,
  Server,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { healthApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface HealthStatus {
  status: string;
  version: string;
  services: Record<string, boolean>;
}

const SERVICE_ICONS: Record<string, React.ElementType> = {
  database: Database,
  backend: Cpu,
  websocket: Wifi,
};

export function HealthMonitor() {
  const { wsStatus } = useAppStore();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);

  const checkHealth = useCallback(async () => {
    setLoading(true);
    const start = performance.now();
    try {
      const data = await healthApi.check();
      setHealth(data);
      setResponseTime(Math.round(performance.now() - start));
      setLastChecked(new Date());
    } catch {
      setHealth(null);
      setResponseTime(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Every 30s
    return () => clearInterval(interval);
  }, [checkHealth]);

  const isHealthy = health?.status === "ok" || health?.status === "healthy";
  const serviceEntries = health?.services ? Object.entries(health.services) : [];
  const healthyServices = serviceEntries.filter(([, ok]) => ok).length;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-cyan-400" />
          <h3 className="font-semibold">System Health</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={checkHealth}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Refresh
        </Button>
      </div>

      {/* Overall status */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border mb-4">
        <div
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            isHealthy ? "bg-emerald-500/10" : "bg-red-500/10"
          )}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : isHealthy ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">
            {loading ? "Checking..." : isHealthy ? "All Systems Operational" : "Service Degraded"}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            {health?.version && (
              <span className="text-[10px] text-muted-foreground">
                v{health.version}
              </span>
            )}
            {responseTime !== null && (
              <span className="text-[10px] text-muted-foreground">
                {responseTime}ms latency
              </span>
            )}
            {lastChecked && (
              <span className="text-[10px] text-muted-foreground">
                Checked {lastChecked.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            isHealthy
              ? "border-emerald-500 text-emerald-500"
              : "border-red-500 text-red-500"
          )}
        >
          {isHealthy ? "Healthy" : "Unhealthy"}
        </Badge>
      </div>

      {/* Service statuses */}
      <div className="space-y-2">
        {/* WebSocket status (from client) */}
        <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/30">
          <div className="flex items-center gap-2">
            {wsStatus === "connected" ? (
              <Wifi className="h-4 w-4 text-emerald-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm">WebSocket</span>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              wsStatus === "connected"
                ? "border-emerald-500 text-emerald-500"
                : wsStatus === "connecting"
                  ? "border-amber-500 text-amber-500"
                  : "border-red-500 text-red-500"
            )}
          >
            {wsStatus}
          </Badge>
        </div>

        {/* Backend services */}
        {serviceEntries.map(([name, ok]) => {
          const Icon = SERVICE_ICONS[name] || Server;
          return (
            <div
              key={name}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/30"
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    "h-4 w-4",
                    ok ? "text-emerald-500" : "text-red-500"
                  )}
                />
                <span className="text-sm capitalize">{name}</span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  ok
                    ? "border-emerald-500 text-emerald-500"
                    : "border-red-500 text-red-500"
                )}
              >
                {ok ? "Online" : "Offline"}
              </Badge>
            </div>
          );
        })}

        {serviceEntries.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No service information available
          </p>
        )}
      </div>

      {/* Summary bar */}
      {serviceEntries.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {healthyServices}/{serviceEntries.length} services online
            </span>
            <div className="flex gap-0.5">
              {serviceEntries.map(([name, ok]) => (
                <div
                  key={name}
                  className={cn(
                    "h-2 w-6 rounded-full",
                    ok ? "bg-emerald-500" : "bg-red-500"
                  )}
                  title={`${name}: ${ok ? "online" : "offline"}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
