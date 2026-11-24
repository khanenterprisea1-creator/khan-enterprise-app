import React from 'react';
import { formatDateBn, getTodayISO } from '../utils/storage';
import { BrandLogo } from './BrandLogo';

interface PrintLetterheadProps {
  reportTitle: string;
  reportDate: string;
  subtitle?: string;
}

export const PrintLetterhead: React.FC<PrintLetterheadProps> = ({
  reportTitle,
  reportDate,
  subtitle,
}) => {
  const printedOn = formatDateBn(getTodayISO(), true);

  return (
    <header className="hidden print:block mb-5">
      <div className="flex items-start justify-between gap-4 pb-3.5 border-b-2 border-[#0f2942]">
        <div className="flex items-center gap-3.5">
          <BrandLogo className="h-14 w-14" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-teal-800">
              অফিশিয়াল ব্যবসায়িক রিপোর্ট
            </p>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#0f172a]">
              Khan Enterprise
            </h1>
            <p className="mt-0.5 text-xs font-semibold text-[#1e293b]">
              ডিস্ট্রিবিউশন অ্যান্ড সেলস এজেন্সি
              {subtitle ? ` · ${subtitle}` : ''}
            </p>
          </div>
        </div>

        <div className="shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-right">
          <p className="text-xs font-bold text-[#0f172a]">{reportTitle}</p>
          <p className="font-mono-tabular mt-0.5 text-xs font-semibold text-[#1e293b]">
            সময়কাল / তারিখ: {reportDate}
          </p>
          <p className="font-mono-tabular mt-0.5 text-[11px] font-medium text-[#1e293b]">
            প্রিন্ট তারিখ: {printedOn}
          </p>
        </div>
      </div>
      <div className="mt-[2px] h-[2px] w-full bg-teal-700" />
    </header>
  );
};

export const PrintSignatureFooter: React.FC = () => {
  const printedOn = formatDateBn(getTodayISO(), true);

  return (
    <footer className="hidden print:block mt-10 pt-6 border-t border-slate-300 print-avoid-break">
      <div className="grid grid-cols-3 gap-8 pt-6 text-center text-xs text-[#0f172a]">
        <div>
          <div className="mx-auto mb-1.5 w-36 border-t border-slate-600" />
          <p className="font-bold text-[#0f172a]">প্রস্তুতকারীর স্বাক্ষর</p>
          <p className="text-[11px] font-medium text-[#1e293b]">অফিস / এন্ট্রি অপারেটর</p>
        </div>
        <div>
          <div className="mx-auto mb-1.5 w-36 border-t border-slate-600" />
          <p className="font-bold text-[#0f172a]">হিসাবরক্ষক</p>
          <p className="text-[11px] font-medium text-[#1e293b]">যাচাই ও হিসাব বিভাগ</p>
        </div>
        <div>
          <div className="mx-auto mb-1.5 w-36 border-t border-slate-600" />
          <p className="font-bold text-[#0f172a]">অনুমোদিত স্বাক্ষর</p>
          <p className="text-[11px] font-medium text-[#1e293b]">প্রোপ্রাইটর · Khan Enterprise</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-300 pt-2 text-[11px] font-medium text-[#1e293b]">
        <span>Khan Enterprise · ডিস্ট্রিবিউশন ম্যানেজমেন্ট ও সেলস লেজার</span>
        <span className="font-mono-tabular">প্রিন্ট তারিখ: {printedOn}</span>
      </div>
    </footer>
  );
};
