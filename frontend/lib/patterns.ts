import type { Dictionary } from "@/lib/i18n";
import type {
  ExportColumn,
  PatternDefinition,
  PatternField,
  PatternType,
} from "@/lib/types";

export const CANONICAL_TARGETS = [
  "value",
  "name",
  "description",
  "month",
  "source",
  "currency",
  "kind",
] as const;

export const TELEGRAM_FIELDS = [
  "date",
  "value",
  "currency",
  "name",
  "description",
  "month",
  "source",
  "kind",
] as const;

export const WHATSAPP_FIELDS = [
  "date",
  "sender",
  "value",
  "currency",
  "name",
  "description",
  "month",
  "source",
  "kind",
] as const;

export function fieldLabel(field: string, dict: Dictionary): string {
  switch (field) {
    case "date":
      return dict.date;
    case "value":
      return dict.value;
    case "currency":
      return dict.currency;
    case "name":
      return dict.name;
    case "description":
      return dict.description;
    case "month":
      return dict.month;
    case "source":
      return dict.source;
    case "kind":
      return dict.typeLabel;
    case "sender":
      return dict.sender;
    case "raw":
      return dict.rawMessage;
    default:
      return field;
  }
}

export function patternTypeLabel(type: PatternType, dict: Dictionary): string {
  switch (type) {
    case "number":
      return dict.patternsTypeNumber;
    case "month":
      return dict.patternsTypeMonth;
    case "word":
      return dict.patternsTypeWord;
    default:
      return dict.patternsTypeText;
  }
}

export function fieldKeysFor(kind: "telegram" | "whatsapp"): readonly string[] {
  return kind === "whatsapp" ? WHATSAPP_FIELDS : TELEGRAM_FIELDS;
}

export function defaultExportColumn(
  field: string,
  dict: Dictionary,
): ExportColumn {
  return {
    key: field,
    header: fieldLabel(field, dict),
    source: "field",
    field,
    default: field === "currency" ? "SYP" : field === "kind" ? "payment" : null,
  };
}

export function defaultColumns(
  kind: "telegram" | "whatsapp",
  dict: Dictionary,
): ExportColumn[] {
  return fieldKeysFor(kind).map((field) => defaultExportColumn(field, dict));
}

export function extractPlaceholders(template: string): string[] {
  const names: string[] = [];
  const regex = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template))) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

export function hasBalancedBraces(template: string): boolean {
  const open = (template.match(/\{/g) ?? []).length;
  const close = (template.match(/\}/g) ?? []).length;
  return open === close;
}

function includesAny(value: string, words: string[]): boolean {
  return words.some((word) => value.includes(word));
}

export function guessField(
  placeholder: string,
  columns: ExportColumn[],
  dict: Dictionary,
): PatternField {
  const lower = placeholder.toLowerCase();
  const customKeys = columns
    .filter((column) => column.source === "custom")
    .map((column) => column.key);
  const hasTarget = (key: string) =>
    (CANONICAL_TARGETS as readonly string[]).includes(key) || customKeys.includes(key);

  const exactTarget =
    (CANONICAL_TARGETS as readonly string[]).find(
      (key) => key.toLowerCase() === lower,
    ) ?? customKeys.find((key) => key.toLowerCase() === lower);
  if (exactTarget) {
    return {
      placeholder,
      target: exactTarget,
      type:
        exactTarget === "value"
          ? "number"
          : exactTarget === "month"
            ? "month"
            : "text",
    };
  }

  if (includesAny(lower, ["amount", "value", "price", "total", "مبلغ", "قيمة", "سعر"])) {
    return { placeholder, target: "value", type: "number" };
  }
  if (includesAny(lower, ["month", "شهر"])) {
    return { placeholder, target: "month", type: "month" };
  }
  if (includesAny(lower, ["phone", "هاتف", "جوال", "موبايل"])) {
    const target = customKeys.find((key) => includesAny(key.toLowerCase(), ["phone"])) ??
      customKeys[0];
    if (target) {
      return { placeholder, target, type: "word" };
    }
  }
  if (includesAny(lower, ["name", "customer", "اسم", "عميل"])) {
    return { placeholder, target: "name", type: "text" };
  }
  const target = hasTarget("description")
    ? "description"
    : customKeys[0] ?? "description";
  return { placeholder, target, type: "text" };
}

export function nextNumberedName(base: string, names: string[]): string {
  const used = new Set(names.map((name) => name.trim().toLowerCase()));
  let index = 1;
  while (used.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

export function starterPattern(
  dict: Dictionary,
  columns: ExportColumn[] = [],
  index = 1,
): PatternDefinition {
  return {
    name: `${dict.patternsDefaultName} ${index}`,
    template: "{value} {description}",
    fields: [
      { placeholder: "value", target: "value", type: "number" },
      {
        placeholder: "description",
        target: "description",
        type: "text",
      },
    ],
    defaults: {},
    enabled: true,
    export_columns: columns.map((column) => ({ ...column })),
  };
}

export function targetOptions(
  columns: ExportColumn[],
  dict: Dictionary,
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = CANONICAL_TARGETS.map(
    (key) => ({
      value: key,
      label: fieldLabel(key, dict),
    }),
  );
  for (const column of columns) {
    if (column.source !== "custom") continue;
    if (options.some((option) => option.value === column.key)) continue;
    options.push({ value: column.key, label: column.header });
  }
  return options;
}

export function nextCustomKey(columns: ExportColumn[], base = "custom"): string {
  const used = new Set(columns.map((column) => column.key));
  let index = 1;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}
