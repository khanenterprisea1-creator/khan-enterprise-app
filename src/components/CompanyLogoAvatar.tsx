import React, { useEffect, useState } from 'react';

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface CompanyLogoPreset {
  id: string;
  label: string;
  url: string;
}

export const COMPANY_LOGO_PRESETS: CompanyLogoPreset[] = [
  {
    id: 'preset_drink',
    label: 'বেভারেজ / জুস',
    url: svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#FFF7ED"/><rect x="6" y="6" width="68" height="68" rx="14" fill="none" stroke="#EA580C" stroke-width="3"/><path d="M30 22h20l-2 36H32z" fill="#F97316"/><path d="M40 14l6 8h-5l-4-8z" fill="#16A34A"/><circle cx="40" cy="40" r="6" fill="#FEF3C7"/></svg>`
    ),
  },
  {
    id: 'preset_food',
    label: 'ফুডস ও বিস্কুট',
    url: svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#FEF2F2"/><rect x="6" y="6" width="68" height="68" rx="14" fill="none" stroke="#DC2626" stroke-width="3"/><rect x="20" y="25" width="40" height="30" rx="8" fill="#EF4444"/><circle cx="32" cy="36" r="3" fill="#FEE2E2"/><circle cx="48" cy="36" r="3" fill="#FEE2E2"/><circle cx="40" cy="45" r="3" fill="#FEE2E2"/></svg>`
    ),
  },
  {
    id: 'preset_consumer',
    label: 'কনজিউমার পণ্য',
    url: svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#EFF6FF"/><rect x="6" y="6" width="68" height="68" rx="14" fill="none" stroke="#1E3A8A" stroke-width="3"/><path d="M22 30l18-10 18 10v22L40 62 22 52z" fill="#1D4ED8"/><path d="M22 30l18 10 18-10" fill="none" stroke="#DBEAFE" stroke-width="3"/><path d="M40 40v22" stroke="#DBEAFE" stroke-width="3"/></svg>`
    ),
  },
  {
    id: 'preset_dairy',
    label: 'ডেইরি ও পানীয়',
    url: svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#F0FDFA"/><rect x="6" y="6" width="68" height="68" rx="14" fill="none" stroke="#0F766E" stroke-width="3"/><path d="M40 18c10 14 15 22 15 30a15 15 0 0 1-30 0c0-8 5-16 15-30z" fill="#0D9488"/><circle cx="35" cy="47" r="4" fill="#CCFBF1"/></svg>`
    ),
  },
  {
    id: 'preset_agency',
    label: 'ডিস্ট্রিবিউশন',
    url: svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#F5F3FF"/><rect x="6" y="6" width="68" height="68" rx="14" fill="none" stroke="#6D28D9" stroke-width="3"/><rect x="18" y="28" width="28" height="22" rx="4" fill="#7C3AED"/><path d="M46 34h12l6 8v8H46z" fill="#A78BFA"/><circle cx="28" cy="54" r="5" fill="#1E1B4B"/><circle cx="54" cy="54" r="5" fill="#1E1B4B"/></svg>`
    ),
  },
];

export function normalizeTelHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
}

interface CompanyLogoAvatarProps {
  name: string;
  logoUrl?: string;
  isDemo?: boolean;
  className?: string;
  textClassName?: string;
}

export const CompanyLogoAvatar: React.FC<CompanyLogoAvatarProps> = ({
  name,
  logoUrl,
  isDemo = false,
  className = 'h-10 w-10 rounded-xl',
  textClassName = 'text-base font-extrabold',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

  const trimmedLogo = logoUrl?.trim();
  const initial = name.trim().charAt(0).toUpperCase() || 'K';

  if (trimmedLogo && !imgError) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white p-0.5 shadow-2xs ${className}`}
      >
        <img
          src={trimmedLogo}
          alt={`${name} লোগো`}
          onError={() => setImgError(true)}
          className="h-full w-full rounded-[inherit] object-contain"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${
        isDemo
          ? 'bg-amber-100 text-amber-950 border border-amber-300/80'
          : 'bg-[#1E3A8A]/10 text-[#1E3A8A] border border-blue-200/80'
      } ${className} ${textClassName}`}
    >
      {initial}
    </span>
  );
};
