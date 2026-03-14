"use client";

import { ChevronRight, Home } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { PHASE_LABELS } from "@/types";

const PANEL_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  board: "Kanban Board",
  chat: "Chat",
  pipeline: "Pipeline",
  settings: "Settings",
};

export function Breadcrumb() {
  const {
    activePanel,
    activePipelineId,
    activeConversationId,
    pipelines,
    conversations,
    setActivePanel,
  } = useAppStore();

  const activePipeline = pipelines.find((p) => p.id === activePipelineId);
  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: "Home", onClick: () => setActivePanel("dashboard") },
  ];

  if (activePanel !== "dashboard") {
    crumbs.push({
      label: PANEL_LABELS[activePanel] || activePanel,
      onClick: activePanel === "pipeline" && activePipeline
        ? () => {}
        : undefined,
    });
  }

  // Add context-specific crumb
  if (activePanel === "pipeline" && activePipeline) {
    crumbs.push({
      label: `${activePipeline.name} (${PHASE_LABELS[activePipeline.phase]})`,
    });
  }

  if (activePanel === "chat" && activeConversation) {
    crumbs.push({
      label: activeConversation.title || `Chat #${activeConversation.id}`,
    });
  }

  return (
    <div className="hidden md:flex items-center gap-1 px-4 py-1.5 border-b border-border bg-muted/30 text-xs">
      {crumbs.map((crumb, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          {i === 0 && <Home className="h-3 w-3 text-muted-foreground mr-0.5" />}
          {crumb.onClick && i < crumbs.length - 1 ? (
            <button
              onClick={crumb.onClick}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {crumb.label}
            </button>
          ) : (
            <span className={i === crumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"}>
              {crumb.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
