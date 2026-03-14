"use client";

import {
  Plus,
  MessageSquare,
  GitBranch,
  Clock,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { PHASE_LABELS } from "@/types";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const {
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    pipelines,
    conversations,
    activePipelineId,
    activeConversationId,
    selectPipeline,
    selectConversation,
    createConversation,
    setActivePanel,
  } = useAppStore();

  if (!sidebarOpen) return null;

  const collapsed = sidebarCollapsed;
  const awaitingCount = pipelines.filter((p) => p.phase.startsWith("awaiting")).length;

  return (
    <>
      {/* Mobile overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={() => setSidebarOpen(false)}
      />
    <aside
      className={cn(
        "border-r border-border bg-card flex flex-col shrink-0 fixed md:relative z-50 h-[calc(100vh-3.5rem)] md:h-auto transition-all duration-200",
        collapsed ? "w-14" : "w-64"
      )}
    >
      {/* Pipelines Section */}
      <div className="p-3 border-b border-border">
        {!collapsed && (
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Pipelines
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setActivePanel("pipeline")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              onClick={() => setActivePanel("pipeline")}
              title="Pipelines"
            >
              <GitBranch className="h-4 w-4" />
              {awaitingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 rounded-full bg-amber-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5">
                  {awaitingCount}
                </span>
              )}
            </Button>
            {pipelines.slice(0, 3).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  selectPipeline(p.id);
                  setActivePanel("pipeline");
                }}
                className={cn(
                  "h-7 w-7 rounded-md flex items-center justify-center text-[9px] font-bold transition-colors",
                  activePipelineId === p.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                )}
                title={p.name}
              >
                {p.name.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        ) : (
          <ScrollArea className="max-h-48">
            <div className="space-y-1">
              {pipelines.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1">
                  No pipelines yet
                </p>
              )}
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    selectPipeline(p.id);
                    setActivePanel("pipeline");
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-accent transition-colors",
                    activePipelineId === p.id && "bg-accent"
                  )}
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {PHASE_LABELS[p.phase]}
                    </p>
                  </div>
                  {p.phase.startsWith("awaiting") && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 shrink-0 border-amber-500 text-amber-500"
                    >
                      !
                    </Badge>
                  )}
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Conversations Section */}
      <div className="p-3 flex-1 flex flex-col min-h-0">
        {!collapsed && (
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Conversations
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                createConversation();
                setActivePanel("chat");
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                createConversation();
                setActivePanel("chat");
              }}
              title="New Chat"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
            {conversations.slice(0, 4).map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  selectConversation(c.id);
                  setActivePanel("chat");
                }}
                className={cn(
                  "h-7 w-7 rounded-md flex items-center justify-center text-[9px] font-bold transition-colors",
                  activeConversationId === c.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent"
                )}
                title={c.title || `Chat #${c.id}`}
              >
                {(c.title || `C${c.id}`).charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-1">
              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1">
                  No conversations yet
                </p>
              )}
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    selectConversation(c.id);
                    setActivePanel("chat");
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 hover:bg-accent transition-colors",
                    activeConversationId === c.id && "bg-accent"
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium">
                      {c.title || `Chat #${c.id}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-border hidden md:flex justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setSidebarCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </aside>
    </>
  );
}
