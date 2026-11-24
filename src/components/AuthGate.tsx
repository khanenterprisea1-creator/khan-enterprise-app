import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { AuthConfig, AuthSession, Company } from '../types/ledger';
import { hashPassword, verifyPassword } from '../utils/auth';
import { BrandLogo } from './BrandLogo';

interface AuthGateProps {
  companies: Company[];
  authConfig: AuthConfig;
  onSetInitialAdminPassword: (adminPasswordHash: string) => void;
  onAuthenticated: (session: AuthSession) => void;
  onBackToHome?: () => void;
}

type LoginTab = 'admin' | 'company';

export const AuthGate: React.FC<AuthGateProps> = ({
  companies,
  authConfig,
  onSetInitialAdminPassword,
  onAuthenticated,
  onBackToHome,
}) => {
  const isFirstSetup = !authConfig.adminPasswordHash;

  const [tab, setTab] = useState<LoginTab>('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companyPassword, setCompanyPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const companiesWithPassword = useMemo(() => {
    return companies.filter((c) => Boolean(authConfig.companyPasswordHashes[c.id]));
  }, [companies, authConfig.companyPasswordHashes]);

  useEffect(() => {
    if (
      companiesWithPassword.length > 0 &&
      !companiesWithPassword.some((c) => c.id === selectedCompanyId)
    ) {
      setSelectedCompanyId(companiesWithPassword[0].id);
    }
  }, [companiesWithPassword, selectedCompanyId]);

  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword.length < 4) {
      setError('পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।');
      return;
    }
    if (adminPassword !== confirmPassword) {
      setError('দুটি পাসওয়ার্ড এক হয়নি। আবার লিখুন।');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const hash = await hashPassword(adminPassword);
      onSetInitialAdminPassword(hash);
      onAuthenticated({ role: 'admin' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword) {
      setError('অ্যাডমিন পাসওয়ার্ড লিখুন।');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const ok = await verifyPassword(adminPassword, authConfig.adminPasswordHash);
      if (!ok) {
        setError('ভুল অ্যাডমিন পাসওয়ার্ড। আবার চেষ্টা করুন।');
        return;
      }
      onAuthenticated({ role: 'admin' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompanyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) {
      setError('অনুগ্রহ করে একটি কোম্পানি সিলেক্ট করুন।');
      return;
    }
    if (!companyPassword) {
      setError('কোম্পানির পাসওয়ার্ড লিখুন।');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const expectedHash = authConfig.companyPasswordHashes[selectedCompanyId];
      const ok = await verifyPassword(companyPassword, expectedHash);
      if (!ok) {
        setError('ভুল কোম্পানি পাসওয়ার্ড। আবার চেষ্টা করুন।');
        return;
      }
      onAuthenticated({ role: 'company', companyId: selectedCompanyId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7fa] px-4 py-10 text-[#0f172a]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/85 bg-white p-7 shadow-[0_14px_40px_-12px_rgba(15,41,66,0.12)] sm:p-8">
        {onBackToHome && (
          <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200/90 bg-blue-50/70 px-3.5 py-2 text-sm font-bold text-[#1E3A8A] transition-colors hover:border-blue-300 hover:bg-blue-100 whitespace-nowrap"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              পরিচিতি পেজে ফিরে যান
            </button>
          </div>
        )}
        {/* Brand Header */}
        <div className="text-center">
          <BrandLogo variant="full" className="mx-auto mb-3.5 h-24 w-24" />
          <p className="text-sm font-extrabold tracking-wide text-[#1E3A8A]">
            Khan Enterprise · ডিস্ট্রিবিউশন এজেন্সি
          </p>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#0f172a]">
            {isFirstSetup ? 'অ্যাডমিন পাসওয়ার্ড সেট করুন' : 'পাসওয়ার্ড দিয়ে প্রবেশ করুন'}
          </h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-[#1e293b]">
            {isFirstSetup
              ? 'প্রথমবার প্রবেশের জন্য আপনার অ্যাডমিন পাসওয়ার্ড তৈরি করুন। পরবর্তীতে ভেতর থেকে প্রতিটি কোম্পানির জন্য আলাদা S.R পাসওয়ার্ড সেট করতে পারবেন।'
              : 'সব হিসাব যোগ, পরিবর্তন ও পরিচালনার জন্য অ্যাডমিন পাসওয়ার্ড ব্যবহার করুন। কোম্পানি / S.R পাসওয়ার্ড দিয়ে ডাউনলোড ও স্ক্রিনশট ছাড়া শুধুমাত্র ওই কোম্পানির হিসাব দেখা যাবে।'}
          </p>
        </div>

        {isFirstSetup ? (
          <form onSubmit={handleSetupAdmin} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="setup-admin-pass"
                className="mb-1.5 block text-sm font-bold text-[#0f172a]"
              >
                নতুন অ্যাডমিন পাসওয়ার্ড <span className="text-rose-700">*</span>
              </label>
              <div className="relative">
                <input
                  id="setup-admin-pass"
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="কমপক্ষে ৪ অক্ষর"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 hover:text-[#0f172a]"
                  aria-label={showPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="setup-admin-confirm"
                className="mb-1.5 block text-sm font-bold text-[#0f172a]"
              >
                পাসওয়ার্ড নিশ্চিত করুন <span className="text-rose-700">*</span>
              </label>
              <input
                id="setup-admin-confirm"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="পুনরায় পাসওয়ার্ড লিখুন"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>

            {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              অ্যাডমিন পাসওয়ার্ড সেভ ও প্রবেশ করুন
            </button>
          </form>
        ) : (
          <div className="mt-6">
            {/* Role Switch Tabs */}
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setTab('admin');
                  setError('');
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                  tab === 'admin'
                    ? 'bg-white text-[#0f172a] shadow-xs'
                    : 'text-[#1e293b] hover:text-[#0f172a]'
                }`}
              >
                <KeyRound className="h-4 w-4" />
                অ্যাডমিন লগইন
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('company');
                  setError('');
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                  tab === 'company'
                    ? 'bg-white text-[#0f172a] shadow-xs'
                    : 'text-[#1e293b] hover:text-[#0f172a]'
                }`}
              >
                <Building2 className="h-4 w-4" />
                কোম্পানি / S.R লগইন
              </button>
            </div>

            {tab === 'admin' ? (
              <form onSubmit={handleAdminLogin} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="login-admin-pass"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    অ্যাডমিন পাসওয়ার্ড
                  </label>
                  <div className="relative">
                    <input
                      id="login-admin-pass"
                      type={showPassword ? 'text' : 'password'}
                      autoFocus
                      value={adminPassword}
                      onChange={(e) => {
                        setAdminPassword(e.target.value);
                        if (error) setError('');
                      }}
                      placeholder="আপনার অ্যাডমিন পাসওয়ার্ড লিখুন"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 hover:text-[#0f172a]"
                      aria-label={showPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
                >
                  <Lock className="h-4 w-4" />
                  অ্যাডমিন হিসেবে প্রবেশ করুন
                </button>
              </form>
            ) : companiesWithPassword.length === 0 ? (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-medium leading-relaxed text-[#1e293b]">
                এখনও কোনো কোম্পানির আলাদা পাসওয়ার্ড সেট করা হয়নি। অ্যাডমিন হিসেবে লগইন করে প্রতিটি কোম্পানির জন্য আলাদা পাসওয়ার্ড সেট করতে পারবেন।
              </div>
            ) : (
              <form onSubmit={handleCompanyLogin} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="login-company-select"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    কোম্পানি সিলেক্ট করুন
                  </label>
                  <select
                    id="login-company-select"
                    value={selectedCompanyId}
                    onChange={(e) => {
                      setSelectedCompanyId(e.target.value);
                      if (error) setError('');
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  >
                    {companiesWithPassword.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="login-company-pass"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    কোম্পানির পাসওয়ার্ড
                  </label>
                  <div className="relative">
                    <input
                      id="login-company-pass"
                      type={showPassword ? 'text' : 'password'}
                      value={companyPassword}
                      onChange={(e) => {
                        setCompanyPassword(e.target.value);
                        if (error) setError('');
                      }}
                      placeholder="কোম্পানির আলাদা পাসওয়ার্ড লিখুন"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 hover:text-[#0f172a]"
                      aria-label={showPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && <p className="text-sm font-semibold text-rose-700">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" />
                  কোম্পানি খাতায় প্রবেশ করুন
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
