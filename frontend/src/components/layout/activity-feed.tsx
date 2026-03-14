"use client";

import {
  GitBranch,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  Clock,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/app-store";
import type { WSEventType } from "@/types";
import { cn } from "@/lib/utils";

const EVENT_ICONS: Record<string, React.ElementType> = {
  issue_created: Plus,
  issue_updated: RefreshCw,
  issue_deleted: Trash2,
  pipeline_phase_changed: GitBranch,
  chat_message: MessageSquare,
  conversation_message: MessageSquare,
  pipeline_completed: CheckCircle2,
  quick_task_completed: Zap,
  stories_generated: Zap,
  runner_output: Zap,
};

const EVENT_COLORS: Record<string, string> = {
  issue_created: "text-blue-400",
  issue_updated: "text-amber-400",
  issue_deleted: "text-red-400",
  pipeline_phase_changed: "text-violet-400",
  chat_message: "text-emerald-400",
  conversation_message: "text-emerald-400",
  pipeline_completed: "text-emerald-400",
  quick_task_completed: "text-blue-400",
  stories_generated: "text-violet-400",
  runner_output: "text-zinc-400",
};

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeed() {
  const { activityFeed } = useAppStore();

  if (activityFeed.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="h-6 w-6 mx-auto mb-2 opacity-50" />
        <p className="text-xs">No activity yet</p>
        <p className="text-[10px] mt-1">Events will appear here in real-time</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[320px]">
      <div className="space-y-0.5">
        {activityFeed.slice(0, 20).map((event) => {
          const Icon = EVENT_ICONS[event.type] || Zap;
          const color = EVENT_COLORS[event.type] || "text-zinc-400";

          return (
            <div
              key={event.id}
              className="flex items-start gap-2.5 px-1 py-2 rounded-md hover:bg-accent/30 transition-colors"
            >
              <div className={cn("mt-0.5 shrink-0", color)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium leading-tight">
                  {event.title}
                </p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  {event.description}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                {timeAgo(event.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
