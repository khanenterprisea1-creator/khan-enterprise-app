import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { LedgerData } from '../types/ledger';
import {
  formatMonthBn,
  formatTaka,
  getCurrentMonthISO,
  shiftMonthISO,
} from '../utils/storage';

export type ChartMetric = 'profit_loss' | 'sales' | 'commission' | 'expense';
type ChartBreakdownMode = 'daily' | 'company' | 'yearly_months';

interface MonthlyComparisonChartProps {
  data: LedgerData;
  defaultMetric?: ChartMetric;
  commissionRate?: number;
  singleCompanyName?: string;
}

const SHORT_BN_MONTHS = [
  'জানু',
  'ফেব্রু',
  'মার্চ',
  'এপ্রি',
  'মে',
  'জুন',
  'জুলা',
  'আগ',
  'সেপ্টে',
  'অক্টো',
  'নভে',
  'ডিসে',
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export const MonthlyComparisonChart: React.FC<MonthlyComparisonChartProps> = ({
  data,
  defaultMetric = 'sales',
  commissionRate = 5,
  singleCompanyName,
}) => {
  const currentMonth = getCurrentMonthISO();
  const [targetMonth, setTargetMonth] = useState<string>(currentMonth);
  const [breakdownMode, setBreakdownMode] = useState<ChartBreakdownMode>('daily');
  const [metric, setMetric] = useState<ChartMetric>(defaultMetric);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const effectiveBreakdownMode: ChartBreakdownMode =
    singleCompanyName && breakdownMode === 'company' ? 'daily' : breakdownMode;

  const [targetYearNum, targetMonthNum] = useMemo(() => {
    const [y, m] = targetMonth.split('-').map(Number);
    return [y || 2026, m || 1];
  }, [targetMonth]);

  const prevYearNum = targetYearNum - 1;
  const prevYearMonth = `${prevYearNum}-${String(targetMonthNum).padStart(2, '0')}`;
  const rateFraction = commissionRate / 100;

  const allEntries = useMemo(() => Object.values(data.entries), [data.entries]);
  const allExpenses = useMemo(
    () => data.cashTransactions.filter((tx) => tx.type === 'expense'),
    [data.cashTransactions]
  );

  const pickMetricValue = (sales: number, expense: number, selectedMetric: ChartMetric): number => {
    const commission = sales * rateFraction;
    if (selectedMetric === 'sales') return Number(sales.toFixed(2));
    if (selectedMetric === 'commission') return Number(commission.toFixed(2));
    if (selectedMetric === 'expense') return Number(expense.toFixed(2));
    return Number((commission - expense).toFixed(2));
  };

  // Compute totals for targetMonth and prevYearMonth
  const periodSummary = useMemo(() => {
    const sumForMonth = (ym: string) => {
      let sales = 0;
      let expense = 0;
      for (const e of allEntries) {
        if (e.date.startsWith(ym)) sales += e.totalSalesAmount;
      }
      for (const ex of allExpenses) {
        if (ex.date.startsWith(ym)) expense += ex.amount;
      }
      return pickMetricValue(sales, expense, metric);
    };

    const currVal = sumForMonth(targetMonth);
    const prevVal = sumForMonth(prevYearMonth);
    const diff = Number((currVal - prevVal).toFixed(2));
    const pct =
      Math.abs(prevVal) > 0
        ? Number((((currVal - prevVal) / Math.abs(prevVal)) * 100).toFixed(1))
        : null;

    return { currVal, prevVal, diff, pct };
  }, [allEntries, allExpenses, targetMonth, prevYearMonth, metric, rateFraction]);

  // Build chart data points based on selected breakdown mode
  const chartBars = useMemo(() => {
    if (effectiveBreakdownMode === 'daily') {
      const daysCount = Math.max(
        getDaysInMonth(targetYearNum, targetMonthNum),
        getDaysInMonth(prevYearNum, targetMonthNum)
      );
      const points: { label: string; fullLabel: string; curr: number; prev: number }[] = [];

      for (let day = 1; day <= daysCount; day++) {
        const dd = String(day).padStart(2, '0');
        const currDate = `${targetMonth}-${dd}`;
        const prevDate = `${prevYearMonth}-${dd}`;

        let currSales = 0;
        let prevSales = 0;
        let currExpense = 0;
        let prevExpense = 0;

        for (const e of allEntries) {
          if (e.date === currDate) currSales += e.totalSalesAmount;
          if (e.date === prevDate) prevSales += e.totalSalesAmount;
        }
        for (const ex of allExpenses) {
          if (ex.date === currDate) currExpense += ex.amount;
          if (ex.date === prevDate) prevExpense += ex.amount;
        }

        points.push({
          label: String(day),
          fullLabel: `${day} ${SHORT_BN_MONTHS[targetMonthNum - 1]} (${prevYearNum} বনাম ${targetYearNum})`,
          curr: pickMetricValue(currSales, currExpense, metric),
          prev: pickMetricValue(prevSales, prevExpense, metric),
        });
      }
      return points;
    }

    if (effectiveBreakdownMode === 'company') {
      if (data.companies.length === 0) return [];
      return data.companies.map((comp) => {
        let currSales = 0;
        let prevSales = 0;
        for (const e of allEntries) {
          if (e.companyId !== comp.id) continue;
          if (e.date.startsWith(targetMonth)) currSales += e.totalSalesAmount;
          if (e.date.startsWith(prevYearMonth)) prevSales += e.totalSalesAmount;
        }
        return {
          label: comp.name.length > 14 ? `${comp.name.slice(0, 13)}…` : comp.name,
          fullLabel: comp.name,
          curr: pickMetricValue(currSales, 0, metric),
          prev: pickMetricValue(prevSales, 0, metric),
        };
      });
    }

    // yearly_months: 12 months comparing prevYearNum vs targetYearNum
    return SHORT_BN_MONTHS.map((shortLabel, idx) => {
      const mm = String(idx + 1).padStart(2, '0');
      const currYm = `${targetYearNum}-${mm}`;
      const prevYm = `${prevYearNum}-${mm}`;

      let currSales = 0;
      let prevSales = 0;
      let currExpense = 0;
      let prevExpense = 0;

      for (const e of allEntries) {
        if (e.date.startsWith(currYm)) currSales += e.totalSalesAmount;
        if (e.date.startsWith(prevYm)) prevSales += e.totalSalesAmount;
      }
      for (const ex of allExpenses) {
        if (ex.date.startsWith(currYm)) currExpense += ex.amount;
        if (ex.date.startsWith(prevYm)) prevExpense += ex.amount;
      }

      return {
        label: shortLabel,
        fullLabel: `${shortLabel} (${prevYearNum} বনাম ${targetYearNum})`,
        curr: pickMetricValue(currSales, currExpense, metric),
        prev: pickMetricValue(prevSales, prevExpense, metric),
      };
    });
  }, [
    effectiveBreakdownMode,
    targetYearNum,
    targetMonthNum,
    prevYearNum,
    targetMonth,
    prevYearMonth,
    metric,
    rateFraction,
    allEntries,
    allExpenses,
    data.companies,
  ]);

  // Compute signed bounds so positive (Profit) goes up and negative (Loss) goes down cleanly
  const { maxPos, minNeg, totalSpan } = useMemo(() => {
    let hi = 0;
    let lo = 0;
    for (const pt of chartBars) {
      if (pt.curr > hi) hi = pt.curr;
      if (pt.prev > hi) hi = pt.prev;
      if (pt.curr < lo) lo = pt.curr;
      if (pt.prev < lo) lo = pt.prev;
    }
    if (hi === 0 && lo === 0) {
      hi = 1000;
    }
    const span = hi - lo || 1000;
    return { maxPos: hi, minNeg: lo, totalSpan: span };
  }, [chartBars]);

  // SVG Layout dimensions
  const svgWidth = 860;
  const svgHeight = 260;
  const padLeft = 68;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 34;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;
  const zeroY = padTop + (maxPos / totalSpan) * plotHeight;

  const yTicks = useMemo(() => {
    if (minNeg < 0 && maxPos > 0) {
      return [maxPos, maxPos / 2, 0, minNeg / 2, minNeg];
    }
    if (minNeg < 0) {
      return [0, minNeg * 0.25, minNeg * 0.5, minNeg * 0.75, minNeg];
    }
    return [maxPos, maxPos * 0.75, maxPos * 0.5, maxPos * 0.25, 0];
  }, [maxPos, minNeg]);

  const activeHoverPoint =
    hoveredIdx !== null && chartBars[hoveredIdx] ? chartBars[hoveredIdx] : null;

  const metricLabel =
    metric === 'profit_loss'
      ? `নিট লাভ / লস (${commissionRate}% − খরচ)`
      : metric === 'sales'
        ? 'মোট সেলস'
        : metric === 'commission'
          ? `${commissionRate}% কমিশন আয়`
          : 'মোট খরচ';

  const formatSignedValue = (val: number) => {
    if (metric !== 'profit_loss') return formatTaka(val);
    if (val > 0) return `লাভ +${formatTaka(val)}`;
    if (val < 0) return `লস −${formatTaka(Math.abs(val))}`;
    return '৳ 0';
  };

  const formatTick = (val: number) => {
    const abs = Math.abs(val);
    const prefix = val < 0 ? '-' : '';
    if (abs >= 1000) {
      return `${prefix}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    }
    return `${prefix}${Math.round(abs)}`;
  };

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] print-avoid-break">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0f2942]/10 text-[#0f2942]">
            <BarChart3 className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0f172a]">
              {metric === 'profit_loss'
                ? 'লাভ-লস তুলনামূলক চার্ট (গত বছরের একই মাস বনাম এই মাস)'
                : 'গত বছরের একই মাস বনাম এই মাসের তুলনা (চার্ট)'}
            </h2>
            <p className="text-sm font-medium text-[#1e293b]">
              {singleCompanyName ? `${singleCompanyName} · ` : ''}
              {formatMonthBn(prevYearMonth)} বনাম {formatMonthBn(targetMonth)} · {metricLabel}
            </p>
          </div>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          {/* Month Switcher */}
          <div className="flex items-center rounded-lg border border-slate-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setTargetMonth(shiftMonthISO(targetMonth, -1))}
              className="rounded-md p-1.5 text-[#0f172a] transition-colors hover:bg-slate-100"
              aria-label="আগের মাস"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="month"
              value={targetMonth}
              onChange={(e) => {
                if (e.target.value) setTargetMonth(e.target.value);
              }}
              aria-label="মাস নির্বাচন"
              className="font-mono-tabular bg-transparent px-1.5 text-sm font-semibold text-[#0f172a] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setTargetMonth(shiftMonthISO(targetMonth, 1))}
              className="rounded-md p-1.5 text-[#0f172a] transition-colors hover:bg-slate-100"
              aria-label="পরের মাস"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Metric Selector */}
          <select
            value={metric}
            onChange={(e) => {
              const nextMetric = e.target.value as ChartMetric;
              setMetric(nextMetric);
              if (
                (nextMetric === 'profit_loss' || nextMetric === 'expense') &&
                effectiveBreakdownMode === 'company'
              ) {
                setBreakdownMode('daily');
              }
            }}
            aria-label="তুলনার বিষয়"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none"
          >
            <option value="profit_loss">লাভ ও লস ({commissionRate}% − খরচ)</option>
            <option value="sales">
              {singleCompanyName ? `${singleCompanyName}-এর সেলস` : 'সকল কোম্পানির সেলস'}
            </option>
            <option value="commission">{commissionRate}% কমিশন আয়</option>
            <option value="expense">দৈনিক খরচ</option>
          </select>

          {/* Breakdown Mode Tabs */}
          <div className="inline-flex max-w-full overflow-x-auto no-scrollbar items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setBreakdownMode('daily')}
              className={`min-h-[38px] sm:min-h-0 rounded-md px-3 py-1 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                effectiveBreakdownMode === 'daily'
                  ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                  : 'text-[#1e293b] hover:text-[#0f172a]'
              }`}
            >
              দিন অনুযায়ী
            </button>
            {!singleCompanyName && (
              <button
                type="button"
                onClick={() => setBreakdownMode('company')}
                disabled={metric === 'expense' || metric === 'profit_loss'}
                className={`min-h-[38px] sm:min-h-0 rounded-md px-3 py-1 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
                  effectiveBreakdownMode === 'company'
                    ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                    : 'text-[#1e293b] hover:text-[#0f172a]'
                }`}
              >
                কোম্পানি অনুযায়ী
              </button>
            )}
            <button
              type="button"
              onClick={() => setBreakdownMode('yearly_months')}
              className={`min-h-[38px] sm:min-h-0 rounded-md px-3 py-1 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                effectiveBreakdownMode === 'yearly_months'
                  ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                  : 'text-[#1e293b] hover:text-[#0f172a]'
              }`}
            >
              ১২ মাস তুলনা
            </button>
          </div>
        </div>
      </div>

      {/* Comparison Metrics Strip */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 border-b border-slate-200 bg-slate-50/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4 transition-colors hover:bg-white">
          <div className="flex items-center gap-2 text-sm font-bold text-[#1e293b]">
            <span className="inline-block h-3 w-3 rounded-xs bg-slate-500" />
            <span>গত বছর ({formatMonthBn(prevYearMonth)})</span>
          </div>
          <p
            className={`font-mono-tabular mt-1 text-xl font-extrabold ${
              periodSummary.prevVal < 0 ? 'text-rose-700' : 'text-[#0f2942]'
            }`}
          >
            {formatSignedValue(periodSummary.prevVal)}
          </p>
        </div>

        <div className="bg-teal-50/70 px-5 py-4 transition-colors hover:bg-teal-50">
          <div className="flex items-center gap-2 text-sm font-bold text-teal-900">
            <span className="inline-block h-3 w-3 rounded-xs bg-teal-700" />
            <span>নির্বাচিত মাস ({formatMonthBn(targetMonth)})</span>
          </div>
          <p
            className={`font-mono-tabular mt-1 text-xl font-extrabold ${
              periodSummary.currVal < 0 ? 'text-rose-700' : 'text-teal-800'
            }`}
          >
            {formatSignedValue(periodSummary.currVal)}
          </p>
        </div>

        <div
          className={`px-5 py-4 transition-colors ${
            periodSummary.diff > 0
              ? 'bg-emerald-50/75 hover:bg-emerald-50'
              : periodSummary.diff < 0
                ? 'bg-rose-50/75 hover:bg-rose-50'
                : 'hover:bg-white'
          }`}
        >
          <p className="text-sm font-bold text-[#0f172a]">
            তুলনামূলক পরিবর্তন ({prevYearNum} → {targetYearNum})
          </p>
          <p
            className={`font-mono-tabular mt-1 text-xl font-extrabold ${
              periodSummary.diff > 0
                ? 'text-emerald-700'
                : periodSummary.diff < 0
                  ? 'text-rose-700'
                  : 'text-[#0f172a]'
            }`}
          >
            {periodSummary.diff > 0
              ? `+${formatTaka(periodSummary.diff)} · বৃদ্ধি`
              : periodSummary.diff < 0
                ? `−${formatTaka(Math.abs(periodSummary.diff))} · হ্রাস`
                : '৳ 0 · সমান'}
            {periodSummary.pct !== null && (
              <span className="ml-1.5 text-sm font-bold">
                ({periodSummary.pct > 0 ? `+${periodSummary.pct}%` : `${periodSummary.pct}%`})
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Interactive SVG Grouped Bar Chart */}
      <div className="px-4 py-4 sm:px-5">
        <div className="mb-3 flex min-h-[28px] flex-wrap items-center justify-between gap-2 text-sm text-[#0f172a]">
          {activeHoverPoint ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-100 px-3 py-1 font-semibold ring-1 ring-slate-300/80">
              <span className="text-[#0f2942] font-bold">{activeHoverPoint.fullLabel}</span>
              <span aria-hidden="true" className="text-slate-400">
                |
              </span>
              <span
                className={`font-mono-tabular ${
                  activeHoverPoint.prev < 0 ? 'text-rose-700' : 'text-[#1e293b]'
                }`}
              >
                {prevYearNum}: {formatSignedValue(activeHoverPoint.prev)}
              </span>
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span
                className={`font-mono-tabular font-bold ${
                  activeHoverPoint.curr < 0 ? 'text-rose-700' : 'text-teal-800'
                }`}
              >
                {targetYearNum}: {formatSignedValue(activeHoverPoint.curr)}
              </span>
            </div>
          ) : (
            <span className="text-xs sm:text-sm font-medium text-[#1e293b] no-print">
              যেকোনো বারে ট্যাপ বা মাউস রাখলে {prevYearNum} বনাম {targetYearNum}-এর বিস্তারিত দেখাবে
            </span>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-semibold text-[#1e293b]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-xs bg-slate-500" />
              {prevYearNum} সাল
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-xs bg-teal-700" />
              {targetYearNum} সাল (লাভ/আয়)
            </span>
            {metric === 'profit_loss' && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-xs bg-rose-600" />
                লস (নিচে)
              </span>
            )}
          </div>
        </div>

        {chartBars.length === 0 ? (
          <div className="py-12 text-center text-[15px] font-medium text-[#1e293b]">
            চার্টে দেখানোর জন্য কোনো কোম্পানি বা ডাটা নেই।
          </div>
        ) : (
          <div className="relative w-full overflow-x-auto no-scrollbar">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="h-auto w-full min-w-[540px] print:min-w-0"
              role="img"
              aria-label="গত বছরের একই মাস বনাম এই মাসের লাভ-লস তুলনা চার্ট"
            >
              <defs>
                <linearGradient id="khanBarTeal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f766e" />
                  <stop offset="100%" stopColor="#14b8a6" />
                </linearGradient>
                <linearGradient id="khanBarTealHover" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f2942" />
                  <stop offset="100%" stopColor="#0f766e" />
                </linearGradient>
                <linearGradient id="khanBarSlate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" />
                  <stop offset="100%" stopColor="#cbd5e1" />
                </linearGradient>
                <linearGradient id="khanBarRose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb7185" />
                  <stop offset="100%" stopColor="#e11d48" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines & Y-Axis Ticks */}
              {yTicks.map((tickVal, tIdx) => {
                const y = padTop + ((maxPos - tickVal) / totalSpan) * plotHeight;
                const isZero = Math.abs(tickVal) < 0.01;
                return (
                  <g key={`${tickVal}_${tIdx}`}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={svgWidth - padRight}
                      y2={y}
                      stroke={isZero ? '#94A3B8' : '#E2E8F0'}
                      strokeDasharray={isZero ? undefined : '3 3'}
                      strokeWidth={isZero ? 1.25 : 1}
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      className={`text-[11px] font-semibold ${
                        isZero ? 'fill-[#0f172a] font-bold' : 'fill-[#1e293b]'
                      }`}
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                      {formatTick(tickVal)}
                    </text>
                  </g>
                );
              })}

              {/* Grouped Bars */}
              {chartBars.map((pt, idx) => {
                const groupWidth = plotWidth / chartBars.length;
                const groupX = padLeft + idx * groupWidth;
                const innerPad = Math.max(2, groupWidth * 0.16);
                const usableWidth = Math.max(4, groupWidth - innerPad * 2);
                const barWidth = Math.min(24, Math.max(3, (usableWidth - 2) / 2));
                const centerOffset = (groupWidth - (barWidth * 2 + 2)) / 2;

                const prevX = groupX + centerOffset;
                const currX = prevX + barWidth + 2;

                const prevBarH = (Math.abs(pt.prev) / totalSpan) * plotHeight;
                const currBarH = (Math.abs(pt.curr) / totalSpan) * plotHeight;

                const prevBarY = pt.prev >= 0 ? zeroY - prevBarH : zeroY;
                const currBarY = pt.curr >= 0 ? zeroY - currBarH : zeroY;

                const isHovered = hoveredIdx === idx;
                const showLabel =
                  effectiveBreakdownMode !== 'daily' ||
                  idx === 0 ||
                  idx === chartBars.length - 1 ||
                  (idx + 1) % 2 === 1;

                const prevFill =
                  pt.prev < 0
                    ? isHovered
                      ? '#FB7185'
                      : '#FDA4AF'
                    : isHovered
                      ? '#475569'
                      : 'url(#khanBarSlate)';

                const currFill =
                  pt.curr < 0
                    ? isHovered
                      ? '#BE123C'
                      : 'url(#khanBarRose)'
                    : isHovered
                      ? 'url(#khanBarTealHover)'
                      : 'url(#khanBarTeal)';

                return (
                  <g
                    key={pt.label + idx}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => setHoveredIdx(hoveredIdx === idx ? null : idx)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={groupX}
                      y={padTop}
                      width={groupWidth}
                      height={plotHeight + padBottom}
                      rx={4}
                      fill={isHovered ? 'rgba(15, 118, 110, 0.08)' : 'transparent'}
                    />

                    {/* Last Year Bar */}
                    <rect
                      x={prevX}
                      y={prevBarH > 0 ? prevBarY : zeroY - 1}
                      width={barWidth}
                      height={prevBarH > 0 ? prevBarH : 1}
                      rx={2.5}
                      fill={prevFill}
                    />

                    {/* This Year Bar */}
                    <rect
                      x={currX}
                      y={currBarH > 0 ? currBarY : zeroY - 1}
                      width={barWidth}
                      height={currBarH > 0 ? currBarH : 1}
                      rx={2.5}
                      fill={currFill}
                    />

                    {/* X-Axis Label */}
                    {showLabel && (
                      <text
                        x={groupX + groupWidth / 2}
                        y={svgHeight - 10}
                        textAnchor="middle"
                        className={`text-[11px] font-semibold ${
                          isHovered ? 'fill-[#0f2942] font-bold' : 'fill-[#1e293b]'
                        }`}
                        style={{ fontFamily: 'JetBrains Mono, Hind Siliguri, sans-serif' }}
                      >
                        {pt.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Floating Tooltip Overlay inside SVG on Hover */}
              {hoveredIdx !== null &&
                chartBars[hoveredIdx] &&
                (() => {
                  const pt = chartBars[hoveredIdx];
                  const groupWidth = plotWidth / chartBars.length;
                  const anchorX = padLeft + (hoveredIdx + 0.5) * groupWidth;
                  const tipW = 210;
                  const tipH = 56;
                  const tipX = Math.min(
                    svgWidth - padRight - tipW,
                    Math.max(padLeft, anchorX - tipW / 2)
                  );
                  const tipY = padTop + 2;

                  return (
                    <g pointerEvents="none">
                      <rect
                        x={tipX}
                        y={tipY}
                        width={tipW}
                        height={tipH}
                        rx={8}
                        fill="#0f2942"
                        fillOpacity={0.96}
                      />
                      <text
                        x={tipX + 10}
                        y={tipY + 18}
                        fill="#ffffff"
                        className="text-xs font-bold"
                        style={{ fontFamily: 'Hind Siliguri, sans-serif' }}
                      >
                        {pt.fullLabel}
                      </text>
                      <text
                        x={tipX + 10}
                        y={tipY + 34}
                        fill="#e2e8f0"
                        className="text-[11px] font-medium"
                        style={{ fontFamily: 'JetBrains Mono, Hind Siliguri, sans-serif' }}
                      >
                        {prevYearNum}: {formatSignedValue(pt.prev)}
                      </text>
                      <text
                        x={tipX + 10}
                        y={tipY + 48}
                        fill="#5eead4"
                        className="text-[11px] font-bold"
                        style={{ fontFamily: 'JetBrains Mono, Hind Siliguri, sans-serif' }}
                      >
                        {targetYearNum}: {formatSignedValue(pt.curr)}
                      </text>
                    </g>
                  );
                })()}
            </svg>
          </div>
        )}
      </div>
    </section>
  );
};
