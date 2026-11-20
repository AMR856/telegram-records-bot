"use client";

import { useEffect, useMemo, useState } from "react";

import { PlusIcon, TrashIcon } from "@/components/Icons";
import { ExportColumnsEditor } from "@/components/patterns/ExportColumnsEditor";
import { TemplateInput } from "@/components/patterns/TemplateInput";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { apiFetch, errorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n-context";
import {
  CANONICAL_TARGETS,
  defaultColumns,
  extractPlaceholders,
  fieldLabel,
  guessField,
  hasBalancedBraces,
  nextNumberedName,
  patternTypeLabel,
  starterPattern,
  targetOptions,
} from "@/lib/patterns";
import type {
  ExportColumn,
  ParserProfile,
  PatternDefinition,
  PatternField,
  PatternPreviewResponse,
  PatternProfilePayload,
  PatternType,
} from "@/lib/types";

const DEFAULT_SAMPLE =
  "550 فاتورة نجارة\n1350 عمرو محمد مهدي النص تسديد شهر 11";

function renamePatternTargets(
  pattern: PatternDefinition,
  oldKey: string,
  newKey: string,
): PatternDefinition {
  return {
    ...pattern,
    fields: pattern.fields.map((field) =>
      field.target === oldKey ? { ...field, target: newKey } : field,
    ),
    defaults: Object.fromEntries(
      Object.entries(pattern.defaults).map(([target, value]) => [
        target === oldKey ? newKey : target,
        value,
      ]),
    ),
  };
}

type EditorProps = {
  initial: ParserProfile | null;
  kind: "telegram" | "whatsapp";
  onSave: (payload: PatternProfilePayload) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  defaultName?: string;
};

export function PatternProfileEditor({
  initial,
  kind,
  onSave,
  onDelete,
  defaultName,
}: EditorProps) {
  const { dict } = useI18n();
  const fallbackName =
    defaultName ?? `${dict.profilesDefaultName} 1`;
  const [name, setName] = useState(initial?.name ?? fallbackName);
  const [columns, setColumns] = useState<ExportColumn[]>(() => {
    if (initial?.export_columns?.length) {
      return initial.export_columns.map((column) => ({ ...column }));
    }
    return defaultColumns(kind, dict);
  });
  const [patterns, setPatterns] = useState<PatternDefinition[]>(() => {
    if (initial) {
      return initial.patterns.map((pattern) => ({
        ...pattern,
        export_columns: (pattern.export_columns ?? []).map((column) => ({
          ...column,
        })),
      }));
    }
    return [starterPattern(dict, columns)];
  });
  const [fallback, setFallback] = useState(initial?.fallback_to_default ?? true);
  const [sample, setSample] = useState(DEFAULT_SAMPLE);
  const [preview, setPreview] = useState<PatternPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const templateSuggestions = useMemo(
    () =>
      // Only suggest keys the pattern engine can capture into payment fields.
      CANONICAL_TARGETS.map((key) => ({
        key,
        label: fieldLabel(key, dict),
      })),
    [dict],
  );

  const columnsFor = (pattern: PatternDefinition): ExportColumn[] =>
    pattern.export_columns?.length ? pattern.export_columns : columns;

  useEffect(() => {
    if (!initial) setName(fallbackName);
  }, [fallbackName, initial]);

  useEffect(() => {
    const hasPattern = patterns.some(
      (pattern) => pattern.enabled && pattern.template.trim(),
    );
    if (!sample.trim() || !hasPattern) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const data = await apiFetch<PatternPreviewResponse>("/api/patterns/preview", {
          method: "POST",
          body: JSON.stringify({
            text: sample,
            patterns,
            export_columns: columns,
          }),
        });
        if (!cancelled) {
          setPreview(data);
          setPreviewError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(errorMessage(error, dict.genericError));
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sample, patterns, columns, dict]);

  const updatePattern = (index: number, patch: Partial<PatternDefinition>) => {
    setPatterns((current) =>
      current.map((pattern, position) =>
        position === index ? { ...pattern, ...patch } : pattern,
      ),
    );
  };

  const updateTemplate = (index: number, template: string) => {
    setPatterns((current) =>
      current.map((pattern, position) => {
        if (position !== index) return pattern;
        if (!hasBalancedBraces(template)) return { ...pattern, template };
        const names = extractPlaceholders(template);
        const nextFields = names.map(
          (placeholder) =>
            pattern.fields.find((field) => field.placeholder === placeholder) ??
            guessField(placeholder, columnsFor(pattern), dict),
        );
        return { ...pattern, template, fields: nextFields };
      }),
    );
  };

  const updateField = (
    patternIndex: number,
    fieldIndex: number,
    patch: Partial<PatternField>,
  ) => {
    setPatterns((current) =>
      current.map((pattern, position) => {
        if (position !== patternIndex) return pattern;
        return {
          ...pattern,
          fields: pattern.fields.map((field, index) =>
            index === fieldIndex ? { ...field, ...patch } : field,
          ),
        };
      }),
    );
  };

  const addPattern = () => {
    setPatterns((current) => [
      ...current,
      {
        ...starterPattern(dict, columns),
        name: nextNumberedName(
          dict.patternsDefaultName,
          current.map((pattern) => pattern.name),
        ),
      },
    ]);
  };

  const addDefault = (patternIndex: number) => {
    setPatterns((current) =>
      current.map((pattern, position) => {
        if (position !== patternIndex) return pattern;
        const target = targetOptions(columnsFor(pattern), dict).find(
          (option) => !(option.value in pattern.defaults),
        );
        if (!target) return pattern;
        return {
          ...pattern,
          defaults: { ...pattern.defaults, [target.value]: "" },
        };
      }),
    );
  };

  const updateDefaultTarget = (
    patternIndex: number,
    oldTarget: string,
    newTarget: string,
  ) => {
    if (oldTarget === newTarget) return;
    setPatterns((current) =>
      current.map((pattern, position) => {
        if (position !== patternIndex) return pattern;
        const entries = Object.entries(pattern.defaults).filter(
          ([key]) => key !== oldTarget && key !== newTarget,
        );
        const value = pattern.defaults[oldTarget] ?? "";
        return {
          ...pattern,
          defaults: { ...Object.fromEntries(entries), [newTarget]: value },
        };
      }),
    );
  };

  const updateDefaultValue = (
    patternIndex: number,
    target: string,
    value: string,
  ) => {
    setPatterns((current) =>
      current.map((pattern, position) =>
        position === patternIndex
          ? { ...pattern, defaults: { ...pattern.defaults, [target]: value } }
          : pattern,
      ),
    );
  };

  const removeDefault = (patternIndex: number, target: string) => {
    setPatterns((current) =>
      current.map((pattern, position) => {
        if (position !== patternIndex) return pattern;
        const defaults = { ...pattern.defaults };
        delete defaults[target];
        return { ...pattern, defaults };
      }),
    );
  };

  const renameDefaultTarget = (oldKey: string, newKey: string) => {
    setPatterns((current) =>
      current.map((pattern) =>
        pattern.export_columns?.length
          ? pattern
          : renamePatternTargets(pattern, oldKey, newKey),
      ),
    );
  };

  const renameOwnedTarget = (
    patternIndex: number,
    oldKey: string,
    newKey: string,
  ) => {
    setPatterns((current) =>
      current.map((pattern, position) =>
        position === patternIndex
          ? renamePatternTargets(pattern, oldKey, newKey)
          : pattern,
      ),
    );
  };

  const useDefaultColumns = (patternIndex: number) => {
    updatePattern(patternIndex, { export_columns: [] });
  };

  const customizeColumns = (patternIndex: number) => {
    updatePattern(patternIndex, {
      export_columns: columns.map((column) => ({ ...column })),
    });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await onSave({
        name: name.trim() || fallbackName,
        patterns,
        export_columns: columns,
        fallback_to_default: fallback,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      setSaveError(errorMessage(error, dict.genericError));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      setConfirmDelete(false);
    } catch (error) {
      setDeleteError(errorMessage(error, dict.genericError));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label className="label" htmlFor={`profile-name-${kind}`}>
              {dict.patternsName}
            </label>
            <input
              id={`profile-name-${kind}`}
              className="input"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              dir="auto"
            />
          </div>
          <label className="flex items-center gap-2.5 pb-2.5 text-sm text-stone-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
              checked={fallback}
              onChange={(event) => setFallback(event.target.checked)}
            />
            <span>{dict.patternsFallback}</span>
          </label>
        </div>
        <p className="mt-2 text-xs text-stone-400">{dict.patternsFallbackHint}</p>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              {dict.patternsTitle}
            </h2>
            <p className="mt-1 text-sm text-stone-500">{dict.patternsSubtitle}</p>
          </div>
          <button type="button" className="btn btn-secondary h-9 text-xs" onClick={addPattern}>
            <PlusIcon className="h-4 w-4" />
            {dict.patternsAdd}
          </button>
        </div>

        {patterns.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center">
            <p className="text-sm font-medium text-stone-700">{dict.patternsEmpty}</p>
            <p className="mt-1 text-xs text-stone-400">{dict.patternsEmptyHint}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {patterns.map((pattern, patternIndex) => {
              const patternColumns = pattern.export_columns ?? [];
              const effectiveColumns = patternColumns.length
                ? patternColumns
                : columns;
              const patternTargets = targetOptions(effectiveColumns, dict);
              return (
              <div
                key={patternIndex}
                className="rounded-xl border border-stone-200 bg-stone-50/40 p-4"
              >
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[180px] flex-1">
                    <label className="label">{dict.patternsNameLabel}</label>
                    <input
                      className="input"
                      value={pattern.name}
                      maxLength={100}
                      onChange={(event) =>
                        updatePattern(patternIndex, { name: event.target.value })
                      }
                      dir="auto"
                    />
                  </div>
                  <label className="flex items-center gap-2 pb-2.5 text-sm text-stone-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                      checked={pattern.enabled}
                      onChange={(event) =>
                        updatePattern(patternIndex, { enabled: event.target.checked })
                      }
                    />
                    {dict.patternsEnabled}
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost h-9 px-3 text-xs text-rose-600 hover:bg-rose-50"
                    onClick={() =>
                      setPatterns((current) =>
                        current.filter((_, position) => position !== patternIndex),
                      )
                    }
                  >
                    <TrashIcon className="h-4 w-4" />
                    {dict.patternsRemove}
                  </button>
                </div>

                <div className="mt-3">
                  <label className="label">{dict.patternsTemplate}</label>
                  <TemplateInput
                    id={`pattern-template-${patternIndex}`}
                    value={pattern.template}
                    onChange={(template) => updateTemplate(patternIndex, template)}
                    suggestions={templateSuggestions}
                    placeholder="{value} {description}"
                    noMatchesLabel={dict.patternsNoSuggestions}
                  />
                  <p className="mt-1.5 text-xs text-stone-400">
                    {dict.patternsTemplateHint}
                  </p>
                </div>

                {pattern.fields.length === 0 ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {dict.patternsNoFields}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {pattern.fields.map((field, fieldIndex) => (
                      <div
                        key={field.placeholder}
                        className="grid gap-2 rounded-lg border border-stone-200 bg-white p-2.5 sm:grid-cols-[minmax(100px,0.8fr)_minmax(150px,1.2fr)_130px] sm:items-center"
                      >
                        <code className="truncate rounded bg-stone-100 px-2 py-1 text-xs text-stone-600" dir="ltr">
                          {"{" + field.placeholder + "}"}
                        </code>
                        <select
                          className="input h-9 py-1.5 text-xs"
                          value={field.target}
                          onChange={(event) =>
                            updateField(patternIndex, fieldIndex, {
                              target: event.target.value,
                            })
                          }
                        >
                          {!patternTargets.some(
                            (option) => option.value === field.target,
                          ) ? (
                            <option value={field.target}>{field.target}</option>
                          ) : null}
                          {patternTargets.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className="input h-9 py-1.5 text-xs"
                          value={field.type}
                          onChange={(event) =>
                            updateField(patternIndex, fieldIndex, {
                              type: event.target.value as PatternType,
                            })
                          }
                        >
                          {(["number", "text", "word", "month"] as PatternType[]).map(
                            (type) => (
                              <option key={type} value={type}>
                                {patternTypeLabel(type, dict)}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-stone-700">
                        {dict.patternsDefaults}
                      </p>
                      <p className="text-xs text-stone-400">{dict.patternsDefaultsHint}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary h-8 px-2.5 text-xs"
                      onClick={() => addDefault(patternIndex)}
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      {dict.patternsAddDefault}
                    </button>
                  </div>
                  {Object.entries(pattern.defaults).length === 0 ? null : (
                    <div className="mt-2 space-y-2">
                      {Object.entries(pattern.defaults).map(([target, value]) => (
                        <div
                          key={target}
                          className="grid gap-2 sm:grid-cols-[minmax(140px,0.8fr)_minmax(160px,1.2fr)_auto]"
                        >
                          <select
                            className="input h-9 py-1.5 text-xs"
                            value={target}
                            onChange={(event) =>
                              updateDefaultTarget(
                                patternIndex,
                                target,
                                event.target.value,
                              )
                            }
                          >
                            {!patternTargets.some(
                              (option) => option.value === target,
                            ) ? (
                              <option value={target}>{target}</option>
                            ) : null}
                            {patternTargets.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-1.5">
                            <input
                              className="input h-9 py-1.5 text-xs"
                              value={value}
                              maxLength={500}
                              onChange={(event) =>
                                updateDefaultValue(
                                  patternIndex,
                                  target,
                                  event.target.value,
                                )
                              }
                              placeholder={
                                target === "month" ? "@message / @current" : value
                              }
                              dir="auto"
                            />
                            {target === "month" ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-secondary h-9 px-2 text-[11px]"
                                  onClick={() =>
                                    updateDefaultValue(
                                      patternIndex,
                                      target,
                                      "@current",
                                    )
                                  }
                                  title={dict.patternsCurrentMonth}
                                >
                                  @current
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary h-9 px-2 text-[11px]"
                                  onClick={() =>
                                    updateDefaultValue(
                                      patternIndex,
                                      target,
                                      "@message",
                                    )
                                  }
                                  title={dict.patternsMessageMonth}
                                >
                                  @message
                                </button>
                              </>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost h-9 px-2 text-rose-600 hover:bg-rose-50"
                            onClick={() => removeDefault(patternIndex, target)}
                            title={dict.patternsRemoveDefault}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {patternColumns.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-stone-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-stone-700">
                          {dict.patternsPatternColumns}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-400">
                          {dict.patternsInheritColumns}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary h-8 px-2.5 text-xs"
                        onClick={() => customizeColumns(patternIndex)}
                      >
                        {dict.patternsCustomizeColumns}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-stone-200 bg-white p-3">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="btn btn-ghost h-8 px-2.5 text-xs"
                        onClick={() => useDefaultColumns(patternIndex)}
                      >
                        {dict.patternsUseDefaultColumns}
                      </button>
                    </div>
                    <ExportColumnsEditor
                      compact
                      idPrefix={`pattern-${patternIndex}`}
                      kind={kind}
                      columns={patternColumns}
                      onChange={(next) =>
                        updatePattern(patternIndex, { export_columns: next })
                      }
                      onKeyRename={(oldKey, newKey) =>
                        renameOwnedTarget(patternIndex, oldKey, newKey)
                      }
                      title={dict.patternsPatternColumns}
                      hint={dict.patternsPatternColumnsHint}
                      emptyLabel={dict.patternsNoColumns}
                    />
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      <ExportColumnsEditor
        idPrefix="profile"
        kind={kind}
        columns={columns}
        onChange={setColumns}
        onKeyRename={renameDefaultTarget}
        title={dict.patternsColumns}
        hint={dict.patternsColumnsHint}
        emptyLabel={dict.patternsNoColumns}
      />

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              {dict.patternsPreview}
            </h2>
            <p className="mt-1 text-sm text-stone-500">{dict.patternsPreviewHint}</p>
          </div>
          {previewLoading ? <Spinner className="h-4 w-4 text-emerald-600" /> : null}
        </div>

        <label className="label mt-4" htmlFor="pattern-sample">
          {dict.patternsSample}
        </label>
        <textarea
          id="pattern-sample"
          className="input min-h-24 resize-y font-mono text-sm leading-6"
          value={sample}
          onChange={(event) => setSample(event.target.value)}
          placeholder={dict.patternsSamplePlaceholder}
          dir="auto"
        />

        {previewError ? (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {previewError}
          </p>
        ) : null}

        {preview ? (
          <div className="mt-4 space-y-3">
            {preview.rows.length === 0 ? (
              <div className="rounded-xl border border-stone-200 px-4 py-6 text-center text-sm text-stone-500">
                {dict.patternsPreviewNoRows}
              </div>
            ) : (
              <div className="space-y-3">
                {(preview.groups?.length
                  ? preview.groups
                  : [
                      {
                        pattern: null,
                        columns: preview.columns,
                        rows: preview.rows,
                      },
                    ]
                ).map((group, groupIndex) => (
                  <div
                    key={`${group.pattern ?? "default"}-${groupIndex}`}
                    className="overflow-x-auto rounded-xl border border-stone-200"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2">
                      <span className="text-xs font-semibold text-stone-700">
                        {group.pattern ?? dict.patternsDefaultSheet}
                      </span>
                      <span className="text-[11px] text-stone-400">
                        {dict.patternsPreviewRows}
                      </span>
                    </div>
                    <table className="w-full min-w-[640px] text-start text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 bg-stone-50 text-[11px] uppercase tracking-wide text-stone-400">
                          {group.columns.map((column) => (
                            <th
                              key={column.key}
                              className="px-3 py-2 text-start font-semibold"
                            >
                              {column.header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {group.rows.map((row, index) => (
                          <tr key={index}>
                            {row.cells.map((cell, cellIndex) => (
                              <td
                                key={cellIndex}
                                className="whitespace-nowrap px-3 py-2 text-stone-600"
                              >
                                {cell || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {preview.unmatched_lines.length > 0 ? (
              <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold">{dict.patternsUnmatched}</p>
                <ul className="mt-1 space-y-1">
                  {preview.unmatched_lines.map((line, index) => (
                    <li key={index} className="font-mono" dir="auto">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.errors.length > 0 ? (
              <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <p className="font-semibold">{dict.patternsPreviewErrors}</p>
                <ul className="mt-1 space-y-1">
                  {preview.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-xs text-stone-400">{dict.patternsPreviewEmpty}</p>
        )}
      </div>

      {saveError ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {saveError}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {dict.patternsSaved}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {onDelete ? (
            <button
              type="button"
              className="btn btn-ghost text-rose-600 hover:bg-rose-50"
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
            >
              <TrashIcon className="h-4 w-4" />
              {dict.patternsDelete}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? <Spinner className="h-4 w-4" /> : null}
          {saving ? dict.saving : dict.patternsSave}
        </button>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title={dict.patternsDelete}
          text={dict.patternsDeleteConfirm}
          confirmLabel={dict.delete}
          pendingLabel={dict.deleting}
          pending={deleting}
          error={deleteError}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </div>
  );
}
