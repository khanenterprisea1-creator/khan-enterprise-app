import { LedgerData, Product } from '../types/ledger';
import { formatDateBn, formatNumber, formatTaka, getTodayISO } from './storage';

export const DEFAULT_MIN_STOCK_KEY = 'khan_enterprise_default_min_stock_v1';
const READ_NOTIFICATIONS_KEY = 'khan_enterprise_read_notifications_v1';
export const GODOWN_AGE_ALERT_DAYS = 30;
export const LAST_FIVE_STOCK_THRESHOLD = 5;

export function loadDefaultMinStock(): number {
  try {
    const raw = localStorage.getItem(DEFAULT_MIN_STOCK_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch {
    // ignore storage failures
  }
  return LAST_FIVE_STOCK_THRESHOLD;
}

export function saveDefaultMinStock(value: number): void {
  try {
    if (Number.isFinite(value) && value >= 0) {
      localStorage.setItem(DEFAULT_MIN_STOCK_KEY, String(value));
    }
  } catch {
    // ignore storage failures
  }
}

export function diffDaysBetweenISO(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 0;
  const fromParts = fromISO.slice(0, 10).split('-').map(Number);
  const toParts = toISO.slice(0, 10).split('-').map(Number);
  if (
    fromParts.length !== 3 ||
    toParts.length !== 3 ||
    fromParts.some(Number.isNaN) ||
    toParts.some(Number.isNaN)
  ) {
    return 0;
  }
  const fromUtc = Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]);
  const toUtc = Date.UTC(toParts[0], toParts[1] - 1, toParts[2]);
  return Math.floor((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

export interface ProductStockSnapshot {
  product: Product;
  companyName: string;
  totalStockIn: number;
  totalSold: number;
  totalDeducted: number;
  currentStock: number;
  stockValue: number;
  minStockLimit: number;
  hasCustomMinStock: boolean;
  isOutOfStock: boolean;
  isLastFiveOrLess: boolean;
  isLowStock: boolean;
  oldestUnsoldStockDate: string | null;
  lastStockInDate: string | null;
  lastSoldDate: string | null;
  daysInGodown: number;
  isAgedInGodown: boolean;
}

export function computeProductStockSnapshots(
  data: LedgerData,
  asOfDate = getTodayISO(),
  defaultMinStock = loadDefaultMinStock()
): ProductStockSnapshot[] {
  const companyMap = new Map(data.companies.map((c) => [c.id, c.name]));

  const stockInBatchesByProduct = new Map<
    string,
    Array<{ date: string; createdAt: string; quantity: number }>
  >();
  const totalDeductByProduct = new Map<string, number>();
  const lastStockInDateByProduct = new Map<string, string>();

  for (const mv of data.stockMovements) {
    if (mv.date > asOfDate) continue;
    if (mv.type === 'stock_in') {
      const list = stockInBatchesByProduct.get(mv.productId) ?? [];
      list.push({ date: mv.date, createdAt: mv.createdAt, quantity: mv.quantity });
      stockInBatchesByProduct.set(mv.productId, list);

      const prevLast = lastStockInDateByProduct.get(mv.productId);
      if (!prevLast || mv.date > prevLast) {
        lastStockInDateByProduct.set(mv.productId, mv.date);
      }
    } else {
      totalDeductByProduct.set(
        mv.productId,
        (totalDeductByProduct.get(mv.productId) ?? 0) + mv.quantity
      );
    }
  }

  const totalSoldByProduct = new Map<string, number>();
  const lastSoldDateByProduct = new Map<string, string>();

  for (const entry of Object.values(data.entries)) {
    if (entry.date > asOfDate) continue;
    for (const item of entry.items) {
      totalSoldByProduct.set(
        item.productId,
        (totalSoldByProduct.get(item.productId) ?? 0) + item.soldQty
      );
      if (item.soldQty > 0) {
        const prevLast = lastSoldDateByProduct.get(item.productId);
        if (!prevLast || entry.date > prevLast) {
          lastSoldDateByProduct.set(item.productId, entry.date);
        }
      }
    }
  }

  return data.products.map((product) => {
    const batches = [...(stockInBatchesByProduct.get(product.id) ?? [])].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return a.createdAt.localeCompare(b.createdAt);
    });

    const totalStockIn = Number(
      batches.reduce((sum, b) => sum + b.quantity, 0).toFixed(2)
    );
    const totalSold = Number((totalSoldByProduct.get(product.id) ?? 0).toFixed(2));
    const totalDeducted = Number((totalDeductByProduct.get(product.id) ?? 0).toFixed(2));
    const currentStock = Number((totalStockIn - totalSold - totalDeducted).toFixed(2));
    const stockValue = Number((Math.max(0, currentStock) * product.rate).toFixed(2));

    const hasCustomMinStock = product.minStock !== undefined;
    const minStockLimit = hasCustomMinStock ? product.minStock! : defaultMinStock;
    const isOutOfStock = currentStock <= 0;
    const isLastFiveOrLess = currentStock <= LAST_FIVE_STOCK_THRESHOLD;
    const isLowStock =
      isOutOfStock ||
      isLastFiveOrLess ||
      (minStockLimit > 0 && currentStock <= minStockLimit);

    // FIFO aging calculation: consume totalOut from oldest stock_in batches
    let oldestUnsoldStockDate: string | null = null;
    if (currentStock > 0 && batches.length > 0) {
      let remainingOut = totalSold + totalDeducted;
      for (const batch of batches) {
        if (remainingOut >= batch.quantity - 0.0001) {
          remainingOut -= batch.quantity;
        } else {
          oldestUnsoldStockDate = batch.date;
          break;
        }
      }
      if (!oldestUnsoldStockDate) {
        oldestUnsoldStockDate = batches[batches.length - 1].date;
      }
    }

    const daysInGodown =
      currentStock > 0 && oldestUnsoldStockDate
        ? Math.max(0, diffDaysBetweenISO(oldestUnsoldStockDate, asOfDate))
        : 0;
    const isAgedInGodown = currentStock > 0 && daysInGodown >= GODOWN_AGE_ALERT_DAYS;

    return {
      product,
      companyName: companyMap.get(product.companyId) ?? 'অজানা কোম্পানি',
      totalStockIn,
      totalSold,
      totalDeducted,
      currentStock,
      stockValue,
      minStockLimit,
      hasCustomMinStock,
      isOutOfStock,
      isLastFiveOrLess,
      isLowStock,
      oldestUnsoldStockDate,
      lastStockInDate: lastStockInDateByProduct.get(product.id) ?? null,
      lastSoldDate: lastSoldDateByProduct.get(product.id) ?? null,
      daysInGodown,
      isAgedInGodown,
    };
  });
}

export type StockNotificationCategory = 'low_stock' | 'godown_aged';

export interface StockNotificationItem {
  id: string;
  signature: string;
  category: StockNotificationCategory;
  severity: 'critical' | 'warning';
  productId: string;
  companyId: string;
  companyName: string;
  productName: string;
  unit: string;
  currentStock: number;
  stockValue: number;
  minStockLimit: number;
  daysInGodown: number;
  oldestUnsoldStockDate: string | null;
  lastSoldDate: string | null;
  title: string;
  message: string;
}

export function buildStockNotifications(
  data: LedgerData,
  asOfDate = getTodayISO(),
  defaultMinStock = loadDefaultMinStock()
): StockNotificationItem[] {
  const snapshots = computeProductStockSnapshots(data, asOfDate, defaultMinStock);
  const notifications: StockNotificationItem[] = [];

  for (const snap of snapshots) {
    if (snap.isLowStock) {
      const effectiveThreshold = Math.max(
        LAST_FIVE_STOCK_THRESHOLD,
        snap.minStockLimit
      );
      let title = `লো স্টক সতর্কতা — ${snap.product.name}`;
      let message = `বর্তমান স্টক মাত্র ${formatNumber(snap.currentStock)} ${snap.product.unit} (সীমা ${formatNumber(effectiveThreshold)} ${snap.product.unit})।`;

      if (snap.isOutOfStock) {
        title = `স্টক শেষ — ${snap.product.name}`;
        message =
          snap.totalStockIn === 0
            ? `এখনও কোনো স্টক জমা দেওয়া হয়নি (বর্তমান স্টক ০ ${snap.product.unit})।`
            : `গুদামে কোনো স্টক অবশিষ্ট নেই (০ ${snap.product.unit})। দ্রুত নতুন চালান / স্টক জমা দিন।`;
      } else if (snap.isLastFiveOrLess) {
        title = `লাস্ট ${LAST_FIVE_STOCK_THRESHOLD} ${snap.product.unit} সতর্কতা — ${snap.product.name}`;
        message = `স্টকে মাত্র ${formatNumber(snap.currentStock)} ${snap.product.unit} বাকি আছে! দ্রুত নতুন মাল অর্ডার করুন।`;
      }

      notifications.push({
        id: `low_${snap.product.id}`,
        signature: `low_${snap.product.id}_${snap.currentStock}`,
        category: 'low_stock',
        severity: snap.isOutOfStock || snap.isLastFiveOrLess ? 'critical' : 'warning',
        productId: snap.product.id,
        companyId: snap.product.companyId,
        companyName: snap.companyName,
        productName: snap.product.name,
        unit: snap.product.unit,
        currentStock: snap.currentStock,
        stockValue: snap.stockValue,
        minStockLimit: snap.minStockLimit,
        daysInGodown: snap.daysInGodown,
        oldestUnsoldStockDate: snap.oldestUnsoldStockDate,
        lastSoldDate: snap.lastSoldDate,
        title,
        message,
      });
    }

    if (snap.isAgedInGodown) {
      const monthsText =
        snap.daysInGodown >= 60
          ? `${Math.floor(snap.daysInGodown / 30)} মাস+`
          : '১ মাসের বেশি';
      const batchDateText = snap.oldestUnsoldStockDate
        ? formatDateBn(snap.oldestUnsoldStockDate)
        : '';
      const lastSoldText = snap.lastSoldDate
        ? ` · সর্বশেষ বিক্রি: ${formatDateBn(snap.lastSoldDate)}`
        : ' · এখনও বিক্রি হয়নি';

      notifications.push({
        id: `aged_${snap.product.id}`,
        signature: `aged_${snap.product.id}_${Math.floor(snap.daysInGodown / 7)}`,
        category: 'godown_aged',
        severity: snap.daysInGodown >= 60 ? 'critical' : 'warning',
        productId: snap.product.id,
        companyId: snap.product.companyId,
        companyName: snap.companyName,
        productName: snap.product.name,
        unit: snap.product.unit,
        currentStock: snap.currentStock,
        stockValue: snap.stockValue,
        minStockLimit: snap.minStockLimit,
        daysInGodown: snap.daysInGodown,
        oldestUnsoldStockDate: snap.oldestUnsoldStockDate,
        lastSoldDate: snap.lastSoldDate,
        title: `${monthsText} গুদামে — ${snap.product.name}`,
        message: `গুদামে ${formatNumber(snap.daysInGodown)} দিন ধরে ${formatNumber(snap.currentStock)} ${snap.product.unit} (${formatTaka(snap.stockValue)}) পড়ে আছে${batchDateText ? ` (জমার তারিখ: ${batchDateText})` : ''}${lastSoldText}।`,
      });
    }
  }

  return notifications.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    if (a.category === 'low_stock' && b.category === 'low_stock') {
      return a.currentStock - b.currentStock;
    }
    if (a.category === 'godown_aged' && b.category === 'godown_aged') {
      return b.daysInGodown - a.daysInGodown;
    }
    return a.category === 'low_stock' ? -1 : 1;
  });
}

export function loadReadNotificationSignatures(): string[] {
  try {
    const raw = localStorage.getItem(READ_NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveReadNotificationSignatures(signatures: string[]): void {
  try {
    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(signatures.slice(-300)));
  } catch {
    // ignore storage failures
  }
}
