import React, { useEffect, useRef, useState } from 'react';
import { Eye, Lock, ShieldAlert } from 'lucide-react';
import { getTodayISO } from '../utils/storage';

interface SRSecurityShieldProps {
  companyName: string;
  children: React.ReactNode;
}

function getCurrentTimeLabel(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const SRSecurityShield: React.FC<SRSecurityShieldProps> = ({
  companyName,
  children,
}) => {
  const [isBlurred, setIsBlurred] = useState(false);
  const [warningNotice, setWarningNotice] = useState<string | null>(null);
  const [clockLabel, setClockLabel] = useState<string>(() => getCurrentTimeLabel());
  const printScreenLockUntilRef = useRef(0);
  const noticeTimerRef = useRef<number | null>(null);

  const showTemporaryNotice = (message: string, durationMs = 3800) => {
    setWarningNotice(message);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setWarningNotice(null);
      noticeTimerRef.current = null;
    }, durationMs);
  };

  useEffect(() => {
    const clockInterval = window.setInterval(() => {
      setClockLabel(getCurrentTimeLabel());
    }, 30000);
    return () => window.clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    document.body.classList.add('sr-session-active');

    // Block programmatic window.print() while S.R / Company staff session is active
    const originalPrint = window.print.bind(window);
    window.print = () => {
      showTemporaryNotice('নিরাপত্তার কারণে কোম্পানির স্টাফ/S.R একাউন্টে প্রিন্ট বা PDF সেভ বন্ধ রয়েছে।');
    };

    // Intercept browser screen-sharing / screen-recording API if available
    const mediaDevices = navigator.mediaDevices as
      | (MediaDevices & { getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream> })
      | undefined;
    const originalGetDisplayMedia =
      mediaDevices && typeof mediaDevices.getDisplayMedia === 'function'
        ? mediaDevices.getDisplayMedia.bind(mediaDevices)
        : null;

    const triggerScreenshotBlock = (reason: string) => {
      printScreenLockUntilRef.current = Date.now() + 3500;
      setIsBlurred(true);
      showTemporaryNotice(reason, 4200);
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          void navigator.clipboard.writeText('');
        }
      } catch {
        // Ignore clipboard permission errors in restricted contexts
      }
    };

    if (mediaDevices && originalGetDisplayMedia) {
      try {
        mediaDevices.getDisplayMedia = async () => {
          triggerScreenshotBlock(
            'নিরাপত্তার কারণে কোম্পানির স্টাফ/S.R একাউন্টে স্ক্রিন শেয়ার বা রেকর্ডিং বন্ধ রয়েছে।'
          );
          throw new DOMException('Screen capture is disabled in S.R view.', 'NotAllowedError');
        };
      } catch {
        // Ignore if browser marks mediaDevices properties read-only
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      // PrintScreen key (including Alt+PrintScreen / Ctrl+PrintScreen / Shift+PrintScreen)
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || key === 'snapshot') {
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock('নিরাপত্তার কারণে কোম্পানির স্টাফ/S.R একাউন্টে স্ক্রিনশট নেওয়া সম্পূর্ণ বন্ধ।');
        return;
      }

      // Windows Snipping Tool (Win+Shift+S), Mac Screenshot (Cmd+Shift+3/4/5/6), Web Capture (Ctrl/Cmd+Shift+S)
      if (
        (e.metaKey && e.shiftKey) ||
        (ctrlOrMeta && e.shiftKey && (key === 's' || key === '3' || key === '4' || key === '5' || key === '6')) ||
        (e.metaKey && key === 'g')
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock('নিরাপত্তার কারণে কোম্পানির স্টাফ/S.R একাউন্টে স্ক্রিনশট ও স্ক্রিন রেকর্ডিং নিষিদ্ধ।');
        return;
      }

      // Print (Ctrl/Cmd + P) or Save Page (Ctrl/Cmd + S)
      if (ctrlOrMeta && (key === 'p' || key === 's')) {
        e.preventDefault();
        e.stopPropagation();
        showTemporaryNotice('নিরাপত্তার কারণে S.R একাউন্টে রিপোর্ট ডাউনলোড, সেভ ও প্রিন্ট বন্ধ রয়েছে।');
        return;
      }

      // Copy / Cut / Select All / View Source
      if (ctrlOrMeta && (key === 'c' || key === 'x' || key === 'u' || key === 'a')) {
        e.preventDefault();
        e.stopPropagation();
        showTemporaryNotice('S.R মোডে তথ্য কপি করা বন্ধ রাখা হয়েছে।');
        return;
      }

      // DevTools shortcuts
      if (
        e.key === 'F12' ||
        (ctrlOrMeta && e.shiftKey && (key === 'i' || key === 'j' || key === 'c'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        showTemporaryNotice('নিরাপত্তার কারণে এই অ্যাকশনটি বন্ধ রাখা হয়েছে।');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || key === 'snapshot') {
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock('নিরাপত্তার কারণে কোম্পানির স্টাফ/S.R একাউন্টে স্ক্রিনশট নেওয়া সম্পূর্ণ বন্ধ।');
      }
    };

    const handleWindowBlur = () => {
      setIsBlurred(true);
    };

    const handleWindowFocus = () => {
      if (Date.now() >= printScreenLockUntilRef.current && !document.hidden) {
        setIsBlurred(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBlurred(true);
      } else if (Date.now() >= printScreenLockUntilRef.current) {
        setIsBlurred(false);
      }
    };

    const handlePageHide = () => {
      setIsBlurred(true);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.body.classList.remove('sr-session-active');
      window.print = originalPrint;
      if (mediaDevices && originalGetDisplayMedia) {
        try {
          mediaDevices.getDisplayMedia = originalGetDisplayMedia;
        } catch {
          // ignore
        }
      }
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const watermarkText = `Khan Enterprise · ${companyName} · স্টাফ/S.R ভিউ · স্ক্রিনশট নিষিদ্ধ · ${getTodayISO()} ${clockLabel}`;

  return (
    <div
      className="sr-protected-content relative min-h-screen select-none"
      onContextMenu={(e) => {
        e.preventDefault();
        showTemporaryNotice('S.R মোডে রাইট-ক্লিক, ছবি সেভ ও স্ক্রিন কপি বন্ধ রাখা হয়েছে।');
      }}
      onCopy={(e) => {
        e.preventDefault();
        showTemporaryNotice('S.R মোডে তথ্য কপি করা বন্ধ রাখা হয়েছে।');
      }}
      onCut={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Dynamic Repeating Diagonal Security Watermark Overlay */}
      <div
        aria-hidden="true"
        className="no-print pointer-events-none fixed inset-0 z-20 overflow-hidden opacity-[0.095]"
      >
        <div className="grid h-[155%] w-[155%] -translate-x-[18%] -translate-y-[18%] -rotate-24 grid-cols-3 gap-x-10 gap-y-16">
          {Array.from({ length: 24 }).map((_, idx) => (
            <div
              key={idx}
              className="flex items-center justify-center whitespace-nowrap text-xs sm:text-sm font-extrabold tracking-wide text-[#0f2942]"
            >
              {watermarkText}
            </div>
          ))}
        </div>
      </div>

      {/* Warning Banner Toast */}
      {warningNotice && (
        <div
          role="alert"
          className="no-print fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-rose-300 bg-rose-950 px-4 py-3 text-sm font-bold text-white shadow-xl"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-300" />
          <span>{warningNotice}</span>
        </div>
      )}

      {/* Privacy Blackout Shield on Blur / Tab Switch / Screenshot Attempt */}
      {isBlurred && (
        <div
          onClick={() => {
            if (Date.now() >= printScreenLockUntilRef.current) {
              setIsBlurred(false);
            }
          }}
          className="no-print fixed inset-0 z-40 flex items-center justify-center bg-[#020617]/96 backdrop-blur-2xl p-6"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-7 text-center text-white shadow-2xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/20 text-rose-300">
              <Lock className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-extrabold text-white">
              স্ক্রিন সুরক্ষিত রাখা হয়েছে
            </h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-200">
              নিরাপত্তার কারণে কোম্পানির লোক / S.R একাউন্টে স্ক্রিনশট, স্ক্রিন রেকর্ডিং, প্রিন্ট ও রিপোর্ট ডাউনলোড সম্পূর্ণ বন্ধ রয়েছে।
            </p>
            <button
              type="button"
              onClick={() => {
                printScreenLockUntilRef.current = 0;
                setIsBlurred(false);
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-teal-500"
            >
              <Eye className="h-4 w-4" />
              পুনরায় রিপোর্ট দেখুন
            </button>
          </div>
        </div>
      )}

      {/* Report Content (Hidden/Blurred immediately while shield active) */}
      <div className={isBlurred ? 'opacity-0 blur-2xl pointer-events-none select-none' : ''}>
        {children}
      </div>
    </div>
  );
};
