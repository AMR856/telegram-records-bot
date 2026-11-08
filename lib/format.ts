import type { Lang } from "@/lib/i18n";
import { localeFor } from "@/lib/i18n";

export function formatDateTime(value: string | null | undefined, lang: Lang): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeFor(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(localeFor(lang), { dateStyle: "medium" }).format(date);
}

export function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(localeFor(lang), {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatMonth(month: number, lang: Lang): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) return "—";
  return new Intl.DateTimeFormat(localeFor(lang), { month: "long" }).format(
    new Date(2024, month - 1, 1),
  );
}
