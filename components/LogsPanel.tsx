"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ActivityIcon,
  AlertTriangleIcon,
  BotIcon,
  RefreshIcon,
  TrashIcon,
} from "@/components/Icons";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { useDeleteLog, useLogs } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import type { LogFilters, LogItem, LogKind, LogLevel } from "@/lib/types";

type KindFilter = "all" | LogKind;
type LevelFilter = "all" | LogLevel;

export function LogsPanel({
  listenerId,
  running,
}: {
  listenerId: string;
  running: boolean;
}) {
  const { dict, lang } = useI18n();
  const [kind, setKind] = useState<KindFilter>("all");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [autoRefresh, setAutoRefresh] = useState(running);
  const [pendingDelete, setPendingDelete] = useState<LogItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteLog = useDeleteLog(listenerId);

  useEffect(() => {
    setAutoRefresh(running);
  }, [running]);

  const filters = useMemo<LogFilters>(
    () => ({
      kind: kind === "all" ? undefined : kind,
      level: level === "all" ? undefined : level,
    }),
    [kind, level],
  );

  const query = useLogs(listenerId, filters, autoRefresh);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  const levelOptions: { value: LevelFilter; label: string }[] = [
    { value: "all", label: dict.all },
    { value: "error", label: dict.errors },
    { value: "warning", label: dict.warning },
    { value: "info", label: dict.info },
  ];

  const kindOptions: { value: KindFilter; label: string }[] = [
    { value: "all", label: dict.all },
    { value: "message", label: dict.messages },
    { value: "event", label: dict.events },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-stone-100 p-1">
          {kindOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
                kind === option.value
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as LevelFilter)}
            className="h-9 rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-medium text-stone-600 outline-none focus:border-emerald-500"
            aria-label={dict.statusLabel}
          >
            {levelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setAutoRefresh((value) => !value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition",
              autoRefresh
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-stone-300 bg-white text-stone-500",
            )}
            title={dict.autoRefresh}
          >
            <RefreshIcon className={cn("h-3.5 w-3.5", autoRefresh && "animate-spin")} />
            {dict.autoRefresh}
            <span className="text-[10px] opacity-70">
              {autoRefresh ? dict.on : dict.off}
            </span>
          </button>
        </div>
      </div>

      {items.some((item) => item.kind === "message") ? (
        <p className="border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-[11px] leading-5 text-amber-800">
          {dict.telegramDeletionNotice}
        </p>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-4 p-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-3">
              <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3 w-1/3" />
                <div className="skeleton h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <div className="px-4 py-10 text-center">
          <AlertTriangleIcon className="mx-auto h-6 w-6 text-rose-500" />
          <p className="mt-2 text-sm text-stone-600">
            {errorMessage(query.error, dict.loadFailed)}
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-4 h-9 text-xs"
            onClick={() => void query.refetch()}
          >
            {dict.retry}
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon className="h-7 w-7" />}
          title={dict.noLogs}
          description={dict.noLogsHint}
        />
      ) : (
        <>
          <ul className="divide-y divide-stone-100">
            {items.map((item) => {
              const isError = item.level === "error";
              const isWarning = item.level === "warning";
              const levelLabel =
                item.level === "error"
                  ? dict.errors
                  : item.level === "warning"
                    ? dict.warning
                    : dict.info;

              return (
                <li key={item.id} className="flex gap-3 px-4 py-3.5">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      isError
                        ? "bg-rose-50 text-rose-600"
                        : isWarning
                          ? "bg-amber-50 text-amber-600"
                          : item.kind === "message"
                            ? "bg-sky-50 text-sky-600"
                            : "bg-stone-100 text-stone-500",
                    )}
                  >
                    {item.kind === "message" ? (
                      <BotIcon className="h-4 w-4" />
                    ) : (
                      <ActivityIcon className="h-4 w-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "badge",
                          item.kind === "message"
                            ? "bg-sky-50 text-sky-700"
                            : "bg-stone-100 text-stone-600",
                        )}
                      >
                        {item.kind === "message" ? dict.messages : dict.events}
                      </span>
                      {item.level !== "info" ? (
                        <span
                          className={cn(
                            "badge",
                            isError
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700",
                          )}
                        >
                          {levelLabel}
                        </span>
                      ) : null}
                      {item.parsed_count > 0 ? (
                        <span className="badge bg-emerald-50 text-emerald-700">
                          {item.parsed_count} {dict.parsed}
                        </span>
                      ) : null}
                      {item.edited_at ? (
                        <span className="badge bg-violet-50 text-violet-700">
                          {dict.edited}
                        </span>
                      ) : null}
                      {item.message_id ?? item.update_id ? (
                        <span className="text-[11px] text-stone-400" dir="ltr">
                          #{item.message_id ?? item.update_id}
                        </span>
                      ) : null}
                      <time className="ms-auto text-[11px] text-stone-400">
                        {formatDateTime(item.created_at, lang)}
                      </time>
                      {item.kind === "message" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(item);
                          }}
                          className="rounded-md p-1 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600"
                          title={dict.deleteMessage}
                          aria-label={dict.deleteMessage}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">
                      {item.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {query.hasNextPage ? (
            <div className="border-t border-stone-200 p-3">
              <button
                type="button"
                className="btn btn-secondary h-9 w-full text-xs"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? <Spinner className="h-4 w-4" /> : null}
                {dict.loadOlder}
              </button>
            </div>
          ) : null}
        </>
      )}

      {pendingDelete ? (
        <ConfirmDialog
          title={dict.deleteMessageTitle}
          text={dict.deleteMessageText}
          confirmLabel={dict.deleteMessage}
          pendingLabel={dict.deleting}
          pending={deleteLog.isPending}
          error={deleteError}
          onClose={() => {
            if (!deleteLog.isPending) {
              setPendingDelete(null);
            }
          }}
          onConfirm={() =>
            deleteLog.mutate(pendingDelete.id, {
              onSuccess: () => {
                setPendingDelete(null);
                setDeleteError(null);
              },
              onError: (error) =>
                setDeleteError(errorMessage(error, dict.genericError)),
            })
          }
        />
      ) : null}
    </div>
  );
}
