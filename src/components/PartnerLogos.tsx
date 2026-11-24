import React, { useState } from 'react';

export interface PartnerCompanyInfo {
  id: string;
  englishName: string;
  banglaName: string;
  category: string;
  description: string;
  logoSrc: string;
  stageWidthPx: number;
  stageHeightPx: number;
  centerXPercent: number;
  centerYPercent: number;
  clipPath?: string;
}

export const PARTNER_COMPANIES: PartnerCompanyInfo[] = [
  {
    id: 'pran',
    englishName: 'PRAN',
    banglaName: 'প্রাণ (PRAN)',
    category: 'খাদ্য, পানীয় ও কনজিউমার পণ্য',
    description:
      'বাংলাদেশের শীর্ষস্থানীয় খাদ্য ও বেভারেজ ব্র্যান্ড — জুস, ড্রিংকস, নুডলস, মসলা ও কনফেকশনারি পণ্য পরিবেশন।',
    logoSrc: '/assets/aistudio/image_1edc996c.png',
    stageWidthPx: 98,
    stageHeightPx: 66,
    centerXPercent: 49.3,
    centerYPercent: 49.3,
  },
  {
    id: 'globe',
    englishName: 'Globe',
    banglaName: 'গ্লোব (Globe)',
    category: 'বিস্কুট, জুস ও বেভারেজ',
    description: 'জনপ্রিয় বিস্কুট, ড্রিংকস ও স্বাস্থ্যসম্মত বেকারি খাদ্যপণ্য সরবরাহ।',
    logoSrc: '/assets/aistudio/image_ddca7032.png',
    stageWidthPx: 128,
    stageHeightPx: 128,
    centerXPercent: 50.0,
    centerYPercent: 49.8,
  },
  {
    id: 'haque',
    englishName: 'Haque',
    banglaName: 'হক (Haque)',
    category: 'বিস্কুট, চিপস ও কনফেকশনারি',
    description: 'ঐতিহ্যবাহী বিস্কুট, ওয়েফার, চিপস ও ব্যাটারি ডিস্ট্রিবিউশন।',
    logoSrc: '/assets/aistudio/image_17c0ff0b.png',
    stageWidthPx: 108,
    stageHeightPx: 108,
    centerXPercent: 49.8,
    centerYPercent: 49.8,
  },
  {
    id: 'aci',
    englishName: 'ACI Limited',
    banglaName: 'এসিআই (ACI Limited)',
    category: 'কনজিউমার ও নিত্যপ্রয়োজনীয় পণ্য',
    description: 'লবণ, আটা-ময়দা, মসলা ও গৃহস্থালি কনজিউমার ব্র্যান্ড সরবরাহ।',
    logoSrc: '/assets/aistudio/image_f3c4f221.png',
    stageWidthPx: 164,
    stageHeightPx: 128,
    centerXPercent: 50.1,
    centerYPercent: 49.7,
    clipPath: 'inset(21% 16% 21% 16%)',
  },
  {
    id: 'keya',
    englishName: 'Keya',
    banglaName: 'কেয়া (Keya)',
    category: 'কসমেটিকস ও গৃহস্থালি পণ্য',
    description: 'সাবান, ডিটারজেন্ট, প্রসাধনী ও নিত্যব্যবহার্য কনজিউমার পণ্য।',
    logoSrc: '/assets/aistudio/image_15af14d2.png',
    stageWidthPx: 118,
    stageHeightPx: 118,
    centerXPercent: 49.3,
    centerYPercent: 45.7,
  },
  {
    id: 'meridian',
    englishName: 'Meridian Foods',
    banglaName: 'মেরিডিয়ান ফুডস (Meridian Foods)',
    category: 'চিপস ও স্ন্যাকস আইটেম',
    description: 'জনপ্রিয় চিপস, স্ন্যাকস ও প্যাকেটজাত ফুড প্রোডাক্ট সরবরাহ।',
    logoSrc: '/assets/aistudio/image_ff26022d.png',
    stageWidthPx: 238,
    stageHeightPx: 238,
    centerXPercent: 49.6,
    centerYPercent: 49.9,
    clipPath: 'inset(35% 15% 35% 15%)',
  },
  {
    id: 'thai_food',
    englishName: 'Thai Food',
    banglaName: 'থাই ফুড (Thai Food)',
    category: 'ফুড ও স্ন্যাকস আইটেম',
    description: 'মানসম্মত চিপস, স্ন্যাকস ও প্যাকেটজাত খাদ্য সামগ্রী ডিস্ট্রিবিউশন।',
    logoSrc: '/assets/aistudio/image_e8e862d2.png',
    stageWidthPx: 138,
    stageHeightPx: 138,
    centerXPercent: 51.9,
    centerYPercent: 51.9,
    clipPath: 'inset(12% 7% 12% 7%)',
  },
  {
    id: 'bd_food',
    englishName: 'BD Food',
    banglaName: 'বিডি ফুড (BD Food)',
    category: 'মসলা, আচার ও খাদ্য সামগ্রী',
    description: 'গুঁড়া মসলা, আচার, লাচ্ছা সেমাই ও রান্নার উপকরণ সরবরাহ।',
    logoSrc: '/assets/aistudio/image_d665cc68.png',
    stageWidthPx: 176,
    stageHeightPx: 176,
    centerXPercent: 59.2,
    centerYPercent: 52.1,
    clipPath: 'inset(30% 10% 28% 28%)',
  },
  {
    id: 'prince',
    englishName: 'Prince',
    banglaName: 'প্রিন্স (Prince)',
    category: 'খাদ্য ও ভোগ্যপণ্য',
    description: 'স্থানীয় বাজারের জনপ্রিয় খাদ্য ও ভোগ্যপণ্য নিয়মিত সরবরাহ।',
    logoSrc: '/assets/aistudio/image_970edaef.png',
    stageWidthPx: 76,
    stageHeightPx: 76,
    centerXPercent: 49.8,
    centerYPercent: 50.3,
  },
];

export const PartnerBrandMark: React.FC<{ partner: PartnerCompanyInfo }> = ({
  partner,
}) => {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200/85 bg-white px-4 py-3 transition-colors duration-200 group-hover:border-[#1E3A8A]/25">
      {!failed ? (
        <div className="relative h-[76px] w-[196px] overflow-hidden transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]">
          <img
            src={partner.logoSrc}
            alt={`${partner.englishName} লোগো`}
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setFailed(true)}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: `${partner.stageWidthPx}px`,
              height: `${partner.stageHeightPx}px`,
              maxWidth: 'none',
              transform: `translate(-${partner.centerXPercent}%, -${partner.centerYPercent}%)`,
              clipPath: partner.clipPath,
            }}
            className="select-none object-contain"
          />
        </div>
      ) : (
        <span className="text-base font-extrabold text-[#1E3A8A]">
          {partner.englishName}
        </span>
      )}
    </div>
  );
};
