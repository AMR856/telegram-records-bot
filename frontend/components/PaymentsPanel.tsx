"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  SearchIcon,
  WalletIcon,
} from "@/components/Icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { errorMessage } from "@/lib/api";
import { buildQuery } from "@/lib/api";
import { formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import { usePayments } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n-context";
import type { PaymentFilters } from "@/lib/types";

export function PaymentsPanel({
  listenerId,
  running,
}: {
  listenerId: string;
  running: boolean;
}) {
  const { dict, lang } = useI18n();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(q.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [search, month, dateFrom, dateTo]);

  const filters = useMemo<PaymentFilters>(
    () => ({
      q: search || undefined,
      month: month ? Number(month) : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [search, month, dateFrom, dateTo],
  );

  const query = usePayments(listenerId, filters, page, running);
  const data = query.data;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.page_size ?? 25)));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const exportHref = `/api/listeners/${listenerId}/payments/export.xlsx${buildQuery({
    q: filters.q,
    month: filters.month,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  })}`;

  const reset = () => {
    setQ("");
    setSearch("");
    setMonth("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_150px_160px_160px_auto]">
          <div>
            <label className="label" htmlFor="payment-search">
              {dict.searchPayments}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-stone-400">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                id="payment-search"
                className="input ps-10"
                value={q}
                maxLength={100}
                onChange={(event) => setQ(event.target.value)}
                placeholder={dict.searchPayments}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="payment-month">
              {dict.month}
            </label>
            <select
              id="payment-month"
              className="input"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              <option value="">{dict.allMonths}</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {formatMonth(value, lang)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="payment-from">
              {dict.dateFrom}
            </label>
            <input
              id="payment-from"
              type="date"
              className="input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              dir="ltr"
            />
          </div>

          <div>
            <label className="label" htmlFor="payment-to">
              {dict.dateTo}
            </label>
            <input
              id="payment-to"
              type="date"
              className="input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              dir="ltr"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-secondary h-[42px] w-full"
              onClick={reset}
            >
              {dict.resetFilters}
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
            <span>
              <strong className="font-semibold text-stone-900">
                {formatNumber(data?.total ?? 0, lang)}
              </strong>{" "}
              {dict.results}
            </span>
            <span className="hidden text-stone-300 sm:inline">|</span>
            <span>
              {dict.filteredValue} ({dict.syp}):{" "}
              <strong className="font-semibold text-stone-900">
                {formatNumber(data?.total_value ?? 0, lang)}
              </strong>
            </span>
            {(data?.total_usd ?? 0) !== 0 ? (
              <>
                <span className="hidden text-stone-300 sm:inline">|</span>
                <span>
                  {dict.totalValueUsd}:{" "}
                  <strong className="font-semibold text-stone-900">
                    {formatNumber(data?.total_usd ?? 0, lang)}
                  </strong>
                </span>
              </>
            ) : null}
          </div>

          <a
            href={exportHref}
            className="btn btn-primary h-9 text-xs"
            download
            title={dict.exportHint}
          >
            <DownloadIcon className="h-4 w-4" />
            {dict.exportExcel}
          </a>
        </div>

        {query.isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="px-4 py-12 text-center">
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
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<WalletIcon className="h-7 w-7" />}
            title={dict.noPayments}
            description={dict.noPaymentsHint}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-start text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/70 text-[11px] uppercase tracking-wide text-stone-400">
                    <th className="px-4 py-2.5 text-start font-semibold">{dict.date}</th>
                    <th className="px-4 py-2.5 text-start font-semibold">{dict.name}</th>
                    <th className="px-4 py-2.5 text-start font-semibold">
                      {dict.description}
                    </th>
                    <th className="px-4 py-2.5 text-start font-semibold">{dict.month}</th>
                    <th className="px-4 py-2.5 text-start font-semibold">{dict.source}</th>
                    <th className="px-4 py-2.5 text-end font-semibold">{dict.value}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {data.items.map((payment) => (
                    <tr key={payment.id} className="transition hover:bg-stone-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-stone-500">
                        {formatDateTime(payment.received_at, lang)}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 font-medium text-stone-900">
                        {payment.name}
                      </td>
                      <td
                        className="max-w-[260px] px-4 py-3 text-stone-500"
                        title={payment.description ?? undefined}
                      >
                        <div className="flex items-center gap-2">
                          {payment.kind === "refund" ? (
                            <span className="badge shrink-0 bg-rose-50 text-rose-700">
                              {dict.refund}
                            </span>
                          ) : null}
                          <span className="truncate">{payment.description || "—"}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-stone-500">
                        {formatMonth(payment.month, lang)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="badge bg-stone-100 text-stone-600">
                          {payment.source}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-end font-semibold tabular-nums ${
                          payment.kind === "refund" ? "text-rose-600" : "text-stone-900"
                        }`}
                      >
                        {formatNumber(payment.value, lang)}{" "}
                        <span className="text-[10px] font-medium text-stone-400">
                          {payment.currency === "USD" ? dict.usd : dict.syp}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-4 py-3">
              <span className="text-xs text-stone-400">
                {dict.page} {formatNumber(data.page, lang)} {dict.of}{" "}
                {formatNumber(totalPages, lang)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary h-9 px-3 text-xs"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page <= 1 || query.isFetching}
                >
                  <ChevronLeftIcon className="h-4 w-4 rtl:rotate-180" />
                  {dict.previous}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary h-9 px-3 text-xs"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={page >= totalPages || query.isFetching}
                >
                  {dict.next}
                  <ChevronRightIcon className="h-4 w-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
