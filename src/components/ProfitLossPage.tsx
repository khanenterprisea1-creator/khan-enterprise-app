import React, { useMemo, useState } from 'react';
import { Download, Printer, TrendingUp } from 'lucide-react';
import { Company, LedgerData } from '../types/ledger';
import {
  formatDateBn,
  formatMonthBn,
  formatNumber,
  formatTaka,
  getCurrentMonthISO,
  getCurrentYear,
  getTodayISO,
} from '../utils/storage';
import { Company1to1Summary } from '../utils/companySummary';
import { CompanyScopeBar } from './CompanyScopeBar';
import { MonthlyComparisonChart } from './MonthlyComparisonChart';
import { Last7DaysSalesChart } from './Last7DaysSalesChart';
import { PrintLetterhead, PrintSignatureFooter } from './PrintLetterhead';
import {
  createDateRangePreset,
  DateRangeFilterBar,
  DateRangeValue,
  formatDateRangeLabelBn,
  isDateInRange,
} from './DateRangeFilterBar';

interface ProfitLossPageProps {
  data: LedgerData;
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompanyId: (companyId: string) => void;
  oneToOneSummary?: Company1to1Summary | null;
  onOpenWorkspace?: (companyId: string) => void;
  onAddCompany?: () => void;
}

type PLPeriodMode = 'day' | 'month' | 'year';

interface PLRow {
  key: string;
  label: string;
  totalSales: number;
  commission: number;
  expense: number;
  net: number;
}

export const ProfitLossPage: React.FC<ProfitLossPageProps> = ({
  data,
  companies,
  selectedCompanyId,
  onSelectCompanyId,
  oneToOneSummary,
  onOpenWorkspace,
  onAddCompany,
}) => {
  const selectedCompany =
    companies.find((c) => c.id === selectedCompanyId) ?? companies[0] ?? null;
  const today = getTodayISO();
  const currentMonth = getCurrentMonthISO();
  const currentYear = getCurrentYear();

  const [periodMode, setPeriodMode] = useState<PLPeriodMode>('day');
  const [dateRange, setDateRange] = useState<DateRangeValue>(() =>
    createDateRangePreset('all', today)
  );
  const [plSearch, setPlSearch] = useState<string>('');
  const [commissionRate, setCommissionRate] = useState<number>(5);

  const allEntries = useMemo(() => Object.values(data.entries), [data.entries]);
  const allExpenses = useMemo(
    () => data.cashTransactions.filter((tx) => tx.type === 'expense'),
    [data.cashTransactions]
  );

  // Build daily merged rows (combining all sales dates and all expense dates)
  const dailyRows: PLRow[] = useMemo(() => {
    const salesByDate = new Map<string, number>();
    for (const e of allEntries) {
      salesByDate.set(e.date, (salesByDate.get(e.date) ?? 0) + e.totalSalesAmount);
    }

    const expenseByDate = new Map<string, number>();
    for (const ex of allExpenses) {
      expenseByDate.set(ex.date, (expenseByDate.get(ex.date) ?? 0) + ex.amount);
    }

    const allDates = new Set<string>([...salesByDate.keys(), ...expenseByDate.keys()]);
    const rateFraction = commissionRate / 100;

    return Array.from(allDates)
      .sort((a, b) => b.localeCompare(a))
      .map((date) => {
        const totalSales = Number((salesByDate.get(date) ?? 0).toFixed(2));
        const commission = Number((totalSales * rateFraction).toFixed(2));
        const expense = Number((expenseByDate.get(date) ?? 0).toFixed(2));
        const net = Number((commission - expense).toFixed(2));
        return {
          key: date,
          label: formatDateBn(date, true),
          totalSales,
          commission,
          expense,
          net,
        };
      })
      .filter((r) => r.totalSales > 0 || r.expense > 0);
  }, [allEntries, allExpenses, commissionRate]);

  // Build monthly merged rows
  const monthlyRows: PLRow[] = useMemo(() => {
    const salesByMonth = new Map<string, number>();
    for (const e of allEntries) {
      const ym = e.date.slice(0, 7);
      salesByMonth.set(ym, (salesByMonth.get(ym) ?? 0) + e.totalSalesAmount);
    }

    const expenseByMonth = new Map<string, number>();
    for (const ex of allExpenses) {
      const ym = ex.date.slice(0, 7);
      expenseByMonth.set(ym, (expenseByMonth.get(ym) ?? 0) + ex.amount);
    }

    const allMonths = new Set<string>([...salesByMonth.keys(), ...expenseByMonth.keys()]);
    const rateFraction = commissionRate / 100;

    return Array.from(allMonths)
      .sort((a, b) => b.localeCompare(a))
      .map((ym) => {
        const totalSales = Number((salesByMonth.get(ym) ?? 0).toFixed(2));
        const commission = Number((totalSales * rateFraction).toFixed(2));
        const expense = Number((expenseByMonth.get(ym) ?? 0).toFixed(2));
        const net = Number((commission - expense).toFixed(2));
        return {
          key: ym,
          label: formatMonthBn(ym),
          totalSales,
          commission,
          expense,
          net,
        };
      })
      .filter((r) => r.totalSales > 0 || r.expense > 0);
  }, [allEntries, allExpenses, commissionRate]);

  // Build yearly merged rows
  const yearlyRows: PLRow[] = useMemo(() => {
    const salesByYear = new Map<string, number>();
    for (const e of allEntries) {
      const yr = e.date.slice(0, 4);
      salesByYear.set(yr, (salesByYear.get(yr) ?? 0) + e.totalSalesAmount);
    }

    const expenseByYear = new Map<string, number>();
    for (const ex of allExpenses) {
      const yr = ex.date.slice(0, 4);
      expenseByYear.set(yr, (expenseByYear.get(yr) ?? 0) + ex.amount);
    }

    const allYears = new Set<string>([...salesByYear.keys(), ...expenseByYear.keys()]);
    const rateFraction = commissionRate / 100;

    return Array.from(allYears)
      .sort((a, b) => b.localeCompare(a))
      .map((yr) => {
        const totalSales = Number((salesByYear.get(yr) ?? 0).toFixed(2));
        const commission = Number((totalSales * rateFraction).toFixed(2));
        const expense = Number((expenseByYear.get(yr) ?? 0).toFixed(2));
        const net = Number((commission - expense).toFixed(2));
        return {
          key: yr,
          label: `${yr} সাল`,
          totalSales,
          commission,
          expense,
          net,
        };
      })
      .filter((r) => r.totalSales > 0 || r.expense > 0);
  }, [allEntries, allExpenses, commissionRate]);

  // Summary metrics: Today, This Month, This Year, All Time
  const summaryCards = useMemo(() => {
    const rateFraction = commissionRate / 100;

    const calcForPrefix = (prefix: string | null) => {
      let sales = 0;
      let expense = 0;
      for (const e of allEntries) {
        if (!prefix || e.date.startsWith(prefix)) {
          sales += e.totalSalesAmount;
        }
      }
      for (const ex of allExpenses) {
        if (!prefix || ex.date.startsWith(prefix)) {
          expense += ex.amount;
        }
      }
      const commission = Number((sales * rateFraction).toFixed(2));
      const net = Number((commission - expense).toFixed(2));
      return {
        sales: Number(sales.toFixed(2)),
        commission,
        expense: Number(expense.toFixed(2)),
        net,
      };
    };

    return {
      day: calcForPrefix(today),
      month: calcForPrefix(currentMonth),
      year: calcForPrefix(currentYear),
      all: calcForPrefix(null),
    };
  }, [allEntries, allExpenses, commissionRate, today, currentMonth, currentYear]);

  const visibleRows = useMemo(() => {
    const q = plSearch.trim().toLowerCase();
    const base =
      periodMode === 'day'
        ? dailyRows.filter((r) => isDateInRange(r.key, dateRange))
        : periodMode === 'month'
          ? monthlyRows
          : yearlyRows;

    if (!q) return base;
    return base.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q)
    );
  }, [periodMode, dateRange, plSearch, dailyRows, monthlyRows, yearlyRows]);

  const visibleTotals = useMemo(() => {
    return visibleRows.reduce(
      (acc, r) => {
        acc.totalSales += r.totalSales;
        acc.commission += r.commission;
        acc.expense += r.expense;
        acc.net += r.net;
        return acc;
      },
      { totalSales: 0, commission: 0, expense: 0, net: 0 }
    );
  }, [visibleRows]);

  // Product-wise commission breakdown for active 1-to-1 company
  const useActiveRangeForBreakdown =
    periodMode === 'day' && (Boolean(dateRange.fromDate) || Boolean(dateRange.toDate));
  const productCommissionLabel = useActiveRangeForBreakdown
    ? formatDateRangeLabelBn(dateRange)
    : formatMonthBn(currentMonth);

  const productCommissionRows = useMemo(() => {
    const rateFraction = commissionRate / 100;
    const aggMap = new Map<
      string,
      { productId: string; productName: string; unit: string; soldQty: number; sales: number }
    >();

    for (const p of data.products) {
      aggMap.set(p.id, {
        productId: p.id,
        productName: p.name,
        unit: p.unit,
        soldQty: 0,
        sales: 0,
      });
    }

    for (const e of allEntries) {
      const inWindow = useActiveRangeForBreakdown
        ? isDateInRange(e.date, dateRange)
        : e.date.startsWith(currentMonth);
      if (!inWindow) continue;
      for (const item of e.items) {
        const prev = aggMap.get(item.productId) ?? {
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          soldQty: 0,
          sales: 0,
        };
        prev.soldQty += item.soldQty;
        prev.sales += item.salesAmount;
        aggMap.set(item.productId, prev);
      }
    }

    return Array.from(aggMap.values())
      .map((row) => ({
        ...row,
        soldQty: Number(row.soldQty.toFixed(2)),
        sales: Number(row.sales.toFixed(2)),
        commission: Number((row.sales * rateFraction).toFixed(2)),
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [
    data.products,
    allEntries,
    useActiveRangeForBreakdown,
    dateRange,
    currentMonth,
    commissionRate,
  ]);

  if (!selectedCompany) {
    return (
      <div className="space-y-6">
        <CompanyScopeBar
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          onSelectCompanyId={onSelectCompanyId}
          onAddCompany={onAddCompany}
          moduleLabel="লাভ ও লস"
        />
      </div>
    );
  }

  const handleExportCsv = () => {
    const header = [
      'সময়কাল',
      `${selectedCompany.name}-এর সেলস (৳)`,
      `সেলসের ${commissionRate}% আয় (৳)`,
      'মোট খরচ (৳)',
      'নিট লাভ / লস (৳)',
      'অবস্থা',
    ];
    const rows = visibleRows.map((r) => [
      r.key,
      r.totalSales.toString(),
      r.commission.toString(),
      r.expense.toString(),
      r.net.toString(),
      r.net > 0 ? 'লাভ' : r.net < 0 ? 'লস' : 'সমান',
    ]);
    rows.push([
      'সর্বমোট',
      visibleTotals.totalSales.toFixed(2),
      visibleTotals.commission.toFixed(2),
      visibleTotals.expense.toFixed(2),
      visibleTotals.net.toFixed(2),
      visibleTotals.net > 0 ? 'লাভ' : visibleTotals.net < 0 ? 'লস' : 'সমান',
    ]);

    const csvContent =
      '\uFEFF' +
      [header, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const safePrefix = selectedCompany.name.replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safePrefix}_profit_loss_${periodMode}_${getTodayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderStatusText = (net: number) => {
    if (net > 0) {
      return <span className="text-emerald-700 font-bold">লাভ (+{formatTaka(net)})</span>;
    }
    if (net < 0) {
      return (
        <span className="text-rose-700 font-bold">
          লস (−{formatTaka(Math.abs(net))})
        </span>
      );
    }
    return <span className="text-[#0f172a] font-bold">সমান (৳ 0)</span>;
  };

  return (
    <div className="space-y-8">
      <PrintLetterhead
        reportTitle={`${selectedCompany.name} · লাভ ও লস হিসাব রিপোর্ট`}
        reportDate={formatDateBn(today, true)}
        subtitle={`${selectedCompany.name}-এর সেলসের ${commissionRate}% − ওই কোম্পানির খরচ`}
      />

      <CompanyScopeBar
        companies={companies}
        selectedCompanyId={selectedCompany.id}
        onSelectCompanyId={onSelectCompanyId}
        summary={oneToOneSummary}
        onOpenWorkspace={onOpenWorkspace}
        onAddCompany={onAddCompany}
        moduleLabel="লাভ ও লস"
      />

      {/* Header & Commission % Control */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1e293b]">
            Khan Enterprise · {selectedCompany.name} · ({selectedCompany.name}-এর সেলস × {commissionRate}%) − খরচ = লাভ / লস
          </p>
          <h1 className="mt-1 text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#0f172a]">
            {selectedCompany.name} — প্রতিদিন ও প্রতি মাসের লাভ-লস
          </h1>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5">
            <label htmlFor="commission-rate" className="text-sm font-bold text-[#0f172a]">
              সেলস কমিশন (%):
            </label>
            <input
              id="commission-rate"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={commissionRate}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0 && v <= 100) setCommissionRate(v);
              }}
              className="font-mono-tabular w-18 rounded border border-slate-300 px-2 py-1 text-right text-base sm:text-sm font-bold text-[#0f172a] focus:border-teal-600 focus:outline-none"
            />
            {commissionRate !== 5 && (
              <button
                type="button"
                onClick={() => setCommissionRate(5)}
                className="text-xs font-bold text-teal-800 hover:underline"
              >
                ৫% সেট
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={visibleRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Excel (CSV)
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            প্রিন্ট
          </button>
        </div>
      </div>

      {/* 4-Column Profit & Loss KPI Strip (Today · This Month · This Year · All Time) */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-200 shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] min-[420px]:grid-cols-2 lg:grid-cols-4">
        {/* Today */}
        <div className="bg-white px-4 py-4 sm:px-5 sm:py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-xs sm:text-sm font-bold text-[#1e293b]">আজকের লাভ / লস (দিন)</p>
          <p className="font-mono-tabular mt-1.5 text-xl sm:text-2xl font-extrabold">
            {renderStatusText(summaryCards.day.net)}
          </p>
          <p className="font-mono-tabular mt-1 text-xs sm:text-sm font-medium text-[#1e293b]">
            {commissionRate}% আয় {formatTaka(summaryCards.day.commission)} · খরচ{' '}
            {formatTaka(summaryCards.day.expense)}
          </p>
        </div>

        {/* This Month */}
        <div className="bg-white px-4 py-4 sm:px-5 sm:py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-xs sm:text-sm font-bold text-[#1e293b]">
            এই মাসের লাভ / লস ({formatMonthBn(currentMonth)})
          </p>
          <p className="font-mono-tabular mt-1.5 text-xl sm:text-2xl font-extrabold">
            {renderStatusText(summaryCards.month.net)}
          </p>
          <p className="font-mono-tabular mt-1 text-xs sm:text-sm font-medium text-[#1e293b]">
            {commissionRate}% আয় {formatTaka(summaryCards.month.commission)} · খরচ{' '}
            {formatTaka(summaryCards.month.expense)}
          </p>
        </div>

        {/* This Year */}
        <div className="bg-white px-4 py-4 sm:px-5 sm:py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-xs sm:text-sm font-bold text-[#1e293b]">
            এই বছরের লাভ / লস ({currentYear} সাল)
          </p>
          <p className="font-mono-tabular mt-1.5 text-xl sm:text-2xl font-extrabold">
            {renderStatusText(summaryCards.year.net)}
          </p>
          <p className="font-mono-tabular mt-1 text-xs sm:text-sm font-medium text-[#1e293b]">
            {commissionRate}% আয় {formatTaka(summaryCards.year.commission)} · খরচ{' '}
            {formatTaka(summaryCards.year.expense)}
          </p>
        </div>

        {/* All Time */}
        <div
          className={`px-4 py-4 sm:px-5 sm:py-4.5 transition-colors ${
            summaryCards.all.net >= 0
              ? 'bg-emerald-50/90 hover:bg-emerald-50'
              : 'bg-rose-50/90 hover:bg-rose-50'
          }`}
        >
          <p className="text-xs sm:text-sm font-bold text-[#0f172a]">সর্বমোট নিট লাভ / লস</p>
          <p className="font-mono-tabular mt-1.5 text-xl sm:text-2xl font-extrabold">
            {renderStatusText(summaryCards.all.net)}
          </p>
          <p className="font-mono-tabular mt-1 text-xs sm:text-sm font-semibold text-[#1e293b]">
            মোট সেলস {formatTaka(summaryCards.all.sales)} ({commissionRate}% ={' '}
            {formatTaka(summaryCards.all.commission)})
          </p>
        </div>
      </div>

      {/* Last 7 Days Sales Performance Bar Chart (Recharts) */}
      <Last7DaysSalesChart data={data} commissionRate={commissionRate} />

      {/* Year-over-Year Same-Month Profit & Loss Comparison Chart */}
      <MonthlyComparisonChart
        data={data}
        defaultMetric="profit_loss"
        commissionRate={commissionRate}
        singleCompanyName={selectedCompany.name}
      />

      {/* Main Profit & Loss Ledger Table (Day / Month / Year) */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
        <div className="space-y-3 border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2.5">
              <TrendingUp className="h-5 w-5 text-teal-700" />
              <div>
                <h2 className="text-lg font-bold text-[#0f172a]">
                  {periodMode === 'day'
                    ? 'প্রতিদিনের লাভ ও লস তালিকা'
                    : periodMode === 'month'
                      ? 'প্রতি মাসের লাভ ও লস তালিকা'
                      : 'প্রতি বছরের লাভ ও লস তালিকা'}
                </h2>
                <p className="text-sm font-medium text-[#1e293b]">
                  {periodMode === 'day' ? `${formatDateRangeLabelBn(dateRange)} · ` : ''}
                  {selectedCompany.name}-এর সেলসের {commissionRate}% থেকে ওই সময়ের খরচ বাদ দিয়ে লাভ বা লস দেখানো হয়েছে।
                </p>
              </div>
            </div>

            <div className="no-print flex max-w-full flex-wrap items-center gap-2.5">
              <div className="inline-flex max-w-full overflow-x-auto no-scrollbar items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setPeriodMode('day')}
                  className={`min-h-[38px] sm:min-h-0 rounded-md px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    periodMode === 'day' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                  }`}
                >
                  প্রতিদিনের লাভ-লস
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodMode('month')}
                  className={`min-h-[38px] sm:min-h-0 rounded-md px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    periodMode === 'month' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                  }`}
                >
                  মাসিক লাভ-লস
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodMode('year')}
                  className={`min-h-[38px] sm:min-h-0 rounded-md px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    periodMode === 'year' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                  }`}
                >
                  বাৎসরিক লাভ-লস
                </button>
              </div>
            </div>
          </div>

          <DateRangeFilterBar
            value={dateRange}
            onChange={(next) => {
              setDateRange(next);
              if (periodMode !== 'day') setPeriodMode('day');
            }}
            searchQuery={plSearch}
            onSearchChange={setPlSearch}
            searchPlaceholder="তারিখ, মাস বা বছর খুঁজুন..."
          />
        </div>

        {visibleRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-[15px] font-medium text-[#1e293b]">
            {dailyRows.length === 0
              ? 'এখনও কোনো সেলস বা খরচের এন্ট্রি পাওয়া যায়নি। কোম্পানির সেলস এবং ক্যাশ ও খরচ পেইজে খরচ এন্ট্রি করলে এখানে অটো লাভ-লস হিসাব দেখা যাবে।'
              : 'নির্বাচিত তারিখের রেঞ্জ বা সার্চে কোনো লাভ-লসের হিসাব পাওয়া যায়নি।'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3 whitespace-nowrap">
                    {periodMode === 'day'
                      ? 'তারিখ'
                      : periodMode === 'month'
                        ? 'মাস ও বছর'
                        : 'বছর'}
                  </th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">মোট সেলস (৳)</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">সেলসের {commissionRate}% আয় (৳)</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">মোট খরচ (৳)</th>
                  <th className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">নিট লাভ / লস (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {visibleRows.map((row) => (
                  <tr
                    key={row.key}
                    onClick={() => {
                      if (periodMode === 'month') {
                        const [yStr, mStr] = row.key.split('-');
                        const lastDay = new Date(Number(yStr), Number(mStr), 0).getDate();
                        setDateRange({
                          preset: 'custom',
                          fromDate: `${row.key}-01`,
                          toDate: `${row.key}-${String(lastDay).padStart(2, '0')}`,
                        });
                        setPeriodMode('day');
                      }
                    }}
                    className={`transition-colors hover:bg-teal-50/40 ${
                      periodMode === 'month' ? 'cursor-pointer' : ''
                    }`}
                  >
                    <td className="py-3.5 pl-5 pr-3 font-semibold text-[#0f172a] whitespace-nowrap">
                      {row.label}
                      {row.key === today && (
                        <span className="ml-2 text-sm font-bold text-teal-800">· আজ</span>
                      )}
                      {row.key === currentMonth && (
                        <span className="ml-2 text-sm font-bold text-teal-800">· চলতি মাস</span>
                      )}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-medium text-[#1e293b] whitespace-nowrap">
                      {formatTaka(row.totalSales)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-[#0f172a] whitespace-nowrap">
                      {formatTaka(row.commission)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-rose-700 whitespace-nowrap">
                      {formatTaka(row.expense)}
                    </td>
                    <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right text-[15px] whitespace-nowrap">
                      {renderStatusText(row.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                  <td className="py-3.5 pl-5 pr-3 whitespace-nowrap">সর্বমোট ({visibleRows.length}টি সারি)</td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                    {formatTaka(visibleTotals.totalSales)}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                    {formatTaka(visibleTotals.commission)}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right text-rose-700 whitespace-nowrap">
                    {formatTaka(visibleTotals.expense)}
                  </td>
                  <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right text-base font-extrabold whitespace-nowrap">
                    {renderStatusText(visibleTotals.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Product-Wise Commission Breakdown for Selected Company */}
      {productCommissionRows.length > 0 && (
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-[#0f172a]">
              {selectedCompany.name} — প্রোডাক্ট অনুযায়ী {commissionRate}% কমিশন আয় — {productCommissionLabel}
            </h2>
            <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
              এই কোম্পানির কোন প্রোডাক্টের সেলস থেকে কত টাকা {commissionRate}% কমিশন এসেছে তার ১-টু-১ হিসাব।
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">প্রোডাক্টের নাম</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">নেট বিক্রি</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">মোট সেলস (৳)</th>
                  <th className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">{commissionRate}% কমিশন আয় (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {productCommissionRows.map((p) => (
                  <tr key={p.productId} className="hover:bg-slate-50/80">
                    <td className="py-3.5 pl-5 pr-3 font-semibold text-[#0f172a]">
                      {p.productName}{' '}
                      <span className="text-xs font-medium text-slate-600">({p.unit})</span>
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-medium text-[#1e293b] whitespace-nowrap">
                      {formatNumber(p.soldQty)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-medium text-[#1e293b] whitespace-nowrap">
                      {formatTaka(p.sales)}
                    </td>
                    <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right font-bold text-teal-800 whitespace-nowrap">
                      {formatTaka(p.commission)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <PrintSignatureFooter />
    </div>
  );
};
