import React, { useRef, useState } from 'react';
import {
  Download,
  Upload,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Sparkles,
} from 'lucide-react';
import { LedgerData } from '../types/ledger';
import {
  downloadAllInOneExcelCsv,
  getTodayISO,
  parseAllInOneCsvBackup,
} from '../utils/storage';

interface BackupModalProps {
  isOpen: boolean;
  data: LedgerData;
  hasDemoData?: boolean;
  onClose: () => void;
  onImport: (data: LedgerData) => void;
  onLoadSampleData?: () => void;
  onClearDemoData?: () => void;
  onClearAll: () => void;
}

const LAST_BACKUP_STORAGE_KEY = 'khan_enterprise_last_backup_at_v1';

function readLastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastBackupAt(iso: string): void {
  try {
    localStorage.setItem(LAST_BACKUP_STORAGE_KEY, iso);
  } catch {
    // ignore storage errors
  }
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  data,
  hasDemoData = false,
  onClose,
  onImport,
  onLoadSampleData,
  onClearDemoData,
  onClearAll,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => readLastBackupAt());
  const [pendingRestore, setPendingRestore] = useState<{
    fileName: string;
    sourceKind: 'json' | 'csv';
    restored: LedgerData;
  } | null>(null);

  if (!isOpen) return null;

  const markBackupDone = () => {
    const now = new Date().toISOString();
    writeLastBackupAt(now);
    setLastBackupAt(now);
  };

  const handleExportAllInOneCsv = () => {
    downloadAllInOneExcelCsv(data);
    markBackupDone();
    setMessage({
      type: 'success',
      text: 'সকল পেজের রিপোর্ট ও ছবি সহ All-In-One Excel (CSV) ফাইল ডাউনলোড হয়েছে।',
    });
  };

  const handleExportJson = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Khan_Enterprise_backup_${getTodayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    markBackupDone();
    setMessage({ type: 'success', text: 'সম্পূর্ণ হিসাবের JSON ব্যাকআপ ফাইল ডাউনলোড হয়েছে।' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rawText = String(reader.result ?? '');
      const trimmed = rawText.replace(/^\uFEFF/, '').trim();
      const lowerName = file.name.toLowerCase();

      try {
        if (lowerName.endsWith('.json') || trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed) as LedgerData;
          if (
            !parsed ||
            !Array.isArray(parsed.companies) ||
            !Array.isArray(parsed.products) ||
            typeof parsed.entries !== 'object'
          ) {
            throw new Error('Invalid JSON format');
          }
          const importedAuth = parsed.authConfig;
          const restored: LedgerData = {
            version: 1,
            companies: parsed.companies,
            products: parsed.products,
            entries: parsed.entries,
            cashTransactions: Array.isArray(parsed.cashTransactions) ? parsed.cashTransactions : [],
            companyLedgerEntries: Array.isArray(parsed.companyLedgerEntries)
              ? parsed.companyLedgerEntries
              : [],
            stockMovements: Array.isArray(parsed.stockMovements) ? parsed.stockMovements : [],
            customers: Array.isArray(parsed.customers) ? parsed.customers : [],
            customerCreditEntries: Array.isArray(parsed.customerCreditEntries)
              ? parsed.customerCreditEntries
              : [],
            authConfig: {
              adminPasswordHash:
                importedAuth && typeof importedAuth.adminPasswordHash === 'string'
                  ? importedAuth.adminPasswordHash
                  : data.authConfig.adminPasswordHash,
              companyPasswordHashes:
                importedAuth &&
                typeof importedAuth.companyPasswordHashes === 'object' &&
                importedAuth.companyPasswordHashes !== null
                  ? importedAuth.companyPasswordHashes
                  : data.authConfig.companyPasswordHashes,
            },
          };
          if (data.companies.length === 0 && Object.keys(data.entries).length === 0) {
            onImport(restored);
            setMessage({
              type: 'success',
              text: `JSON ব্যাকআপ থেকে সফলভাবে রিস্টোর হয়েছে (${restored.companies.length}টি কোম্পানি, ${Object.keys(restored.entries).length}টি সেলস)।`,
            });
          } else {
            setPendingRestore({
              fileName: file.name,
              sourceKind: 'json',
              restored,
            });
            setMessage(null);
          }
          return;
        }

        const restoredCsv = parseAllInOneCsvBackup(rawText, data.authConfig);
        if (data.companies.length === 0 && Object.keys(data.entries).length === 0) {
          onImport(restoredCsv);
          setMessage({
            type: 'success',
            text: `All-In-One Excel (CSV) থেকে সফলভাবে রিস্টোর হয়েছে (${restoredCsv.companies.length}টি কোম্পানি, ${restoredCsv.products.length}টি প্রোডাক্ট, ${Object.keys(restoredCsv.entries).length}টি সেলস)।`,
          });
        } else {
          setPendingRestore({
            fileName: file.name,
            sourceKind: 'csv',
            restored: restoredCsv,
          });
          setMessage(null);
        }
      } catch (err) {
        setMessage({
          type: 'error',
          text:
            err instanceof Error && err.message.includes('All-In-One')
              ? err.message
              : 'সঠিক Khan Enterprise All-In-One Excel (.csv) অথবা .json ব্যাকআপ ফাইল নির্বাচন করুন।',
        });
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_-12px_rgba(15,41,66,0.24)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="backup-modal-title" className="text-xl font-bold text-[#0f172a]">
            All-In-One Excel ব্যাকআপ ও রিস্টোর
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#0f172a] transition-colors hover:bg-slate-100"
            aria-label="বন্ধ করুন"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <p className="text-[15px] font-medium leading-relaxed text-[#0f172a]">
            এক ক্লিকে সকল পেজের রিপোর্ট (কোম্পানি, প্রোডাক্ট, সেলস, ক্যাশ ও খরচ, লাভ-লস, পেমেন্ট-চালান, স্টক রিপোর্ট এবং কাস্টমার বাকি ও ছবি) একসাথে <strong className="font-bold text-teal-800">All-In-One Excel (CSV)</strong> ফাইলে ব্যাকআপ ডাউনলোড করুন এবং আগের ব্যাকআপ ফাইল আপলোড করে ডাটা রিস্টোর করুন।
          </p>

          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] font-semibold text-[#0f172a]">
            <span>কোম্পানি: {data.companies.length}টি</span>
            <span aria-hidden="true">·</span>
            <span>প্রোডাক্ট: {data.products.length}টি</span>
            <span aria-hidden="true">·</span>
            <span>সেলস: {Object.keys(data.entries).length}টি</span>
            <span aria-hidden="true">·</span>
            <span>ক্যাশ/খরচ: {data.cashTransactions.length}টি</span>
            <span aria-hidden="true">·</span>
            <span>চালান/স্লিপ: {data.companyLedgerEntries.length}টি</span>
            <span aria-hidden="true">·</span>
            <span>স্টক: {data.stockMovements.length}টি</span>
            <span aria-hidden="true">·</span>
            <span>কাস্টমার: {data.customers.length} জন</span>
            <span aria-hidden="true">·</span>
            <span>ক্রেডিট: {data.customerCreditEntries.length}টি</span>
          </div>

          {/* Last Backup Habit Reminder */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200/80 bg-teal-50/70 px-4 py-2.5 text-xs sm:text-sm">
            <span className="font-bold text-teal-950">
              {lastBackupAt
                ? `সর্বশেষ ব্যাকআপ: ${new Date(lastBackupAt).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' })}`
                : 'এখনো কোনো ব্যাকআপ ডাউনলোড করা হয়নি — নিয়মিত Excel/JSON ব্যাকআপ রাখুন।'}
            </span>
          </div>

          {pendingRestore && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 space-y-2.5">
              <p className="text-sm font-extrabold text-amber-950">
                রিস্টোর নিশ্চিতকরণ ({pendingRestore.fileName})
              </p>
              <p className="text-xs sm:text-sm font-semibold text-amber-900">
                ফাইলে পাওয়া গেছে: {pendingRestore.restored.companies.length}টি কোম্পানি,{' '}
                {pendingRestore.restored.products.length}টি প্রোডাক্ট,{' '}
                {Object.keys(pendingRestore.restored.entries).length}টি সেলস এবং{' '}
                {pendingRestore.restored.customers.length} জন কাস্টমার। নিশ্চিত করলে বর্তমান হিসাব এই ফাইলের ডেটা দিয়ে প্রতিস্থাপিত হবে।
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onImport(pendingRestore.restored);
                    setMessage({
                      type: 'success',
                      text: `${pendingRestore.sourceKind === 'json' ? 'JSON' : 'All-In-One Excel (CSV)'} থেকে সফলভাবে রিস্টোর হয়েছে (${pendingRestore.restored.companies.length}টি কোম্পানি, ${Object.keys(pendingRestore.restored.entries).length}টি সেলস)।`,
                    });
                    setPendingRestore(null);
                  }}
                  className="rounded-lg bg-[#1E3A8A] px-3.5 py-2 text-xs sm:text-sm font-extrabold text-white hover:bg-[#172e6e]"
                >
                  নিশ্চিত রিস্টোর করুন
                </button>
                <button
                  type="button"
                  onClick={() => setPendingRestore(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  বাতিল
                </button>
              </div>
            </div>
          )}

          {message && (
            <div
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[15px] font-semibold ${
                message.type === 'success'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-rose-300 bg-rose-50 text-rose-900'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Primary 1-Click All-In-One Excel Download */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleExportAllInOneCsv}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-teal-700 px-5 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-teal-800"
            >
              <FileSpreadsheet className="h-5 w-5" />
              সব রিপোর্ট একসাথে ডাউনলোড (All-In-One Excel CSV)
            </button>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#0f2942] bg-[#0f2942]/[0.04] px-4 py-2.5 text-[15px] font-bold text-[#0f172a] transition-colors hover:bg-[#0f2942] hover:text-white"
              >
                <Upload className="h-4 w-4" />
                ব্যাকআপ রিস্টোর (.csv / .json)
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[15px] font-semibold text-[#0f172a] transition-colors hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                JSON ব্যাকআপ ডাউনলোড
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel,application/json,.json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {(onLoadSampleData || onClearDemoData) && (
            <div className="rounded-xl border border-blue-200/90 bg-blue-50/55 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-extrabold text-[#1E3A8A]">
                  টেস্টিং ও ডেমো ডেটা (১-ক্লিক)
                </p>
                <span className="text-xs font-semibold text-slate-600">
                  {hasDemoData ? 'ডেমো ডেটা চালু আছে' : 'কোনো ডেমো ডেটা নেই'}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium leading-relaxed text-[#1e293b]">
                প্রোডাক্ট, ৭ দিনের সেলস, স্টক সতর্কতা ও কাস্টমার বাকি ফিচারগুলো একসাথে পরীক্ষা করতে স্যাম্পল ডেটা লোড করুন অথবা পরীক্ষা শেষে শুধু ডেমো ডেটা মুছে ফেলুন।
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {onLoadSampleData && (
                  <button
                    type="button"
                    onClick={() => {
                      onLoadSampleData();
                      setMessage({
                        type: 'success',
                        text: 'প্রোডাক্ট, সেলস, স্টক সতর্কতা ও কাস্টমার বাকি সহ স্যাম্পল ডেটা লোড হয়েছে।',
                      });
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1E3A8A] px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#172e6e] whitespace-nowrap"
                  >
                    <Sparkles className="h-4 w-4 shrink-0" />
                    স্যাম্পল ডেটা লোড করুন
                  </button>
                )}
                {onClearDemoData && (
                  <button
                    type="button"
                    disabled={!hasDemoData}
                    onClick={() => {
                      onClearDemoData();
                      setMessage({
                        type: 'success',
                        text: 'সব ডেমো ডেটা মুছে ফেলা হয়েছে (আপনার নিজস্ব ডাটা সুরক্ষিত আছে)।',
                      });
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 py-2 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    ডেমো ডেটা মুছুন
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 pt-4">
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-rose-700 hover:text-rose-800"
              >
                <Trash2 className="h-4 w-4" />
                সকল ডাটা মুছে ফেলুন
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5">
                <span className="text-[15px] font-semibold text-rose-900">
                  নিশ্চিত? সব কোম্পানি ও হিসাব স্থায়ীভাবে মুছে যাবে।
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-[#0f172a] hover:bg-slate-50"
                  >
                    না
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll();
                      setConfirmClear(false);
                      onClose();
                    }}
                    className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    হ্যাঁ, মুছে ফেলুন
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
