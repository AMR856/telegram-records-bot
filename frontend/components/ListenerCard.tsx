"use client";

import Link from "next/link";
import { useState } from "react";

import {
  BotIcon,
  ExternalLinkIcon,
  PlayIcon,
  StopIcon,
} from "@/components/Icons";
import { Spinner } from "@/components/ui/Spinner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { errorMessage } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { useStartListener, useStopListener } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import type { Listener } from "@/lib/types";

export function ListenerCard({ listener }: { listener: Listener }) {
  const { dict, lang } = useI18n();
  const [actionError, setActionError] = useState<string | null>(null);
  const start = useStartListener(listener.id);
  const stop = useStopListener(listener.id);
  const pending = start.isPending || stop.isPending;
  const isRunning = listener.status === "running";
  const title = listener.label || listener.chat_title || listener.channel_input;

  const toggle = () => {
    setActionError(null);
    const mutation = isRunning ? stop : start;
    mutation.mutate(undefined, {
      onError: (error) => setActionError(errorMessage(error, dict.genericError)),
    });
  };

  return (
    <article className="card flex flex-col p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/listeners/${listener.id}`}
            className="block truncate text-base font-semibold text-stone-900 transition hover:text-emerald-700"
          >
            {title}
          </Link>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-stone-500">
            <BotIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {listener.bot_username ? `@${listener.bot_username}` : dict.botToken}
            </span>
            <span className="text-stone-300">·</span>
            <span className="truncate" dir="ltr">
              {listener.channel_input}
            </span>
          </p>
        </div>
        <StatusBadge status={listener.status} />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-stone-50 p-3">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
            {dict.totalPayments}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-stone-900">
            {formatNumber(listener.payment_count, lang)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
            {dict.totalValue}
          </dt>
          <dd className="mt-1 truncate text-sm font-semibold text-stone-900">
            {formatNumber(listener.total_value, lang)}
            {listener.total_usd
              ? ` · $${formatNumber(listener.total_usd, lang)}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
            {dict.lastActivity}
          </dt>
          <dd className="mt-1 truncate text-sm font-semibold text-stone-900">
            {listener.last_activity_at ? formatDate(listener.last_activity_at, lang) : dict.never}
          </dd>
        </div>
      </dl>

      {listener.status === "error" && listener.last_error ? (
        <p className="mt-3 line-clamp-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {listener.last_error}
        </p>
      ) : null}

      {actionError ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {actionError}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={
            isRunning
              ? "btn btn-secondary h-9 flex-1 px-3 text-xs"
              : "btn btn-primary h-9 flex-1 px-3 text-xs"
          }
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
        <Link
          href={`/listeners/${listener.id}`}
          className="btn btn-ghost h-9 px-3 text-xs"
          title={dict.openListener}
        >
          <ExternalLinkIcon className="h-4 w-4" />
          <span>{dict.openListener}</span>
        </Link>
      </div>
    </article>
  );
}
