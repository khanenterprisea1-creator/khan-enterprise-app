import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, LogIn } from 'lucide-react';
import { supabase } from '../utils/supabase';
import type { CloudSyncStatus } from '../utils/storage';
import { BrandLogo } from './BrandLogo';

/**
 * Small banner shown above the workspace when the ledger is not synced to
 * the cloud (offline, or cloud not configured). Renders nothing when synced.
 */
export const CloudSyncBanner: React.FC<{ status: CloudSyncStatus }> = ({ status }) => {
  if (status === 'offline') {
    return (
      <div className="no-print bg-amber-100 px-4 py-2 text-center text-[13px] font-bold text-amber-900">
        অফলাইন — ক্লাউডে সংযোগ নেই। এই ডিভাইসের ক্যাশ করা হিসাব দেখানো হচ্ছে; নতুন
        পরিবর্তন শুধু এই ডিভাইসেই থাকবে।
      </div>
    );
  }
  if (status === 'not-configured') {
    return (
      <div className="no-print bg-amber-100 px-4 py-2 text-center text-[13px] font-bold text-amber-900">
        ক্লাউড সিঙ্ক বন্ধ আছে — হিসাব শুধু এই ডিভাইসে থাকছে, অন্য ডিভাইসে দেখা যাবে না।
      </div>
    );
  }
  return null;
};

/**
 * Cloud sign-in (Supabase Auth) — the FIRST gate, shown before the existing
 * in-app admin / company password screens. The owner signs in once with the
 * Supabase account (email + password); after that the usual AuthGate flow
 * continues unchanged. All ledger data then syncs across devices.
 */
export const CloudSignIn: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('ইমেইল ও পাসওয়ার্ড দুটোই লিখুন।');
      return;
    }
    if (!supabase) {
      setError('ক্লাউড সেটআপ সম্পূর্ণ হয়নি। Supabase-এর তথ্য যুক্ত করুন।');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        if (/invalid login credentials/i.test(signInError.message)) {
          setError('ভুল ইমেইল বা পাসওয়ার্ড। আবার চেষ্টা করুন।');
        } else {
          setError(`লগইন হয়নি: ${signInError.message}`);
        }
        return;
      }
      // Success: App listens to onAuthStateChange and continues automatically.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7fa] px-4 py-10 text-[#0f172a]">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/85 bg-white p-7 shadow-[0_14px_40px_-12px_rgba(15,41,66,0.12)] sm:p-8">
        <div className="text-center">
          <BrandLogo variant="full" className="mx-auto mb-3.5 h-24 w-24" />
          <p className="text-sm font-extrabold tracking-wide text-[#1E3A8A]">
            Khan Enterprise · ডিস্ট্রিবিউশন এজেন্সি
          </p>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#0f172a]">
            ক্লাউড লগইন
          </h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-[#1e293b]">
            সব ডিভাইসে একই হিসাব দেখতে প্রথমে আপনার ক্লাউড অ্যাকাউন্টে লগইন করুন। এরপর
            আগের মতো অ্যাডমিন / কোম্পানি পাসওয়ার্ড দিয়ে খাতায় প্রবেশ করবেন।
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="cloud-email"
              className="mb-1.5 block text-sm font-bold text-[#0f172a]"
            >
              ইমেইল
            </label>
            <input
              id="cloud-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              placeholder="আপনার ইমেইল লিখুন"
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <div>
            <label
              htmlFor="cloud-password"
              className="mb-1.5 block text-sm font-bold text-[#0f172a]"
            >
              পাসওয়ার্ড
            </label>
            <div className="relative">
              <input
                id="cloud-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="আপনার ক্লাউড পাসওয়ার্ড লিখুন"
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
            <LogIn className="h-4 w-4" />
            ক্লাউডে লগইন করুন
          </button>
        </form>

        <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center text-[13px] font-medium leading-relaxed text-[#1e293b]">
          অ্যাকাউন্ট এখনও তৈরি হয়নি? Supabase Dashboard → Authentication → Users থেকে
          owner অ্যাকাউন্ট (ইমেইল + পাসওয়ার্ড) তৈরি করুন, তারপর এখানে লগইন করুন।
        </p>
      </div>
    </div>
  );
};

/**
 * Shown when the Supabase keys are missing (not configured yet). The app does
 * not crash — it explains the setup and lets the owner continue offline with
 * this device's local data until cloud sync is configured.
 */
export const CloudSetupNotice: React.FC<{ onContinueOffline: () => void }> = ({
  onContinueOffline,
}) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7fa] px-4 py-10 text-[#0f172a]">
      <div className="w-full max-w-md rounded-2xl border border-amber-300/80 bg-white p-7 shadow-[0_14px_40px_-12px_rgba(15,41,66,0.12)] sm:p-8">
        <div className="text-center">
          <BrandLogo variant="full" className="mx-auto mb-3.5 h-24 w-24" />
          <p className="text-sm font-extrabold tracking-wide text-[#1E3A8A]">
            Khan Enterprise · ডিস্ট্রিবিউশন এজেন্সি
          </p>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#0f172a]">
            ক্লাউড সেটআপ বাকি আছে
          </h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-[#1e293b]">
            এই অ্যাপের ক্লাউড সিঙ্ক (Supabase) এখনও কনফিগার করা হয়নি। সেটআপ শেষ না
            হওয়া পর্যন্ত হিসাব শুধু এই ডিভাইসেই থাকবে — অন্য ডিভাইসে দেখা যাবে না।
          </p>
        </div>

        <div className="mt-6 space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-medium leading-relaxed text-[#1e293b]">
          <p className="font-bold text-[#0f172a]">সেটআপের ধাপ:</p>
          <p>১. Supabase-এ প্রজেক্ট তৈরি করুন।</p>
          <p>২. SQL Editor-এ supabase/001_ledger_state.sql চালান।</p>
          <p>৩. Authentication → Users থেকে owner অ্যাকাউন্ট তৈরি করুন।</p>
          <p>৪. Render Dashboard-এ VITE_SUPABASE_URL ও VITE_SUPABASE_ANON_KEY সেট করুন।</p>
        </div>

        <button
          type="button"
          onClick={onContinueOffline}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-teal-800"
        >
          <KeyRound className="h-4 w-4" />
          আপাতত অফলাইনে চালিয়ে যান
        </button>
      </div>
    </div>
  );
};
