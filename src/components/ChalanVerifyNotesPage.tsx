import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Crop,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Gift,
  History,
  ImagePlus,
  Loader2,
  NotebookPen,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  SunMedium,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Company, CompanyRepContact } from '../types/ledger';
import { compressImageFileToDataUrl, generateId } from '../utils/storage';
import {
  COMPANY_LOGO_PRESETS,
  CompanyLogoAvatar,
  normalizeTelHref,
} from './CompanyLogoAvatar';
import { CompanyRepsStrip } from './CompanyRepsStrip';
import {
  ChalanCropBox,
  ChalanImageQualityReport,
  ChalanSavedNote,
  ChalanSubTab,
  ChalanVerificationResult,
  classifyVerificationFlags,
  clearStandaloneChalanDraft,
  createSampleStandaloneChalanTest,
  createStandaloneNoteId,
  downloadChalanNoteAsCsv,
  downloadChalanNoteAsTxt,
  formatChalanVerificationAsText,
  loadChalanSavedNotes,
  loadStandaloneChalanDraft,
  loadStandaloneChalanReps,
  processChalanImage,
  saveChalanSavedNotes,
  saveStandaloneChalanDraft,
  saveStandaloneChalanReps,
  StandaloneRepContact,
} from '../utils/chalanNotesStorage';

export interface CompanyProfileMetaUpdate {
  logoUrl?: string;
  tsmName?: string;
  tsmPhone?: string;
  srContacts?: CompanyRepContact[];
}

interface ChalanVerifyNotesPageProps {
  companies?: Company[];
  onUpdateCompanyProfileMeta?: (
    companyId: string,
    meta: CompanyProfileMetaUpdate
  ) => void;
}

interface UploadedImageItem {
  id: string;
  name: string;
  mimeType: 'image/jpeg';
  originalDataUrl: string;
  dataUrl: string;
  role: 'current' | 'previous';
  rotationDeg: number;
  crop: ChalanCropBox;
  enhanceContrast: boolean;
  quality: ChalanImageQualityReport;
}

type ResultFilterMode =
  | 'all'
  | 'rate_mismatch'
  | 'free_issues'
  | 'due_alerts'
  | 'uncertain';

type ArchiveFilterMode =
  | 'all'
  | 'missing_free'
  | 'rate_mismatch'
  | 'due_alert'
  | 'uncertain';

const DEFAULT_CROP: ChalanCropBox = {
  topPct: 0,
  rightPct: 0,
  bottomPct: 0,
  leftPct: 0,
};

function formatMoney(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return '—';
  return `৳${num.toLocaleString('en-US', {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function getComparisonStatusMeta(status: string): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'matched':
      return {
        label: 'মিলে গেছে',
        badgeClass: 'border-emerald-300 bg-emerald-50 text-emerald-800',
      };
    case 'last_digit_alert':
      return {
        label: 'শেষ সংখ্যা সতর্কতা',
        badgeClass: 'border-rose-300 bg-rose-50 text-rose-800',
      };
    case 'missing_in_current':
      return {
        label: 'বর্তমান চালানে নেই',
        badgeClass: 'border-rose-300 bg-rose-50 text-rose-800',
      };
    case 'missing_in_previous':
      return {
        label: 'আগের চালানে ছিল না',
        badgeClass: 'border-amber-300 bg-amber-50 text-amber-900',
      };
    case 'qty_or_amount_diff':
      return {
        label: 'পরিমাণ / টাকায় অমিল',
        badgeClass: 'border-amber-300 bg-amber-50 text-amber-900',
      };
    default:
      return {
        label: 'অস্পষ্ট / যাচাইযোগ্য',
        badgeClass: 'border-slate-300 bg-slate-100 text-slate-800',
      };
  }
}

export function ChalanVerifyNotesPage({
  companies = [],
  onUpdateCompanyProfileMeta,
}: ChalanVerifyNotesPageProps) {
  const initialDraftRef = useRef(loadStandaloneChalanDraft());
  const initialDraft = initialDraftRef.current;

  const [activeSubTab, setActiveSubTab] = useState<ChalanSubTab>(() => {
    const saved = initialDraft?.activeSubTab;
    if (saved === 'verify' || saved === 'notes' || saved === 'reps_logos') {
      return saved;
    }
    return 'verify';
  });

  const [currentImages, setCurrentImages] = useState<UploadedImageItem[]>([]);
  const [previousImages, setPreviousImages] = useState<UploadedImageItem[]>([]);
  const [chalanText, setChalanText] = useState(() => initialDraft?.chalanText || '');
  const [comparisonText, setComparisonText] = useState(() => initialDraft?.comparisonText || '');
  const [extraNote, setExtraNote] = useState(() => initialDraft?.extraNote || '');
  const [showComparePanel, setShowComparePanel] = useState(() =>
    Boolean(initialDraft?.comparisonText)
  );
  const [isSamplePreview, setIsSamplePreview] = useState(() =>
    Boolean(initialDraft?.isSamplePreview)
  );

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [serverReadyWarning, setServerReadyWarning] = useState(false);

  const [result, setResult] = useState<ChalanVerificationResult | null>(
    () => initialDraft?.result ?? null
  );
  const [resultFilter, setResultFilter] = useState<ResultFilterMode>(
    () => initialDraft?.resultFilter ?? 'all'
  );
  const [resultManualCompanyId, setResultManualCompanyId] = useState<string>('');

  // Image editor (rotate / crop / contrast / frame guide) modal state
  const [editingImage, setEditingImage] = useState<UploadedImageItem | null>(null);
  const [editRotation, setEditRotation] = useState(0);
  const [editCrop, setEditCrop] = useState<ChalanCropBox>(DEFAULT_CROP);
  const [editEnhance, setEditEnhance] = useState(false);
  const [editPreviewUrl, setEditPreviewUrl] = useState('');
  const [editPreviewQuality, setEditPreviewQuality] = useState<ChalanImageQualityReport | null>(
    null
  );
  const [isProcessingEdit, setIsProcessingEdit] = useState(false);

  // Standalone user note editor state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(
    () => initialDraft?.editingNoteId ?? null
  );
  const [noteTitle, setNoteTitle] = useState(() => initialDraft?.noteTitle || '');
  const [noteDueTag, setNoteDueTag] = useState(() => initialDraft?.noteDueTag || '');
  const [noteText, setNoteText] = useState(() => initialDraft?.noteText || '');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Print target payload (allows printing current view OR a saved archive item)
  const [printPayload, setPrintPayload] = useState<{
    title: string;
    dueTag: string;
    noteText: string;
    verification: ChalanVerificationResult | null;
  } | null>(null);

  // Standalone saved archive
  const [savedNotes, setSavedNotes] = useState<ChalanSavedNote[]>(() => loadChalanSavedNotes());
  const [searchQuery, setSearchQuery] = useState(() => initialDraft?.searchQuery || '');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilterMode>(
    () => initialDraft?.archiveFilter ?? 'all'
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Company Logos & TSM/SR Profile Editor (metadata only — zero impact on accounts)
  const [selectedRepCompanyId, setSelectedRepCompanyId] = useState<string>(() => {
    const saved = initialDraft?.selectedRepCompanyId;
    if (saved && companies.some((c) => c.id === saved)) return saved;
    return companies[0]?.id ?? '';
  });
  const [repLogoUrl, setRepLogoUrl] = useState('');
  const [repTsmName, setRepTsmName] = useState('');
  const [repTsmPhone, setRepTsmPhone] = useState('');
  const [repSrContacts, setRepSrContacts] = useState<CompanyRepContact[]>([]);
  const [isUploadingRepLogo, setIsUploadingRepLogo] = useState(false);
  const repLogoFileRef = useRef<HTMLInputElement | null>(null);

  // Standalone extra rep / dealer contacts inside Chalan Notes
  const [standaloneReps, setStandaloneReps] = useState<StandaloneRepContact[]>(() =>
    loadStandaloneChalanReps()
  );
  const [newRepCompany, setNewRepCompany] = useState('');
  const [newRepRole, setNewRepRole] = useState<'TSM' | 'SR' | 'Other'>('TSM');
  const [newRepName, setNewRepName] = useState('');
  const [newRepPhone, setNewRepPhone] = useState('');
  const [newRepNote, setNewRepNote] = useState('');

  const currentFileInputRef = useRef<HTMLInputElement | null>(null);
  const currentCameraInputRef = useRef<HTMLInputElement | null>(null);
  const previousFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (companies.length === 0) {
      if (selectedRepCompanyId !== '') setSelectedRepCompanyId('');
      return;
    }
    if (!companies.some((c) => c.id === selectedRepCompanyId)) {
      setSelectedRepCompanyId(companies[0].id);
    }
  }, [companies, selectedRepCompanyId]);

  const selectedRepCompany = useMemo(
    () => companies.find((c) => c.id === selectedRepCompanyId) ?? companies[0] ?? null,
    [companies, selectedRepCompanyId]
  );

  useEffect(() => {
    if (!selectedRepCompany) {
      setRepLogoUrl('');
      setRepTsmName('');
      setRepTsmPhone('');
      setRepSrContacts([]);
      return;
    }
    setRepLogoUrl(selectedRepCompany.logoUrl ?? '');
    setRepTsmName(selectedRepCompany.tsmName ?? '');
    setRepTsmPhone(selectedRepCompany.tsmPhone ?? '');
    if (selectedRepCompany.srContacts && selectedRepCompany.srContacts.length > 0) {
      setRepSrContacts(
        selectedRepCompany.srContacts.map((sr) => ({
          id: sr.id || generateId('sr'),
          name: sr.name || '',
          phone: sr.phone || '',
          role: 'SR',
        }))
      );
    } else if (selectedRepCompany.contactPerson || selectedRepCompany.phone) {
      setRepSrContacts([
        {
          id: generateId('sr'),
          name: selectedRepCompany.contactPerson ?? '',
          phone: selectedRepCompany.phone ?? '',
          role: 'SR',
        },
      ]);
    } else {
      setRepSrContacts([{ id: generateId('sr'), name: '', phone: '', role: 'SR' }]);
    }
  }, [selectedRepCompany]);

  // Persist standalone workspace draft & filters across tab switches/reloads (strictly isolated)
  useEffect(() => {
    saveStandaloneChalanDraft({
      activeSubTab,
      selectedRepCompanyId,
      editingNoteId,
      noteTitle,
      noteDueTag,
      noteText,
      chalanText,
      comparisonText,
      extraNote,
      result,
      resultFilter,
      archiveFilter,
      searchQuery,
      isSamplePreview,
    });
  }, [
    activeSubTab,
    selectedRepCompanyId,
    editingNoteId,
    noteTitle,
    noteDueTag,
    noteText,
    chalanText,
    comparisonText,
    extraNote,
    result,
    resultFilter,
    archiveFilter,
    searchQuery,
    isSamplePreview,
  ]);

  const saveNoteRef = useRef<(forceNew?: boolean) => void>(() => {});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNoteRef.current(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { ok?: boolean; chalanVerifyReady?: boolean } | null) => {
        if (active && payload && payload.chalanVerifyReady === false) {
          setServerReadyWarning(true);
        }
      })
      .catch(() => {
        // Ignore silent probe failures
      });
    return () => {
      active = false;
    };
  }, []);

  // Recompute modal preview whenever rotation / crop / contrast changes
  useEffect(() => {
    if (!editingImage) return;
    let cancelled = false;
    setIsProcessingEdit(true);
    processChalanImage(editingImage.originalDataUrl, {
      rotationDeg: editRotation,
      crop: editCrop,
      enhanceContrast: editEnhance,
    })
      .then((processed) => {
        if (!cancelled) {
          setEditPreviewUrl(processed.dataUrl);
          setEditPreviewQuality(processed.quality);
        }
      })
      .catch(() => {
        // ignore transient preview error
      })
      .finally(() => {
        if (!cancelled) setIsProcessingEdit(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editingImage, editRotation, editCrop, editEnhance]);

  const resultCounts = useMemo(() => {
    if (!result) {
      return {
        rateMismatch: 0,
        freeAndMissing: 0,
        missingFreeCount: 0,
        dueAlerts: 0,
        uncertain: 0,
        totalPaidAmount: 0,
      };
    }
    const rateMismatch = result.paidItems.filter((i) => i.rateStatus === 'mismatch').length;
    const missingFreeCount = result.missingFreeAlerts.length;
    const freeAndMissing = missingFreeCount + result.freeItems.length;
    const dueAlerts = result.dueComparisons.filter(
      (c) =>
        c.status === 'last_digit_alert' ||
        c.status === 'missing_in_current' ||
        c.status === 'missing_in_previous' ||
        c.status === 'qty_or_amount_diff' ||
        Boolean(c.lastDigitWarning?.trim())
    ).length;
    const uncertain =
      result.uncertainOrBlurryWarnings.length +
      result.paidItems.filter((i) => i.rateStatus === 'unclear').length;
    const totalPaidAmount = result.paidItems.reduce(
      (sum, item) => sum + (Number.isFinite(item.totalAmount) ? item.totalAmount : 0),
      0
    );

    return {
      rateMismatch,
      freeAndMissing,
      missingFreeCount,
      dueAlerts,
      uncertain,
      totalPaidAmount,
    };
  }, [result]);

  const filteredPaidItems = useMemo(() => {
    if (!result) return [];
    if (resultFilter === 'rate_mismatch') {
      return result.paidItems.filter((i) => i.rateStatus === 'mismatch');
    }
    if (resultFilter === 'uncertain') {
      return result.paidItems.filter((i) => i.rateStatus === 'unclear');
    }
    return result.paidItems;
  }, [result, resultFilter]);

  const filteredSavedNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return savedNotes.filter((item) => {
      const flags = classifyVerificationFlags(item.verification);
      if (archiveFilter === 'missing_free' && !flags.hasMissingFree) return false;
      if (archiveFilter === 'rate_mismatch' && !flags.hasRateMismatch) return false;
      if (archiveFilter === 'due_alert' && !flags.hasDueAlert) return false;
      if (archiveFilter === 'uncertain' && !flags.hasUncertain) return false;

      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.dueTag.toLowerCase().includes(q) ||
        item.noteText.toLowerCase().includes(q) ||
        (item.verification?.header.invoiceOrChalanNo || '').toLowerCase().includes(q) ||
        (item.verification?.header.companyOrSupplier || '').toLowerCase().includes(q)
      );
    });
  }, [savedNotes, searchQuery, archiveFilter]);

  async function handleImageFiles(files: FileList | null, role: 'current' | 'previous') {
    if (!files || files.length === 0) return;
    setErrorMsg(null);

    const maxLimit = role === 'current' ? 4 : 2;
    const existingList = role === 'current' ? currentImages : previousImages;
    const remaining = maxLimit - existingList.length;

    if (remaining <= 0) {
      setErrorMsg(
        role === 'current'
          ? 'বর্তমান চালানের জন্য সর্বোচ্চ ৪টি ছবি যোগ করা যাবে।'
          : 'তুলনার চালানের জন্য সর্বোচ্চ ২টি ছবি যোগ করা যাবে।'
      );
      return;
    }

    const pickedFiles = Array.from(files).slice(0, remaining);
    const added: UploadedImageItem[] = [];

    for (const file of pickedFiles) {
      try {
        const processed = await processChalanImage(file);
        added.push({
          id: createStandaloneNoteId(),
          name: file.name,
          mimeType: processed.mimeType,
          originalDataUrl: processed.dataUrl,
          dataUrl: processed.dataUrl,
          role,
          rotationDeg: 0,
          crop: { ...DEFAULT_CROP },
          enhanceContrast: false,
          quality: processed.quality,
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'ছবি প্রসেস করতে সমস্যা হয়েছে।');
      }
    }

    if (added.length > 0) {
      if (role === 'current') {
        setCurrentImages((prev) => [...prev, ...added]);
      } else {
        setPreviousImages((prev) => [...prev, ...added]);
        setShowComparePanel(true);
      }
    }
  }

  function removeUploadedImage(id: string, role: 'current' | 'previous') {
    if (role === 'current') {
      setCurrentImages((prev) => prev.filter((img) => img.id !== id));
    } else {
      setPreviousImages((prev) => prev.filter((img) => img.id !== id));
    }
  }

  function openImageEditor(item: UploadedImageItem) {
    setEditingImage(item);
    setEditRotation(item.rotationDeg);
    setEditCrop(item.crop);
    setEditEnhance(item.enhanceContrast);
    setEditPreviewUrl(item.dataUrl);
    setEditPreviewQuality(item.quality);
  }

  function applyImageEditorChanges() {
    if (!editingImage || !editPreviewUrl || !editPreviewQuality) return;
    const updatedItem: UploadedImageItem = {
      ...editingImage,
      dataUrl: editPreviewUrl,
      rotationDeg: editRotation,
      crop: editCrop,
      enhanceContrast: editEnhance,
      quality: editPreviewQuality,
    };

    if (editingImage.role === 'current') {
      setCurrentImages((prev) =>
        prev.map((img) => (img.id === updatedItem.id ? updatedItem : img))
      );
    } else {
      setPreviousImages((prev) =>
        prev.map((img) => (img.id === updatedItem.id ? updatedItem : img))
      );
    }
    setEditingImage(null);
    setStatusBanner('ছবি ক্রপ / রোটেট / পরিষ্কার করা হয়েছে।');
  }

  async function handleVerifyChalan() {
    setErrorMsg(null);
    setStatusBanner(null);

    if (currentImages.length === 0 && !chalanText.trim()) {
      setErrorMsg('যাচাই শুরু করতে অন্তত ১টি চালানের ছবি আপলোড করুন অথবা চালানের লেখা দিন।');
      return;
    }

    setIsAnalyzing(true);
    try {
      const payloadImages = [
        ...currentImages.map((img) => ({
          mimeType: img.mimeType,
          data: img.dataUrl,
          role: 'current' as const,
          label: img.name,
        })),
        ...previousImages.map((img) => ({
          mimeType: img.mimeType,
          data: img.dataUrl,
          role: 'previous' as const,
          label: img.name,
        })),
      ];

      const res = await fetch('/api/chalan-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: payloadImages,
          chalanText: chalanText.trim(),
          comparisonText: comparisonText.trim(),
          extraNote: extraNote.trim(),
        }),
      });

      const body = (await res.json().catch(() => null)) as {
        result?: ChalanVerificationResult;
        error?: string;
      } | null;

      if (!res.ok || !body?.result) {
        throw new Error(
          body?.error || 'চালান বিশ্লেষণ করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।'
        );
      }

      const verified = body.result;
      setResult(verified);
      setIsSamplePreview(false);
      setResultFilter('all');

      if (!noteTitle.trim()) {
        const autoTitleParts = [
          verified.header.companyOrSupplier || 'চালান যাচাই',
          verified.header.invoiceOrChalanNo ? `#${verified.header.invoiceOrChalanNo}` : '',
          verified.header.invoiceDate ? `(${verified.header.invoiceDate})` : '',
        ].filter(Boolean);
        setNoteTitle(autoTitleParts.join(' '));
      }
      if (!noteDueTag.trim() && verified.header.dueNumbers.length > 0) {
        setNoteDueTag(verified.header.dueNumbers.join(', '));
      }

      setStatusBanner('চালান যাচাই সম্পন্ন হয়েছে। নিচে রেট, ফ্রি, ডিউ এবং অস্পষ্ট সতর্কতা দেখুন।');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'সার্ভারের সাথে সংযোগে সমস্যা হয়েছে।'
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleAppendSummaryToNote() {
    if (!result) return;
    const summaryBlock = formatChalanVerificationAsText(result);
    if (!summaryBlock) return;
    setNoteText((prev) => (prev.trim() ? `${prev.trim()}\n\n${summaryBlock}` : summaryBlock));
    setStatusBanner('AI বিশ্লেষণের সারসংক্ষেপ আপনার নোট বক্সে যোগ করা হয়েছে।');
  }

  function handleSaveNote(forceNew = false) {
    setErrorMsg(null);
    const trimmedTitle =
      noteTitle.trim() ||
      (result?.header.companyOrSupplier
        ? `${result.header.companyOrSupplier} চালান নোট`
        : `চালান নোট (${new Date().toLocaleDateString('bn-BD')})`);

    const trimmedNote = noteText.trim() || result?.quickSummaryBn.trim() || '';
    if (!trimmedNote && !result && !chalanText.trim()) {
      setErrorMsg('সেভ করার জন্য নোট লিখুন অথবা আগে একটি চালান যাচাই করুন।');
      return;
    }

    const nowIso = new Date().toISOString();
    let updatedList: ChalanSavedNote[];

    if (!forceNew && editingNoteId) {
      updatedList = savedNotes.map((item) =>
        item.id === editingNoteId
          ? {
              ...item,
              title: trimmedTitle,
              dueTag: noteDueTag.trim(),
              noteText: trimmedNote,
              chalanText: chalanText.trim(),
              comparisonText: comparisonText.trim(),
              verification: result ?? item.verification,
              updatedAt: nowIso,
            }
          : item
      );
      setStatusBanner('সংরক্ষিত চালান ও নোট আপডেট করা হয়েছে (মূল হিসাবে কোনো পরিবর্তন হয়নি)।');
    } else {
      const newRecord: ChalanSavedNote = {
        id: createStandaloneNoteId(),
        title: trimmedTitle,
        dueTag: noteDueTag.trim(),
        noteText: trimmedNote,
        chalanText: chalanText.trim(),
        comparisonText: comparisonText.trim(),
        verification: result,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      updatedList = [newRecord, ...savedNotes];
      setEditingNoteId(newRecord.id);
      setStatusBanner('নতুন চালান যাচাই ও নোট আলাদা স্টোরেজে সেভ করা হয়েছে।');
    }

    const saved = saveChalanSavedNotes(updatedList);
    if (!saved.ok) {
      setErrorMsg(saved.error || 'নোট সেভ করা যায়নি।');
      return;
    }
    setSavedNotes(updatedList);
  }

  saveNoteRef.current = handleSaveNote;

  function handleLoadSavedNote(item: ChalanSavedNote) {
    setEditingNoteId(item.id);
    setNoteTitle(item.title);
    setNoteDueTag(item.dueTag);
    setNoteText(item.noteText);
    setChalanText(item.chalanText || '');
    setComparisonText(item.comparisonText || '');
    if (item.comparisonText) {
      setShowComparePanel(true);
    }
    setResult(item.verification);
    setResultFilter('all');
    setErrorMsg(null);
    setStatusBanner(`"${item.title}" লোড করা হয়েছে।`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleUseSavedAsComparisonBaseline(item: ChalanSavedNote) {
    const baselineParts: string[] = [`রেফারেন্স চালান: ${item.title}`];
    if (item.dueTag) baselineParts.push(`ডিউ নম্বর: ${item.dueTag}`);
    if (item.verification) {
      baselineParts.push(formatChalanVerificationAsText(item.verification));
    } else if (item.chalanText) {
      baselineParts.push(item.chalanText);
    }
    if (item.noteText) {
      baselineParts.push(`নোট: ${item.noteText}`);
    }
    setComparisonText(baselineParts.join('\n'));
    setShowComparePanel(true);
    setActiveSubTab('verify');
    setStatusBanner(`"${item.title}" তুলনার ভিত্তি (Baseline) হিসেবে যুক্ত হয়েছে।`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleDeleteSavedNote(id: string) {
    const updated = savedNotes.filter((item) => item.id !== id);
    const saved = saveChalanSavedNotes(updated);
    if (!saved.ok) {
      setErrorMsg(saved.error || 'মুছতে সমস্যা হয়েছে।');
      return;
    }
    setSavedNotes(updated);
    if (editingNoteId === id) {
      setEditingNoteId(null);
    }
    setConfirmDeleteId(null);
    setStatusBanner('নোট মুছে ফেলা হয়েছে।');
  }

  function handleLoadSampleChalanTest() {
    const sample = createSampleStandaloneChalanTest();
    setCurrentImages([]);
    setPreviousImages([]);
    setEditingNoteId(null);
    setChalanText(sample.chalanText);
    setComparisonText(sample.comparisonText);
    setShowComparePanel(true);
    setNoteTitle(sample.title);
    setNoteDueTag(sample.dueTag);
    setNoteText(sample.noteText);
    setResult(sample.result);
    setResultFilter('all');
    setIsSamplePreview(true);
    setActiveSubTab('verify');
    setErrorMsg(null);
    setStatusBanner(
      'স্যাম্পল চালান টেস্ট লোড হয়েছে — ফিল্টার, কপি, CSV ও প্রিন্ট পরীক্ষা করে "টেস্ট পরিষ্কার" চাপতে পারেন।'
    );
  }

  function handleClearWorkspace() {
    setCurrentImages([]);
    setPreviousImages([]);
    setChalanText('');
    setComparisonText('');
    setExtraNote('');
    setShowComparePanel(false);
    setResult(null);
    setResultFilter('all');
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteDueTag('');
    setNoteText('');
    setIsSamplePreview(false);
    setErrorMsg(null);
    clearStandaloneChalanDraft();
    setStatusBanner('ফর্ম ও বর্তমান ফলাফল পরিষ্কার করা হয়েছে (সেভ করা নোট নিরাপদ আছে)।');
  }

  async function handleCopyText(text: string, key: string) {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2200);
    } catch {
      setErrorMsg('কপি করা যায়নি। ব্রাউজার ক্লিপবোর্ড অনুমতি যাচাই করুন।');
    }
  }

  function handlePrintMemo(payload: {
    title: string;
    dueTag: string;
    noteText: string;
    verification: ChalanVerificationResult | null;
  }) {
    setPrintPayload(payload);
    document.body.classList.add('printing-chalan-memo-only');
    const cleanup = () => {
      document.body.classList.remove('printing-chalan-memo-only');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      window.print();
    }, 60);
    window.setTimeout(cleanup, 1500);
  }

  const fullCopyPayload = useMemo(() => {
    const parts: string[] = [];
    if (noteTitle.trim()) parts.push(`শিরোনাম: ${noteTitle.trim()}`);
    if (noteDueTag.trim()) parts.push(`ডিউ নম্বর: ${noteDueTag.trim()}`);
    if (noteText.trim()) {
      parts.push('');
      parts.push('--- ব্যক্তিগত নোট ---');
      parts.push(noteText.trim());
    }
    if (result) {
      parts.push('');
      parts.push(formatChalanVerificationAsText(result));
    }
    return parts.join('\n').trim();
  }, [noteTitle, noteDueTag, noteText, result]);

  const anyImageQualityIssue = useMemo(() => {
    return [...currentImages, ...previousImages].some(
      (img) => img.quality.isDark || img.quality.isBlurry
    );
  }, [currentImages, previousImages]);

  // Auto-match company in Verification Results by company name (or user dropdown selection)
  const matchedResultCompany = useMemo(() => {
    if (companies.length === 0) return null;
    if (resultManualCompanyId) {
      const explicit = companies.find((c) => c.id === resultManualCompanyId);
      if (explicit) return explicit;
    }
    const supplier = result?.header.companyOrSupplier?.toLowerCase().trim() || '';
    if (supplier) {
      const found = companies.find((c) => {
        const cname = c.name.toLowerCase().trim();
        const firstWord = cname.split(/[\s[\]()/]+/)[0];
        return (
          supplier.includes(cname) ||
          cname.includes(supplier) ||
          (firstWord.length >= 2 && supplier.includes(firstWord))
        );
      });
      if (found) return found;
    }
    return companies[0] ?? null;
  }, [companies, result?.header.companyOrSupplier, resultManualCompanyId]);

  async function handleUploadRepLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setIsUploadingRepLogo(true);
    try {
      const compressed = await compressImageFileToDataUrl(file, 320, 0.84);
      setRepLogoUrl(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'লোগো পড়া যায়নি।');
    } finally {
      setIsUploadingRepLogo(false);
      e.target.value = '';
    }
  }

  function handleSaveCompanyProfileMeta() {
    if (!selectedRepCompany || !onUpdateCompanyProfileMeta) return;
    const cleanedSrs: CompanyRepContact[] = repSrContacts
      .map((sr) => ({
        id: sr.id || generateId('sr'),
        name: sr.name.trim(),
        phone: sr.phone.trim(),
        role: 'SR' as const,
      }))
      .filter((sr) => sr.name || sr.phone);

    onUpdateCompanyProfileMeta(selectedRepCompany.id, {
      logoUrl: repLogoUrl.trim() || undefined,
      tsmName: repTsmName.trim() || undefined,
      tsmPhone: repTsmPhone.trim() || undefined,
      srContacts: cleanedSrs,
    });
    setStatusBanner(
      `"${selectedRepCompany.name}" কোম্পানির লোগো ও TSM/SR নম্বর সংরক্ষণ করা হয়েছে (হিসাবে কোনো পরিবর্তন হয়নি)।`
    );
  }

  function handleAddStandaloneRep(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!newRepPhone.trim()) {
      setErrorMsg('অন্তত একটি মোবাইল নম্বর দিন।');
      return;
    }
    const created: StandaloneRepContact = {
      id: createStandaloneNoteId(),
      companyName: newRepCompany.trim() || 'সাধারণ / ডিলার',
      role: newRepRole,
      name: newRepName.trim(),
      phone: newRepPhone.trim(),
      note: newRepNote.trim(),
    };
    const updated = [created, ...standaloneReps];
    const saved = saveStandaloneChalanReps(updated);
    if (!saved.ok) {
      setErrorMsg(saved.error || 'সেভ করা যায়নি।');
      return;
    }
    setStandaloneReps(updated);
    setNewRepCompany('');
    setNewRepName('');
    setNewRepPhone('');
    setNewRepNote('');
    setStatusBanner('অতিরিক্ত প্রতিনিধি নম্বর আলাদাভাবে সেভ করা হয়েছে।');
  }

  function handleDeleteStandaloneRep(id: string) {
    const updated = standaloneReps.filter((r) => r.id !== id);
    const saved = saveStandaloneChalanReps(updated);
    if (!saved.ok) {
      setErrorMsg(saved.error || 'মুছতে সমস্যা হয়েছে।');
      return;
    }
    setStandaloneReps(updated);
    setStatusBanner('নম্বর তালিকা থেকে সরানো হয়েছে।');
  }

  return (
    <>
      <div className="chalan-screen-only space-y-6">
        {/* Standalone Isolation Header & Notice Banner */}
        <section className="rounded-2xl border border-indigo-200 bg-white p-4 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-extrabold text-indigo-900">
                <ClipboardCheck className="h-3.5 w-3.5 text-indigo-700" />
                স্বতন্ত্র চালান যাচাই ও ব্যক্তিগত নোট
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0f172a]">
                চালান যাচাই ও নোট
              </h1>
              <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
                এখানে চালানের ছবি আপলোড করে প্রোডাক্টের সঠিক রেট, ফ্রি/মিসিং ফ্রি আইটেম, ডিউ নম্বর এবং
                আনডেলিভারি/ডেলিভারি শেষ সংখ্যার অমিল যাচাই করুন এবং আলাদাভাবে নোট সেভ, প্রিন্ট বা এক্সপোর্ট করুন।
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start shrink-0">
              <button
                type="button"
                onClick={() => handleSaveNote(false)}
                title="দ্রুত নোট সেভ (Ctrl+S)"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-xs sm:text-sm font-extrabold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
              >
                <Save className="h-4 w-4" />
                {editingNoteId ? 'নোট আপডেট' : 'নোট সেভ'}
              </button>

              <button
                type="button"
                onClick={() => void handleCopyText(fullCopyPayload, 'header_copy')}
                disabled={!fullCopyPayload}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs sm:text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-45 whitespace-nowrap"
              >
                {copiedKey === 'header_copy' ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    কপি হয়েছে
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    নোট কপি
                  </>
                )}
              </button>

              {!isSamplePreview ? (
                <button
                  type="button"
                  onClick={handleLoadSampleChalanTest}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs sm:text-sm font-bold text-amber-950 transition-colors hover:bg-amber-100 whitespace-nowrap"
                >
                  <Sparkles className="h-4 w-4 text-amber-700" />
                  স্যাম্পল টেস্ট
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClearWorkspace}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs sm:text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 whitespace-nowrap"
                >
                  <Trash2 className="h-4 w-4" />
                  টেস্ট পরিষ্কার
                </button>
              )}

              <button
                type="button"
                onClick={handleClearWorkspace}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs sm:text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap"
              >
                <RefreshCw className="h-4 w-4" />
                নতুন করে শুরু
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50/85 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-teal-950">
              <ShieldAlert className="h-4 w-4 text-teal-700 mt-0.5 shrink-0" />
              <span>
                সম্পূর্ণ বিচ্ছিন্ন মোড: এখানে কোনো চালান আপলোড, নোট, লোগো বা TSM/SR নম্বর সেভ করলে মূল অ্যাপের ক্যাশ, স্টক,
                কাস্টমার বাকি, লাভ-লস বা কোনো কোম্পানির টাকার হিসাবে সংযোগ বা পরিবর্তন হবে না।
              </span>
            </div>

            {serverReadyWarning && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-amber-950">
                <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                <span>
                  চালান যাচাই চালানোর জন্য সার্ভারে GEMINI_API_KEY সেট করা প্রয়োজন (Settings &gt; Secrets বা ডিপ্লয়মেন্ট Environment Variables চেক করুন)। নোট লেখা, সেভ ও এক্সপোর্ট অফলাইনেও কাজ করবে।
                </span>
              </div>
            )}
          </div>

          {/* Mobile-Friendly Horizontal Scrollable Sub-Tabs */}
          <div className="mt-4 border-t border-slate-200 pt-3">
            <div
              role="tablist"
              aria-label="চালান যাচাই ও নোট সাব-ট্যাব"
              className="flex flex-nowrap overflow-x-auto no-scrollbar items-center gap-2 pb-0.5"
            >
              {(
                [
                  {
                    id: 'verify' as const,
                    label: 'চালান যাচাই',
                    Icon: ClipboardCheck,
                    badge: result ? 'ফলাফল' : undefined,
                  },
                  {
                    id: 'notes' as const,
                    label: 'নোট খাতা',
                    Icon: NotebookPen,
                    badge: savedNotes.length,
                  },
                  {
                    id: 'reps_logos' as const,
                    label: 'প্রতিনিধি ও লোগো',
                    Icon: Building2,
                    badge: companies.length + standaloneReps.length,
                  },
                ] as const
              ).map((tab) => {
                const isActive = activeSubTab === tab.id;
                const TabIcon = tab.Icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveSubTab(tab.id)}
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3.5 sm:px-4 text-xs sm:text-sm font-extrabold transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white shadow-xs'
                        : 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-blue-50 hover:border-blue-300 hover:text-[#1E3A8A]'
                    }`}
                  >
                    <TabIcon className="h-4 w-4 shrink-0" />
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span
                        className={`font-mono-tabular rounded-md px-1.5 py-0.5 text-[11px] font-extrabold leading-none ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Error / Status Alerts */}
        {errorMsg && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              aria-label="বন্ধ করুন"
              className="rounded-lg p-1 text-rose-700 hover:bg-rose-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {statusBanner && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{statusBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              aria-label="বন্ধ করুন"
              className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* SUB-TAB 1: CHALAN VERIFY */}
        {activeSubTab === 'verify' && (
          <div className="space-y-6">
            <div className="space-y-6">
            {/* Upload & Input Card */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-[#0f172a] flex items-center gap-2">
                  <Upload className="h-4 w-4 text-[#1E3A8A]" />
                  চালানের ছবি বা তথ্য দিন
                </h2>
                <span className="text-xs font-semibold text-slate-500">
                  সর্বোচ্চ ৪টি ছবি · রোটেট ও ক্রপ সুবিধা
                </span>
              </div>

              {/* Hidden File Inputs */}
              <input
                ref={currentFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleImageFiles(e.target.files, 'current');
                  e.target.value = '';
                }}
              />
              <input
                ref={currentCameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void handleImageFiles(e.target.files, 'current');
                  e.target.value = '';
                }}
              />
              <input
                ref={previousFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleImageFiles(e.target.files, 'previous');
                  e.target.value = '';
                }}
              />

              {/* Camera Framing Tip & Upload Buttons */}
              <div className="rounded-xl border border-blue-200/80 bg-blue-50/55 px-3 py-2 text-xs font-semibold text-[#1E3A8A]">
                ভালো ফলাফলের টিপস: উজ্জ্বল আলোতে চালান সোজা রেখে পুরো কাগজ ফ্রেমে ধরুন। বাঁকা বা অন্ধকার হলে ছবির ওপর{' '}
                <span className="font-extrabold">ক্রপ / রোটেট / স্পষ্ট</span> বাটন চাপুন।
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => currentFileInputRef.current?.click()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#1E3A8A]/35 bg-blue-50/70 px-4 py-2.5 text-sm font-bold text-[#1E3A8A] transition-colors hover:bg-blue-100/70"
                >
                  <ImagePlus className="h-4 w-4 shrink-0" />
                  গ্যালারি থেকে চালান ছবি
                </button>
                <button
                  type="button"
                  onClick={() => currentCameraInputRef.current?.click()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-100"
                >
                  <Camera className="h-4 w-4 text-slate-700 shrink-0" />
                  ক্যামেরা দিয়ে ছবি তুলুন
                </button>
              </div>

              {/* Uploaded Current Images Preview with Quality Alerts & Crop/Rotate */}
              {currentImages.length > 0 && (
                <div className="space-y-2.5">
                  {anyImageQualityIssue && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
                      <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                      <span>
                        কিছু ছবিতে আলো কম বা হালকা ঝাপসা ভাব শনাক্ত হয়েছে — "ক্রপ / রোটেট" খুলে{' '}
                        <strong>লেখা স্পষ্ট করুন</strong> চালু করলে সংখ্যা ও k/ps আরও নির্ভুলভাবে পড়া যাবে।
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {currentImages.map((img, idx) => {
                      const hasQualityWarning = img.quality.isDark || img.quality.isBlurry;
                      return (
                        <div
                          key={img.id}
                          className={`overflow-hidden rounded-xl border bg-slate-50 flex flex-col ${
                            hasQualityWarning ? 'border-amber-300' : 'border-slate-200'
                          }`}
                        >
                          <div className="relative">
                            <img
                              src={img.dataUrl}
                              alt={`চালান ${idx + 1}`}
                              className="h-28 w-full object-cover"
                            />
                            <span
                              className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-extrabold shadow-xs ${
                                hasQualityWarning
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-emerald-600 text-white'
                              }`}
                            >
                              {img.quality.isDark
                                ? 'আলো কম'
                                : img.quality.isBlurry
                                  ? 'ঝাপসা হতে পারে'
                                  : 'স্পষ্ট'}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeUploadedImage(img.id, 'current')}
                              className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1 text-rose-600 shadow-xs hover:bg-rose-50"
                              aria-label="ছবি সরান"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-1 bg-white px-2 py-1.5 text-[11px] font-bold">
                            <span className="text-slate-700 truncate">পৃষ্ঠা {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => openImageEditor(img)}
                              className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-extrabold text-[#1E3A8A] hover:bg-blue-100 whitespace-nowrap"
                            >
                              <Crop className="h-3 w-3" />
                              ক্রপ/রোটেট
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Current Chalan Text Input */}
              <div>
                <label
                  htmlFor="standalone-chalan-text"
                  className="block text-xs sm:text-sm font-bold text-slate-700 mb-1"
                >
                  চালানের লেখা / প্রোডাক্ট ও ডিউ নম্বর (ঐচ্ছিক — ছবি ছাড়াও যাচাই করা যাবে)
                </label>
                <textarea
                  id="standalone-chalan-text"
                  rows={3}
                  value={chalanText}
                  onChange={(e) => setChalanText(e.target.value)}
                  placeholder="যেমন: DH 2304678 — Mango Juice 10k মোট 14500 টাকা, Biscuit 5k 0 Free..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/20"
                />
              </div>

              {/* Toggle Comparison / Previous Chalan Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowComparePanel((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#1E3A8A] hover:underline"
                  >
                    <History className="h-4 w-4" />
                    {showComparePanel
                      ? 'আগের চালান / আনডেলিভারি তুলনা লুকান'
                      : '+ আগের চালান / আনডেলিভারি স্লিপের সাথে তুলনা করুন (ঐচ্ছিক)'}
                  </button>
                  {(previousImages.length > 0 || comparisonText.trim()) && (
                    <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800">
                      তুলনা যুক্ত আছে
                    </span>
                  )}
                </div>

                {showComparePanel && (
                  <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => previousFileInputRef.current?.click()}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 text-xs sm:text-sm font-bold text-indigo-900 hover:bg-indigo-50"
                      >
                        <ImagePlus className="h-4 w-4 text-indigo-700" />
                        আগের/আনডেলিভারি ছবি দিন (সর্বোচ্চ ২টি)
                      </button>
                      {previousImages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setPreviousImages([])}
                          className="text-xs font-semibold text-rose-600 hover:underline"
                        >
                          ছবি মুছুন
                        </button>
                      )}
                    </div>

                    {previousImages.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {previousImages.map((img, idx) => (
                          <div
                            key={img.id}
                            className="overflow-hidden rounded-lg border border-indigo-200 bg-white"
                          >
                            <div className="relative">
                              <img
                                src={img.dataUrl}
                                alt={`আগের চালান ${idx + 1}`}
                                className="h-20 w-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removeUploadedImage(img.id, 'previous')}
                                className="absolute right-1 top-1 rounded-full bg-white/95 p-0.5 text-rose-600 shadow-xs"
                                aria-label="ছবি সরান"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-slate-700">
                              <span className="truncate">তুলনা {idx + 1}</span>
                              <button
                                type="button"
                                onClick={() => openImageEditor(img)}
                                className="text-[#1E3A8A] font-bold hover:underline"
                              >
                                ক্রপ/রোটেট
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="standalone-compare-text"
                        className="block text-xs font-bold text-slate-700 mb-1"
                      >
                        আগের চালান বা সংরক্ষিত ডিউ নম্বর তথ্য (নিচের তালিকা থেকে "তুলনায় নিন" চাপলেও এখানে আসবে)
                      </label>
                      <textarea
                        id="standalone-compare-text"
                        rows={2}
                        value={comparisonText}
                        onChange={(e) => setComparisonText(e.target.value)}
                        placeholder="আগের চালানের ডিউ নম্বর, ডেলিভারি/আনডেলিভারি নম্বর বা মিসিং আইটেম..."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Extra Instruction */}
              <div>
                <label
                  htmlFor="standalone-extra-note"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  কী বিশেষভাবে যাচাই করতে চান? (ঐচ্ছিক)
                </label>
                <input
                  id="standalone-extra-note"
                  type="text"
                  value={extraNote}
                  onChange={(e) => setExtraNote(e.target.value)}
                  placeholder="যেমন: ২ কার্টনে ১ পিস ফ্রি ঠিক আছে কিনা এবং শেষের ৩ সংখ্যা মিলেছে কিনা দেখুন"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
              </div>

              {/* Primary Verify CTA */}
              <button
                type="button"
                onClick={() => void handleVerifyChalan()}
                disabled={isAnalyzing}
                className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] px-5 py-3 text-sm sm:text-base font-extrabold text-white shadow-xs transition-colors hover:bg-[#172e6e] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    চালান বিশ্লেষণ চলছে... অনুগ্রহ করে অপেক্ষা করুন
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    চালান যাচাই করুন
                  </>
                )}
              </button>
            </section>

            {/* AI Verification Structured Results */}
            {result && (
              <section className="space-y-4">
                {/* Header Info + Highlight Issue Badges + Filter Pills + Export Bar */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500">চালান সারাংশ ও জরুরি অবস্থা</p>
                      <h3 className="text-lg font-extrabold text-[#0f172a]">
                        {result.header.companyOrSupplier || 'প্রতিষ্ঠানের নাম পাওয়া যায়নি'}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleSaveNote(false);
                          setActiveSubTab('notes');
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-extrabold text-white hover:bg-teal-800"
                      >
                        <Save className="h-3.5 w-3.5" />
                        নোট খাতায় সেভ ও যান
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyText(fullCopyPayload, 'result_copy')}
                        disabled={!fullCopyPayload}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-45"
                      >
                        {copiedKey === 'result_copy' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        কপি
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleAppendSummaryToNote();
                          setActiveSubTab('notes');
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100"
                      >
                        <NotebookPen className="h-3.5 w-3.5" />
                        নোটে যোগ
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadChalanNoteAsCsv({
                            title: noteTitle || result.header.companyOrSupplier || 'chalan',
                            dueTag: noteDueTag || result.header.dueNumbers.join(', '),
                            noteText,
                            verification: result,
                          })
                        }
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-2.5 text-xs font-bold text-teal-900 hover:bg-teal-100"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handlePrintMemo({
                            title: noteTitle || result.header.companyOrSupplier || 'চালান যাচাই রিপোর্ট',
                            dueTag: noteDueTag || result.header.dueNumbers.join(', '),
                            noteText,
                            verification: result,
                          })
                        }
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        প্রিন্ট
                      </button>
                    </div>
                  </div>

                  {/* Quick TSM / SR Contact Bar Inside Chalan Verification */}
                  {companies.length > 0 && (
                    <div className="rounded-xl border border-blue-200/80 bg-blue-50/45 p-3 space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {matchedResultCompany && (
                            <CompanyLogoAvatar
                              name={matchedResultCompany.name}
                              logoUrl={matchedResultCompany.logoUrl}
                              className="h-8 w-8 rounded-lg"
                              textClassName="text-xs font-extrabold"
                            />
                          )}
                          <div className="min-w-0">
                            <span className="block text-[11px] font-bold text-[#1E3A8A]">
                              চালানে সমস্যা হলে দ্রুত প্রতিনিধি (TSM / SR) কল বা কপি করুন
                            </span>
                            <span className="block truncate text-xs font-extrabold text-slate-900">
                              {matchedResultCompany?.name || 'কোম্পানি বাছুন'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            aria-label="প্রতিনিধির কোম্পানি বাছুন"
                            value={matchedResultCompany?.id || ''}
                            onChange={(e) => setResultManualCompanyId(e.target.value)}
                            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 text-[16px] sm:text-xs font-bold text-slate-800 focus:border-[#1E3A8A] focus:outline-none"
                          >
                            {companies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              if (matchedResultCompany) {
                                setSelectedRepCompanyId(matchedResultCompany.id);
                              }
                              setActiveSubTab('reps_logos');
                            }}
                            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-blue-300 bg-white px-2.5 text-xs font-bold text-[#1E3A8A] hover:bg-blue-50 whitespace-nowrap"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            সব নম্বর / এডিট
                          </button>
                        </div>
                      </div>

                      {matchedResultCompany && (
                        <CompanyRepsStrip company={matchedResultCompany} />
                      )}
                    </div>
                  )}

                  {/* High-Contrast Anomaly & Total Amount Callout Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2">
                      <span className="block text-[10.5px] font-bold text-[#1E3A8A]">মোট বিল অঙ্ক</span>
                      <span className="font-mono-tabular text-base font-extrabold text-[#0f172a]">
                        {formatMoney(resultCounts.totalPaidAmount)}
                      </span>
                    </div>
                    <div
                      className={`rounded-xl border px-3 py-2 ${
                        resultCounts.rateMismatch > 0
                          ? 'border-rose-300 bg-rose-50'
                          : 'border-emerald-200 bg-emerald-50/60'
                      }`}
                    >
                      <span className="block text-[10.5px] font-bold text-slate-700">রেটে অমিল</span>
                      <span
                        className={`font-mono-tabular text-base font-extrabold ${
                          resultCounts.rateMismatch > 0 ? 'text-rose-800' : 'text-emerald-800'
                        }`}
                      >
                        {resultCounts.rateMismatch}টি
                      </span>
                    </div>
                    <div
                      className={`rounded-xl border px-3 py-2 ${
                        resultCounts.missingFreeCount > 0
                          ? 'border-rose-300 bg-rose-50'
                          : 'border-emerald-200 bg-emerald-50/60'
                      }`}
                    >
                      <span className="block text-[10.5px] font-bold text-slate-700">ফ্রি মিসিং</span>
                      <span
                        className={`font-mono-tabular text-base font-extrabold ${
                          resultCounts.missingFreeCount > 0 ? 'text-rose-800' : 'text-emerald-800'
                        }`}
                      >
                        {resultCounts.missingFreeCount}টি
                      </span>
                    </div>
                    <div
                      className={`rounded-xl border px-3 py-2 ${
                        resultCounts.dueAlerts > 0
                          ? 'border-amber-300 bg-amber-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <span className="block text-[10.5px] font-bold text-slate-700">ডিউ/শেষ সংখ্যা</span>
                      <span
                        className={`font-mono-tabular text-base font-extrabold ${
                          resultCounts.dueAlerts > 0 ? 'text-amber-900' : 'text-slate-700'
                        }`}
                      >
                        {resultCounts.dueAlerts}টি
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="block text-[11px] font-bold text-slate-500">চালান / ইনভয়েস নং</span>
                      <span className="font-mono-tabular text-[15px] font-extrabold text-slate-900">
                        {result.header.invoiceOrChalanNo || 'অস্পষ্ট / নেই'}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="block text-[11px] font-bold text-slate-500">তারিখ</span>
                      <span className="font-mono-tabular text-[15px] font-extrabold text-slate-900">
                        {result.header.invoiceDate || 'পাওয়া যায়নি'}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="block text-[11px] font-bold text-slate-500">শনাক্তকৃত ডিউ নম্বর</span>
                      <span className="font-mono-tabular text-[15px] font-extrabold text-[#1E3A8A]">
                        {result.header.dueNumbers.length > 0
                          ? result.header.dueNumbers.join(', ')
                          : 'নেই'}
                      </span>
                    </div>
                  </div>

                  {/* Result Highlight & Quick Filter Bar */}
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-3">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 mr-1">
                      <Filter className="h-3.5 w-3.5" />
                      ফিল্টার:
                    </span>
                    <button
                      type="button"
                      onClick={() => setResultFilter('all')}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold transition-colors ${
                        resultFilter === 'all'
                          ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      সবগুলো
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultFilter('rate_mismatch')}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold transition-colors ${
                        resultFilter === 'rate_mismatch'
                          ? 'border-rose-700 bg-rose-700 text-white'
                          : resultCounts.rateMismatch > 0
                            ? 'border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      রেটে অমিল ({resultCounts.rateMismatch})
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultFilter('free_issues')}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold transition-colors ${
                        resultFilter === 'free_issues'
                          ? 'border-amber-700 bg-amber-700 text-white'
                          : result.missingFreeAlerts.length > 0
                            ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      ফ্রি / মিসিং ({resultCounts.freeAndMissing})
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultFilter('due_alerts')}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold transition-colors ${
                        resultFilter === 'due_alerts'
                          ? 'border-indigo-800 bg-indigo-800 text-white'
                          : resultCounts.dueAlerts > 0
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-950 hover:bg-indigo-100'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      ডিউ/শেষ সংখ্যা সতর্কতা ({resultCounts.dueAlerts})
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultFilter('uncertain')}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold transition-colors ${
                        resultFilter === 'uncertain'
                          ? 'border-amber-700 bg-amber-700 text-white'
                          : resultCounts.uncertain > 0
                            ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      অস্পষ্ট অংশ ({resultCounts.uncertain})
                    </button>
                  </div>

                  {result.header.summaryNote && (
                    <p className="text-xs sm:text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
                      {result.header.summaryNote}
                    </p>
                  )}
                </div>

                {/* Uncertain / Blurry Warnings */}
                {(resultFilter === 'all' || resultFilter === 'uncertain') &&
                  result.uncertainOrBlurryWarnings.length > 0 && (
                    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/90 p-4 sm:p-5 space-y-2.5">
                      <h4 className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-amber-950">
                        <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
                        অস্পষ্ট বা সন্দেহজনক তথ্য সতর্কতা (অনুমান করা হয়নি)
                      </h4>
                      <ul className="space-y-2">
                        {result.uncertainOrBlurryWarnings.map((warn, idx) => (
                          <li
                            key={`${warn.fieldOrLine}-${idx}`}
                            className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs sm:text-sm text-amber-950"
                          >
                            <span className="font-extrabold">{warn.fieldOrLine}: </span>
                            <span>{warn.reason}</span>
                            {warn.rawSnippet && (
                              <span className="mt-1 block font-mono-tabular text-xs font-bold text-amber-800">
                                দৃশ্যমান অংশ: {warn.rawSnippet}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Missing Free Alerts */}
                {(resultFilter === 'all' || resultFilter === 'free_issues') &&
                  result.missingFreeAlerts.length > 0 && (
                    <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/85 p-4 sm:p-5 space-y-2.5">
                      <h4 className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-rose-950">
                        <Gift className="h-4 w-4 text-rose-700 shrink-0" />
                        ফ্রি প্রোডাক্ট মিসিং / স্কিম সতর্কতা ({result.missingFreeAlerts.length}টি)
                      </h4>
                      <ul className="space-y-2">
                        {result.missingFreeAlerts.map((alert, idx) => (
                          <li
                            key={`${alert.productName}-${idx}`}
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-800"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-extrabold text-rose-900">{alert.productName}</span>
                              {alert.dueNumber && (
                                <span className="font-mono-tabular rounded bg-rose-100 px-2 py-0.5 text-[11px] font-extrabold text-rose-800">
                                  {alert.dueNumber}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-slate-700">{alert.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Paid Items & Calculated Rate Table (Desktop + Clear Mobile Cards) */}
                {(resultFilter === 'all' ||
                  resultFilter === 'rate_mismatch' ||
                  resultFilter === 'uncertain') && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm sm:text-base font-extrabold text-[#0f172a]">
                        মূল প্রোডাক্ট ও রেট হিসাব ({filteredPaidItems.length}টি)
                      </h4>
                      {resultCounts.rateMismatch > 0 && (
                        <span className="rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-extrabold text-rose-800">
                          {resultCounts.rateMismatch}টিতে রেটের পার্থক্য
                        </span>
                      )}
                    </div>

                    {filteredPaidItems.length === 0 ? (
                      <p className="text-sm text-slate-500">এই ফিল্টারে কোনো পেইড আইটেম নেই।</p>
                    ) : (
                      <>
                        {/* Mobile Clear Card Layout */}
                        <div className="space-y-2.5 md:hidden">
                          {filteredPaidItems.map((item, idx) => {
                            const statusBadge =
                              item.rateStatus === 'match'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : item.rateStatus === 'mismatch'
                                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                                  : 'border-amber-300 bg-amber-50 text-amber-900';
                            const statusLabel =
                              item.rateStatus === 'match'
                                ? 'ঠিক আছে'
                                : item.rateStatus === 'mismatch'
                                  ? 'রেটে অমিল'
                                  : 'অস্পষ্ট';

                            return (
                              <div
                                key={`${item.productName}-mob-${idx}`}
                                className={`rounded-xl border p-3 space-y-2 ${
                                  item.rateStatus === 'mismatch'
                                    ? 'border-rose-300 bg-rose-50/40'
                                    : 'border-slate-200 bg-slate-50/50'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-extrabold text-slate-900">
                                      {item.productName}
                                    </p>
                                    {item.dueNumber && (
                                      <p className="font-mono-tabular text-xs font-bold text-indigo-700">
                                        {item.dueNumber}
                                      </p>
                                    )}
                                  </div>
                                  <span
                                    className={`rounded-md border px-2 py-0.5 text-[11px] font-extrabold shrink-0 ${statusBadge}`}
                                  >
                                    {statusLabel}
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-right">
                                  <div className="text-left">
                                    <span className="block text-[10.5px] font-bold text-slate-500">
                                      পরিমাণ
                                    </span>
                                    <span className="font-mono-tabular text-sm font-extrabold text-slate-900">
                                      {item.quantityText || item.numericQty || '—'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10.5px] font-bold text-slate-500">
                                      মোট টাকা
                                    </span>
                                    <span className="font-mono-tabular text-sm font-extrabold text-slate-900">
                                      {formatMoney(item.totalAmount)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10.5px] font-bold text-slate-500">
                                      রেট
                                    </span>
                                    <span className="font-mono-tabular text-sm font-extrabold text-[#1E3A8A]">
                                      {formatMoney(item.calculatedRate)}
                                    </span>
                                  </div>
                                </div>

                                {item.note && (
                                  <p className="text-xs font-medium text-slate-700">{item.note}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop Table with Crisp Right-Aligned Tabular Figures */}
                        <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full min-w-[540px] text-left text-sm">
                            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-2.5 font-bold">প্রোডাক্ট / ডিউ</th>
                                <th className="px-3 py-2.5 font-bold text-right">পরিমাণ</th>
                                <th className="px-3 py-2.5 font-bold text-right">মোট টাকা</th>
                                <th className="px-3 py-2.5 font-bold text-right">হিসাবকৃত রেট</th>
                                <th className="px-3 py-2.5 font-bold">অবস্থা</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {filteredPaidItems.map((item, idx) => {
                                const statusBadge =
                                  item.rateStatus === 'match'
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                    : item.rateStatus === 'mismatch'
                                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                                      : 'border-amber-300 bg-amber-50 text-amber-900';
                                const statusLabel =
                                  item.rateStatus === 'match'
                                    ? 'ঠিক আছে'
                                    : item.rateStatus === 'mismatch'
                                      ? 'রেটে অমিল'
                                      : 'অস্পষ্ট';

                                return (
                                  <tr
                                    key={`${item.productName}-${idx}`}
                                    className={
                                      item.rateStatus === 'mismatch'
                                        ? 'bg-rose-50/45 hover:bg-rose-50/75'
                                        : 'hover:bg-slate-50/70'
                                    }
                                  >
                                    <td className="px-3 py-2.5 align-top">
                                      <div className="font-bold text-slate-900">
                                        {item.productName}
                                      </div>
                                      {item.dueNumber && (
                                        <div className="font-mono-tabular text-xs font-bold text-indigo-700">
                                          {item.dueNumber}
                                        </div>
                                      )}
                                      {item.note && (
                                        <div className="text-xs text-slate-600 mt-0.5">
                                          {item.note}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5 align-top text-right font-mono-tabular text-[15px] font-extrabold text-slate-800 whitespace-nowrap">
                                      {item.quantityText || item.numericQty || '—'}
                                      {item.unitType ? (
                                        <span className="block text-[11px] font-semibold text-slate-500">
                                          {item.unitType}
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-2.5 align-top text-right font-mono-tabular text-[15px] font-extrabold text-slate-900 whitespace-nowrap">
                                      {formatMoney(item.totalAmount)}
                                    </td>
                                    <td className="px-3 py-2.5 align-top text-right font-mono-tabular whitespace-nowrap">
                                      <div className="text-[15px] font-extrabold text-[#1E3A8A]">
                                        {formatMoney(item.calculatedRate)}
                                      </div>
                                      {item.printedRate > 0 && (
                                        <div className="text-[11px] font-semibold text-slate-500">
                                          লেখা: {formatMoney(item.printedRate)}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5 align-top">
                                      <span
                                        className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-extrabold whitespace-nowrap ${statusBadge}`}
                                      >
                                        {statusLabel}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Free Items Separated Card */}
                {(resultFilter === 'all' || resultFilter === 'free_issues') && (
                  <div className="rounded-2xl border border-emerald-200 bg-white p-4 sm:p-5 shadow-xs space-y-2.5">
                    <h4 className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-emerald-950">
                      <Gift className="h-4 w-4 text-emerald-700" />
                      আলাদা ফ্রি (0 / Free) আইটেম ({result.freeItems.length}টি)
                    </h4>
                    {result.freeItems.length === 0 ? (
                      <p className="text-xs sm:text-sm text-slate-500">
                        এই চালানে আলাদা কোনো ফ্রি (0) আইটেম পাওয়া যায়নি।
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {result.freeItems.map((free, idx) => (
                          <div
                            key={`${free.productName}-${idx}`}
                            className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs sm:text-sm"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-emerald-950">
                                {free.productName}
                              </span>
                              <span className="font-mono-tabular rounded bg-emerald-700 px-2 py-0.5 text-xs font-extrabold text-white">
                                {free.quantityText || '0 Free'}
                              </span>
                            </div>
                            {free.dueNumber && (
                              <span className="mt-1 block font-mono-tabular text-xs font-bold text-emerald-800">
                                ডিউ: {free.dueNumber}
                              </span>
                            )}
                            {free.note && (
                              <p className="mt-1 text-xs text-emerald-900">{free.note}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Due Number & Undelivery/Delivery Reconciliation Card */}
                {(resultFilter === 'all' || resultFilter === 'due_alerts') &&
                  result.dueComparisons.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
                      <h4 className="text-sm sm:text-base font-extrabold text-[#0f172a]">
                        ডিউ নম্বর ও ডেলিভারি/আনডেলিভারি শেষ সংখ্যা যাচাই
                      </h4>
                      <div className="space-y-2.5">
                        {result.dueComparisons.map((comp, idx) => {
                          const meta = getComparisonStatusMeta(comp.status);
                          return (
                            <div
                              key={`${comp.dueNumber}-${idx}`}
                              className="rounded-xl border border-slate-200 bg-slate-50/75 p-3 space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono-tabular text-[15px] font-extrabold text-[#1E3A8A]">
                                  {comp.dueNumber || 'রেফারেন্স নম্বর'}
                                </span>
                                <span
                                  className={`rounded-md border px-2 py-0.5 text-xs font-extrabold ${meta.badgeClass}`}
                                >
                                  {meta.label}
                                </span>
                              </div>

                              {(comp.currentUndeliveryOrDeliveryNo ||
                                comp.previousUndeliveryOrDeliveryNo) && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono-tabular">
                                  <div className="rounded-lg bg-white border border-slate-200 px-2.5 py-1.5">
                                    <span className="text-slate-500">বর্তমান ডেলিভারি/আনডেলিভারি: </span>
                                    <span className="font-extrabold text-slate-900 text-sm">
                                      {comp.currentUndeliveryOrDeliveryNo || '—'}
                                    </span>
                                  </div>
                                  <div className="rounded-lg bg-white border border-slate-200 px-2.5 py-1.5">
                                    <span className="text-slate-500">আগের রেফারেন্স: </span>
                                    <span className="font-extrabold text-slate-900 text-sm">
                                      {comp.previousUndeliveryOrDeliveryNo || '—'}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {comp.lastDigitWarning && (
                                <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-900">
                                  শেষ সংখ্যা সতর্কতা: {comp.lastDigitWarning}
                                </div>
                              )}

                              <p className="text-xs sm:text-sm text-slate-700">{comp.details}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </section>
            )}

            {/* Quick Single-Thumb Note Capture Strip inside Verify Tab */}
            <section className="rounded-2xl border border-teal-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm sm:text-base font-extrabold text-[#0f172a] flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-teal-700" />
                  দ্রুত নোট লিখুন ও সেভ করুন
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('notes')}
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-teal-300 bg-teal-50 px-2.5 text-xs font-extrabold text-teal-900 hover:bg-teal-100"
                >
                  নোট খাতায় যান ({savedNotes.length})
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="নোটের শিরোনাম (যেমন: প্রাণ চালান #৪৫১২)"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
                <input
                  type="text"
                  value={noteDueTag}
                  onChange={(e) => setNoteDueTag(e.target.value)}
                  placeholder="ডিউ নম্বর (যেমন: DH 2304678)"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[16px] font-mono-tabular text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
              </div>
              <textarea
                rows={2}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="দ্রুত নোট: কোন পণ্যে রেট কম/বেশি, কী ফ্রি মিসিং বা প্রতিনিধি কী বলেছেন..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveNote(false)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 text-sm font-extrabold text-white hover:bg-teal-800"
                >
                  <Save className="h-4 w-4" />
                  {editingNoteId ? 'নোট আপডেট করুন' : 'নোট সেভ করুন'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSaveNote(false);
                    setActiveSubTab('notes');
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-4 text-xs sm:text-sm font-extrabold text-teal-900 hover:bg-teal-100"
                >
                  সেভ করে নোট খাতায় দেখুন
                </button>
              </div>
            </section>
          </div>
          </div>
        )}

        {/* SUB-TAB 2: NOTES NOTEBOOK & ARCHIVE */}
        {activeSubTab === 'notes' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Note Editor Card */}
            <div className="lg:col-span-5 space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base sm:text-lg font-extrabold text-[#0f172a] flex items-center gap-2">
                    <NotebookPen className="h-4 w-4 text-teal-700" />
                    {editingNoteId ? 'সংরক্ষিত নোট এডিট' : 'নতুন ব্যক্তিগত নোট'}
                  </h2>
                  {result && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAppendSummaryToNote}
                        className="text-xs font-bold text-[#1E3A8A] hover:underline"
                      >
                        + AI ফলাফল বক্সে নিন
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSubTab('verify')}
                        className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100"
                      >
                        চালান ফলাফল দেখুন
                      </button>
                    </div>
                  )}
                </div>

              <div>
                <label
                  htmlFor="standalone-note-title"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  নোটের শিরোনাম
                </label>
                <input
                  id="standalone-note-title"
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="যেমন: প্রাণ চালান #৪৫১২ রেট চেক"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="standalone-due-tag"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  ডিউ নম্বর / ট্যাগ (ঐচ্ছিক)
                </label>
                <input
                  id="standalone-due-tag"
                  type="text"
                  value={noteDueTag}
                  onChange={(e) => setNoteDueTag(e.target.value)}
                  placeholder="যেমন: DH 2304678, শেষ সংখ্যা চেক"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] font-mono-tabular text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="standalone-note-body"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  মনমতো নোট লিখুন
                </label>
                <textarea
                  id="standalone-note-body"
                  rows={6}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="চালানে কী মিলল, কী বাকি থাকল, কোন ফ্রি পিস কম পাওয়া গেছে বা পরে কী কথা বলতে হবে তা এখানে লিখে রাখুন..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
              </div>

              {/* Save + Export/Copy/Print Action Grid */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveNote(false)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3.5 text-sm font-extrabold text-white transition-colors hover:bg-teal-800"
                  >
                    <Save className="h-4 w-4" />
                    {editingNoteId ? 'আপডেট করুন' : 'নোট সেভ করুন'}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleCopyText(fullCopyPayload, 'editor')}
                    disabled={!fullCopyPayload}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50"
                  >
                    {copiedKey === 'editor' ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-600" />
                        কপি হয়েছে
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        কপি করুন
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={!fullCopyPayload}
                    onClick={() =>
                      downloadChalanNoteAsTxt({
                        title: noteTitle || 'chalan_note',
                        dueTag: noteDueTag,
                        noteText,
                        verification: result,
                      })
                    }
                    className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-45"
                  >
                    <Download className="h-3.5 w-3.5" />
                    TXT সেভ
                  </button>
                  <button
                    type="button"
                    disabled={!fullCopyPayload}
                    onClick={() =>
                      downloadChalanNoteAsCsv({
                        title: noteTitle || 'chalan_note',
                        dueTag: noteDueTag,
                        noteText,
                        verification: result,
                      })
                    }
                    className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-lg border border-teal-300 bg-teal-50/70 px-2 text-xs font-bold text-teal-900 hover:bg-teal-100 disabled:opacity-45"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    CSV সেভ
                  </button>
                  <button
                    type="button"
                    disabled={!fullCopyPayload}
                    onClick={() =>
                      handlePrintMemo({
                        title: noteTitle || 'চালান যাচাই ও নোট',
                        dueTag: noteDueTag,
                        noteText,
                        verification: result,
                      })
                    }
                    className="inline-flex min-h-[42px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-45"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    প্রিন্ট মেমো
                  </button>
                </div>
              </div>

              {editingNoteId && (
                <button
                  type="button"
                  onClick={() => handleSaveNote(true)}
                  className="w-full min-h-[42px] rounded-xl border border-teal-300 bg-teal-50/70 py-2 text-xs font-bold text-teal-900 hover:bg-teal-100"
                >
                  নতুন নোট হিসেবে আলাদা কপি সেভ করুন
                </button>
              )}
              </section>
            </div>

            {/* Saved Standalone Archive Card with Highlight Badges & Issue Filters */}
            <div className="lg:col-span-7">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-[#0f172a] flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#1E3A8A]" />
                  সংরক্ষিত চালান ও নোট ({savedNotes.length}টি)
                </h3>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="শিরোনাম, ডিউ নম্বর বা নোট খুঁজুন..."
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 pl-9 pr-3 py-2 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:bg-white focus:outline-none"
                />
              </div>

              {/* Archive Issue Filter Pills */}
              {savedNotes.length > 0 && (
                <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap items-center gap-1.5 pb-0.5">
                  {(
                    [
                      { key: 'all', label: 'সব' },
                      { key: 'missing_free', label: 'ফ্রি মিসিং' },
                      { key: 'rate_mismatch', label: 'রেট অমিল' },
                      { key: 'due_alert', label: 'ডিউ / আনডেলিভারি' },
                      { key: 'uncertain', label: 'অস্পষ্ট অংশ' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setArchiveFilter(f.key)}
                      className={`min-h-[40px] rounded-lg border px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                        archiveFilter === f.key
                          ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                  {(archiveFilter !== 'all' || searchQuery.trim() !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setArchiveFilter('all');
                        setSearchQuery('');
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="h-3 w-3" />
                      রিসেট
                    </button>
                  )}
                </div>
              )}

              {filteredSavedNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center text-xs sm:text-sm text-slate-500">
                  {savedNotes.length === 0
                    ? 'এখনো কোনো চালান বা নোট সেভ করা হয়নি। যাচাই করে "নোট সেভ করুন" চাপলে এখানে জমা থাকবে।'
                    : 'এই সার্চ বা ফিল্টারে কোনো সংরক্ষিত নোট পাওয়া যায়নি।'}
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-0.5">
                  {filteredSavedNotes.map((item) => {
                    const isEditing = editingNoteId === item.id;
                    const flags = classifyVerificationFlags(item.verification);
                    const copyText = [
                      item.title,
                      item.dueTag ? `ডিউ: ${item.dueTag}` : '',
                      item.noteText,
                      item.verification ? formatChalanVerificationAsText(item.verification) : '',
                    ]
                      .filter(Boolean)
                      .join('\n\n');

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-3 space-y-2 transition-colors ${
                          isEditing
                            ? 'border-[#1E3A8A] bg-blue-50/50'
                            : flags.hasAnyIssue
                              ? 'border-amber-300/90 bg-amber-50/30 hover:bg-white'
                              : 'border-slate-200 bg-slate-50/60 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-extrabold text-slate-900">
                              {item.title}
                            </h4>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                              <span>
                                {new Date(item.updatedAt || item.createdAt).toLocaleString('bn-BD', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </span>
                              {item.dueTag && (
                                <span className="font-mono-tabular rounded bg-indigo-100 px-1.5 py-0.5 font-bold text-indigo-800">
                                  {item.dueTag}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Highlight Issue Badges on Card */}
                        {item.verification && (
                          <div className="flex flex-wrap items-center gap-1">
                            {flags.hasMissingFree && (
                              <span className="rounded border border-rose-300 bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-extrabold text-rose-900">
                                ফ্রি মিসিং
                              </span>
                            )}
                            {flags.hasRateMismatch && (
                              <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-extrabold text-amber-950">
                                রেট পার্থক্য
                              </span>
                            )}
                            {flags.hasDueAlert && (
                              <span className="rounded border border-indigo-300 bg-indigo-100 px-1.5 py-0.5 text-[10.5px] font-extrabold text-indigo-950">
                                ডিউ/শেষ সংখ্যা সতর্কতা
                              </span>
                            )}
                            {flags.hasUncertain && (
                              <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-extrabold text-amber-900">
                                অস্পষ্ট অংশ
                              </span>
                            )}
                            {!flags.hasAnyIssue && (
                              <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-extrabold text-emerald-800">
                                সব ঠিক আছে
                              </span>
                            )}
                          </div>
                        )}

                        {item.noteText && (
                          <p className="line-clamp-2 text-xs text-slate-700 whitespace-pre-line">
                            {item.noteText}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleLoadSavedNote(item)}
                            className="inline-flex min-h-[38px] items-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
                          >
                            খুলুন
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUseSavedAsComparisonBaseline(item)}
                            className="inline-flex min-h-[38px] items-center rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100"
                          >
                            তুলনায় নিন
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCopyText(copyText, item.id)}
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                            title="কপি করুন"
                          >
                            {copiedKey === item.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadChalanNoteAsCsv({
                                title: item.title,
                                dueTag: item.dueTag,
                                noteText: item.noteText,
                                verification: item.verification,
                              })
                            }
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-xs font-bold text-teal-900 hover:bg-teal-100"
                            title="CSV ডাউনলোড"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handlePrintMemo({
                                title: item.title,
                                dueTag: item.dueTag,
                                noteText: item.noteText,
                                verification: item.verification,
                              })
                            }
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                            title="প্রিন্ট মেমো"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>

                          {confirmDeleteId === item.id ? (
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                type="button"
                                onClick={() => handleDeleteSavedNote(item.id)}
                                className="inline-flex min-h-[38px] items-center rounded-lg bg-rose-600 px-2.5 text-xs font-bold text-white hover:bg-rose-700"
                              >
                                নিশ্চিত?
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="inline-flex min-h-[38px] items-center rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700"
                              >
                                না
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              aria-label="মুছুন"
                              className="ml-auto inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                              title="মুছুন"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            </div>
          </div>
        )}

        {/* SUB-TAB 3: COMPANY LOGOS & TSM / SR CONTACTS */}
        {activeSubTab === 'reps_logos' && (
          <div className="space-y-6">
            {/* Part A: Company Logo & TSM/SR Profile Editor */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-[#0f172a] flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[#1E3A8A]" />
                    কোম্পানির লোগো ও TSM / SR নম্বর
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600">
                    প্রতিটি কোম্পানির লোগো এবং TSM/SR মোবাইল নম্বর এখান থেকেই যোগ বা এডিট করুন (মূল হিসাবে কোনো প্রভাব পড়বে না)।
                  </p>
                </div>
              </div>

              {companies.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs sm:text-sm text-slate-500">
                  এখনো কোনো কোম্পানি যোগ করা হয়নি। উপরের "+ নতুন কোম্পানি" বাটন থেকে কোম্পানি যোগ করুন অথবা নিচে স্বতন্ত্র প্রতিনিধি নম্বর সংরক্ষণ করুন।
                </div>
              ) : (
                <>
                  {/* Horizontal Scrollable Company Picker Pills */}
                  <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap items-center gap-2 pb-1">
                    {companies.map((c) => {
                      const active = selectedRepCompany?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedRepCompanyId(c.id)}
                          className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
                            active
                              ? 'border-[#1E3A8A] bg-[#EFF6FF] text-[#1E3A8A] shadow-2xs'
                              : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <CompanyLogoAvatar
                            name={c.name}
                            logoUrl={c.logoUrl}
                            className="h-6 w-6 rounded-md"
                            textClassName="text-[11px] font-extrabold"
                          />
                          <span>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedRepCompany && (
                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      {/* Live Card Preview */}
                      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <CompanyLogoAvatar
                            name={selectedRepCompany.name}
                            logoUrl={repLogoUrl}
                            className="h-14 w-14 rounded-2xl"
                            textClassName="text-xl font-extrabold"
                          />
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-base font-extrabold text-[#0f172a]">
                              {selectedRepCompany.name}
                            </p>
                            <CompanyRepsStrip
                              company={{
                                ...selectedRepCompany,
                                logoUrl: repLogoUrl,
                                tsmName: repTsmName,
                                tsmPhone: repTsmPhone,
                                srContacts: repSrContacts,
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Logo Controls */}
                      <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-extrabold text-[#0f172a]">
                            কোম্পানির লোগো সেট করুন
                          </span>
                          {repLogoUrl && (
                            <button
                              type="button"
                              onClick={() => setRepLogoUrl('')}
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              লোগো সরান
                            </button>
                          )}
                        </div>

                        <input
                          ref={repLogoFileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={(e) => void handleUploadRepLogoFile(e)}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            disabled={isUploadingRepLogo}
                            onClick={() => repLogoFileRef.current?.click()}
                            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#1E3A8A]/35 bg-blue-50/75 px-3 text-xs sm:text-sm font-bold text-[#1E3A8A] hover:bg-blue-100"
                          >
                            <ImagePlus className="h-4 w-4 shrink-0" />
                            {isUploadingRepLogo ? 'লোড হচ্ছে...' : 'লোগো ছবি আপলোড করুন'}
                          </button>

                          <input
                            type="url"
                            inputMode="url"
                            value={repLogoUrl.startsWith('data:') ? '' : repLogoUrl}
                            onChange={(e) => setRepLogoUrl(e.target.value)}
                            placeholder="অথবা লোগো ইমেজ URL পেস্ট করুন"
                            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                          />
                        </div>

                        <div>
                          <span className="block text-[11.5px] font-bold text-slate-600 mb-1.5">
                            অথবা ১-ক্লিকে রেডিমেড লোগো বেছে নিন:
                          </span>
                          <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap items-center gap-2 pb-0.5">
                            {COMPANY_LOGO_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => setRepLogoUrl(preset.url)}
                                className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                                  repLogoUrl === preset.url
                                    ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]'
                                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                                }`}
                              >
                                <img
                                  src={preset.url}
                                  alt={preset.label}
                                  className="h-6 w-6 rounded object-contain"
                                />
                                <span>{preset.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* TSM & Multiple SR Inputs */}
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        {/* TSM */}
                        <div className="rounded-xl border border-blue-200/80 bg-white p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-[#1E3A8A]">
                              <UserCheck className="h-4 w-4" />
                              TSM (টেরিটরি সেলস ম্যানেজার)
                            </span>
                            {normalizeTelHref(repTsmPhone) && (
                              <a
                                href={normalizeTelHref(repTsmPhone)}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#1E3A8A] px-2.5 py-1 text-xs font-bold text-white"
                              >
                                <Phone className="h-3 w-3" />
                                কল
                              </a>
                            )}
                          </div>
                          <input
                            type="text"
                            value={repTsmName}
                            onChange={(e) => setRepTsmName(e.target.value)}
                            placeholder="TSM-এর নাম (যেমন: মো. রাশেদ)"
                            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                          />
                          <input
                            type="tel"
                            inputMode="tel"
                            value={repTsmPhone}
                            onChange={(e) => setRepTsmPhone(e.target.value)}
                            placeholder="TSM মোবাইল নম্বর (017...)"
                            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-[16px] font-mono-tabular text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                          />
                        </div>

                        {/* SRs */}
                        <div className="rounded-xl border border-teal-200/80 bg-white p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-teal-900">
                              <Users className="h-4 w-4 text-teal-700" />
                              SR (সেলস রিপ্রেজেন্টেটিভ)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setRepSrContacts((prev) => [
                                  ...prev,
                                  { id: generateId('sr'), name: '', phone: '', role: 'SR' },
                                ])
                              }
                              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-teal-300 bg-teal-50 px-2.5 text-xs font-bold text-teal-900 hover:bg-teal-100"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              SR যোগ
                            </button>
                          </div>

                          <div className="space-y-2">
                            {repSrContacts.map((sr, idx) => (
                              <div
                                key={sr.id}
                                className="flex flex-col sm:flex-row gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"
                              >
                                <input
                                  type="text"
                                  value={sr.name}
                                  onChange={(e) =>
                                    setRepSrContacts((prev) =>
                                      prev.map((row) =>
                                        row.id === sr.id ? { ...row, name: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder={`SR ${idx + 1} নাম`}
                                  className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                                />
                                <input
                                  type="tel"
                                  inputMode="tel"
                                  value={sr.phone}
                                  onChange={(e) =>
                                    setRepSrContacts((prev) =>
                                      prev.map((row) =>
                                        row.id === sr.id ? { ...row, phone: e.target.value } : row
                                      )
                                    )
                                  }
                                  placeholder="SR নম্বর"
                                  className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[16px] font-mono-tabular text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                                />
                                <div className="flex items-center gap-1.5 self-end sm:self-center">
                                  {normalizeTelHref(sr.phone) && (
                                    <a
                                      href={normalizeTelHref(sr.phone)}
                                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-teal-700 px-3 text-xs font-bold text-white"
                                      title="কল করুন"
                                    >
                                      <Phone className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setRepSrContacts((prev) =>
                                        prev.length > 1
                                          ? prev.filter((row) => row.id !== sr.id)
                                          : [{ id: generateId('sr'), name: '', phone: '', role: 'SR' }]
                                      )
                                    }
                                    aria-label="SR মুছুন"
                                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-rose-700 hover:bg-rose-100"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {onUpdateCompanyProfileMeta && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleSaveCompanyProfileMeta}
                            className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] px-5 text-sm font-extrabold text-white shadow-xs hover:bg-[#172e6e]"
                          >
                            <Save className="h-4 w-4" />
                            লোগো ও TSM/SR সেভ করুন
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Part B: Standalone Extra Chalan / Driver / Dealer Contacts */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-[#0f172a] flex items-center gap-2">
                  <Phone className="h-4 w-4 text-teal-700" />
                  অতিরিক্ত চালান প্রতিনিধি / ডিলার নম্বর ({standaloneReps.length}টি)
                </h3>
                <p className="text-xs sm:text-sm text-slate-600">
                  সিস্টেমের বাইরে কোনো অতিরিক্ত TSM, SR, ডেলিভারি ম্যান বা ড্রাইভারের নম্বর দ্রুত কল ও কপির জন্য এখানে জমা রাখুন।
                </p>
              </div>

              <form
                onSubmit={handleAddStandaloneRep}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5"
              >
                <input
                  type="text"
                  value={newRepCompany}
                  onChange={(e) => setNewRepCompany(e.target.value)}
                  placeholder="কোম্পানি / ডিলার নাম"
                  className="lg:col-span-3 min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
                <select
                  aria-label="পদবি"
                  value={newRepRole}
                  onChange={(e) =>
                    setNewRepRole(e.target.value as 'TSM' | 'SR' | 'Other')
                  }
                  className="lg:col-span-2 min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[16px] font-bold text-slate-800 focus:border-[#1E3A8A] focus:outline-none"
                >
                  <option value="TSM">TSM</option>
                  <option value="SR">SR</option>
                  <option value="Other">ড্রাইভার/অন্যান্য</option>
                </select>
                <input
                  type="text"
                  value={newRepName}
                  onChange={(e) => setNewRepName(e.target.value)}
                  placeholder="প্রতিনিধির নাম"
                  className="lg:col-span-2 min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
                <input
                  type="tel"
                  inputMode="tel"
                  value={newRepPhone}
                  onChange={(e) => setNewRepPhone(e.target.value)}
                  placeholder="মোবাইল নম্বর *"
                  className="lg:col-span-3 min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[16px] font-mono-tabular text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
                <button
                  type="submit"
                  className="lg:col-span-2 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-sm font-extrabold text-white hover:bg-teal-800"
                >
                  <Plus className="h-4 w-4" />
                  যোগ করুন
                </button>
                <input
                  type="text"
                  value={newRepNote}
                  onChange={(e) => setNewRepNote(e.target.value)}
                  placeholder="এলাকা বা ছোট নোট (ঐচ্ছিক)"
                  className="sm:col-span-2 lg:col-span-12 min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A8A] focus:outline-none"
                />
              </form>

              {standaloneReps.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center text-xs sm:text-sm text-slate-500">
                  এখনো কোনো অতিরিক্ত প্রতিনিধি নম্বর যোগ করা হয়নি।
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {standaloneReps.map((rep) => (
                    <div
                      key={rep.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="inline-block rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-extrabold text-[#1E3A8A]">
                            {rep.role === 'Other' ? 'অন্যান্য' : rep.role}
                          </span>
                          <h4 className="mt-1 truncate text-sm font-extrabold text-[#0f172a]">
                            {rep.name || rep.companyName}
                          </h4>
                          <p className="truncate text-xs font-semibold text-slate-600">
                            {rep.companyName}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteStandaloneRep(rep.id)}
                          aria-label="মুছুন"
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <p className="font-mono-tabular text-sm font-extrabold text-[#1E3A8A]">
                        {rep.phone}
                      </p>
                      {rep.note && (
                        <p className="text-xs text-slate-600">{rep.note}</p>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        {normalizeTelHref(rep.phone) && (
                          <a
                            href={normalizeTelHref(rep.phone)}
                            className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg bg-teal-700 px-3 text-xs font-extrabold text-white hover:bg-teal-800"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            কল করুন
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyText(rep.phone, `extra_rep_${rep.id}`)
                          }
                          className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-100"
                        >
                          {copiedKey === `extra_rep_${rep.id}` ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                              কপি হয়েছে
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              নম্বর কপি
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Rotate / Crop / Frame Guide / High-Contrast Modal */}
      {editingImage && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="চালানের ছবি রোটেট ও ক্রপ"
        >
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-base sm:text-lg font-extrabold text-[#0f172a] flex items-center gap-2">
                <Crop className="h-4 w-4 text-[#1E3A8A]" />
                ছবি সোজা, ক্রপ ও স্পষ্ট করুন
              </h3>
              <button
                type="button"
                onClick={() => setEditingImage(null)}
                className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                aria-label="বন্ধ করুন"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Frame Guide Preview Stage */}
              <div className="relative flex items-center justify-center rounded-xl border border-slate-300 bg-slate-900/95 p-3 min-h-[240px]">
                <div className="relative max-h-[340px] overflow-hidden rounded-lg">
                  <img
                    src={editPreviewUrl || editingImage.dataUrl}
                    alt="প্রিভিউ"
                    className="max-h-[340px] w-auto object-contain"
                  />
                  {/* Document Framing Guide Grid Overlay */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-2 border-2 border-dashed border-emerald-400/75 rounded-md grid grid-cols-3 grid-rows-3"
                  >
                    <div className="border-r border-b border-emerald-300/30" />
                    <div className="border-r border-b border-emerald-300/30" />
                    <div className="border-b border-emerald-300/30" />
                    <div className="border-r border-b border-emerald-300/30" />
                    <div className="border-r border-b border-emerald-300/30" />
                    <div className="border-b border-emerald-300/30" />
                    <div className="border-r border-emerald-300/30" />
                    <div className="border-r border-emerald-300/30" />
                    <div />
                  </div>
                </div>
                {isProcessingEdit && (
                  <div className="absolute right-3 bottom-3 rounded-lg bg-slate-900/80 px-2.5 py-1 text-xs font-bold text-white flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    প্রসেসিং...
                  </div>
                )}
              </div>

              {/* Quality Score Feedback */}
              {editPreviewQuality && (
                <div
                  className={`rounded-xl border px-3.5 py-2 text-xs font-bold ${
                    editPreviewQuality.isDark || editPreviewQuality.isBlurry
                      ? 'border-amber-300 bg-amber-50 text-amber-950'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  }`}
                >
                  {editPreviewQuality.warnings.length > 0
                    ? editPreviewQuality.warnings.join(' · ')
                    : 'ছবির আলো ও লেখার স্পষ্টতা যাচাইয়ের জন্য উপযুক্ত রয়েছে।'}
                </div>
              )}

              {/* Rotate & High-Contrast Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditRotation((r) => (r + 270) % 360)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  বামে ৯০°
                </button>
                <button
                  type="button"
                  onClick={() => setEditRotation((r) => (r + 90) % 360)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  <RotateCw className="h-4 w-4" />
                  ডানে ৯০°
                </button>
                <button
                  type="button"
                  onClick={() => setEditEnhance((prev) => !prev)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-xs sm:text-sm font-bold transition-colors ${
                    editEnhance
                      ? 'border-amber-500 bg-amber-100 text-amber-950'
                      : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <SunMedium className="h-4 w-4" />
                  {editEnhance ? 'স্পষ্ট মোড চালু ✓' : 'লেখা স্পষ্ট করুন'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditRotation(0);
                    setEditCrop({ ...DEFAULT_CROP });
                    setEditEnhance(false);
                  }}
                  className="ml-auto text-xs font-bold text-slate-600 hover:underline"
                >
                  রিসেট করুন
                </button>
              </div>

              {/* Quick Crop Presets & Trim Sliders */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700 mr-1">দ্রুত ক্রপ:</span>
                  <button
                    type="button"
                    onClick={() => setEditCrop({ topPct: 0, rightPct: 0, bottomPct: 0, leftPct: 0 })}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    পূর্ণ ছবি
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditCrop({ topPct: 8, rightPct: 6, bottomPct: 8, leftPct: 6 })}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    চারপাশ ছাঁটুন
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditCrop({ topPct: 0, rightPct: 0, bottomPct: 40, leftPct: 0 })}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    উপরের অংশ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditCrop({ topPct: 35, rightPct: 0, bottomPct: 0, leftPct: 0 })}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    নিচের অংশ
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {(
                    [
                      { key: 'topPct', label: 'উপর ছাঁটুন' },
                      { key: 'bottomPct', label: 'নিচ ছাঁটুন' },
                      { key: 'leftPct', label: 'বাম ছাঁটুন' },
                      { key: 'rightPct', label: 'ডান ছাঁটুন' },
                    ] as const
                  ).map((edge) => (
                    <label key={edge.key} className="block space-y-1 font-bold text-slate-700">
                      <span className="flex justify-between">
                        <span>{edge.label}</span>
                        <span className="font-mono-tabular">{editCrop[edge.key]}%</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={40}
                        value={editCrop[edge.key]}
                        onChange={(e) =>
                          setEditCrop((prev) => ({
                            ...prev,
                            [edge.key]: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-[#1E3A8A]"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingImage(null)}
                  className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={applyImageEditorChanges}
                  className="min-h-[42px] rounded-xl bg-[#1E3A8A] px-5 text-sm font-extrabold text-white hover:bg-[#172e6e]"
                >
                  সেভ ও প্রয়োগ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden A4 Print Root (only visible during window.print when printing-chalan-memo-only is active) */}
      {printPayload && (
        <div id="chalan-verify-print-root" className="hidden bg-white p-6 text-[#0f172a]">
          <div className="border-b-2 border-[#1E3A8A] pb-3 mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-extrabold text-[#1E3A8A]">
                Khan Enterprise — চালান যাচাই ও নোট মেমো
              </h1>
              <p className="text-xs font-semibold text-slate-600">
                তারিখ: {new Date().toLocaleString('bn-BD')} · স্বতন্ত্র যাচাই রেকর্ড
              </p>
            </div>
            {printPayload.dueTag && (
              <div className="font-mono-tabular rounded border border-slate-300 px-3 py-1 text-sm font-extrabold">
                ডিউ: {printPayload.dueTag}
              </div>
            )}
          </div>

          <h2 className="text-lg font-extrabold mb-2">{printPayload.title}</h2>

          {printPayload.noteText.trim() && (
            <div className="mb-4 rounded-lg border border-slate-300 bg-slate-50 p-3">
              <p className="text-xs font-extrabold text-slate-600 mb-1">ব্যক্তিগত নোট:</p>
              <p className="text-sm whitespace-pre-line">{printPayload.noteText}</p>
            </div>
          )}

          {printPayload.verification && (
            <div className="space-y-4">
              {printPayload.verification.paidItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-extrabold mb-1.5">মূল প্রোডাক্ট ও রেট</h3>
                  <table className="w-full border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 px-2 py-1.5 text-left">প্রোডাক্ট</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-left">ডিউ</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-right">পরিমাণ</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-right">মোট টাকা</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-right">রেট</th>
                        <th className="border border-slate-300 px-2 py-1.5 text-left">অবস্থা</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printPayload.verification.paidItems.map((it, idx) => (
                        <tr key={idx}>
                          <td className="border border-slate-300 px-2 py-1 font-bold">
                            {it.productName}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 font-mono-tabular">
                            {it.dueNumber || '—'}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-right font-mono-tabular">
                            {it.quantityText || it.numericQty}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-right font-mono-tabular">
                            {formatMoney(it.totalAmount)}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-right font-mono-tabular font-bold">
                            {formatMoney(it.calculatedRate)}
                          </td>
                          <td className="border border-slate-300 px-2 py-1">
                            {it.rateStatus === 'match'
                              ? 'ঠিক আছে'
                              : it.rateStatus === 'mismatch'
                                ? 'রেটে অমিল'
                                : 'অস্পষ্ট'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {printPayload.verification.freeItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-extrabold mb-1">আলাদা ফ্রি আইটেম</h3>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {printPayload.verification.freeItems.map((f, idx) => (
                      <li key={idx}>
                        {f.productName} ({f.quantityText}) {f.dueNumber ? `[${f.dueNumber}]` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {printPayload.verification.missingFreeAlerts.length > 0 && (
                <div>
                  <h3 className="text-sm font-extrabold text-rose-800 mb-1">ফ্রি মিসিং সতর্কতা</h3>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {printPayload.verification.missingFreeAlerts.map((m, idx) => (
                      <li key={idx}>
                        {m.productName}: {m.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {printPayload.verification.dueComparisons.length > 0 && (
                <div>
                  <h3 className="text-sm font-extrabold mb-1">ডিউ ও আনডেলিভারি যাচাই</h3>
                  <ul className="list-disc pl-5 text-xs space-y-0.5">
                    {printPayload.verification.dueComparisons.map((c, idx) => (
                      <li key={idx}>
                        {c.dueNumber}: {c.details}{' '}
                        {c.lastDigitWarning ? `(শেষ সংখ্যা সতর্কতা: ${c.lastDigitWarning})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
