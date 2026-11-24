import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  Award,
  Building2,
  CalendarCheck2,
  Camera,
  Handshake,
  LayoutDashboard,
  Lock,
  RotateCcw,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { PARTNER_COMPANIES, PartnerBrandMark } from './PartnerLogos';
import { ScrollToTopButton } from './ScrollToTopButton';

const DEFAULT_FOUNDER_PHOTO = '/assets/aistudio/abba_picture_a80cdf72.png';
const FOUNDER_PHOTO_STORAGE_KEY = 'khan_enterprise_owner_photo_v2';

function loadCustomFounderPhoto(): string | null {
  try {
    return localStorage.getItem(FOUNDER_PHOTO_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface ProfilePageProps {
  isAuthenticated?: boolean;
  onEnterApp: () => void;
}

const MILESTONE_METRICS = [
  {
    id: 'founded',
    value: '২০০৫',
    label: 'ব্যবসার যাত্রা শুরু',
    Icon: CalendarCheck2,
    iconBg: 'bg-blue-50 text-[#1E3A8A] border-blue-100',
    valueClass: 'text-[#1E3A8A]',
  },
  {
    id: 'experience',
    value: '২০+ বছর',
    label: 'বাজার অভিজ্ঞতা',
    Icon: Award,
    iconBg: 'bg-slate-100 text-[#0f172a] border-slate-200',
    valueClass: 'text-[#0f172a]',
  },
  {
    id: 'brands',
    value: '৯+ ব্র্যান্ড',
    label: 'শীর্ষ কোম্পানি পার্টনার',
    Icon: Building2,
    iconBg: 'bg-teal-50 text-teal-800 border-teal-100',
    valueClass: 'text-teal-800',
  },
  {
    id: 'delivery',
    value: 'প্রতিদিন',
    label: 'নিয়মিত বাজার ডেলিভারি',
    Icon: Truck,
    iconBg: 'bg-amber-50 text-amber-800 border-amber-100',
    valueClass: 'text-[#0f172a]',
  },
] as const;

const CORE_PILLARS = [
  {
    number: '০১',
    title: 'শতভাগ আসল ও মানসম্মত পণ্য',
    description:
      'সরাসরি কোম্পানির কাছ থেকে সংগ্রহ করা তাজা ও মেয়াদোত্তীর্ণ-মুক্ত পণ্য প্রতিটি দোকানে সরবরাহ করা হয়।',
    Icon: ShieldCheck,
    iconBoxClass: 'bg-blue-50 text-[#1E3A8A] border-blue-200/70',
  },
  {
    number: '০২',
    title: 'দ্রুত ও নিয়মিত ডেলিভারি',
    description:
      'রুট অনুযায়ী প্রতিদিন নিয়মিত মার্কেট ডিসপ্যাচ ও অর্ডার সরবরাহ যাতে দোকানে পণ্যের কোনো সংকট না হয়।',
    Icon: Truck,
    iconBoxClass: 'bg-teal-50 text-teal-800 border-teal-200/70',
  },
  {
    number: '০৩',
    title: 'স্বচ্ছ হিসাব ও সুসম্পর্ক',
    description:
      'দৈনিক চালান, নগদ ও বাকি আদায়ের পরিষ্কার হিসাবের মাধ্যমে দোকানদার ও কোম্পানির সাথে দীর্ঘস্থায়ী সম্পর্ক।',
    Icon: Handshake,
    iconBoxClass: 'bg-amber-50 text-amber-800 border-amber-200/70',
  },
] as const;

export const ProfilePage: React.FC<ProfilePageProps> = ({
  isAuthenticated = false,
  onEnterApp,
}) => {
  const [customPhoto, setCustomPhoto] = useState<string | null>(() => loadCustomFounderPhoto());
  const [portraitFailed, setPortraitFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePortraitSrc = customPhoto || DEFAULT_FOUNDER_PHOTO;

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      if (!dataUrl) return;
      try {
        localStorage.setItem(FOUNDER_PHOTO_STORAGE_KEY, dataUrl);
      } catch {
        // ignore storage quota errors
      }
      setPortraitFailed(false);
      setCustomPhoto(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleResetPhoto = () => {
    try {
      localStorage.removeItem(FOUNDER_PHOTO_STORAGE_KEY);
    } catch {
      // ignore
    }
    setPortraitFailed(false);
    setCustomPhoto(null);
  };

  return (
    <div id="profile-top" className="min-h-screen bg-[#f4f7fa] text-[#0f172a]">
      {/* Clean 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-[0_1px_14px_-6px_rgba(15,41,66,0.08)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 sm:gap-8 px-3.5 py-3 sm:px-6">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#founder-profile"
            className="flex min-w-0 items-center gap-2.5 sm:gap-3 whitespace-nowrap rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]"
          >
            <BrandLogo className="h-9 w-9 sm:h-11 sm:w-11 shrink-0" />
            <span className="truncate text-[18px] sm:text-[22px] font-extrabold tracking-tight text-[#1E3A8A]">
              Khan Enterprise
            </span>
          </a>

          {/* Zone 2: Concise Navigation Links */}
          <nav
            aria-label="প্রাথমিক নেভিগেশন"
            className="hidden md:flex items-center gap-8 text-[15px] font-bold text-[#1e293b]"
          >
            <a
              href="#founder-profile"
              className="hover:text-[#1E3A8A] hover:underline decoration-2 underline-offset-8 transition-colors whitespace-nowrap shrink-0"
            >
              প্রতিষ্ঠাতা
            </a>
            <a
              href="#business-journey"
              className="hover:text-[#1E3A8A] hover:underline decoration-2 underline-offset-8 transition-colors whitespace-nowrap shrink-0"
            >
              ব্যবসার কথা
            </a>
            <a
              href="#partner-companies"
              className="hover:text-[#1E3A8A] hover:underline decoration-2 underline-offset-8 transition-colors whitespace-nowrap shrink-0"
            >
              পার্টনার কোম্পানি
            </a>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onEnterApp}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white shadow-xs transition-all duration-150 hover:bg-[#172e6e] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:ring-offset-2"
            >
              {isAuthenticated ? (
                <LayoutDashboard className="h-4 w-4 shrink-0" />
              ) : (
                <Lock className="h-4 w-4 shrink-0" />
              )}
              {isAuthenticated ? 'ড্যাশবোর্ডে ফিরুন' : 'লগইন করুন'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 space-y-14">
        {/* Section 1: Founder Image + 2005 Milestone + 3 Core Business Pillars */}
        <section
          id="founder-profile"
          className="scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 lg:p-10 shadow-[0_6px_28px_-10px_rgba(15,41,66,0.08)]"
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
            {/* Founder Image Frame */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <div className="relative h-full min-h-[410px] sm:min-h-[470px] overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-100 ring-1 ring-inset ring-black/5 shadow-[0_14px_34px_-14px_rgba(15,41,66,0.2)]">
                {!portraitFailed ? (
                  <img
                    src={activePortraitSrc}
                    alt="Khan Enterprise-এর প্রতিষ্ঠাতা ও কর্ণধার"
                    referrerPolicy="no-referrer"
                    onError={() => setPortraitFailed(true)}
                    className="h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="flex h-full min-h-[410px] flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-6 text-center">
                    <User className="h-16 w-16 text-[#1E3A8A]" />
                    <p className="mt-3 text-base font-bold text-[#0f172a]">
                      প্রতিষ্ঠাতা ও কর্ণধার
                    </p>
                    <p className="text-sm font-semibold text-slate-600">Khan Enterprise</p>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent px-5 pb-5 pt-16 text-white">
                  <p className="text-xs font-bold tracking-wide text-blue-200">
                    প্রতিষ্ঠাতা ও কর্ণধার
                  </p>
                  <p className="mt-0.5 text-xl font-extrabold tracking-tight text-white">
                    Khan Enterprise
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-200">
                    প্রতিষ্ঠিত ২০০৫ · বিশ্বস্ত ডিস্ট্রিবিউশন নেতৃত্ব
                  </p>
                </div>
              </div>

              {isAuthenticated && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#0f172a] transition-colors hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Camera className="h-3.5 w-3.5 text-[#1E3A8A]" />
                    প্রতিষ্ঠাতার ছবি পরিবর্তন করুন
                  </button>
                  {customPhoto && (
                    <button
                      type="button"
                      onClick={handleResetPhoto}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      রিসেট
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Introduction Headline, CTAs & 2005 Milestone Cards */}
            <div className="lg:col-span-7 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-teal-800">
                  <span>প্রতিষ্ঠিত ২০০৫</span>
                  <span aria-hidden="true">·</span>
                  <span>ডিস্ট্রিবিউশন ও সেলস এজেন্সি</span>
                </div>

                <h1 className="text-[clamp(1.85rem,3.4vw,2.9rem)] font-extrabold leading-[1.2] tracking-tight text-[#0f172a] text-balance">
                  ২০০৫ সাল থেকে বিশ্বস্ততা ও সততার সাথে পণ্য পরিবেশন
                </h1>

                <p className="max-w-[65ch] text-base sm:text-[17px] font-medium leading-[1.7] text-[#1e293b]">
                  দীর্ঘ দুই দশকের বেশি সময় ধরে Khan Enterprise দেশের খ্যাতনামা খাদ্য, পানীয় ও নিত্যপ্রয়োজনীয় পণ্যের কোম্পানিগুলোর সাথে সুনামের সাথে পরিবেশক (ডিস্ট্রিবিউটর) হিসেবে কাজ করে আসছে।
                </p>

                <div className="flex flex-wrap items-center gap-3.5 pt-2">
                  <button
                    type="button"
                    onClick={onEnterApp}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A8A] px-5 py-3 text-[15px] font-bold text-white shadow-xs transition-all duration-150 hover:bg-[#172e6e] whitespace-nowrap shrink-0"
                  >
                    <span>
                      {isAuthenticated ? 'ড্যাশবোর্ডে প্রবেশ করুন' : 'হিসাব ও সেলস খাতায় প্রবেশ'}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </button>
                  <a
                    href="#partner-companies"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] font-bold text-[#0f172a] transition-colors hover:border-blue-300 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <Building2 className="h-4 w-4 text-teal-700 shrink-0" />
                    পার্টনার কোম্পানি সমূহ
                  </a>
                </div>
              </div>

              {/* 4-Card 2005 Milestone Strip with Clean Icons */}
              <div className="grid grid-cols-2 gap-3.5 border-t border-slate-200 pt-6 sm:grid-cols-4">
                {MILESTONE_METRICS.map(({ id, value, label, Icon, iconBg, valueClass }) => (
                  <div
                    key={id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-[#f8fafc] p-4 transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-[0_8px_20px_-8px_rgba(15,41,66,0.12)]"
                  >
                    <div
                      className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg border ${iconBg}`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className={`font-mono-tabular text-xl sm:text-2xl font-extrabold ${valueClass}`}>
                        {value}
                      </p>
                      <p className="mt-1 text-xs sm:text-[13px] font-semibold leading-snug text-[#1e293b]">
                        {label}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bengali Business Description & 3 Core Business Pillars */}
          <div id="business-journey" className="scroll-mt-24 mt-10 border-t border-slate-200 pt-8">
            <div className="max-w-4xl space-y-4">
              <p className="text-sm font-bold text-teal-800">
                দীর্ঘ পথচলা · ২০০৫ থেকে বর্তমান
              </p>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0f172a] text-balance">
                আমাদের ব্যবসা ও ২০০৫ থেকে দীর্ঘ পথচলার গল্প
              </h2>
              <p className="text-[15.5px] sm:text-base font-medium leading-[1.75] text-[#0f172a]">
                আমরা ২০০৫ সাল থেকে অত্যন্ত নিষ্ঠা, সততা এবং পরিশ্রমের সাথে এই ডিস্ট্রিবিউশন ব্যবসা পরিচালনা করে আসছি। শুরুর দিন থেকেই আমাদের মূল বিশ্বাস ছিল—সঠিক দামে শতভাগ আসল ও মানসম্মত পণ্য স্থানীয় বাজারের প্রতিটি খুচরা ও পাইকারি দোকানে সময়মতো পৌঁছে দেওয়া।
              </p>
              <p className="text-[15.5px] sm:text-base font-medium leading-[1.75] text-[#1e293b]">
                বছরের পর বছর ধরে আমাদের দক্ষ সেলস রিপ্রেজেন্টেটিভ (S.R), ডেলিভারি টিম এবং নিজস্ব গুদাম ব্যবস্থাপনার মাধ্যমে আমরা ক্রেতা ও উৎপাদনকারী কোম্পানির মধ্যে একটি মজবুত আস্থার সেতু তৈরি করেছি। প্রতিটি পণ্যের নির্ভুল স্টক, স্বচ্ছ ক্যাশ ও বাকি লেনদেন এবং দ্রুত সেবা প্রদানই Khan Enterprise-এর সাফল্যের মূল ভিত্তি।
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
              {CORE_PILLARS.map(({ number, title, description, Icon, iconBoxClass }) => (
                <article
                  key={number}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-[#f8fafc] p-6 transition-[transform,box-shadow,border-color,background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-[0_12px_28px_-12px_rgba(15,41,66,0.14)]"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl border ${iconBoxClass}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="font-mono-tabular text-sm font-extrabold text-slate-400">
                        {number}
                      </span>
                    </div>
                    <h3 className="mt-4 text-[17px] font-extrabold leading-snug text-[#0f172a]">
                      {title}
                    </h3>
                    <p className="mt-2 text-[15px] font-medium leading-relaxed text-[#1e293b]">
                      {description}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Section 2: Partner Companies Showcase Grid */}
        <section id="partner-companies" className="scroll-mt-24 space-y-6">
          <div className="flex flex-col gap-3 border-b border-slate-200/85 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[#1E3A8A]">
                বিশ্বস্ত ডিস্ট্রিবিউশন পার্টনারশিপ
              </p>
              <h2 className="mt-1 text-2xl sm:text-[30px] font-extrabold tracking-tight text-[#0f172a] text-balance">
                আমরা যেসব কোম্পানির সাথে কাজ করি
              </h2>
            </div>
            <p className="max-w-md text-[15px] font-medium leading-relaxed text-[#1e293b]">
              দেশের জনপ্রিয় ও প্রতিষ্ঠিত খাদ্য, পানীয় এবং ভোগ্যপণ্য উৎপাদনকারী প্রতিষ্ঠানগুলোর পণ্য আমাদের মাধ্যমে নিয়মিত পরিবেশিত হচ্ছে।
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PARTNER_COMPANIES.map((partner) => (
              <article
                key={partner.id}
                className="group flex h-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1.5 hover:border-[#1E3A8A]/25 hover:shadow-[0_18px_38px_-14px_rgba(30,58,138,0.18)]"
              >
                <div className="space-y-4">
                  <PartnerBrandMark partner={partner} />
                  <div>
                    <h3 className="text-[18px] font-extrabold tracking-tight text-[#0f172a] transition-colors group-hover:text-[#1E3A8A]">
                      {partner.banglaName}
                    </h3>
                    <p className="mt-0.5 text-[13.5px] font-bold text-teal-800">
                      {partner.category}
                    </p>
                  </div>
                </div>
                <p className="mt-4 border-t border-slate-100 pt-3.5 text-[15px] font-medium leading-relaxed text-[#1e293b]">
                  {partner.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Workspace Entry Strip */}
        <section className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-gradient-to-br from-[#0f2942] via-[#173663] to-[#1E3A8A] px-6 py-7 text-white shadow-[0_14px_36px_-14px_rgba(15,41,66,0.35)] sm:flex-row sm:items-center sm:px-8 sm:py-8">
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              দৈনিক সেলস, স্টক ও হিসাব পরিচালনা করতে চান?
            </h2>
            <p className="text-[15px] font-medium text-blue-100">
              অ্যাডমিন অথবা কোম্পানি S.R পাসওয়ার্ড দিয়ে আপনার ডিস্ট্রিবিউশন ড্যাশবোর্ডে প্রবেশ করুন।
            </p>
          </div>
          <button
            type="button"
            onClick={onEnterApp}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[15px] font-extrabold text-[#1E3A8A] shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:bg-blue-50 whitespace-nowrap shrink-0"
          >
            {isAuthenticated ? (
              <LayoutDashboard className="h-4 w-4 shrink-0" />
            ) : (
              <Lock className="h-4 w-4 shrink-0" />
            )}
            {isAuthenticated ? 'ড্যাশবোর্ডে যান' : 'লগইন পেজে যান'}
          </button>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm font-semibold text-[#1e293b] sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="h-8 w-8" />
            <span>Khan Enterprise · ডিস্ট্রিবিউশন ও সেলস এজেন্সি (প্রতিষ্ঠিত ২০০৫)</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#0f172a] transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-[#1E3A8A] whitespace-nowrap"
            >
              <ArrowUp className="h-3.5 w-3.5 shrink-0" />
              উপরে যান
            </button>
            <button
              type="button"
              onClick={onEnterApp}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#EFF6FF] px-3.5 py-1.5 text-sm font-bold text-[#1E3A8A] transition-colors hover:bg-blue-100 whitespace-nowrap"
            >
              {isAuthenticated ? 'অ্যাকাউন্ট ড্যাশবোর্ড →' : 'অ্যাডমিন / S.R লগইন →'}
            </button>
          </div>
        </div>
      </footer>

      <ScrollToTopButton />
    </div>
  );
};
