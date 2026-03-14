"use client";

import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";

const PANEL_MAP: Record<string, "dashboard" | "board" | "chat" | "pipeline" | "settings"> = {
  "1": "dashboard",
  "2": "board",
  "3": "chat",
  "4": "pipeline",
  "5": "settings",
};

export function useKeyboardShortcuts() {
  const { setActivePanel, setSidebarOpen, sidebarOpen } = useAppStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd+B: toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
        return;
      }

      // Number keys for panel switching (only when not in input)
      if (!isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const panel = PANEL_MAP[e.key];
        if (panel) {
          e.preventDefault();
          setActivePanel(panel);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActivePanel, setSidebarOpen, sidebarOpen]);
}
