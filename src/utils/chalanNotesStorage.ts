export interface ChalanHeaderInfo {
  companyOrSupplier: string;
  invoiceOrChalanNo: string;
  invoiceDate: string;
  dueNumbers: string[];
  summaryNote: string;
}

export interface ChalanPaidItem {
  dueNumber: string;
  productName: string;
  quantityText: string;
  numericQty: number;
  unitType: string;
  printedRate: number;
  totalAmount: number;
  calculatedRate: number;
  rateStatus: 'match' | 'mismatch' | 'unclear' | string;
  note: string;
}

export interface ChalanFreeItem {
  dueNumber: string;
  productName: string;
  quantityText: string;
  note: string;
}

export interface ChalanMissingFreeAlert {
  productName: string;
  dueNumber: string;
  reason: string;
  severity: 'warning' | 'info' | string;
}

export interface ChalanDueComparison {
  dueNumber: string;
  status:
    | 'matched'
    | 'missing_in_current'
    | 'missing_in_previous'
    | 'last_digit_alert'
    | 'qty_or_amount_diff'
    | 'unclear'
    | string;
  currentUndeliveryOrDeliveryNo: string;
  previousUndeliveryOrDeliveryNo: string;
  lastDigitWarning: string;
  details: string;
}

export interface ChalanUncertainWarning {
  fieldOrLine: string;
  rawSnippet: string;
  reason: string;
}

export interface ChalanVerificationResult {
  header: ChalanHeaderInfo;
  paidItems: ChalanPaidItem[];
  freeItems: ChalanFreeItem[];
  missingFreeAlerts: ChalanMissingFreeAlert[];
  dueComparisons: ChalanDueComparison[];
  uncertainOrBlurryWarnings: ChalanUncertainWarning[];
  quickSummaryBn: string;
}

export interface ChalanSavedNote {
  id: string;
  title: string;
  dueTag: string;
  noteText: string;
  chalanText: string;
  comparisonText: string;
  verification: ChalanVerificationResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChalanSavedNoteFlags {
  hasRateMismatch: boolean;
  hasMissingFree: boolean;
  hasDueAlert: boolean;
  hasUncertain: boolean;
  hasAnyIssue: boolean;
}

export interface ChalanImageQualityReport {
  brightness: number; // 0-255
  sharpness: number; // average gradient edge energy
  isDark: boolean;
  isBlurry: boolean;
  warnings: string[];
}

export interface ChalanCropBox {
  topPct: number; // 0-40
  rightPct: number; // 0-40
  bottomPct: number; // 0-40
  leftPct: number; // 0-40
}

export interface ChalanImageTransformOptions {
  rotationDeg?: number; // 0, 90, 180, 270
  crop?: ChalanCropBox;
  enhanceContrast?: boolean;
}

// Completely isolated storage keys — NEVER touch LedgerData or main accounts
const STANDALONE_CHALAN_NOTES_KEY = 'khan_enterprise_standalone_chalan_notes_v1';
const STANDALONE_CHALAN_DRAFT_KEY = 'khan_enterprise_standalone_chalan_draft_v1';
const STANDALONE_CHALAN_REPS_KEY = 'khan_enterprise_standalone_chalan_reps_v1';

export type ChalanSubTab = 'verify' | 'notes' | 'reps_logos';

export interface StandaloneRepContact {
  id: string;
  companyName: string;
  role: 'TSM' | 'SR' | 'Other';
  name: string;
  phone: string;
  note: string;
}

export interface StandaloneChalanWorkspaceDraft {
  activeSubTab?: ChalanSubTab;
  selectedRepCompanyId?: string;
  editingNoteId: string | null;
  noteTitle: string;
  noteDueTag: string;
  noteText: string;
  chalanText: string;
  comparisonText: string;
  extraNote: string;
  result: ChalanVerificationResult | null;
  resultFilter: 'all' | 'rate_mismatch' | 'free_issues' | 'due_alerts' | 'uncertain';
  archiveFilter: 'all' | 'missing_free' | 'rate_mismatch' | 'due_alert' | 'uncertain';
  searchQuery: string;
  isSamplePreview?: boolean;
}

export function loadStandaloneChalanDraft(): Partial<StandaloneChalanWorkspaceDraft> | null {
  try {
    const raw = localStorage.getItem(STANDALONE_CHALAN_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<StandaloneChalanWorkspaceDraft>;
  } catch {
    return null;
  }
}

export function saveStandaloneChalanDraft(draft: StandaloneChalanWorkspaceDraft): void {
  try {
    localStorage.setItem(STANDALONE_CHALAN_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage quota errors for transient draft
  }
}

export function clearStandaloneChalanDraft(): void {
  try {
    localStorage.removeItem(STANDALONE_CHALAN_DRAFT_KEY);
  } catch {
    // ignore storage errors
  }
}

export function loadStandaloneChalanReps(): StandaloneRepContact[] {
  try {
    const raw = localStorage.getItem(STANDALONE_CHALAN_REPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StandaloneRepContact =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.phone === 'string'
    );
  } catch {
    return [];
  }
}

export function saveStandaloneChalanReps(reps: StandaloneRepContact[]): {
  ok: boolean;
  error?: string;
} {
  try {
    localStorage.setItem(STANDALONE_CHALAN_REPS_KEY, JSON.stringify(reps));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'ব্রাউজার স্টোরেজ পূর্ণ হয়ে গেছে। পুরনো তথ্য মুছে আবার চেষ্টা করুন।',
    };
  }
}

export function createSampleStandaloneChalanTest(): {
  title: string;
  dueTag: string;
  noteText: string;
  chalanText: string;
  comparisonText: string;
  result: ChalanVerificationResult;
} {
  return {
    title: 'স্যাম্পল টেস্ট — প্রাণ চালান #DH-88412',
    dueTag: 'DH 2304678, DH 2304681',
    noteText:
      'টেস্ট নোট: ২টি প্রোডাক্টে রেটের অমিল ও ফ্রি পিস মিসিং পাওয়া গেছে। আনডেলিভারি শেষ সংখ্যা যাচাই করে ডিলার প্রতিনিধিকে জানানো হবে।',
    chalanText:
      'DH 2304678 — Mango Juice 250ml 10k মোট ৳7,200 (রেট ৳700 লেখা), Chocolate Biscuit 5k 0 Free মিসিং, DH 2304681 (আগে ছিল 2304680)',
    comparisonText: 'আগের আনডেলিভারি স্লিপ: DH 2304680 (Mango Juice 2k বাকি)',
    result: {
      header: {
        companyOrSupplier: 'প্রাণ ফুডস লিমিটেড (টেস্ট ডেমো)',
        invoiceOrChalanNo: 'TEST-CH-88412',
        invoiceDate: new Date().toLocaleDateString('en-CA'),
        dueNumbers: ['DH 2304678', 'DH 2304681'],
        summaryNote:
          'এটি ১-ক্লিক পরীক্ষামূলক নমুনা চালান ফলাফল — ফিল্টার, রেট অমিল, ফ্রি মিসিং, কপি ও CSV/প্রিন্ট যাচাইয়ের জন্য (মূল হিসাবের সাথে কোনো সম্পর্ক নেই)।',
      },
      paidItems: [
        {
          dueNumber: 'DH 2304678',
          productName: 'Mango Juice 250ml',
          quantityText: '10k',
          numericQty: 10,
          unitType: 'k (কার্টন)',
          printedRate: 700,
          totalAmount: 7200,
          calculatedRate: 720,
          rateStatus: 'mismatch',
          note: 'চালানে লেখা রেট ৳700 কিন্তু মোট ৳7,200 ÷ 10 = ৳720 (প্রতি কার্টনে ৳20 বেশি)',
        },
        {
          dueNumber: 'DH 2304678',
          productName: 'Potata Biscuit Family',
          quantityText: '6k',
          numericQty: 6,
          unitType: 'k (কার্টন)',
          printedRate: 540,
          totalAmount: 3240,
          calculatedRate: 540,
          rateStatus: 'match',
          note: 'হিসাব ঠিক আছে (৬ × ৫৪০ = ৳৩,২৪০)',
        },
        {
          dueNumber: 'DH 2304681',
          productName: 'Litchi Drink 200ml',
          quantityText: '4k 12ps',
          numericQty: 4.5,
          unitType: 'k + ps',
          printedRate: 620,
          totalAmount: 2790,
          calculatedRate: 620,
          rateStatus: 'unclear',
          note: 'পিচ সংখ্যা (12ps) কাগজে হালকা ঝাপসা, যাচাই করুন',
        },
      ],
      freeItems: [
        {
          dueNumber: 'DH 2304678',
          productName: 'Mango Juice 250ml (Free)',
          quantityText: '0 (5ps Free)',
          note: 'স্কিম অনুযায়ী ৫ পিস ফ্রি উল্লেখ আছে',
        },
      ],
      missingFreeAlerts: [
        {
          productName: 'Potata Biscuit Family',
          dueNumber: 'DH 2304678',
          reason: '৫+ কার্টনে ১ প্যাকেট ফ্রি স্কিম থাকলেও চালানে 0 Free এন্ট্রি পাওয়া যায়নি।',
          severity: 'warning',
        },
      ],
      dueComparisons: [
        {
          dueNumber: 'DH 2304681',
          status: 'last_digit_alert',
          currentUndeliveryOrDeliveryNo: '2304681',
          previousUndeliveryOrDeliveryNo: '2304680',
          lastDigitWarning: 'শেষের সংখ্যা 0 এর বদলে 1 এসেছে — ডেলিভারি/আনডেলিভারি স্লিপ মিলিয়ে নিন!',
          details: 'আগের আনডেলিভারি নম্বর 2304680 এর সাথে শেষ সংখ্যায় ১ ডিজিট পার্থক্য রয়েছে।',
        },
      ],
      uncertainOrBlurryWarnings: [
        {
          fieldOrLine: 'Litchi Drink 200ml (পিস)',
          rawSnippet: '4k 1?ps',
          reason: 'পিস সংখ্যা অস্পষ্ট হতে পারে — হাতে মিলিয়ে নিশ্চিত করুন।',
        },
      ],
      quickSummaryBn:
        'টেস্ট সারসংক্ষেপ: মোট ৩টি পণ্যে ৳১৩,২৩০ বিল। Mango Juice-এ রেট ৳২০ অমিল, Potata Biscuit-এ ফ্রি পিস মিসিং এবং DH 2304681 নম্বরের শেষ সংখ্যায় সতর্কতা পাওয়া গেছে।',
    },
  };
}

export function createStandaloneNoteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cn_${crypto.randomUUID()}`;
  }
  return `cn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadChalanSavedNotes(): ChalanSavedNote[] {
  try {
    const raw = localStorage.getItem(STANDALONE_CHALAN_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ChalanSavedNote =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.noteText === 'string'
    );
  } catch {
    return [];
  }
}

export function saveChalanSavedNotes(notes: ChalanSavedNote[]): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(STANDALONE_CHALAN_NOTES_KEY, JSON.stringify(notes));
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'ব্রাউজার স্টোরেজ পূর্ণ হয়ে গেছে। পুরনো অপ্রয়োজনীয় নোট মুছে আবার সেভ করুন।',
    };
  }
}

export function classifyVerificationFlags(
  verification: ChalanVerificationResult | null | undefined
): ChalanSavedNoteFlags {
  if (!verification) {
    return {
      hasRateMismatch: false,
      hasMissingFree: false,
      hasDueAlert: false,
      hasUncertain: false,
      hasAnyIssue: false,
    };
  }

  const hasRateMismatch = verification.paidItems.some(
    (item) => item.rateStatus === 'mismatch'
  );
  const hasMissingFree = verification.missingFreeAlerts.length > 0;
  const hasDueAlert = verification.dueComparisons.some(
    (comp) =>
      comp.status === 'last_digit_alert' ||
      comp.status === 'missing_in_current' ||
      comp.status === 'missing_in_previous' ||
      comp.status === 'qty_or_amount_diff' ||
      Boolean(comp.lastDigitWarning?.trim())
  );
  const hasUncertain =
    verification.uncertainOrBlurryWarnings.length > 0 ||
    verification.paidItems.some((item) => item.rateStatus === 'unclear');

  return {
    hasRateMismatch,
    hasMissingFree,
    hasDueAlert,
    hasUncertain,
    hasAnyIssue: hasRateMismatch || hasMissingFree || hasDueAlert || hasUncertain,
  };
}

export function formatChalanVerificationAsText(
  result: ChalanVerificationResult,
  title?: string
): string {
  const lines: string[] = [];
  if (title && title.trim()) {
    lines.push(`শিরোনাম: ${title.trim()}`);
  }
  if (result.header.companyOrSupplier) {
    lines.push(`প্রতিষ্ঠান/কোম্পানি: ${result.header.companyOrSupplier}`);
  }
  if (result.header.invoiceOrChalanNo) {
    lines.push(`চালান/ইনভয়েস নং: ${result.header.invoiceOrChalanNo}`);
  }
  if (result.header.invoiceDate) {
    lines.push(`তারিখ: ${result.header.invoiceDate}`);
  }
  if (result.header.dueNumbers.length > 0) {
    lines.push(`ডিউ নম্বর: ${result.header.dueNumbers.join(', ')}`);
  }

  if (result.paidItems.length > 0) {
    lines.push('');
    lines.push('--- মূল প্রোডাক্ট ও রেট ---');
    result.paidItems.forEach((item, index) => {
      const ratePart =
        item.calculatedRate > 0 ? `রেট ৳${item.calculatedRate.toFixed(2)}` : 'রেট অস্পষ্ট';
      const totalPart =
        item.totalAmount > 0 ? `মোট ৳${item.totalAmount.toFixed(2)}` : 'মোট অস্পষ্ট';
      const duePart = item.dueNumber ? ` [${item.dueNumber}]` : '';
      const statusPart =
        item.rateStatus === 'mismatch'
          ? ' (রেটে অমিল!)'
          : item.rateStatus === 'unclear'
            ? ' (অস্পষ্ট)'
            : '';
      lines.push(
        `${index + 1}. ${item.productName}${duePart} — ${item.quantityText || '-'} | ${totalPart} | ${ratePart}${statusPart}`
      );
    });
  }

  if (result.freeItems.length > 0) {
    lines.push('');
    lines.push('--- ফ্রি (0) প্রোডাক্ট ---');
    result.freeItems.forEach((item, index) => {
      const duePart = item.dueNumber ? ` [${item.dueNumber}]` : '';
      lines.push(`${index + 1}. ${item.productName}${duePart} — ${item.quantityText || '0'}`);
    });
  }

  if (result.missingFreeAlerts.length > 0) {
    lines.push('');
    lines.push('--- ফ্রি মিসিং সতর্কতা ---');
    result.missingFreeAlerts.forEach((alert) => {
      lines.push(`• ${alert.productName}: ${alert.reason}`);
    });
  }

  if (result.dueComparisons.length > 0) {
    lines.push('');
    lines.push('--- ডিউ ও ডেলিভারি/আনডেলিভারি যাচাই ---');
    result.dueComparisons.forEach((comp) => {
      const digitAlert = comp.lastDigitWarning
        ? ` | শেষ ডিজিট সতর্কতা: ${comp.lastDigitWarning}`
        : '';
      lines.push(`• ${comp.dueNumber || 'রেফারেন্স'}: ${comp.details}${digitAlert}`);
    });
  }

  if (result.uncertainOrBlurryWarnings.length > 0) {
    lines.push('');
    lines.push('--- অস্পষ্ট / সন্দেহজনক অংশ ---');
    result.uncertainOrBlurryWarnings.forEach((w) => {
      lines.push(`• ${w.fieldOrLine}: ${w.reason}${w.rawSnippet ? ` (${w.rawSnippet})` : ''}`);
    });
  }

  if (result.quickSummaryBn.trim()) {
    lines.push('');
    lines.push('--- সারসংক্ষেপ ---');
    lines.push(result.quickSummaryBn.trim());
  }

  return lines.join('\n').trim();
}

function escapeCsvCell(value: unknown): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function sanitizeFileSlug(text: string): string {
  const cleaned = text
    .trim()
    .replace(/[^\w\u0980-\u09FF-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return cleaned || 'chalan_note';
}

export function downloadChalanNoteAsTxt(params: {
  title: string;
  dueTag: string;
  noteText: string;
  verification: ChalanVerificationResult | null;
}): void {
  const lines: string[] = [];
  lines.push('Khan Enterprise — স্বতন্ত্র চালান যাচাই ও নোট');
  lines.push(`তারিখ: ${new Date().toLocaleString('bn-BD')}`);
  if (params.title.trim()) lines.push(`শিরোনাম: ${params.title.trim()}`);
  if (params.dueTag.trim()) lines.push(`ডিউ নম্বর/ট্যাগ: ${params.dueTag.trim()}`);
  lines.push('');

  if (params.noteText.trim()) {
    lines.push('=== ব্যক্তিগত নোট ===');
    lines.push(params.noteText.trim());
    lines.push('');
  }

  if (params.verification) {
    lines.push('=== চালান যাচাই বিশ্লেষণ ===');
    lines.push(formatChalanVerificationAsText(params.verification));
  }

  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/plain;charset=utf-8;',
  });
  triggerFileDownload(blob, `${sanitizeFileSlug(params.title || params.dueTag)}.txt`);
}

export function downloadChalanNoteAsCsv(params: {
  title: string;
  dueTag: string;
  noteText: string;
  verification: ChalanVerificationResult | null;
}): void {
  const rows: string[][] = [];
  rows.push(['বিভাগ', 'ডিউ নম্বর', 'প্রোডাক্ট / বিষয়', 'পরিমাণ', 'মোট টাকা (৳)', 'হিসাবকৃত রেট (৳)', 'ইনভয়েস রেট (৳)', 'অবস্থা / মন্তব্য']);

  if (params.title.trim() || params.dueTag.trim()) {
    rows.push([
      'তথ্য',
      params.dueTag.trim(),
      params.title.trim() || 'চালান নোট',
      '',
      '',
      '',
      '',
      params.verification?.header.companyOrSupplier || '',
    ]);
  }

  if (params.noteText.trim()) {
    rows.push(['ব্যক্তিগত নোট', params.dueTag.trim(), 'নোট', '', '', '', '', params.noteText.trim()]);
  }

  if (params.verification) {
    for (const item of params.verification.paidItems) {
      const statusBn =
        item.rateStatus === 'match'
          ? 'ঠিক আছে'
          : item.rateStatus === 'mismatch'
            ? 'রেটে অমিল'
            : 'অস্পষ্ট';
      rows.push([
        'মূল প্রোডাক্ট',
        item.dueNumber || '',
        item.productName,
        item.quantityText || String(item.numericQty || ''),
        item.totalAmount > 0 ? item.totalAmount.toFixed(2) : '',
        item.calculatedRate > 0 ? item.calculatedRate.toFixed(2) : '',
        item.printedRate > 0 ? item.printedRate.toFixed(2) : '',
        `${statusBn}${item.note ? ` — ${item.note}` : ''}`,
      ]);
    }

    for (const free of params.verification.freeItems) {
      rows.push([
        'ফ্রি আইটেম',
        free.dueNumber || '',
        free.productName,
        free.quantityText || '0 Free',
        '0',
        '0',
        '0',
        free.note || 'ফ্রি প্রোডাক্ট',
      ]);
    }

    for (const alert of params.verification.missingFreeAlerts) {
      rows.push([
        'ফ্রি মিসিং সতর্কতা',
        alert.dueNumber || '',
        alert.productName,
        '',
        '',
        '',
        '',
        alert.reason,
      ]);
    }

    for (const comp of params.verification.dueComparisons) {
      rows.push([
        'ডিউ / আনডেলিভারি',
        comp.dueNumber || '',
        `${comp.currentUndeliveryOrDeliveryNo || ''} / ${comp.previousUndeliveryOrDeliveryNo || ''}`.trim(),
        '',
        '',
        '',
        '',
        `${comp.lastDigitWarning ? `শেষ সংখ্যা সতর্কতা: ${comp.lastDigitWarning} · ` : ''}${comp.details}`,
      ]);
    }

    for (const warn of params.verification.uncertainOrBlurryWarnings) {
      rows.push([
        'অস্পষ্ট অংশ',
        '',
        warn.fieldOrLine,
        warn.rawSnippet || '',
        '',
        '',
        '',
        warn.reason,
      ]);
    }
  }

  const csvBody = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csvBody}`], {
    type: 'text/csv;charset=utf-8;',
  });
  triggerFileDownload(blob, `${sanitizeFileSlug(params.title || params.dueTag)}.csv`);
}

function analyzeCanvasQuality(canvas: HTMLCanvasElement): ChalanImageQualityReport {
  const sampleW = 160;
  const sampleH = Math.max(80, Math.round((canvas.height / Math.max(1, canvas.width)) * sampleW));
  const probe = document.createElement('canvas');
  probe.width = sampleW;
  probe.height = sampleH;
  const pCtx = probe.getContext('2d');
  if (!pCtx) {
    return { brightness: 140, sharpness: 20, isDark: false, isBlurry: false, warnings: [] };
  }
  pCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
  const { data } = pCtx.getImageData(0, 0, sampleW, sampleH);

  const luma = new Float32Array(sampleW * sampleH);
  let sumLuma = 0;
  for (let i = 0; i < luma.length; i += 1) {
    const idx = i * 4;
    const y = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    luma[i] = y;
    sumLuma += y;
  }
  const brightness = sumLuma / Math.max(1, luma.length);

  // Mean edge gradient / Laplacian magnitude on interior pixels
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 1; y < sampleH - 1; y += 1) {
    for (let x = 1; x < sampleW - 1; x += 1) {
      const idx = y * sampleW + x;
      const lap =
        Math.abs(
          4 * luma[idx] -
            luma[idx - 1] -
            luma[idx + 1] -
            luma[idx - sampleW] -
            luma[idx + sampleW]
        );
      edgeSum += lap;
      edgeCount += 1;
    }
  }
  const sharpness = edgeSum / Math.max(1, edgeCount);

  const isDark = brightness < 82;
  const isBlurry = sharpness < 8.5;
  const warnings: string[] = [];
  if (isDark) {
    warnings.push('আলো কম / ছবি অন্ধকার — "লেখা স্পষ্ট করুন" বা উজ্জ্বল আলোয় ছবি দিন');
  }
  if (isBlurry) {
    warnings.push('ছবি কিছুটা ঝাপসা হতে পারে — সংখ্যা ও k/ps ভালোভাবে যাচাই করে নিন');
  }

  return {
    brightness: Math.round(brightness),
    sharpness: Number(sharpness.toFixed(1)),
    isDark,
    isBlurry,
    warnings,
  };
}

export async function processChalanImage(
  source: File | string,
  options: ChalanImageTransformOptions = {}
): Promise<{
  mimeType: 'image/jpeg';
  dataUrl: string;
  quality: ChalanImageQualityReport;
}> {
  let rawDataUrl: string;
  if (typeof source === 'string') {
    rawDataUrl = source;
  } else {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(source.type)) {
      throw new Error('শুধুমাত্র JPG, PNG অথবা WEBP ফরম্যাটের ছবি আপলোড করা যাবে।');
    }
    rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('ছবি পড়া যায়নি।'));
      reader.readAsDataURL(source);
    });
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const imageEl = new Image();
    imageEl.onload = () => resolve(imageEl);
    imageEl.onerror = () => reject(new Error('ছবি লোড করতে সমস্যা হয়েছে।'));
    imageEl.src = rawDataUrl;
  });

  const rotation = (((options.rotationDeg ?? 0) % 360) + 360) % 360;
  const isQuarterTurn = rotation === 90 || rotation === 270;

  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;

  // Step 1: Rotate on intermediate canvas
  const rotW = isQuarterTurn ? natH : natW;
  const rotH = isQuarterTurn ? natW : natH;
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rCtx = rotCanvas.getContext('2d');
  if (!rCtx) {
    throw new Error('ছবি প্রসেস করতে ব্রাউজার ক্যানভাস চালু করা যায়নি।');
  }
  rCtx.fillStyle = '#ffffff';
  rCtx.fillRect(0, 0, rotW, rotH);
  rCtx.save();
  rCtx.translate(rotW / 2, rotH / 2);
  rCtx.rotate((rotation * Math.PI) / 180);
  rCtx.drawImage(img, -natW / 2, -natH / 2);
  rCtx.restore();

  // Step 2: Apply crop insets (%)
  const crop = options.crop ?? { topPct: 0, rightPct: 0, bottomPct: 0, leftPct: 0 };
  const clampPct = (v: number) => Math.max(0, Math.min(45, v));
  const leftPx = Math.round((clampPct(crop.leftPct) / 100) * rotW);
  const topPx = Math.round((clampPct(crop.topPct) / 100) * rotH);
  const rightPx = Math.round((clampPct(crop.rightPct) / 100) * rotW);
  const bottomPx = Math.round((clampPct(crop.bottomPct) / 100) * rotH);

  const srcW = Math.max(40, rotW - leftPx - rightPx);
  const srcH = Math.max(40, rotH - topPx - bottomPx);

  // Step 3: Scale down to MAX_SIDE = 1600
  const MAX_SIDE = 1600;
  let outW = srcW;
  let outH = srcH;
  if (outW > MAX_SIDE || outH > MAX_SIDE) {
    if (outW >= outH) {
      outH = Math.round((outH * MAX_SIDE) / outW);
      outW = MAX_SIDE;
    } else {
      outW = Math.round((outW * MAX_SIDE) / outH);
      outH = MAX_SIDE;
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const oCtx = outCanvas.getContext('2d');
  if (!oCtx) {
    throw new Error('ছবি তৈরি করতে সমস্যা হয়েছে।');
  }
  oCtx.fillStyle = '#ffffff';
  oCtx.fillRect(0, 0, outW, outH);
  if (options.enhanceContrast) {
    oCtx.filter = 'contrast(1.26) brightness(1.1) saturate(0.92)';
  }
  oCtx.drawImage(rotCanvas, leftPx, topPx, srcW, srcH, 0, 0, outW, outH);
  oCtx.filter = 'none';

  const quality = analyzeCanvasQuality(outCanvas);
  const dataUrl = outCanvas.toDataURL('image/jpeg', 0.88);
  return {
    mimeType: 'image/jpeg',
    dataUrl,
    quality,
  };
}
