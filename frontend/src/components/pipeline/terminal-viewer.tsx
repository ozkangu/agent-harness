"use client";

import { useState, useRef, useEffect } from "react";
import { Terminal, Copy, Check, Trash2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  timestamp: string;
  type: "stdout" | "stderr" | "system" | "command";
  content: string;
}

interface TerminalViewerProps {
  logs: LogEntry[];
  title?: string;
  className?: string;
}

export function TerminalViewer({ logs, title = "Terminal", className }: TerminalViewerProps) {
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, paused]);

  const handleCopy = () => {
    const text = logs.map((l) => l.content).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const typeStyles: Record<string, string> = {
    stdout: "text-green-400",
    stderr: "text-red-400",
    system: "text-blue-400",
    command: "text-yellow-400",
  };

  return (
    <div className={cn("flex flex-col rounded-lg border border-border overflow-hidden bg-zinc-950", className)}>
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <div className="h-3 w-3 rounded-full bg-yellow-500" />
            <div className="h-3 w-3 rounded-full bg-green-500" />
          </div>
          <span className="text-xs text-zinc-400 ml-2 font-mono">{title}</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-zinc-700 text-zinc-500">
            {logs.length} lines
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Terminal content */}
      <ScrollArea className="flex-1 max-h-80" ref={scrollRef}>
        <div className="p-3 font-mono text-xs leading-5">
          {logs.length === 0 ? (
            <div className="text-zinc-600 flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              <span>Waiting for output...</span>
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className="flex gap-2 hover:bg-zinc-900/50">
                <span className="text-zinc-600 shrink-0 select-none">
                  {entry.timestamp}
                </span>
                {entry.type === "command" && (
                  <span className="text-yellow-400 shrink-0">$</span>
                )}
                <span className={typeStyles[entry.type] || "text-zinc-300"}>
                  {entry.content}
                </span>
              </div>
            ))
          )}
          <div className="text-zinc-600 animate-pulse mt-1">
            <span className="inline-block w-2 h-4 bg-zinc-600" />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
