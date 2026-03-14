"use client";

import { useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const variantStyles = {
    danger: "bg-red-500 hover:bg-red-600 text-white",
    warning: "bg-amber-500 hover:bg-amber-600 text-white",
    default: "",
  };

  return (
    <div className="fixed inset-0 z-[300]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm">
        <div className="bg-card border border-border rounded-xl shadow-2xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
              variant === "danger" ? "bg-red-500/10" : variant === "warning" ? "bg-amber-500/10" : "bg-primary/10"
            }`}>
              <AlertTriangle className={`h-5 w-5 ${
                variant === "danger" ? "text-red-500" : variant === "warning" ? "text-amber-500" : "text-primary"
              }`} />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {description}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button
              size="sm"
              className={variantStyles[variant]}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for easy confirmation dialog usage
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: "danger" | "warning" | "default";
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    title: "",
    description: "",
    variant: "danger",
    resolve: null,
  });

  const confirm = useCallback(
    (opts: { title: string; description: string; variant?: "danger" | "warning" | "default" }) => {
      return new Promise<boolean>((resolve) => {
        setState({
          open: true,
          title: opts.title,
          description: opts.description,
          variant: opts.variant || "danger",
          resolve,
        });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((s) => ({ ...s, open: false, resolve: null }));
  }, [state.resolve]);

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      description={state.description}
      variant={state.variant}
      confirmLabel={state.variant === "danger" ? "Delete" : "Confirm"}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}
