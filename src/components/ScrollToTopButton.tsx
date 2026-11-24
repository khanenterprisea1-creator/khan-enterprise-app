import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopButtonProps {
  bottomPositionClass?: string;
}

export const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({
  bottomPositionClass = 'bottom-5',
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 300);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="উপরে যান"
      className={`no-print fixed ${bottomPositionClass} right-5 z-40 inline-flex items-center gap-1.5 rounded-xl border border-[#1E3A8A]/20 bg-white/95 px-4 py-2.5 text-sm font-extrabold text-[#1E3A8A] backdrop-blur-md shadow-[0_12px_28px_-8px_rgba(30,58,138,0.26)] transition-[transform,opacity,background-color,color,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-[#1E3A8A] hover:bg-[#1E3A8A] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:ring-offset-2 whitespace-nowrap ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-3 opacity-0 pointer-events-none'
      }`}
    >
      <ArrowUp className="h-4 w-4 shrink-0" />
      <span>উপরে যান</span>
    </button>
  );
};
