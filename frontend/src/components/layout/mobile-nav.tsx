"use client";

import {
  LayoutDashboard,
  BarChart3,
  MessageSquare,
  GitBranch,
  Settings,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { key: "dashboard" as const, labelKey: "nav.home", icon: LayoutDashboard },
  { key: "board" as const, labelKey: "nav.board", icon: BarChart3 },
  { key: "chat" as const, labelKey: "nav.chat", icon: MessageSquare },
  { key: "pipeline" as const, labelKey: "nav.pipeline", icon: GitBranch },
  { key: "settings" as const, labelKey: "nav.settings", icon: Settings },
];

export function MobileNav() {
  const { activePanel, setActivePanel, pipelines, issues, activityFeed } = useAppStore();
  const { t } = useTranslation();

  const awaitingCount = pipelines.filter((p) => p.phase.startsWith("awaiting")).length;
  const failedCount = issues.filter((i) => i.status === "failed").length;

  const getBadge = (key: string): { count: number; color: string } | null => {
    if (key === "board" && failedCount > 0) return { count: failedCount, color: "bg-red-500" };
    if (key === "pipeline" && awaitingCount > 0) return { count: awaitingCount, color: "bg-amber-500" };
    return null;
  };

  return (
    <nav aria-label={t("nav.mobileNav")} className="fixed bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur-sm z-50 md:hidden safe-area-bottom">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map(({ key, labelKey, icon: Icon }) => {
          const label = t(labelKey);
          const badge = getBadge(key);
          return (
            <button
              key={key}
              onClick={() => setActivePanel(key)}
              aria-current={activePanel === key ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 px-3 text-[10px] font-medium transition-colors min-w-0 flex-1 relative",
                activePanel === key
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    "h-5 w-5",
                    activePanel === key && "text-primary"
                  )}
                />
                {badge && (
                  <span className={cn(
                    "absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 rounded-full text-white text-[8px] font-bold flex items-center justify-center px-0.5",
                    badge.color
                  )}>
                    {badge.count}
                  </span>
                )}
              </div>
              <span className="truncate">{label}</span>
              {activePanel === key && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
