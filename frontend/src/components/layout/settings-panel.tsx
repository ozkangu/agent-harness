"use client";

import {
  Zap,
  Database,
  Shield,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
  Keyboard,
  Palette,
  Moon,
  Sun,
  Globe,
  Download,
  Upload,
  FileJson,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/stores/app-store";
import { QualityPanel } from "@/components/layout/quality-panel";
import { ApiReference } from "@/components/layout/api-reference";
import { HealthMonitor } from "@/components/layout/health-monitor";
import { qualityApi, contextApi, entropyApi } from "@/lib/api";

export function SettingsPanel() {
  const {
    backendConfig,
    autoApprove,
    setAutoApprove,
    setBackend,
    stats,
    theme,
    toggleTheme,
    accentColor,
    setAccentColor,
    addToast,
    sidebarCollapsed,
  } = useAppStore();

  const [qualityStatus, setQualityStatus] = useState<Record<string, unknown> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    qualityApi.status().then(setQualityStatus).catch(() => {});
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      await entropyApi.scan();
    } finally {
      setScanning(false);
    }
  };

  const handleRefreshContext = async () => {
    setRefreshing(true);
    try {
      await contextApi.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Configure your Maestro Platform instance
        </p>
      </div>

      {/* Backend Configuration */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-violet-400" />
          <h3 className="font-semibold">AI Backend</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Backend Engine</Label>
              <p className="text-xs text-muted-foreground">
                Select which AI engine powers your agents
              </p>
            </div>
            {backendConfig && (
              <Select
                value={backendConfig.backend}
                onValueChange={(v) => v && setBackend(v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {backendConfig.backends.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b.charAt(0).toUpperCase() + b.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Approve</Label>
              <p className="text-xs text-muted-foreground">
                Automatically approve pipeline phases (except story review)
              </p>
            </div>
            <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
          </div>
        </div>
      </Card>

      {/* Quality Runs */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-emerald-400" />
          <h3 className="font-semibold">Quality Gate Runs</h3>
        </div>
        <QualityPanel />
      </Card>

      {/* Context & Entropy */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-5 w-5 text-blue-400" />
          <h3 className="font-semibold">Context & Health</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Refresh Context Cache</p>
              <p className="text-xs text-muted-foreground">
                Re-scan AGENTS.md files and repo structure
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshContext}
              disabled={refreshing}
              className="gap-1.5"
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Entropy Scan</p>
              <p className="text-xs text-muted-foreground">
                Analyze codebase health (TODOs, dead code, staleness)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleScan}
              disabled={scanning}
              className="gap-1.5"
            >
              {scanning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              Scan
            </Button>
          </div>
        </div>
      </Card>

      {/* Appearance */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-5 w-5 text-pink-400" />
          <h3 className="font-semibold">Appearance</h3>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === "dark" ? (
              <Moon className="h-5 w-5 text-indigo-400" />
            ) : (
              <Sun className="h-5 w-5 text-amber-400" />
            )}
            <div>
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">
                {theme === "dark" ? "Dark mode" : "Light mode"} is active
              </p>
            </div>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
        </div>

        <Separator className="my-4" />

        <div>
          <Label className="text-sm">Accent Color</Label>
          <p className="text-xs text-muted-foreground mb-3">
            Choose the primary color used throughout the interface
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { name: "violet", color: "bg-violet-500" },
              { name: "blue", color: "bg-blue-500" },
              { name: "cyan", color: "bg-cyan-500" },
              { name: "emerald", color: "bg-emerald-500" },
              { name: "amber", color: "bg-amber-500" },
              { name: "rose", color: "bg-rose-500" },
              { name: "pink", color: "bg-pink-500" },
              { name: "indigo", color: "bg-indigo-500" },
            ].map((option) => (
              <button
                key={option.name}
                onClick={() => setAccentColor(option.name)}
                className={`h-8 w-8 rounded-full ${option.color} transition-all flex items-center justify-center ${
                  accentColor === option.name
                    ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110"
                    : "hover:scale-110 opacity-70 hover:opacity-100"
                }`}
                title={option.name}
              >
                {accentColor === option.name && (
                  <CheckCircle2 className="h-4 w-4 text-white" />
                )}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Keyboard className="h-5 w-5 text-cyan-400" />
          <h3 className="font-semibold">Keyboard Shortcuts</h3>
        </div>
        <div className="space-y-2">
          {[
            { keys: ["Cmd", "K"], desc: "Open command palette" },
            { keys: ["Cmd", "B"], desc: "Toggle sidebar" },
            { keys: ["1"], desc: "Dashboard" },
            { keys: ["2"], desc: "Kanban Board" },
            { keys: ["3"], desc: "Chat" },
            { keys: ["4"], desc: "Pipeline" },
            { keys: ["5"], desc: "Settings" },
          ].map((shortcut) => (
            <div
              key={shortcut.desc}
              className="flex items-center justify-between py-1.5"
            >
              <span className="text-sm text-muted-foreground">{shortcut.desc}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] font-mono font-medium"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Stats */}
      {stats && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Dashboard Stats</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total", value: stats.total, color: "text-foreground" },
              { label: "Active", value: stats.working, color: "text-blue-500" },
              { label: "Done", value: stats.done, color: "text-emerald-500" },
              { label: "To Do", value: stats.todo, color: "text-slate-400" },
              { label: "Review", value: stats.review, color: "text-amber-500" },
              { label: "Failed", value: stats.failed, color: "text-red-500" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="text-center p-3 rounded-lg bg-muted/30 border border-border"
              >
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* System Health */}
      <HealthMonitor />

      {/* API Reference */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-5 w-5 text-indigo-400" />
          <h3 className="font-semibold">API Reference</h3>
        </div>
        <ApiReference />
      </Card>

      {/* Export / Import Settings */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileJson className="h-5 w-5 text-orange-400" />
          <h3 className="font-semibold">Export / Import Settings</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Export Settings</p>
              <p className="text-xs text-muted-foreground">
                Download current configuration as JSON
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                const settings = {
                  theme,
                  accentColor,
                  autoApprove,
                  sidebarCollapsed,
                  backend: backendConfig?.backend,
                  exportedAt: new Date().toISOString(),
                  version: "0.4.0",
                };
                const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `maestro-settings-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                addToast({ type: "success", title: "Settings exported", description: "Configuration saved to file" });
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Import Settings</p>
              <p className="text-xs text-muted-foreground">
                Restore configuration from a JSON file
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".json";
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const settings = JSON.parse(text);
                    if (settings.theme) toggleTheme();
                    if (settings.accentColor) setAccentColor(settings.accentColor);
                    if (typeof settings.autoApprove === "boolean") setAutoApprove(settings.autoApprove);
                    if (settings.backend) setBackend(settings.backend);
                    addToast({ type: "success", title: "Settings imported", description: "Configuration restored from file" });
                  } catch {
                    addToast({ type: "error", title: "Import failed", description: "Invalid settings file" });
                  }
                };
                input.click();
              }}
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
          </div>
        </div>
      </Card>

      {/* About */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold">Maestro Platform</h3>
            <p className="text-xs text-muted-foreground">v0.4.0</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Autonomous AI-powered SDLC orchestrator. Analyzes requirements,
          generates user stories, writes code, reviews, and tests -
          all with human-in-the-loop approvals.
        </p>
      </Card>
    </div>
  );
}
