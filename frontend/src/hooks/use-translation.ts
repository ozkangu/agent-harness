import { useCallback } from "react";
import { useAppStore } from "@/stores/app-store";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

type Messages = typeof en;
type Locale = "en" | "tr";

const messages: Record<Locale, Messages> = { en, tr };

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return path;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : path;
}

export function useTranslation() {
  const locale = useAppStore((s) => s.locale);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let value = getNestedValue(messages[locale] as unknown as Record<string, unknown>, key);
      if (value === key) {
        // Fallback to English
        value = getNestedValue(messages.en as unknown as Record<string, unknown>, key);
      }
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          value = value.replace(`{${k}}`, String(v));
        });
      }
      return value;
    },
    [locale]
  );

  return { t, locale };
}
