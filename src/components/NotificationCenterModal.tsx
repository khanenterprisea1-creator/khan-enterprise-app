import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Clock,
  Package,
  X,
} from 'lucide-react';
import {
  GODOWN_AGE_ALERT_DAYS,
  LAST_FIVE_STOCK_THRESHOLD,
  StockNotificationCategory,
  StockNotificationItem,
} from '../utils/notifications';
import { formatNumber, formatTaka } from '../utils/storage';

interface NotificationCenterModalProps {
  isOpen: boolean;
  notifications: StockNotificationItem[];
  readSignatures: string[];
  onClose: () => void;
  onMarkRead: (signature: string) => void;
  onMarkAllRead: () => void;
  onNavigateToStock: (filter: 'low_stock' | 'aged_godown', companyId?: string) => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  notifications,
  readSignatures,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onNavigateToStock,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | StockNotificationCategory>('all');
  const [browserPermission, setBrowserPermission] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? window.Notification.permission
      : 'unsupported'
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const readSet = useMemo(() => new Set(readSignatures), [readSignatures]);

  const stats = useMemo(() => {
    let agedCount = 0;
    let agedValue = 0;
    let lowCount = 0;
    let unreadCount = 0;

    for (const n of notifications) {
      if (!readSet.has(n.signature)) unreadCount += 1;
      if (n.category === 'godown_aged') {
        agedCount += 1;
        agedValue += n.stockValue;
      } else {
        lowCount += 1;
      }
    }

    return {
      agedCount,
      agedValue: Number(agedValue.toFixed(2)),
      lowCount,
      unreadCount,
    };
  }, [notifications, readSet]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((n) => n.category === activeTab);
  }, [notifications, activeTab]);

  if (!isOpen) return null;

  const handleEnableBrowserAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const result = await window.Notification.requestPermission();
      setBrowserPermission(result);
      if (result === 'granted' && notifications.length > 0) {
        new window.Notification('Khan Enterprise · স্টক সতর্কতা', {
          body: `${stats.lowCount}টি লো-স্টক এবং ${stats.agedCount}টি ১ মাসের+ গুদামের প্রোডাক্ট সতর্কতা রয়েছে।`,
        });
      }
    } catch {
      // ignore browser permission error
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-end bg-slate-900/45 backdrop-blur-[2px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-center-title"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#F8FAFC] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E3A8A] text-white shadow-xs">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="notification-center-title"
                  className="text-xl font-extrabold text-[#0f172a]"
                >
                  নোটিফিকেশন সেন্টার
                </h2>
                {stats.unreadCount > 0 && (
                  <span className="font-mono-tabular rounded-md bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white">
                    {stats.unreadCount} নতুন
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm font-semibold text-[#1e293b]">
                গুদামে {GODOWN_AGE_ALERT_DAYS}+ দিন থাকা পণ্য ও লাস্ট {LAST_FIVE_STOCK_THRESHOLD} কার্টন স্টক সতর্কতা
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {browserPermission === 'default' && (
              <button
                type="button"
                onClick={handleEnableBrowserAlerts}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#1E3A8A] hover:bg-blue-100 whitespace-nowrap"
              >
                <BellRing className="h-3.5 w-3.5" />
                ডেস্কটপ অ্যালার্ট চালু
              </button>
            )}
            {stats.unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#0f172a] hover:bg-slate-100 whitespace-nowrap"
              >
                <CheckCheck className="h-3.5 w-3.5 text-teal-700" />
                সব পঠিত করুন
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-200/70 hover:text-[#0f172a]"
              aria-label="বন্ধ করুন"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200 bg-white">
          <div className="bg-amber-50/60 px-5 py-3.5">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-amber-900">
              <Clock className="h-4 w-4 text-amber-700" />
              ১ মাসের+ গুদামে ({GODOWN_AGE_ALERT_DAYS}+ দিন)
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-mono-tabular text-xl font-extrabold text-amber-950">
                {stats.agedCount}টি প্রোডাক্ট
              </span>
              {stats.agedValue > 0 && (
                <span className="font-mono-tabular text-xs font-bold text-amber-800">
                  ({formatTaka(stats.agedValue)} আটকে আছে)
                </span>
              )}
            </div>
          </div>

          <div className="bg-rose-50/60 px-5 py-3.5">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-rose-900">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              লাস্ট {LAST_FIVE_STOCK_THRESHOLD} কার্টন / লো-স্টক
            </div>
            <div className="mt-1">
              <span className="font-mono-tabular text-xl font-extrabold text-rose-950">
                {stats.lowCount}টি প্রোডাক্ট
              </span>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50 px-5 py-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'bg-white text-[#0f172a] border border-slate-200 hover:bg-slate-100'
            }`}
          >
            সব নোটিফিকেশন ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('godown_aged')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors whitespace-nowrap ${
              activeTab === 'godown_aged'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-white text-amber-950 border border-amber-300 hover:bg-amber-50'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            ১ মাসের+ গুদামে ({stats.agedCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('low_stock')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors whitespace-nowrap ${
              activeTab === 'low_stock'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'bg-white text-rose-950 border border-rose-300 hover:bg-rose-50'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            লাস্ট {LAST_FIVE_STOCK_THRESHOLD} / লো-স্টক ({stats.lowCount})
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#f4f7fa]">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-teal-700/70" />
              <p className="text-lg font-extrabold text-[#0f172a]">
                এই মুহূর্তে কোনো সতর্কতা নেই
              </p>
              <p className="mt-1 text-sm font-medium text-[#1e293b]">
                কোনো প্রোডাক্ট {GODOWN_AGE_ALERT_DAYS} দিনের বেশি গুদামে জমলে বা স্টক {LAST_FIVE_STOCK_THRESHOLD} কার্টনের নিচে নামলে সাথে সাথে এখানে নোটিফিকেশন দেখাবে।
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              const isRead = readSet.has(item.signature);
              const isAged = item.category === 'godown_aged';

              return (
                <article
                  key={item.id}
                  className={`rounded-xl border bg-white p-4 shadow-2xs transition-all ${
                    isAged
                      ? 'border-amber-300/90 border-l-4 border-l-amber-600'
                      : 'border-rose-300/90 border-l-4 border-l-rose-600'
                  } ${isRead ? 'opacity-80' : 'ring-1 ring-slate-200'}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          isAged
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {isAged ? (
                          <Clock className="h-5 w-5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5" />
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-extrabold ${
                              isAged
                                ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                : item.currentStock <= 0
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-rose-100 text-rose-900 border border-rose-300'
                            }`}
                          >
                            {isAged
                              ? `গুদামে ${formatNumber(item.daysInGodown)} দিন`
                              : item.currentStock <= 0
                                ? 'স্টক শেষ'
                                : `বাকি ${formatNumber(item.currentStock)} ${item.unit}`}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-[#0f172a]">
                            {item.companyName}
                          </span>
                          {!isRead && (
                            <span className="inline-block h-2 w-2 rounded-full bg-rose-600" title="নতুন" />
                          )}
                        </div>

                        <h3 className="mt-1.5 text-[16px] font-extrabold text-[#0f172a]">
                          {item.title}
                        </h3>
                        <p className="mt-1 text-sm font-medium leading-relaxed text-[#1e293b]">
                          {item.message}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2.5">
                    {!isRead && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(item.signature)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-[#0f172a] hover:bg-slate-100"
                      >
                        <Check className="h-3.5 w-3.5 text-teal-700" />
                        পঠিত চিহ্ন
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!isRead) onMarkRead(item.signature);
                        onNavigateToStock(
                          isAged ? 'aged_godown' : 'low_stock',
                          item.companyId
                        );
                        onClose();
                      }}
                      className={`inline-flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-xs font-extrabold text-white transition-colors ${
                        isAged
                          ? 'bg-amber-700 hover:bg-amber-800'
                          : 'bg-rose-600 hover:bg-rose-700'
                      }`}
                    >
                      স্টক রিপোর্টে দেখুন
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
