import React from 'react';
import { Calendar, Search, X } from 'lucide-react';
import { formatDateBn, getTodayISO, shiftDateISO } from '../utils/storage';

export type DateRangePreset =
  | 'all'
  | 'today'
  | 'last_7'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface DateRangeValue {
  preset: DateRangePreset;
  fromDate: string;
  toDate: string;
}

export function createDateRangePreset(
  preset: DateRangePreset,
  referenceToday: string = getTodayISO()
): DateRangeValue {
  if (preset === 'all') {
    return { preset: 'all', fromDate: '', toDate: '' };
  }
  if (preset === 'today') {
    return { preset: 'today', fromDate: referenceToday, toDate: referenceToday };
  }
  if (preset === 'last_7') {
    return {
      preset: 'last_7',
      fromDate: shiftDateISO(referenceToday, -6),
      toDate: referenceToday,
    };
  }
  if (preset === 'this_month') {
    return {
      preset: 'this_month',
      fromDate: `${referenceToday.slice(0, 7)}-01`,
      toDate: referenceToday,
    };
  }
  if (preset === 'last_month') {
    const [yStr, mStr] = referenceToday.split('-');
    let year = Number(yStr);
    let month = Number(mStr) - 1;
    if (month <= 0) {
      month = 12;
      year -= 1;
    }
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    return {
      preset: 'last_month',
      fromDate: `${year}-${mm}-01`,
      toDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  return { preset: 'custom', fromDate: '', toDate: referenceToday };
}

export function isDateInRange(dateISO: string, range: DateRangeValue): boolean {
  if (range.fromDate && dateISO < range.fromDate) return false;
  if (range.toDate && dateISO > range.toDate) return false;
  return true;
}

export function formatDateRangeLabelBn(range: DateRangeValue): string {
  if (range.preset === 'all' && !range.fromDate && !range.toDate) {
    return 'সব সময়';
  }
  if (range.fromDate && range.toDate && range.fromDate === range.toDate) {
    return formatDateBn(range.fromDate, true);
  }
  if (range.fromDate && range.toDate) {
    return `${formatDateBn(range.fromDate)} — ${formatDateBn(range.toDate)}`;
  }
  if (range.fromDate) {
    return `${formatDateBn(range.fromDate)} থেকে আজ পর্যন্ত`;
  }
  if (range.toDate) {
    return `${formatDateBn(range.toDate)} পর্যন্ত`;
  }
  return 'সব সময়';
}

interface DateRangeFilterBarProps {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  allowAll?: boolean;
  /** When true, the date presets / from-to pickers are hidden and the range
      stays locked to the single day in `value` (S.R. stock view). */
  dateControlsHidden?: boolean;
  extraControls?: React.ReactNode;
  className?: string;
}

const PRESET_OPTIONS: { key: DateRangePreset; label: string }[] = [
  { key: 'all', label: 'সব সময়' },
  { key: 'today', label: 'আজ' },
  { key: 'last_7', label: 'গত ৭ দিন' },
  { key: 'this_month', label: 'এই মাস' },
  { key: 'last_month', label: 'গত মাস' },
];

export const DateRangeFilterBar: React.FC<DateRangeFilterBarProps> = ({
  value,
  onChange,
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'খুঁজুন...',
  allowAll = true,
  dateControlsHidden = false,
  extraControls,
  className = '',
}) => {
  const today = getTodayISO();
  const visiblePresets = allowAll
    ? PRESET_OPTIONS
    : PRESET_OPTIONS.filter((opt) => opt.key !== 'all');

  const isFiltered =
    value.preset !== (allowAll ? 'all' : 'today') || Boolean(searchQuery?.trim());

  return (
    <div
      className={`no-print flex flex-col gap-2.5 rounded-xl border border-slate-300/80 bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between ${className}`}
    >
      {/* Left: Quick Date Presets + From/To Date Pickers */}
      <div className="flex flex-wrap items-center gap-2">
        {dateControlsHidden ? (
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#0f172a]">
            <Calendar className="h-4 w-4 shrink-0 text-teal-700" />
            {formatDateBn(value.fromDate || value.toDate, true)} · শুধু এই দিনের
            স্টক
          </div>
        ) : (
          <>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
              {visiblePresets.map((opt) => {
                const active = value.preset === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onChange(createDateRangePreset(opt.key, today))}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#0f2942] text-white shadow-xs'
                        : 'text-[#0f172a] hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Custom From / To Date Pickers */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5">
              <Calendar className="h-4 w-4 shrink-0 text-[#0f172a]" />
              <input
                type="date"
                value={value.fromDate}
                onChange={(e) =>
                  onChange({
                    preset: 'custom',
                    fromDate: e.target.value,
                    toDate: value.toDate,
                  })
                }
                aria-label="শুরুর তারিখ"
                className="font-mono-tabular bg-transparent text-sm font-semibold text-[#0f172a] focus:outline-none"
              />
              <span className="text-sm font-semibold text-[#1e293b]">থেকে</span>
              <input
                type="date"
                value={value.toDate}
                onChange={(e) =>
                  onChange({
                    preset: 'custom',
                    fromDate: value.fromDate,
                    toDate: e.target.value,
                  })
                }
                aria-label="শেষ তারিখ"
                className="font-mono-tabular bg-transparent text-sm font-semibold text-[#0f172a] focus:outline-none"
              />
            </div>
          </>
        )}
      </div>

      {/* Right: Search & Extra Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {onSearchChange !== undefined && (
          <div className="relative min-w-0 w-full sm:min-w-[200px] sm:w-auto sm:flex-initial">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={searchQuery ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full min-h-[42px] sm:min-h-0 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-base sm:text-sm font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-600 hover:text-[#0f172a]"
                aria-label="সার্চ মুছুন"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {extraControls}

        {isFiltered && !dateControlsHidden && (
          <button
            type="button"
            onClick={() => {
              onChange(createDateRangePreset(allowAll ? 'all' : 'today', today));
              onSearchChange?.('');
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-slate-100 whitespace-nowrap"
          >
            <X className="h-4 w-4" />
            ফিল্টার রিসেট
          </button>
        )}
      </div>
    </div>
  );
};
