import {
  AuthConfig,
  CashTransaction,
  CashTransactionType,
  Company,
  CompanyLedgerEntry,
  CompanyLedgerType,
  Customer,
  CustomerCreditEntry,
  CustomerCreditEntryType,
  DailyEntry,
  DailyLineItem,
  LedgerData,
  Product,
  StockMovement,
  StockMovementType,
} from '../types/ledger';
import { isSupabaseConfigured, supabase } from './supabase';

const STORAGE_KEY = 'distribution_agency_ledger_v1';

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDateISO(dateISO: string, deltaDays: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const BN_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

const BN_WEEKDAYS = [
  'রবিবার',
  'সোমবার',
  'মঙ্গলবার',
  'বুধবার',
  'বৃহস্পতিবার',
  'শুক্রবার',
  'শনিবার',
];

export function getCurrentMonthISO(): string {
  return getTodayISO().slice(0, 7);
}

export function getCurrentYear(): string {
  return getTodayISO().slice(0, 4);
}

export function shiftMonthISO(monthISO: string, deltaMonths: number): string {
  const [y, m] = monthISO.split('-').map(Number);
  const dt = new Date(y, m - 1 + deltaMonths, 1);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatMonthBn(monthISO: string): string {
  if (!monthISO) return '';
  const parts = monthISO.split('-').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return monthISO;
  const [y, m] = parts;
  const monthName = BN_MONTHS[m - 1] ?? String(m);
  return `${monthName} ${y}`;
}

export function formatDateBn(dateISO: string, includeWeekday = false): string {
  if (!dateISO) return '';
  const parts = dateISO.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateISO;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  const monthName = BN_MONTHS[m - 1] ?? String(m);
  const formatted = `${d} ${monthName} ${y}`;
  if (includeWeekday) {
    const weekday = BN_WEEKDAYS[dt.getDay()] ?? '';
    return `${formatted} · ${weekday}`;
  }
  return formatted;
}

export function formatTaka(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const hasDecimals = Math.abs(safe - Math.round(safe)) > 0.001;
  return `৳ ${safe.toLocaleString('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Cloud sync (Supabase) — the `ledger_state` table (row id 'main') is the
// single source of truth. localStorage stays only as an offline cache so the
// app keeps working when the network / Supabase is unreachable.
// ---------------------------------------------------------------------------

const LEDGER_ROW_ID = 'main';
const CLOUD_SAVE_DEBOUNCE_MS = 500;

export type CloudSyncStatus = 'not-configured' | 'loading' | 'synced' | 'saving' | 'offline';

let cloudSyncStatus: CloudSyncStatus = isSupabaseConfigured ? 'loading' : 'not-configured';
const cloudSyncListeners = new Set<(status: CloudSyncStatus) => void>();

function setCloudSyncStatus(next: CloudSyncStatus): void {
  if (next === cloudSyncStatus) return;
  cloudSyncStatus = next;
  for (const listener of cloudSyncListeners) {
    try {
      listener(next);
    } catch {
      // Ignore listener errors.
    }
  }
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return cloudSyncStatus;
}

export function subscribeCloudSyncStatus(
  listener: (status: CloudSyncStatus) => void
): () => void {
  cloudSyncListeners.add(listener);
  return () => {
    cloudSyncListeners.delete(listener);
  };
}

export function emptyLedgerData(): LedgerData {
  return {
    version: 1,
    companies: [],
    products: [],
    entries: {},
    cashTransactions: [],
    companyLedgerEntries: [],
    stockMovements: [],
    customers: [],
    customerCreditEntries: [],
    authConfig: { companyPasswordHashes: {} },
  };
}

function normalizeLedgerData(parsed: Partial<LedgerData>): LedgerData {
  const rawAuth = parsed.authConfig;
  const companyHashes =
    rawAuth &&
    typeof rawAuth.companyPasswordHashes === 'object' &&
    rawAuth.companyPasswordHashes !== null
      ? rawAuth.companyPasswordHashes
      : {};
  const companies = Array.isArray(parsed.companies) ? parsed.companies : [];
  const products = Array.isArray(parsed.products) ? parsed.products : [];
  const entries =
    parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
  const rawCash = Array.isArray(parsed.cashTransactions) ? parsed.cashTransactions : [];
  const companyLedgerEntries = Array.isArray(parsed.companyLedgerEntries)
    ? parsed.companyLedgerEntries
    : [];
  const stockMovements = Array.isArray(parsed.stockMovements) ? parsed.stockMovements : [];
  const rawCustomers = Array.isArray(parsed.customers) ? parsed.customers : [];
  const rawCreditEntries = Array.isArray(parsed.customerCreditEntries)
    ? parsed.customerCreditEntries
    : [];

  const DEMO_CASH_COMPANY: Record<string, string> = {
    tx_1: 'comp_pran',
    tx_2: 'comp_pran',
    tx_3: 'comp_pran',
    tx_4: 'comp_square',
    tx_5: 'comp_square',
    tx_6: 'comp_akij',
    tx_7: 'comp_pran',
    tx_8: 'comp_akij',
  };
  const DEMO_CUSTOMER_COMPANY: Record<string, string> = {
    cust_1: 'comp_pran',
    cust_2: 'comp_akij',
    cust_3: 'comp_square',
  };
  const DEMO_CREDIT_COMPANY: Record<string, string> = {
    cc_1: 'comp_pran',
    cc_2: 'comp_pran',
    cc_3: 'comp_akij',
    cc_4: 'comp_akij',
    cc_5: 'comp_square',
  };

  const singleCompanyId = companies.length === 1 ? companies[0].id : undefined;

  const customers: Customer[] = rawCustomers.map((c) => {
    if (c.companyId) return c;
    const inferred = DEMO_CUSTOMER_COMPANY[c.id] ?? singleCompanyId;
    return inferred ? { ...c, companyId: inferred } : c;
  });

  const customerCompanyMap = new Map<string, string>();
  for (const c of customers) {
    if (c.companyId) customerCompanyMap.set(c.id, c.companyId);
  }

  const cashTransactions: CashTransaction[] = rawCash.map((tx) => {
    if (tx.companyId) return tx;
    const inferred = DEMO_CASH_COMPANY[tx.id] ?? singleCompanyId;
    return inferred ? { ...tx, companyId: inferred } : tx;
  });

  const customerCreditEntries: CustomerCreditEntry[] = rawCreditEntries.map((ce) => {
    if (ce.companyId) return ce;
    const inferred =
      DEMO_CREDIT_COMPANY[ce.id] ?? customerCompanyMap.get(ce.customerId) ?? singleCompanyId;
    return inferred ? { ...ce, companyId: inferred } : ce;
  });

  return {
    version: 1,
    companies,
    products,
    entries,
    cashTransactions,
    companyLedgerEntries,
    stockMovements,
    customers,
    customerCreditEntries,
    authConfig: {
      adminPasswordHash:
        rawAuth && typeof rawAuth.adminPasswordHash === 'string'
          ? rawAuth.adminPasswordHash
          : undefined,
      companyPasswordHashes: companyHashes,
    },
  };
}

function writeCache(data: LedgerData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to persist ledger data:', err);
  }
}

/** Synchronous read of the offline cache only (used for the saved-view check). */
export function loadCachedLedgerData(): LedgerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLedgerData();
    return normalizeLedgerData(JSON.parse(raw) as Partial<LedgerData>);
  } catch {
    return emptyLedgerData();
  }
}

/**
 * Load the ledger: Supabase first, offline cache as fallback. Never throws —
 * on any cloud failure it returns the cached copy and marks status 'offline'.
 */
export async function loadLedgerData(): Promise<LedgerData> {
  const cached = loadCachedLedgerData();
  if (!isSupabaseConfigured || !supabase) {
    setCloudSyncStatus('not-configured');
    return cached;
  }
  try {
    const { data, error } = await supabase
      .from('ledger_state')
      .select('data')
      .eq('id', LEDGER_ROW_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // No cloud row yet (migration not run) — keep using the local cache.
      setCloudSyncStatus('synced');
      return cached;
    }
    const normalized = normalizeLedgerData(data.data as Partial<LedgerData>);
    writeCache(normalized);
    setCloudSyncStatus('synced');
    return normalized;
  } catch (err) {
    console.error('Cloud load failed, using offline cache:', err);
    setCloudSyncStatus('offline');
    return cached;
  }
}

let cloudSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCloudSave: LedgerData | null = null;
let pendingCloudSaveResolvers: Array<(ok: boolean) => void> = [];

async function flushCloudSave(): Promise<void> {
  cloudSaveTimer = null;
  const payload = pendingCloudSave;
  pendingCloudSave = null;
  const resolvers = pendingCloudSaveResolvers;
  pendingCloudSaveResolvers = [];
  if (!payload || !supabase) {
    for (const resolve of resolvers) resolve(false);
    return;
  }
  try {
    const { error } = await supabase.from('ledger_state').upsert({
      id: LEDGER_ROW_ID,
      data: payload,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    setCloudSyncStatus('synced');
    for (const resolve of resolvers) resolve(true);
  } catch (err) {
    console.error('Cloud save failed, data kept in offline cache:', err);
    setCloudSyncStatus('offline');
    for (const resolve of resolvers) resolve(false);
  }
}

/**
 * Save the ledger: the offline cache is updated immediately, the cloud
 * upsert is debounced (~500ms) so rapid edits become one write. Resolves
 * true when the cloud write succeeds, false when only the cache was updated.
 */
export function saveLedgerData(data: LedgerData): Promise<boolean> {
  writeCache(data);
  if (!isSupabaseConfigured || !supabase) {
    setCloudSyncStatus('not-configured');
    return Promise.resolve(false);
  }
  pendingCloudSave = data;
  const promise = new Promise<boolean>((resolve) => {
    pendingCloudSaveResolvers.push(resolve);
  });
  if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
  setCloudSyncStatus('saving');
  cloudSaveTimer = setTimeout(() => {
    void flushCloudSave();
  }, CLOUD_SAVE_DEBOUNCE_MS);
  return promise;
}

// If the tab is hidden with a save still debounced, push it right away
// instead of waiting — the offline cache already holds the data either way.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && cloudSaveTimer) {
      clearTimeout(cloudSaveTimer);
      void flushCloudSave();
    }
  });
}

export function getEntryKey(companyId: string, date: string): string {
  return `${companyId}_${date}`;
}

export function computeLineItem(
  productId: string,
  productName: string,
  unit: string,
  rate: number,
  marketOut: number,
  returned: number
): DailyLineItem {
  const cleanRate = Math.max(0, Number.isFinite(rate) ? rate : 0);
  const cleanOut = Math.max(0, Number.isFinite(marketOut) ? marketOut : 0);
  const cleanReturn = Math.max(0, Math.min(cleanOut, Number.isFinite(returned) ? returned : 0));
  const soldQty = Math.max(0, cleanOut - cleanReturn);
  const salesAmount = Number((soldQty * cleanRate).toFixed(2));
  return {
    productId,
    productName,
    unit,
    rate: cleanRate,
    marketOut: cleanOut,
    returned: cleanReturn,
    soldQty,
    salesAmount,
  };
}

export function summarizeEntry(
  companyId: string,
  date: string,
  items: DailyLineItem[],
  note?: string
): DailyEntry {
  let totalMarketOut = 0;
  let totalReturned = 0;
  let totalSoldQty = 0;
  let totalSalesAmount = 0;

  for (const item of items) {
    totalMarketOut += item.marketOut;
    totalReturned += item.returned;
    totalSoldQty += item.soldQty;
    totalSalesAmount += item.salesAmount;
  }

  return {
    id: getEntryKey(companyId, date),
    companyId,
    date,
    items,
    totalMarketOut,
    totalReturned,
    totalSoldQty,
    totalSalesAmount: Number(totalSalesAmount.toFixed(2)),
    note,
    updatedAt: new Date().toISOString(),
  };
}

export function downloadCompanyDayCsv(companyName: string, entry: DailyEntry): void {
  const header = ['তারিখ', 'কোম্পানি', 'প্রোডাক্ট', 'ইউনিট', 'রেট (৳)', 'মার্কেটে গেছে', 'রিটার্ন', 'নেট বিক্রি', 'মোট সেলস (৳)'];
  const rows = entry.items.map((item) => [
    entry.date,
    companyName,
    item.productName,
    item.unit,
    item.rate.toString(),
    item.marketOut.toString(),
    item.returned.toString(),
    item.soldQty.toString(),
    item.salesAmount.toString(),
  ]);
  rows.push([
    entry.date,
    companyName,
    'মোট হিসাব',
    '',
    '',
    entry.totalMarketOut.toString(),
    entry.totalReturned.toString(),
    entry.totalSoldQty.toString(),
    entry.totalSalesAmount.toString(),
  ]);

  const csvContent =
    '\uFEFF' +
    [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${companyName}_${entry.date}_sales.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCashLedgerCsv(
  transactions: CashTransaction[],
  companyName?: string
): void {
  const header = ['তারিখ', 'কোম্পানি', 'ধরন', 'খাত / বিবরণ', 'নোট', 'টাকা (৳)'];
  const typeLabel = (t: CashTransaction['type']) =>
    t === 'cash_in' ? 'ক্যাশ জমা' : t === 'expense' ? 'খরচ' : 'উত্তোলন';

  const labelComp = companyName || 'Khan Enterprise';
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const rows = sorted.map((tx) => [
    tx.date,
    labelComp,
    typeLabel(tx.type),
    tx.title,
    tx.note ?? '',
    tx.amount.toString(),
  ]);

  let totalIn = 0;
  let totalExp = 0;
  let totalWith = 0;
  for (const tx of transactions) {
    if (tx.type === 'cash_in') totalIn += tx.amount;
    else if (tx.type === 'expense') totalExp += tx.amount;
    else totalWith += tx.amount;
  }

  rows.push(['', labelComp, 'মোট ক্যাশ জমা', '', '', totalIn.toString()]);
  rows.push(['', labelComp, 'মোট খরচ', '', '', totalExp.toString()]);
  rows.push(['', labelComp, 'মোট উত্তোলন', '', '', totalWith.toString()]);
  rows.push(['', labelComp, 'অবশিষ্ট হাতে ক্যাশ', '', '', (totalIn - totalExp - totalWith).toString()]);

  const csvContent =
    '\uFEFF' +
    [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

  const safePrefix = companyName ? companyName.replace(/[\\/:*?"<>|]/g, '_') : 'Khan_Enterprise';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safePrefix}_cash_expense_${getTodayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCompanyLedgerCsv(
  entries: CompanyLedgerEntry[],
  companies: Company[],
  companyName?: string
): void {
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  const header = ['তারিখ', 'কোম্পানি', 'ধরন', 'স্লিপ / চালান নং', 'টাকা (৳)', 'ছবি সংযুক্ত'];
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  const rows = sorted.map((item) => [
    item.date,
    companyMap.get(item.companyId) ?? companyName ?? 'অজানা কোম্পানি',
    item.type === 'payment_given' ? 'টাকা দেওয়া হয়েছে' : 'মাল এসেছে (চালান)',
    item.reference ?? '',
    item.amount.toString(),
    item.attachmentDataUrl ? 'হ্যাঁ' : 'না',
  ]);

  const csvContent =
    '\uFEFF' +
    [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

  const safePrefix = companyName ? companyName.replace(/[\\/:*?"<>|]/g, '_') : 'Khan_Enterprise';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safePrefix}_company_chalan_payment_${getTodayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const STOCK_RATE_MULTIPLIER = 0.94;

export function computeStockRate(salesRate: number): number {
  return Number((salesRate * STOCK_RATE_MULTIPLIER).toFixed(2));
}

export interface StockReportCsvRow {
  companyName: string;
  productName: string;
  unit: string;
  rate: number;
  openingStock: number;
  dayStockIn: number;
  daySold: number;
  closingStock: number;
  stockValue: number;
}

export function downloadStockReportCsv(
  rows: StockReportCsvRow[],
  dateISO: string,
  companyName?: string
): void {
  const header = [
    'তারিখ',
    'কোম্পানি',
    'প্রোডাক্টের নাম',
    'ইউনিট',
    'পূর্বের স্টক',
    'স্টক জমা (+)',
    'দৈনিক বিক্রি (−)',
    'বর্তমান স্টক (পরিমাণ)',
    'স্টক রেট (−৬%) (৳)',
    'মোট টাকা (৳)',
  ];

  let totalIn = 0;
  let totalSold = 0;
  let totalClosing = 0;
  let totalValue = 0;

  const csvRows = rows.map((r) => {
    totalIn += r.dayStockIn;
    totalSold += r.daySold;
    totalClosing += r.closingStock;
    totalValue += r.stockValue;
    return [
      dateISO,
      r.companyName,
      r.productName,
      r.unit,
      r.openingStock.toString(),
      r.dayStockIn.toString(),
      r.daySold.toString(),
      r.closingStock.toString(),
      r.rate.toString(),
      r.stockValue.toString(),
    ];
  });

  csvRows.push([
    dateISO,
    companyName ? `${companyName} — মোট স্টক` : 'পুরো স্টকের সর্বমোট হিসাব',
    '',
    '',
    '',
    totalIn.toString(),
    totalSold.toString(),
    totalClosing.toString(),
    '',
    Number(totalValue.toFixed(2)).toString(),
  ]);

  const csvContent =
    '\uFEFF' +
    [header, ...csvRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

  const safePrefix = companyName ? companyName.replace(/[\\/:*?"<>|]/g, '_') : 'Khan_Enterprise';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safePrefix}_stock_report_${dateISO}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCustomerCreditCsv(
  entries: CustomerCreditEntry[],
  customers: Customer[],
  companyName?: string
): void {
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const header = [
    'তারিখ',
    'কোম্পানি',
    'কাস্টমারের নাম',
    'দোকান / ঠিকানা',
    'ধরন',
    'মেমো নং / বিবরণ',
    'টাকা (৳)',
    'নোট',
    'মেমোর ছবি সংযুক্ত',
  ];

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  let totalCredit = 0;
  let totalPaid = 0;
  const labelComp = companyName || 'Khan Enterprise';

  const rows = sorted.map((item) => {
    const cust = customerMap.get(item.customerId);
    if (item.type === 'credit_given') totalCredit += item.amount;
    else totalPaid += item.amount;
    return [
      item.date,
      labelComp,
      cust?.name ?? 'অজানা কাস্টমার',
      cust?.shopName ?? '',
      item.type === 'credit_given' ? 'ক্রেডিট / মাল নিয়েছে (+)' : 'টাকা জমা (−)',
      item.memoNo ?? '',
      item.amount.toString(),
      item.note ?? '',
      item.memoImageDataUrl ? 'হ্যাঁ' : 'না',
    ];
  });

  rows.push(['', labelComp, 'মোট ক্রেডিট (মাল)', '', '', '', Number(totalCredit.toFixed(2)).toString(), '', '']);
  rows.push(['', labelComp, 'মোট টাকা জমা', '', '', '', Number(totalPaid.toFixed(2)).toString(), '', '']);
  rows.push([
    '',
    labelComp,
    'মোট বাকি পাওনা',
    '',
    '',
    '',
    Number((totalCredit - totalPaid).toFixed(2)).toString(),
    '',
    '',
  ]);

  const csvContent =
    '\uFEFF' +
    [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

  const safePrefix = companyName ? companyName.replace(/[\\/:*?"<>|]/g, '_') : 'Khan_Enterprise';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safePrefix}_customer_credit_${getTodayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const MEDIA_CHUNK_SIZE = 16000;

function toCsvLine(row: (string | number | undefined)[]): string {
  return row
    .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
    .join(',');
}

export function downloadAllInOneExcelCsv(data: LedgerData): void {
  const today = getTodayISO();
  const companyNameMap = new Map(data.companies.map((c) => [c.id, c.name]));
  const productMap = new Map(data.products.map((p) => [p.id, p]));
  const customerMap = new Map(data.customers.map((c) => [c.id, c]));

  const lines: (string | number | undefined)[][] = [];
  const pushSection = (marker: string, headers: string[], rows: (string | number | undefined)[][]) => {
    lines.push([marker]);
    lines.push(headers);
    for (const r of rows) {
      lines.push(r);
    }
    lines.push([]);
  };

  // Report Header
  const totalSales = Object.values(data.entries).reduce((sum, e) => sum + e.totalSalesAmount, 0);
  lines.push(['Khan Enterprise — অল-ইন-ওয়ান এক্সেল ব্যাকআপ ও সম্পূর্ণ রিপোর্ট']);
  lines.push(['ব্যাকআপ তারিখ', today, 'মোট কোম্পানি', data.companies.length, 'মোট সেলস (৳)', totalSales.toFixed(2)]);
  lines.push([]);

  // 1. Companies
  pushSection(
    '[SECTION:COMPANIES]',
    ['companyId', 'কোম্পানির নাম', 'প্রতিনিধি', 'মোবাইল', 'তৈরির সময়'],
    data.companies.map((c) => [c.id, c.name, c.contactPerson ?? '', c.phone ?? '', c.createdAt])
  );

  // 2. Products
  pushSection(
    '[SECTION:PRODUCTS]',
    [
      'productId',
      'companyId',
      'কোম্পানি',
      'প্রোডাক্টের নাম',
      'ইউনিট',
      'রেট (৳)',
      'তৈরির সময়',
      'সর্বনিম্ন স্টক সীমা',
    ],
    data.products.map((p) => [
      p.id,
      p.companyId,
      companyNameMap.get(p.companyId) ?? '',
      p.name,
      p.unit,
      p.rate,
      p.createdAt,
      p.minStock !== undefined ? p.minStock : '',
    ])
  );

  // 3. Daily Sales
  const salesRows: (string | number | undefined)[][] = [];
  const sortedEntries = Object.values(data.entries).sort((a, b) => a.date.localeCompare(b.date));
  for (const entry of sortedEntries) {
    const compName = companyNameMap.get(entry.companyId) ?? '';
    if (entry.items.length === 0) {
      if (entry.note) {
        salesRows.push([
          entry.id,
          entry.date,
          entry.companyId,
          compName,
          '',
          '',
          '',
          0,
          0,
          0,
          0,
          0,
          entry.note,
          entry.updatedAt,
        ]);
      }
      continue;
    }
    for (const item of entry.items) {
      salesRows.push([
        entry.id,
        entry.date,
        entry.companyId,
        compName,
        item.productId,
        item.productName,
        item.unit,
        item.rate,
        item.marketOut,
        item.returned,
        item.soldQty,
        item.salesAmount,
        entry.note ?? '',
        entry.updatedAt,
      ]);
    }
  }
  pushSection(
    '[SECTION:DAILY_SALES]',
    [
      'entryId',
      'তারিখ',
      'companyId',
      'কোম্পানি',
      'productId',
      'প্রোডাক্টের নাম',
      'ইউনিট',
      'রেট (৳)',
      'মার্কেটে গেছে',
      'রিটার্ন',
      'নেট বিক্রি',
      'মোট সেলস (৳)',
      'নোট',
      'আপডেট সময়',
    ],
    salesRows
  );

  // 4. Cash & Expense (trailing companyId & company name keep backward compatibility with older CSVs)
  const cashTypeLabel = (t: CashTransactionType) =>
    t === 'cash_in' ? 'ক্যাশ জমা' : t === 'expense' ? 'খরচ' : 'উত্তোলন';
  const sortedCash = [...data.cashTransactions].sort((a, b) => a.date.localeCompare(b.date));
  pushSection(
    '[SECTION:CASH_EXPENSE]',
    ['id', 'তারিখ', 'type', 'ধরন', 'খাত / বিবরণ', 'টাকা (৳)', 'নোট', 'তৈরির সময়', 'companyId', 'কোম্পানি'],
    sortedCash.map((tx) => [
      tx.id,
      tx.date,
      tx.type,
      cashTypeLabel(tx.type),
      tx.title,
      tx.amount,
      tx.note ?? '',
      tx.createdAt,
      tx.companyId ?? '',
      tx.companyId ? (companyNameMap.get(tx.companyId) ?? '') : '',
    ])
  );

  // 5. Company Ledger (Payment & Chalan)
  const sortedCompanyLedger = [...data.companyLedgerEntries].sort((a, b) => a.date.localeCompare(b.date));
  pushSection(
    '[SECTION:COMPANY_LEDGER]',
    ['id', 'তারিখ', 'companyId', 'কোম্পানি', 'type', 'ধরন', 'টাকা (৳)', 'স্লিপ / চালান নং', 'ছবির নাম', 'ছবি আছে', 'তৈরির সময়'],
    sortedCompanyLedger.map((cl) => [
      cl.id,
      cl.date,
      cl.companyId,
      companyNameMap.get(cl.companyId) ?? '',
      cl.type,
      cl.type === 'payment_given' ? 'টাকা দেওয়া হয়েছে' : 'মাল এসেছে (চালান)',
      cl.amount,
      cl.reference ?? '',
      cl.attachmentName ?? '',
      cl.attachmentDataUrl ? 'হ্যাঁ' : 'না',
      cl.createdAt,
    ])
  );

  // 6. Stock Movements
  const sortedStock = [...data.stockMovements].sort((a, b) => a.date.localeCompare(b.date));
  pushSection(
    '[SECTION:STOCK_MOVEMENTS]',
    ['id', 'তারিখ', 'companyId', 'কোম্পানি', 'productId', 'প্রোডাক্টের নাম', 'type', 'ধরন', 'পরিমাণ', 'নোট', 'তৈরির সময়'],
    sortedStock.map((mv) => [
      mv.id,
      mv.date,
      mv.companyId,
      companyNameMap.get(mv.companyId) ?? '',
      mv.productId,
      productMap.get(mv.productId)?.name ?? '',
      mv.type,
      mv.type === 'stock_in' ? 'স্টক জমা' : 'ড্যামেজ / সমন্বয়',
      mv.quantity,
      mv.note ?? '',
      mv.createdAt,
    ])
  );

  // 7. Computed Stock Summary Report (Informational Snapshot for Excel Viewing)
  const stockAgg = new Map<string, { totalIn: number; totalDeduct: number; totalSold: number }>();
  const ensureStock = (pid: string) => {
    let rec = stockAgg.get(pid);
    if (!rec) {
      rec = { totalIn: 0, totalDeduct: 0, totalSold: 0 };
      stockAgg.set(pid, rec);
    }
    return rec;
  };
  for (const mv of data.stockMovements) {
    const rec = ensureStock(mv.productId);
    if (mv.type === 'stock_in') rec.totalIn += mv.quantity;
    else rec.totalDeduct += mv.quantity;
  }
  for (const entry of sortedEntries) {
    for (const item of entry.items) {
      const rec = ensureStock(item.productId);
      rec.totalSold += item.soldQty;
    }
  }
  let grandClosingQty = 0;
  let grandStockValue = 0;
  const stockSummaryRows: (string | number | undefined)[][] = data.products.map((p) => {
    const agg = stockAgg.get(p.id) ?? { totalIn: 0, totalDeduct: 0, totalSold: 0 };
    const closing = Number((agg.totalIn - agg.totalSold - agg.totalDeduct).toFixed(2));
    const stockRate = computeStockRate(p.rate);
    const value = Number((closing * stockRate).toFixed(2));
    grandClosingQty += closing;
    grandStockValue += value;
    return [
      companyNameMap.get(p.companyId) ?? '',
      p.name,
      p.unit,
      Number(agg.totalIn.toFixed(2)),
      Number(agg.totalSold.toFixed(2)),
      closing,
      stockRate,
      value,
    ];
  });
  stockSummaryRows.push([
    'সর্বমোট স্টক',
    '',
    '',
    '',
    '',
    Number(grandClosingQty.toFixed(2)),
    '',
    Number(grandStockValue.toFixed(2)),
  ]);
  pushSection(
    '[SECTION:STOCK_SUMMARY_REPORT]',
    ['কোম্পানি', 'প্রোডাক্টের নাম', 'ইউনিট', 'মোট স্টক জমা', 'মোট বিক্রি (− অটো)', 'বর্তমান স্টক', 'স্টক রেট (−৬%) (৳)', 'মোট স্টক মূল্য (৳)'],
    stockSummaryRows
  );

  // 8. Customers
  pushSection(
    '[SECTION:CUSTOMERS]',
    [
      'customerId',
      'কাস্টমারের নাম',
      'দোকানের নাম',
      'মোবাইল',
      'ঠিকানা',
      'তৈরির সময়',
      'পরবর্তী কালেকশন তারিখ',
      'নির্ধারিত কিস্তি (৳)',
      'কালেকশন রিমাইন্ডার নোট',
      'companyId',
      'কোম্পানি',
    ],
    data.customers.map((c) => [
      c.id,
      c.name,
      c.shopName ?? '',
      c.phone ?? '',
      c.address ?? '',
      c.createdAt,
      c.nextCollectionDate ?? '',
      c.expectedCollectionAmount ?? '',
      c.collectionNote ?? '',
      c.companyId ?? '',
      c.companyId ? (companyNameMap.get(c.companyId) ?? '') : '',
    ])
  );

  // 9. Customer Credit Entries
  const sortedCustomerEntries = [...data.customerCreditEntries].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  pushSection(
    '[SECTION:CUSTOMER_CREDIT]',
    ['id', 'তারিখ', 'customerId', 'কাস্টমারের নাম', 'দোকান', 'type', 'ধরন', 'টাকা (৳)', 'মেমো নং', 'নোট', 'মেমো ছবির নাম', 'ছবি আছে', 'তৈরির সময়', 'companyId', 'কোম্পানি'],
    sortedCustomerEntries.map((ce) => {
      const cust = customerMap.get(ce.customerId);
      const cid = ce.companyId ?? cust?.companyId ?? '';
      return [
        ce.id,
        ce.date,
        ce.customerId,
        cust?.name ?? '',
        cust?.shopName ?? '',
        ce.type,
        ce.type === 'credit_given' ? 'মাল নিয়েছে / ক্রেডিট (+)' : 'টাকা জমা (−)',
        ce.amount,
        ce.memoNo ?? '',
        ce.note ?? '',
        ce.memoImageName ?? '',
        ce.memoImageDataUrl ? 'হ্যাঁ' : 'না',
        ce.createdAt,
        cid,
        cid ? (companyNameMap.get(cid) ?? '') : '',
      ];
    })
  );

  // 10. Computed Profit & Loss Report Snapshot (5% Commission − Expense)
  const salesByDate = new Map<string, number>();
  for (const e of sortedEntries) {
    salesByDate.set(e.date, (salesByDate.get(e.date) ?? 0) + e.totalSalesAmount);
  }
  const expenseByDate = new Map<string, number>();
  for (const tx of data.cashTransactions) {
    if (tx.type === 'expense') {
      expenseByDate.set(tx.date, (expenseByDate.get(tx.date) ?? 0) + tx.amount);
    }
  }
  const plDates = Array.from(new Set([...salesByDate.keys(), ...expenseByDate.keys()])).sort();
  let grandPlSales = 0;
  let grandPlComm = 0;
  let grandPlExp = 0;
  const plRows: (string | number | undefined)[][] = plDates.map((dt) => {
    const s = Number((salesByDate.get(dt) ?? 0).toFixed(2));
    const comm = Number((s * 0.05).toFixed(2));
    const exp = Number((expenseByDate.get(dt) ?? 0).toFixed(2));
    const net = Number((comm - exp).toFixed(2));
    grandPlSales += s;
    grandPlComm += comm;
    grandPlExp += exp;
    return [dt, s, comm, exp, net, net > 0 ? 'লাভ' : net < 0 ? 'লস' : 'সমান'];
  });
  const grandPlNet = Number((grandPlComm - grandPlExp).toFixed(2));
  plRows.push([
    'সর্বমোট লাভ-লস',
    Number(grandPlSales.toFixed(2)),
    Number(grandPlComm.toFixed(2)),
    Number(grandPlExp.toFixed(2)),
    grandPlNet,
    grandPlNet > 0 ? 'লাভ' : grandPlNet < 0 ? 'লস' : 'সমান',
  ]);
  pushSection(
    '[SECTION:PROFIT_LOSS_REPORT]',
    ['তারিখ', 'মোট সেলস (৳)', '৫% কমিশন আয় (৳)', 'মোট খরচ (৳)', 'নিট লাভ / লস (৳)', 'অবস্থা'],
    plRows
  );

  // 11. Media Chunks (Safe for Excel 32,767 char cell limit so photos restore cleanly!)
  const mediaRows: (string | number | undefined)[][] = [];
  const pushMediaChunks = (
    targetType: 'company_ledger' | 'customer_credit',
    targetId: string,
    fileName: string | undefined,
    dataUrl: string | undefined
  ) => {
    if (!dataUrl) return;
    for (let i = 0, idx = 0; i < dataUrl.length; i += MEDIA_CHUNK_SIZE, idx += 1) {
      mediaRows.push([
        targetType,
        targetId,
        fileName ?? '',
        idx,
        dataUrl.slice(i, i + MEDIA_CHUNK_SIZE),
      ]);
    }
  };

  for (const cl of sortedCompanyLedger) {
    pushMediaChunks('company_ledger', cl.id, cl.attachmentName, cl.attachmentDataUrl);
  }
  for (const ce of sortedCustomerEntries) {
    pushMediaChunks('customer_credit', ce.id, ce.memoImageName, ce.memoImageDataUrl);
  }
  pushSection(
    '[SECTION:MEDIA_CHUNKS]',
    ['targetType', 'targetId', 'fileName', 'chunkIndex', 'chunkData'],
    mediaRows
  );

  const csvContent = '\uFEFF' + lines.map((r) => toCsvLine(r)).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Khan_Enterprise_All_In_One_Backup_${today}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  try {
    localStorage.setItem('khan_enterprise_last_backup_at_v1', new Date().toISOString());
  } catch {
    // ignore storage errors
  }
}

export function parseCsvRows(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

export function parseAllInOneCsvBackup(csvText: string, existingAuth: AuthConfig): LedgerData {
  const rows = parseCsvRows(csvText);
  const sectionRows = new Map<string, string[][]>();
  let currentSection: string | null = null;
  let expectingHeader = false;

  for (const row of rows) {
    const firstCell = (row[0] ?? '').trim();
    const isEmptyRow = row.every((c) => c.trim() === '');
    if (isEmptyRow) {
      expectingHeader = false;
      continue;
    }
    if (firstCell.startsWith('[SECTION:') && firstCell.endsWith(']')) {
      currentSection = firstCell;
      if (!sectionRows.has(currentSection)) {
        sectionRows.set(currentSection, []);
      }
      expectingHeader = true;
      continue;
    }
    if (currentSection) {
      if (expectingHeader) {
        expectingHeader = false;
        continue;
      }
      sectionRows.get(currentSection)!.push(row);
    }
  }

  const requiredSections = [
    '[SECTION:COMPANIES]',
    '[SECTION:PRODUCTS]',
    '[SECTION:DAILY_SALES]',
  ];
  if (!requiredSections.some((sec) => sectionRows.has(sec))) {
    throw new Error('সঠিক Khan Enterprise All-In-One ব্যাকআপ CSV ফাইল নয়।');
  }

  const num = (v: string | undefined, fallback = 0): number => {
    const n = Number(v ?? '');
    return Number.isFinite(n) ? n : fallback;
  };
  const opt = (v: string | undefined): string | undefined => {
    const trimmed = (v ?? '').trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  // 1. Companies
  const companies: Company[] = (sectionRows.get('[SECTION:COMPANIES]') ?? [])
    .filter((r) => Boolean(opt(r[0]) && opt(r[1])))
    .map((r) => ({
      id: r[0].trim(),
      name: r[1].trim(),
      contactPerson: opt(r[2]),
      phone: opt(r[3]),
      createdAt: opt(r[4]) ?? new Date().toISOString(),
    }));

  // 2. Products
  const products: Product[] = (sectionRows.get('[SECTION:PRODUCTS]') ?? [])
    .filter((r) => Boolean(opt(r[0]) && opt(r[1]) && opt(r[3])))
    .map((r) => {
      const rawMin = opt(r[7]);
      const parsedMin = rawMin !== undefined ? Number(rawMin) : NaN;
      return {
        id: r[0].trim(),
        companyId: r[1].trim(),
        name: r[3].trim(),
        unit: opt(r[4]) ?? 'পিস',
        rate: Math.max(0, num(r[5], 0)),
        minStock: Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : undefined,
        createdAt: opt(r[6]) ?? new Date().toISOString(),
      };
    });

  // 3. Daily Sales
  const groupedSales = new Map<
    string,
    { companyId: string; date: string; items: DailyLineItem[]; note?: string; updatedAt?: string }
  >();
  for (const r of sectionRows.get('[SECTION:DAILY_SALES]') ?? []) {
    const entryId = opt(r[0]);
    const date = opt(r[1]);
    const companyId = opt(r[2]);
    if (!date || !companyId) continue;
    const key = entryId ?? getEntryKey(companyId, date);
    let bucket = groupedSales.get(key);
    if (!bucket) {
      bucket = {
        companyId,
        date,
        items: [],
        note: opt(r[12]),
        updatedAt: opt(r[13]),
      };
      groupedSales.set(key, bucket);
    }
    const productId = opt(r[4]);
    const productName = opt(r[5]);
    if (productId && productName) {
      bucket.items.push(
        computeLineItem(
          productId,
          productName,
          opt(r[6]) ?? 'পিস',
          num(r[7], 0),
          num(r[8], 0),
          num(r[9], 0)
        )
      );
    }
  }

  const entries: Record<string, DailyEntry> = {};
  for (const [key, bucket] of groupedSales.entries()) {
    const summarized = summarizeEntry(bucket.companyId, bucket.date, bucket.items, bucket.note);
    entries[key] = {
      ...summarized,
      id: key,
      updatedAt: bucket.updatedAt ?? summarized.updatedAt,
    };
  }

  // 4. Cash & Expense
  const fallbackSingleCompId = companies.length === 1 ? companies[0].id : undefined;
  const cashTransactions: CashTransaction[] = (sectionRows.get('[SECTION:CASH_EXPENSE]') ?? [])
    .filter((r) => Boolean(opt(r[0]) && opt(r[1]) && opt(r[4])))
    .map((r) => {
      const rawType = (r[2] ?? '').trim();
      const type: CashTransactionType =
        rawType === 'cash_in' || rawType === 'expense' || rawType === 'withdraw'
          ? rawType
          : 'expense';
      return {
        id: r[0].trim(),
        companyId: opt(r[8]) ?? fallbackSingleCompId,
        date: r[1].trim(),
        type,
        title: r[4].trim(),
        amount: Math.max(0, num(r[5], 0)),
        note: opt(r[6]),
        createdAt: opt(r[7]) ?? new Date().toISOString(),
      };
    });

  // Reassemble Media Chunks first
  const companyMediaChunks = new Map<string, { fileName?: string; parts: { idx: number; data: string }[] }>();
  const customerMediaChunks = new Map<string, { fileName?: string; parts: { idx: number; data: string }[] }>();

  for (const r of sectionRows.get('[SECTION:MEDIA_CHUNKS]') ?? []) {
    const targetType = (r[0] ?? '').trim();
    const targetId = opt(r[1]);
    const fileName = opt(r[2]);
    const idx = num(r[3], 0);
    const chunkData = r[4] ?? '';
    if (!targetId || !chunkData) continue;

    const targetMap = targetType === 'customer_credit' ? customerMediaChunks : companyMediaChunks;
    let rec = targetMap.get(targetId);
    if (!rec) {
      rec = { fileName, parts: [] };
      targetMap.set(targetId, rec);
    }
    if (!rec.fileName && fileName) rec.fileName = fileName;
    rec.parts.push({ idx, data: chunkData });
  }

  const resolveMedia = (
    map: Map<string, { fileName?: string; parts: { idx: number; data: string }[] }>,
    id: string
  ): { fileName?: string; dataUrl?: string } => {
    const rec = map.get(id);
    if (!rec || rec.parts.length === 0) return {};
    rec.parts.sort((a, b) => a.idx - b.idx);
    return {
      fileName: rec.fileName,
      dataUrl: rec.parts.map((p) => p.data).join(''),
    };
  };

  // 5. Company Ledger
  const companyLedgerEntries: CompanyLedgerEntry[] = (sectionRows.get('[SECTION:COMPANY_LEDGER]') ?? [])
    .filter((r) => Boolean(opt(r[0]) && opt(r[1]) && opt(r[2])))
    .map((r) => {
      const id = r[0].trim();
      const rawType = (r[4] ?? '').trim();
      const type: CompanyLedgerType =
        rawType === 'payment_given' || rawType === 'goods_received' ? rawType : 'payment_given';
      const media = resolveMedia(companyMediaChunks, id);
      return {
        id,
        date: r[1].trim(),
        companyId: r[2].trim(),
        type,
        amount: Math.max(0, num(r[6], 0)),
        reference: opt(r[7]),
        attachmentName: opt(r[8]) ?? media.fileName,
        attachmentDataUrl: media.dataUrl,
        createdAt: opt(r[10]) ?? new Date().toISOString(),
      };
    });

  // 6. Stock Movements
  const stockMovements: StockMovement[] = (sectionRows.get('[SECTION:STOCK_MOVEMENTS]') ?? [])
    .filter((r) => Boolean(opt(r[0]) && opt(r[1]) && opt(r[2]) && opt(r[4])))
    .map((r) => {
      const rawType = (r[6] ?? '').trim();
      const type: StockMovementType =
        rawType === 'stock_in' || rawType === 'damage_adjust' ? rawType : 'stock_in';
      return {
        id: r[0].trim(),
        date: r[1].trim(),
        companyId: r[2].trim(),
        productId: r[4].trim(),
        type,
        quantity: Math.max(0, num(r[8], 0)),
        note: opt(r[9]),
        createdAt: opt(r[10]) ?? new Date().toISOString(),
      };
    });

  // 7. Customers
  const customers: Customer[] = (sectionRows.get('[SECTION:CUSTOMERS]') ?? [])
    .filter((r) => Boolean(opt(r[0]) && opt(r[1])))
    .map((r) => {
      const expectedAmt = num(r[7], -1);
      return {
        id: r[0].trim(),
        companyId: opt(r[9]) ?? fallbackSingleCompId,
        name: r[1].trim(),
        shopName: opt(r[2]),
        phone: opt(r[3]),
        address: opt(r[4]),
        createdAt: opt(r[5]) ?? new Date().toISOString(),
        nextCollectionDate: opt(r[6]),
        expectedCollectionAmount: expectedAmt > 0 ? expectedAmt : undefined,
        collectionNote: opt(r[8]),
      };
    });

  const restoredCustomerCompanyMap = new Map<string, string>();
  for (const c of customers) {
    if (c.companyId) restoredCustomerCompanyMap.set(c.id, c.companyId);
  }

  // 8. Customer Credit Entries
  const customerCreditEntries: CustomerCreditEntry[] = (sectionRows.get('[SECTION:CUSTOMER_CREDIT]') ?? [])
    .filter((r) => Boolean(opt(r[0]) && opt(r[1]) && opt(r[2])))
    .map((r) => {
      const id = r[0].trim();
      const customerId = r[2].trim();
      const rawType = (r[5] ?? '').trim();
      const type: CustomerCreditEntryType =
        rawType === 'credit_given' || rawType === 'payment_received' ? rawType : 'credit_given';
      const media = resolveMedia(customerMediaChunks, id);
      return {
        id,
        companyId: opt(r[13]) ?? restoredCustomerCompanyMap.get(customerId) ?? fallbackSingleCompId,
        date: r[1].trim(),
        customerId,
        type,
        amount: Math.max(0, num(r[7], 0)),
        memoNo: opt(r[8]),
        note: opt(r[9]),
        memoImageName: opt(r[10]) ?? media.fileName,
        memoImageDataUrl: media.dataUrl,
        createdAt: opt(r[12]) ?? new Date().toISOString(),
      };
    });

  return {
    version: 1,
    companies,
    products,
    entries,
    cashTransactions,
    companyLedgerEntries,
    stockMovements,
    customers,
    customerCreditEntries,
    authConfig: existingAuth,
  };
}

export function compressImageFileToDataUrl(
  file: File,
  maxDimension = 1200,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('ছবি পড়া যায়নি'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('সঠিক ছবির ফরম্যাট নয়'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const DEMO_COMPANY_IDS = ['comp_pran', 'comp_square', 'comp_akij'] as const;
export const DEMO_PRODUCT_IDS = [
  'prod_1',
  'prod_2',
  'prod_3',
  'prod_4',
  'prod_5',
  'prod_6',
  'prod_7',
  'prod_8',
] as const;
export const DEMO_CUSTOMER_IDS = ['cust_1', 'cust_2', 'cust_3'] as const;
export const DEMO_CASH_IDS = ['tx_1', 'tx_2', 'tx_3', 'tx_4', 'tx_5', 'tx_6', 'tx_7', 'tx_8'] as const;
export const DEMO_COMPANY_LEDGER_IDS = ['cl_1', 'cl_2', 'cl_3', 'cl_4'] as const;
export const DEMO_STOCK_IDS = [
  'stk_ly1',
  'stk_ly2',
  'stk_ly3',
  'stk_ly4',
  'stk_ly5',
  'stk_1',
  'stk_2',
  'stk_3',
  'stk_4',
  'stk_5',
  'stk_6',
  'stk_7',
  'stk_8',
] as const;
export const DEMO_CREDIT_IDS = ['cc_1', 'cc_2', 'cc_3', 'cc_4', 'cc_5'] as const;

export function createSampleLedgerData(): LedgerData {
  const today = getTodayISO();
  const yesterday = shiftDateISO(today, -1);
  const twoDaysAgo = shiftDateISO(today, -2);
  const threeDaysAgo = shiftDateISO(today, -3);
  const fourDaysAgo = shiftDateISO(today, -4);
  const fiveDaysAgo = shiftDateISO(today, -5);
  const nowIso = new Date().toISOString();

  const companies: Company[] = [
    {
      id: 'comp_pran',
      name: 'প্রাণ ফুডস লিমিটেড',
      contactPerson: 'রফিকুল ইসলাম',
      phone: '01711-000001',
      tsmName: 'মো. শফিকুল ইসলাম (TSM)',
      tsmPhone: '01711-880011',
      srContacts: [
        { id: 'sr_pran_1', name: 'রফিকুল ইসলাম', phone: '01711-000001', role: 'SR' },
        { id: 'sr_pran_2', name: 'সাজ্জাদ হোসেন', phone: '01715-220044', role: 'SR' },
      ],
      logoUrl:
        "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2080%2080'%3E%3Crect%20width%3D'80'%20height%3D'80'%20rx%3D'18'%20fill%3D'%23FEF2F2'%2F%3E%3Crect%20x%3D'6'%20y%3D'6'%20width%3D'68'%20height%3D'68'%20rx%3D'14'%20fill%3D'none'%20stroke%3D'%23DC2626'%20stroke-width%3D'3'%2F%3E%3Ctext%20x%3D'40'%20y%3D'48'%20text-anchor%3D'middle'%20font-family%3D'sans-serif'%20font-weight%3D'900'%20font-size%3D'22'%20fill%3D'%23DC2626'%3EPRAN%3C%2Ftext%3E%3C%2Fsvg%3E",
      createdAt: nowIso,
    },
    {
      id: 'comp_square',
      name: 'স্কয়ার কনজিউমার প্রোডাক্টস',
      contactPerson: 'তানভীর আহমেদ',
      phone: '01819-000002',
      tsmName: 'মামুনুর রশীদ (TSM)',
      tsmPhone: '01819-770022',
      srContacts: [
        { id: 'sr_sq_1', name: 'তানভীর আহমেদ', phone: '01819-000002', role: 'SR' },
      ],
      logoUrl:
        "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2080%2080'%3E%3Crect%20width%3D'80'%20height%3D'80'%20rx%3D'18'%20fill%3D'%23EFF6FF'%2F%3E%3Crect%20x%3D'6'%20y%3D'6'%20width%3D'68'%20height%3D'68'%20rx%3D'14'%20fill%3D'none'%20stroke%3D'%231E3A8A'%20stroke-width%3D'3'%2F%3E%3Crect%20x%3D'24'%20y%3D'24'%20width%3D'32'%20height%3D'32'%20rx%3D'6'%20fill%3D'%231E3A8A'%2F%3E%3C%2Fsvg%3E",
      createdAt: nowIso,
    },
    {
      id: 'comp_akij',
      name: 'আকিজ ফুড অ্যান্ড বেভারেজ',
      contactPerson: 'মাহমুদুল হাসান',
      phone: '01912-000003',
      tsmName: 'নাজমুল হক (TSM)',
      tsmPhone: '01912-660033',
      srContacts: [
        { id: 'sr_ak_1', name: 'মাহমুদুল হাসান', phone: '01912-000003', role: 'SR' },
      ],
      logoUrl:
        "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2080%2080'%3E%3Crect%20width%3D'80'%20height%3D'80'%20rx%3D'18'%20fill%3D'%23F0FDFA'%2F%3E%3Crect%20x%3D'6'%20y%3D'6'%20width%3D'68'%20height%3D'68'%20rx%3D'14'%20fill%3D'none'%20stroke%3D'%230F766E'%20stroke-width%3D'3'%2F%3E%3Ccircle%20cx%3D'40'%20cy%3D'40'%20r%3D'16'%20fill%3D'%230D9488'%2F%3E%3C%2Fsvg%3E",
      createdAt: nowIso,
    },
  ];

  const products: Product[] = [
    { id: 'prod_1', companyId: 'comp_pran', name: 'প্রাণ ম্যাঙ্গো জুস (২৫০ মিলি)', unit: 'কার্টন', rate: 560, minStock: 30, createdAt: nowIso },
    { id: 'prod_2', companyId: 'comp_pran', name: 'প্রাণ চানাচুর (১৫০ গ্রাম)', unit: 'বক্স', rate: 340, minStock: 20, createdAt: nowIso },
    { id: 'prod_3', companyId: 'comp_pran', name: 'প্রাণ লাচ্ছি (২০০ মিলি)', unit: 'কার্টন', rate: 480, minStock: 20, createdAt: nowIso },
    { id: 'prod_4', companyId: 'comp_square', name: 'রুচি চানাচুর (৩০০ গ্রাম)', unit: 'কার্টন', rate: 720, minStock: 15, createdAt: nowIso },
    { id: 'prod_5', companyId: 'comp_square', name: 'রাধুঁনী হলুদ গুঁড়া (২০০ গ্রাম)', unit: 'ডজন', rate: 960, minStock: 10, createdAt: nowIso },
    { id: 'prod_6', companyId: 'comp_square', name: 'মেরিল পেট্রোলিয়াম জেলি', unit: 'ডজন', rate: 540, minStock: 10, createdAt: nowIso },
    { id: 'prod_7', companyId: 'comp_akij', name: 'স্পিড এনার্জি ড্রিংক (২৫০ মিলি)', unit: 'কেস', rate: 620, minStock: 25, createdAt: nowIso },
    { id: 'prod_8', companyId: 'comp_akij', name: 'ক্লেমন (৫০০ মিলি)', unit: 'কেস', rate: 490, minStock: 25, createdAt: nowIso },
  ];

  const entries: Record<string, DailyEntry> = {};

  const e1 = summarizeEntry('comp_pran', today, [
    computeLineItem('prod_1', 'প্রাণ ম্যাঙ্গো জুস (২৫০ মিলি)', 'কার্টন', 560, 45, 5),
    computeLineItem('prod_2', 'প্রাণ চানাচুর (১৫০ গ্রাম)', 'বক্স', 340, 30, 4),
    computeLineItem('prod_3', 'প্রাণ লাচ্ছি (২০০ মিলি)', 'কার্টন', 480, 25, 2),
  ]);
  entries[e1.id] = e1;

  const e2 = summarizeEntry('comp_pran', yesterday, [
    computeLineItem('prod_1', 'প্রাণ ম্যাঙ্গো জুস (২৫০ মিলি)', 'কার্টন', 560, 50, 8),
    computeLineItem('prod_2', 'প্রাণ চানাচুর (১৫০ গ্রাম)', 'বক্স', 340, 28, 3),
    computeLineItem('prod_3', 'প্রাণ লাচ্ছি (২০০ মিলি)', 'কার্টন', 480, 20, 0),
  ]);
  entries[e2.id] = e2;

  const e3 = summarizeEntry('comp_pran', twoDaysAgo, [
    computeLineItem('prod_1', 'প্রাণ ম্যাঙ্গো জুস (২৫০ মিলি)', 'কার্টন', 560, 40, 6),
    computeLineItem('prod_2', 'প্রাণ চানাচুর (১৫০ গ্রাম)', 'বক্স', 340, 25, 2),
  ]);
  entries[e3.id] = e3;

  const e4 = summarizeEntry('comp_square', today, [
    computeLineItem('prod_4', 'রুচি চানাচুর (৩০০ গ্রাম)', 'কার্টন', 720, 20, 2),
    computeLineItem('prod_5', 'রাধুঁনী হলুদ গুঁড়া (২০০ গ্রাম)', 'ডজন', 960, 15, 1),
    computeLineItem('prod_6', 'মেরিল পেট্রোলিয়াম জেলি', 'ডজন', 540, 18, 3),
  ]);
  entries[e4.id] = e4;

  const e5 = summarizeEntry('comp_akij', today, [
    computeLineItem('prod_7', 'স্পিড এনার্জি ড্রিংক (২৫০ মিলি)', 'কেস', 620, 60, 4),
    computeLineItem('prod_8', 'ক্লেমন (৫০০ মিলি)', 'কেস', 490, 35, 5),
  ]);
  entries[e5.id] = e5;

  const e6 = summarizeEntry('comp_square', threeDaysAgo, [
    computeLineItem('prod_4', 'রুচি চানাচুর (৩০০ গ্রাম)', 'কার্টন', 720, 18, 2),
    computeLineItem('prod_6', 'মেরিল পেট্রোলিয়াম জেলি', 'ডজন', 540, 14, 1),
  ]);
  entries[e6.id] = e6;

  const e7 = summarizeEntry('comp_akij', fourDaysAgo, [
    computeLineItem('prod_7', 'স্পিড এনার্জি ড্রিংক (২৫০ মিলি)', 'কেস', 620, 45, 3),
  ]);
  entries[e7.id] = e7;

  const e8 = summarizeEntry('comp_pran', fiveDaysAgo, [
    computeLineItem('prod_1', 'প্রাণ ম্যাঙ্গো জুস (২৫০ মিলি)', 'কার্টন', 560, 32, 2),
  ]);
  entries[e8.id] = e8;

  // Last year same-month sample entries for Year-over-Year chart comparison
  const [yNum, mNum, dNum] = today.split('-').map(Number);
  const lastYearSameDay = `${yNum - 1}-${String(mNum).padStart(2, '0')}-${String(Math.min(28, dNum)).padStart(2, '0')}`;
  const lastYearPrevDay = shiftDateISO(lastYearSameDay, -1);

  const ly1 = summarizeEntry('comp_pran', lastYearSameDay, [
    computeLineItem('prod_1', 'প্রাণ ম্যাঙ্গো জুস (২৫০ মিলি)', 'কার্টন', 540, 38, 6),
    computeLineItem('prod_2', 'প্রাণ চানাচুর (১৫০ গ্রাম)', 'বক্স', 320, 22, 2),
  ]);
  entries[ly1.id] = ly1;

  const ly2 = summarizeEntry('comp_square', lastYearPrevDay, [
    computeLineItem('prod_4', 'রুচি চানাচুর (৩০০ গ্রাম)', 'কার্টন', 700, 16, 1),
    computeLineItem('prod_5', 'রাধুঁনী হলুদ গুঁড়া (২০০ গ্রাম)', 'ডজন', 900, 12, 0),
  ]);
  entries[ly2.id] = ly2;

  const ly3 = summarizeEntry('comp_akij', lastYearSameDay, [
    computeLineItem('prod_7', 'স্পিড এনার্জি ড্রিংক (২৫০ মিলি)', 'কেস', 600, 42, 3),
  ]);
  entries[ly3.id] = ly3;

  const cashTransactions: CashTransaction[] = [
    {
      id: 'tx_1',
      companyId: 'comp_pran',
      date: yesterday,
      type: 'cash_in',
      title: 'মার্কেট কালেকশন',
      amount: 65000,
      note: 'রুট-১ ও রুট-২',
      createdAt: nowIso,
    },
    {
      id: 'tx_2',
      companyId: 'comp_pran',
      date: yesterday,
      type: 'expense',
      title: 'গাড়ি ও তেল খরচ',
      amount: 2400,
      createdAt: nowIso,
    },
    {
      id: 'tx_3',
      companyId: 'comp_pran',
      date: yesterday,
      type: 'withdraw',
      title: 'কোম্পানি পেমেন্ট / ব্যাংক',
      amount: 35000,
      createdAt: nowIso,
    },
    {
      id: 'tx_4',
      companyId: 'comp_square',
      date: today,
      type: 'cash_in',
      title: 'আজকের মার্কেট কালেকশন',
      amount: 72000,
      createdAt: nowIso,
    },
    {
      id: 'tx_5',
      companyId: 'comp_square',
      date: today,
      type: 'expense',
      title: 'ডেলিভারি ও নাস্তা খরচ',
      amount: 1850,
      createdAt: nowIso,
    },
    {
      id: 'tx_6',
      companyId: 'comp_akij',
      date: today,
      type: 'withdraw',
      title: 'মালিকের উত্তোলন',
      amount: 15000,
      createdAt: nowIso,
    },
    {
      id: 'tx_7',
      companyId: 'comp_pran',
      date: lastYearSameDay,
      type: 'expense',
      title: 'গত বছরের গাড়ি ও তেল খরচ',
      amount: 1700,
      createdAt: nowIso,
    },
    {
      id: 'tx_8',
      companyId: 'comp_akij',
      date: lastYearPrevDay,
      type: 'expense',
      title: 'গত বছরের ডেলিভারি খরচ',
      amount: 1450,
      createdAt: nowIso,
    },
  ];

  const companyLedgerEntries: CompanyLedgerEntry[] = [
    {
      id: 'cl_1',
      companyId: 'comp_pran',
      date: yesterday,
      type: 'payment_given',
      amount: 80000,
      reference: 'ব্যাংক ডিপোজিট স্লিপ #PR-9021',
      createdAt: nowIso,
    },
    {
      id: 'cl_2',
      companyId: 'comp_pran',
      date: today,
      type: 'goods_received',
      amount: 62500,
      reference: 'চালান #CH-1142',
      createdAt: nowIso,
    },
    {
      id: 'cl_3',
      companyId: 'comp_square',
      date: yesterday,
      type: 'payment_given',
      amount: 45000,
      reference: 'অনলাইন ট্রান্সফার #SQ-310',
      createdAt: nowIso,
    },
    {
      id: 'cl_4',
      companyId: 'comp_square',
      date: today,
      type: 'goods_received',
      amount: 51200,
      reference: 'চালান #SQ-889',
      createdAt: nowIso,
    },
  ];

  const thirtyEightDaysAgo = shiftDateISO(today, -38);
  const stockMovements: StockMovement[] = [
    { id: 'stk_ly1', companyId: 'comp_pran', productId: 'prod_1', date: lastYearPrevDay, type: 'stock_in', quantity: 62, note: 'গত বছরের স্টক', createdAt: nowIso },
    { id: 'stk_ly2', companyId: 'comp_pran', productId: 'prod_2', date: lastYearPrevDay, type: 'stock_in', quantity: 20, note: 'গত বছরের স্টক', createdAt: nowIso },
    { id: 'stk_ly3', companyId: 'comp_square', productId: 'prod_4', date: lastYearPrevDay, type: 'stock_in', quantity: 31, note: 'গত বছরের স্টক', createdAt: nowIso },
    { id: 'stk_ly4', companyId: 'comp_square', productId: 'prod_5', date: lastYearPrevDay, type: 'stock_in', quantity: 12, note: 'গত বছরের স্টক', createdAt: nowIso },
    { id: 'stk_ly5', companyId: 'comp_akij', productId: 'prod_7', date: lastYearPrevDay, type: 'stock_in', quantity: 81, note: 'গত বছরের স্টক', createdAt: nowIso },
    { id: 'stk_1', companyId: 'comp_pran', productId: 'prod_1', date: twoDaysAgo, type: 'stock_in', quantity: 180, note: 'চালান #CH-1130', createdAt: nowIso },
    { id: 'stk_2', companyId: 'comp_pran', productId: 'prod_2', date: twoDaysAgo, type: 'stock_in', quantity: 100, note: 'চালান #CH-1130', createdAt: nowIso },
    { id: 'stk_3', companyId: 'comp_pran', productId: 'prod_3', date: yesterday, type: 'stock_in', quantity: 47, note: 'চালান #CH-1142 (লাস্ট ৪ কার্টন বাকি)', createdAt: nowIso },
    { id: 'stk_4', companyId: 'comp_square', productId: 'prod_4', date: yesterday, type: 'stock_in', quantity: 45, note: 'চালান #SQ-889', createdAt: nowIso },
    { id: 'stk_5', companyId: 'comp_square', productId: 'prod_5', date: yesterday, type: 'stock_in', quantity: 18, note: 'চালান #SQ-889', createdAt: nowIso },
    { id: 'stk_6', companyId: 'comp_square', productId: 'prod_6', date: yesterday, type: 'stock_in', quantity: 33, note: 'চালান #SQ-889', createdAt: nowIso },
    { id: 'stk_7', companyId: 'comp_akij', productId: 'prod_7', date: yesterday, type: 'stock_in', quantity: 100, note: 'চালান #AK-501', createdAt: nowIso },
    { id: 'stk_8', companyId: 'comp_akij', productId: 'prod_8', date: thirtyEightDaysAgo, type: 'stock_in', quantity: 45, note: 'চালান #AK-420 (পুরাতন ব্যাচ)', createdAt: nowIso },
  ];

  const customers: Customer[] = [
    {
      id: 'cust_1',
      companyId: 'comp_pran',
      name: 'মোঃ জসিম উদ্দিন',
      shopName: 'আলম স্টোর',
      phone: '01715-223344',
      address: 'চকবাজার মেইন রোড',
      nextCollectionDate: today,
      expectedCollectionAmount: 5000,
      collectionNote: 'আজ দুপুর ২টার পর দোকানে গিয়ে কিস্তি নেওয়া যাবে',
      createdAt: nowIso,
    },
    {
      id: 'cust_2',
      companyId: 'comp_akij',
      name: 'হাজী করিম মিয়া',
      shopName: 'বিসমিল্লাহ ভ্যারাইটিজ',
      phone: '01812-556677',
      address: 'স্টেশন রোড বাজার',
      nextCollectionDate: yesterday,
      expectedCollectionAmount: 7000,
      collectionNote: 'আগের কিস্তি বকেয়া — আজ কল দিয়ে কালেকশন কনফার্ম করতে হবে',
      createdAt: nowIso,
    },
    {
      id: 'cust_3',
      companyId: 'comp_square',
      name: 'শফিকুল ইসলাম',
      shopName: 'মদিনা জেনারেল স্টোর',
      phone: '01918-889900',
      address: 'নতুন বাজার',
      nextCollectionDate: shiftDateISO(today, 2),
      expectedCollectionAmount: 4500,
      collectionNote: 'সাপ্তাহিক কালেকশন প্রতি সোমবার',
      createdAt: nowIso,
    },
  ];

  const customerCreditEntries: CustomerCreditEntry[] = [
    {
      id: 'cc_1',
      companyId: 'comp_pran',
      customerId: 'cust_1',
      date: twoDaysAgo,
      type: 'credit_given',
      amount: 18500,
      memoNo: 'মেমো #M-401',
      note: 'প্রাণ জুস ও চানাচুর',
      createdAt: nowIso,
    },
    {
      id: 'cc_2',
      companyId: 'comp_pran',
      customerId: 'cust_1',
      date: yesterday,
      type: 'payment_received',
      amount: 8500,
      memoNo: 'নগদ কালেকশন #R-102',
      createdAt: nowIso,
    },
    {
      id: 'cc_3',
      companyId: 'comp_akij',
      customerId: 'cust_2',
      date: yesterday,
      type: 'credit_given',
      amount: 24200,
      memoNo: 'মেমো #M-415',
      note: 'স্পিড ও মেরিল পণ্য',
      createdAt: nowIso,
    },
    {
      id: 'cc_4',
      companyId: 'comp_akij',
      customerId: 'cust_2',
      date: today,
      type: 'payment_received',
      amount: 10000,
      memoNo: 'বিকাশ / ক্যাশ জমা',
      createdAt: nowIso,
    },
    {
      id: 'cc_5',
      companyId: 'comp_square',
      customerId: 'cust_3',
      date: today,
      type: 'credit_given',
      amount: 9600,
      memoNo: 'মেমো #M-428',
      createdAt: nowIso,
    },
  ];

  return {
    version: 1,
    companies,
    products,
    entries,
    cashTransactions,
    companyLedgerEntries,
    stockMovements,
    customers,
    customerCreditEntries,
    authConfig: { companyPasswordHashes: {} },
  };
}

export function hasDemoLedgerData(data: LedgerData): boolean {
  const demoCompSet = new Set<string>(DEMO_COMPANY_IDS);
  const demoProdSet = new Set<string>(DEMO_PRODUCT_IDS);
  const demoCustSet = new Set<string>(DEMO_CUSTOMER_IDS);
  const demoCashSet = new Set<string>(DEMO_CASH_IDS);
  const demoLedgerSet = new Set<string>(DEMO_COMPANY_LEDGER_IDS);
  const demoStockSet = new Set<string>(DEMO_STOCK_IDS);
  const demoCreditSet = new Set<string>(DEMO_CREDIT_IDS);

  return (
    data.companies.some((c) => demoCompSet.has(c.id)) ||
    data.products.some((p) => demoProdSet.has(p.id)) ||
    data.customers.some((c) => demoCustSet.has(c.id)) ||
    data.cashTransactions.some((t) => demoCashSet.has(t.id)) ||
    data.companyLedgerEntries.some((l) => demoLedgerSet.has(l.id)) ||
    data.stockMovements.some((m) => demoStockSet.has(m.id)) ||
    data.customerCreditEntries.some((e) => demoCreditSet.has(e.id)) ||
    Object.values(data.entries).some((entry) => demoCompSet.has(entry.companyId))
  );
}

export function removeDemoLedgerData(current: LedgerData): LedgerData {
  const demoCompSet = new Set<string>(DEMO_COMPANY_IDS);
  const demoProdSet = new Set<string>(DEMO_PRODUCT_IDS);
  const demoCustSet = new Set<string>(DEMO_CUSTOMER_IDS);
  const demoCashSet = new Set<string>(DEMO_CASH_IDS);
  const demoLedgerSet = new Set<string>(DEMO_COMPANY_LEDGER_IDS);
  const demoStockSet = new Set<string>(DEMO_STOCK_IDS);
  const demoCreditSet = new Set<string>(DEMO_CREDIT_IDS);

  const nextEntries: Record<string, DailyEntry> = {};
  for (const [key, entry] of Object.entries(current.entries)) {
    if (!demoCompSet.has(entry.companyId)) {
      nextEntries[key] = entry;
    }
  }

  const nextCompanyPasswordHashes = { ...current.authConfig.companyPasswordHashes };
  for (const demoId of DEMO_COMPANY_IDS) {
    delete nextCompanyPasswordHashes[demoId];
  }

  return {
    version: 1,
    companies: current.companies.filter((c) => !demoCompSet.has(c.id)),
    products: current.products.filter(
      (p) => !demoProdSet.has(p.id) && !demoCompSet.has(p.companyId)
    ),
    entries: nextEntries,
    cashTransactions: current.cashTransactions.filter((t) => !demoCashSet.has(t.id)),
    companyLedgerEntries: current.companyLedgerEntries.filter(
      (l) => !demoLedgerSet.has(l.id) && !demoCompSet.has(l.companyId)
    ),
    stockMovements: current.stockMovements.filter(
      (m) =>
        !demoStockSet.has(m.id) &&
        !demoCompSet.has(m.companyId) &&
        !demoProdSet.has(m.productId)
    ),
    customers: current.customers.filter((c) => !demoCustSet.has(c.id)),
    customerCreditEntries: current.customerCreditEntries.filter(
      (e) => !demoCreditSet.has(e.id) && !demoCustSet.has(e.customerId)
    ),
    authConfig: {
      adminPasswordHash: current.authConfig.adminPasswordHash,
      companyPasswordHashes: nextCompanyPasswordHashes,
    },
  };
}

export function mergeSampleLedgerData(current: LedgerData): LedgerData {
  const cleaned = removeDemoLedgerData(current);
  const sample = createSampleLedgerData();

  return {
    version: 1,
    companies: [...cleaned.companies, ...sample.companies],
    products: [...cleaned.products, ...sample.products],
    entries: {
      ...cleaned.entries,
      ...sample.entries,
    },
    cashTransactions: [...cleaned.cashTransactions, ...sample.cashTransactions],
    companyLedgerEntries: [
      ...cleaned.companyLedgerEntries,
      ...sample.companyLedgerEntries,
    ],
    stockMovements: [...cleaned.stockMovements, ...sample.stockMovements],
    customers: [...cleaned.customers, ...sample.customers],
    customerCreditEntries: [
      ...cleaned.customerCreditEntries,
      ...sample.customerCreditEntries,
    ],
    authConfig: cleaned.authConfig,
  };
}
