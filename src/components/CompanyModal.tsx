import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  Phone,
  Plus,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Company, CompanyRepContact } from '../types/ledger';
import { compressImageFileToDataUrl, generateId } from '../utils/storage';
import { COMPANY_LOGO_PRESETS, CompanyLogoAvatar } from './CompanyLogoAvatar';

export interface CompanySavePayload {
  name: string;
  code?: string;
  contactPerson?: string;
  phone?: string;
  logoUrl?: string;
  tsmName?: string;
  tsmPhone?: string;
  srContacts?: CompanyRepContact[];
  password?: string;
  clearPassword?: boolean;
}

interface CompanyModalProps {
  isOpen: boolean;
  initialCompany?: Company | null;
  hasExistingPassword?: boolean;
  onClose: () => void;
  onSave: (payload: CompanySavePayload) => void;
}

export const CompanyModal: React.FC<CompanyModalProps> = ({
  isOpen,
  initialCompany,
  hasExistingPassword = false,
  onClose,
  onSave,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [tsmName, setTsmName] = useState('');
  const [tsmPhone, setTsmPhone] = useState('');
  const [srContacts, setSrContacts] = useState<CompanyRepContact[]>([]);

  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialCompany?.name ?? '');
      setCode(initialCompany?.code ?? '');
      setLogoUrl(initialCompany?.logoUrl ?? '');
      setIsUploadingLogo(false);
      setTsmName(initialCompany?.tsmName ?? '');
      setTsmPhone(initialCompany?.tsmPhone ?? '');

      if (initialCompany?.srContacts && initialCompany.srContacts.length > 0) {
        setSrContacts(
          initialCompany.srContacts.map((sr) => ({
            id: sr.id || generateId('sr'),
            name: sr.name || '',
            phone: sr.phone || '',
            role: 'SR',
          }))
        );
      } else if (initialCompany?.contactPerson || initialCompany?.phone) {
        setSrContacts([
          {
            id: generateId('sr'),
            name: initialCompany.contactPerson ?? '',
            phone: initialCompany.phone ?? '',
            role: 'SR',
          },
        ]);
      } else {
        setSrContacts([{ id: generateId('sr'), name: '', phone: '', role: 'SR' }]);
      }

      setPassword('');
      setClearPassword(false);
      setShowPassword(false);
      setError('');
    }
  }, [isOpen, initialCompany]);

  if (!isOpen) return null;

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setIsUploadingLogo(true);
    try {
      const compressed = await compressImageFileToDataUrl(file, 320, 0.84);
      setLogoUrl(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'লোগো ফাইল পড়া যায়নি।');
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleAddSrRow = () => {
    setSrContacts((prev) => [
      ...prev,
      { id: generateId('sr'), name: '', phone: '', role: 'SR' },
    ]);
  };

  const handleUpdateSrRow = (id: string, field: 'name' | 'phone', val: string) => {
    setSrContacts((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: val } : row))
    );
  };

  const handleRemoveSrRow = (id: string) => {
    setSrContacts((prev) => prev.filter((row) => row.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('অনুগ্রহ করে কোম্পানির নাম লিখুন।');
      return;
    }
    const trimmedPass = password.trim();
    if (trimmedPass.length > 0 && trimmedPass.length < 4) {
      setError('কোম্পানির পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।');
      return;
    }

    const cleanedSrContacts: CompanyRepContact[] = srContacts
      .map((sr) => ({
        id: sr.id || generateId('sr'),
        name: sr.name.trim(),
        phone: sr.phone.trim(),
        role: 'SR' as const,
      }))
      .filter((sr) => sr.name !== '' || sr.phone !== '');

    const cleanTsmName = tsmName.trim() || undefined;
    const cleanTsmPhone = tsmPhone.trim() || undefined;
    const primarySr = cleanedSrContacts[0];

    onSave({
      name: trimmed,
      code: code.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
      tsmName: cleanTsmName,
      tsmPhone: cleanTsmPhone,
      srContacts: cleanedSrContacts,
      contactPerson: primarySr?.name || cleanTsmName || undefined,
      phone: primarySr?.phone || cleanTsmPhone || undefined,
      password: trimmedPass || undefined,
      clearPassword: clearPassword && !trimmedPass,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="company-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_50px_-12px_rgba(15,41,66,0.25)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="company-modal-title" className="text-lg sm:text-xl font-bold text-[#0f172a]">
            {initialCompany ? 'কোম্পানি, লোগো ও প্রতিনিধি তথ্য' : 'নতুন কোম্পানি যোগ করুন'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#1e293b] transition-colors hover:bg-slate-100 hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            aria-label="বন্ধ করুন"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto space-y-5 px-5 py-5">
          {/* Company Name */}
          <div>
            <label htmlFor="company-name" className="mb-1.5 block text-sm font-bold text-[#0f172a]">
              কোম্পানির নাম <span className="text-rose-700">*</span>
            </label>
            <input
              id="company-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="যেমন: প্রাণ [চেয়ার আপ ], স্কয়ার কনজিউমার..."
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[16px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          {/* Company Code Number */}
          <div>
            <label htmlFor="company-code" className="mb-1.5 block text-sm font-bold text-[#0f172a]">
              কোড নম্বর <span className="font-medium text-slate-500">(ঐচ্ছিক)</span>
            </label>
            <input
              id="company-code"
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError('');
              }}
              placeholder="যেমন: PRN-01, 101..."
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[16px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          {/* Company Logo Upload / URL / Presets */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-[#0f172a]">
                কোম্পানির লোগো (ঐচ্ছিক)
              </span>
              {logoUrl.trim() && (
                <button
                  type="button"
                  onClick={() => setLogoUrl('')}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  লোগো রিমুভ
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <CompanyLogoAvatar
                name={name || 'K'}
                logoUrl={logoUrl}
                className="h-16 w-16 rounded-2xl"
                textClassName="text-2xl font-extrabold"
              />

              <div className="flex-1 space-y-2 min-w-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => void handleLogoFileUpload(e)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isUploadingLogo}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-teal-700/35 bg-white px-3 text-xs sm:text-sm font-bold text-teal-900 hover:bg-teal-50 disabled:opacity-50"
                  >
                    <ImagePlus className="h-4 w-4 text-teal-700" />
                    {isUploadingLogo ? 'আপলোড হচ্ছে...' : 'ছবি ফাইল আপলোড'}
                  </button>
                </div>
                <input
                  type="url"
                  inputMode="url"
                  value={logoUrl.startsWith('data:') ? '' : logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="অথবা লোগোর ইমেজ লিংক (https://...) পেস্ট করুন"
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[16px] text-[#0f172a] placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>

            {/* 1-Click Preset Icons */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-600">
                দ্রুত প্রিসেট লোগো বেছে নিন:
              </span>
              <div className="flex flex-nowrap overflow-x-auto no-scrollbar items-center gap-1.5 pb-0.5">
                {COMPANY_LOGO_PRESETS.map((preset) => {
                  const selected = logoUrl === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setLogoUrl(preset.url)}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                        selected
                          ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={preset.label}
                        className="h-6 w-6 rounded-md object-contain"
                      />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TSM Contact */}
          <div className="rounded-xl border border-blue-200/80 bg-blue-50/45 p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-sm font-extrabold text-[#1E3A8A]">
              <UserCheck className="h-4 w-4" />
              TSM তথ্য (ট্যারিটরি সেলস ম্যানেজার)
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label htmlFor="company-tsm-name" className="mb-1 block text-xs font-bold text-slate-700">
                  TSM-এর নাম
                </label>
                <input
                  id="company-tsm-name"
                  type="text"
                  value={tsmName}
                  onChange={(e) => setTsmName(e.target.value)}
                  placeholder="যেমন: মো. করিম"
                  className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[16px] font-medium text-[#0f172a] placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="company-tsm-phone" className="mb-1 block text-xs font-bold text-slate-700">
                  TSM মোবাইল নম্বর
                </label>
                <input
                  id="company-tsm-phone"
                  type="tel"
                  inputMode="tel"
                  value={tsmPhone}
                  onChange={(e) => setTsmPhone(e.target.value)}
                  placeholder="017XXXXXXXX"
                  className="font-mono-tabular w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[16px] font-medium text-[#0f172a] placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Multiple SR Contacts */}
          <div className="rounded-xl border border-teal-200/80 bg-teal-50/35 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-teal-900">
                <Users className="h-4 w-4 text-teal-700" />
                SR তালিকা (একাধিক SR যোগ করুন)
              </span>
              <button
                type="button"
                onClick={handleAddSrRow}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-teal-700/35 bg-white px-2.5 text-xs font-extrabold text-teal-900 hover:bg-teal-50 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                আরও SR যোগ
              </button>
            </div>

            {srContacts.length === 0 ? (
              <p className="text-xs font-medium text-slate-600">
                কোনো SR যোগ করা হয়নি — উপরের "আরও SR যোগ" বাটনে চাপুন।
              </p>
            ) : (
              <div className="space-y-2">
                {srContacts.map((sr, idx) => (
                  <div
                    key={sr.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 rounded-xl border border-slate-200 bg-white p-2.5"
                  >
                    <input
                      type="text"
                      value={sr.name}
                      onChange={(e) => handleUpdateSrRow(sr.id, 'name', e.target.value)}
                      placeholder={`SR ${idx + 1} নাম`}
                      aria-label={`SR ${idx + 1} নাম`}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[16px] font-medium text-[#0f172a] placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                    />
                    <div className="relative flex items-center">
                      <Phone className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="tel"
                        inputMode="tel"
                        value={sr.phone}
                        onChange={(e) => handleUpdateSrRow(sr.id, 'phone', e.target.value)}
                        placeholder="01XXXXXXXXX"
                        aria-label={`SR ${idx + 1} নম্বর`}
                        className="font-mono-tabular w-full min-h-[42px] rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-[16px] font-medium text-[#0f172a] placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSrRow(sr.id)}
                      aria-label="SR মুছুন"
                      className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Separate Company Password */}
          <div className="border-t border-slate-200 pt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor="company-password"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0f172a]"
              >
                <KeyRound className="h-4 w-4 text-teal-700" />
                কোম্পানির আলাদা পাসওয়ার্ড (ঐচ্ছিক)
              </label>
              {initialCompany && hasExistingPassword && !clearPassword && (
                <button
                  type="button"
                  onClick={() => {
                    setClearPassword(true);
                    setPassword('');
                  }}
                  className="text-xs font-bold text-rose-700 hover:underline"
                >
                  পাসওয়ার্ড সরান
                </button>
              )}
            </div>

            <div className="relative">
              <input
                id="company-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (clearPassword) setClearPassword(false);
                  if (error) setError('');
                }}
                placeholder={
                  clearPassword
                    ? 'সেভ করলে পাসওয়ার্ড মুছে যাবে'
                    : initialCompany && hasExistingPassword
                      ? 'নতুন পাসওয়ার্ড দিলে আপডেট হবে (ফাঁকা রাখলে আগেরটি থাকবে)'
                      : 'কমপক্ষে ৪ অক্ষর (কোম্পানি লগইনের জন্য)'
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-[16px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-600 hover:text-[#0f172a]"
                aria-label="পাসওয়ার্ড দেখুন বা লুকান"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              বাতিল
            </button>
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-teal-700 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-800 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              {initialCompany ? 'আপডেট করুন' : 'কোম্পানি যোগ করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
