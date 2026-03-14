"use client";

import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useAppStore((s) => s.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <>{children}</>;
}
