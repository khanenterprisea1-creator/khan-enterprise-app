import React, { useState } from 'react';
import { Check, Copy, Phone } from 'lucide-react';
import { Company } from '../types/ledger';
import { normalizeTelHref } from './CompanyLogoAvatar';

interface CompanyRepsStripProps {
  company: Company;
  compact?: boolean;
  onStopPropagation?: boolean;
}

export const CompanyRepsStrip: React.FC<CompanyRepsStripProps> = ({
  company,
  compact = false,
  onStopPropagation = false,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const hasTsm = Boolean(company.tsmName?.trim() || company.tsmPhone?.trim());
  const srList =
    company.srContacts && company.srContacts.length > 0
      ? company.srContacts.filter((sr) => sr.name.trim() || sr.phone.trim())
      : company.contactPerson?.trim() || company.phone?.trim()
        ? [
            {
              id: 'legacy_sr',
              name: company.contactPerson?.trim() || 'SR',
              phone: company.phone?.trim() || '',
              role: 'SR' as const,
            },
          ]
        : [];

  if (!hasTsm && srList.length === 0) return null;

  const handleCopy = async (e: React.MouseEvent, key: string, value: string) => {
    if (onStopPropagation) e.stopPropagation();
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      setCopiedId(key);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${
        compact ? 'text-[11px]' : 'text-xs sm:text-[13px]'
      }`}
    >
      {hasTsm && (
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-blue-200 bg-blue-50/75 px-2 py-1 text-[#1E3A8A]">
          <span className="font-extrabold">TSM:</span>
          {company.tsmName && <span className="font-bold text-[#0f172a]">{company.tsmName}</span>}
          {company.tsmPhone && (
            <>
              <span className="font-mono-tabular font-bold text-[#1E3A8A]">
                {company.tsmPhone}
              </span>
              {normalizeTelHref(company.tsmPhone) && (
                <a
                  href={normalizeTelHref(company.tsmPhone)}
                  onClick={(e) => {
                    if (onStopPropagation) e.stopPropagation();
                  }}
                  title="TSM-কে কল করুন"
                  className="no-print inline-flex items-center gap-0.5 rounded bg-[#1E3A8A] px-1.5 py-0.5 text-[10.5px] font-extrabold text-white hover:bg-[#172e6e]"
                >
                  <Phone className="h-2.5 w-2.5" />
                  কল
                </a>
              )}
              <button
                type="button"
                onClick={(e) => void handleCopy(e, 'tsm', company.tsmPhone || '')}
                title="TSM নম্বর কপি করুন"
                className="no-print inline-flex items-center gap-0.5 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-[#1E3A8A] hover:bg-blue-100"
              >
                {copiedId === 'tsm' ? (
                  <Check className="h-2.5 w-2.5 text-emerald-600" />
                ) : (
                  <Copy className="h-2.5 w-2.5" />
                )}
              </button>
            </>
          )}
        </div>
      )}

      {(compact ? srList.slice(0, 2) : srList).map((sr, idx) => (
        <div
          key={sr.id || idx}
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-teal-200 bg-teal-50/75 px-2 py-1 text-teal-950"
        >
          <span className="font-extrabold text-teal-800">
            SR{srList.length > 1 ? ` ${idx + 1}` : ''}:
          </span>
          {sr.name && <span className="font-bold text-[#0f172a]">{sr.name}</span>}
          {sr.phone && (
            <>
              <span className="font-mono-tabular font-bold text-teal-900">{sr.phone}</span>
              {normalizeTelHref(sr.phone) && (
                <a
                  href={normalizeTelHref(sr.phone)}
                  onClick={(e) => {
                    if (onStopPropagation) e.stopPropagation();
                  }}
                  title="SR-কে কল করুন"
                  className="no-print inline-flex items-center gap-0.5 rounded bg-teal-700 px-1.5 py-0.5 text-[10.5px] font-extrabold text-white hover:bg-teal-800"
                >
                  <Phone className="h-2.5 w-2.5" />
                  কল
                </a>
              )}
              <button
                type="button"
                onClick={(e) => void handleCopy(e, `sr_${sr.id || idx}`, sr.phone)}
                title="SR নম্বর কপি করুন"
                className="no-print inline-flex items-center gap-0.5 rounded border border-teal-300 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-teal-900 hover:bg-teal-100"
              >
                {copiedId === `sr_${sr.id || idx}` ? (
                  <Check className="h-2.5 w-2.5 text-emerald-600" />
                ) : (
                  <Copy className="h-2.5 w-2.5" />
                )}
              </button>
            </>
          )}
        </div>
      ))}

      {compact && srList.length > 2 && (
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
          +{srList.length - 2} আরও SR
        </span>
      )}
    </div>
  );
};
