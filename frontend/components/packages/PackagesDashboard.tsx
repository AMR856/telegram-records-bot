"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  PackageIcon,
  PhoneIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
  WalletIcon,
} from "@/components/Icons";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n-context";
import { buildAnalytics, customerKey } from "@/lib/packages/analytics";
import {
  formatPackageDate,
  formatPackageDateTime,
  formatPackageName,
  formatPackageTime,
  formatPackagesMoney,
} from "@/lib/packages/format";
import { resolveDate } from "@/lib/packages/parser";
import type { DateOrder, ParsedChat } from "@/lib/packages/types";

import { PackagesCustomerModal } from "./CustomerModal";

interface PackagesDashboardProps {
  chat: ParsedChat;
  onOpenFile: () => void;
  onClear: () => void;
  onDateOrderChange: (order: DateOrder) => void;
}

type Tone = "green" | "cyan" | "violet" | "amber";

const toneClasses: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-600",
  cyan: "bg-cyan-50 text-cyan-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
};

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: Tone;
}) {
  return (
    <div className="card flex items-start gap-3.5 p-4">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          toneClasses[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-stone-400">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold tracking-tight text-stone-900">
          {value}
        </p>
        <p className="mt-0.5 truncate text-xs text-stone-400">{hint}</p>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-stone-900">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-stone-400">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function PackagesEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
        <PackageIcon className="h-5 w-5" />
      </div>
      <strong className="mt-3 text-sm font-semibold text-stone-800">{title}</strong>
      <span className="mt-1 max-w-sm text-xs leading-5 text-stone-400">
        {message}
      </span>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 shadow-sm transition focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 sm:w-64">
      <SearchIcon className="h-4 w-4 shrink-0 text-stone-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
      />
    </div>
  );
}

export function PackagesDashboard({
  chat,
  onOpenFile,
  onClear,
  onDateOrderChange,
}: PackagesDashboardProps) {
  const { dict, lang } = useI18n();
  const analytics = useMemo(() => buildAnalytics(chat, lang), [chat, lang]);

  const [monthFilter, setMonthFilter] = useState("all");
  const [packageFilter, setPackageFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [visibleSales, setVisibleSales] = useState(25);
  const [visibleUsers, setVisibleUsers] = useState(10);
  const [messageQuery, setMessageQuery] = useState("");
  const [visibleMessages, setVisibleMessages] = useState(15);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string | null>(
    null,
  );

  const money = useCallback(
    (value: number) => formatPackagesMoney(value, lang, dict.packagesCurrency),
    [lang, dict.packagesCurrency],
  );
  const gbName = useCallback(
    (gb: number) => formatPackageName(gb, lang, dict.packagesGb),
    [lang, dict.packagesGb],
  );

  const maxMonthTotal = analytics.months.length
    ? Math.max(...analytics.months.map((month) => month.total))
    : 1;

  const filteredSales = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...analytics.resolved].reverse().filter((sale) => {
      if (monthFilter !== "all" && monthKeyOf(sale.date) !== monthFilter) {
        return false;
      }
      if (
        packageFilter !== "all" &&
        sale.packageGb !== Number(packageFilter)
      ) {
        return false;
      }
      if (!needle) return true;
      return (
        sale.customer.toLowerCase().includes(needle) ||
        (sale.phone ?? "").includes(needle)
      );
    });
  }, [analytics.resolved, monthFilter, packageFilter, query]);

  const filteredSalesTotal = useMemo(
    () => filteredSales.reduce((sum, sale) => sum + sale.price, 0),
    [filteredSales],
  );

  const filteredUsers = useMemo(() => {
    const needle = userQuery.trim().toLowerCase();
    if (!needle) return analytics.customers;
    return analytics.customers.filter(
      (user) =>
        user.name.toLowerCase().includes(needle) ||
        (user.phone ?? "").includes(needle),
    );
  }, [analytics.customers, userQuery]);

  const monthOptions = useMemo(
    () => [...analytics.months].reverse(),
    [analytics.months],
  );

  const filteredMessages = useMemo(() => {
    const needle = messageQuery.trim().toLowerCase();
    const ordered = [...chat.messages].reverse();
    if (!needle) return ordered;
    return ordered.filter(
      (message) =>
        message.sender.toLowerCase().includes(needle) ||
        message.body.toLowerCase().includes(needle),
    );
  }, [chat.messages, messageQuery]);

  const selectedCustomer = useMemo(
    () =>
      analytics.customers.find(
        (customer) => customer.key === selectedCustomerKey,
      ) ?? null,
    [analytics.customers, selectedCustomerKey],
  );

  const closeCustomer = useCallback(() => {
    setSelectedCustomerKey(null);
  }, []);

  function showMonthSales(key: string) {
    setMonthFilter(key);
    setPackageFilter("all");
    setQuery("");
    setVisibleSales(25);
    document
      .getElementById("packages-transactions")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copyPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(phone);
      window.setTimeout(() => setCopiedPhone(null), 1600);
    } catch {
      setCopiedPhone(null);
    }
  }

  function exportCsv() {
    const headers = [
      dict.date,
      dict.packagesTime,
      dict.packagesCustomer,
      dict.packagesPhone,
      `${dict.packagesPackage} (${dict.packagesGb})`,
      dict.value,
      dict.source,
    ];
    const rows = filteredSales.map((sale) => [
      formatPackageDate(sale.date, lang),
      formatPackageTime(sale.date, lang),
      sale.customer,
      sale.phone ?? "",
      String(sale.packageGb),
      String(sale.price),
      sale.sender,
    ]);
    const csv =
      "\uFEFF" +
      [headers, ...rows]
        .map((row) => row.map(escapeCsv).join(","))
        .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `whatsapp-packages-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            {dict.packagesTitle}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {dict.packagesSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary h-9 px-3 text-xs"
            onClick={onOpenFile}
            title={dict.packagesChangeFile}
          >
            <UploadIcon className="h-4 w-4" />
            {dict.packagesChangeFile}
          </button>
          <button
            type="button"
            className="btn btn-danger h-9 px-3 text-xs"
            onClick={onClear}
          >
            <TrashIcon className="h-4 w-4" />
            {dict.packagesClearData}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="badge bg-stone-100 text-stone-600">
          <FileIcon className="h-3.5 w-3.5" />
          <span className="max-w-[220px] truncate">{chat.fileName}</span>
        </span>
        <span className="badge bg-stone-100 text-stone-600">
          {formatNumber(chat.messageCount, lang)} {dict.packagesMessagesSuffix}
        </span>
        <span className="badge bg-stone-100 text-stone-600">
          {formatNumber(chat.sales.length, lang)} {dict.packagesSalesSuffix}
        </span>
        <span className="badge bg-stone-100 text-stone-600">
          {formatNumber(chat.contacts.length, lang)} {dict.packagesPhonesSuffix}
        </span>
        <span className="badge bg-stone-100 text-stone-600">
          {formatNumber(chat.messages.length, lang)} {dict.packagesOtherSuffix}
        </span>
        <div className="ms-auto flex items-center gap-2 text-xs text-stone-500">
          <span>{dict.packagesDateFormat}</span>
          {chat.dateOrderAmbiguous ? (
            <div
              className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5"
              role="group"
              aria-label={dict.packagesDateFormat}
            >
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  chat.dateOrder === "dmy"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800",
                )}
                aria-pressed={chat.dateOrder === "dmy"}
                onClick={() => onDateOrderChange("dmy")}
              >
                {dict.packagesDmy}
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  chat.dateOrder === "mdy"
                    ? "bg-white text-stone-900 shadow-sm"
                    : "text-stone-500 hover:text-stone-800",
                )}
                aria-pressed={chat.dateOrder === "mdy"}
                onClick={() => onDateOrderChange("mdy")}
              >
                {dict.packagesMdy}
              </button>
            </div>
          ) : (
            <span className="badge bg-stone-100 text-stone-600">
              {chat.dateOrder === "dmy" ? dict.packagesDmy : dict.packagesMdy}
            </span>
          )}
        </div>
      </div>
      {chat.dateOrderAmbiguous ? (
        <p className="text-xs text-amber-700">{dict.packagesDateAmbiguous}</p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          tone="green"
          icon={<WalletIcon className="h-5 w-5" />}
          label={dict.packagesTotalSales}
          value={money(analytics.totalRevenue)}
          hint={`${dict.packagesAverageInvoice}: ${money(analytics.averageSale)}`}
        />
        <KpiCard
          tone="cyan"
          icon={<PackageIcon className="h-5 w-5" />}
          label={dict.packagesPackagesCount}
          value={formatNumber(analytics.totalSales, lang)}
          hint={
            analytics.topPackage
              ? `${dict.packagesBestSeller}: ${gbName(analytics.topPackage.gb)}`
              : dict.packagesNoPackagesYet
          }
        />
        <KpiCard
          tone="violet"
          icon={<UsersIcon className="h-5 w-5" />}
          label={dict.packagesCustomersKpi}
          value={formatNumber(analytics.totalCustomers, lang)}
          hint={`${formatNumber(chat.contacts.length, lang)} ${
            dict.packagesPhonesInChat
          }`}
        />
        <KpiCard
          tone="amber"
          icon={<CalendarIcon className="h-5 w-5" />}
          label={dict.packagesMonthsKpi}
          value={formatNumber(analytics.totalMonths, lang)}
          hint={
            analytics.months.length > 0
              ? `${analytics.months[0].label} — ${
                  analytics.months[analytics.months.length - 1].label
                }`
              : dict.packagesNoMonthsYet
          }
        />
      </section>

      {analytics.totalSales === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900">
          <strong className="block font-semibold">
            {dict.packagesNoSalesAlertTitle}
          </strong>
          <span>{dict.packagesNoSalesAlertText}</span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <SectionHeader
            title={dict.packagesMonthlySales}
            subtitle={dict.packagesMonthlySalesSub}
            action={
              <span className="badge bg-stone-100 text-stone-600">
                {formatNumber(analytics.totalMonths, lang)}{" "}
                {dict.packagesMonthUnit}
              </span>
            }
          />
          {analytics.months.length > 0 ? (
            <div className="mt-6 overflow-x-auto pb-1">
              <div
                className="flex items-end gap-3"
                style={{ minWidth: `${analytics.months.length * 80}px` }}
              >
                {analytics.months.map((month) => (
                  <div
                    key={month.key}
                    className="flex min-w-[64px] flex-1 flex-col items-center gap-1.5"
                  >
                    <span className="whitespace-nowrap text-[11px] font-semibold text-stone-600">
                      {money(month.total)}
                    </span>
                    <div className="flex h-28 w-full items-end">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-emerald-600 to-teal-400"
                        style={{
                          height: `${Math.max(
                            6,
                            Math.round((month.total / maxMonthTotal) * 100),
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-center text-xs font-medium text-stone-700">
                      {month.label}
                    </span>
                    <span className="text-[11px] text-stone-400">
                      {formatNumber(month.count, lang)}{" "}
                      {dict.packagesPackageUnit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <PackagesEmpty
              title={dict.packagesNoSales}
              message={dict.packagesNoSalesHint}
            />
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <SectionHeader
            title={dict.packagesDistribution}
            subtitle={dict.packagesDistributionSub}
            action={
              <span className="badge bg-stone-100 text-stone-600">
                {formatNumber(analytics.packageTypes.length, lang)}{" "}
                {dict.packagesTypesUnit}
              </span>
            }
          />
          {analytics.packageTypes.length > 0 ? (
            <div className="mt-5 space-y-4">
              {analytics.packageTypes.map((pkg) => {
                const share =
                  analytics.totalRevenue > 0
                    ? (pkg.total / analytics.totalRevenue) * 100
                    : 0;
                return (
                  <div key={pkg.gb}>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-stone-800">
                        {gbName(pkg.gb)}
                      </span>
                      <span className="text-xs text-stone-400">
                        {formatNumber(pkg.count, lang)}{" "}
                        {dict.packagesPackageUnit}
                      </span>
                      <span className="ms-auto font-semibold text-stone-900">
                        {money(pkg.total)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                        style={{ width: `${Math.max(3, share)}%` }}
                      />
                    </div>
                    <span className="mt-1 block text-[11px] text-stone-400">
                      {share.toFixed(0)}% {dict.packagesOfTotal}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <PackagesEmpty
              title={dict.packagesNoSizes}
              message={dict.packagesNoSizesHint}
            />
          )}
        </section>
      </div>

      <section className="space-y-3">
        <SectionHeader
          title={dict.packagesByMonth}
          subtitle={dict.packagesByMonthSub}
        />
        {analytics.months.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...analytics.months].reverse().map((month) => (
              <article className="card flex flex-col p-5" key={month.key}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-stone-900">
                      {month.label}
                    </h3>
                    <span className="text-xs text-stone-400">
                      {formatNumber(month.customerCount, lang)}{" "}
                      {dict.packagesCustomerUnit} ·{" "}
                      {formatNumber(month.count, lang)}{" "}
                      {dict.packagesPackageUnit}
                    </span>
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold text-emerald-700">
                    {money(month.total)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {month.packages.map((pkg) => (
                    <span
                      key={pkg.gb}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600"
                    >
                      {gbName(pkg.gb)}
                      <b className="font-semibold text-stone-800">
                        ×{formatNumber(pkg.count, lang)}
                      </b>
                      <span className="text-stone-400">{money(pkg.total)}</span>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-1 self-start text-xs font-semibold text-emerald-700 transition hover:text-emerald-800"
                  onClick={() => showMonthSales(month.key)}
                >
                  {dict.packagesShowMonthSales}
                  <ArrowLeftIcon className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="card">
            <PackagesEmpty
              title={dict.packagesNoMonths}
              message={dict.packagesNoMonthsHint}
            />
          </div>
        )}
      </section>

      <section className="card p-5">
        <SectionHeader
          title={dict.packagesCustomersTitle}
          subtitle={dict.packagesCustomersSub}
          action={
            <SearchField
              value={userQuery}
              onChange={(value) => {
                setUserQuery(value);
                setVisibleUsers(10);
              }}
              placeholder={dict.packagesSearchCustomer}
              ariaLabel={dict.packagesSearchCustomer}
            />
          }
        />
        {filteredUsers.length > 0 ? (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-stone-400">
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.packagesCustomer}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.packagesPhone}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.packagesPackageUnit}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.packagesCount}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.packagesTotal}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.packagesLastPurchase}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.slice(0, visibleUsers).map((user) => (
                    <tr
                      key={user.key}
                      className="cursor-pointer border-b border-stone-100 transition last:border-0 hover:bg-stone-50"
                      tabIndex={0}
                      title={`${dict.packagesCustomersTitle}: ${user.name}`}
                      onClick={() => setSelectedCustomerKey(user.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedCustomerKey(user.key);
                        }
                      }}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
                            {user.name.trim().charAt(0) || "?"}
                          </span>
                          <span className="font-medium text-stone-800">
                            {user.name}
                          </span>
                          <ArrowLeftIcon className="h-3.5 w-3.5 text-stone-300" />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {user.phone ? (
                          <span className="text-stone-600" dir="ltr">
                            {user.phone}
                          </span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {user.packages.map((pkg) => (
                            <span
                              key={pkg.gb}
                              className="inline-flex whitespace-nowrap rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600"
                            >
                              {gbName(pkg.gb)} ×{formatNumber(pkg.count, lang)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-stone-600">
                        {formatNumber(user.count, lang)}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-stone-900">
                        {money(user.total)}
                      </td>
                      <td className="px-3 py-2.5 text-stone-500">
                        {formatPackageDate(user.lastDate, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredUsers.length > visibleUsers ? (
              <button
                type="button"
                className="btn btn-secondary mt-4 w-full"
                onClick={() => setVisibleUsers((count) => count + 10)}
              >
                {dict.packagesShowMore} (
                {formatNumber(filteredUsers.length - visibleUsers, lang)}{" "}
                {dict.packagesRemaining})
              </button>
            ) : null}
          </>
        ) : (
          <PackagesEmpty
            title={dict.packagesNoCustomers}
            message={
              userQuery
                ? dict.packagesNoCustomerResults
                : dict.packagesNoCustomerNames
            }
          />
        )}
      </section>

      <section className="card p-5" id="packages-transactions">
        <SectionHeader
          title={dict.packagesAllTransactions}
          subtitle={`${formatNumber(filteredSales.length, lang)} ${
            dict.packagesTransactionsUnit
          } · ${money(filteredSalesTotal)}`}
          action={
            <button
              type="button"
              className="btn btn-secondary h-9 px-3 text-xs"
              onClick={exportCsv}
              disabled={filteredSales.length === 0}
            >
              <DownloadIcon className="h-4 w-4" />
              {dict.packagesExportCsv}
            </button>
          }
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="label">{dict.month}</span>
            <select
              className="input"
              value={monthFilter}
              onChange={(event) => {
                setMonthFilter(event.target.value);
                setVisibleSales(25);
              }}
            >
              <option value="all">{dict.allMonths}</option>
              {monthOptions.map((month) => (
                <option value={month.key} key={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{dict.packagesPackage}</span>
            <select
              className="input"
              value={packageFilter}
              onChange={(event) => {
                setPackageFilter(event.target.value);
                setVisibleSales(25);
              }}
            >
              <option value="all">{dict.packagesAllPackages}</option>
              {analytics.packageTypes.map((pkg) => (
                <option value={pkg.gb} key={pkg.gb}>
                  {gbName(pkg.gb)}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">{dict.packagesSearch}</span>
            <SearchField
              value={query}
              onChange={(value) => {
                setQuery(value);
                setVisibleSales(25);
              }}
              placeholder={dict.packagesSearchByName}
              ariaLabel={dict.packagesSearchByName}
            />
          </label>
        </div>

        {filteredSales.length > 0 ? (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-stone-400">
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.date}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.packagesTime}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.packagesCustomer}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.packagesPackage}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.value}
                    </th>
                    <th className="px-3 py-2 text-start font-semibold">
                      {dict.source}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.slice(0, visibleSales).map((sale) => (
                    <tr
                      key={sale.id}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">
                        {formatPackageDate(sale.date, lang)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-stone-400">
                        {formatPackageTime(sale.date, lang)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="font-medium text-emerald-700 transition hover:text-emerald-800"
                          onClick={() =>
                            setSelectedCustomerKey(customerKey(sale.customer))
                          }
                        >
                          {sale.customer}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex whitespace-nowrap rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
                          {gbName(sale.packageGb)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-stone-900">
                        {money(sale.price)}
                      </td>
                      <td className="px-3 py-2.5 text-stone-500">
                        {sale.sender}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredSales.length > visibleSales ? (
              <button
                type="button"
                className="btn btn-secondary mt-4 w-full"
                onClick={() => setVisibleSales((count) => count + 25)}
              >
                {dict.packagesShowMore} (
                {formatNumber(filteredSales.length - visibleSales, lang)}{" "}
                {dict.packagesRemaining})
              </button>
            ) : null}
          </>
        ) : (
          <PackagesEmpty
            title={dict.packagesNoTransactions}
            message={dict.packagesNoTransactionsHint}
          />
        )}
      </section>

      <section className="card p-5">
        <SectionHeader
          title={dict.packagesOtherMessages}
          subtitle={dict.packagesOtherMessagesSub}
          action={
            <SearchField
              value={messageQuery}
              onChange={(value) => {
                setMessageQuery(value);
                setVisibleMessages(15);
              }}
              placeholder={dict.packagesSearchMessages}
              ariaLabel={dict.packagesSearchMessages}
            />
          }
        />
        {filteredMessages.length > 0 ? (
          <>
            <div className="mt-3 divide-y divide-stone-100">
              {filteredMessages.slice(0, visibleMessages).map((message) => {
                const messageDate = resolveDate(message.date, chat.dateOrder);
                return (
                  <article className="py-3" key={message.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-stone-700">
                        {message.sender}
                      </span>
                      <span className="text-xs text-stone-400">
                        {formatPackageDateTime(messageDate, lang)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-600">
                      {message.body}
                    </p>
                  </article>
                );
              })}
            </div>
            {filteredMessages.length > visibleMessages ? (
              <button
                type="button"
                className="btn btn-secondary mt-4 w-full"
                onClick={() => setVisibleMessages((count) => count + 15)}
              >
                {dict.packagesShowMore} (
                {formatNumber(filteredMessages.length - visibleMessages, lang)}{" "}
                {dict.packagesRemaining})
              </button>
            ) : null}
          </>
        ) : (
          <PackagesEmpty
            title={dict.packagesNoOtherMessages}
            message={
              messageQuery
                ? dict.packagesNoMessageResults
                : dict.packagesAllRecognized
            }
          />
        )}
      </section>

      {chat.contacts.length > 0 ? (
        <section className="card p-5">
          <SectionHeader
            title={dict.packagesContactsTitle}
            subtitle={dict.packagesContactsSub}
            action={
              <span className="badge bg-stone-100 text-stone-600">
                {formatNumber(chat.contacts.length, lang)}{" "}
                {dict.packagesNumbersUnit}
              </span>
            }
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {chat.contacts.map((contact) => {
              const digits = contact.phone.replace(/\D/g, "");
              const contactDate = resolveDate(contact.date, chat.dateOrder);
              return (
                <div
                  key={digits}
                  className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
                    <PhoneIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm font-medium text-stone-800"
                      dir="ltr"
                    >
                      {contact.phone}
                    </span>
                    <span className="block truncate text-xs text-stone-400">
                      {formatPackageDate(contactDate, lang)} · {contact.sender}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                    aria-label={dict.packagesCopyPhone}
                    onClick={() => void copyPhone(contact.phone)}
                  >
                    {copiedPhone === contact.phone ? (
                      <CheckIcon className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <CopyIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <p className="text-center text-xs text-stone-400">
        {dict.packagesFooter}{" "}
        {formatPackageDateTime(new Date(chat.parsedAt), lang)}
      </p>

      {selectedCustomer ? (
        <PackagesCustomerModal
          customer={selectedCustomer}
          onClose={closeCustomer}
        />
      ) : null}
    </div>
  );
}
