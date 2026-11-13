"use client";

import { useMemo, useState } from "react";

import { CheckIcon, CopyIcon, PhoneIcon } from "@/components/Icons";
import { Modal } from "@/components/ui/Modal";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n-context";
import type { CustomerSummary, ResolvedSale } from "@/lib/packages/analytics";
import {
  formatPackageDate,
  formatPackageMonth,
  formatPackageName,
  formatPackageTime,
  formatPackagesMoney,
} from "@/lib/packages/format";

interface PackagesCustomerModalProps {
  customer: CustomerSummary;
  onClose: () => void;
}

interface CustomerMonth {
  key: string;
  label: string;
  total: number;
  count: number;
  sales: ResolvedSale[];
}

export function PackagesCustomerModal({
  customer,
  onClose,
}: PackagesCustomerModalProps) {
  const { dict, lang } = useI18n();
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  const money = (value: number) =>
    formatPackagesMoney(value, lang, dict.packagesCurrency);
  const packageName = (gb: number) =>
    formatPackageName(gb, lang, dict.packagesGb);

  const months = useMemo(() => {
    const map = new Map<string, CustomerMonth>();

    for (const sale of customer.sales) {
      const year = sale.date.getFullYear();
      const month = sale.date.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, "0")}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          label: formatPackageMonth(new Date(year, month - 1, 1), lang),
          total: 0,
          count: 0,
          sales: [],
        };
        map.set(key, group);
      }
      group.total += sale.price;
      group.count += 1;
      group.sales.push(sale);
    }

    return Array.from(map.values())
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((group) => ({
        ...group,
        sales: [...group.sales].sort(
          (a, b) => b.date.getTime() - a.date.getTime(),
        ),
      }));
  }, [customer.sales, lang]);

  async function copyPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(phone);
      window.setTimeout(() => setCopiedPhone(null), 1600);
    } catch {
      setCopiedPhone(null);
    }
  }

  return (
    <Modal
      title={customer.name}
      description={`${formatNumber(customer.count, lang)} ${
        dict.packagesPackageUnit
      } · ${formatNumber(customer.months.length, lang)} ${dict.packagesMonthUnit}`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-5">
        {customer.phones.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {customer.phones.map((phone) => (
              <span
                key={phone}
                className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600"
              >
                <PhoneIcon className="h-3.5 w-3.5" />
                <span dir="ltr">{phone}</span>
                <button
                  type="button"
                  className="rounded p-0.5 text-stone-400 transition hover:text-stone-700"
                  onClick={() => void copyPhone(phone)}
                  aria-label={dict.packagesCopyPhone}
                >
                  {copiedPhone === phone ? (
                    <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <CopyIcon className="h-3.5 w-3.5" />
                  )}
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <CustomerStat label={dict.packagesTotalPaid} value={money(customer.total)} />
          <CustomerStat
            label={dict.packagesPackagesCount}
            value={formatNumber(customer.count, lang)}
          />
          <CustomerStat
            label={dict.packagesAveragePrice}
            value={money(customer.count > 0 ? customer.total / customer.count : 0)}
          />
          <CustomerStat
            label={dict.packagesLastPurchase}
            value={formatPackageDate(customer.lastDate, lang)}
          />
        </div>

        <section>
          <h3 className="text-sm font-semibold text-stone-900">
            {dict.packagesPackageSummary}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {customer.packages.map((pkg) => (
              <span
                key={pkg.gb}
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600"
              >
                {packageName(pkg.gb)}
                <b className="font-semibold text-stone-800">
                  ×{formatNumber(pkg.count, lang)}
                </b>
                <span className="text-stone-400">{money(pkg.total)}</span>
              </span>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-stone-900">
            {dict.packagesAllPackages} ({formatNumber(customer.count, lang)})
          </h3>
          <div className="mt-2 space-y-3">
            {months.map((month) => (
              <div key={month.key} className="rounded-xl border border-stone-200">
                <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-3 py-2">
                  <span className="text-sm font-medium text-stone-800">
                    {month.label}
                  </span>
                  <span className="text-xs text-stone-400">
                    {formatNumber(month.count, lang)} {dict.packagesPackageUnit} ·{" "}
                    {money(month.total)}
                  </span>
                </div>
                <div className="divide-y divide-stone-100">
                  {month.sales.map((sale) => (
                    <div key={sale.id} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
                          {packageName(sale.packageGb)}
                        </span>
                        <span className="text-xs text-stone-400">
                          {formatPackageDate(sale.date, lang)} ·{" "}
                          {formatPackageTime(sale.date, lang)}
                        </span>
                        <span className="ms-auto text-sm font-semibold text-stone-900">
                          {money(sale.price)}
                        </span>
                      </div>
                      <details className="mt-1.5 text-xs text-stone-500">
                        <summary className="cursor-pointer select-none">
                          {dict.packagesMessageDetails}
                        </summary>
                        <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-stone-50 px-2.5 py-2 text-stone-600">
                          {sale.raw}
                        </p>
                        <span className="mt-1 block text-stone-400">
                          {dict.packagesBy} {sale.sender}
                          {sale.phone
                            ? ` · ${dict.packagesPhone}: ${sale.phone}`
                            : ""}
                        </span>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
          <span className="text-xs text-stone-400">
            {dict.packagesFirstPurchase}{" "}
            {formatPackageDate(customer.firstDate, lang)}
          </span>
          <button
            type="button"
            className="btn btn-secondary h-9 px-3 text-xs"
            onClick={onClose}
          >
            {dict.close}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CustomerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2.5">
      <span className="block text-xs text-stone-400">{label}</span>
      <strong className="mt-0.5 block truncate text-sm font-semibold text-stone-900">
        {value}
      </strong>
    </div>
  );
}
