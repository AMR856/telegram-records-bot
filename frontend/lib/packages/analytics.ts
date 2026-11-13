import type { Lang } from "@/lib/i18n";

import { formatPackageMonth } from "./format";
import { resolveDate } from "./parser";
import type { ParsedChat, Sale } from "./types";

export interface ResolvedSale extends Omit<Sale, "date"> {
  date: Date;
}

export interface PackageBreakdown {
  gb: number;
  count: number;
  total: number;
}

export interface MonthSummary {
  key: string;
  year: number;
  month: number;
  label: string;
  total: number;
  count: number;
  customerCount: number;
  packages: PackageBreakdown[];
  sales: ResolvedSale[];
}

export interface CustomerSummary {
  key: string;
  name: string;
  phone?: string;
  phones: string[];
  count: number;
  total: number;
  packages: PackageBreakdown[];
  months: string[];
  firstDate: Date;
  lastDate: Date;
  sales: ResolvedSale[];
}

export interface Analytics {
  resolved: ResolvedSale[];
  months: MonthSummary[];
  customers: CustomerSummary[];
  packageTypes: PackageBreakdown[];
  totalRevenue: number;
  totalSales: number;
  totalCustomers: number;
  totalMonths: number;
  averageSale: number;
  topPackage?: PackageBreakdown;
}

interface MonthBuilder {
  key: string;
  year: number;
  month: number;
  label: string;
  total: number;
  count: number;
  sales: ResolvedSale[];
  packageMap: Map<number, PackageBreakdown>;
  customerKeys: Set<string>;
}

interface CustomerBuilder {
  key: string;
  name: string;
  phone?: string;
  phones: Set<string>;
  count: number;
  total: number;
  firstDate: Date;
  lastDate: Date;
  packageMap: Map<number, PackageBreakdown>;
  monthKeys: Set<string>;
  sales: ResolvedSale[];
}

export function customerKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function bumpPackage(
  map: Map<number, PackageBreakdown>,
  sale: ResolvedSale,
): void {
  const entry = map.get(sale.packageGb) ?? {
    gb: sale.packageGb,
    count: 0,
    total: 0,
  };
  entry.count += 1;
  entry.total += sale.price;
  map.set(sale.packageGb, entry);
}

function sortPackages(
  map: Map<number, PackageBreakdown>,
): PackageBreakdown[] {
  return Array.from(map.values()).sort((a, b) => a.gb - b.gb);
}

export function buildAnalytics(chat: ParsedChat, lang: Lang): Analytics {
  const resolved = chat.sales
    .map((sale) => ({
      ...sale,
      date: resolveDate(sale.date, chat.dateOrder),
    }))
    .filter((sale) => !Number.isNaN(sale.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const monthMap = new Map<string, MonthBuilder>();
  const customerMap = new Map<string, CustomerBuilder>();
  const packageMap = new Map<number, PackageBreakdown>();

  for (const sale of resolved) {
    const year = sale.date.getFullYear();
    const month = sale.date.getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;

    let monthEntry = monthMap.get(key);
    if (!monthEntry) {
      monthEntry = {
        key,
        year,
        month,
        label: formatPackageMonth(new Date(year, month - 1, 1), lang),
        total: 0,
        count: 0,
        sales: [],
        packageMap: new Map(),
        customerKeys: new Set(),
      };
      monthMap.set(key, monthEntry);
    }
    monthEntry.total += sale.price;
    monthEntry.count += 1;
    monthEntry.customerKeys.add(customerKey(sale.customer));
    monthEntry.sales.push(sale);
    bumpPackage(monthEntry.packageMap, sale);
    bumpPackage(packageMap, sale);

    const key2 = customerKey(sale.customer);
    let customer = customerMap.get(key2);
    if (!customer) {
      customer = {
        key: key2,
        name: sale.customer,
        phone: sale.phone,
        phones: new Set(sale.phone ? [sale.phone] : []),
        count: 0,
        total: 0,
        firstDate: sale.date,
        lastDate: sale.date,
        packageMap: new Map(),
        monthKeys: new Set(),
        sales: [],
      };
      customerMap.set(key2, customer);
    }
    if (!customer.phone && sale.phone) customer.phone = sale.phone;
    if (sale.phone) customer.phones.add(sale.phone);
    customer.sales.push(sale);
    customer.count += 1;
    customer.total += sale.price;
    if (sale.date.getTime() < customer.firstDate.getTime()) {
      customer.firstDate = sale.date;
    }
    if (sale.date.getTime() > customer.lastDate.getTime()) {
      customer.lastDate = sale.date;
    }
    customer.monthKeys.add(key);
    bumpPackage(customer.packageMap, sale);
  }

  const months: MonthSummary[] = Array.from(monthMap.values())
    .map((entry) => ({
      key: entry.key,
      year: entry.year,
      month: entry.month,
      label: entry.label,
      total: entry.total,
      count: entry.count,
      customerCount: entry.customerKeys.size,
      packages: sortPackages(entry.packageMap),
      sales: entry.sales,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  const customers: CustomerSummary[] = Array.from(customerMap.values())
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      phone: entry.phone,
      phones: Array.from(entry.phones),
      count: entry.count,
      total: entry.total,
      packages: sortPackages(entry.packageMap),
      months: Array.from(entry.monthKeys).sort(),
      firstDate: entry.firstDate,
      lastDate: entry.lastDate,
      sales: entry.sales,
    }))
    .sort((a, b) => b.total - a.total);

  const packageTypes = sortPackages(packageMap);
  const totalRevenue = resolved.reduce((sum, sale) => sum + sale.price, 0);
  const topPackage = [...packageTypes].sort(
    (a, b) => b.count - a.count || b.total - a.total,
  )[0];

  return {
    resolved,
    months,
    customers,
    packageTypes,
    totalRevenue,
    totalSales: resolved.length,
    totalCustomers: customers.length,
    totalMonths: months.length,
    averageSale: resolved.length > 0 ? totalRevenue / resolved.length : 0,
    topPackage,
  };
}
