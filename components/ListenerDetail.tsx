"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BotIcon,
  PencilIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  WalletIcon,
} from "@/components/Icons";
import { ListenerFormModal } from "@/components/ListenerFormModal";
import { LogsPanel } from "@/components/LogsPanel";
import { PaymentsPanel } from "@/components/PaymentsPanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  useDeleteListener,
  useListener,
  useStartListener,
  useStopListener,
} from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";

type Tab = "logs" | "payments";

export function ListenerDetail({ id }: { id: string }) {
  const { dict, lang } = useI18n();
  const router = useRouter();
  const listenerQuery = useListener(id);
  const start = useStartListener(id);
  const stop = useStopListener(id);
  const remove = useDeleteListener(id);

  const [tab, setTab] = useState<Tab>("logs");
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const listener = listenerQuery.data;
  const pending = start.isPending || stop.isPending;
  const isRunning = listener?.status === "running";

  if (listenerQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-9 w-64" />
        <div className="skeleton h-4 w-80" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-24 w-full" />
          ))}
        </div>
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  if (listenerQuery.isError || !listener) {
    return (
      <div className="card mx-auto max-w-md p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangleIcon className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">{dict.listenerNotFound}</h1>
        <p className="mt-1.5 text-sm text-stone-500">{dict.listenerNotFoundHint}</p>
        <Link href="/" className="btn btn-secondary mt-6">
          <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" />
          {dict.back}
        </Link>
      </div>
    );
  }

  const toggle = () => {
    setActionError(null);
    const mutation = isRunning ? stop : start;
    mutation.mutate(undefined, {
      onError: (error) => setActionError(errorMessage(error, dict.genericError)),
    });
  };

  const title = listener.label || listener.chat_title || listener.channel_input;

  const stats = [
    {
      label: dict.totalPayments,
      value: formatNumber(listener.payment_count, lang),
      icon: <WalletIcon className="h-5 w-5" />,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: `${dict.totalValue} (${dict.syp})`,
      value: formatNumber(listener.total_value, lang),
      icon: <WalletIcon className="h-5 w-5" />,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      label: dict.totalValueUsd,
      value: formatNumber(listener.total_usd, lang),
      icon: <WalletIcon className="h-5 w-5" />,
      tone: "bg-violet-50 text-violet-600",
    },
    {
      label: dict.lastActivity,
      value: listener.last_activity_at
        ? formatDateTime(listener.last_activity_at, lang)
        : dict.never,
      icon: <BotIcon className="h-5 w-5" />,
      tone: "bg-sky-50 text-sky-600",
    },
  ];

  return (
    <div>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition hover:text-stone-800"
      >
        <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" />
        {dict.back}
      </Link>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-stone-900">
              {title}
            </h1>
            <StatusBadge status={listener.status} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-500">
            {listener.bot_username ? (
              <span className="inline-flex items-center gap-1.5">
                <BotIcon className="h-3.5 w-3.5" />
                @{listener.bot_username}
              </span>
            ) : null}
            <span dir="ltr">{listener.channel_input}</span>
            <span className="inline-flex items-center gap-1.5">
              {dict.token}:{" "}
              <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-600" dir="ltr">
                {listener.token_hint}
              </code>
            </span>
            <span>
              {dict.created}: {formatDateTime(listener.created_at, lang)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className={isRunning ? "btn btn-secondary" : "btn btn-primary"}
          >
            {pending ? (
              <Spinner className="h-4 w-4" />
            ) : isRunning ? (
              <StopIcon className="h-4 w-4" />
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
            {pending
              ? isRunning
                ? dict.stopping
                : dict.starting
              : isRunning
                ? dict.stopListening
                : dict.startListening}
          </button>
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            disabled={isRunning}
            title={isRunning ? dict.editRequiresStop : dict.edit}
            className="btn btn-secondary"
          >
            <PencilIcon className="h-4 w-4" />
            {dict.edit}
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setShowDelete(true);
            }}
            className="btn btn-ghost text-rose-600 hover:bg-rose-50"
            title={dict.delete}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {listener.last_error ? (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{dict.lastError}</p>
            <p className="mt-0.5 leading-6">{listener.last_error}</p>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card flex items-center gap-3.5 p-4">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.tone}`}
            >
              {stat.icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-stone-400">{stat.label}</p>
              <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-stone-900">
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-1 border-b border-stone-200">
        {(
          [
            { id: "logs" as const, label: dict.logs },
            { id: "payments" as const, label: dict.payments },
          ]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition",
              tab === item.id
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-stone-500 hover:text-stone-800",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "logs" ? (
          <LogsPanel listenerId={listener.id} running={isRunning} />
        ) : (
          <PaymentsPanel listenerId={listener.id} running={isRunning} />
        )}
      </div>

      {showEdit ? (
        <ListenerFormModal
          mode="edit"
          listener={listener}
          onClose={() => setShowEdit(false)}
        />
      ) : null}

      {showDelete ? (
        <ConfirmDialog
          title={dict.confirmDeleteTitle}
          text={dict.confirmDeleteText}
          confirmLabel={dict.deleteListener}
          pendingLabel={dict.deleting}
          pending={remove.isPending}
          error={deleteError}
          onClose={() => setShowDelete(false)}
          onConfirm={() =>
            remove.mutate(undefined, {
              onSuccess: () => {
                router.replace("/");
                router.refresh();
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
