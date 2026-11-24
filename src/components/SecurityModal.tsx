import React, { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck, Trash2, X } from 'lucide-react';
import { AuthConfig, Company } from '../types/ledger';
import { hashPassword, verifyPassword } from '../utils/auth';

interface SecurityModalProps {
  isOpen: boolean;
  companies: Company[];
  authConfig: AuthConfig;
  onClose: () => void;
  onUpdateAdminPasswordHash: (nextHash: string) => void;
  onSetCompanyPasswordHash: (companyId: string, hash: string | null) => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  companies,
  authConfig,
  onClose,
  onUpdateAdminPasswordHash,
  onSetCompanyPasswordHash,
}) => {
  const [activeTab, setActiveTab] = useState<'companies' | 'admin'>('companies');

  // Admin password change state
  const [currentAdminPass, setCurrentAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmAdminPass, setConfirmAdminPass] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [adminMessage, setAdminMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Per-company password editor state
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyPassInput, setCompanyPassInput] = useState('');
  const [showCompanyPass, setShowCompanyPass] = useState(false);
  const [companyFeedback, setCompanyFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleUpdateAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminMessage(null);

    const ok = await verifyPassword(currentAdminPass, authConfig.adminPasswordHash);
    if (!ok) {
      setAdminMessage({ type: 'error', text: 'বর্তমান অ্যাডমিন পাসওয়ার্ড সঠিক নয়।' });
      return;
    }
    if (newAdminPass.length < 4) {
      setAdminMessage({ type: 'error', text: 'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।' });
      return;
    }
    if (newAdminPass !== confirmAdminPass) {
      setAdminMessage({ type: 'error', text: 'নতুন পাসওয়ার্ড দুটি এক হয়নি।' });
      return;
    }

    const nextHash = await hashPassword(newAdminPass);
    onUpdateAdminPasswordHash(nextHash);
    setCurrentAdminPass('');
    setNewAdminPass('');
    setConfirmAdminPass('');
    setAdminMessage({
      type: 'success',
      text: 'অ্যাডমিন পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে।',
    });
  };

  const handleSaveCompanyPassword = async (companyId: string, companyName: string) => {
    setCompanyFeedback(null);
    if (companyPassInput.trim().length < 4) {
      setCompanyFeedback({
        type: 'error',
        text: 'কোম্পানির পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।',
      });
      return;
    }

    const hash = await hashPassword(companyPassInput.trim());
    onSetCompanyPasswordHash(companyId, hash);
    setEditingCompanyId(null);
    setCompanyPassInput('');
    setCompanyFeedback({
      type: 'success',
      text: `${companyName}-এর আলাদা পাসওয়ার্ড সেভ হয়েছে।`,
    });
  };

  const handleRemoveCompanyPassword = (companyId: string, companyName: string) => {
    onSetCompanyPasswordHash(companyId, null);
    if (editingCompanyId === companyId) {
      setEditingCompanyId(null);
      setCompanyPassInput('');
    }
    setCompanyFeedback({
      type: 'success',
      text: `${companyName}-এর পাসওয়ার্ড সরানো হয়েছে।`,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200/85 bg-white shadow-[0_20px_50px_-12px_rgba(15,41,66,0.22)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="security-modal-title" className="text-xl font-bold text-[#0f172a]">
              পাসওয়ার্ড ও এক্সেস সেটিংস
            </h2>
            <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
              অ্যাডমিন পাসওয়ার্ড পরিবর্তন ও প্রতিটি কোম্পানির জন্য আলাদা পাসওয়ার্ড নির্ধারণ করুন।
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#1e293b] transition-colors hover:bg-slate-100 hover:text-[#0f172a]"
            aria-label="বন্ধ করুন"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-6 py-2.5">
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('companies');
                setCompanyFeedback(null);
              }}
              className={`rounded-md py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                activeTab === 'companies'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#1e293b] hover:text-[#0f172a]'
              }`}
            >
              কোম্পানির আলাদা পাসওয়ার্ড ({companies.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('admin');
                setAdminMessage(null);
              }}
              className={`rounded-md py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                activeTab === 'admin'
                  ? 'bg-white text-[#0f172a] shadow-xs'
                  : 'text-[#1e293b] hover:text-[#0f172a]'
              }`}
            >
              অ্যাডমিন পাসওয়ার্ড পরিবর্তন
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'companies' ? (
            <div className="space-y-4">
              <p className="text-sm font-medium leading-relaxed text-[#1e293b]">
                প্রতিটি কোম্পানির আলাদা পাসওয়ার্ড সেট করলে কোম্পানির লোক / S.R লগইন পেইজ থেকে শুধু ওই কোম্পানির খাতায় প্রবেশ করা যাবে। এই মোডে স্ক্রিনশট, স্ক্রিন ক্যাপচার, প্রিন্ট ও রিপোর্ট ডাউনলোড সম্পূর্ণ বন্ধ থাকবে।
              </p>

              {companyFeedback && (
                <div
                  className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold ${
                    companyFeedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{companyFeedback.text}</span>
                </div>
              )}

              {companies.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-[#1e293b]">
                  এখনও কোনো কোম্পানি যোগ করা হয়নি।
                </div>
              ) : (
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                  {companies.map((company) => {
                    const hasPassword = Boolean(authConfig.companyPasswordHashes[company.id]);
                    const isEditing = editingCompanyId === company.id;

                    return (
                      <div key={company.id} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-[15px] font-bold text-[#0f172a]">
                              {company.name}
                            </div>
                            <div
                              className={`text-sm font-semibold ${
                                hasPassword ? 'text-emerald-700' : 'text-[#1e293b]'
                              }`}
                            >
                              {hasPassword
                                ? 'আলাদা পাসওয়ার্ড সেট করা আছে'
                                : 'পাসওয়ার্ড সেট করা নেই'}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCompanyId(isEditing ? null : company.id);
                                setCompanyPassInput('');
                                setCompanyFeedback(null);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              {isEditing
                                ? 'বাতিল'
                                : hasPassword
                                  ? 'পাসওয়ার্ড পরিবর্তন'
                                  : 'পাসওয়ার্ড দিন'}
                            </button>

                            {hasPassword && !isEditing && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveCompanyPassword(company.id, company.name)
                                }
                                className="rounded-lg p-1.5 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                                title="পাসওয়ার্ড মুছুন"
                                aria-label={`${company.name}-এর পাসওয়ার্ড মুছুন`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {isEditing && (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative flex-1">
                              <input
                                type={showCompanyPass ? 'text' : 'password'}
                                autoFocus
                                value={companyPassInput}
                                onChange={(e) => setCompanyPassInput(e.target.value)}
                                placeholder="নতুন পাসওয়ার্ড লিখুন (কমপক্ষে ৪ অক্ষর)"
                                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                              />
                              <button
                                type="button"
                                onClick={() => setShowCompanyPass((v) => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 hover:text-[#0f172a]"
                                aria-label="পাসওয়ার্ড দেখুন বা লুকান"
                              >
                                {showCompanyPass ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveCompanyPassword(company.id, company.name)
                              }
                              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 whitespace-nowrap"
                            >
                              সেভ করুন
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleUpdateAdminPassword} className="space-y-4">
              <div>
                <label
                  htmlFor="sec-cur-admin"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  বর্তমান অ্যাডমিন পাসওয়ার্ড
                </label>
                <div className="relative">
                  <input
                    id="sec-cur-admin"
                    type={showAdminPass ? 'text' : 'password'}
                    value={currentAdminPass}
                    onChange={(e) => setCurrentAdminPass(e.target.value)}
                    placeholder="বর্তমান পাসওয়ার্ড"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 hover:text-[#0f172a]"
                    aria-label="পাসওয়ার্ড দেখুন বা লুকান"
                  >
                    {showAdminPass ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="sec-new-admin"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  নতুন অ্যাডমিন পাসওয়ার্ড
                </label>
                <input
                  id="sec-new-admin"
                  type={showAdminPass ? 'text' : 'password'}
                  value={newAdminPass}
                  onChange={(e) => setNewAdminPass(e.target.value)}
                  placeholder="কমপক্ষে ৪ অক্ষর"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              <div>
                <label
                  htmlFor="sec-conf-admin"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  নতুন পাসওয়ার্ড নিশ্চিত করুন
                </label>
                <input
                  id="sec-conf-admin"
                  type={showAdminPass ? 'text' : 'password'}
                  value={confirmAdminPass}
                  onChange={(e) => setConfirmAdminPass(e.target.value)}
                  placeholder="পুনরায় নতুন পাসওয়ার্ড লিখুন"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              {adminMessage && (
                <p
                  className={`text-sm font-semibold ${
                    adminMessage.type === 'success' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {adminMessage.text}
                </p>
              )}

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-[15px] font-bold text-white transition-colors hover:bg-teal-800"
              >
                <ShieldCheck className="h-4 w-4" />
                অ্যাডমিন পাসওয়ার্ড আপডেট করুন
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
