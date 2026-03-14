"use client";

import { useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { KanbanBoard } from "@/components/board/kanban-board";
import { ChatPanel } from "@/components/chat/chat-panel";
import { PipelineView } from "@/components/pipeline/pipeline-view";
import { SettingsPanel } from "@/components/layout/settings-panel";
import { DashboardOverview } from "@/components/layout/dashboard-overview";
import { useAppStore } from "@/stores/app-store";
import { useWebSocket } from "@/hooks/use-websocket";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ToastContainer } from "@/components/layout/toast-container";
import { CommandPalette } from "@/components/layout/command-palette";
import { ConnectionStatus } from "@/components/layout/connection-status";
import { ThemeSync } from "@/components/layout/theme-provider";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { ErrorBoundary } from "@/components/layout/error-boundary";
import { RunnerTerminal } from "@/components/layout/runner-terminal";
import { OnboardingTour } from "@/components/layout/onboarding-tour";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import type { WSEvent, Issue, Message, PipelinePhase } from "@/types";

export default function Dashboard() {
  const {
    activePanel,
    fetchAll,
    handleIssueCreated,
    handleIssueUpdated,
    handleIssueDeleted,
    handlePipelinePhaseChanged,
    handleChatMessage,
    handleConversationMessage,
    addActivity,
    addToast,
    addRunnerOutput,
    setWsStatus,
    fetchIssues,
    fetchStats,
    fetchPipelines,
  } = useAppStore();

  // Keyboard shortcuts
  useKeyboardShortcuts();

  // Initial data load
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // WebSocket event handling
  const wsStatus = useWebSocket((event: WSEvent) => {
    switch (event.type) {
      case "issue_created":
        handleIssueCreated(event.data as unknown as Issue);
        fetchStats();
        break;
      case "issue_updated":
        handleIssueUpdated(event.data as unknown as Issue);
        fetchStats();
        break;
      case "issue_deleted":
        handleIssueDeleted((event.data as { key: string }).key);
        fetchStats();
        break;
      case "pipeline_phase_changed":
        handlePipelinePhaseChanged(
          event.data as unknown as { pipeline_id: number; phase: PipelinePhase }
        );
        break;
      case "chat_message":
      case "stories_generated":
        handleChatMessage(event.data as unknown as Message);
        break;
      case "conversation_message":
        handleConversationMessage(event.data as unknown as Message);
        break;
      case "pipeline_completed":
        fetchPipelines();
        fetchIssues();
        fetchStats();
        addActivity({
          type: "pipeline_completed",
          title: "Pipeline Completed",
          description: "A pipeline has finished processing",
        });
        addToast({
          type: "success",
          title: "Pipeline Completed",
          description: "All phases finished successfully",
        });
        break;
      case "quick_task_completed":
        fetchIssues();
        fetchStats();
        addActivity({
          type: "quick_task_completed",
          title: "Task Completed",
          description: "A quick task has been completed",
        });
        break;
      case "runner_output": {
        const rd = event.data as { type?: string; content?: string };
        if (rd.content) {
          addRunnerOutput(rd.type || "stdout", rd.content);
        }
        break;
      }
    }
  });

  // Sync WebSocket status to store
  useEffect(() => {
    setWsStatus(wsStatus);
  }, [wsStatus, setWsStatus]);

  const renderActivePanel = () => {
    switch (activePanel) {
      case "dashboard":
        return <DashboardOverview />;
      case "board":
        return <KanbanBoard />;
      case "chat":
        return <ChatPanel />;
      case "pipeline":
        return <PipelineView />;
      case "settings":
        return <SettingsPanel />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <ConnectionStatus>
      <ThemeSync />
      <div className="h-screen flex flex-col">
        <Header />
        <Breadcrumb />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-hidden pb-16 md:pb-0">
            <ErrorBoundary>
              {renderActivePanel()}
            </ErrorBoundary>
          </main>
        </div>
        <MobileNav />
        <ToastContainer />
        <CommandPalette />
        <RunnerTerminal />
        <OnboardingTour />
        <KeyboardShortcuts />
      </div>
    </ConnectionStatus>
  );
}
