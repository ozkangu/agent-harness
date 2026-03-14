"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  GitBranch,
  Settings,
  Plus,
  Search,
  Sparkles,
  Moon,
  Sun,
  Zap,
  Shield,
  Target,
  ToggleLeft,
  ToggleRight,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { PHASE_LABELS } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-500/30 text-foreground rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
  group?: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const {
    setActivePanel,
    createConversation,
    pipelines,
    conversations,
    issues,
    selectPipeline,
    selectConversation,
    setSidebarOpen,
    sidebarOpen,
    theme,
    toggleTheme,
    autoApprove,
    setAutoApprove,
    backendConfig,
    setBackend,
  } = useAppStore();

  const commands: CommandItem[] = [
    {
      id: "nav-dashboard",
      label: "Go to Dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
      action: () => { setActivePanel("dashboard"); setOpen(false); },
      keywords: ["home", "overview"],
      group: "Navigate",
    },
    {
      id: "nav-board",
      label: "Go to Kanban Board",
      icon: <BarChart3 className="h-4 w-4" />,
      action: () => { setActivePanel("board"); setOpen(false); },
      keywords: ["kanban", "issues", "tasks"],
      group: "Navigate",
    },
    {
      id: "nav-chat",
      label: "Go to Chat",
      icon: <MessageSquare className="h-4 w-4" />,
      action: () => { setActivePanel("chat"); setOpen(false); },
      keywords: ["conversation", "ai", "assistant"],
      group: "Navigate",
    },
    {
      id: "nav-pipeline",
      label: "Go to Pipeline",
      icon: <GitBranch className="h-4 w-4" />,
      action: () => { setActivePanel("pipeline"); setOpen(false); },
      keywords: ["pipeline", "build"],
      group: "Navigate",
    },
    {
      id: "nav-settings",
      label: "Go to Settings",
      icon: <Settings className="h-4 w-4" />,
      action: () => { setActivePanel("settings"); setOpen(false); },
      keywords: ["config", "preferences"],
      group: "Navigate",
    },
    {
      id: "new-chat",
      label: "New Conversation",
      description: "Start a new AI chat",
      icon: <Plus className="h-4 w-4" />,
      action: () => { createConversation(); setActivePanel("chat"); setOpen(false); },
      keywords: ["create", "new", "chat"],
      group: "Create",
    },
    {
      id: "new-pipeline",
      label: "New Pipeline",
      description: "Start a new AI pipeline",
      icon: <Sparkles className="h-4 w-4" />,
      action: () => { setActivePanel("pipeline"); setOpen(false); },
      keywords: ["create", "new", "build"],
      group: "Create",
    },
    {
      id: "new-issue",
      label: "Create New Issue",
      description: "Add a new issue to the board",
      icon: <Target className="h-4 w-4" />,
      action: () => { setActivePanel("board"); setOpen(false); },
      keywords: ["create", "issue", "task", "bug"],
      group: "Create",
    },
    {
      id: "toggle-sidebar",
      label: sidebarOpen ? "Hide Sidebar" : "Show Sidebar",
      icon: sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />,
      action: () => { setSidebarOpen(!sidebarOpen); setOpen(false); },
      keywords: ["sidebar", "toggle"],
      group: "Settings",
    },
    {
      id: "toggle-theme",
      label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
      icon: theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
      action: () => { toggleTheme(); setOpen(false); },
      keywords: ["theme", "dark", "light", "mode"],
      group: "Settings",
    },
    {
      id: "toggle-auto-approve",
      label: autoApprove ? "Disable Auto-Approve" : "Enable Auto-Approve",
      description: autoApprove ? "Currently enabled" : "Currently disabled",
      icon: autoApprove ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />,
      action: () => { setAutoApprove(!autoApprove); setOpen(false); },
      keywords: ["auto", "approve", "toggle"],
      group: "Settings",
    },
    // Backend switching
    ...(backendConfig?.backends || []).map((b) => ({
      id: `backend-${b}`,
      label: `Switch to ${b.charAt(0).toUpperCase() + b.slice(1)} Backend`,
      description: backendConfig?.backend === b ? "Currently active" : undefined,
      icon: <Zap className="h-4 w-4" />,
      action: () => { setBackend(b); setOpen(false); },
      keywords: ["backend", "engine", b],
      group: "Settings",
    })),
    // Dynamic items - recent issues
    ...issues.slice(0, 10).map((i) => {
      const statusColors: Record<string, string> = {
        todo: "bg-slate-500",
        working: "bg-blue-500",
        review: "bg-amber-500",
        done: "bg-emerald-500",
        failed: "bg-red-500",
      };
      return {
        id: `issue-${i.key}`,
        label: `${i.key}: ${i.title}`,
        description: `${i.status} · ${i.priority}${i.labels.length > 0 ? ` · ${i.labels.join(", ")}` : ""}`,
        icon: (
          <div className="relative">
            <Target className="h-4 w-4" />
            <span className={cn("absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full", statusColors[i.status] || "bg-slate-500")} />
          </div>
        ),
        action: () => { setActivePanel("board"); setOpen(false); },
        keywords: ["issue", i.status, i.priority, ...i.labels, i.key, i.title],
        group: "Issues",
      };
    }),
    // Dynamic items - pipelines
    ...pipelines.slice(0, 5).map((p) => ({
      id: `pipeline-${p.id}`,
      label: p.name,
      description: PHASE_LABELS[p.phase],
      icon: <GitBranch className="h-4 w-4" />,
      action: () => { selectPipeline(p.id); setActivePanel("pipeline"); setOpen(false); },
      keywords: ["pipeline"],
      group: "Pipelines",
    })),
    // Dynamic items - conversations
    ...conversations.slice(0, 5).map((c) => ({
      id: `conv-${c.id}`,
      label: c.title || `Chat #${c.id}`,
      description: new Date(c.created_at).toLocaleDateString(),
      icon: <MessageSquare className="h-4 w-4" />,
      action: () => { selectConversation(c.id); setActivePanel("chat"); setOpen(false); },
      keywords: ["conversation", "chat"],
      group: "Conversations",
    })),
  ];

  const filtered = query.trim()
    ? commands.filter((cmd) => {
        const q = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(q) ||
          cmd.description?.toLowerCase().includes(q) ||
          cmd.keywords?.some((k) => k.includes(q))
        );
      })
    : commands;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        return;
      }

      // Panel shortcuts (only when palette is not open)
      if (!open && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }

      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
        }
        return;
      }
    },
    [open, filtered, selectedIndex]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg">
        <div className="bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No results found
              </div>
            ) : (
              (() => {
                let lastGroup = "";
                let globalIdx = 0;
                return filtered.map((cmd) => {
                  const idx = globalIdx++;
                  const showGroupHeader = cmd.group && cmd.group !== lastGroup;
                  if (cmd.group) lastGroup = cmd.group;
                  return (
                    <div key={cmd.id}>
                      {showGroupHeader && (
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1">
                          {cmd.group}
                        </p>
                      )}
                      <button
                        onClick={cmd.action}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-colors",
                          idx === selectedIndex
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent/50"
                        )}
                      >
                        <div className="text-muted-foreground shrink-0">
                          {cmd.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            <HighlightText text={cmd.label} query={query} />
                          </p>
                          {cmd.description && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              <HighlightText text={cmd.description} query={query} />
                            </p>
                          )}
                        </div>
                        {cmd.group && (
                          <span className="text-[9px] text-muted-foreground/50 shrink-0">
                            {cmd.group}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                });
              })()
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="bg-muted px-1 py-0.5 rounded font-mono">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-muted px-1 py-0.5 rounded font-mono">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-muted px-1 py-0.5 rounded font-mono">esc</kbd>
              Close
            </span>
            <span className="ml-auto">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
