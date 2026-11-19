"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon } from "@/components/Icons";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n-context";
import {
  defaultExportColumn,
  fieldKeysFor,
  fieldLabel,
  nextCustomKey,
} from "@/lib/patterns";
import type { ExportColumn } from "@/lib/types";

type ExportColumnsEditorProps = {
  idPrefix: string;
  kind: "telegram" | "whatsapp";
  columns: ExportColumn[];
  onChange: (columns: ExportColumn[]) => void;
  onKeyRename?: (oldKey: string, newKey: string) => void;
  title: string;
  hint: string;
  emptyLabel: string;
  compact?: boolean;
};

export function ExportColumnsEditor({
  idPrefix,
  kind,
  columns,
  onChange,
  onKeyRename,
  title,
  hint,
  emptyLabel,
  compact = false,
}: ExportColumnsEditorProps) {
  const { dict } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const fields = fieldKeysFor(kind);
  const availableFields = fields.filter(
    (field) => !columns.some((column) => column.key === field),
  );

  useEffect(() => {
    if (!pickerOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  const update = (index: number, patch: Partial<ExportColumn>) => {
    onChange(
      columns.map((column, position) =>
        position === index ? { ...column, ...patch } : column,
      ),
    );
  };

  const changeSource = (index: number, source: ExportColumn["source"]) => {
    const oldKey = columns[index]?.key;
    const next = columns.map((column, position) => {
      if (position !== index) return column;
      if (source === "field") {
        const field = column.field ?? fields[0] ?? "value";
        return { ...column, source, field, key: field };
      }
      return {
        ...column,
        source,
        field: null,
        key: column.key || nextCustomKey(columns),
      };
    });
    onChange(next);
    const newKey = next[index]?.key;
    if (oldKey && newKey && oldKey !== newKey) onKeyRename?.(oldKey, newKey);
  };

  const changeField = (index: number, field: string) => {
    const oldKey = columns[index]?.key;
    update(index, { field, key: field });
    if (oldKey && oldKey !== field) onKeyRename?.(oldKey, field);
  };

  const changeKey = (index: number, key: string) => {
    const oldKey = columns[index]?.key;
    update(index, { key });
    if (oldKey && oldKey !== key) onKeyRename?.(oldKey, key);
  };

  const add = (field: string) => {
    if (columns.some((column) => column.key === field)) return;
    onChange([...columns, defaultExportColumn(field, dict)]);
    setPickerOpen(false);
  };

  const remove = (index: number) => {
    onChange(columns.filter((_, position) => position !== index));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className={compact ? "mt-3" : "card p-5"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            className={
              compact
                ? "text-sm font-medium text-stone-700"
                : "text-base font-semibold text-stone-900"
            }
          >
            {title}
          </h3>
          <p
            className={
              compact
                ? "mt-0.5 text-xs text-stone-400"
                : "mt-1 text-sm text-stone-500"
            }
          >
            {hint}
          </p>
        </div>
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            className="btn btn-secondary h-9 text-xs"
            onClick={() => setPickerOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={pickerOpen}
          >
            <PlusIcon className="h-4 w-4" />
            {dict.patternsAddColumn}
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
          {pickerOpen ? (
            <div
              role="menu"
              className="absolute end-0 z-30 mt-2 w-64 rounded-xl border border-stone-200 bg-white p-1 shadow-lg"
            >
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                {dict.patternsAddColumnHint}
              </p>
              {fields.map((field) => {
                const used = columns.some((column) => column.key === field);
                return (
                  <button
                    key={field}
                    type="button"
                    role="menuitem"
                    disabled={used}
                    onClick={() => add(field)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-xs transition",
                      used
                        ? "cursor-not-allowed text-stone-300"
                        : "text-stone-700 hover:bg-emerald-50 hover:text-emerald-800",
                    )}
                  >
                    <span>{fieldLabel(field, dict)}</span>
                    <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-500">
                      {field}
                    </code>
                  </button>
                );
              })}
              {availableFields.length === 0 ? (
                <p className="px-3 py-2 text-xs text-stone-400">
                  {dict.patternsAllColumnsAdded}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {columns.length === 0 ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {columns.map((column, index) => (
            <div
              key={`${idPrefix}-${index}`}
              className="grid gap-2 rounded-xl border border-stone-200 p-3 lg:grid-cols-[minmax(130px,1fr)_minmax(110px,0.8fr)_150px_auto] lg:items-end"
            >
              <div>
                <label className="label text-xs">{dict.patternsColumnHeader}</label>
                <input
                  className="input h-9 py-1.5 text-xs"
                  value={column.header}
                  maxLength={100}
                  onChange={(event) => update(index, { header: event.target.value })}
                  dir="auto"
                />
              </div>

              <div>
                <label className="label text-xs">{dict.patternsColumnSource}</label>
                <select
                  className="input h-9 py-1.5 text-xs"
                  value={column.source}
                  onChange={(event) =>
                    changeSource(index, event.target.value as ExportColumn["source"])
                  }
                >
                  <option value="field">{dict.patternsSourceField}</option>
                  <option value="custom">{dict.patternsSourceCustom}</option>
                  <option value="constant">{dict.patternsSourceConstant}</option>
                </select>
              </div>

              {column.source === "field" ? (
                <div>
                  <label className="label text-xs">{dict.patternsColumnField}</label>
                  <select
                    className="input h-9 py-1.5 text-xs"
                    value={column.field ?? ""}
                    onChange={(event) => changeField(index, event.target.value)}
                  >
                    {fields.map((field) => (
                      <option key={field} value={field}>
                        {fieldLabel(field, dict)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="label text-xs">{dict.patternsColumnKey}</label>
                  <input
                    className="input h-9 py-1.5 font-mono text-xs"
                    value={column.key}
                    maxLength={100}
                    onChange={(event) => changeKey(index, event.target.value)}
                    dir="ltr"
                  />
                </div>
              )}

              <div className="flex items-end gap-1">
                <button
                  type="button"
                  className="btn btn-ghost h-9 px-2"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  title={dict.patternsMoveUp}
                >
                  <ChevronUpIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost h-9 px-2"
                  onClick={() => move(index, 1)}
                  disabled={index === columns.length - 1}
                  title={dict.patternsMoveDown}
                >
                  <ChevronDownIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost h-9 px-2 text-rose-600 hover:bg-rose-50"
                  onClick={() => remove(index)}
                  title={dict.patternsRemoveColumn}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="lg:col-span-2">
                <label className="label text-xs">{dict.patternsColumnDefault}</label>
                <input
                  className="input h-9 py-1.5 text-xs"
                  value={column.default ?? ""}
                  maxLength={500}
                  onChange={(event) =>
                    update(index, { default: event.target.value || null })
                  }
                  placeholder={dict.patternsColumnDefault}
                  dir="auto"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
