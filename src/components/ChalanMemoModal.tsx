import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  Download,
  MessageCircle,
  Printer,
  Share2,
  X,
} from 'lucide-react';
import { formatDateBn, formatTaka } from '../utils/storage';
import { BrandLogo } from './BrandLogo';

export interface ChalanMemoData {
  docKind: 'customer_memo' | 'customer_statement' | 'company_chalan';
  docNumber: string;
  title: string;
  badgeText: string;
  badgeTone: 'teal' | 'emerald' | 'amber' | 'navy';
  date: string;
  partyLabel: string;
  partyName: string;
  partySubline?: string;
  partyPhone?: string;
  partyAddress?: string;
  description: string;
  note?: string;
  primaryAmountLabel: string;
  primaryAmount: number;
  secondaryStats?: Array<{
    label: string;
    value: string;
    highlight?: 'amber' | 'emerald' | 'rose' | 'default';
  }>;
  attachmentDataUrl?: string;
  attachmentLabel?: string;
}

interface ChalanMemoModalProps {
  memo: ChalanMemoData | null;
  onClose: () => void;
}

function normalizeWhatsAppPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('01') && digits.length === 11) return `88${digits}`;
  if (digits.startsWith('1') && digits.length === 10) return `880${digits}`;
  return digits;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

async function generateReceiptPngDataUrl(memo: ChalanMemoData): Promise<string> {
  const width = 840;
  const statsCount = memo.secondaryStats?.length ?? 0;
  const noteLinesCount = memo.note ? 2 : 0;
  const height = 610 + Math.ceil(statsCount / 2) * 76 + noteLinesCount * 28;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Background & Border
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // Top Header Band
  ctx.fillStyle = '#0f2942';
  ctx.fillRect(20, 20, width - 40, 118);

  // Load logo safely if available
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Logo load failed'));
      img.src = '/assets/aistudio/khan_enterprise_logo_f0d21ac0.png';
    });
    ctx.fillStyle = '#faf9f7';
    ctx.fillRect(44, 38, 82, 82);
    ctx.drawImage(img, 295, 160, 1010, 1010, 44, 38, 82, 82);
  } catch {
    // Fallback monogram badge
    ctx.fillStyle = '#0f766e';
    ctx.fillRect(44, 38, 82, 82);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px "Hind Siliguri", sans-serif';
    ctx.fillText('KE', 64, 90);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px "Hind Siliguri", sans-serif';
  ctx.fillText('Khan Enterprise', 146, 72);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 18px "Hind Siliguri", sans-serif';
  ctx.fillText(memo.title, 146, 104);

  // Right side Receipt Meta
  ctx.textAlign = 'right';
  ctx.fillStyle = '#5eead4';
  ctx.font = 'bold 17px "Hind Siliguri", sans-serif';
  ctx.fillText(memo.docNumber, width - 46, 68);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 17px "Hind Siliguri", sans-serif';
  ctx.fillText(`তারিখ: ${formatDateBn(memo.date)}`, width - 46, 102);
  ctx.textAlign = 'left';

  // Badge + Party Box
  let y = 164;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(44, y, width - 88, 126);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(44, y, width - 88, 126);

  ctx.fillStyle = '#0f766e';
  ctx.font = 'bold 16px "Hind Siliguri", sans-serif';
  ctx.fillText(`${memo.partyLabel} · ${memo.badgeText}`, 64, y + 32);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 25px "Hind Siliguri", sans-serif';
  ctx.fillText(memo.partyName, 64, y + 66);

  const subParts = [memo.partySubline, memo.partyPhone, memo.partyAddress].filter(Boolean);
  if (subParts.length > 0) {
    ctx.fillStyle = '#334155';
    ctx.font = '600 17px "Hind Siliguri", sans-serif';
    ctx.fillText(subParts.join(' · '), 64, y + 100);
  }

  y += 150;

  // Main Particulars Box
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(44, y, width - 88, 140);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(44, y, width - 88, 140);

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 16px "Hind Siliguri", sans-serif';
  ctx.fillText('বিবরণ / মেমো তথ্য', 64, y + 34);
  ctx.textAlign = 'right';
  ctx.fillText(memo.primaryAmountLabel, width - 64, y + 34);
  ctx.textAlign = 'left';

  ctx.beginPath();
  ctx.moveTo(64, y + 48);
  ctx.lineTo(width - 64, y + 48);
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '600 20px "Hind Siliguri", sans-serif';
  const descLines = wrapCanvasText(ctx, memo.description || '—', 440).slice(0, 2);
  descLines.forEach((line, idx) => {
    ctx.fillText(line, 64, y + 84 + idx * 28);
  });

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f2942';
  ctx.font = 'bold 30px "Hind Siliguri", sans-serif';
  ctx.fillText(formatTaka(memo.primaryAmount), width - 64, y + 96);
  ctx.textAlign = 'left';

  y += 160;

  // Secondary Stats Grid
  if (memo.secondaryStats && memo.secondaryStats.length > 0) {
    const colWidth = (width - 104) / 2;
    memo.secondaryStats.forEach((st, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = 44 + col * (colWidth + 16);
      const by = y + row * 74;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(bx, by, colWidth, 62);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(bx, by, colWidth, 62);

      ctx.fillStyle = '#475569';
      ctx.font = 'bold 15px "Hind Siliguri", sans-serif';
      ctx.fillText(st.label, bx + 16, by + 24);

      ctx.fillStyle =
        st.highlight === 'amber'
          ? '#b45309'
          : st.highlight === 'emerald'
            ? '#047857'
            : st.highlight === 'rose'
              ? '#be123c'
              : '#0f172a';
      ctx.font = 'bold 20px "Hind Siliguri", sans-serif';
      ctx.fillText(st.value, bx + 16, by + 50);
    });
    y += Math.ceil(memo.secondaryStats.length / 2) * 74 + 8;
  }

  // Note
  if (memo.note) {
    ctx.fillStyle = '#fffbeb';
    ctx.fillRect(44, y, width - 88, 54);
    ctx.strokeStyle = '#fde68a';
    ctx.strokeRect(44, y, width - 88, 54);
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 17px "Hind Siliguri", sans-serif';
    ctx.fillText(`নোট: ${memo.note}`, 64, y + 34);
    y += 70;
  }

  // Signature Footer
  const sigY = height - 62;
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(64, sigY - 26);
  ctx.lineTo(250, sigY - 26);
  ctx.moveTo(width - 260, sigY - 26);
  ctx.lineTo(width - 64, sigY - 26);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 15px "Hind Siliguri", sans-serif';
  ctx.fillText('ক্রেতা / প্রতিনিধির স্বাক্ষর', 64, sigY);
  ctx.textAlign = 'right';
  ctx.fillText('Khan Enterprise · কর্তৃপক্ষ', width - 64, sigY);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

export const ChalanMemoModal: React.FC<ChalanMemoModalProps> = ({ memo, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [isDownloadingPng, setIsDownloadingPng] = useState(false);

  useEffect(() => {
    if (!memo) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [memo, onClose]);

  useEffect(() => {
    const cleanup = () => document.body.classList.remove('printing-receipt-only');
    window.addEventListener('afterprint', cleanup);
    return () => {
      window.removeEventListener('afterprint', cleanup);
      cleanup();
    };
  }, []);

  const shareText = useMemo(() => {
    if (!memo) return '';
    const lines: string[] = [
      `*Khan Enterprise*`,
      `${memo.title} (${memo.docNumber})`,
      `তারিখ: ${formatDateBn(memo.date)}`,
      `${memo.partyLabel}: ${memo.partyName}${memo.partySubline ? ` (${memo.partySubline})` : ''}`,
      memo.partyPhone ? `মোবাইল: ${memo.partyPhone}` : '',
      `ধরন: ${memo.badgeText}`,
      `বিবরণ: ${memo.description}`,
      `${memo.primaryAmountLabel}: ${formatTaka(memo.primaryAmount)}`,
    ].filter(Boolean);

    if (memo.secondaryStats && memo.secondaryStats.length > 0) {
      for (const st of memo.secondaryStats) {
        lines.push(`${st.label}: ${st.value}`);
      }
    }
    if (memo.note) {
      lines.push(`নোট: ${memo.note}`);
    }
    return lines.join('\n');
  }, [memo]);

  if (!memo) return null;

  const badgeStyles: Record<ChalanMemoData['badgeTone'], string> = {
    teal: 'border-teal-300 bg-teal-50 text-teal-900',
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-300 bg-amber-50 text-amber-900',
    navy: 'border-slate-300 bg-slate-100 text-[#0f2942]',
  };

  const handlePrintReceipt = () => {
    document.body.classList.add('printing-receipt-only');
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        document.body.classList.remove('printing-receipt-only');
      }, 1200);
    }, 60);
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
    }
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPng = async () => {
    setIsDownloadingPng(true);
    try {
      const dataUrl = await generateReceiptPngDataUrl(memo);
      const link = document.createElement('a');
      link.href = dataUrl;
      const safeDoc = memo.docNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `Khan_Enterprise_${safeDoc}_${memo.date}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsDownloadingPng(false);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Khan Enterprise — ${memo.title}`,
          text: shareText,
        });
      } catch {
        // User cancelled native share
      }
    }
  };

  const waDigits = normalizeWhatsAppPhone(memo.partyPhone);
  const waHref = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(shareText)}`
    : `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return createPortal(
    <div
      id="receipt-print-root"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={memo.title}
      onClick={onClose}
    >
      <div
        className="receipt-modal-chrome flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-14px_rgba(15,41,66,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Action Bar (Hidden in Print) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintReceipt}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f2942] px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#173a5c] whitespace-nowrap"
            >
              <Printer className="h-4 w-4" />
              প্রিন্ট করুন
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isDownloadingPng}
              className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700 bg-teal-700 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              {isDownloadingPng ? 'তৈরি হচ্ছে...' : 'রশিদ ছবি (PNG)'}
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-100 whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-700" />
                  <span className="text-emerald-800">কপি হয়েছে</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  টেক্সট কপি
                </>
              )}
            </button>

            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900 transition-colors hover:bg-emerald-100 whitespace-nowrap"
            >
              <MessageCircle className="h-4 w-4 text-emerald-700" />
              WhatsApp শেয়ার
            </a>

            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-100 whitespace-nowrap"
              >
                <Share2 className="h-4 w-4" />
                শেয়ার
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-200 hover:text-[#0f172a]"
            aria-label="বন্ধ করুন"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Printable Official Khan Enterprise Chalan / Memo Sheet */}
        <div className="flex-1 overflow-y-auto bg-white p-6 sm:p-8">
          <div className="rounded-xl border-2 border-slate-300 p-5 sm:p-6">
            {/* Official Header */}
            <div className="flex flex-col gap-4 border-b-2 border-[#0f2942] pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <BrandLogo className="h-14 w-14" />
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-[#0f2942]">
                    Khan Enterprise
                  </h1>
                  <p className="text-sm font-bold text-teal-800">{memo.title}</p>
                </div>
              </div>

              <div className="sm:text-right">
                <p className="font-mono-tabular text-sm font-extrabold text-[#0f2942]">
                  {memo.docNumber}
                </p>
                <p className="font-mono-tabular mt-0.5 text-sm font-semibold text-[#1e293b]">
                  তারিখ: {formatDateBn(memo.date, true)}
                </p>
              </div>
            </div>

            {/* Party Details Box */}
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/90 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#1e293b]">
                  {memo.partyLabel}
                </p>
                <p className="mt-0.5 text-lg font-extrabold text-[#0f172a]">
                  {memo.partyName}
                </p>
                {(memo.partySubline || memo.partyPhone || memo.partyAddress) && (
                  <p className="mt-0.5 text-sm font-semibold text-[#1e293b]">
                    {[memo.partySubline, memo.partyPhone, memo.partyAddress]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>

              <span
                className={`inline-flex self-start rounded-lg border px-3 py-1 text-xs font-extrabold whitespace-nowrap ${badgeStyles[memo.badgeTone]}`}
              >
                {memo.badgeText}
              </span>
            </div>

            {/* Transaction Line Table */}
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-300">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                    <th className="px-4 py-2.5">বিবরণ / মেমো ও পণ্যের তথ্য</th>
                    <th className="px-4 py-2.5 text-right whitespace-nowrap">
                      {memo.primaryAmountLabel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-4 font-semibold text-[#0f172a]">
                      {memo.description || '—'}
                    </td>
                    <td className="font-mono-tabular px-4 py-4 text-right text-xl font-extrabold text-[#0f2942] whitespace-nowrap">
                      {formatTaka(memo.primaryAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Balance / Summary Stats */}
            {memo.secondaryStats && memo.secondaryStats.length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {memo.secondaryStats.map((st) => {
                  const valClass =
                    st.highlight === 'amber'
                      ? 'text-amber-800'
                      : st.highlight === 'emerald'
                        ? 'text-emerald-800'
                        : st.highlight === 'rose'
                          ? 'text-rose-800'
                          : 'text-[#0f172a]';
                  return (
                    <div
                      key={st.label}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5"
                    >
                      <p className="text-xs font-bold text-[#1e293b]">{st.label}</p>
                      <p className={`font-mono-tabular mt-0.5 text-base font-extrabold ${valClass}`}>
                        {st.value}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {memo.note && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/75 px-4 py-2.5 text-sm font-semibold text-[#0f172a]">
                নোট: {memo.note}
              </div>
            )}

            {memo.attachmentDataUrl && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-bold text-[#1e293b]">
                  {memo.attachmentLabel ?? 'সংযুক্ত কপি / ছবি'}
                </p>
                <img
                  src={memo.attachmentDataUrl}
                  alt={memo.attachmentLabel ?? 'সংযুক্ত ছবি'}
                  className="mx-auto max-h-64 rounded-lg border border-slate-200 bg-white object-contain"
                />
              </div>
            )}

            {/* Official Signature Block */}
            <div className="mt-10 flex items-end justify-between gap-8 pt-4 text-xs font-bold text-[#1e293b]">
              <div className="w-44 border-t border-slate-400 pt-1.5 text-center">
                ক্রেতা / প্রতিনিধির স্বাক্ষর
              </div>
              <div className="w-48 border-t border-slate-400 pt-1.5 text-center">
                Khan Enterprise · কর্তৃপক্ষ
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
