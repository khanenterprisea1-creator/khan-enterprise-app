import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  Plus,
  Trash2,
  Wallet,
  History,
  Check,
  Search,
  X,
} from 'lucide-react';
import { CashTransaction, CashTransactionType, Company } from '../types/ledger';
import {
  downloadCashLedgerCsv,
  formatDateBn,
  formatMonthBn,
  formatTaka,
  getCurrentMonthISO,
  getCurrentYear,
  getTodayISO,
  shiftDateISO,
} from '../utils/storage';
import { Company1to1Summary } from '../utils/companySummary';
import { CompanyScopeBar } from './CompanyScopeBar';
import { PrintLetterhead, PrintSignatureFooter } from './PrintLetterhead';
import {
  createDateRangePreset,
  DateRangeFilterBar,
  DateRangeValue,
  formatDateRangeLabelBn,
  isDateInRange,
} from './DateRangeFilterBar';

interface CashExpensePageProps {
  transactions: CashTransaction[];
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompanyId: (companyId: string) => void;
  oneToOneSummary?: Company1to1Summary | null;
  orphanCashCount?: number;
  onAssignOrphansToCompany?: (companyId: string) => void;
  onOpenWorkspace?: (companyId: string) => void;
  onAddCompany?: () => void;
  onAddTransaction: (tx: Omit<CashTransaction, 'id' | 'createdAt'>) => void;
  onDeleteTransaction: (txId: string) => void;
}

type HistoryPeriod = 'day' | 'month' | 'year';

const PRESET_TITLES: Record<CashTransactionType, string[]> = {
  cash_in: ['মার্কেট কালেকশন', 'নগদ সেলস জমা', 'বাকি আদায়', 'পূর্বের ক্যাশ জমা'],
  expense: ['গাড়ি ও তেল খরচ', 'ডেলিভারি লেবার', 'নাস্তা / আপ্যায়ন', 'দোকান ভাড়া / বিল', 'বেতন / হাজিরা'],
  withdraw: ['মালিকের উত্তোলন', 'ব্যাংক জমা', 'কোম্পানি পেমেন্ট', 'ব্যক্তিগত উত্তোলন'],
};

export const CashExpensePage: React.FC<CashExpensePageProps> = ({
  transactions,
  companies,
  selectedCompanyId,
  onSelectCompanyId,
  oneToOneSummary,
  orphanCashCount = 0,
  onAssignOrphansToCompany,
  onOpenWorkspace,
  onAddCompany,
  onAddTransaction,
  onDeleteTransaction,
}) => {
  const selectedCompany =
    companies.find((c) => c.id === selectedCompanyId) ?? companies[0] ?? null;
  const today = getTodayISO();
  const currentMonth = getCurrentMonthISO();
  const currentYear = getCurrentYear();

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [txType, setTxType] = useState<CashTransactionType>('expense');
  const [title, setTitle] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('day');
  const [typeFilter, setTypeFilter] = useState<'all' | CashTransactionType>('all');
  const [daySearch, setDaySearch] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(() =>
    createDateRangePreset('all', today)
  );
  const [historySearch, setHistorySearch] = useState<string>('');

  // Overall cumulative balance across all dates: Total Cash In - Total Expense - Total Withdraw
  const overallTotals = useMemo(() => {
    let cashIn = 0;
    let expense = 0;
    let withdraw = 0;
    for (const tx of transactions) {
      if (tx.type === 'cash_in') cashIn += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
      else withdraw += tx.amount;
    }
    const remainingCash = Number((cashIn - expense - withdraw).toFixed(2));
    return { cashIn, expense, withdraw, remainingCash };
  }, [transactions]);

  // Selected Date transactions and totals
  const dayTransactions = useMemo(() => {
    const q = daySearch.trim().toLowerCase();
    return transactions
      .filter((tx) => tx.date === selectedDate)
      .filter((tx) => (typeFilter === 'all' ? true : tx.type === typeFilter))
      .filter((tx) => {
        if (!q) return true;
        const hay = `${tx.title} ${tx.note ?? ''} ${tx.amount}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [transactions, selectedDate, typeFilter, daySearch]);

  const dayTotals = useMemo(() => {
    let cashIn = 0;
    let expense = 0;
    let withdraw = 0;
    for (const tx of transactions) {
      if (tx.date !== selectedDate) continue;
      if (tx.type === 'cash_in') cashIn += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
      else withdraw += tx.amount;
    }
    const netDay = Number((cashIn - expense - withdraw).toFixed(2));
    return { cashIn, expense, withdraw, netDay };
  }, [transactions, selectedDate]);

  // Running balance up to and including selectedDate
  const balanceUpToSelectedDate = useMemo(() => {
    let bal = 0;
    for (const tx of transactions) {
      if (tx.date > selectedDate) continue;
      if (tx.type === 'cash_in') bal += tx.amount;
      else bal -= tx.amount;
    }
    return Number(bal.toFixed(2));
  }, [transactions, selectedDate]);

  // Daily Running Ledger (Chronological running balance, displayed newest first)
  const dailyRunningLedger = useMemo(() => {
    const byDate = new Map<
      string,
      { date: string; cashIn: number; expense: number; withdraw: number; count: number }
    >();

    for (const tx of transactions) {
      const prev = byDate.get(tx.date) ?? {
        date: tx.date,
        cashIn: 0,
        expense: 0,
        withdraw: 0,
        count: 0,
      };
      if (tx.type === 'cash_in') prev.cashIn += tx.amount;
      else if (tx.type === 'expense') prev.expense += tx.amount;
      else prev.withdraw += tx.amount;
      prev.count += 1;
      byDate.set(tx.date, prev);
    }

    const chronological = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    let running = 0;
    const withRunning = chronological.map((row) => {
      const dayNet = Number((row.cashIn - row.expense - row.withdraw).toFixed(2));
      running = Number((running + dayNet).toFixed(2));
      return {
        ...row,
        dayNet,
        runningBalance: running,
      };
    });

    return withRunning.reverse();
  }, [transactions]);

  // Matching dates for history search (matches date string/Bangla date or any tx title/note/amount on that date)
  const matchingDatesBySearch = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return null;
    const matched = new Set<string>();
    for (const row of dailyRunningLedger) {
      if (
        row.date.toLowerCase().includes(q) ||
        formatDateBn(row.date, true).toLowerCase().includes(q)
      ) {
        matched.add(row.date);
      }
    }
    for (const tx of transactions) {
      const hay = `${tx.title} ${tx.note ?? ''} ${tx.amount}`.toLowerCase();
      if (hay.includes(q)) {
        matched.add(tx.date);
      }
    }
    return matched;
  }, [historySearch, dailyRunningLedger, transactions]);

  const filteredDailyLedger = useMemo(() => {
    return dailyRunningLedger
      .filter((row) => isDateInRange(row.date, dateRange))
      .filter((row) => (matchingDatesBySearch ? matchingDatesBySearch.has(row.date) : true));
  }, [dailyRunningLedger, dateRange, matchingDatesBySearch]);

  const filteredRunningTotals = useMemo(() => {
    let cashIn = 0;
    let expense = 0;
    let withdraw = 0;
    for (const row of filteredDailyLedger) {
      cashIn += row.cashIn;
      expense += row.expense;
      withdraw += row.withdraw;
    }
    const net = Number((cashIn - expense - withdraw).toFixed(2));
    return {
      cashIn: Number(cashIn.toFixed(2)),
      expense: Number(expense.toFixed(2)),
      withdraw: Number(withdraw.toFixed(2)),
      net,
    };
  }, [filteredDailyLedger]);

  // Monthly Aggregates
  const monthlyLedger = useMemo(() => {
    const map = new Map<
      string,
      { monthISO: string; cashIn: number; expense: number; withdraw: number; count: number }
    >();
    for (const tx of transactions) {
      const ym = tx.date.slice(0, 7);
      const prev = map.get(ym) ?? {
        monthISO: ym,
        cashIn: 0,
        expense: 0,
        withdraw: 0,
        count: 0,
      };
      if (tx.type === 'cash_in') prev.cashIn += tx.amount;
      else if (tx.type === 'expense') prev.expense += tx.amount;
      else prev.withdraw += tx.amount;
      prev.count += 1;
      map.set(ym, prev);
    }
    const q = historySearch.trim().toLowerCase();
    return Array.from(map.values())
      .sort((a, b) => b.monthISO.localeCompare(a.monthISO))
      .map((m) => ({
        ...m,
        net: Number((m.cashIn - m.expense - m.withdraw).toFixed(2)),
      }))
      .filter((m) =>
        q
          ? m.monthISO.toLowerCase().includes(q) ||
            formatMonthBn(m.monthISO).toLowerCase().includes(q)
          : true
      );
  }, [transactions, historySearch]);

  // Yearly Aggregates
  const yearlyLedger = useMemo(() => {
    const map = new Map<
      string,
      { year: string; cashIn: number; expense: number; withdraw: number; count: number }
    >();
    for (const tx of transactions) {
      const yr = tx.date.slice(0, 4);
      const prev = map.get(yr) ?? {
        year: yr,
        cashIn: 0,
        expense: 0,
        withdraw: 0,
        count: 0,
      };
      if (tx.type === 'cash_in') prev.cashIn += tx.amount;
      else if (tx.type === 'expense') prev.expense += tx.amount;
      else prev.withdraw += tx.amount;
      prev.count += 1;
      map.set(yr, prev);
    }
    const q = historySearch.trim().toLowerCase();
    return Array.from(map.values())
      .sort((a, b) => b.year.localeCompare(a.year))
      .map((y) => ({
        ...y,
        net: Number((y.cashIn - y.expense - y.withdraw).toFixed(2)),
      }))
      .filter((y) => (q ? y.year.toLowerCase().includes(q) : true));
  }, [transactions, historySearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const numericAmount = Number(amount);

    if (!trimmedTitle) {
      setFormError('অনুগ্রহ করে খাত বা বিবরণ লিখুন।');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError('সঠিক টাকার পরিমাণ (০ এর বেশি) লিখুন।');
      return;
    }

    if (!selectedCompany) return;

    onAddTransaction({
      companyId: selectedCompany.id,
      date: selectedDate,
      type: txType,
      title: trimmedTitle,
      amount: Number(numericAmount.toFixed(2)),
      note: note.trim() || undefined,
    });

    setTitle('');
    setAmount('');
    setNote('');
    setFormError('');
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  const getTypeLabel = (type: CashTransactionType) => {
    if (type === 'cash_in') return 'ক্যাশ জমা';
    if (type === 'expense') return 'খরচ';
    return 'উত্তোলন';
  };

  const getTypeTextColor = (type: CashTransactionType) => {
    if (type === 'cash_in') return 'text-emerald-700';
    if (type === 'expense') return 'text-rose-700';
    return 'text-amber-700';
  };

  if (!selectedCompany) {
    return (
      <div className="space-y-6">
        <CompanyScopeBar
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          onSelectCompanyId={onSelectCompanyId}
          onAddCompany={onAddCompany}
          moduleLabel="ক্যাশ ও খরচ"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PrintLetterhead
        reportTitle={`${selectedCompany.name} · দৈনিক ক্যাশ, খরচ ও উত্তোলন রিপোর্ট`}
        reportDate={formatDateBn(selectedDate, true)}
        subtitle={`কোম্পানি: ${selectedCompany.name} · অবশিষ্ট ক্যাশ ব্যালেন্স: ${formatTaka(overallTotals.remainingCash)}`}
      />

      <CompanyScopeBar
        companies={companies}
        selectedCompanyId={selectedCompany.id}
        onSelectCompanyId={onSelectCompanyId}
        summary={oneToOneSummary}
        onOpenWorkspace={onOpenWorkspace}
        onAddCompany={onAddCompany}
        moduleLabel="ক্যাশ ও খরচ"
      />

      {orphanCashCount > 0 && onAssignOrphansToCompany && (
        <div className="no-print flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-amber-950">
            পুরানো {orphanCashCount}টি ক্যাশ/খরচ এন্ট্রি কোনো নির্দিষ্ট কোম্পানির সাথে যুক্ত নেই।
          </p>
          <button
            type="button"
            onClick={() => onAssignOrphansToCompany(selectedCompany.id)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-[#1E3A8A] px-3.5 py-1.5 text-xs sm:text-sm font-bold text-white hover:bg-[#172e6e] whitespace-nowrap sm:self-auto"
          >
            সবগুলো {selectedCompany.name}-এ যুক্ত করুন
          </button>
        </div>
      )}

      {/* Page Header & Date Controls */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1e293b]">
            Khan Enterprise · {selectedCompany.name} · {formatDateBn(selectedDate, true)}
          </p>
          <h1 className="mt-1 text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#0f172a]">
            {selectedCompany.name} — ক্যাশ, খরচ ও উত্তোলন খাতা
          </h1>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2.5">
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
                aria-label="তারিখ নির্বাচন"
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
              আজকের তারিখ
            </button>
          )}

          <button
            type="button"
            onClick={() => downloadCashLedgerCsv(transactions, selectedCompany.name)}
            disabled={transactions.length === 0}
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

      {/* 4-Column Balance KPI Strip */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] sm:grid-cols-2 lg:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div
          className={`px-5 py-4.5 transition-colors ${
            overallTotals.remainingCash >= 0
              ? 'bg-teal-50/75 hover:bg-teal-50'
              : 'bg-rose-50/75 hover:bg-rose-50'
          }`}
        >
          <p className="text-sm font-bold text-[#0f172a]">হাতে অবশিষ্ট ক্যাশ (মোট ব্যালেন্স)</p>
          <p
            className={`font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold ${
              overallTotals.remainingCash >= 0 ? 'text-teal-800' : 'text-rose-700'
            }`}
          >
            {formatTaka(overallTotals.remainingCash)}
          </p>
          <p className="font-mono-tabular mt-1 text-sm font-semibold text-[#1e293b]">
            জমা − খরচ − উত্তোলন ({formatTaka(balanceUpToSelectedDate)} ওই দিন পর্যন্ত)
          </p>
        </div>

        <div className="px-5 py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-sm font-bold text-[#1e293b]">
            ক্যাশ জমা ({formatDateBn(selectedDate)})
          </p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-emerald-700">
            {formatTaka(dayTotals.cashIn)}
          </p>
          <p className="font-mono-tabular mt-1 text-sm font-medium text-[#1e293b]">
            সর্বমোট জমা: {formatTaka(overallTotals.cashIn)}
          </p>
        </div>

        <div className="px-5 py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-sm font-bold text-[#1e293b]">
            খরচ ({formatDateBn(selectedDate)})
          </p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-rose-700">
            {formatTaka(dayTotals.expense)}
          </p>
          <p className="font-mono-tabular mt-1 text-sm font-medium text-[#1e293b]">
            সর্বমোট খরচ: {formatTaka(overallTotals.expense)}
          </p>
        </div>

        <div className="px-5 py-4.5 transition-colors hover:bg-slate-50/80">
          <p className="text-sm font-bold text-[#1e293b]">
            উত্তোলন ({formatDateBn(selectedDate)})
          </p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-amber-800">
            {formatTaka(dayTotals.withdraw)}
          </p>
          <p className="font-mono-tabular mt-1 text-sm font-medium text-[#1e293b]">
            সর্বমোট উত্তোলন: {formatTaka(overallTotals.withdraw)}
          </p>
        </div>
      </div>

      {/* Entry Form + Selected Day Transactions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Entry Form */}
        <section className="no-print rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-teal-700" />
              <h2 className="text-lg font-bold text-[#0f172a]">নতুন এন্ট্রি যোগ করুন</h2>
            </div>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                <Check className="h-4 w-4" />
                যোগ হয়েছে
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            {/* Segmented Transaction Type */}
            <div>
              <label className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                লেনদেনের ধরন সিলেক্ট করুন
              </label>
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setTxType('cash_in');
                    setFormError('');
                  }}
                  className={`rounded-md py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                    txType === 'cash_in'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-[#0f172a] hover:bg-white/60'
                  }`}
                >
                  ক্যাশ জমা
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTxType('expense');
                    setFormError('');
                  }}
                  className={`rounded-md py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                    txType === 'expense'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'text-[#0f172a] hover:bg-white/60'
                  }`}
                >
                  খরচ (Expense)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTxType('withdraw');
                    setFormError('');
                  }}
                  className={`rounded-md py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                    txType === 'withdraw'
                      ? 'bg-amber-700 text-white shadow-xs'
                      : 'text-[#0f172a] hover:bg-white/60'
                  }`}
                >
                  উত্তোলন
                </button>
              </div>
            </div>

            {/* Quick Title Presets */}
            <div>
              <span className="mb-1.5 block text-xs font-bold text-[#1e293b]">
                দ্রুত বিবরণ বাছাই করুন:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TITLES[txType].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTitle(preset);
                      if (formError) setFormError('');
                    }}
                    className={`rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${
                      title === preset
                        ? 'border-teal-600 bg-teal-50 text-teal-900 font-bold'
                        : 'border-slate-300 bg-slate-50 text-[#0f172a] hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="tx-title" className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                খাত / বিবরণ <span className="text-rose-600">*</span>
              </label>
              <input
                id="tx-title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (formError) setFormError('');
                }}
                placeholder={
                  txType === 'cash_in'
                    ? 'যেমন: মার্কেট কালেকশন / নগদ জমা'
                    : txType === 'expense'
                      ? 'যেমন: গাড়ির তেল / ডেলিভারি খরচ'
                      : 'যেমন: মালিকের উত্তোলন / ব্যাংক জমা'
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="tx-amount"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  টাকার পরিমাণ (৳) <span className="text-rose-600">*</span>
                </label>
                <input
                  id="tx-amount"
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="0"
                  className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-bold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              <div>
                <label
                  htmlFor="tx-date"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  তারিখ
                </label>
                <input
                  id="tx-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="tx-note" className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                মন্তব্য / নোট (ঐচ্ছিক)
              </label>
              <input
                id="tx-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="যেকোনো অতিরিক্ত তথ্য..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>

            {formError && <p className="text-sm font-semibold text-rose-700">{formError}</p>}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              {txType === 'cash_in'
                ? 'ক্যাশ জমা সেভ করুন'
                : txType === 'expense'
                  ? 'খরচ সেভ করুন'
                  : 'উত্তোলন সেভ করুন'}
            </button>
          </form>
        </section>

        {/* Right: Selected Date's Transactions List */}
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] lg:col-span-7">
          <div className="space-y-3 border-b border-slate-200 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#0f172a]">
                  {formatDateBn(selectedDate)}-এর লেনদেন তালিকা
                </h2>
                <p className="font-mono-tabular mt-0.5 text-sm font-medium text-[#1e293b]">
                  দিনের নিট (জমা − খরচ − উত্তোলন):{' '}
                  <span
                    className={`font-bold ${
                      dayTotals.netDay >= 0 ? 'text-teal-800' : 'text-rose-700'
                    }`}
                  >
                    {formatTaka(dayTotals.netDay)}
                  </span>
                </p>
              </div>

              <div className="no-print flex flex-wrap items-center gap-2">
                <div className="relative min-w-[170px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input
                    type="text"
                    value={daySearch}
                    onChange={(e) => setDaySearch(e.target.value)}
                    placeholder="খাত বা নোট খুঁজুন..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-7 text-sm font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
                  />
                  {daySearch && (
                    <button
                      type="button"
                      onClick={() => setDaySearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-[#0f172a]"
                      aria-label="সার্চ মুছুন"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setTypeFilter('all')}
                    className={`rounded-md px-2.5 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                      typeFilter === 'all' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                    }`}
                  >
                    সব
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('cash_in')}
                    className={`rounded-md px-2.5 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                      typeFilter === 'cash_in' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                    }`}
                  >
                    জমা
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('expense')}
                    className={`rounded-md px-2.5 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                      typeFilter === 'expense' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                    }`}
                  >
                    খরচ
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter('withdraw')}
                    className={`rounded-md px-2.5 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                      typeFilter === 'withdraw'
                        ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                        : 'text-[#1e293b]'
                    }`}
                  >
                    উত্তোলন
                  </button>
                </div>
              </div>
            </div>
          </div>

          {dayTransactions.length === 0 ? (
            <div className="px-6 py-14 text-center text-[15px] font-medium text-[#1e293b]">
              {daySearch || typeFilter !== 'all'
                ? 'এই সার্চ বা ফিল্টারে কোনো লেনদেন পাওয়া যায়নি।'
                : `${formatDateBn(selectedDate)} তারিখে কোনো ক্যাশ জমা, খরচ বা উত্তোলনের এন্ট্রি নেই। বাম পাশের ফর্ম থেকে এন্ট্রি যোগ করুন।`}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                    <th className="py-3.5 pl-5 pr-3">ধরন</th>
                    <th className="px-3 py-3.5">খাত / বিবরণ</th>
                    <th className="px-3 py-3.5 text-right">টাকা (৳)</th>
                    <th className="no-print py-3.5 pl-3 pr-5 text-right">মুছুন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {dayTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80">
                      <td className="py-3.5 pl-5 pr-3 text-sm font-bold whitespace-nowrap">
                        <span className={getTypeTextColor(tx.type)}>
                          {getTypeLabel(tx.type)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="font-semibold text-[#0f172a]">{tx.title}</div>
                        {tx.note && <div className="text-sm font-medium text-[#1e293b]">{tx.note}</div>}
                      </td>
                      <td
                        className={`font-mono-tabular px-3 py-3.5 text-right text-[15px] font-bold ${getTypeTextColor(
                          tx.type
                        )}`}
                      >
                        {tx.type === 'cash_in' ? '+' : '−'} {formatTaka(tx.amount)}
                      </td>
                      <td className="no-print py-3.5 pl-3 pr-5 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteTransaction(tx.id)}
                          className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
                          title="মুছে ফেলুন"
                          aria-label={`${tx.title} মুছুন`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                    <td className="py-3.5 pl-5 pr-3" colSpan={2}>
                      এই দিনের নিট হিসাব (জমা − খরচ − উত্তোলন)
                    </td>
                    <td
                      className={`font-mono-tabular px-3 py-3.5 text-right text-base font-extrabold ${
                        dayTotals.netDay >= 0 ? 'text-teal-800' : 'text-rose-700'
                      }`}
                    >
                      {formatTaka(dayTotals.netDay)}
                    </td>
                    <td className="no-print" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Date-by-Date / Month / Year Running Cash & Expense Ledger */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
        <div className="space-y-3 border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <History className="h-5 w-5 text-teal-700" />
              <div>
                <h2 className="text-lg font-bold text-[#0f172a]">
                  তারিখ অনুযায়ী ক্যাশ, খরচ, উত্তোলন ও অবশিষ্ট ব্যালেন্স
                </h2>
                <p className="text-sm font-medium text-[#1e293b]">
                  {historyPeriod === 'day'
                    ? `${formatDateRangeLabelBn(dateRange)} · প্রতিদিন খরচ ও উত্তোলন বাদ দিয়ে হাতে কত টাকা রয়েছে তা দেখা যাচ্ছে।`
                    : 'প্রতিদিন খরচ ও উত্তোলন বাদ দিয়ে হাতে কত টাকা রয়েছে তা এখানে দেখা যাবে।'}
                </p>
              </div>
            </div>

            <div className="no-print inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setHistoryPeriod('day')}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  historyPeriod === 'day' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                }`}
              >
                প্রতিদিনের হিসাব
              </button>
              <button
                type="button"
                onClick={() => setHistoryPeriod('month')}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  historyPeriod === 'month' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                }`}
              >
                মাসিক হিসাব
              </button>
              <button
                type="button"
                onClick={() => setHistoryPeriod('year')}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  historyPeriod === 'year' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                }`}
              >
                বাৎসরিক হিসাব
              </button>
            </div>
          </div>

          <DateRangeFilterBar
            value={dateRange}
            onChange={(next) => {
              setDateRange(next);
              if (historyPeriod !== 'day') setHistoryPeriod('day');
            }}
            searchQuery={historySearch}
            onSearchChange={setHistorySearch}
            searchPlaceholder="তারিখ, খাত, নোট বা টাকা খুঁজুন..."
          />
        </div>

        {transactions.length === 0 ? (
          <div className="px-6 py-10 text-center text-[15px] font-medium text-[#1e293b]">
            এখনও কোনো ক্যাশ, খরচ বা উত্তোলনের হিসাব এন্ট্রি করা হয়নি।
          </div>
        ) : historyPeriod === 'day' ? (
          filteredDailyLedger.length === 0 ? (
            <div className="px-6 py-10 text-center text-[15px] font-medium text-[#1e293b]">
              নির্বাচিত তারিখের রেঞ্জ বা সার্চে কোনো লেনদেন পাওয়া যায়নি।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                    <th className="py-3.5 pl-5 pr-3 whitespace-nowrap">তারিখ</th>
                    <th className="px-3 py-3.5 text-right whitespace-nowrap">ক্যাশ জমা (৳)</th>
                    <th className="px-3 py-3.5 text-right whitespace-nowrap">খরচ (৳)</th>
                    <th className="px-3 py-3.5 text-right whitespace-nowrap">উত্তোলন (৳)</th>
                    <th className="px-3 py-3.5 text-right whitespace-nowrap">দিনের নিট (৳)</th>
                    <th className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">অবশিষ্ট ক্যাশ ব্যালেন্স (৳)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {filteredDailyLedger.map((row) => (
                    <tr
                      key={row.date}
                      onClick={() => setSelectedDate(row.date)}
                      className={`cursor-pointer transition-colors ${
                        row.date === selectedDate ? 'bg-teal-50/80' : 'hover:bg-teal-50/40'
                      }`}
                    >
                      <td className="py-3.5 pl-5 pr-3 font-semibold text-[#0f172a] whitespace-nowrap">
                        {formatDateBn(row.date)}
                        {row.date === today && (
                          <span className="ml-2 text-sm font-bold text-teal-800">· আজ</span>
                        )}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right text-emerald-700 font-semibold whitespace-nowrap">
                        {formatTaka(row.cashIn)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right text-rose-700 font-semibold whitespace-nowrap">
                        {formatTaka(row.expense)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right text-amber-800 font-semibold whitespace-nowrap">
                        {formatTaka(row.withdraw)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-[#0f172a] whitespace-nowrap">
                        {formatTaka(row.dayNet)}
                      </td>
                      <td
                        className={`font-mono-tabular py-3.5 pl-3 pr-5 text-right text-[15px] font-bold whitespace-nowrap ${
                          row.runningBalance >= 0 ? 'text-teal-800' : 'text-rose-700'
                        }`}
                      >
                        {formatTaka(row.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                    <td className="py-3.5 pl-5 pr-3 whitespace-nowrap">
                      {dateRange.preset === 'all' && !historySearch.trim()
                        ? `সর্বমোট (${filteredDailyLedger.length} দিন)`
                        : `ফিল্টার মোট (${filteredDailyLedger.length} দিন)`}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right text-emerald-800 whitespace-nowrap">
                      {formatTaka(filteredRunningTotals.cashIn)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right text-rose-700 whitespace-nowrap">
                      {formatTaka(filteredRunningTotals.expense)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right text-amber-800 whitespace-nowrap">
                      {formatTaka(filteredRunningTotals.withdraw)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                      {formatTaka(filteredRunningTotals.net)}
                    </td>
                    <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right text-base font-extrabold text-teal-800 whitespace-nowrap">
                      {formatTaka(overallTotals.remainingCash)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : historyPeriod === 'month' ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">মাস ও বছর</th>
                  <th className="px-3 py-3.5 text-right">ক্যাশ জমা (৳)</th>
                  <th className="px-3 py-3.5 text-right">খরচ (৳)</th>
                  <th className="px-3 py-3.5 text-right">উত্তোলন (৳)</th>
                  <th className="py-3.5 pl-3 pr-5 text-right">মাসের অবশিষ্ট নিট (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {monthlyLedger.map((m) => (
                  <tr key={m.monthISO} className="hover:bg-slate-50/80">
                    <td className="py-3.5 pl-5 pr-3 font-semibold text-[#0f172a]">
                      {formatMonthBn(m.monthISO)}
                      {m.monthISO === currentMonth && (
                        <span className="ml-2 text-sm font-bold text-teal-800">· চলতি মাস</span>
                      )}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right text-emerald-700 font-semibold">
                      {formatTaka(m.cashIn)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right text-rose-700 font-semibold">
                      {formatTaka(m.expense)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right text-amber-800 font-semibold">
                      {formatTaka(m.withdraw)}
                    </td>
                    <td
                      className={`font-mono-tabular py-3.5 pl-3 pr-5 text-right text-[15px] font-bold ${
                        m.net >= 0 ? 'text-teal-800' : 'text-rose-700'
                      }`}
                    >
                      {formatTaka(m.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">বছর</th>
                  <th className="px-3 py-3.5 text-right">ক্যাশ জমা (৳)</th>
                  <th className="px-3 py-3.5 text-right">খরচ (৳)</th>
                  <th className="px-3 py-3.5 text-right">উত্তোলন (৳)</th>
                  <th className="py-3.5 pl-3 pr-5 text-right">বছরের অবশিষ্ট নিট (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {yearlyLedger.map((y) => (
                  <tr key={y.year} className="hover:bg-slate-50/80">
                    <td className="py-3.5 pl-5 pr-3 font-bold text-[#0f172a]">
                      {y.year} সাল
                      {y.year === currentYear && (
                        <span className="ml-2 text-sm font-bold text-teal-800">· চলতি বছর</span>
                      )}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right text-emerald-700 font-semibold">
                      {formatTaka(y.cashIn)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right text-rose-700 font-semibold">
                      {formatTaka(y.expense)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right text-amber-800 font-semibold">
                      {formatTaka(y.withdraw)}
                    </td>
                    <td
                      className={`font-mono-tabular py-3.5 pl-3 pr-5 text-right text-[15px] font-bold ${
                        y.net >= 0 ? 'text-teal-800' : 'text-rose-700'
                      }`}
                    >
                      {formatTaka(y.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PrintSignatureFooter />
    </div>
  );
};
