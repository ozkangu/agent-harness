"use client";

import {
  BarChart3,
  Bot,
  Moon,
  Sun,
  Settings,
  Zap,
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  Menu,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { NotificationCenter } from "@/components/layout/notification-center";

export function Header() {
  const {
    activePanel,
    setActivePanel,
    theme,
    toggleTheme,
    sidebarOpen,
    setSidebarOpen,
    stats,
    backendConfig,
    setBackend,
    autoApprove,
    setAutoApprove,
    pipelines,
    issues,
    wsStatus,
  } = useAppStore();

  const awaitingCount = pipelines.filter((p) => p.phase.startsWith("awaiting")).length;
  const failedCount = issues.filter((i) => i.status === "failed").length;

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-lg hidden sm:inline">
            Maestro
          </span>
          <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
            AI Platform
          </Badge>
          <span
            className={cn(
              "h-2 w-2 rounded-full hidden sm:block",
              wsStatus === "connected" && "bg-emerald-500",
              wsStatus === "connecting" && "bg-amber-500 animate-pulse",
              wsStatus === "disconnected" && "bg-red-500"
            )}
            title={`WebSocket: ${wsStatus}`}
          />
        </div>

        <div className="hidden md:flex items-center gap-1 ml-4 bg-muted rounded-lg p-1">
          <Button
            variant={activePanel === "dashboard" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActivePanel("dashboard")}
            className="gap-1.5"
          >
            <LayoutDashboard className="h-4 w-4" />
            Home
          </Button>
          <Button
            variant={activePanel === "board" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActivePanel("board")}
            className="gap-1.5 relative"
          >
            <BarChart3 className="h-4 w-4" />
            Board
            {failedCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
                {failedCount}
              </span>
            )}
          </Button>
          <Button
            variant={activePanel === "chat" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActivePanel("chat")}
            className="gap-1.5"
          >
            <MessageSquare className="h-4 w-4" />
            Chat
          </Button>
          <Button
            variant={activePanel === "pipeline" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActivePanel("pipeline")}
            className="gap-1.5 relative"
          >
            <GitBranch className="h-4 w-4" />
            Pipeline
            {awaitingCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center px-1 animate-pulse">
                {awaitingCount}
              </span>
            )}
          </Button>
          <Button
            variant={activePanel === "settings" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActivePanel("settings")}
            className="gap-1.5"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground transition-colors text-xs"
        >
          <Search className="h-3 w-3" />
          <span>Search...</span>
          <kbd className="text-[10px] bg-background px-1.5 py-0.5 rounded font-mono border border-border ml-2">
            ⌘K
          </kbd>
        </button>

        {stats && (
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <Badge variant="outline" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              {stats.working} active
            </Badge>
            <Badge variant="outline" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {stats.done} done
            </Badge>
            <Badge variant="outline" className="gap-1">
              {stats.total} total
            </Badge>
          </div>
        )}

        {backendConfig && (
          <Select
            value={backendConfig.backend}
            onValueChange={(v) => v && setBackend(v)}
          >
            <SelectTrigger className="w-28 h-8 text-xs">
              <Zap className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {backendConfig.backends.map((b) => (
                <SelectItem key={b} value={b} className="text-xs">
                  {b.charAt(0).toUpperCase() + b.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="hidden sm:flex items-center gap-2">
          <Label htmlFor="auto-approve" className="text-xs text-muted-foreground">
            Auto
          </Label>
          <Switch
            id="auto-approve"
            checked={autoApprove}
            onCheckedChange={setAutoApprove}
          />
        </div>

        <NotificationCenter />

        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
