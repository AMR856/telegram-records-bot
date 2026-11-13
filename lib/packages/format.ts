import { formatNumber } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { localeFor } from "@/lib/i18n";

const dateFormatter = new Map<Lang, Intl.DateTimeFormat>();
const timeFormatter = new Map<Lang, Intl.DateTimeFormat>();
const monthFormatter = new Map<Lang, Intl.DateTimeFormat>();

function formatter(
  cache: Map<Lang, Intl.DateTimeFormat>,
  lang: Lang,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cached = cache.get(lang);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat(localeFor(lang), options);
  cache.set(lang, created);
  return created;
}

export function formatPackageDate(date: Date, lang: Lang): string {
  if (Number.isNaN(date.getTime())) return "—";
  return formatter(dateFormatter, lang, { dateStyle: "medium" }).format(date);
}

export function formatPackageTime(date: Date, lang: Lang): string {
  if (Number.isNaN(date.getTime())) return "—";
  return formatter(timeFormatter, lang, { timeStyle: "short" }).format(date);
}

export function formatPackageMonth(date: Date, lang: Lang): string {
  if (Number.isNaN(date.getTime())) return "—";
  return formatter(monthFormatter, lang, {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatPackageDateTime(date: Date, lang: Lang): string {
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatPackageDate(date, lang)} · ${formatPackageTime(date, lang)}`;
}

export function formatPackagesMoney(
  value: number,
  lang: Lang,
  currency: string,
): string {
  return `${formatNumber(value, lang)} ${currency}`;
}

export function formatPackageName(
  gb: number,
  lang: Lang,
  unit: string,
): string {
  return `${formatNumber(gb, lang)} ${unit}`;
}
