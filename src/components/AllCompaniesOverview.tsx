import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  ArrowUpRight,
  Building2,
  Package,
  Sparkles,
  BarChart3,
  Printer,
  Bell,
  AlertTriangle,
  Clock,
  Home,
  Trash2,
  Receipt,
  CheckCircle2,
  TrendingUp,
  ClipboardCheck,
  Users,
  RotateCcw,
  Pencil,
} from 'lucide-react';
import { Company, LedgerData } from '../types/ledger';
import {
  DEMO_COMPANY_IDS,
  formatDateBn,
  formatMonthBn,
  formatNumber,
  formatTaka,
  getCurrentMonthISO,
  getCurrentYear,
  getEntryKey,
  getTodayISO,
} from '../utils/storage';
import { loadPersistedFilter, savePersistedFilter } from '../utils/salesDrafts';
import { LAST_FIVE_STOCK_THRESHOLD, StockNotificationItem } from '../utils/notifications';
import { computeCompany1to1Summary } from '../utils/companySummary';
import { MonthlyComparisonChart } from './MonthlyComparisonChart';
import { PrintLetterhead, PrintSignatureFooter } from './PrintLetterhead';
import { BrandLogo } from './BrandLogo';
import { CompanyLogoAvatar } from './CompanyLogoAvatar';
import { CompanyRepsStrip } from './CompanyRepsStrip';

interface AllCompaniesOverviewProps {
  data: LedgerData;
  hasDemoData?: boolean;
  lastVisitedCompanyId?: string;
  notifications?: StockNotificationItem[];
  unreadNotificationCount?: number;
  onOpenNotifications?: () => void;
  onSelectCompany: (companyId: string) => void;
  onEditCompany?: (company: Company) => void;
  onOpenPeriodReports: () => void;
  onOpenChalanVerify?: () => void;
  onOpenCustomerCredit?: () => void;
  onOpenStockReport?: () => void;
  onAddCompany: () => void;
  onLoadSampleData: () => void;
  onClearDemoData?: () => void;
  onOpenProfilePage?: () => void;
}

type CompanySourceFilter = 'all' | 'real' | 'demo';

const DEMO_COMPANY_ID_SET = new Set<string>(DEMO_COMPANY_IDS);

export const AllCompaniesOverview: React.FC<AllCompaniesOverviewProps> = ({
  data,
  hasDemoData = false,
  lastVisitedCompanyId = '',
  notifications = [],
  unreadNotificationCount = 0,
  onOpenNotifications,
  onSelectCompany,
  onEditCompany,
  onOpenPeriodReports,
  onOpenChalanVerify,
  onOpenCustomerCredit,
  onOpenStockReport,
  onAddCompany,
  onLoadSampleData,
  onClearDemoData,
  onOpenProfilePage,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>(() =>
    loadPersistedFilter<string>('overview_search', '')
  );
  const [sourceFilter, setSourceFilter] = useState<CompanySourceFilter>(() => {
    const saved = loadPersistedFilter<string>('overview_source_filter', 'all');
    return saved === 'real' || saved === 'demo' ? saved : 'all';
  });
  const [demoFeedback, setDemoFeedback] = useState('');
  const today = getTodayISO();
  const currentMonth = getCurrentMonthISO();
  const currentYear = getCurrentYear();

  useEffect(() => {
    savePersistedFilter('overview_search', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    savePersistedFilter('overview_source_filter', sourceFilter);
  }, [sourceFilter]);

  const companySummaries = useMemo(() => {
    return data.companies.map((company) => {
      const isDemo = DEMO_COMPANY_ID_SET.has(company.id);
      const products = data.products.filter((p) => p.companyId === company.id);
      const todayEntry = data.entries[getEntryKey(company.id, today)];

      const companyEntries = Object.values(data.entries).filter(
        (entry) => entry.companyId === company.id
      );

      let monthSales = 0;
      let yearSales = 0;
      let allTimeSales = 0;

      for (const entry of companyEntries) {
        allTimeSales += entry.totalSalesAmount;
        if (entry.date.startsWith(currentMonth)) {
          monthSales += entry.totalSalesAmount;
        }
        if (entry.date.startsWith(currentYear)) {
          yearSales += entry.totalSalesAmount;
        }
      }

      // Company payable/due vs advance receivable from Company Ledger (Paid - Goods Received)
      let totalPaid = 0;
      let totalGoods = 0;
      for (const ledgerEntry of data.companyLedgerEntries) {
        if (ledgerEntry.companyId !== company.id) continue;
        if (ledgerEntry.type === 'payment_given') {
          totalPaid += ledgerEntry.amount;
        } else {
          totalGoods += ledgerEntry.amount;
        }
      }
      const netLedgerBalance = Number((totalPaid - totalGoods).toFixed(2));
      const dueAmount = netLedgerBalance < 0 ? Number(Math.abs(netLedgerBalance).toFixed(2)) : 0;
      const receivableAmount = netLedgerBalance > 0 ? netLedgerBalance : 0;

      const summary1to1 = computeCompany1to1Summary(data, company);

      // Per-company stock & godown aging alerts
      const companyNotifications = notifications.filter((n) => n.companyId === company.id);
      const lowStockAlertCount = companyNotifications.filter(
        (n) => n.category === 'low_stock'
      ).length;
      const agedStockAlertCount = companyNotifications.filter(
        (n) => n.category === 'godown_aged'
      ).length;
      const totalStockAlertCount = lowStockAlertCount + agedStockAlertCount;

      return {
        company,
        isDemo,
        productCount: products.length,
        todayOut: todayEntry?.totalMarketOut ?? 0,
        todayReturn: todayEntry?.totalReturned ?? 0,
        todaySold: todayEntry?.totalSoldQty ?? 0,
        todaySalesAmount: todayEntry?.totalSalesAmount ?? 0,
        monthSales,
        yearSales,
        allTimeSales,
        dueAmount,
        receivableAmount,
        customerDueTotal: summary1to1.customerDueTotal,
        dueCustomerCount: summary1to1.dueCustomerCount,
        lowStockAlertCount,
        agedStockAlertCount,
        totalStockAlertCount,
        totalDaysRecorded: companyEntries.length,
      };
    });
  }, [data, notifications, today, currentMonth, currentYear]);

  const realCount = useMemo(
    () => companySummaries.filter((c) => !c.isDemo).length,
    [companySummaries]
  );
  const demoCount = useMemo(
    () => companySummaries.filter((c) => c.isDemo).length,
    [companySummaries]
  );
  const hasMixedRealAndDemo = realCount > 0 && demoCount > 0;
  const effectiveSourceFilter: CompanySourceFilter = hasMixedRealAndDemo ? sourceFilter : 'all';

  const filteredSummaries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return companySummaries.filter((item) => {
      if (effectiveSourceFilter === 'real' && item.isDemo) return false;
      if (effectiveSourceFilter === 'demo' && !item.isDemo) return false;
      if (!q) return true;
      return (
        item.company.name.toLowerCase().includes(q) ||
        (item.company.contactPerson && item.company.contactPerson.toLowerCase().includes(q))
      );
    });
  }, [companySummaries, effectiveSourceFilter, searchQuery]);

  const summarizeGroup = (items: typeof companySummaries) =>
    items.reduce(
      (acc, item) => {
        acc.count += 1;
        acc.productCount += item.productCount;
        acc.todayOut += item.todayOut;
        acc.todayReturn += item.todayReturn;
        acc.todaySold += item.todaySold;
        acc.todaySales += item.todaySalesAmount;
        acc.monthSales += item.monthSales;
        acc.yearSales += item.yearSales;
        acc.allTimeSales += item.allTimeSales;
        acc.totalDue += item.dueAmount;
        acc.totalCustomerDue += Math.max(0, item.customerDueTotal);
        acc.totalAlerts += item.totalStockAlertCount;
        return acc;
      },
      {
        count: 0,
        productCount: 0,
        todayOut: 0,
        todayReturn: 0,
        todaySold: 0,
        todaySales: 0,
        monthSales: 0,
        yearSales: 0,
        allTimeSales: 0,
        totalDue: 0,
        totalCustomerDue: 0,
        totalAlerts: 0,
      }
    );

  const lastVisitedCompany = useMemo(() => {
    if (lastVisitedCompanyId) {
      const found = data.companies.find((c) => c.id === lastVisitedCompanyId);
      if (found) return found;
    }
    return data.companies[0] ?? null;
  }, [data.companies, lastVisitedCompanyId]);

  const allTotals = useMemo(() => summarizeGroup(companySummaries), [companySummaries]);
  const realTotals = useMemo(
    () => summarizeGroup(companySummaries.filter((c) => !c.isDemo)),
    [companySummaries]
  );
  const demoTotals = useMemo(
    () => summarizeGroup(companySummaries.filter((c) => c.isDemo)),
    [companySummaries]
  );

  const activeTotals =
    effectiveSourceFilter === 'real'
      ? realTotals
      : effectiveSourceFilter === 'demo'
        ? demoTotals
        : allTotals;

  if (data.companies.length === 0) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-2xl border border-slate-200/85 bg-white p-8 text-center shadow-[0_4px_24px_-6px_rgba(15,41,66,0.08)] sm:p-12">
          <BrandLogo variant="full" className="mx-auto mb-5 h-24 w-24" />
          <p className="text-sm font-extrabold tracking-wide text-[#1E3A8A]">
            Khan Enterprise · ডিস্ট্রিবিউশন এজেন্সি
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0f172a] sm:text-3xl">
            Khan Enterprise-এর দৈনিক সেলস খাতা শুরু করুন
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-[15px] font-medium leading-relaxed text-[#1e293b]">
            আপনি যে সকল কোম্পানির সাথে ব্যবসা করেন সেগুলো এখানে যোগ করুন। প্রতিটি কোম্পানির ট্যাবে গিয়ে প্রোডাক্টের রেট, প্রতিদিনের মার্কেটে যাওয়া মাল, রিটার্ন এবং দিন-মাস-বছর ভিত্তিক সেলস হিসাব দেখতে পারবেন।
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onAddCompany}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              প্রথম কোম্পানি যোগ করুন
            </button>
            <button
              type="button"
              onClick={() => {
                onLoadSampleData();
                setDemoFeedback('স্যাম্পল ডেটা লোড হয়েছে।');
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-5 py-2.5 text-[15px] font-bold text-[#1E3A8A] transition-colors hover:bg-blue-100 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4 text-[#1E3A8A]" />
              স্যাম্পল ডেটা লোড করুন
            </button>
            {onOpenProfilePage && (
              <button
                type="button"
                onClick={onOpenProfilePage}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-[15px] font-semibold text-[#0f172a] transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                <Home className="h-4 w-4 text-[#1E3A8A]" />
                পরিচিতি পেজ দেখুন
              </button>
            )}
          </div>
          {demoFeedback && (
            <p className="mt-4 text-sm font-bold text-teal-800">{demoFeedback}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PrintLetterhead
        reportTitle="সকল কোম্পানির সেলস সারসংক্ষেপ"
        reportDate={formatDateBn(today, true)}
        subtitle={`মোট কোম্পানি: ${activeTotals.count}টি · আজকের সেলস: ${formatTaka(activeTotals.todaySales)}`}
      />

      {/* Brand Header & Search Controls */}
      <div className="no-print flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1e293b]">
            Khan Enterprise · ডিস্ট্রিবিউশন এজেন্সি · {formatDateBn(today, true)}
          </p>
          <h1 className="mt-1 text-2xl sm:text-[26px] font-extrabold tracking-tight text-[#0f172a]">
            ব্যবসায়িক কোম্পানি ও সেলস সারসংক্ষেপ
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-0 w-full sm:min-w-[210px] sm:w-auto sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="কোম্পানি খুঁজুন..."
              className="w-full min-h-[42px] sm:min-h-0 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3.5 text-base sm:text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>
          <button
            type="button"
            onClick={onOpenPeriodReports}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[15px] font-semibold text-[#0f172a] shadow-xs transition-all hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <BarChart3 className="h-4 w-4 text-teal-700" />
            দিন · মাস · বছর রিপোর্ট
          </button>
          {onOpenProfilePage && (
            <button
              type="button"
              onClick={onOpenProfilePage}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200/90 bg-blue-50/75 px-3.5 py-2 text-[15px] font-bold text-[#1E3A8A] shadow-xs transition-all hover:border-blue-300 hover:bg-blue-100 whitespace-nowrap shrink-0"
            >
              <Home className="h-4 w-4 text-[#1E3A8A]" />
              পরিচিতি পেজ
            </button>
          )}
          {!hasDemoData ? (
            <button
              type="button"
              onClick={() => {
                onLoadSampleData();
                setDemoFeedback('স্যাম্পল ডেটা লোড হয়েছে।');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-[14px] font-bold text-amber-950 shadow-xs transition-all hover:bg-amber-100 whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-4 w-4 text-amber-700" />
              টেস্ট ডেটা
            </button>
          ) : (
            onClearDemoData && (
              <button
                type="button"
                onClick={() => {
                  onClearDemoData();
                  setSourceFilter('all');
                  setDemoFeedback('ডেমো ডেটা মুছে ফেলা হয়েছে।');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-[14px] font-bold text-rose-700 shadow-xs transition-all hover:bg-rose-100 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-4 w-4" />
                ডেমো মুছুন
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-[15px] font-semibold text-[#0f172a] shadow-xs transition-all hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Printer className="h-4 w-4 text-[#0f172a]" />
            প্রিন্ট
          </button>
          <button
            type="button"
            onClick={onAddCompany}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-[15px] font-bold text-white shadow-xs transition-all hover:bg-teal-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            নতুন কোম্পানি
          </button>
        </div>
      </div>

      {/* 1-Click Quick Actions & Remembered Filter Reset Strip */}
      <section className="no-print flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold tracking-wide text-slate-600 pr-1">
            ১-ক্লিক শর্টকাট:
          </span>
          {lastVisitedCompany && (
            <button
              type="button"
              onClick={() => onSelectCompany(lastVisitedCompany.id)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-teal-700/35 bg-teal-50 px-3 text-xs sm:text-[13px] font-extrabold text-teal-900 transition-colors hover:bg-teal-100 whitespace-nowrap"
            >
              <span>↩ {lastVisitedCompany.name} সেলস শিট</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
          {onOpenChalanVerify && (
            <button
              type="button"
              onClick={onOpenChalanVerify}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3 text-xs sm:text-[13px] font-extrabold text-indigo-900 transition-colors hover:bg-indigo-100 whitespace-nowrap"
            >
              <ClipboardCheck className="h-3.5 w-3.5 text-indigo-700" />
              চালান যাচাই ও নোট
            </button>
          )}
          {onOpenCustomerCredit && (
            <button
              type="button"
              onClick={onOpenCustomerCredit}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/85 px-3 text-xs sm:text-[13px] font-extrabold text-amber-950 transition-colors hover:bg-amber-100 whitespace-nowrap"
            >
              <Users className="h-3.5 w-3.5 text-amber-700" />
              কাস্টমার বাকি ({formatTaka(activeTotals.totalCustomerDue)})
            </button>
          )}
          {onOpenStockReport && (
            <button
              type="button"
              onClick={onOpenStockReport}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs sm:text-[13px] font-bold text-[#0f172a] transition-colors hover:bg-slate-100 whitespace-nowrap"
            >
              <Package className="h-3.5 w-3.5 text-[#1E3A8A]" />
              স্টক রিপোর্ট
            </button>
          )}
        </div>

        {(searchQuery.trim() !== '' || sourceFilter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSourceFilter('all');
            }}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            ফিল্টার রিসেট
          </button>
        )}
      </section>

      {/* Clear Sample Data Notice Banner (prevents real & demo totals from ever being confused) */}
      {hasDemoData && (
        <div
          role="note"
          className="no-print flex flex-col gap-3 rounded-2xl border border-amber-300/95 bg-amber-50/75 px-5 py-4 shadow-xs lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-200/80 text-amber-950">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-amber-400 bg-amber-200/85 px-2 py-0.5 text-xs font-extrabold text-amber-950 whitespace-nowrap">
                  স্যাম্পল ডেটা
                </span>
                <h2 className="text-[15px] font-extrabold text-[#0f172a]">
                  পরীক্ষামূলক স্যাম্পল ডেটা সক্রিয় রয়েছে
                </h2>
              </div>
              <p className="mt-1 text-xs sm:text-[13px] font-medium leading-relaxed text-slate-800">
                {hasMixedRealAndDemo
                  ? `আপনার মূল ${formatNumber(realCount)}টি কোম্পানির সাথে ${formatNumber(demoCount)}টি স্যাম্পল কোম্পানি আলাদা 'স্যাম্পল ডেটা' ব্যাজসহ দেখানো হচ্ছে। নিচের ফিল্টার থেকে মূল হিসাব আলাদা দেখতে পারেন বা পরীক্ষা শেষে এক ক্লিকে ডেমো ডেটা মুছতে পারেন।`
                  : `নতুন সেটআপে প্রোডাক্ট, দৈনিক সেলস, বকেয়া বাকি ও স্টক সতর্কতা পরীক্ষা করতে ${formatNumber(demoCount)}টি স্যাম্পল কোম্পানি লোড আছে। মূল হিসাব শুরু করতে চাইলে নিচের 'ডেমো ডেটা মুছুন' বাটনে চাপুন — আপনার নিজস্ব হিসাব অক্ষত থাকবে।`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {hasMixedRealAndDemo && (
              <div
                className="inline-flex rounded-xl border border-amber-300 bg-white p-0.5"
                role="tablist"
                aria-label="হিসাব ফিল্টার"
              >
                {(
                  [
                    { key: 'all', label: `সব (${companySummaries.length})` },
                    { key: 'real', label: `মূল হিসাব (${realCount})` },
                    { key: 'demo', label: `স্যাম্পল (${demoCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={effectiveSourceFilter === tab.key}
                    onClick={() => setSourceFilter(tab.key)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                      effectiveSourceFilter === tab.key
                        ? 'bg-[#1E3A8A] text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {onClearDemoData && (
              <button
                type="button"
                onClick={() => {
                  onClearDemoData();
                  setSourceFilter('all');
                  setDemoFeedback('ডেমো ডেটা সফলভাবে মুছে ফেলা হয়েছে।');
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 text-xs sm:text-sm font-extrabold text-rose-700 shadow-xs transition-colors hover:bg-rose-50 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                ডেমো ডেটা মুছুন
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4-Column Day / Month / Year Sales KPI Strip */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-300/80 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.08)] sm:grid-cols-2 lg:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="bg-teal-50/75 px-5 py-4.5 transition-colors hover:bg-teal-50">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-teal-900">আজকের সেলস (দিন)</p>
            {hasDemoData && effectiveSourceFilter === 'all' && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-900 whitespace-nowrap">
                {hasMixedRealAndDemo ? 'স্যাম্পলসহ' : 'স্যাম্পল'}
              </span>
            )}
          </div>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-teal-800">
            {formatTaka(activeTotals.todaySales)}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#0f172a]">
            মার্কেট {formatNumber(activeTotals.todayOut)} · রিটার্ন{' '}
            {formatNumber(activeTotals.todayReturn)}
          </p>
          {hasMixedRealAndDemo && effectiveSourceFilter === 'all' && (
            <p className="font-mono-tabular mt-1 text-xs font-bold text-[#1E3A8A]">
              মূল হিসাব: {formatTaka(realTotals.todaySales)}
            </p>
          )}
        </div>

        <div className="px-5 py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-sm font-bold text-[#111827]">এই মাসের সেলস (মাস)</p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {formatTaka(activeTotals.monthSales)}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#1e293b]">{formatMonthBn(currentMonth)}</p>
          {hasMixedRealAndDemo && effectiveSourceFilter === 'all' && (
            <p className="font-mono-tabular mt-1 text-xs font-bold text-[#1E3A8A]">
              মূল হিসাব: {formatTaka(realTotals.monthSales)}
            </p>
          )}
        </div>

        <div className="px-5 py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-sm font-bold text-[#111827]">এই বছরের সেলস (বছর)</p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {formatTaka(activeTotals.yearSales)}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#1e293b]">{currentYear} সাল</p>
          {hasMixedRealAndDemo && effectiveSourceFilter === 'all' && (
            <p className="font-mono-tabular mt-1 text-xs font-bold text-[#1E3A8A]">
              মূল হিসাব: {formatTaka(realTotals.yearSales)}
            </p>
          )}
        </div>

        <div
          className={`px-5 py-4.5 transition-colors ${
            activeTotals.totalDue > 0 || activeTotals.totalAlerts > 0
              ? 'bg-rose-50/55 hover:bg-rose-50/80'
              : 'hover:bg-slate-50/80'
          }`}
        >
          <p className="text-sm font-bold text-[#111827]">মোট বকেয়া বাকি ও সতর্কতা</p>
          <p
            className={`font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold ${
              activeTotals.totalDue > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {formatTaka(activeTotals.totalDue)}
          </p>
          <p className="font-mono-tabular mt-1 text-xs sm:text-[13px] font-bold text-[#0f172a]">
            {formatNumber(activeTotals.count)} কোম্পানি · কাস্টমার বাকি{' '}
            <span className={activeTotals.totalCustomerDue > 0 ? 'text-amber-800' : 'text-teal-800'}>
              {formatTaka(activeTotals.totalCustomerDue)}
            </span>
            {' · '}
            সতর্কতা{' '}
            <span className={activeTotals.totalAlerts > 0 ? 'text-rose-700' : 'text-emerald-700'}>
              {formatNumber(activeTotals.totalAlerts)}টি
            </span>
          </p>
          {hasMixedRealAndDemo && effectiveSourceFilter === 'all' && (
            <p className="font-mono-tabular mt-1 text-xs font-bold text-[#1E3A8A]">
              মূল: {realTotals.count}টি · বাকি {formatTaka(realTotals.totalDue)}
            </p>
          )}
        </div>
      </div>

      {/* Prominent High-Contrast Alert Strip for Critical Dues & Stock Alerts */}
      {(activeTotals.totalDue > 0 || activeTotals.totalCustomerDue > 0 || activeTotals.totalAlerts > 0) && (
        <section className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-rose-200/90 bg-gradient-to-r from-rose-50/80 via-white to-amber-50/70 px-4 py-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-2.5 py-1 text-xs font-extrabold text-white whitespace-nowrap">
              <AlertTriangle className="h-3.5 w-3.5" />
              একনজরে জরুরি হিসাব
            </span>
            {activeTotals.totalDue > 0 && (
              <span className="font-mono-tabular text-xs sm:text-sm font-extrabold text-rose-800">
                কোম্পানি বাকি: <strong className="text-[15px]">{formatTaka(activeTotals.totalDue)}</strong>
              </span>
            )}
            {activeTotals.totalCustomerDue > 0 && (
              <span className="font-mono-tabular text-xs sm:text-sm font-extrabold text-amber-900">
                কাস্টমার বাকি: <strong className="text-[15px]">{formatTaka(activeTotals.totalCustomerDue)}</strong>
              </span>
            )}
            {activeTotals.totalAlerts > 0 && (
              <span className="font-mono-tabular text-xs sm:text-sm font-extrabold text-rose-800">
                স্টক সতর্কতা: <strong className="text-[15px]">{formatNumber(activeTotals.totalAlerts)}টি</strong>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenCustomerCredit && activeTotals.totalCustomerDue > 0 && (
              <button
                type="button"
                onClick={onOpenCustomerCredit}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-extrabold text-amber-950 hover:bg-amber-50"
              >
                বাকি দেখুন →
              </button>
            )}
            {onOpenNotifications && activeTotals.totalAlerts > 0 && (
              <button
                type="button"
                onClick={onOpenNotifications}
                className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-extrabold text-rose-800 hover:bg-rose-50"
              >
                সতর্কতা দেখুন →
              </button>
            )}
          </div>
        </section>
      )}

      {/* Live Godown Aging & Last-5-Carton Stock Notification Bar */}
      {notifications.length > 0 && onOpenNotifications && (
        <div className="no-print flex flex-col gap-3 rounded-2xl border border-amber-300/90 bg-gradient-to-r from-amber-50/90 via-white to-rose-50/80 px-5 py-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1E3A8A] text-white shadow-xs">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-extrabold text-[#0f172a]">
                  গুদাম ও স্টক নোটিফিকেশন
                </span>
                {unreadNotificationCount > 0 && (
                  <span className="rounded-md bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white">
                    {unreadNotificationCount}টি নতুন
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm font-semibold">
                {notifications.filter((n) => n.category === 'low_stock').length > 0 && (
                  <span className="inline-flex items-center gap-1 text-rose-800">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                    লাস্ট {LAST_FIVE_STOCK_THRESHOLD} কার্টন / লো-স্টক:{' '}
                    <strong className="font-mono-tabular">
                      {notifications.filter((n) => n.category === 'low_stock').length}টি
                    </strong>
                  </span>
                )}
                {notifications.filter((n) => n.category === 'godown_aged').length > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-900">
                    <Clock className="h-4 w-4 text-amber-600" />
                    ১ মাসের+ গুদামে:{' '}
                    <strong className="font-mono-tabular">
                      {notifications.filter((n) => n.category === 'godown_aged').length}টি
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenNotifications}
            className="inline-flex items-center gap-1.5 self-start rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[#172e6e] sm:self-center whitespace-nowrap shrink-0"
          >
            <Bell className="h-4 w-4" />
            নোটিফিকেশন দেখুন ({notifications.length})
          </button>
        </div>
      )}

      {/* Companies Grid */}
      {filteredSummaries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
          <Building2 className="mx-auto mb-2 h-6 w-6 text-slate-600" />
          <p className="text-[15px] font-semibold text-[#0f172a]">
            {searchQuery.trim()
              ? `“${searchQuery}” নামে কোনো কোম্পানি পাওয়া যায়নি।`
              : 'নির্বাচিত ফিল্টারে কোনো কোম্পানি নেই।'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-3">
          {filteredSummaries.map(
            ({
              company,
              isDemo,
              productCount,
              todayOut,
              todayReturn,
              todaySold,
              todaySalesAmount,
              monthSales,
              yearSales,
              dueAmount,
              receivableAmount,
              customerDueTotal,
              dueCustomerCount,
              lowStockAlertCount,
              agedStockAlertCount,
              totalStockAlertCount,
              totalDaysRecorded,
            }) => {
              const monthShareBase =
                activeTotals.monthSales > 0 ? activeTotals.monthSales : allTotals.monthSales;
              const monthSharePct =
                monthShareBase > 0
                  ? Math.min(100, Math.round((monthSales / monthShareBase) * 100))
                  : 0;

              return (
                <div
                  key={company.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectCompany(company.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectCompany(company.id);
                    }
                  }}
                  className={`group print-avoid-break cursor-pointer flex flex-col justify-between rounded-2xl border p-5 text-left shadow-[0_2px_14px_-4px_rgba(15,41,66,0.07)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-8px_rgba(15,41,66,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] print:shadow-none print:border-slate-300 ${
                    isDemo
                      ? 'border-amber-300/95 bg-amber-50/15 hover:border-amber-500'
                      : dueAmount > 0 && lowStockAlertCount > 0
                        ? 'border-rose-300 bg-white ring-1 ring-rose-100 hover:border-rose-500'
                        : 'border-slate-300/85 bg-white hover:border-teal-600'
                  }`}
                >
                  <div>
                    {/* Company Title & Sample Data Tag */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <CompanyLogoAvatar
                          name={company.name}
                          logoUrl={company.logoUrl}
                          isDemo={isDemo}
                          className="h-11 w-11 rounded-xl"
                          textClassName="text-base font-extrabold"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h2 className="truncate text-lg font-bold text-[#0f172a] group-hover:text-[#1E3A8A]">
                              {company.name}
                            </h2>
                            {isDemo && (
                              <span className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-extrabold text-amber-950 whitespace-nowrap shrink-0">
                                স্যাম্পল ডেটা
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs sm:text-[13px] font-medium text-slate-600">
                            <span>{totalDaysRecorded} দিন এন্ট্রি</span>
                            {company.contactPerson && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{company.contactPerson}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="no-print flex items-center gap-1 shrink-0">
                        {onEditCompany && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditCompany(company);
                            }}
                            title="লোগো ও TSM/SR তথ্য এডিট করুন"
                            aria-label={`${company.name} লোগো ও প্রতিনিধি এডিট`}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-slate-600 transition-colors hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <ArrowUpRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#1E3A8A]" />
                      </div>
                    </div>

                    {(company.tsmName ||
                      company.tsmPhone ||
                      (company.srContacts && company.srContacts.length > 0) ||
                      company.phone) && (
                      <div className="mt-2.5">
                        <CompanyRepsStrip company={company} compact onStopPropagation />
                      </div>
                    )}

                    {/* 4-Metric At-a-Glance Summary Grid: Products, Today Sales, Due Balance, Stock Alerts */}
                    <div className="mt-4 grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-slate-200/90 bg-slate-50/85 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-700">
                          <Package className="h-3.5 w-3.5 text-[#1E3A8A] shrink-0" />
                          <span>মোট প্রোডাক্ট</span>
                        </div>
                        <p className="font-mono-tabular mt-1 text-[16px] font-extrabold text-[#1E3A8A]">
                          {formatNumber(productCount)}টি
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
                          {productCount > 0 ? 'তালিকাভুক্ত পণ্য' : 'পণ্য যোগ করুন'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-teal-200/90 bg-teal-50/65 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-teal-900">
                          <TrendingUp className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                          <span>আজকের সেলস</span>
                        </div>
                        <p className="font-mono-tabular mt-1 text-[16px] font-extrabold text-teal-800">
                          {formatTaka(todaySalesAmount)}
                        </p>
                        <p className="font-mono-tabular mt-0.5 text-[11px] font-semibold text-teal-900/80">
                          বিক্রি {formatNumber(todaySold)} ইউনিট
                        </p>
                      </div>

                      <div
                        className={`rounded-xl border px-3 py-2.5 ${
                          dueAmount > 0
                            ? 'border-rose-200/95 bg-rose-50/70'
                            : receivableAmount > 0
                              ? 'border-emerald-200/95 bg-emerald-50/65'
                              : 'border-slate-200/90 bg-slate-50/85'
                        }`}
                      >
                        <div
                          className={`flex items-center gap-1.5 text-[11.5px] font-bold ${
                            dueAmount > 0
                              ? 'text-rose-900'
                              : receivableAmount > 0
                                ? 'text-emerald-900'
                                : 'text-slate-700'
                          }`}
                        >
                          <Receipt className="h-3.5 w-3.5 shrink-0" />
                          <span>বকেয়া বাকি</span>
                        </div>
                        <p
                          className={`font-mono-tabular mt-1 text-[16px] font-extrabold ${
                            dueAmount > 0
                              ? 'text-rose-800'
                              : receivableAmount > 0
                                ? 'text-emerald-800'
                                : 'text-slate-800'
                          }`}
                        >
                          {dueAmount > 0 ? formatTaka(dueAmount) : '৳ ০'}
                        </p>
                        <p
                          className={`font-mono-tabular mt-0.5 text-[11px] font-semibold ${
                            dueAmount > 0
                              ? 'text-rose-700'
                              : receivableAmount > 0
                                ? 'text-emerald-700'
                                : 'text-slate-600'
                          }`}
                        >
                          {dueAmount > 0
                            ? 'কোম্পানিকে দিতে হবে'
                            : receivableAmount > 0
                              ? `পাওনা +${formatTaka(receivableAmount)}`
                              : 'বাকি নেই'}
                        </p>
                        {customerDueTotal > 0 && (
                          <p className="font-mono-tabular mt-0.5 text-[10.5px] font-bold text-amber-800 truncate">
                            কাস্টমার: {formatTaka(customerDueTotal)} ({formatNumber(dueCustomerCount)})
                          </p>
                        )}
                      </div>

                      <div
                        className={`rounded-xl border px-3 py-2.5 ${
                          totalStockAlertCount > 0
                            ? 'border-amber-300/95 bg-amber-50/75'
                            : 'border-emerald-200/85 bg-emerald-50/55'
                        }`}
                      >
                        <div
                          className={`flex items-center gap-1.5 text-[11.5px] font-bold ${
                            totalStockAlertCount > 0 ? 'text-amber-950' : 'text-emerald-900'
                          }`}
                        >
                          {totalStockAlertCount > 0 ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                          )}
                          <span>স্টক সতর্কতা</span>
                        </div>
                        <p
                          className={`font-mono-tabular mt-1 text-[16px] font-extrabold ${
                            lowStockAlertCount > 0
                              ? 'text-rose-700'
                              : totalStockAlertCount > 0
                                ? 'text-amber-900'
                                : 'text-emerald-800'
                          }`}
                        >
                          {totalStockAlertCount > 0
                            ? `${formatNumber(totalStockAlertCount)}টি সতর্কতা`
                            : 'স্বাভাবিক'}
                        </p>
                        <p className="font-mono-tabular mt-0.5 text-[11px] font-semibold text-slate-700 truncate">
                          {totalStockAlertCount > 0
                            ? [
                                lowStockAlertCount > 0 ? `লো-স্টক ${lowStockAlertCount}` : '',
                                agedStockAlertCount > 0 ? `গুদাম ${agedStockAlertCount}` : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : 'স্টক পর্যাপ্ত আছে'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Month Share Bar + Month/Year Recap */}
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#1e293b]">
                      <span>চলতি মাসের সেলস শেয়ার</span>
                      <span className="font-mono-tabular font-bold text-[#0f2942]">
                        {monthSharePct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#1E3A8A] to-teal-600 transition-all duration-300"
                        style={{ width: `${monthSharePct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                    <div>
                      <p className="text-xs font-semibold text-[#1e293b]">এই মাস</p>
                      <p className="font-mono-tabular mt-0.5 text-sm font-bold text-[#0f2942]">
                        {formatTaka(monthSales)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[#1e293b]">এই বছর</p>
                      <p className="font-mono-tabular mt-0.5 text-sm font-bold text-[#0f2942]">
                        {formatTaka(yearSales)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5 text-xs sm:text-[13px] font-medium text-[#1e293b]">
                    <span className="font-mono-tabular">
                      আউট {formatNumber(todayOut)} · রিটার্ন {formatNumber(todayReturn)} · বিক্রি{' '}
                      {formatNumber(todaySold)}
                    </span>
                    <span className="no-print font-bold text-[#1E3A8A] group-hover:underline whitespace-nowrap">
                      খাতা খুলুন
                    </span>
                  </div>
                </div>
              );
            }
          )}

          {/* Quick Add Company Tile */}
          <button
            type="button"
            onClick={onAddCompany}
            className="no-print flex min-h-[260px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/75 p-6 text-center transition-all hover:border-teal-600 hover:bg-white hover:shadow-[0_6px_20px_-6px_rgba(15,41,66,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-teal-700">
              <Plus className="h-5 w-5" />
            </div>
            <span className="mt-3 text-base font-bold text-[#0f172a]">
              নতুন কোম্পানি যোগ করুন
            </span>
            <span className="mt-1 text-sm font-medium text-[#1e293b]">
              Khan Enterprise-এ নতুন কোম্পানি যুক্ত করুন
            </span>
          </button>
        </div>
      )}

      {/* Year-over-Year Same-Month Comparison Chart */}
      <MonthlyComparisonChart data={data} />

      {/* 1-Click Sample / Demo Data Testing Bar */}
      <section className="no-print flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-[0_2px_12px_-4px_rgba(15,41,66,0.06)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-extrabold text-[#0f172a]">
            স্যাম্পল ও ডেমো ডেটা পরীক্ষা (১-ক্লিক)
          </p>
          <p className="mt-0.5 text-xs font-medium text-slate-600">
            মূল হিসাবের সাথে না মিশিয়ে প্রোডাক্ট, দৈনিক সেলস, বকেয়া বাকি ও স্টক সতর্কতা পরীক্ষা করুন।{' '}
            {demoFeedback && (
              <span className="font-bold text-teal-800">{demoFeedback}</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onLoadSampleData();
              setDemoFeedback('স্যাম্পল ডেটা লোড হয়েছে।');
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 text-xs sm:text-sm font-bold text-[#1E3A8A] transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            স্যাম্পল ডেটা লোড করুন
          </button>

          {hasDemoData && onClearDemoData && (
            <button
              type="button"
              onClick={() => {
                onClearDemoData();
                setSourceFilter('all');
                setDemoFeedback('ডেমো ডেটা মুছে ফেলা হয়েছে।');
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3.5 text-xs sm:text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              ডেমো ডেটা মুছুন
            </button>
          )}
        </div>
      </section>

      <PrintSignatureFooter />
    </div>
  );
};
