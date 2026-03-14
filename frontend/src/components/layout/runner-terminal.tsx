"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal,
  X,
  Minimize2,
  Maximize2,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

export function RunnerTerminal() {
  const { runnerOutput, clearRunnerOutput } = useAppStore();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  // Auto-open when new output arrives
  useEffect(() => {
    if (runnerOutput.length > prevLengthRef.current && runnerOutput.length > 0) {
      setOpen(true);
      setMinimized(false);
    }
    prevLengthRef.current = runnerOutput.length;
  }, [runnerOutput.length]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && !minimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [runnerOutput, minimized]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setMinimized(false);
    setExpanded(false);
  }, []);

  if (!open) {
    // Floating trigger button
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-[100] flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card shadow-lg hover:bg-accent transition-colors text-sm",
          runnerOutput.length > 0 && "border-emerald-500/50"
        )}
      >
        <Terminal className="h-4 w-4" />
        <span className="text-xs font-medium">Terminal</span>
        {runnerOutput.length > 0 && (
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        )}
      </button>
    );
  }

  const typeColors: Record<string, string> = {
    stdout: "text-foreground",
    stderr: "text-red-400",
    system: "text-blue-400",
    info: "text-cyan-400",
  };

  return (
    <div
      className={cn(
        "fixed right-4 z-[100] flex flex-col border border-border bg-card shadow-xl rounded-lg overflow-hidden transition-all",
        expanded
          ? "bottom-4 top-16 left-4"
          : minimized
            ? "bottom-4 w-80 h-10"
            : "bottom-4 w-[600px] h-72"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-3 bg-muted/50 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold">Runner Output</span>
          {runnerOutput.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {runnerOutput.length} lines
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={clearRunnerOutput}
            title="Clear"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setMinimized(!minimized)}
            title={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Restore" : "Maximize"}
          >
            {expanded ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleClose}
            title="Close"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Terminal body */}
      {!minimized && (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-2 font-mono text-xs bg-background/95"
        >
          {runnerOutput.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-xs">No output yet. Start a pipeline to see live output.</p>
            </div>
          ) : (
            runnerOutput.map((entry) => (
              <div key={entry.id} className="flex gap-2 py-0.5 hover:bg-muted/30">
                <span className="text-muted-foreground shrink-0 select-none">
                  {entry.timestamp}
                </span>
                <span
                  className={cn(
                    "whitespace-pre-wrap break-all",
                    typeColors[entry.type] || "text-foreground"
                  )}
                >
                  {entry.content}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
