"use client";

import { useState, useEffect } from "react";
import { Loader2, WifiOff, Bot, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { healthApi } from "@/lib/api";

interface ConnectionStatusProps {
  children: React.ReactNode;
}

export function ConnectionStatus({ children }: ConnectionStatusProps) {
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      try {
        await healthApi.check();
        if (!cancelled) setStatus("connected");
      } catch {
        if (!cancelled) {
          setStatus("error");
          // Auto-retry every 5 seconds
          setTimeout(() => {
            if (!cancelled) {
              setRetryCount((c) => c + 1);
            }
          }, 5000);
        }
      }
    };

    checkHealth();
    return () => { cancelled = true; };
  }, [retryCount]);

  if (status === "connected") {
    return <>{children}</>;
  }

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-sm">
        <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center mx-auto mb-6">
          {status === "connecting" ? (
            <Loader2 className="h-10 w-10 text-violet-400 animate-spin" />
          ) : (
            <WifiOff className="h-10 w-10 text-red-400" />
          )}
        </div>

        <h2 className="text-xl font-bold mb-2">
          {status === "connecting" ? "Connecting to Maestro..." : "Connection Failed"}
        </h2>

        <p className="text-sm text-muted-foreground mb-6">
          {status === "connecting"
            ? "Establishing connection to the backend server."
            : "Could not reach the Maestro backend. Make sure the server is running on port 8420."}
        </p>

        {status === "error" && (
          <div className="space-y-3">
            <Button
              onClick={() => { setStatus("connecting"); setRetryCount((c) => c + 1); }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Connection
            </Button>

            <div className="bg-muted/50 rounded-lg p-3 text-left">
              <p className="text-xs font-mono text-muted-foreground">
                $ maestro start --port 8420
              </p>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Auto-retrying... ({retryCount} attempts)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
