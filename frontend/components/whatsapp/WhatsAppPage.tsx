"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangleIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "@/components/Icons";
import { PatternProfileEditor } from "@/components/patterns/PatternProfileEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { apiFetchBlob, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMonth, formatNumber } from "@/lib/format";
import {
  useCopyWhatsappProfile,
  useCreateWhatsappProfile,
  useDeleteWhatsappProfile,
  useListeners,
  useParseWhatsapp,
  useUpdateWhatsappProfile,
  useWhatsappProfiles,
} from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import { defaultColumns, nextNumberedName } from "@/lib/patterns";
import type {
  DateOrder,
  PatternProfilePayload,
  WhatsAppParseResponse,
  WhatsAppRow,
} from "@/lib/types";

const MAX_BYTES = 40 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WhatsAppPage() {
  const { dict, lang } = useI18n();
  const profilesQuery = useWhatsappProfiles();
  const listenersQuery = useListeners();
  const createProfile = useCreateWhatsappProfile();
  const updateProfile = useUpdateWhatsappProfile();
  const deleteProfile = useDeleteWhatsappProfile();
  const copyProfile = useCopyWhatsappProfile();
  const parseExport = useParseWhatsapp();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [copyListenerId, setCopyListenerId] = useState("");
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder | "">("");
  const [dragging, setDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<WhatsAppParseResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [senderFilter, setSenderFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const profiles = profilesQuery.data ?? [];
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedId) ?? null;

  useEffect(() => {
    if (profiles.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !profiles.some((profile) => profile.id === selectedId)) {
      setSelectedId(profiles[0].id);
    }
  }, [profiles, selectedId]);

  useEffect(() => {
    setResult(null);
    setParseError(null);
    setExportError(null);
    setCopySuccess(false);
  }, [selectedId]);

  const months = useMemo(() => {
    const values = new Set<number>();
    for (const row of result?.rows ?? []) {
      if (row.month) values.add(row.month);
    }
    return [...values].sort((a, b) => a - b);
  }, [result]);

  const filteredRows = useMemo(() => {
    if (!result) return [];
    const needle = search.trim().toLowerCase();
    return result.rows.filter((row) => {
      if (monthFilter && String(row.month ?? "") !== monthFilter) return false;
      if (senderFilter && row.sender !== senderFilter) return false;
      if (!needle) return true;
      const haystack = [
        row.raw,
        row.name,
        row.description,
        row.sender,
        row.source,
        ...row.cells,
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [result, search, monthFilter, senderFilter]);

  const hasFilters = Boolean(search || monthFilter || senderFilter);

  const create = async () => {
    setProfileError(null);
    try {
      const created = await createProfile.mutateAsync({
        name: nextNumberedName(
          dict.profilesDefaultName,
          profiles.map((profile) => profile.name),
        ),
        patterns: [],
        export_columns: defaultColumns("whatsapp", dict),
        fallback_to_default: true,
      });
      setSelectedId(created.id);
      setShowEditor(true);
    } catch (error) {
      setProfileError(errorMessage(error, dict.genericError));
    }
  };

  const save = async (payload: PatternProfilePayload) => {
    if (!selectedProfile) return;
    await updateProfile.mutateAsync({ id: selectedProfile.id, payload });
  };

  const copy = async () => {
    if (!selectedProfile || !copyListenerId) return;
    setCopyError(null);
    setCopySuccess(false);
    try {
      await copyProfile.mutateAsync({
        profileId: selectedProfile.id,
        listenerId: copyListenerId,
      });
      setEditorVersion((value) => value + 1);
      setCopySuccess(true);
      setShowEditor(true);
    } catch (error) {
      setCopyError(errorMessage(error, dict.genericError));
    }
  };

  const remove = async () => {
    if (!selectedProfile) return;
    setDeleteError(null);
    try {
      await deleteProfile.mutateAsync(selectedProfile.id);
      setConfirmDelete(false);
      setShowEditor(false);
      setSelectedId(null);
    } catch (error) {
      setDeleteError(errorMessage(error, dict.genericError));
    }
  };

  const chooseFile = (next: File) => {
    setParseError(null);
    setExportError(null);
    if (!next.name.toLowerCase().endsWith(".txt")) {
      setParseError(dict.whatsappInvalidFile);
      return;
    }
    if (next.size > MAX_BYTES) {
      setParseError(dict.whatsappFileTooLarge);
      return;
    }
    setFile(next);
    setResult(null);
    setSearch("");
    setMonthFilter("");
    setSenderFilter("");
  };

  const parse = async () => {
    if (!file || !selectedProfile) return;
    setParseError(null);
    setExportError(null);
    try {
      const data = await parseExport.mutateAsync({
        profileId: selectedProfile.id,
        file,
        dateOrder: dateOrder || null,
      });
      setResult(data);
      setSearch("");
      setMonthFilter("");
      setSenderFilter("");
    } catch (error) {
      setResult(null);
      setParseError(errorMessage(error, dict.genericError));
    }
  };

  const exportRows = async () => {
    if (!selectedProfile || filteredRows.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      const { blob, filename } = await apiFetchBlob("/api/whatsapp/export.xlsx", {
        method: "POST",
        body: JSON.stringify({
          profile_id: selectedProfile.id,
          rows: filteredRows,
        }),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? "whatsapp-payments.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(errorMessage(error, dict.genericError));
    } finally {
      setExporting(false);
    }
  };

  const listenerOptions = listenersQuery.data ?? [];
  const actionError =
    profileError ??
    (profilesQuery.isError
      ? errorMessage(profilesQuery.error, dict.genericError)
      : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          {dict.whatsappTitle}
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-stone-500">
          {dict.whatsappSubtitle}
        </p>
      </div>

      {profilesQuery.isLoading ? (
        <div className="space-y-3">
          <div className="skeleton h-28 w-full" />
          <div className="skeleton h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  {dict.whatsappProfiles}
                </h2>
                <p className="mt-1 text-xs text-stone-400">{dict.whatsappPrivacy}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedProfile ? (
                  <button
                    type="button"
                    className="btn btn-ghost h-9 text-xs text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      setDeleteError(null);
                      setConfirmDelete(true);
                    }}
                    title={dict.whatsappDeleteProfile}
                  >
                    <TrashIcon className="h-4 w-4" />
                    {dict.whatsappDeleteProfile}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary h-9 text-xs"
                  onClick={() => void create()}
                  disabled={createProfile.isPending}
                >
                  {createProfile.isPending ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <PlusIcon className="h-4 w-4" />
                  )}
                  {dict.whatsappNewProfile}
                </button>
              </div>
            </div>

            {profiles.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center">
                <p className="text-sm font-medium text-stone-700">
                  {dict.whatsappNoProfiles}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  {dict.whatsappNoProfilesHint}
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div>
                  <label className="label" htmlFor="whatsapp-profile">
                    {dict.whatsappSelectProfile}
                  </label>
                  <select
                    id="whatsapp-profile"
                    className="input"
                    value={selectedProfile?.id ?? ""}
                    onChange={(event) => {
                      setSelectedId(event.target.value || null);
                      setShowEditor(false);
                    }}
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedProfile ? (
                  <button
                    type="button"
                    className="btn btn-secondary md:mb-0"
                    onClick={() => setShowEditor((value) => !value)}
                  >
                    {showEditor ? dict.whatsappHidePatterns : dict.whatsappEditPatterns}
                  </button>
                ) : null}
              </div>
            )}

            {actionError ? (
              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {actionError}
              </p>
            ) : null}
          </div>

          {profiles.length > 0 ? (
            <div className="card p-5">
              <h2 className="text-base font-semibold text-stone-900">
                {dict.whatsappCopyFrom}
              </h2>
              {listenerOptions.length === 0 ? (
                <p className="mt-2 text-xs text-stone-400">
                  {dict.whatsappNoListenerProfiles}
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    className="input sm:max-w-sm"
                    value={copyListenerId}
                    onChange={(event) => {
                      setCopyListenerId(event.target.value);
                      setCopyError(null);
                      setCopySuccess(false);
                    }}
                  >
                    <option value="">{dict.whatsappCopyFrom}</option>
                    {listenerOptions.map((listener) => (
                      <option key={listener.id} value={listener.id}>
                        {listener.label ||
                          listener.chat_title ||
                          listener.channel_input}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void copy()}
                    disabled={
                      !selectedProfile || !copyListenerId || copyProfile.isPending
                    }
                  >
                    {copyProfile.isPending ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <CopyIcon className="h-4 w-4" />
                    )}
                    {copyProfile.isPending ? dict.saving : dict.whatsappCopy}
                  </button>
                </div>
              )}
              {copyError ? (
                <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {copyError}
                </p>
              ) : null}
              {copySuccess ? (
                <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {dict.whatsappCopySuccess}
                </p>
              ) : null}
            </div>
          ) : null}

          {showEditor && selectedProfile ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-stone-900">
                  {selectedProfile.name}
                </h2>
              </div>
              <PatternProfileEditor
                key={`${selectedProfile.id}-${editorVersion}`}
                initial={selectedProfile}
                kind="whatsapp"
                defaultName={nextNumberedName(
                  dict.profilesDefaultName,
                  profiles.map((profile) => profile.name),
                )}
                onSave={save}
                onDelete={async () => {
                  await deleteProfile.mutateAsync(selectedProfile.id);
                  setShowEditor(false);
                  setSelectedId(null);
                }}
              />
            </div>
          ) : null}

          {profiles.length > 0 ? (
            <>
              <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-stone-900">
                      {dict.whatsappUploadTitle}
                    </h2>
                    <p className="mt-1 text-xs text-stone-400">
                      {dict.whatsappUploadHint}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-stone-500">
                      {dict.whatsappDateOrder}
                    </label>
                    <select
                      className="input h-9 w-auto py-1 text-xs"
                      value={dateOrder}
                      onChange={(event) =>
                        setDateOrder(event.target.value as DateOrder | "")
                      }
                    >
                      <option value="">{dict.whatsappDateAuto}</option>
                      <option value="dmy">{dict.whatsappDmy}</option>
                      <option value="mdy">{dict.whatsappMdy}</option>
                    </select>
                  </div>
                </div>

                <input
                  ref={fileInput}
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={(event) => {
                    const next = event.target.files?.[0];
                    if (next) chooseFile(next);
                    event.target.value = "";
                  }}
                />

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInput.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      fileInput.current?.click();
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const next = event.dataTransfer.files?.[0];
                    if (next) chooseFile(next);
                  }}
                  className={cn(
                    "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
                    dragging
                      ? "border-emerald-500 bg-emerald-50/60"
                      : "border-stone-300 hover:border-emerald-400 hover:bg-stone-50",
                  )}
                >
                  {file ? (
                    <>
                      <FileIcon className="h-7 w-7 text-emerald-600" />
                      <p className="mt-2 max-w-full truncate text-sm font-medium text-stone-800" dir="auto">
                        {file.name}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-400">
                        {formatBytes(file.size)} · {dict.whatsappChooseFile}
                      </p>
                    </>
                  ) : (
                    <>
                      <UploadIcon className="h-7 w-7 text-stone-400" />
                      <p className="mt-2 text-sm font-medium text-stone-700">
                        {dict.whatsappDrop}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-400">
                        {dict.whatsappChooseFile}
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-stone-400">{dict.whatsappFileTooLarge}</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void parse()}
                    disabled={!file || !selectedProfile || parseExport.isPending}
                  >
                    {parseExport.isPending ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <UploadIcon className="h-4 w-4" />
                    )}
                    {parseExport.isPending
                      ? dict.whatsappParsing
                      : result
                        ? dict.whatsappReparse
                        : dict.whatsappParse}
                  </button>
                </div>

                {parseError ? (
                  <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {parseError}
                  </p>
                ) : null}
              </div>

              {result ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      { label: dict.whatsappMessages, value: result.message_count, tone: "bg-sky-50 text-sky-600" },
                      { label: dict.whatsappRows, value: result.row_count, tone: "bg-emerald-50 text-emerald-600" },
                      { label: dict.whatsappUnmatched, value: result.unmatched_messages, tone: "bg-amber-50 text-amber-600" },
                      { label: dict.whatsappTotalSyp, value: result.total_syp, tone: "bg-emerald-50 text-emerald-600" },
                      { label: dict.whatsappTotalUsd, value: result.total_usd, tone: "bg-violet-50 text-violet-600" },
                    ].map((stat) => (
                      <div key={stat.label} className="card p-4">
                        <p className="truncate text-xs font-medium text-stone-400">
                          {stat.label}
                        </p>
                        <p className={`mt-2 inline-flex rounded-lg px-2 py-1 text-lg font-semibold ${stat.tone}`}>
                          {formatNumber(stat.value, lang)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {result.date_order_ambiguous ? (
                    <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{dict.whatsappAmbiguous}</p>
                    </div>
                  ) : null}

                  {result.errors.length > 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <p className="font-semibold">{dict.whatsappErrors}</p>
                      <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs">
                        {result.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="card overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
                      <div>
                        <h2 className="text-base font-semibold text-stone-900">
                          {dict.whatsappSearch}
                        </h2>
                        <p className="mt-0.5 text-xs text-stone-400">
                          {formatNumber(filteredRows.length, lang)} /{" "}
                          {formatNumber(result.rows.length, lang)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void exportRows()}
                        disabled={exporting || filteredRows.length === 0}
                      >
                        {exporting ? (
                          <Spinner className="h-4 w-4" />
                        ) : (
                          <DownloadIcon className="h-4 w-4" />
                        )}
                        {exporting ? dict.whatsappExporting : dict.whatsappExport}
                      </button>
                    </div>

                    <div className="grid gap-2 border-b border-stone-200 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_150px_180px_auto]">
                      <div className="relative">
                        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                        <input
                          className="input h-9 ps-9 text-xs"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={dict.whatsappSearch}
                          dir="auto"
                        />
                      </div>
                      <select
                        className="input h-9 py-1 text-xs"
                        value={monthFilter}
                        onChange={(event) => setMonthFilter(event.target.value)}
                      >
                        <option value="">{dict.allMonths}</option>
                        {months.map((month) => (
                          <option key={month} value={month}>
                            {formatMonth(month, lang)}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input h-9 py-1 text-xs"
                        value={senderFilter}
                        onChange={(event) => setSenderFilter(event.target.value)}
                      >
                        <option value="">{dict.whatsappSender}</option>
                        {result.senders.map((sender) => (
                          <option key={sender} value={sender}>
                            {sender}
                          </option>
                        ))}
                      </select>
                      {hasFilters ? (
                        <button
                          type="button"
                          className="btn btn-ghost h-9 px-2 text-xs"
                          onClick={() => {
                            setSearch("");
                            setMonthFilter("");
                            setSenderFilter("");
                          }}
                        >
                          <XIcon className="h-4 w-4" />
                          {dict.resetFilters}
                        </button>
                      ) : null}
                    </div>

                    {exportError ? (
                      <p className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm text-rose-700">
                        {exportError}
                      </p>
                    ) : null}

                    <div className="overflow-x-auto">
                      {filteredRows.length === 0 ? (
                        <div className="px-5 py-10 text-center">
                          <p className="text-sm font-medium text-stone-700">
                            {dict.whatsappNoRows}
                          </p>
                          <p className="mt-1 text-xs text-stone-400">
                            {dict.whatsappNoRowsHint}
                          </p>
                        </div>
                      ) : (
                        <table className="w-full min-w-[760px] text-start text-xs">
                          <thead>
                            <tr className="border-b border-stone-200 bg-stone-50 text-[11px] uppercase tracking-wide text-stone-400">
                              {result.columns.map((column) => (
                                <th
                                  key={column.key}
                                  className="whitespace-nowrap px-4 py-2.5 text-start font-semibold"
                                >
                                  {column.header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {filteredRows.map((row: WhatsAppRow, index) => (
                              <tr key={index} className="hover:bg-stone-50/60">
                                {row.cells.map((cell, cellIndex) => (
                                  <td
                                    key={cellIndex}
                                    className="max-w-[320px] truncate whitespace-nowrap px-4 py-2.5 text-stone-600"
                                    title={cell}
                                  >
                                    {cell || "—"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {confirmDelete && selectedProfile ? (
            <ConfirmDialog
              title={dict.whatsappDeleteProfile}
              text={dict.whatsappDeleteProfileText}
              confirmLabel={dict.delete}
              pendingLabel={dict.deleting}
              pending={deleteProfile.isPending}
              error={deleteError}
              onClose={() => setConfirmDelete(false)}
              onConfirm={() => void remove()}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
