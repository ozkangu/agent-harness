"use client";

import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { locale, setLocale } = useAppStore();

  return (
    <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
      <button
        onClick={() => setLocale("en")}
        className={cn(
          "text-xs px-3 py-1 rounded transition-colors font-medium",
          locale === "en"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        EN
      </button>
      <button
        onClick={() => setLocale("tr")}
        className={cn(
          "text-xs px-3 py-1 rounded transition-colors font-medium",
          locale === "tr"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        TR
      </button>
    </div>
  );
}
