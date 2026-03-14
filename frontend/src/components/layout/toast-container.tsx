"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import type { Toast } from "@/types";

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLORS = {
  success: "border-l-emerald-500 bg-emerald-500/5",
  error: "border-l-red-500 bg-red-500/5",
  info: "border-l-blue-500 bg-blue-500/5",
  warning: "border-l-amber-500 bg-amber-500/5",
};

const ICON_COLORS = {
  success: "text-emerald-500",
  error: "text-red-500",
  info: "text-blue-500",
  warning: "text-amber-500",
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [visible, setVisible] = useState(false);
  const Icon = ICONS[toast.type];

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleRemove = () => {
    setVisible(false);
    setTimeout(onRemove, 200);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border border-border border-l-4 shadow-lg backdrop-blur-sm transition-all duration-200",
        COLORS[toast.type],
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      )}
    >
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", ICON_COLORS[toast.type])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={handleRemove}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  if (toasts.length === 0) return null;

  return (
    <div role="status" aria-live="polite" className="fixed bottom-20 right-4 md:bottom-4 md:right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
