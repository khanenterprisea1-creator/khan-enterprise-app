import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ArrowUpRight, Printer, Download } from 'lucide-react';
import { Company, LedgerData } from '../types/ledger';
import {
  formatDateBn,
  formatMonthBn,
  formatNumber,
  formatTaka,
  getCurrentMonthISO,
  getCurrentYear,
  getTodayISO,
  shiftDateISO,
  shiftMonthISO,
} from '../utils/storage';
import { Company1to1Summary } from '../utils/companySummary';
import { CompanyScopeBar } from './CompanyScopeBar';
import { MonthlyComparisonChart } from './MonthlyComparisonChart';
import { PrintLetterhead, PrintSignatureFooter } from './PrintLetterhead';
import {
  createDateRangePreset,
  DateRangeFilterBar,
  DateRangeValue,
  formatDateRangeLabelBn,
  isDateInRange,
} from './DateRangeFilterBar';

interface DailySummaryViewProps {
  data: LedgerData;
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompanyId: (companyId: string) => void;
  oneToOneSummary?: Company1to1Summary | null;
  onOpenWorkspace?: (companyId: string) => void;
  onAddCompany?: () => void;
  onSelectCompany: (companyId: string) => void;
}

type PeriodMode = 'day' | 'month' | 'year' | 'range';

export const DailySummaryView: React.FC<DailySummaryViewProps> = ({
  data,
  companies,
  selectedCompanyId,
  onSelectCompanyId,
  oneToOneSummary,
  onOpenWorkspace,
  onAddCompany,
  onSelectCompany,
}) => {
  const selectedCompany =
    companies.find((c) => c.id === selectedCompanyId) ?? companies[0] ?? null;

  const today = getTodayISO();
  const currentMonth = getCurrentMonthISO();
  const currentYear = getCurrentYear();

  const [periodMode, setPeriodMode] = useState<PeriodMode>('day');
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() =>
    createDateRangePreset('last_7', today)
  );
  const [productSearch, setProductSearch] = useState<string>('');

  const allEntries = useMemo(() => Object.values(data.entries), [data.entries]);

  const matchingPeriodEntries = useMemo(() => {
    return allEntries.filter((e) => {
      if (selectedCompany && e.companyId !== selectedCompany.id) return false;
      if (periodMode === 'day') return e.date === selectedDate;
      if (periodMode === 'month') return e.date.startsWith(selectedMonth);
      if (periodMode === 'year') return e.date.startsWith(selectedYear);
      return isDateInRange(e.date, dateRange);
    });
  }, [
    allEntries,
    selectedCompany,
    periodMode,
    selectedDate,
    selectedMonth,
    selectedYear,
    dateRange,
  ]);

  // Product-by-product aggregation for active 1-to-1 company & period
  const productPeriodRows = useMemo(() => {
    const map = new Map<
      string,
      {
        productId: string;
        productName: string;
        unit: string;
        daysSet: Set<string>;
        marketOut: number;
        returned: number;
        soldQty: number;
        salesAmount: number;
      }
    >();

    for (const p of data.products) {
      map.set(p.id, {
        productId: p.id,
        productName: p.name,
        unit: p.unit,
        daysSet: new Set<string>(),
        marketOut: 0,
        returned: 0,
        soldQty: 0,
        salesAmount: 0,
      });
    }

    for (const e of matchingPeriodEntries) {
      for (const item of e.items) {
        const rec = map.get(item.productId) ?? {
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          daysSet: new Set<string>(),
          marketOut: 0,
          returned: 0,
          soldQty: 0,
          salesAmount: 0,
        };
        if (item.marketOut > 0 || item.returned > 0 || item.salesAmount > 0) {
          rec.daysSet.add(e.date);
        }
        rec.marketOut += item.marketOut;
        rec.returned += item.returned;
        rec.soldQty += item.soldQty;
        rec.salesAmount += item.salesAmount;
        map.set(item.productId, rec);
      }
    }

    return Array.from(map.values())
      .map((r) => ({
        productId: r.productId,
        productName: r.productName,
        unit: r.unit,
        days: r.daysSet.size,
        marketOut: Number(r.marketOut.toFixed(2)),
        returned: Number(r.returned.toFixed(2)),
        soldQty: Number(r.soldQty.toFixed(2)),
        salesAmount: Number(r.salesAmount.toFixed(2)),
      }))
      .sort((a, b) => b.salesAmount - a.salesAmount || a.productName.localeCompare(b.productName));
  }, [data.products, matchingPeriodEntries]);

  const monthDailyBreakdown = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; marketOut: number; returned: number; soldQty: number; salesAmount: number }
    >();
    for (const e of allEntries) {
      if (!e.date.startsWith(selectedMonth)) continue;
      if (e.totalMarketOut === 0 && e.totalReturned === 0 && e.totalSalesAmount === 0) continue;
      const prev = byDate.get(e.date) ?? {
        date: e.date,
        marketOut: 0,
        returned: 0,
        soldQty: 0,
        salesAmount: 0,
      };
      prev.marketOut += e.totalMarketOut;
      prev.returned += e.totalReturned;
      prev.soldQty += e.totalSoldQty;
      prev.salesAmount += e.totalSalesAmount;
      byDate.set(e.date, prev);
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [allEntries, selectedMonth]);

  const yearMonthlyBreakdown = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, idx) => {
      const m = String(idx + 1).padStart(2, '0');
      return `${selectedYear}-${m}`;
    });

    return months.map((ym) => {
      const matching = allEntries.filter(
        (e) =>
          e.date.startsWith(ym) &&
          (e.totalMarketOut > 0 || e.totalReturned > 0 || e.totalSalesAmount > 0)
      );
      const uniqueDates = new Set(matching.map((e) => e.date));
      const agg = matching.reduce(
        (acc, e) => {
          acc.marketOut += e.totalMarketOut;
          acc.returned += e.totalReturned;
          acc.soldQty += e.totalSoldQty;
          acc.salesAmount += e.totalSalesAmount;
          return acc;
        },
        { marketOut: 0, returned: 0, soldQty: 0, salesAmount: 0 }
      );
      return {
        monthISO: ym,
        activeDays: uniqueDates.size,
        ...agg,
      };
    });
  }, [allEntries, selectedYear]);

  const rangeDailyBreakdown = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; marketOut: number; returned: number; soldQty: number; salesAmount: number }
    >();
    for (const e of allEntries) {
      if (!isDateInRange(e.date, dateRange)) continue;
      if (e.totalMarketOut === 0 && e.totalReturned === 0 && e.totalSalesAmount === 0) continue;
      const prev = byDate.get(e.date) ?? {
        date: e.date,
        marketOut: 0,
        returned: 0,
        soldQty: 0,
        salesAmount: 0,
      };
      prev.marketOut += e.totalMarketOut;
      prev.returned += e.totalReturned;
      prev.soldQty += e.totalSoldQty;
      prev.salesAmount += e.totalSalesAmount;
      byDate.set(e.date, prev);
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [allEntries, dateRange]);

  const activeProductRows = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return productPeriodRows;
    return productPeriodRows.filter(
      (row) =>
        row.productName.toLowerCase().includes(q) ||
        row.unit.toLowerCase().includes(q)
    );
  }, [productPeriodRows, productSearch]);

  const grandTotals = useMemo(() => {
    return activeProductRows.reduce(
      (acc, r) => {
        acc.marketOut += r.marketOut;
        acc.returned += r.returned;
        acc.soldQty += r.soldQty;
        acc.salesAmount += r.salesAmount;
        return acc;
      },
      { marketOut: 0, returned: 0, soldQty: 0, salesAmount: 0 }
    );
  }, [activeProductRows]);

  const periodLabel =
    periodMode === 'day'
      ? formatDateBn(selectedDate, true)
      : periodMode === 'month'
        ? formatMonthBn(selectedMonth)
        : periodMode === 'year'
          ? `${selectedYear} সাল`
          : formatDateRangeLabelBn(dateRange);

  if (!selectedCompany) {
    return (
      <div className="space-y-6">
        <CompanyScopeBar
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          onSelectCompanyId={onSelectCompanyId}
          onAddCompany={onAddCompany}
          moduleLabel="সেলস রিপোর্ট"
        />
      </div>
    );
  }

  const handleExportReportCsv = () => {
    const header = [
      'সময়কাল',
      'কোম্পানি',
      'প্রোডাক্টের নাম',
      'ইউনিট',
      'মার্কেটে গেছে',
      'রিটার্ন',
      'নেট বিক্রি',
      'মোট সেলস (৳)',
    ];
    const rows = activeProductRows.map((r) => [
      periodLabel,
      selectedCompany.name,
      r.productName,
      r.unit,
      r.marketOut.toString(),
      r.returned.toString(),
      r.soldQty.toString(),
      r.salesAmount.toString(),
    ]);
    rows.push([
      periodLabel,
      selectedCompany.name,
      `সর্বমোট (${activeProductRows.length}টি প্রোডাক্ট)`,
      '',
      grandTotals.marketOut.toString(),
      grandTotals.returned.toString(),
      grandTotals.soldQty.toString(),
      grandTotals.salesAmount.toString(),
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
    const suffix =
      periodMode === 'day' ? selectedDate : periodMode === 'month' ? selectedMonth : selectedYear;
    link.download = `${safePrefix}_${periodMode}_sales_${suffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PrintLetterhead
        reportTitle={`${selectedCompany.name} · দিন, মাস ও বছরের সেলস রিপোর্ট`}
        reportDate={periodLabel}
        subtitle={`কোম্পানি: ${selectedCompany.name} · মোট সেলস: ${formatTaka(grandTotals.salesAmount)}`}
      />

      <CompanyScopeBar
        companies={companies}
        selectedCompanyId={selectedCompany.id}
        onSelectCompanyId={onSelectCompanyId}
        summary={oneToOneSummary}
        onOpenWorkspace={onOpenWorkspace}
        onAddCompany={onAddCompany}
        moduleLabel="সেলস রিপোর্ট"
      />

      {/* Header & Period Switcher */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1e293b]">
            Khan Enterprise · {selectedCompany.name} · {periodLabel}
          </p>
          <h1 className="mt-1 text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#0f172a]">
            {selectedCompany.name} — দিন, মাস ও বছরের সেলস হিসাব
          </h1>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2.5">
          {/* Segmented Day / Month / Year / Range Switcher */}
          <div className="inline-flex flex-wrap items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setPeriodMode('day')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                periodMode === 'day'
                  ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                  : 'text-[#1e293b] hover:text-[#0f172a]'
              }`}
            >
              দৈনিক (দিন)
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('month')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                periodMode === 'month'
                  ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                  : 'text-[#1e293b] hover:text-[#0f172a]'
              }`}
            >
              মাসিক (মাস)
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('year')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                periodMode === 'year'
                  ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                  : 'text-[#1e293b] hover:text-[#0f172a]'
              }`}
            >
              বাৎসরিক (বছর)
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('range')}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                periodMode === 'range'
                  ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                  : 'text-[#1e293b] hover:text-[#0f172a]'
              }`}
            >
              তারিখ রেঞ্জ
            </button>
          </div>

          {/* Date Picker for Day */}
          {periodMode === 'day' && (
            <>
              <div className="flex items-center rounded-lg border border-slate-300 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedDate(shiftDateISO(selectedDate, -1))}
                  className="rounded-md p-2 text-[#0f172a] hover:bg-slate-100"
                  aria-label="আগের দিন"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center px-2">
                  <Calendar className="mr-1.5 h-4 w-4 text-[#1e293b]" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDate(e.target.value);
                    }}
                    className="font-mono-tabular bg-transparent text-sm font-semibold text-[#0f172a] focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDate(shiftDateISO(selectedDate, 1))}
                  className="rounded-md p-2 text-[#0f172a] hover:bg-slate-100"
                  aria-label="পরের দিন"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {selectedDate !== today && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(today)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
                >
                  আজ
                </button>
              )}
            </>
          )}

          {/* Month Picker for Month */}
          {periodMode === 'month' && (
            <>
              <div className="flex items-center rounded-lg border border-slate-300 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(shiftMonthISO(selectedMonth, -1))}
                  className="rounded-md p-2 text-[#0f172a] hover:bg-slate-100"
                  aria-label="আগের মাস"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center px-2">
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => {
                      if (e.target.value) setSelectedMonth(e.target.value);
                    }}
                    className="font-mono-tabular bg-transparent text-sm font-semibold text-[#0f172a] focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth(shiftMonthISO(selectedMonth, 1))}
                  className="rounded-md p-2 text-[#0f172a] hover:bg-slate-100"
                  aria-label="পরের মাস"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {selectedMonth !== currentMonth && (
                <button
                  type="button"
                  onClick={() => setSelectedMonth(currentMonth)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
                >
                  চলতি মাস
                </button>
              )}
            </>
          )}

          {/* Year Picker for Year */}
          {periodMode === 'year' && (
            <>
              <div className="flex items-center rounded-lg border border-slate-300 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedYear(String(Number(selectedYear) - 1))}
                  className="rounded-md p-2 text-[#0f172a] hover:bg-slate-100"
                  aria-label="আগের বছর"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="font-mono-tabular px-3 text-sm font-bold text-[#0f172a]">
                  {selectedYear} সাল
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedYear(String(Number(selectedYear) + 1))}
                  className="rounded-md p-2 text-[#0f172a] hover:bg-slate-100"
                  aria-label="পরের বছর"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {selectedYear !== currentYear && (
                <button
                  type="button"
                  onClick={() => setSelectedYear(currentYear)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
                >
                  চলতি বছর
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleExportReportCsv}
            disabled={activeProductRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            CSV
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

      {/* Period Summary Strip */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] sm:grid-cols-2 lg:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-sm font-bold text-[#1e293b]">মোট মার্কেটে গেছে</p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {formatNumber(grandTotals.marketOut)}
          </p>
        </div>
        <div className="px-5 py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-sm font-bold text-[#1e293b]">মোট রিটার্ন</p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-amber-800">
            {formatNumber(grandTotals.returned)}
          </p>
        </div>
        <div className="px-5 py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-sm font-bold text-[#1e293b]">মোট নেট বিক্রি</p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {formatNumber(grandTotals.soldQty)}
          </p>
        </div>
        <div className="bg-teal-50/75 px-5 py-4.5 transition-colors hover:bg-teal-50">
          <p className="text-sm font-bold text-teal-900">মোট সেলস ({periodLabel})</p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-teal-800">
            {formatTaka(grandTotals.salesAmount)}
          </p>
        </div>
      </div>

      {/* Year-over-Year Same-Month Comparison Chart (1-to-1 Company Scoped) */}
      <MonthlyComparisonChart data={data} singleCompanyName={selectedCompany.name} />

      {/* Table 1: Product-by-Product Sales for Selected Company */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
        <div className="space-y-3 border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold text-[#0f172a]">
              {selectedCompany.name} — প্রোডাক্ট অনুযায়ী সেলস — {periodLabel}
            </h2>
            <button
              type="button"
              onClick={() => onSelectCompany(selectedCompany.id)}
              className="no-print inline-flex items-center gap-1 self-start text-sm font-bold text-teal-800 hover:underline sm:self-auto whitespace-nowrap"
            >
              দৈনিক সেলস শিট খুলুন
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <DateRangeFilterBar
            value={dateRange}
            onChange={(next) => {
              setDateRange(next);
              if (periodMode !== 'range') setPeriodMode('range');
            }}
            searchQuery={productSearch}
            onSearchChange={setProductSearch}
            searchPlaceholder="প্রোডাক্টের নাম খুঁজুন..."
          />
        </div>

        {activeProductRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-[15px] font-medium text-[#1e293b]">
            {data.products.length === 0
              ? `${selectedCompany.name}-এ এখনও কোনো প্রোডাক্ট যোগ করা হয়নি।`
              : 'এই সার্চে কোনো প্রোডাক্ট পাওয়া যায়নি।'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">প্রোডাক্টের নাম</th>
                  {periodMode !== 'day' && (
                    <th className="px-3 py-3.5 text-right whitespace-nowrap">সেলসের দিন</th>
                  )}
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">মার্কেটে গেছে</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">রিটার্ন</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">নেট বিক্রি</th>
                  <th className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">মোট সেলস (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {activeProductRows.map((row) => (
                  <tr key={row.productId} className="hover:bg-slate-50/80">
                    <td className="py-3.5 pl-5 pr-3 font-semibold text-[#0f172a]">
                      {row.productName}{' '}
                      <span className="text-xs font-medium text-slate-600">({row.unit})</span>
                    </td>
                    {periodMode !== 'day' && (
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-medium text-[#1e293b] whitespace-nowrap">
                        {row.days > 0 ? `${row.days} দিন` : '—'}
                      </td>
                    )}
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-medium text-[#1e293b] whitespace-nowrap">
                      {formatNumber(row.marketOut)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-amber-800 whitespace-nowrap">
                      {formatNumber(row.returned)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-[#0f172a] whitespace-nowrap">
                      {formatNumber(row.soldQty)}
                    </td>
                    <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right text-[15px] font-bold text-teal-800 whitespace-nowrap">
                      {formatTaka(row.salesAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                  <td
                    className="py-3.5 pl-5 pr-3 whitespace-nowrap"
                    colSpan={periodMode !== 'day' ? 2 : 1}
                  >
                    সর্বমোট ({activeProductRows.length}টি প্রোডাক্ট)
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                    {formatNumber(grandTotals.marketOut)}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right text-amber-800 whitespace-nowrap">
                    {formatNumber(grandTotals.returned)}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                    {formatNumber(grandTotals.soldQty)}
                  </td>
                  <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right text-base font-extrabold text-teal-800 whitespace-nowrap">
                    {formatTaka(grandTotals.salesAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Table 2 (Range Mode): Day-by-Day Breakdown inside Selected Date Range */}
      {periodMode === 'range' && (
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-[#0f172a]">
              তারিখ অনুযায়ী সেলস — {formatDateRangeLabelBn(dateRange)}
            </h2>
            <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
              যেকোনো তারিখে ক্লিক করলে ওই দিনের বিস্তারিত হিসাব দেখতে পারবেন।
            </p>
          </div>
          {rangeDailyBreakdown.length === 0 ? (
            <div className="px-6 py-10 text-center text-[15px] font-medium text-[#1e293b]">
              এই তারিখের রেঞ্জে কোনো সেলস এন্ট্রি নেই।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                    <th className="py-3.5 pl-5 pr-3">তারিখ</th>
                    <th className="px-3 py-3.5 text-right">মার্কেটে গেছে</th>
                    <th className="px-3 py-3.5 text-right">রিটার্ন</th>
                    <th className="px-3 py-3.5 text-right">নেট বিক্রি</th>
                    <th className="py-3.5 pl-3 pr-5 text-right">মোট সেলস (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {rangeDailyBreakdown.map((dayRow) => (
                    <tr
                      key={dayRow.date}
                      onClick={() => {
                        setSelectedDate(dayRow.date);
                        setPeriodMode('day');
                      }}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80"
                    >
                      <td className="py-3.5 pl-5 pr-3 font-semibold text-[#0f172a]">
                        {formatDateBn(dayRow.date, true)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-medium text-[#1e293b]">
                        {formatNumber(dayRow.marketOut)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-amber-800">
                        {formatNumber(dayRow.returned)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-[#0f172a]">
                        {formatNumber(dayRow.soldQty)}
                      </td>
                      <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right text-[15px] font-bold text-teal-800">
                        {formatTaka(dayRow.salesAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Table 2 (Month Mode): Day-by-Day Breakdown inside Selected Month */}
      {periodMode === 'month' && (
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-[#0f172a]">
              তারিখ অনুযায়ী {formatMonthBn(selectedMonth)}-এর সেলস
            </h2>
            <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
              যেকোনো তারিখে ক্লিক করলে ওই দিনের বিস্তারিত হিসাব দেখতে পারবেন।
            </p>
          </div>
          {monthDailyBreakdown.length === 0 ? (
            <div className="px-6 py-10 text-center text-[15px] font-medium text-[#1e293b]">
              এই মাসে কোনো সেলস এন্ট্রি নেই।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                    <th className="py-3.5 pl-5 pr-3">তারিখ</th>
                    <th className="px-3 py-3.5 text-right">মার্কেটে গেছে</th>
                    <th className="px-3 py-3.5 text-right">রিটার্ন</th>
                    <th className="px-3 py-3.5 text-right">নেট বিক্রি</th>
                    <th className="py-3.5 pl-3 pr-5 text-right">মোট সেলস (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {monthDailyBreakdown.map((dayRow) => (
                    <tr
                      key={dayRow.date}
                      onClick={() => {
                        setSelectedDate(dayRow.date);
                        setPeriodMode('day');
                      }}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80"
                    >
                      <td className="py-3.5 pl-5 pr-3 font-semibold text-[#0f172a]">
                        {formatDateBn(dayRow.date, true)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-medium text-[#1e293b]">
                        {formatNumber(dayRow.marketOut)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-amber-800">
                        {formatNumber(dayRow.returned)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-[#0f172a]">
                        {formatNumber(dayRow.soldQty)}
                      </td>
                      <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right text-[15px] font-bold text-teal-800">
                        {formatTaka(dayRow.salesAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Table 2 (Year Mode): Month-by-Month Breakdown (Jan–Dec) inside Selected Year */}
      {periodMode === 'year' && (
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-[#0f172a]">
              মাস অনুযায়ী {selectedYear} সালের সেলস
            </h2>
            <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
              যেকোনো মাসে ক্লিক করলে ওই মাসের দিনভিত্তিক সেলস দেখতে পারবেন।
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">মাস</th>
                  <th className="px-3 py-3.5 text-right">এন্ট্রি দিন</th>
                  <th className="px-3 py-3.5 text-right">মার্কেটে গেছে</th>
                  <th className="px-3 py-3.5 text-right">রিটার্ন</th>
                  <th className="px-3 py-3.5 text-right">নেট বিক্রি</th>
                  <th className="py-3.5 pl-3 pr-5 text-right">মোট সেলস (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {yearMonthlyBreakdown.map((mRow) => (
                  <tr
                    key={mRow.monthISO}
                    onClick={() => {
                      setSelectedMonth(mRow.monthISO);
                      setPeriodMode('month');
                    }}
                    className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${
                      mRow.salesAmount === 0 ? 'text-slate-600' : 'text-[#0f172a]'
                    }`}
                  >
                    <td className="py-3.5 pl-5 pr-3 font-semibold">
                      {formatMonthBn(mRow.monthISO)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-medium">
                      {mRow.activeDays > 0 ? `${mRow.activeDays} দিন` : '—'}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-medium">
                      {formatNumber(mRow.marketOut)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-amber-800">
                      {formatNumber(mRow.returned)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-bold">
                      {formatNumber(mRow.soldQty)}
                    </td>
                    <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right text-[15px] font-bold text-teal-800">
                      {formatTaka(mRow.salesAmount)}
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
