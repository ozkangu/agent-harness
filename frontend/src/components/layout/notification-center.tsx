"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bell,
  X,
  GitBranch,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Trash2,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import type { ActivityEvent } from "@/types";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  issue_created: <BarChart3 className="h-3.5 w-3.5 text-blue-400" />,
  issue_updated: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  issue_deleted: <Trash2 className="h-3.5 w-3.5 text-red-400" />,
  pipeline_phase_changed: <GitBranch className="h-3.5 w-3.5 text-violet-400" />,
  pipeline_completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  chat_message: <MessageSquare className="h-3.5 w-3.5 text-cyan-400" />,
  conversation_message: <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />,
  quick_task_completed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
};

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationCenter() {
  const { activityFeed, setActivePanel } = useAppStore();
  const [open, setOpen] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = Math.max(0, activityFeed.length - readCount);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const handleOpen = () => {
    setOpen(!open);
    if (!open) {
      // Mark all as read when opening
      setReadCount(activityFeed.length);
    }
  };

  const handleNavigate = (event: ActivityEvent) => {
    if (event.type.startsWith("issue")) {
      setActivePanel("board");
    } else if (event.type.startsWith("pipeline")) {
      setActivePanel("pipeline");
    } else if (event.type.includes("message") || event.type.includes("chat")) {
      setActivePanel("chat");
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={handleOpen}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-[200] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Notifications</span>
              {activityFeed.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {activityFeed.length}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Notification list */}
          <ScrollArea className="max-h-80">
            {activityFeed.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-30" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="py-1">
                {activityFeed.slice(0, 30).map((event, idx) => (
                  <button
                    key={event.id}
                    onClick={() => handleNavigate(event)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors flex items-start gap-2.5",
                      idx < activityFeed.length - readCount && "bg-primary/5"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {EVENT_ICONS[event.type] || (
                        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{event.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {event.description}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                      {timeAgo(event.timestamp)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
