import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { Product } from '../types/ledger';

interface ProductModalProps {
  isOpen: boolean;
  companyName: string;
  initialProduct?: Product | null;
  onClose: () => void;
  onSave: (payload: { name: string; unit: string; rate: number; minStock?: number }) => void;
}

const QUICK_UNITS = ['কার্টন', 'পিস', 'বক্স', 'ডজন'] as const;
const COMMON_UNITS = ['কার্টন', 'পিস', 'বক্স', 'ডজন', 'কেস', 'প্যাকেট', 'কেজি', 'লিটার'];

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function normalizeAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  companyName,
  initialProduct,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('কার্টন');
  const [rate, setRate] = useState('');
  const [minStock, setMinStock] = useState('');
  const [error, setError] = useState('');
  const [addedNotice, setAddedNotice] = useState<string>('');
  const [sessionAddedCount, setSessionAddedCount] = useState<number>(0);

  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialProduct?.name ?? '');
      setUnit(initialProduct?.unit ?? 'কার্টন');
      setRate(initialProduct ? String(initialProduct.rate) : '');
      setMinStock(
        initialProduct?.minStock !== undefined ? String(initialProduct.minStock) : ''
      );
      setError('');
      setAddedNotice('');
      setSessionAddedCount(0);
      window.setTimeout(() => {
        nameInputRef.current?.focus();
      }, 30);
    }
  }, [isOpen, initialProduct]);

  if (!isOpen) return null;

  const validateAndBuildPayload = (): {
    name: string;
    unit: string;
    rate: number;
    minStock?: number;
  } | null => {
    const trimmedName = name.trim();
    const trimmedUnit = unit.trim() || 'পিস';
    const normalizedRate = normalizeAsciiDigits(rate).trim();
    const numericRate = normalizedRate === '' ? NaN : Number(normalizedRate);
    const trimmedMinStock = normalizeAsciiDigits(minStock).trim();
    const parsedMinStock = trimmedMinStock === '' ? undefined : Number(trimmedMinStock);

    if (!trimmedName) {
      setError('প্রোডাক্টের নাম লিখুন।');
      nameInputRef.current?.focus();
      return null;
    }
    if (!Number.isFinite(numericRate) || numericRate < 0) {
      setError('সঠিক রেট (৳) লিখুন।');
      return null;
    }
    if (parsedMinStock !== undefined && (!Number.isFinite(parsedMinStock) || parsedMinStock < 0)) {
      setError('সর্বনিম্ন স্টক সীমা ০ বা তার বেশি হতে হবে।');
      return null;
    }

    return {
      name: trimmedName,
      unit: trimmedUnit,
      rate: Number(numericRate.toFixed(2)),
      minStock:
        parsedMinStock !== undefined ? Number(parsedMinStock.toFixed(2)) : undefined,
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = validateAndBuildPayload();
    if (!payload) return;
    onSave(payload);
    onClose();
  };

  const handleSaveAndAddAnother = () => {
    const payload = validateAndBuildPayload();
    if (!payload) return;
    onSave(payload);
    setSessionAddedCount((c) => c + 1);
    setAddedNotice(`‘${payload.name}’ (${payload.unit}) সেভ হয়েছে — পরেরটি লিখুন`);
    setName('');
    setRate('');
    setMinStock('');
    setError('');
    window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 20);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200/85 bg-white shadow-[0_20px_50px_-12px_rgba(15,41,66,0.22)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="product-modal-title" className="text-xl font-bold text-[#0f172a]">
                {initialProduct ? 'প্রোডাক্ট ও রেট পরিবর্তন' : 'নতুন প্রোডাক্ট যোগ করুন'}
              </h2>
              {!initialProduct && sessionAddedCount > 0 && (
                <span className="font-mono-tabular rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
                  +{sessionAddedCount}টি সেভড
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm font-semibold text-[#1e293b]">{companyName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#1e293b] transition-colors hover:bg-slate-100 hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            aria-label="বন্ধ করুন"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {addedNotice && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-sm font-bold text-emerald-900"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>{addedNotice}</span>
            </div>
          )}

          <div>
            <label htmlFor="product-name" className="mb-1.5 block text-sm font-bold text-[#0f172a]">
              প্রোডাক্টের নাম <span className="text-rose-700">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="product-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
                if (addedNotice) setAddedNotice('');
              }}
              placeholder="যেমন: ম্যাঙ্গো জুস ২৫০ মিলি"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="product-rate" className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                প্রতি ইউনিট রেট (৳) <span className="text-rose-700">*</span>
              </label>
              <input
                id="product-rate"
                type="text"
                inputMode="decimal"
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  if (error) setError('');
                }}
                placeholder="0"
                className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-bold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>

            <div>
              <label htmlFor="product-unit" className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                ইউনিট (দ্রুত সিলেক্ট / লিখুন)
              </label>
              <input
                id="product-unit"
                type="text"
                list="common-units-list"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="কার্টন"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
              <datalist id="common-units-list">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          {/* 1-Click Quick Unit Selector */}
          <div>
            <span className="mb-1.5 block text-xs font-bold text-slate-700">
              দ্রুত ইউনিট সিলেকশন:
            </span>
            <div className="grid grid-cols-4 gap-2" role="group" aria-label="দ্রুত ইউনিট সিলেকশন">
              {QUICK_UNITS.map((quickUnit) => {
                const isSelected = unit.trim() === quickUnit;
                return (
                  <button
                    key={quickUnit}
                    type="button"
                    onClick={() => {
                      setUnit(quickUnit);
                      if (error) setError('');
                    }}
                    className={`rounded-lg border px-2.5 py-2 text-sm transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'border-teal-700 bg-teal-50 font-extrabold text-teal-900 shadow-xs ring-1 ring-teal-700/20'
                        : 'border-slate-300 bg-white font-semibold text-[#0f172a] hover:border-teal-500 hover:bg-teal-50/40'
                    }`}
                  >
                    {quickUnit}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="product-min-stock" className="mb-1.5 block text-sm font-bold text-[#0f172a]">
              সর্বনিম্ন স্টক সতর্কতা সীমা (ঐচ্ছিক)
            </label>
            <input
              id="product-min-stock"
              type="text"
              inputMode="decimal"
              value={minStock}
              onChange={(e) => {
                setMinStock(e.target.value);
                if (error) setError('');
              }}
              placeholder="যেমন: 5 (সমান বা নিচে নামলে সতর্কতা দেখাবে)"
              className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              {sessionAddedCount > 0 ? 'সম্পন্ন (বন্ধ করুন)' : 'বাতিল'}
            </button>
            {!initialProduct && (
              <button
                type="button"
                onClick={handleSaveAndAddAnother}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-900 transition-colors hover:bg-teal-100 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
              >
                <Plus className="h-4 w-4 shrink-0" />
                Save & Add Another
              </button>
            )}
            <button
              type="submit"
              className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-800 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              {initialProduct ? 'রেট সেভ করুন' : 'প্রোডাক্ট যোগ করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
