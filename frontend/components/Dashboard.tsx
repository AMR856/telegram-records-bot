"use client";

import { useState } from "react";

import {
  ActivityIcon,
  AlertTriangleIcon,
  BotIcon,
  ListIcon,
  PlusIcon,
  WalletIcon,
} from "@/components/Icons";
import { ListenerCard } from "@/components/ListenerCard";
import { ListenerFormModal } from "@/components/ListenerFormModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useListeners } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";

export function Dashboard() {
  const { dict, lang } = useI18n();
  const { data, error, isLoading, refetch } = useListeners();
  const [showCreate, setShowCreate] = useState(false);

  const listeners = data ?? [];
  const running = listeners.filter((listener) => listener.status === "running").length;
  const paymentCount = listeners.reduce((sum, listener) => sum + listener.payment_count, 0);
  const totalValue = listeners.reduce((sum, listener) => sum + listener.total_value, 0);
  const totalUsd = listeners.reduce((sum, listener) => sum + listener.total_usd, 0);

  const stats = [
    {
      label: dict.totalListeners,
      value: formatNumber(listeners.length, lang),
      icon: <BotIcon className="h-5 w-5" />,
      tone: "bg-sky-50 text-sky-600",
    },
    {
      label: dict.runningListeners,
      value: formatNumber(running, lang),
      icon: <ActivityIcon className="h-5 w-5" />,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      label: dict.totalPayments,
      value: formatNumber(paymentCount, lang),
      icon: <ListIcon className="h-5 w-5" />,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: dict.totalValue,
      value: `${formatNumber(totalValue, lang)} ${dict.syp}${
        totalUsd ? ` · $${formatNumber(totalUsd, lang)}` : ""
      }`,
      icon: <WalletIcon className="h-5 w-5" />,
      tone: "bg-violet-50 text-violet-600",
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            {dict.dashboard}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">{dict.dashboardSubtitle}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowCreate(true)}
        >
          <PlusIcon className="h-4 w-4" />
          {dict.addListener}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card flex items-center gap-3.5 p-4">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.tone}`}
            >
              {stat.icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-stone-400">{stat.label}</p>
              <p className="mt-0.5 truncate text-xl font-semibold tracking-tight text-stone-900">
                {isLoading ? "—" : stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-stone-900">{dict.listeners}</h2>
        {listeners.length ? (
          <span className="badge bg-stone-100 text-stone-600">
            {formatNumber(listeners.length, lang)}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index} className="card p-5">
              <div className="skeleton h-5 w-2/5" />
              <div className="mt-3 skeleton h-3 w-3/5" />
              <div className="mt-6 skeleton h-20 w-full" />
              <div className="mt-4 skeleton h-9 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card mt-4 flex flex-col items-center p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangleIcon className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-semibold text-stone-900">{dict.loadFailed}</h3>
          <p className="mt-1.5 text-sm text-stone-500">
            {errorMessage(error, dict.genericError)}
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-5"
            onClick={() => void refetch()}
            disabled={isLoading}
          >
            {isLoading ? <Spinner className="h-4 w-4" /> : null}
            {dict.retry}
          </button>
        </div>
      ) : listeners.length === 0 ? (
        <div className="card mt-4">
          <EmptyState
            icon={<BotIcon className="h-7 w-7" />}
            title={dict.noListeners}
            description={dict.noListenersHint}
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreate(true)}
              >
                <PlusIcon className="h-4 w-4" />
                {dict.addFirstListener}
              </button>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {listeners.map((listener) => (
            <ListenerCard key={listener.id} listener={listener} />
          ))}
        </div>
      )}

      {showCreate ? (
        <ListenerFormModal mode="create" onClose={() => setShowCreate(false)} />
      ) : null}
    </div>
  );
}
