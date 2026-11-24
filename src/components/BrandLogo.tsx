import React from 'react';

interface BrandLogoProps {
  className?: string;
  variant?: 'emblem' | 'full';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = 'h-12 w-12 sm:h-14 sm:w-14',
  variant = 'emblem',
}) => {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-300/90 bg-[#FAF9F7] shadow-sm ${className}`}
    >
      <img
        src="/assets/aistudio/khan_enterprise_logo_f0d21ac0.png"
        alt="Khan Enterprise লোগো"
        draggable={false}
        className={
          variant === 'emblem'
            ? 'h-full w-full object-contain scale-[1.54] origin-[50%_26.3%]'
            : 'h-full w-full object-contain p-1'
        }
      />
    </span>
  );
};
