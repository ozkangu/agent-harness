"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { LoginPage } from "@/components/auth/login-page";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authEnabled, isAuthenticated, checkAuth } = useAppStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth().finally(() => setChecking(false));
  }, [checkAuth]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (authEnabled && !isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
