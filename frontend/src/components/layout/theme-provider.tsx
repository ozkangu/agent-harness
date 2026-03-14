"use client";

import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";

const ACCENT_HSL: Record<string, string> = {
  violet: "263 70% 50%",
  blue: "217 91% 60%",
  cyan: "188 95% 43%",
  emerald: "160 84% 39%",
  amber: "38 92% 50%",
  rose: "347 77% 50%",
  pink: "330 81% 60%",
  indigo: "239 84% 67%",
};

export function ThemeSync() {
  const theme = useAppStore((s) => s.theme);
  const accentColor = useAppStore((s) => s.accentColor);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const hsl = ACCENT_HSL[accentColor] || ACCENT_HSL.violet;
    root.style.setProperty("--primary", hsl);
    root.style.setProperty("--ring", hsl);
  }, [accentColor]);

  return null;
}
