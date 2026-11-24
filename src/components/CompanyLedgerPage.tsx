import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  Download,
  Eye,
  FileImage,
  Plus,
  Printer,
  Receipt,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Company,
  CompanyLedgerEntry,
  CompanyLedgerType,
} from '../types/ledger';
import {
  compressImageFileToDataUrl,
  downloadCompanyLedgerCsv,
  formatDateBn,
  formatTaka,
  getTodayISO,
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
import { ChalanMemoData, ChalanMemoModal } from './ChalanMemoModal';

interface CompanyLedgerPageProps {
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompanyId: (companyId: string) => void;
  oneToOneSummary?: Company1to1Summary | null;
  onOpenWorkspace?: (companyId: string) => void;
  entries: CompanyLedgerEntry[];
  onAddEntry: (entry: Omit<CompanyLedgerEntry, 'id' | 'createdAt'>) => void;
  onDeleteEntry: (id: string) => void;
  onAddCompany: () => void;
}

export const CompanyLedgerPage: React.FC<CompanyLedgerPageProps> = ({
  companies,
  selectedCompanyId,
  onSelectCompanyId,
  oneToOneSummary,
  onOpenWorkspace,
  entries,
  onAddEntry,
  onDeleteEntry,
  onAddCompany,
}) => {
  const today = getTodayISO();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCompany =
    companies.find((c) => c.id === selectedCompanyId) ?? companies[0] ?? null;

  const [entryType, setEntryType] = useState<CompanyLedgerType>('payment_given');
  const [date, setDate] = useState<string>(today);
  const [amount, setAmount] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | undefined>(undefined);
  const [attachmentName, setAttachmentName] = useState<string | undefined>(undefined);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const [filterType, setFilterType] = useState<'all' | CompanyLedgerType>('all');
  const [dateRange, setDateRange] = useState<DateRangeValue>(() =>
    createDateRangePreset('all', today)
  );
  const [entrySearch, setEntrySearch] = useState('');
  const [previewEntry, setPreviewEntry] = useState<CompanyLedgerEntry | null>(null);
  const [activeMemo, setActiveMemo] = useState<ChalanMemoData | null>(null);

  useEffect(() => {
    if (!previewEntry) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewEntry(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewEntry]);

  // Strictly 1-to-1 totals for selectedCompany only
  const companyTotals = useMemo(() => {
    let totalPaid = 0;
    let totalGoods = 0;
    let lastDate = '';
    for (const item of entries) {
      if (selectedCompany && item.companyId !== selectedCompany.id) continue;
      if (item.type === 'payment_given') {
        totalPaid = Number((totalPaid + item.amount).toFixed(2));
      } else {
        totalGoods = Number((totalGoods + item.amount).toFixed(2));
      }
      if (!lastDate || item.date > lastDate) {
        lastDate = item.date;
      }
    }
    const netBalance = Number((totalPaid - totalGoods).toFixed(2));
    return {
      totalPaid,
      totalGoods,
      netBalance,
      entryCount: entries.length,
      lastDate,
    };
  }, [entries, selectedCompany]);

  const filteredEntries = useMemo(() => {
    const q = entrySearch.trim().toLowerCase();
    return entries
      .filter((item) => (selectedCompany ? item.companyId === selectedCompany.id : false))
      .filter((item) => (filterType === 'all' ? true : item.type === filterType))
      .filter((item) => isDateInRange(item.date, dateRange))
      .filter((item) => {
        if (!q) return true;
        const hay = `${selectedCompany?.name ?? ''} ${item.reference ?? ''} ${item.amount}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [entries, selectedCompany, filterType, dateRange, entrySearch]);

  const filteredTotals = useMemo(() => {
    let paid = 0;
    let goods = 0;
    for (const item of filteredEntries) {
      if (item.type === 'payment_given') paid += item.amount;
      else goods += item.amount;
    }
    return {
      paid: Number(paid.toFixed(2)),
      goods: Number(goods.toFixed(2)),
    };
  }, [filteredEntries]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('অনুগ্রহ করে শুধু ছবির ফাইল (JPG, PNG, WebP) সিলেক্ট করুন।');
      return;
    }

    setIsCompressing(true);
    setFormError('');
    try {
      const compressed = await compressImageFileToDataUrl(file, 1200, 0.72);
      setAttachmentDataUrl(compressed);
      setAttachmentName(file.name);
    } catch {
      setFormError('ছবিটি প্রসেস করা যায়নি। অন্য ছবি দিয়ে চেষ্টা করুন।');
    } finally {
      setIsCompressing(false);
    }
  };

  const clearSelectedFile = () => {
    setAttachmentDataUrl(undefined);
    setAttachmentName(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) {
      setFormError('অনুগ্রহ করে একটি কোম্পানি সিলেক্ট করুন।');
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError('সঠিক টাকার পরিমাণ (০ এর বেশি) লিখুন।');
      return;
    }

    onAddEntry({
      companyId: selectedCompany.id,
      date,
      type: entryType,
      amount: Number(numericAmount.toFixed(2)),
      reference: reference.trim() || undefined,
      attachmentDataUrl,
      attachmentName,
    });

    setAmount('');
    setReference('');
    clearSelectedFile();
    setFormError('');
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  if (!selectedCompany) {
    return (
      <div className="space-y-6">
        <CompanyScopeBar
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          onSelectCompanyId={onSelectCompanyId}
          onAddCompany={onAddCompany}
          moduleLabel="পেমেন্ট ও চালান"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PrintLetterhead
        reportTitle={`${selectedCompany.name} · কোম্পানি পেমেন্ট ও চালান রিপোর্ট`}
        reportDate={formatDateBn(today, true)}
        subtitle={`মোট পেমেন্ট: ${formatTaka(companyTotals.totalPaid)} · মোট মাল: ${formatTaka(companyTotals.totalGoods)}`}
      />

      <CompanyScopeBar
        companies={companies}
        selectedCompanyId={selectedCompany.id}
        onSelectCompanyId={onSelectCompanyId}
        summary={oneToOneSummary}
        onOpenWorkspace={onOpenWorkspace}
        onAddCompany={onAddCompany}
        moduleLabel="পেমেন্ট ও চালান"
      />

      {/* Page Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1e293b]">
            Khan Enterprise · {selectedCompany.name} · কোম্পানি লেজার ও ডকুমেন্ট সংরক্ষণ
          </p>
          <h1 className="mt-1 text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#0f172a]">
            {selectedCompany.name} — পেমেন্ট ও চালান খাতা
          </h1>
          <p className="mt-1 text-[15px] font-medium text-[#1e293b]">
            শুধু {selectedCompany.name}-কে কত টাকা দেওয়া হয়েছে, কত টাকার মাল এসেছে ও চালান কপির ছবি একসাথে রাখুন।
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => downloadCompanyLedgerCsv(filteredEntries, companies, selectedCompany.name)}
            disabled={filteredEntries.length === 0}
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

      {/* 4-Column Strict 1-to-1 KPI Strip */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] sm:grid-cols-2 lg:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-5 transition-colors hover:bg-slate-50/70">
          <p className="text-sm font-bold text-[#0f172a]">টাকা দেওয়া হয়েছে</p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {formatTaka(companyTotals.totalPaid)}
          </p>
          <p className="mt-1 text-sm font-medium text-[#1e293b]">{selectedCompany.name}-কে পরিশোধ</p>
        </div>

        <div className="px-5 py-5 transition-colors hover:bg-slate-50/70">
          <p className="text-sm font-bold text-[#0f172a]">মাল এসেছে (চালান)</p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {formatTaka(companyTotals.totalGoods)}
          </p>
          <p className="mt-1 text-sm font-medium text-[#1e293b]">মোট চালানের মূল্য</p>
        </div>

        <div
          className={`px-5 py-5 transition-colors ${
            companyTotals.netBalance > 0
              ? 'bg-emerald-50/65 hover:bg-emerald-50/90'
              : companyTotals.netBalance < 0
                ? 'bg-rose-50/65 hover:bg-rose-50/90'
                : 'hover:bg-slate-50/70'
          }`}
        >
          <p className="text-sm font-bold text-[#0f172a]">হিসাবের অবস্থা</p>
          <p
            className={`font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold ${
              companyTotals.netBalance > 0
                ? 'text-emerald-800'
                : companyTotals.netBalance < 0
                  ? 'text-rose-800'
                  : 'text-[#0f2942]'
            }`}
          >
            {companyTotals.netBalance > 0
              ? `+${formatTaka(companyTotals.netBalance)}`
              : companyTotals.netBalance < 0
                ? formatTaka(Math.abs(companyTotals.netBalance))
                : '৳ ০'}
          </p>
          <p className="mt-1 text-sm font-medium text-[#1e293b]">
            {companyTotals.netBalance > 0
              ? 'কোম্পানির কাছে পাব (অগ্রিম)'
              : companyTotals.netBalance < 0
                ? 'কোম্পানিকে দিতে হবে (বাকি)'
                : 'হিসাব সমান'}
          </p>
        </div>

        <div className="px-5 py-5 transition-colors hover:bg-slate-50/70">
          <p className="text-sm font-bold text-[#0f172a]">সর্বশেষ লেনদেন</p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {companyTotals.entryCount}টি এন্ট্রি
          </p>
          <p className="mt-1 text-sm font-medium text-[#1e293b]">
            {companyTotals.lastDate ? `সর্বশেষ: ${formatDateBn(companyTotals.lastDate)}` : 'এখনও লেনদেন নেই'}
          </p>
        </div>
      </div>

      {/* Main Split: Entry Form + Attached Slips & Chalan Records */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Entry Form with Photo Attachment */}
        <section className="no-print rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] lg:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-teal-700" />
              <h2 className="text-lg font-bold text-[#0f172a]">
                নতুন পেমেন্ট / চালান যোগ করুন
              </h2>
            </div>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                <Check className="h-4 w-4" />
                সেভ হয়েছে
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            {/* Locked 1-to-1 Company Indicator */}
            <div>
              <span className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                কোম্পানি (১-টু-১ লক)
              </span>
              <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-3.5 py-2.5 text-[15px] font-bold text-[#1E3A8A]">
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0" />
                  {selectedCompany.name}
                </span>
                <span className="rounded bg-white px-2 py-0.5 text-[11px] font-extrabold text-[#1E3A8A]">
                  সক্রিয়
                </span>
              </div>
            </div>

              {/* Type Segmented Toggle */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                  লেনদেনের ধরন
                </label>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEntryType('payment_given');
                      setFormError('');
                    }}
                    className={`rounded-md py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                      entryType === 'payment_given'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-[#0f172a] hover:bg-white/60'
                    }`}
                  >
                    টাকা দেওয়া হয়েছে
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEntryType('goods_received');
                      setFormError('');
                    }}
                    className={`rounded-md py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                      entryType === 'goods_received'
                        ? 'bg-[#0f2942] text-white shadow-xs'
                        : 'text-[#0f172a] hover:bg-white/60'
                    }`}
                  >
                    মাল এসেছে (চালান)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="cl-amount"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    টাকার পরিমাণ (৳) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="cl-amount"
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
                    htmlFor="cl-date"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    তারিখ
                  </label>
                  <input
                    id="cl-date"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      if (e.target.value) setDate(e.target.value);
                    }}
                    className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>
              </div>

              {/* Slip / Chalan Reference */}
              <div>
                <label
                  htmlFor="cl-ref"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  {entryType === 'payment_given'
                    ? 'ব্যাংক / অনলাইন স্লিপ নং ও বিবরণ'
                    : 'চালান নং ও বিবরণ'}
                </label>
                <input
                  id="cl-ref"
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={
                    entryType === 'payment_given'
                      ? 'যেমন: ব্যাংক ডিপোজিট স্লিপ #১২৩ / বিকাশ-নগদ ট্রান্সফার'
                      : 'যেমন: চালান #CH-৪৫০ / ৫০ কার্টন ম্যাঙ্গো জুস'
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              {/* Image Upload Attachment */}
              <div>
                <label className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                  {entryType === 'payment_given'
                    ? 'অনলাইন / ব্যাংক পেমেন্ট স্লিপের ছবি সংযুক্ত করুন'
                    : 'মালের চালান কপির ছবি সংযুক্ত করুন'}
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="cl-attachment"
                />

                {!attachmentDataUrl ? (
                  <label
                    htmlFor="cl-attachment"
                    className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition-colors hover:border-teal-600 hover:bg-teal-50/40"
                  >
                    <Upload className="h-5 w-5 text-[#1e293b]" />
                    <span className="mt-2 text-sm font-semibold text-[#0f172a]">
                      {isCompressing
                        ? 'ছবি প্রস্তুত হচ্ছে...'
                        : entryType === 'payment_given'
                          ? 'পেমেন্ট স্লিপের ছবি আপলোড করতে ক্লিক করুন'
                          : 'চালান কপির ছবি আপলোড করতে ক্লিক করুন'}
                    </span>
                    <span className="mt-0.5 text-xs font-medium text-[#1e293b]">
                      JPG বা PNG ছবি স্বয়ংক্রিয়ভাবে হালকা সাইজে সেভ হবে
                    </span>
                  </label>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={attachmentDataUrl}
                        alt="সংযুক্ত ছবি"
                        className="h-14 w-14 shrink-0 rounded-md border border-slate-200 object-cover bg-white"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#0f172a]">
                          {attachmentName ?? 'সংযুক্ত ডকুমেন্ট'}
                        </p>
                        <p className="text-xs font-semibold text-emerald-700">
                          ছবি সংযুক্ত হয়েছে
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 whitespace-nowrap shrink-0"
                    >
                      ছবি সরান
                    </button>
                  </div>
                )}
              </div>

              {formError && <p className="text-sm font-semibold text-rose-700">{formError}</p>}

              <button
                type="submit"
                disabled={isCompressing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
              >
                <Plus className="h-4 w-4" />
                {entryType === 'payment_given'
                  ? 'পেমেন্ট ও স্লিপ সেভ করুন'
                  : 'চালান ও মালের হিসাব সেভ করুন'}
              </button>
            </form>
          </section>

          {/* Right: Ledger History & Attached Photos */}
          <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] lg:col-span-7">
            <div className="space-y-3 border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0f172a]">
                    পেমেন্ট স্লিপ ও চালান কপির তালিকা ({filteredEntries.length})
                  </h2>
                  <p className="text-sm font-medium text-[#1e293b]">
                    {formatDateRangeLabelBn(dateRange)} · ছবির ওপর ক্লিক করে বড় আকারে দেখুন।
                  </p>
                </div>

                <div className="no-print flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setFilterType('all')}
                      className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                        filterType === 'all' ? 'bg-white text-[#0f172a] font-bold shadow-xs' : 'text-[#1e293b]'
                      }`}
                    >
                      সব
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('payment_given')}
                      className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                        filterType === 'payment_given'
                          ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                          : 'text-[#1e293b]'
                      }`}
                    >
                      পেমেন্ট
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('goods_received')}
                      className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                        filterType === 'goods_received'
                          ? 'bg-white text-[#0f172a] font-bold shadow-xs'
                          : 'text-[#1e293b]'
                      }`}
                    >
                      মাল (চালান)
                    </button>
                  </div>
                </div>
              </div>

              <DateRangeFilterBar
                value={dateRange}
                onChange={setDateRange}
                searchQuery={entrySearch}
                onSearchChange={setEntrySearch}
                searchPlaceholder="স্লিপ/চালান নং বা টাকা খুঁজুন..."
              />
            </div>

            {filteredEntries.length === 0 ? (
              <div className="px-6 py-14 text-center text-[15px] font-medium text-[#1e293b]">
                এই ফিল্টারে কোনো পেমেন্ট বা চালানের এন্ট্রি নেই। বাম পাশের ফর্ম থেকে নতুন এন্ট্রি ও ছবি যোগ করুন।
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[15px]">
                  <thead>
                    <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                      <th className="py-3.5 pl-5 pr-3">তারিখ ও কোম্পানি</th>
                      <th className="px-3 py-3.5">ধরন ও বিবরণ</th>
                      <th className="px-3 py-3.5 text-right">টাকা (৳)</th>
                      <th className="px-3 py-3.5 text-center">স্লিপ / চালান কপি</th>
                      <th className="no-print py-3.5 pl-3 pr-5 text-right whitespace-nowrap">চালান / মুছুন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80">
                    {filteredEntries.map((item) => {
                      const companyName = selectedCompany.name;
                      const isPayment = item.type === 'payment_given';

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="py-3.5 pl-5 pr-3">
                            <div className="font-bold text-[#0f172a]">
                              {companyName}
                            </div>
                            <div className="font-mono-tabular text-sm font-medium text-[#1e293b]">
                              {formatDateBn(item.date)}
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <div
                              className={`text-sm font-bold ${
                                isPayment ? 'text-emerald-700' : 'text-[#0f172a]'
                              }`}
                            >
                              {isPayment ? 'টাকা দেওয়া হয়েছে' : 'মাল এসেছে (চালান)'}
                            </div>
                            <div className="text-sm font-medium text-[#1e293b]">
                              {item.reference || '—'}
                            </div>
                          </td>
                          <td
                            className={`font-mono-tabular px-3 py-3.5 text-right text-[15px] font-bold ${
                              isPayment ? 'text-emerald-700' : 'text-[#0f172a]'
                            }`}
                          >
                            {isPayment ? '+' : '−'} {formatTaka(item.amount)}
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            {item.attachmentDataUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewEntry(item)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-teal-800 hover:border-teal-600 hover:bg-teal-50 whitespace-nowrap"
                              >
                                <img
                                  src={item.attachmentDataUrl}
                                  alt={isPayment ? 'স্লিপ' : 'চালান'}
                                  className="h-5 w-5 rounded object-cover"
                                />
                                <Eye className="h-4 w-4" />
                                {isPayment ? 'স্লিপ দেখুন' : 'চালান দেখুন'}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-sm font-medium text-[#1e293b]">
                                <FileImage className="h-4 w-4" />
                                ছবি নেই
                              </span>
                            )}
                          </td>
                          <td className="no-print py-3.5 pl-3 pr-5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveMemo({
                                    docKind: 'company_chalan',
                                    docNumber:
                                      item.reference?.trim() ||
                                      `ভাউচার-${item.id.slice(-5).toUpperCase()}`,
                                    title: isPayment
                                      ? 'কোম্পানি পেমেন্ট স্লিপ / ভাউচার'
                                      : 'কোম্পানি মাল রিসিভ / চালান',
                                    badgeText: isPayment
                                      ? 'টাকা পরিশোধ'
                                      : 'মাল এসেছে (চালান)',
                                    badgeTone: isPayment ? 'emerald' : 'navy',
                                    date: item.date,
                                    partyLabel: 'সরবরাহকারী কোম্পানি',
                                    partyName: companyName,
                                    partySubline: selectedCompany.contactPerson,
                                    partyPhone: selectedCompany.phone,
                                    description:
                                      item.reference ||
                                      (isPayment
                                        ? 'ব্যাংক / অনলাইন পেমেন্ট'
                                        : 'কোম্পানি থেকে মাল গ্রহণ'),
                                    primaryAmountLabel: 'টাকার পরিমাণ',
                                    primaryAmount: item.amount,
                                    secondaryStats: [
                                      {
                                        label: 'মোট পেমেন্ট দেওয়া হয়েছে',
                                        value: formatTaka(companyTotals.totalPaid),
                                        highlight: 'emerald',
                                      },
                                      {
                                        label: 'মোট মাল এসেছে',
                                        value: formatTaka(companyTotals.totalGoods),
                                      },
                                      {
                                        label: 'বর্তমান হিসাবের অবস্থা',
                                        value:
                                          companyTotals.netBalance > 0
                                            ? `পাব +${formatTaka(companyTotals.netBalance)}`
                                            : companyTotals.netBalance < 0
                                              ? `দিতে হবে ${formatTaka(Math.abs(companyTotals.netBalance))}`
                                              : 'হিসাব সমান (৳ 0)',
                                        highlight:
                                          companyTotals.netBalance > 0
                                            ? 'emerald'
                                            : companyTotals.netBalance < 0
                                              ? 'rose'
                                              : 'default',
                                      },
                                    ],
                                    attachmentDataUrl: item.attachmentDataUrl,
                                    attachmentLabel: isPayment
                                      ? 'সংযুক্ত পেমেন্ট স্লিপ'
                                      : 'সংযুক্ত চালান কপি',
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-[#0f2942] transition-colors hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800 whitespace-nowrap"
                                title="চালান প্রিন্ট ও শেয়ার"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                                প্রিন্ট / শেয়ার
                              </button>

                              <button
                                type="button"
                                onClick={() => onDeleteEntry(item.id)}
                                className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
                                title="মুছে ফেলুন"
                                aria-label="এন্ট্রি মুছুন"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                      <td className="py-3.5 pl-5 pr-3 whitespace-nowrap" colSpan={2}>
                        ফিল্টার করা মোট ({filteredEntries.length}টি এন্ট্রি)
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right text-sm font-bold whitespace-nowrap" colSpan={2}>
                        <span className="text-emerald-800">
                          পেমেন্ট +{formatTaka(filteredTotals.paid)}
                        </span>
                        <span className="mx-1.5 text-slate-500">·</span>
                        <span className="text-[#0f172a]">
                          মাল −{formatTaka(filteredTotals.goods)}
                        </span>
                      </td>
                      <td className="no-print py-3.5 pl-3 pr-5" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
      </div>

      {/* Lightbox Modal for Slip / Chalan Photo */}
      {previewEntry && previewEntry.attachmentDataUrl && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4"
          onClick={() => setPreviewEntry(null)}
          role="dialog"
          aria-modal="true"
          aria-label="সংযুক্ত স্লিপ বা চালান কপি"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_50px_-12px_rgba(15,41,66,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-base font-bold text-[#0f172a]">
                  {selectedCompany.name} ·{' '}
                  {previewEntry.type === 'payment_given'
                    ? 'অনলাইন / পেমেন্ট স্লিপ'
                    : 'মালের চালান কপি'}
                </h3>
                <p className="font-mono-tabular text-sm font-semibold text-[#1e293b]">
                  {formatDateBn(previewEntry.date)} · {formatTaka(previewEntry.amount)}
                  {previewEntry.reference ? ` · ${previewEntry.reference}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewEntry.attachmentDataUrl}
                  download={
                    previewEntry.attachmentName ||
                    `${previewEntry.type}_${previewEntry.date}.jpg`
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  ডাউনলোড
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewEntry(null)}
                  className="rounded-lg p-1.5 text-[#0f172a] hover:bg-slate-100"
                  aria-label="বন্ধ করুন"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-100 p-4 text-center">
              <img
                src={previewEntry.attachmentDataUrl}
                alt={previewEntry.reference ?? 'সংযুক্ত ডকুমেন্ট'}
                className="mx-auto max-h-[70vh] rounded-lg border border-slate-200 bg-white object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <ChalanMemoModal memo={activeMemo} onClose={() => setActiveMemo(null)} />

      <PrintSignatureFooter />
    </div>
  );
};
