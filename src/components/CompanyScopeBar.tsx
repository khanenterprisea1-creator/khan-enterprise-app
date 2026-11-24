import React from 'react';
import {
  ArrowUpRight,
  Building2,
  Plus,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Company } from '../types/ledger';
import { Company1to1Summary } from '../utils/companySummary';
import { DEMO_COMPANY_IDS, formatNumber, formatTaka } from '../utils/storage';
import { CompanyLogoAvatar } from './CompanyLogoAvatar';
import { CompanyRepsStrip } from './CompanyRepsStrip';

interface CompanyScopeBarProps {
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompanyId: (companyId: string) => void;
  summary?: Company1to1Summary | null;
  onOpenWorkspace?: (companyId: string) => void;
  onAddCompany?: () => void;
  moduleLabel?: string;
}

export const CompanyScopeBar: React.FC<CompanyScopeBarProps> = ({
  companies,
  selectedCompanyId,
  onSelectCompanyId,
  summary,
  onOpenWorkspace,
  onAddCompany,
  moduleLabel,
}) => {
  if (companies.length === 0) {
    return (
      <section className="no-print rounded-2xl border border-slate-300/85 bg-white p-6 text-center shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#1E3A8A]/10 text-[#1E3A8A]">
          <Building2 className="h-6 w-6" />
        </div>
        <h2 className="mt-3 text-lg font-extrabold text-[#0f172a]">
          এখনও কোনো কোম্পানি যোগ করা হয়নি
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm font-medium text-slate-600">
          প্রতিটি কোম্পানির আলাদা ১-টু-১ (1-to-1) হিসাব রাখতে আগে একটি কোম্পানি যোগ করুন।
        </p>
        {onAddCompany && (
          <button
            type="button"
            onClick={onAddCompany}
            className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#172e6e] whitespace-nowrap"
          >
            <Plus className="h-4 w-4 shrink-0" />
            প্রথম কোম্পানি যোগ করুন
          </button>
        )}
      </section>
    );
  }

  const activeCompany =
    companies.find((c) => c.id === selectedCompanyId) ?? companies[0];
  const isDemoActive = DEMO_COMPANY_IDS.includes(
    activeCompany.id as (typeof DEMO_COMPANY_IDS)[number]
  );

  return (
    <section
      aria-label="১-টু-১ কোম্পানি নির্বাচন ও সারসংক্ষেপ"
      className="rounded-2xl border border-slate-300/85 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] overflow-hidden"
    >
      {/* Top Switcher Row */}
      <div className="no-print flex flex-col gap-3 border-b border-slate-200 bg-[#F8FAFC] px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#1E3A8A] text-white">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-extrabold tracking-wide text-[#1E3A8A]">
                ১-টু-১ কোম্পানি হিসাব{moduleLabel ? ` · ${moduleLabel}` : ''}
              </p>
              <p className="text-[11px] font-semibold text-slate-600">
                শুধু নির্বাচিত কোম্পানির আলাদা হিসাব দেখানো হচ্ছে
              </p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="কোম্পানি সিলেক্ট করুন"
            className="flex flex-nowrap overflow-x-auto no-scrollbar items-center gap-1.5 py-0.5 sm:pl-2"
          >
            {companies.map((c) => {
              const isSelected = c.id === activeCompany.id;
              const isDemo = DEMO_COMPANY_IDS.includes(
                c.id as (typeof DEMO_COMPANY_IDS)[number]
              );
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => onSelectCompanyId(c.id)}
                  className={`inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs sm:text-[13px] font-bold transition-all whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-[#1E3A8A] text-white shadow-xs'
                      : 'border border-slate-300 bg-white text-[#0f172a] hover:border-[#1E3A8A]/40 hover:bg-blue-50/70'
                  }`}
                >
                  <CompanyLogoAvatar
                    name={c.name}
                    logoUrl={c.logoUrl}
                    isDemo={isDemo}
                    className="h-5 w-5 rounded-md"
                    textClassName="text-[10px] font-extrabold"
                  />
                  <span>{c.name}</span>
                  {isDemo && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold leading-none ${
                        isSelected
                          ? 'bg-amber-300 text-amber-950'
                          : 'border border-amber-300 bg-amber-100 text-amber-950'
                      }`}
                    >
                      স্যাম্পল
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isDemoActive && (
            <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-extrabold text-amber-950 whitespace-nowrap">
              স্যাম্পল ডেটা
            </span>
          )}
          {onOpenWorkspace && (
            <button
              type="button"
              onClick={() => onOpenWorkspace(activeCompany.id)}
              className="inline-flex min-h-[38px] sm:min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-[13px] font-bold text-[#1E3A8A] transition-colors hover:border-[#1E3A8A] hover:bg-blue-50/70 whitespace-nowrap shrink-0"
            >
              <span>সেলস শিট খুলুন</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Selected Company TSM & SR Representative Quick Call/Copy Strip */}
      {(activeCompany.tsmPhone ||
        activeCompany.tsmName ||
        (activeCompany.srContacts && activeCompany.srContacts.length > 0) ||
        activeCompany.phone ||
        activeCompany.contactPerson) && (
        <div className="border-b border-slate-200/80 bg-slate-50/55 px-4 py-2 sm:px-5">
          <CompanyRepsStrip company={activeCompany} />
        </div>
      )}

      {/* 5-Tile 1-to-1 Financial Ledger Summary for Active Company */}
      {summary && (
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200/90 bg-white sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-600">
              <Wallet className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
              <span className="truncate">টাকা দেওয়া হয়েছে</span>
            </div>
            <p className="font-mono-tabular mt-1 text-base sm:text-[17px] font-extrabold text-[#0f172a]">
              {formatTaka(summary.totalPaid)}
            </p>
            <p className="text-[11px] font-medium text-slate-600 truncate">
              {activeCompany.name}
            </p>
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-600">
              <Receipt className="h-3.5 w-3.5 text-[#1E3A8A] shrink-0" />
              <span className="truncate">মাল / চালান এসেছে</span>
            </div>
            <p className="font-mono-tabular mt-1 text-base sm:text-[17px] font-extrabold text-[#0f172a]">
              {formatTaka(summary.totalGoods)}
            </p>
            <p className="text-[11px] font-medium text-slate-600">মোট চালান মূল্য</p>
          </div>

          <div
            className={`px-4 py-3 ${
              summary.netLedgerBalance > 0
                ? 'bg-emerald-50/60'
                : summary.netLedgerBalance < 0
                  ? 'bg-rose-50/60'
                  : ''
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-700">
              <span className="truncate">পাওনা / বকেয়া</span>
            </div>
            <p
              className={`font-mono-tabular mt-1 text-base sm:text-[17px] font-extrabold ${
                summary.netLedgerBalance > 0
                  ? 'text-emerald-800'
                  : summary.netLedgerBalance < 0
                    ? 'text-rose-800'
                    : 'text-[#0f172a]'
              }`}
            >
              {summary.netLedgerBalance > 0
                ? `পাব +${formatTaka(summary.receivableFromCompany)}`
                : summary.netLedgerBalance < 0
                  ? `দিতে হবে ${formatTaka(summary.payableToCompany)}`
                  : '৳ ০ (সমান)'}
            </p>
            <p className="text-[11px] font-medium text-slate-600">কোম্পানি লেজার ব্যালেন্স</p>
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-600">
              <TrendingUp className="h-3.5 w-3.5 text-teal-700 shrink-0" />
              <span className="truncate">বিক্রি ও লাভ-লস (মাস)</span>
            </div>
            <p className="font-mono-tabular mt-1 text-base sm:text-[17px] font-extrabold text-[#1E3A8A]">
              {formatTaka(summary.monthSales)}
            </p>
            <p
              className={`font-mono-tabular text-[11px] font-bold ${
                summary.monthProfitLoss >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {summary.monthProfitLoss >= 0
                ? `লাভ +${formatTaka(summary.monthProfitLoss)}`
                : `লস −${formatTaka(Math.abs(summary.monthProfitLoss))}`}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-600">
              <Users className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span className="truncate">কাস্টমার বাকি</span>
            </div>
            <p
              className={`font-mono-tabular mt-1 text-base sm:text-[17px] font-extrabold ${
                summary.customerDueTotal > 0 ? 'text-amber-800' : 'text-teal-800'
              }`}
            >
              {formatTaka(Math.max(0, summary.customerDueTotal))}
            </p>
            <p className="font-mono-tabular text-[11px] font-semibold text-slate-600">
              {formatNumber(summary.dueCustomerCount)}টি দোকানে বাকি
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
