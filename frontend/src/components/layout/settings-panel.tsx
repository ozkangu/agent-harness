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
  Lock,
  Key,
  Plug,
  Users,
  ScrollText,
  Cpu,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
import { useTranslation } from "@/hooks/use-translation";
import { QualityPanel } from "@/components/layout/quality-panel";
import { ApiReference } from "@/components/layout/api-reference";
import { HealthMonitor } from "@/components/layout/health-monitor";
import { SettingsSkeleton } from "@/components/layout/settings-skeleton";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { qualityApi, contextApi, entropyApi } from "@/lib/api";
import { mcpApi, auditApi, secretsApi, policiesApi } from "@/lib/api";
import type { MCPServer, AuditEntry, SecretEntry, SecurityPolicy, PhaseBackendMap } from "@/types";
import { PHASE_LABELS, type PipelinePhase } from "@/types";

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
    loading,
    phaseBackends,
    fetchPhaseBackends,
    setPhaseBackend,
    removePhaseBackend,
    mcpServers,
    fetchMcpServers,
    addMcpServer,
    removeMcpServer,
    toggleMcpServer,
    currentUser,
    authEnabled,
  } = useAppStore();

  if (loading) return <SettingsSkeleton />;

  const { t } = useTranslation();

  const [qualityStatus, setQualityStatus] = useState<Record<string, unknown> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpCommand, setMcpCommand] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretsList, setSecretsList] = useState<SecretEntry[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [policies, setPolicies] = useState<SecurityPolicy[]>([]);

  useEffect(() => {
    qualityApi.status().then(setQualityStatus).catch(() => {});
  }, []);

  useEffect(() => {
    secretsApi.list().then((s) => setSecretsList(s as unknown as SecretEntry[])).catch(() => {});
    auditApi.query({ limit: 50 }).then((a) => setAuditEntries(a as unknown as AuditEntry[])).catch(() => {});
    policiesApi.list().then((p) => setPolicies(p as unknown as SecurityPolicy[])).catch(() => {});
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
        <h2 className="text-2xl font-bold">{t("settings.title")}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {t("settings.subtitle")}
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
              <Label htmlFor="auto-approve-setting">Auto-Approve</Label>
              <p id="auto-approve-desc" className="text-xs text-muted-foreground">
                Automatically approve pipeline phases (except story review)
              </p>
            </div>
            <Switch id="auto-approve-setting" checked={autoApprove} onCheckedChange={setAutoApprove} aria-describedby="auto-approve-desc" />
          </div>
        </div>
      </Card>

      {/* Per-Phase Backend */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="h-5 w-5 text-amber-400" />
          <h3 className="font-semibold">Per-Phase Backend</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Configure different AI backends for each pipeline phase
        </p>
        <div className="space-y-2">
          {phaseBackends && Object.entries(phaseBackends).map(([phase, config]) => (
            <div key={phase} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium w-32 truncate">{PHASE_LABELS[phase as PipelinePhase] || phase}</span>
                {(config as { overridden?: boolean }).overridden && (
                  <Badge variant="outline" className="text-[9px] px-1 border-amber-500 text-amber-500">Override</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {backendConfig && (
                  <Select
                    value={(config as { backend?: string }).backend || "claude"}
                    onValueChange={(v) => v && setPhaseBackend(phase, v)}
                  >
                    <SelectTrigger className="w-28 h-7 text-xs">
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
                {(config as { overridden?: boolean }).overridden && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removePhaseBackend(phase)}
                    title="Reset to default"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* MCP Integrations */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Plug className="h-5 w-5 text-teal-400" />
          <h3 className="font-semibold">MCP Integrations</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Connect to external MCP servers for additional tool capabilities
        </p>

        <div className="space-y-2 mb-4">
          {mcpServers.map((server) => (
            <div key={server.id} className="flex items-center justify-between py-2 px-3 rounded bg-muted/30">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${server.status === "connected" ? "bg-emerald-500" : server.status === "error" ? "bg-red-500" : "bg-amber-500"}`} />
                <div>
                  <span className="text-xs font-medium">{server.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{server.transport}</span>
                </div>
                <Badge variant="outline" className="text-[9px] px-1">{server.tools?.length || 0} tools</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={server.enabled}
                  onCheckedChange={(v) => toggleMcpServer(server.id, v)}
                  className="scale-75"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-red-500"
                  onClick={() => removeMcpServer(server.id)}
                >
                  <AlertTriangle className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          {mcpServers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">No MCP servers configured</p>
          )}
        </div>

        <Separator />
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium">Add MCP Server</p>
          <div className="flex gap-2">
            <Input
              value={mcpName}
              onChange={(e) => setMcpName(e.target.value)}
              placeholder="Server name"
              className="h-8 text-xs"
            />
            <Input
              value={mcpCommand}
              onChange={(e) => setMcpCommand(e.target.value)}
              placeholder="Command (e.g. npx @server/mcp)"
              className="h-8 text-xs flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!mcpName || !mcpCommand}
              onClick={async () => {
                await addMcpServer({ name: mcpName, transport: "stdio", command: mcpCommand });
                setMcpName("");
                setMcpCommand("");
              }}
            >
              Add
            </Button>
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
          <h3 className="font-semibold">{t("settings.appearance")}</h3>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === "dark" ? (
              <Moon className="h-5 w-5 text-indigo-400" />
            ) : (
              <Sun className="h-5 w-5 text-amber-400" />
            )}
            <div>
              <Label>{t("settings.darkMode")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("settings.darkModeDesc")}
              </p>
            </div>
          </div>
          <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} />
        </div>

        <Separator className="my-4" />

        <div>
          <Label className="text-sm">{t("settings.accentColor")}</Label>
          <p className="text-xs text-muted-foreground mb-3">
            {t("settings.accentColorDesc")}
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

        <Separator className="my-4" />

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t("settings.language")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.languageDesc")}
            </p>
          </div>
          <LanguageToggle />
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
                a.download = `cortex-settings-${new Date().toISOString().slice(0, 10)}.json`;
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

      {/* Security Settings (admin only) */}
      {currentUser?.role === "admin" && (
        <>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-5 w-5 text-red-400" />
              <h3 className="font-semibold">Security</h3>
              {authEnabled && <Badge variant="outline" className="text-[9px] text-emerald-500 border-emerald-500">Enabled</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {authEnabled ? "Authentication is enabled. Manage users and API keys." : "Authentication is disabled (CORTEX_AUTH_ENABLED=false)."}
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ScrollText className="h-5 w-5 text-purple-400" />
              <h3 className="font-semibold">Audit Log</h3>
            </div>
            <div className="space-y-1 max-h-60 overflow-auto">
              {auditEntries.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No audit entries</p>
              )}
              {auditEntries.slice(0, 20).map((entry) => (
                <div key={entry.id} className="flex items-center gap-2 py-1 text-[10px]">
                  <span className="text-muted-foreground w-28 shrink-0">{new Date(entry.timestamp).toLocaleString()}</span>
                  <Badge variant="outline" className="text-[9px] px-1">{entry.action}</Badge>
                  <span className="truncate">{entry.details || `${entry.resource_type}/${entry.resource_id}`}</span>
                </div>
              ))}
            </div>
            {auditEntries.length > 0 && (
              <div className="mt-2">
                <a
                  href={auditApi.exportCsv()}
                  download
                  className="text-xs text-blue-500 hover:underline"
                >
                  Export as CSV
                </a>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Key className="h-5 w-5 text-orange-400" />
              <h3 className="font-semibold">Secrets</h3>
            </div>
            <div className="space-y-2 mb-3">
              {secretsList.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No secrets stored</p>
              )}
              {secretsList.map((s) => (
                <div key={s.name} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30">
                  <div>
                    <span className="text-xs font-mono">{s.name}</span>
                    {s.description && <span className="text-[10px] text-muted-foreground ml-2">{s.description}</span>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500"
                    onClick={async () => {
                      await secretsApi.delete(s.name);
                      setSecretsList((prev) => prev.filter((x) => x.name !== s.name));
                    }}
                  >
                    <AlertTriangle className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <Separator />
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium">Add Secret</p>
              <div className="flex gap-2">
                <Input value={secretName} onChange={(e) => setSecretName(e.target.value)} placeholder="Name" className="h-8 text-xs" />
                <Input value={secretValue} onChange={(e) => setSecretValue(e.target.value)} placeholder="Value" type="password" className="h-8 text-xs flex-1" />
                <Button variant="outline" size="sm" disabled={!secretName || !secretValue} onClick={async () => {
                  await secretsApi.set(secretName, secretValue);
                  setSecretsList((prev) => [...prev, { name: secretName, description: "", created_by: "", created_at: "", updated_at: "" }]);
                  setSecretName("");
                  setSecretValue("");
                }}>Add</Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* About */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold">Cortex Platform</h3>
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
