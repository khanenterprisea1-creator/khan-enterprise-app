import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, BarChart3, Minus } from 'lucide-react';
import { LedgerData } from '../types/ledger';
import { formatDateBn, formatTaka, getTodayISO, shiftDateISO } from '../utils/storage';

interface Last7DaysSalesChartProps {
  data: LedgerData;
  commissionRate: number;
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

const SHORT_BN_WEEKDAYS = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];

interface SevenDayPoint {
  date: string;
  shortLabel: string;
  weekdayShort: string;
  fullDate: string;
  sales: number;
  commission: number;
  expense: number;
  net: number;
  isToday: boolean;
}

function formatShortDateLabel(dateISO: string): { shortLabel: string; weekdayShort: string } {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (!y || !m || !d) return { shortLabel: dateISO, weekdayShort: '' };
  const dt = new Date(y, m - 1, d);
  const monthShort = SHORT_BN_MONTHS[m - 1] ?? String(m);
  const weekdayShort = SHORT_BN_WEEKDAYS[dt.getDay()] ?? '';
  return {
    shortLabel: `${d} ${monthShort}`,
    weekdayShort,
  };
}

function formatAxisTaka(val: number): string {
  if (val >= 100000) {
    return `৳${(val / 1000).toFixed(0)}k`;
  }
  if (val >= 1000) {
    return `৳${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k`;
  }
  return `৳${Math.round(val)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SevenDayPoint }>;
  commissionRate: number;
}

const CustomSevenDayTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  commissionRate,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;

  return (
    <div className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-[0_12px_30px_-8px_rgba(15,41,66,0.22)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-1.5">
        <p className="font-extrabold text-[#0f172a]">{pt.fullDate}</p>
        {pt.isToday && (
          <span className="rounded bg-[#1E3A8A] px-1.5 py-0.5 text-[11px] font-bold text-white">
            আজ
          </span>
        )}
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="font-semibold text-[#1e293b]">মোট সেলস:</span>
          <span className="font-mono-tabular font-extrabold text-[#1E3A8A]">
            {formatTaka(pt.sales)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="font-semibold text-[#1e293b]">কমিশন ({commissionRate}%):</span>
          <span className="font-mono-tabular font-bold text-teal-800">
            {formatTaka(pt.commission)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="font-semibold text-[#1e293b]">দৈনিক খরচ:</span>
          <span className="font-mono-tabular font-bold text-rose-700">
            {formatTaka(pt.expense)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-slate-100 pt-1">
          <span className="font-bold text-[#0f172a]">নিট লাভ / লস:</span>
          <span
            className={`font-mono-tabular font-extrabold ${
              pt.net > 0
                ? 'text-emerald-700'
                : pt.net < 0
                  ? 'text-rose-700'
                  : 'text-[#0f172a]'
            }`}
          >
            {pt.net > 0
              ? `+${formatTaka(pt.net)}`
              : pt.net < 0
                ? `−${formatTaka(Math.abs(pt.net))}`
                : '৳ 0'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const Last7DaysSalesChart: React.FC<Last7DaysSalesChartProps> = ({
  data,
  commissionRate,
}) => {
  const today = getTodayISO();
  const startDate = shiftDateISO(today, -6);

  const { points, totalSales, avgSales, bestDay, trendPct } = useMemo(() => {
    const salesByDate = new Map<string, number>();
    for (const entry of Object.values(data.entries)) {
      salesByDate.set(entry.date, (salesByDate.get(entry.date) ?? 0) + entry.totalSalesAmount);
    }

    const expenseByDate = new Map<string, number>();
    for (const tx of data.cashTransactions) {
      if (tx.type === 'expense') {
        expenseByDate.set(tx.date, (expenseByDate.get(tx.date) ?? 0) + tx.amount);
      }
    }

    const rateFraction = commissionRate / 100;
    const list: SevenDayPoint[] = [];

    for (let offset = -6; offset <= 0; offset++) {
      const date = shiftDateISO(today, offset);
      const sales = Number((salesByDate.get(date) ?? 0).toFixed(2));
      const commission = Number((sales * rateFraction).toFixed(2));
      const expense = Number((expenseByDate.get(date) ?? 0).toFixed(2));
      const net = Number((commission - expense).toFixed(2));
      const { shortLabel, weekdayShort } = formatShortDateLabel(date);

      list.push({
        date,
        shortLabel: offset === 0 ? `${shortLabel} (আজ)` : shortLabel,
        weekdayShort,
        fullDate: formatDateBn(date, true),
        sales,
        commission,
        expense,
        net,
        isToday: offset === 0,
      });
    }

    const sum = Number(list.reduce((acc, p) => acc + p.sales, 0).toFixed(2));
    const avg = Number((sum / 7).toFixed(2));

    let peak: SevenDayPoint | null = null;
    for (const pt of list) {
      if (pt.sales > 0 && (!peak || pt.sales > peak.sales)) {
        peak = pt;
      }
    }

    // Compare recent 3 days average vs earlier 4 days average
    const prev4Avg =
      list.slice(0, 4).reduce((acc, p) => acc + p.sales, 0) / 4;
    const recent3Avg =
      list.slice(4).reduce((acc, p) => acc + p.sales, 0) / 3;
    const pct =
      prev4Avg > 0
        ? Number((((recent3Avg - prev4Avg) / prev4Avg) * 100).toFixed(1))
        : null;

    return {
      points: list,
      totalSales: sum,
      avgSales: avg,
      bestDay: peak,
      trendPct: pct,
    };
  }, [data.entries, data.cashTransactions, commissionRate, today]);

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] print-avoid-break">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1E3A8A]/10 text-[#1E3A8A]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-[#0f172a]">
              গত ৭ দিনের সেলস পারফরম্যান্স (বার চার্ট)
            </h2>
            <p className="text-sm font-medium text-[#1e293b]">
              {formatDateBn(startDate)} থেকে {formatDateBn(today)} পর্যন্ত প্রতিদিনের বিক্রির ধারা এক নজরে
            </p>
          </div>
        </div>

        {/* Legend & Trend Pill */}
        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-bold text-[#0f172a]">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs bg-teal-700" />
            আগের দিনগুলো
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-xs bg-[#1E3A8A]" />
            আজকের সেলস
          </span>
          {avgSales > 0 && (
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <span className="inline-block w-4 border-t-2 border-dashed border-amber-600" />
              গড় লাইন
            </span>
          )}
        </div>
      </div>

      {/* 3-Column 7-Day Summary Strip */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 border-b border-slate-200 bg-slate-50/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-3.5">
          <p className="text-xs sm:text-sm font-bold text-[#1e293b]">গত ৭ দিনের মোট সেলস</p>
          <p className="font-mono-tabular mt-1 text-xl font-extrabold text-[#1E3A8A]">
            {formatTaka(totalSales)}
          </p>
        </div>

        <div className="px-5 py-3.5">
          <p className="text-xs sm:text-sm font-bold text-[#1e293b]">দৈনিক গড় সেলস</p>
          <p className="font-mono-tabular mt-1 text-xl font-extrabold text-teal-800">
            {formatTaka(avgSales)}
          </p>
        </div>

        <div className="px-5 py-3.5">
          <p className="text-xs sm:text-sm font-bold text-[#1e293b]">সর্বোচ্চ সেলস ও ট্রেন্ড</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {bestDay ? (
              <span className="font-mono-tabular text-base sm:text-lg font-extrabold text-[#0f172a]">
                {bestDay.shortLabel}: {formatTaka(bestDay.sales)}
              </span>
            ) : (
              <span className="text-base font-bold text-slate-600">—</span>
            )}
            {trendPct !== null && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-extrabold ${
                  trendPct > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : trendPct < 0
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-slate-200 text-[#0f172a]'
                }`}
              >
                {trendPct > 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : trendPct < 0 ? (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                ) : (
                  <Minus className="h-3.5 w-3.5" />
                )}
                {trendPct > 0 ? `+${trendPct}%` : `${trendPct}%`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Recharts BarChart */}
      <div className="px-3 py-5 sm:px-5">
        {totalSales === 0 && (
          <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-sm font-semibold text-[#1e293b]">
            গত ৭ দিনে এখনও কোনো সেলস এন্ট্রি করা হয়নি। কোম্পানির সেলস শিটে এন্ট্রি করলে এখানে ৭ দিনের গ্রাফ দেখাবে।
          </p>
        )}

        <div className="h-[250px] sm:h-[290px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={points}
              margin={{ top: 14, right: 10, left: 0, bottom: 8 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="shortLabel"
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                interval={0}
                tick={{ fill: '#0f172a', fontSize: 11, fontWeight: 600 }}
                dy={6}
              />
              <YAxis
                tickFormatter={formatAxisTaka}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{
                  fill: '#1e293b',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(30, 58, 138, 0.06)' }}
                content={<CustomSevenDayTooltip commissionRate={commissionRate} />}
              />
              {avgSales > 0 && (
                <ReferenceLine
                  y={avgSales}
                  stroke="#d97706"
                  strokeDasharray="5 5"
                  strokeWidth={1.75}
                />
              )}
              <Bar dataKey="sales" name="মোট সেলস" radius={[8, 8, 0, 0]} maxBarSize={52}>
                {points.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={entry.isToday ? '#1E3A8A' : '#0f766e'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
};
