import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Building2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Pencil,
  Trash2,
  Download,
  Printer,
  Check,
  History,
  Settings2,
  AlertTriangle,
  X,
  Search,
  ListChecks,
  Package,
  Clock,
  RotateCcw,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Company, DailyEntry, DailyLineItem, Product, StockMovement } from '../types/ledger';
import { Company1to1Summary } from '../utils/companySummary';
import {
  clearSalesDraft,
  getCompanySalesDrafts,
  loadLastCompanyDate,
  loadSalesDraft,
  saveLastCompanyDate,
  saveSalesDraft,
} from '../utils/salesDrafts';
import {
  computeLineItem,
  computeStockRate,
  DEMO_COMPANY_IDS,
  downloadCompanyDayCsv,
  downloadStockReportCsv,
  formatDateBn,
  formatMonthBn,
  formatNumber,
  formatTaka,
  getCurrentMonthISO,
  getCurrentYear,
  getEntryKey,
  getTodayISO,
  shiftDateISO,
  StockReportCsvRow,
  summarizeEntry,
} from '../utils/storage';
import { PrintLetterhead, PrintSignatureFooter } from './PrintLetterhead';
import { CompanyLogoAvatar } from './CompanyLogoAvatar';
import { CompanyRepsStrip } from './CompanyRepsStrip';
import {
  createDateRangePreset,
  DateRangeFilterBar,
  DateRangeValue,
  formatDateRangeLabelBn,
  isDateInRange,
} from './DateRangeFilterBar';

interface CompanyWorkspaceProps {
  company: Company;
  products: Product[];
  entries: Record<string, DailyEntry>;
  stockMovements?: StockMovement[];
  isAdmin?: boolean;
  oneToOneSummary?: Company1to1Summary;
  onOpenModule?: (
    tab: 'cash' | 'profit_loss' | 'company_ledger' | 'stock' | 'customer_credit' | 'summary'
  ) => void;
  onEditCompany: (company: Company) => void;
  onDeleteCompany: (companyId: string) => void;
  onOpenAddProduct: () => void;
  onQuickAddProduct: (payload: { name: string; unit: string; rate: number }) => void;
  onOpenEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onSaveDailyEntry: (entry: DailyEntry) => void;
  onDeleteDailyEntry: (entryId: string) => void;
}

type HistoryViewMode = 'day' | 'month' | 'year';
type EditableCol = 'rate' | 'marketOut' | 'returned';

const EDITABLE_COLS: EditableCol[] = ['rate', 'marketOut', 'returned'];

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function normalizeAsciiDigits(rawInput: string): string {
  return rawInput.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

/**
 * Safe arithmetic parser supporting +, -, *, /, parentheses, Bengali/English digits, and optional leading '='.
 */
function evaluateCellExpression(rawInput: string): number | null {
  const cleaned = normalizeAsciiDigits(rawInput).trim().replace(/^=/, '').replace(/\s+/g, '');
  if (!cleaned) return 0;
  if (/^[0-9]+(\.[0-9]+)?$/.test(cleaned)) {
    return Number(cleaned);
  }
  if (!/^[0-9+\-*/().]+$/.test(cleaned)) {
    return null;
  }

  let pos = 0;

  const parseExpression = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < cleaned.length && (cleaned[pos] === '+' || cleaned[pos] === '-')) {
      const op = cleaned[pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    while (pos < cleaned.length && (cleaned[pos] === '*' || cleaned[pos] === '/')) {
      const op = cleaned[pos++];
      const right = parseFactor();
      if (right === null) return null;
      if (op === '*') {
        left = left * right;
      } else {
        if (right === 0) return null;
        left = left / right;
      }
    }
    return left;
  };

  const parseFactor = (): number | null => {
    if (pos >= cleaned.length) return null;
    if (cleaned[pos] === '(') {
      pos++;
      const val = parseExpression();
      if (val === null || cleaned[pos] !== ')') return null;
      pos++;
      return val;
    }
    const start = pos;
    while (pos < cleaned.length && /[0-9.]/.test(cleaned[pos])) {
      pos++;
    }
    if (start === pos) return null;
    const num = Number(cleaned.slice(start, pos));
    return Number.isFinite(num) ? num : null;
  };

  const result = parseExpression();
  if (result === null || pos !== cleaned.length || !Number.isFinite(result) || result < 0) {
    return null;
  }
  return Number(result.toFixed(2));
}

/**
 * Evaluates partial/full typing input for instant live row & total preview without altering input text.
 */
function evaluateLivePreview(rawInput: string): number | null {
  const direct = evaluateCellExpression(rawInput);
  if (direct !== null) return direct;
  const trimmedTrailingOps = normalizeAsciiDigits(rawInput)
    .trim()
    .replace(/^=/, '')
    .replace(/\s+/g, '')
    .replace(/[+\-*/(.]+$/, '');
  if (!trimmedTrailingOps) return null;
  return evaluateCellExpression(trimmedTrailingOps);
}

function formatDraftTimeBn(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('bn-BD', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const CompanyWorkspace: React.FC<CompanyWorkspaceProps> = ({
  company,
  products,
  entries,
  stockMovements = [],
  isAdmin = true,
  oneToOneSummary,
  onOpenModule,
  onEditCompany,
  onDeleteCompany,
  onOpenAddProduct,
  onOpenEditProduct,
  onDeleteProduct,
  onSaveDailyEntry,
  onDeleteDailyEntry,
}) => {
  const today = getTodayISO();
  const currentMonth = getCurrentMonthISO();
  const currentYear = getCurrentYear();

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (!isAdmin) return today;
    return loadLastCompanyDate(company.id) ?? today;
  });
  const [showProductManager, setShowProductManager] = useState<boolean>(false);
  const [confirmDeleteCompany, setConfirmDeleteCompany] = useState<boolean>(false);
  const [confirmDeleteHistoryId, setConfirmDeleteHistoryId] = useState<string | null>(null);
  const [confirmRemoveProductId, setConfirmRemoveProductId] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);
  const [historyMode, setHistoryMode] = useState<HistoryViewMode>('day');
  const [historyDateRange, setHistoryDateRange] = useState<DateRangeValue>(() =>
    createDateRangePreset('all', today)
  );
  const [historySearch, setHistorySearch] = useState<string>('');
  const [stockDateRange, setStockDateRange] = useState<DateRangeValue>(() =>
    createDateRangePreset('today', today)
  );
  const [stockSearch, setStockSearch] = useState<string>('');
  const [warningProductId, setWarningProductId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState<string>('');

  // Draft text map so users can type formulas like "50+25" before pressing Enter/Tab/Blur
  const [draftCells, setDraftCells] = useState<Record<string, string>>({});
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [restoredDraftInfo, setRestoredDraftInfo] = useState<{
    date: string;
    updatedAt: string;
  } | null>(null);
  const [draftRevision, setDraftRevision] = useState<number>(0);

  // Excel cell refs for Enter / Tab / Arrow navigation (separate refs for desktop table and mobile cards)
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const mobileCellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const noteInputRef = useRef<HTMLInputElement | null>(null);
  const stockReportRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setStockDateRange(
      selectedDate === today
        ? createDateRangePreset('today', today)
        : { preset: 'custom', fromDate: selectedDate, toDate: selectedDate }
    );
  }, [selectedDate, today]);

  useEffect(() => {
    if (isAdmin) {
      saveLastCompanyDate(company.id, selectedDate);
    }
  }, [company.id, selectedDate, isAdmin]);

  const entryKey = getEntryKey(company.id, selectedDate);
  const savedEntry = entries[entryKey];

  // Hydrate unfinished auto-draft when switching company, date, tabs, or reloading
  const hydratedDraftKeyRef = useRef<string>('');
  useEffect(() => {
    if (!isAdmin) return;
    const scopeKey = `${company.id}_${selectedDate}`;
    if (hydratedDraftKeyRef.current === scopeKey) return;
    hydratedDraftKeyRef.current = scopeKey;

    const draft = loadSalesDraft(company.id, selectedDate);
    if (!draft) {
      setRestoredDraftInfo(null);
      setDraftSavedAt(null);
      return;
    }

    const hasDraftCells =
      draft.draftCells && Object.keys(draft.draftCells).length > 0;
    const isDraftNewer =
      !savedEntry || draft.updatedAt > (savedEntry.updatedAt ?? '');

    if (hasDraftCells) {
      setDraftCells((prev) => ({ ...prev, ...draft.draftCells }));
    }

    if (isDraftNewer && (draft.items.length > 0 || draft.note.trim() !== '')) {
      const draftEntry = summarizeEntry(
        company.id,
        selectedDate,
        draft.items,
        draft.note
      );
      const savedSignature = savedEntry
        ? JSON.stringify({ items: savedEntry.items, note: savedEntry.note ?? '' })
        : '';
      const draftSignature = JSON.stringify({
        items: draftEntry.items,
        note: draftEntry.note ?? '',
      });
      if (savedSignature !== draftSignature) {
        onSaveDailyEntry(draftEntry);
      }
    }

    if (hasDraftCells || (isDraftNewer && draft.items.length > 0)) {
      setRestoredDraftInfo({ date: selectedDate, updatedAt: draft.updatedAt });
      setDraftSavedAt(draft.updatedAt);
    } else {
      setDraftSavedAt(draft.updatedAt);
      setRestoredDraftInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, selectedDate, isAdmin]);

  // Show only the products selected/added for this specific date
  const activeRows: DailyLineItem[] = useMemo(() => {
    if (!savedEntry) return [];
    const productById = new Map(products.map((p) => [p.id, p]));
    return savedEntry.items.map((item) => {
      const master = productById.get(item.productId);
      // Use latest product name/unit if still in catalog, keep the day's rate snapshot
      return computeLineItem(
        item.productId,
        master?.name ?? item.productName,
        master?.unit ?? item.unit,
        item.rate,
        item.marketOut,
        item.returned
      );
    });
  }, [savedEntry, products]);

  // Live instant rows incorporating uncommitted cell drafts (numbers, Bengali digits, or expressions)
  const displayRows: DailyLineItem[] = useMemo(() => {
    return activeRows.map((row) => {
      const rateDraft = draftCells[`${selectedDate}_${row.productId}_rate`];
      const outDraft = draftCells[`${selectedDate}_${row.productId}_marketOut`];
      const retDraft = draftCells[`${selectedDate}_${row.productId}_returned`];

      if (rateDraft === undefined && outDraft === undefined && retDraft === undefined) {
        return row;
      }

      const nextRate =
        rateDraft !== undefined
          ? (evaluateLivePreview(rateDraft) ?? row.rate)
          : row.rate;
      const nextOut =
        outDraft !== undefined
          ? (evaluateLivePreview(outDraft) ?? row.marketOut)
          : row.marketOut;
      const nextReturnRaw =
        retDraft !== undefined
          ? (evaluateLivePreview(retDraft) ?? row.returned)
          : row.returned;
      const nextReturn = Math.min(Math.max(0, nextReturnRaw), Math.max(0, nextOut));

      return computeLineItem(
        row.productId,
        row.productName,
        row.unit,
        nextRate,
        nextOut,
        nextReturn
      );
    });
  }, [activeRows, draftCells, selectedDate]);

  // Prioritize frequently & recently used products for faster daily entry
  const productFrequencyMap = useMemo(() => {
    const freq = new Map<string, number>();
    const recentEntries = Object.values(entries)
      .filter((e) => e.companyId === company.id && e.date !== selectedDate)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 14);
    recentEntries.forEach((entry, recencyIdx) => {
      const weight = Math.max(1, 14 - recencyIdx);
      for (const item of entry.items) {
        if (item.marketOut > 0 || item.returned > 0 || item.soldQty > 0) {
          freq.set(item.productId, (freq.get(item.productId) ?? 0) + weight);
        }
      }
    });
    return freq;
  }, [entries, company.id, selectedDate]);

  // Most recent previous entry for 1-click product list copy on blank days
  const latestPreviousEntry = useMemo(() => {
    return (
      Object.values(entries)
        .filter((e) => e.companyId === company.id && e.date < selectedDate && e.items.length > 0)
        .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
    );
  }, [entries, company.id, selectedDate]);

  // Products from this company's catalog not yet added to selectedDate's sheet (sorted by recent usage)
  const availableProductsForDay = useMemo(() => {
    const addedIds = new Set(activeRows.map((r) => r.productId));
    const q = productSearch.trim().toLowerCase();
    return products
      .filter((p) => {
        if (addedIds.has(p.id)) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q);
      })
      .sort((a, b) => (productFrequencyMap.get(b.id) ?? 0) - (productFrequencyMap.get(a.id) ?? 0));
  }, [products, activeRows, productSearch, productFrequencyMap]);

  const currentTotals = useMemo(() => {
    return summarizeEntry(company.id, selectedDate, displayRows, savedEntry?.note);
  }, [company.id, selectedDate, displayRows, savedEntry?.note]);

  const otherIncompleteDrafts = useMemo(() => {
    if (!isAdmin) return [];
    void draftRevision;
    return getCompanySalesDrafts(company.id).filter(
      (d) =>
        d.date !== selectedDate &&
        (d.items.length > 0 ||
          d.note.trim() !== '' ||
          Object.keys(d.draftCells).length > 0)
    );
  }, [company.id, selectedDate, isAdmin, draftRevision]);

  const persistAutoDraft = (
    nextItems: DailyLineItem[],
    nextNote: string,
    nextDraftCells: Record<string, string>
  ) => {
    if (!isAdmin) return;
    const prefix = `${selectedDate}_`;
    const scopedCells: Record<string, string> = {};
    for (const [k, v] of Object.entries(nextDraftCells)) {
      if (k.startsWith(prefix)) {
        scopedCells[k] = v;
      }
    }

    if (
      nextItems.length === 0 &&
      nextNote.trim() === '' &&
      Object.keys(scopedCells).length === 0
    ) {
      clearSalesDraft(company.id, selectedDate);
      setDraftSavedAt(null);
      setDraftRevision((r) => r + 1);
      return;
    }

    const nowIso = new Date().toISOString();
    saveSalesDraft({
      companyId: company.id,
      date: selectedDate,
      items: nextItems,
      note: nextNote,
      draftCells: scopedCells,
      updatedAt: nowIso,
    });
    setDraftSavedAt(nowIso);
    setDraftRevision((r) => r + 1);
  };

  const triggerSavedNotice = () => {
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  const resolveCellInput = (productId: string, col: EditableCol): HTMLInputElement | null => {
    const refKey = `${productId}_${col}`;
    const desktopEl = cellRefs.current[refKey];
    const mobileEl = mobileCellRefs.current[refKey];
    if (desktopEl && desktopEl.offsetParent !== null) return desktopEl;
    if (mobileEl && mobileEl.offsetParent !== null) return mobileEl;
    return desktopEl ?? mobileEl ?? null;
  };

  // Select a product from the saved catalog and drop it directly into today's sheet with its saved rate
  const handleSelectProductForDay = (product: Product) => {
    if (activeRows.some((r) => r.productId === product.id)) return;
    const newItem = computeLineItem(
      product.id,
      product.name,
      product.unit,
      product.rate,
      0,
      0
    );
    const updatedRows = [...activeRows, newItem];
    const currentNote = savedEntry?.note ?? '';
    const newEntry = summarizeEntry(company.id, selectedDate, updatedRows, currentNote);
    onSaveDailyEntry(newEntry);
    persistAutoDraft(updatedRows, currentNote, draftCells);
    setProductSearch('');
    triggerSavedNotice();

    // Auto-focus Market Out cell of the newly added product row
    window.setTimeout(() => {
      const el = resolveCellInput(product.id, 'marketOut');
      if (el) {
        el.focus();
        el.select();
      }
    }, 40);
  };

  const handleAddAllRemainingProductsForDay = () => {
    if (availableProductsForDay.length === 0) return;
    const addedIds = new Set(activeRows.map((r) => r.productId));
    const newItems = products
      .filter((p) => !addedIds.has(p.id))
      .map((p) => computeLineItem(p.id, p.name, p.unit, p.rate, 0, 0));
    const updatedRows = [...activeRows, ...newItems];
    const currentNote = savedEntry?.note ?? '';
    const newEntry = summarizeEntry(company.id, selectedDate, updatedRows, currentNote);
    onSaveDailyEntry(newEntry);
    persistAutoDraft(updatedRows, currentNote, draftCells);
    triggerSavedNotice();
  };

  const handleCopyPreviousDayProducts = () => {
    if (!latestPreviousEntry) return;
    const addedIds = new Set(activeRows.map((r) => r.productId));
    const productById = new Map(products.map((p) => [p.id, p]));
    const newItems: DailyLineItem[] = [];
    for (const prevItem of latestPreviousEntry.items) {
      if (addedIds.has(prevItem.productId)) continue;
      const catalogProd = productById.get(prevItem.productId);
      if (!catalogProd) continue;
      newItems.push(
        computeLineItem(catalogProd.id, catalogProd.name, catalogProd.unit, catalogProd.rate, 0, 0)
      );
    }
    if (newItems.length === 0) return;
    const updatedRows = [...activeRows, ...newItems];
    const currentNote = savedEntry?.note ?? '';
    const newEntry = summarizeEntry(company.id, selectedDate, updatedRows, currentNote);
    onSaveDailyEntry(newEntry);
    persistAutoDraft(updatedRows, currentNote, draftCells);
    triggerSavedNotice();
  };

  const handleRemoveProductFromDay = (productId: string) => {
    const remaining = activeRows.filter((r) => r.productId !== productId);
    const currentNote = savedEntry?.note ?? '';
    const nextCells = { ...draftCells };
    for (const col of EDITABLE_COLS) {
      delete nextCells[getCellDraftKey(productId, col)];
    }
    setDraftCells(nextCells);

    if (remaining.length === 0 && !currentNote.trim()) {
      onDeleteDailyEntry(entryKey);
      clearSalesDraft(company.id, selectedDate);
      setDraftSavedAt(null);
      setRestoredDraftInfo(null);
      setDraftRevision((r) => r + 1);
    } else {
      const newEntry = summarizeEntry(company.id, selectedDate, remaining, currentNote);
      onSaveDailyEntry(newEntry);
      persistAutoDraft(remaining, currentNote, nextCells);
    }
    triggerSavedNotice();
  };

  const applyNumericUpdate = (
    productId: string,
    field: EditableCol,
    numericValue: number,
    nextDraftMap: Record<string, string> = draftCells
  ) => {
    const cleanVal = Math.max(0, numericValue);
    const updatedRows = activeRows.map((row) => {
      if (row.productId !== productId) return row;

      let nextRate = row.rate;
      let nextOut = row.marketOut;
      let nextReturn = row.returned;

      if (field === 'rate') {
        nextRate = cleanVal;
      } else if (field === 'marketOut') {
        nextOut = cleanVal;
        if (nextReturn > nextOut) {
          nextReturn = nextOut;
        }
      } else if (field === 'returned') {
        if (cleanVal > nextOut) {
          setWarningProductId(productId);
          window.setTimeout(() => setWarningProductId(null), 2200);
        }
        nextReturn = Math.min(cleanVal, nextOut);
      }

      return computeLineItem(
        row.productId,
        row.productName,
        row.unit,
        nextRate,
        nextOut,
        nextReturn
      );
    });

    const currentNote = savedEntry?.note ?? '';
    const newEntry = summarizeEntry(company.id, selectedDate, updatedRows, currentNote);
    onSaveDailyEntry(newEntry);
    persistAutoDraft(updatedRows, currentNote, nextDraftMap);
    triggerSavedNotice();
  };

  const getCellDraftKey = (productId: string, col: EditableCol) =>
    `${selectedDate}_${productId}_${col}`;

  const handleCellChange = (productId: string, col: EditableCol, rawValue: string) => {
    const key = getCellDraftKey(productId, col);
    const nextDrafts = { ...draftCells, [key]: rawValue };
    setDraftCells(nextDrafts);

    const normalized = normalizeAsciiDigits(rawValue).trim();
    if (normalized === '') {
      applyNumericUpdate(productId, col, 0, nextDrafts);
      return;
    }
    if (/^[0-9]+(\.[0-9]+)?$/.test(normalized)) {
      applyNumericUpdate(productId, col, Number(normalized), nextDrafts);
      return;
    }

    // Even if user is mid-expression (e.g. "50+25"), persist auto-draft immediately so reload/tab switch never loses it
    persistAutoDraft(activeRows, savedEntry?.note ?? '', nextDrafts);
  };

  const commitCellDraft = (productId: string, col: EditableCol) => {
    const key = getCellDraftKey(productId, col);
    const draft = draftCells[key];
    if (draft === undefined) return;

    const nextCells = { ...draftCells };
    delete nextCells[key];
    setDraftCells(nextCells);

    const evaluated = evaluateCellExpression(draft);
    if (evaluated !== null) {
      applyNumericUpdate(productId, col, evaluated, nextCells);
    } else {
      persistAutoDraft(activeRows, savedEntry?.note ?? '', nextCells);
    }
  };

  const handleNumericCellFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    input.select();
    window.requestAnimationFrame(() => {
      if (document.activeElement === input) {
        try {
          input.setSelectionRange(0, input.value.length);
        } catch {
          // ignore if selection range unsupported
        }
      }
    });
  };

  const focusCell = (rowIndex: number, col: EditableCol) => {
    if (rowIndex < 0 || rowIndex >= activeRows.length) return;
    const targetProductId = activeRows[rowIndex].productId;
    const el = resolveCellInput(targetProductId, col);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      el.select();
      window.requestAnimationFrame(() => {
        if (document.activeElement === el) {
          try {
            el.setSelectionRange(0, el.value.length);
          } catch {
            // ignore
          }
        }
      });
    }
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    col: EditableCol,
    productId: string
  ) => {
    const colIndex = EDITABLE_COLS.indexOf(col);

    if (e.key === 'Tab') {
      e.preventDefault();
      commitCellDraft(productId, col);
      if (e.shiftKey) {
        if (colIndex > 0) {
          focusCell(rowIndex, EDITABLE_COLS[colIndex - 1]);
        } else if (rowIndex > 0) {
          focusCell(rowIndex - 1, EDITABLE_COLS[EDITABLE_COLS.length - 1]);
        }
      } else {
        if (colIndex < EDITABLE_COLS.length - 1) {
          focusCell(rowIndex, EDITABLE_COLS[colIndex + 1]);
        } else if (rowIndex + 1 < activeRows.length) {
          focusCell(rowIndex + 1, EDITABLE_COLS[0]);
        } else {
          noteInputRef.current?.focus();
        }
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      commitCellDraft(productId, col);
      if (e.shiftKey) {
        if (colIndex > 0) {
          if (col === 'marketOut' && rowIndex > 0 && activeRows[rowIndex].rate > 0) {
            focusCell(rowIndex - 1, 'returned');
          } else {
            focusCell(rowIndex, EDITABLE_COLS[colIndex - 1]);
          }
        } else if (rowIndex > 0) {
          focusCell(rowIndex - 1, 'returned');
        }
      } else {
        if (colIndex < EDITABLE_COLS.length - 1) {
          focusCell(rowIndex, EDITABLE_COLS[colIndex + 1]);
        } else if (rowIndex + 1 < activeRows.length) {
          const nextRow = activeRows[rowIndex + 1];
          focusCell(rowIndex + 1, nextRow.rate > 0 ? 'marketOut' : 'rate');
        } else {
          noteInputRef.current?.focus();
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      commitCellDraft(productId, col);
      focusCell(rowIndex + 1, col);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      commitCellDraft(productId, col);
      focusCell(rowIndex - 1, col);
    } else if (
      e.key === 'ArrowRight' &&
      e.currentTarget.selectionStart === e.currentTarget.value.length
    ) {
      if (colIndex < EDITABLE_COLS.length - 1) {
        e.preventDefault();
        commitCellDraft(productId, col);
        focusCell(rowIndex, EDITABLE_COLS[colIndex + 1]);
      }
    } else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
      if (colIndex > 0) {
        e.preventDefault();
        commitCellDraft(productId, col);
        focusCell(rowIndex, EDITABLE_COLS[colIndex - 1]);
      }
    }
  };

  const handleNoteChange = (note: string) => {
    const newEntry = summarizeEntry(company.id, selectedDate, activeRows, note);
    onSaveDailyEntry(newEntry);
    persistAutoDraft(activeRows, note, draftCells);
  };

  const handleDiscardUncommittedDraft = () => {
    const prefix = `${selectedDate}_`;
    setDraftCells((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(prefix)) next[k] = v;
      }
      return next;
    });
    clearSalesDraft(company.id, selectedDate);
    setRestoredDraftInfo(null);
    setDraftSavedAt(null);
    setDraftRevision((r) => r + 1);
  };

  const handleFinalizeDailyEntry = () => {
    // Evaluate any uncommitted expressions in draftCells for selectedDate before final save
    const finalizedRows = displayRows;
    const prefix = `${selectedDate}_`;
    setDraftCells((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(prefix)) next[k] = v;
      }
      return next;
    });

    const finalizedEntry = summarizeEntry(
      company.id,
      selectedDate,
      finalizedRows,
      savedEntry?.note
    );
    onSaveDailyEntry(finalizedEntry);
    clearSalesDraft(company.id, selectedDate);
    setRestoredDraftInfo(null);
    setDraftSavedAt(null);
    setDraftRevision((r) => r + 1);
    triggerSavedNotice();
  };

  const companyHistory = useMemo(() => {
    return Object.values(entries)
      .filter(
        (e) =>
          e.companyId === company.id &&
          (e.totalMarketOut > 0 || e.totalReturned > 0 || e.totalSalesAmount > 0)
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, company.id]);

  const companyPeriodTotals = useMemo(() => {
    let todaySales = 0;
    let monthSales = 0;
    let yearSales = 0;
    let allTimeSales = 0;

    for (const e of companyHistory) {
      allTimeSales += e.totalSalesAmount;
      if (e.date === today) todaySales += e.totalSalesAmount;
      if (e.date.startsWith(currentMonth)) monthSales += e.totalSalesAmount;
      if (e.date.startsWith(currentYear)) yearSales += e.totalSalesAmount;
    }

    return { todaySales, monthSales, yearSales, allTimeSales };
  }, [companyHistory, today, currentMonth, currentYear]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return companyHistory
      .filter((e) => isDateInRange(e.date, historyDateRange))
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.date} ${formatDateBn(e.date, true)} ${e.note ?? ''} ${e.totalSalesAmount}`.toLowerCase();
        return hay.includes(q);
      });
  }, [companyHistory, historyDateRange, historySearch]);

  const monthlyAggregates = useMemo(() => {
    const map = new Map<
      string,
      {
        monthISO: string;
        days: number;
        marketOut: number;
        returned: number;
        soldQty: number;
        salesAmount: number;
      }
    >();
    for (const e of companyHistory) {
      const ym = e.date.slice(0, 7);
      const prev = map.get(ym) ?? {
        monthISO: ym,
        days: 0,
        marketOut: 0,
        returned: 0,
        soldQty: 0,
        salesAmount: 0,
      };
      prev.days += 1;
      prev.marketOut += e.totalMarketOut;
      prev.returned += e.totalReturned;
      prev.soldQty += e.totalSoldQty;
      prev.salesAmount += e.totalSalesAmount;
      map.set(ym, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.monthISO.localeCompare(a.monthISO));
  }, [companyHistory]);

  const yearlyAggregates = useMemo(() => {
    const map = new Map<
      string,
      {
        year: string;
        days: number;
        marketOut: number;
        returned: number;
        soldQty: number;
        salesAmount: number;
      }
    >();
    for (const e of companyHistory) {
      const yr = e.date.slice(0, 4);
      const prev = map.get(yr) ?? {
        year: yr,
        days: 0,
        marketOut: 0,
        returned: 0,
        soldQty: 0,
        salesAmount: 0,
      };
      prev.days += 1;
      prev.marketOut += e.totalMarketOut;
      prev.returned += e.totalReturned;
      prev.soldQty += e.totalSoldQty;
      prev.salesAmount += e.totalSalesAmount;
      map.set(yr, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.year.localeCompare(a.year));
  }, [companyHistory]);

  const historyTotals = useMemo(() => {
    return filteredHistory.reduce(
      (acc, e) => {
        acc.marketOut += e.totalMarketOut;
        acc.returned += e.totalReturned;
        acc.soldQty += e.totalSoldQty;
        acc.salesAmount += e.totalSalesAmount;
        return acc;
      },
      { marketOut: 0, returned: 0, soldQty: 0, salesAmount: 0 }
    );
  }, [filteredHistory]);

  // Company-scoped Product-Wise Stock Report over stockDateRange
  const companyStockReport = useMemo(() => {
    const aggMap = new Map<
      string,
      {
        openingIn: number;
        openingDeduct: number;
        dayStockIn: number;
        dayDeduct: number;
        openingSold: number;
        dayMarketOut: number;
        dayReturned: number;
        daySold: number;
      }
    >();

    const ensure = (productId: string) => {
      let rec = aggMap.get(productId);
      if (!rec) {
        rec = {
          openingIn: 0,
          openingDeduct: 0,
          dayStockIn: 0,
          dayDeduct: 0,
          openingSold: 0,
          dayMarketOut: 0,
          dayReturned: 0,
          daySold: 0,
        };
        aggMap.set(productId, rec);
      }
      return rec;
    };

    const { fromDate, toDate } = stockDateRange;

    for (const mv of stockMovements) {
      if (mv.companyId !== company.id) continue;
      const rec = ensure(mv.productId);
      if (mv.type === 'stock_in') {
        if (fromDate && mv.date < fromDate) {
          rec.openingIn += mv.quantity;
        } else if ((!fromDate || mv.date >= fromDate) && (!toDate || mv.date <= toDate)) {
          rec.dayStockIn += mv.quantity;
        }
      } else {
        if (fromDate && mv.date < fromDate) {
          rec.openingDeduct += mv.quantity;
        } else if ((!fromDate || mv.date >= fromDate) && (!toDate || mv.date <= toDate)) {
          rec.dayDeduct += mv.quantity;
        }
      }
    }

    for (const entry of Object.values(entries)) {
      if (entry.companyId !== company.id) continue;
      for (const item of entry.items) {
        const rec = ensure(item.productId);
        if (fromDate && entry.date < fromDate) {
          rec.openingSold += item.soldQty;
        } else if ((!fromDate || entry.date >= fromDate) && (!toDate || entry.date <= toDate)) {
          rec.dayMarketOut += item.marketOut;
          rec.dayReturned += item.returned;
          rec.daySold += item.soldQty;
        }
      }
    }

    const q = stockSearch.trim().toLowerCase();
    const filteredProducts = q
      ? products.filter((p) => p.name.toLowerCase().includes(q) || p.unit.toLowerCase().includes(q))
      : products;

    const rows = filteredProducts.map((product) => {
      const agg = aggMap.get(product.id);
      const openingStock = Number(
        ((agg?.openingIn ?? 0) - (agg?.openingSold ?? 0) - (agg?.openingDeduct ?? 0)).toFixed(2)
      );
      const dayStockIn = Number((agg?.dayStockIn ?? 0).toFixed(2));
      const daySold = Number((agg?.daySold ?? 0).toFixed(2));
      const dayDeduct = Number((agg?.dayDeduct ?? 0).toFixed(2));
      const closingStock = Number(
        (openingStock + dayStockIn - daySold - dayDeduct).toFixed(2)
      );
      const stockRate = computeStockRate(product.rate);
      const stockValue = Number((closingStock * stockRate).toFixed(2));

      return {
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        rate: stockRate,
        salesRate: product.rate,
        openingStock,
        dayStockIn,
        dayMarketOut: Number((agg?.dayMarketOut ?? 0).toFixed(2)),
        dayReturned: Number((agg?.dayReturned ?? 0).toFixed(2)),
        daySold,
        closingStock,
        stockValue,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.openingStock += r.openingStock;
        acc.dayStockIn += r.dayStockIn;
        acc.daySold += r.daySold;
        acc.closingStock += r.closingStock;
        acc.stockValue += r.stockValue;
        return acc;
      },
      {
        openingStock: 0,
        dayStockIn: 0,
        daySold: 0,
        closingStock: 0,
        stockValue: 0,
      }
    );

    return {
      rows,
      totals: {
        openingStock: Number(totals.openingStock.toFixed(2)),
        dayStockIn: Number(totals.dayStockIn.toFixed(2)),
        daySold: Number(totals.daySold.toFixed(2)),
        closingStock: Number(totals.closingStock.toFixed(2)),
        stockValue: Number(totals.stockValue.toFixed(2)),
      },
    };
  }, [products, entries, stockMovements, company.id, stockDateRange, stockSearch]);

  const handleDownloadCompanyStockCsv = () => {
    if (!isAdmin) return;
    const csvRows: StockReportCsvRow[] = companyStockReport.rows.map((r) => ({
      companyName: company.name,
      productName: r.productName,
      unit: r.unit,
      openingStock: r.openingStock,
      dayStockIn: r.dayStockIn,
      daySold: r.daySold,
      closingStock: r.closingStock,
      rate: r.rate,
      stockValue: r.stockValue,
    }));
    downloadStockReportCsv(
      csvRows,
      stockDateRange.toDate || selectedDate,
      company.name
    );
  };

  return (
    <div className="space-y-8">
      <PrintLetterhead
        reportTitle={`${company.name} · দৈনিক সেলস ও স্টক রিপোর্ট`}
        reportDate={formatDateBn(selectedDate, true)}
        subtitle={`প্রোডাক্ট: ${products.length}টি · আজকের সেলস: ${formatTaka(currentTotals.totalSalesAmount)}`}
      />

      {/* Company Top Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <CompanyLogoAvatar
              name={company.name}
              logoUrl={company.logoUrl}
              isDemo={DEMO_COMPANY_IDS.includes(
                company.id as (typeof DEMO_COMPANY_IDS)[number]
              )}
              className="h-12 w-12 rounded-2xl"
              textClassName="text-xl font-extrabold"
            />
            <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#0f172a]">{company.name}</h1>
            {isAdmin &&
              DEMO_COMPANY_IDS.includes(company.id as (typeof DEMO_COMPANY_IDS)[number]) && (
                <span className="rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-950 whitespace-nowrap">
                  স্যাম্পল ডেটা
                </span>
              )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => onEditCompany(company)}
                className="no-print inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                লোগো / প্রতিনিধি এডিট
              </button>
            )}
          </div>
          {isAdmin &&
            DEMO_COMPANY_IDS.includes(company.id as (typeof DEMO_COMPANY_IDS)[number]) && (
              <p className="no-print mt-1.5 text-xs font-semibold text-amber-900">
                এটি পরীক্ষামূলক স্যাম্পল ডেটা — আপনার মূল হিসাবের সাথে মেশে না। প্রয়োজনে 'সকল কোম্পানি' বা 'রিস্টোর ও ডাটা' থেকে এক ক্লিকে মুছতে পারবেন।
              </p>
            )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#1e293b]">
            <span>Khan Enterprise</span>
            <span aria-hidden="true">·</span>
            <span>সেভ করা প্রোডাক্ট: {products.length}টি</span>
            <span aria-hidden="true">·</span>
            <span>মোট হিসাবের দিন: {companyHistory.length} দিন</span>
          </div>
          {(company.tsmName ||
            company.tsmPhone ||
            (company.srContacts && company.srContacts.length > 0) ||
            company.contactPerson ||
            company.phone) && (
            <div className="mt-2.5">
              <CompanyRepsStrip company={company} />
            </div>
          )}
        </div>

        {/* Date Controls & Master Product/Rate Manager Toggle */}
        <div className="no-print flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setSelectedDate(shiftDateISO(selectedDate, -1))}
              className="rounded-md p-2 text-[#1e293b] transition-colors hover:bg-slate-100 hover:text-[#0f172a]"
              title="আগের দিন"
              aria-label="আগের দিন"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="relative flex items-center px-1.5 sm:px-2">
              <Calendar className="mr-1.5 h-4 w-4 shrink-0 text-slate-600" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="font-mono-tabular bg-transparent text-base sm:text-sm font-bold text-[#0f172a] focus:outline-none"
                aria-label="তারিখ নির্বাচন করুন"
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(shiftDateISO(selectedDate, 1))}
              className="rounded-md p-2 text-[#1e293b] transition-colors hover:bg-slate-100 hover:text-[#0f172a]"
              title="পরের দিন"
              aria-label="পরের দিন"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="min-h-[40px] sm:min-h-0 rounded-lg border border-slate-300 bg-white px-3 sm:px-3.5 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              আজকের তারিখ
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              stockReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 sm:px-3.5 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <Package className="h-4 w-4 text-teal-700" />
            স্টক রিপোর্ট
          </button>

          <button
            type="button"
            onClick={() => setShowProductManager((v) => !v)}
            className={`inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-lg border px-3 sm:px-3.5 py-2 text-sm font-bold transition-colors whitespace-nowrap ${
              showProductManager
                ? 'border-teal-700 bg-teal-50 text-teal-900'
                : 'border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50'
            }`}
          >
            <Settings2 className="h-4 w-4" />
            {isAdmin
              ? `প্রোডাক্ট ও রেট সেটআপ (${products.length})`
              : `প্রোডাক্ট ও রেট তালিকা (${products.length})`}
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAddProduct}
              className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-lg bg-teal-700 px-3 sm:px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              নতুন প্রোডাক্ট ও রেট
            </button>
          )}
        </div>
      </div>

      {/* Admin-only 1-to-1 Quick Module Navigation Strip */}
      {isAdmin && oneToOneSummary && (
        <section
          aria-label="কোম্পানির ১-টু-১ আলাদা মডিউল সারসংক্ষেপ"
          className="no-print grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <button
            type="button"
            onClick={() => onOpenModule?.('company_ledger')}
            className="group rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 text-left shadow-[0_2px_12px_-4px_rgba(15,41,66,0.06)] transition-all hover:-translate-y-0.5 hover:border-[#1E3A8A]/50 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-[#1E3A8A]" />
                পেমেন্ট ও চালান ব্যালেন্স
              </span>
              <span className="text-[11px] font-bold text-[#1E3A8A] group-hover:underline">
                খুলুন →
              </span>
            </div>
            <p
              className={`font-mono-tabular mt-1.5 text-lg font-extrabold ${
                oneToOneSummary.netLedgerBalance > 0
                  ? 'text-emerald-700'
                  : oneToOneSummary.netLedgerBalance < 0
                    ? 'text-rose-700'
                    : 'text-[#0f172a]'
              }`}
            >
              {oneToOneSummary.netLedgerBalance > 0
                ? `পাব +${formatTaka(oneToOneSummary.receivableFromCompany)}`
                : oneToOneSummary.netLedgerBalance < 0
                  ? `দিতে হবে ${formatTaka(oneToOneSummary.payableToCompany)}`
                  : '৳ ০ (সমান)'}
            </p>
            <p className="font-mono-tabular mt-0.5 text-[11.5px] font-medium text-slate-600">
              জমা {formatTaka(oneToOneSummary.totalPaid)} · মাল {formatTaka(oneToOneSummary.totalGoods)}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onOpenModule?.('customer_credit')}
            className="group rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 text-left shadow-[0_2px_12px_-4px_rgba(15,41,66,0.06)] transition-all hover:-translate-y-0.5 hover:border-[#1E3A8A]/50 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-amber-700" />
                কাস্টমার বাকি
              </span>
              <span className="text-[11px] font-bold text-[#1E3A8A] group-hover:underline">
                খুলুন →
              </span>
            </div>
            <p
              className={`font-mono-tabular mt-1.5 text-lg font-extrabold ${
                oneToOneSummary.customerDueTotal > 0 ? 'text-amber-800' : 'text-teal-800'
              }`}
            >
              {formatTaka(Math.max(0, oneToOneSummary.customerDueTotal))}
            </p>
            <p className="font-mono-tabular mt-0.5 text-[11.5px] font-medium text-slate-600">
              {formatNumber(oneToOneSummary.dueCustomerCount)}টি দোকানে বাকি · মোট {formatNumber(oneToOneSummary.customerCount)} জন
            </p>
          </button>

          <button
            type="button"
            onClick={() => onOpenModule?.('profit_loss')}
            className="group rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 text-left shadow-[0_2px_12px_-4px_rgba(15,41,66,0.06)] transition-all hover:-translate-y-0.5 hover:border-[#1E3A8A]/50 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-teal-700" />
                এই মাসের লাভ/লস
              </span>
              <span className="text-[11px] font-bold text-[#1E3A8A] group-hover:underline">
                খুলুন →
              </span>
            </div>
            <p
              className={`font-mono-tabular mt-1.5 text-lg font-extrabold ${
                oneToOneSummary.monthProfitLoss >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {oneToOneSummary.monthProfitLoss >= 0
                ? `+${formatTaka(oneToOneSummary.monthProfitLoss)}`
                : `−${formatTaka(Math.abs(oneToOneSummary.monthProfitLoss))}`}
            </p>
            <p className="font-mono-tabular mt-0.5 text-[11.5px] font-medium text-slate-600">
              মাসিক সেলস {formatTaka(oneToOneSummary.monthSales)} · খরচ {formatTaka(oneToOneSummary.monthExpense)}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onOpenModule?.('cash')}
            className="group rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 text-left shadow-[0_2px_12px_-4px_rgba(15,41,66,0.06)] transition-all hover:-translate-y-0.5 hover:border-[#1E3A8A]/50 hover:shadow-md"
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-emerald-700" />
                হাতে অবশিষ্ট ক্যাশ
              </span>
              <span className="text-[11px] font-bold text-[#1E3A8A] group-hover:underline">
                খুলুন →
              </span>
            </div>
            <p
              className={`font-mono-tabular mt-1.5 text-lg font-extrabold ${
                oneToOneSummary.remainingCash >= 0 ? 'text-[#0f2942]' : 'text-rose-700'
              }`}
            >
              {formatTaka(oneToOneSummary.remainingCash)}
            </p>
            <p className="font-mono-tabular mt-0.5 text-[11.5px] font-medium text-slate-600">
              জমা {formatTaka(oneToOneSummary.totalCashIn)} · খরচ {formatTaka(oneToOneSummary.totalExpense)}
            </p>
          </button>
        </section>
      )}

      {/* Expandable Master Product & Rate Catalog (Set once, update rate anytime) */}
      {showProductManager && (
        <section className="no-print rounded-2xl border border-slate-200/85 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-[#0f172a]">
                স্থায়ী প্রোডাক্ট ও রেট তালিকা — {company.name}
              </h2>
              <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
                প্রতিটি প্রোডাক্ট ও তার রেট এখানে একবারই সেভ করুন। ভবিষ্যতে রেট পরিবর্তন হলে এখান থেকে আপডেট করলেই নতুন দিনে অটো আপডেট রেট পাবে।
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={onOpenAddProduct}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-bold text-white hover:bg-teal-800 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                প্রোডাক্ট যোগ করুন
              </button>
            )}
          </div>

          {products.length === 0 ? (
            <div className="px-5 py-8 text-center text-[15px] font-medium text-[#1e293b]">
              এখনও কোনো প্রোডাক্ট সেভ করা হয়নি।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[15px]">
                <thead className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <tr>
                    <th className="px-5 py-3.5">প্রোডাক্টের নাম</th>
                    <th className="px-4 py-3.5">ইউনিট</th>
                    <th className="px-4 py-3.5 text-right">নির্ধারিত রেট (৳)</th>
                    {isAdmin && <th className="px-5 py-3.5 text-right">অ্যাকশন</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-bold text-[#0f172a]">{product.name}</td>
                      <td className="px-4 py-3 font-medium text-[#1e293b]">{product.unit}</td>
                      <td className="font-mono-tabular px-4 py-3 text-right font-bold text-[#0f172a]">
                        {formatTaka(product.rate)}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenEditProduct(product)}
                              className="rounded-md px-2.5 py-1 text-sm font-bold text-teal-800 hover:bg-teal-50"
                            >
                              রেট পরিবর্তন / এডিট
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteProduct(product.id)}
                              className="rounded-md px-2.5 py-1 text-sm font-bold text-rose-700 hover:bg-rose-50"
                              title="প্রোডাক্ট মুছুন"
                            >
                              মুছুন
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-5 py-3.5">
              {!confirmDeleteCompany ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteCompany(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-700 hover:text-rose-800"
                >
                  <Trash2 className="h-4 w-4" />
                  এই কোম্পানি মুছে ফেলুন
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-bold text-rose-800">
                    {company.name} এবং এর সকল হিসাব মুছে ফেলবেন?
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCompany(false)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-bold text-[#0f172a]"
                  >
                    না
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCompany(company.id)}
                    className="rounded-md bg-rose-700 px-3 py-1 text-sm font-bold text-white hover:bg-rose-800"
                  >
                    হ্যাঁ, মুছুন
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* FOCAL ANCHOR: Per-Day Product Picker + Excel Auto-Calculation Sheet */}
      <section className="rounded-2xl border border-slate-200/85 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold text-[#0f172a]">
                দৈনিক সেলস শীট (এক্সেল ক্যালকুলেশন)
              </h2>
              <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-extrabold text-[#1E3A8A]">
                <Building2 className="h-3.5 w-3.5" />
                {company.name}
              </span>
              {savedNotice && (
                <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700">
                  <Check className="h-4 w-4" />
                  অটো-সেভ হয়েছে
                </span>
              )}
              {isAdmin && draftSavedAt && !savedNotice && (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900">
                  <Clock className="h-3.5 w-3.5 text-amber-700" />
                  ড্রাফট অটো-সেভড {formatDraftTimeBn(draftSavedAt) ? `· ${formatDraftTimeBn(draftSavedAt)}` : ''}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
              তারিখ:{' '}
              <span className="font-bold text-[#0f172a]">
                {formatDateBn(selectedDate, true)}
              </span>
              {' · '}
              {isAdmin
                ? 'সংখ্যা লিখলেই নেট বিক্রি ও টাকা লাইভ আপডেট হবে · Enter / Tab দিয়ে দ্রুত পরের ঘরে যান।'
                : 'শুধুমাত্র দেখার অনুমতি · নতুন হিসাব যোগ বা পরিবর্তন কেবল অ্যাডমিন করতে পারবেন।'}
            </p>
          </div>

          {isAdmin ? (
            <div className="no-print flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadCompanyDayCsv(company.name, currentTotals)}
                disabled={displayRows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                Excel (CSV) ডাউনলোড
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={displayRows.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
              >
                <Printer className="h-4 w-4" />
                প্রিন্ট
              </button>
            </div>
          ) : (
            <div className="no-print inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 whitespace-nowrap">
              ডাউনলোড ও প্রিন্ট বন্ধ (S.R ভিউ)
            </div>
          )}
        </div>

        {/* Auto-Draft Restored Banner + Quick Resume for Other Unfinished Dates */}
        {isAdmin && (restoredDraftInfo || otherIncompleteDrafts.length > 0) && (
          <div className="no-print space-y-2 border-b border-amber-200 bg-amber-50/70 px-5 py-2.5">
            {restoredDraftInfo && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <RotateCcw className="h-4 w-4 shrink-0 text-amber-700" />
                  <span>
                    অসম্পূর্ণ সেলস ড্রাফট অটো-রিস্টোর হয়েছে ({formatDateBn(restoredDraftInfo.date)} · সময় {formatDraftTimeBn(restoredDraftInfo.updatedAt)})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDiscardUncommittedDraft}
                    className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                  >
                    ড্রাফট ব্যাজ সরান
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalizeDailyEntry}
                    className="rounded-md bg-teal-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-teal-800 whitespace-nowrap"
                  >
                    চূড়ান্ত সংরক্ষণ করুন
                  </button>
                </div>
              </div>
            )}
            {otherIncompleteDrafts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-bold text-amber-900">অন্য তারিখের অসম্পূর্ণ ড্রাফট:</span>
                {otherIncompleteDrafts.slice(0, 4).map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setSelectedDate(d.date)}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-0.5 font-bold text-amber-950 hover:bg-amber-100 whitespace-nowrap"
                  >
                    <Clock className="h-3 w-3 text-amber-700" />
                    {formatDateBn(d.date)} ({d.items.length}টি)
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary Strip for Selected Day */}
        <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4">
          <div className="bg-white px-3.5 py-3 sm:px-5 sm:py-3.5">
            <p className="text-xs sm:text-sm font-bold text-[#1e293b]">মোট মার্কেটে গিয়েছে</p>
            <p className="font-mono-tabular mt-1 text-xl sm:text-2xl font-extrabold text-[#0f172a]">
              {formatNumber(currentTotals.totalMarketOut)}
            </p>
          </div>
          <div className="bg-white px-3.5 py-3 sm:px-5 sm:py-3.5">
            <p className="text-xs sm:text-sm font-bold text-[#1e293b]">মোট রিটার্ন এসেছে</p>
            <p className="font-mono-tabular mt-1 text-xl sm:text-2xl font-extrabold text-amber-800">
              {formatNumber(currentTotals.totalReturned)}
            </p>
          </div>
          <div className="bg-white px-3.5 py-3 sm:px-5 sm:py-3.5">
            <p className="text-xs sm:text-sm font-bold text-[#1e293b]">মোট নেট বিক্রি</p>
            <p className="font-mono-tabular mt-1 text-xl sm:text-2xl font-extrabold text-[#0f172a]">
              {formatNumber(currentTotals.totalSoldQty)}
            </p>
          </div>
          <div className="bg-teal-50/85 px-3.5 py-3 sm:px-5 sm:py-3.5">
            <p className="text-xs sm:text-sm font-bold text-teal-900">আজকের মোট সেলস টাকা</p>
            <p className="font-mono-tabular mt-1 text-xl sm:text-2xl font-extrabold text-teal-800">
              {formatTaka(currentTotals.totalSalesAmount)}
            </p>
          </div>
        </div>

        {/* PER-DAY PRODUCT PICKER BAR (Admin Only) */}
        {isAdmin && (
        <div className="no-print border-b border-slate-200 bg-slate-50/50 px-4 py-3.5 sm:px-5 sm:py-4">
          {products.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-[15px] font-bold text-[#0f172a]">
                  প্রথমে এই কোম্পানির প্রোডাক্ট ও রেট একবার সেভ করুন
                </p>
                <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
                  একবার প্রোডাক্ট ও রেট যোগ করলে প্রতিদিন শুধু সিলেক্ট করেই হিসাব করতে পারবেন।
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenAddProduct}
                className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                প্রথম প্রোডাক্ট ও রেট যোগ করুন
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2.5">
                  {/* Dropdown Selector */}
                  <div className="relative min-w-0 w-full sm:min-w-[260px] sm:flex-1 sm:max-w-sm">
                    <select
                      value=""
                      onChange={(e) => {
                        const chosen = products.find((p) => p.id === e.target.value);
                        if (chosen) handleSelectProductForDay(chosen);
                      }}
                      aria-label="এই দিনের প্রোডাক্ট সিলেক্ট করুন"
                      className="w-full min-h-[42px] sm:min-h-0 rounded-lg border border-teal-600/60 bg-white px-3.5 py-2 text-base sm:text-[15px] font-semibold text-[#0f172a] focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    >
                      <option value="">
                        {availableProductsForDay.length > 0
                          ? `+ আজকের প্রোডাক্ট সিলেক্ট করুন (${availableProductsForDay.length}টি বাকি)...`
                          : 'এই কোম্পানির সব প্রোডাক্ট আজকের তালিকায় আছে'}
                      </option>
                      {products
                        .filter((p) => !activeRows.some((r) => r.productId === p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unit}) — ৳ {p.rate}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Quick Search when catalog is large */}
                  {products.filter((p) => !activeRows.some((r) => r.productId === p.id)).length >
                    4 && (
                    <div className="relative min-w-0 w-full sm:min-w-[180px] sm:flex-1 sm:max-w-[220px]">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="প্রোডাক্ট খুঁজে সিলেক্ট..."
                        className="w-full min-h-[42px] sm:min-h-0 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-base sm:text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeRows.length === 0 && latestPreviousEntry && (
                    <button
                      type="button"
                      onClick={handleCopyPreviousDayProducts}
                      className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2 text-sm font-bold text-[#1E3A8A] transition-colors hover:bg-blue-100 whitespace-nowrap"
                    >
                      <History className="h-4 w-4" />
                      আগের দিনের প্রোডাক্ট আনুন ({latestPreviousEntry.items.length}টি)
                    </button>
                  )}
                  {availableProductsForDay.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAddAllRemainingProductsForDay}
                      className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-100 whitespace-nowrap"
                    >
                      <ListChecks className="h-4 w-4 text-teal-700" />
                      সব প্রোডাক্ট যোগ করুন
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onOpenAddProduct}
                    className="inline-flex min-h-[40px] sm:min-h-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-100 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4 text-teal-700" />
                    তালিকায় নতুন প্রোডাক্ট
                  </button>
                </div>
              </div>

              {/* 1-Click Quick-Pick Buttons for Remaining Products (Frequent First) */}
              {availableProductsForDay.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-bold text-[#1e293b]">
                    দ্রুত সিলেক্ট (বেশি ব্যবহৃত আগে):
                  </span>
                  {availableProductsForDay.slice(0, 10).map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleSelectProductForDay(prod)}
                      className="inline-flex min-h-[36px] sm:min-h-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 sm:py-1 text-sm font-semibold text-[#0f172a] transition-colors hover:border-teal-600 hover:bg-teal-50/60 hover:text-teal-900"
                    >
                      <Plus className="h-3.5 w-3.5 text-teal-700" />
                      <span>{prod.name}</span>
                      <span className="font-mono-tabular text-xs font-bold text-[#1e293b]">
                        ৳{prod.rate}
                      </span>
                    </button>
                  ))}
                  {availableProductsForDay.length > 10 && (
                    <span className="text-xs font-semibold text-[#1e293b]">
                      +{availableProductsForDay.length - 10}টি আরও (ড্রপডাউনে দেখুন)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Mobile Card Entry View + Desktop Excel-Style Spreadsheet Grid */}
        {displayRows.length === 0 ? (
          <div className="px-5 py-10 text-center sm:px-6 sm:py-12">
            <p className="text-base font-bold text-[#0f172a]">
              {formatDateBn(selectedDate)}-এর হিসেবে এখনও কোনো প্রোডাক্ট এন্ট্রি করা হয়নি।
            </p>
            {isAdmin && (
              <p className="mt-1.5 text-sm font-medium text-[#1e293b]">
                উপরের ড্রপডাউন বা দ্রুত সিলেক্ট বাটন থেকে যে প্রোডাক্টগুলো আজ মার্কেটে যাচ্ছে সেগুলো সিলেক্ট করুন — সাথে সাথেই নাম ও রেট নিচে বসে যাবে।
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Touch Card Entry View (< md, hidden when printing) */}
            <div className="md:hidden print:hidden divide-y divide-slate-200 bg-slate-50/40">
              {displayRows.map((row, rowIndex) => {
                const hasReturnWarning = warningProductId === row.productId;
                const rateDraft = draftCells[getCellDraftKey(row.productId, 'rate')];
                const outDraft = draftCells[getCellDraftKey(row.productId, 'marketOut')];
                const retDraft = draftCells[getCellDraftKey(row.productId, 'returned')];
                const isLastRow = rowIndex === displayRows.length - 1;

                return (
                  <div key={row.productId} className="bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <span className="font-mono-tabular mt-0.5 inline-flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded bg-slate-100 px-1.5 text-xs font-bold text-[#1e293b]">
                            #{rowIndex + 1}
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-base font-bold leading-snug text-[#0f172a]">
                              {row.productName}
                            </h3>
                            <p className="mt-0.5 text-xs font-semibold text-[#1e293b]">
                              ইউনিট: {row.unit}
                            </p>
                          </div>
                        </div>
                      </div>

                      {isAdmin && (
                        confirmRemoveProductId === row.productId ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                handleRemoveProductFromDay(row.productId);
                                setConfirmRemoveProductId(null);
                              }}
                              className="min-h-[36px] rounded-lg bg-rose-600 px-2.5 text-xs font-bold text-white"
                            >
                              সরান
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveProductId(null)}
                              className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700"
                            >
                              না
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (row.marketOut > 0 || row.returned > 0) {
                                setConfirmRemoveProductId(row.productId);
                              } else {
                                handleRemoveProductFromDay(row.productId);
                              }
                            }}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            title="আজকের হিসাব থেকে সরান"
                            aria-label={`${row.productName} আজকের হিসাব থেকে সরান`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )
                      )}
                    </div>

                    {/* 3-Column Touch Input Grid (>=44px tap targets, >=16px font to prevent mobile auto-zoom) */}
                    <div className="mt-3 grid grid-cols-3 gap-2.5">
                      <div>
                        <label
                          htmlFor={`mob-rate-${row.productId}`}
                          className="mb-1.5 block text-xs font-bold text-[#1e293b]"
                        >
                          রেট (৳)
                        </label>
                        {isAdmin ? (
                          <input
                            id={`mob-rate-${row.productId}`}
                            ref={(el) => {
                              mobileCellRefs.current[`${row.productId}_rate`] = el;
                            }}
                            type="text"
                            inputMode="decimal"
                            enterKeyHint="next"
                            value={
                              rateDraft !== undefined
                                ? rateDraft
                                : row.rate === 0
                                  ? ''
                                  : String(row.rate)
                            }
                            placeholder="0"
                            onFocus={handleNumericCellFocus}
                            onChange={(e) => handleCellChange(row.productId, 'rate', e.target.value)}
                            onBlur={() => commitCellDraft(row.productId, 'rate')}
                            onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'rate', row.productId)}
                            aria-label={`${row.productName} রেট`}
                            className="font-mono-tabular min-h-[44px] h-11 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-right text-[16px] font-bold text-[#0f172a] placeholder:text-slate-400 focus:border-teal-700 focus:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                          />
                        ) : (
                          <div className="font-mono-tabular flex min-h-[44px] h-11 items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[16px] font-bold text-[#0f172a]">
                            {formatNumber(row.rate)}
                          </div>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor={`mob-out-${row.productId}`}
                          className="mb-1.5 block text-xs font-bold text-[#1e293b]"
                        >
                          মার্কেটে গেছে
                        </label>
                        {isAdmin ? (
                          <input
                            id={`mob-out-${row.productId}`}
                            ref={(el) => {
                              mobileCellRefs.current[`${row.productId}_marketOut`] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            enterKeyHint="next"
                            value={
                              outDraft !== undefined
                                ? outDraft
                                : row.marketOut === 0
                                  ? ''
                                  : String(row.marketOut)
                            }
                            placeholder="0"
                            onFocus={handleNumericCellFocus}
                            onChange={(e) =>
                              handleCellChange(row.productId, 'marketOut', e.target.value)
                            }
                            onBlur={() => commitCellDraft(row.productId, 'marketOut')}
                            onKeyDown={(e) =>
                              handleCellKeyDown(e, rowIndex, 'marketOut', row.productId)
                            }
                            aria-label={`${row.productName} মার্কেটে গেছে`}
                            className="font-mono-tabular min-h-[44px] h-11 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-right text-[16px] font-bold text-[#0f172a] placeholder:text-slate-400 focus:border-teal-700 focus:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                          />
                        ) : (
                          <div className="font-mono-tabular flex min-h-[44px] h-11 items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[16px] font-bold text-[#0f172a]">
                            {formatNumber(row.marketOut)}
                          </div>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor={`mob-ret-${row.productId}`}
                          className="mb-1.5 block text-xs font-bold text-amber-900"
                        >
                          রিটার্ন এসেছে
                        </label>
                        {isAdmin ? (
                          <input
                            id={`mob-ret-${row.productId}`}
                            ref={(el) => {
                              mobileCellRefs.current[`${row.productId}_returned`] = el;
                            }}
                            type="text"
                            inputMode="numeric"
                            enterKeyHint={isLastRow ? 'done' : 'next'}
                            value={
                              retDraft !== undefined
                                ? retDraft
                                : row.returned === 0
                                  ? ''
                                  : String(row.returned)
                            }
                            placeholder="0"
                            onFocus={handleNumericCellFocus}
                            onChange={(e) =>
                              handleCellChange(row.productId, 'returned', e.target.value)
                            }
                            onBlur={() => commitCellDraft(row.productId, 'returned')}
                            onKeyDown={(e) =>
                              handleCellKeyDown(e, rowIndex, 'returned', row.productId)
                            }
                            aria-label={`${row.productName} রিটার্ন`}
                            className="font-mono-tabular min-h-[44px] h-11 w-full rounded-lg border border-amber-300 bg-amber-50/35 px-2.5 text-right text-[16px] font-bold text-amber-800 placeholder:text-slate-400 focus:border-teal-700 focus:bg-amber-50/75 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                          />
                        ) : (
                          <div className="font-mono-tabular flex min-h-[44px] h-11 items-center justify-end rounded-lg border border-amber-200 bg-amber-50/40 px-2.5 text-[16px] font-bold text-amber-800">
                            {formatNumber(row.returned)}
                          </div>
                        )}
                      </div>
                    </div>

                    {hasReturnWarning && (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        রিটার্ন মার্কেটে যাওয়া সংখ্যার বেশি হবে না
                      </p>
                    )}

                    {/* Highlighted Net Sold & Taka Boxes */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-slate-100/80 px-3 py-2">
                        <span className="text-xs font-bold text-[#1e293b]">নেট বিক্রি</span>
                        <span className="font-mono-tabular text-[15px] font-extrabold text-[#0f172a]">
                          {formatNumber(row.soldQty)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
                        <span className="text-xs font-bold text-teal-900">মোট টাকা</span>
                        <span className="font-mono-tabular text-[15px] font-extrabold text-teal-800">
                          {formatTaka(row.salesAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Mobile Total Summary Card */}
              <div className="bg-[#0f2942]/[0.07] px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#0f172a]">
                    সর্বমোট ({displayRows.length}টি প্রোডাক্ট)
                  </span>
                  <span className="font-mono-tabular text-lg font-extrabold text-teal-800">
                    {formatTaka(currentTotals.totalSalesAmount)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-[#1e293b]">
                  <span>মার্কেটে: {formatNumber(currentTotals.totalMarketOut)}</span>
                  <span className="text-amber-800">রিটার্ন: {formatNumber(currentTotals.totalReturned)}</span>
                  <span className="text-[#0f172a]">নেট বিক্রি: {formatNumber(currentTotals.totalSoldQty)}</span>
                </div>
              </div>
            </div>

            {/* Desktop Excel-Style Spreadsheet Grid (hidden on <md unless printing) */}
            <div className="hidden md:block print:block overflow-x-auto">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                    <th className="w-10 border-r border-slate-300 py-3.5 text-center text-[#1e293b]">
                      #
                    </th>
                    <th className="border-r border-slate-300 px-3 py-3.5">
                      A · প্রোডাক্টের নাম
                    </th>
                    <th className="w-32 border-r border-slate-300 px-3 py-3.5 text-right">
                      B · রেট (৳)
                    </th>
                    <th className="w-36 border-r border-slate-300 px-3 py-3.5 text-right">
                      C · মার্কেটে গেছে
                    </th>
                    <th className="w-36 border-r border-slate-300 px-3 py-3.5 text-right">
                      D · রিটার্ন এসেছে
                    </th>
                    <th className="w-36 border-r border-slate-300 px-3 py-3.5 text-right">
                      E · বিক্রি (C − D)
                    </th>
                    <th className="w-40 border-r border-slate-300 px-3 py-3.5 text-right">
                      F · মোট টাকা (E × B)
                    </th>
                    {isAdmin && (
                      <th className="no-print w-10 py-3.5 text-center text-[#1e293b]" aria-label="সারি সরান" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, rowIndex) => {
                    const hasReturnWarning = warningProductId === row.productId;
                    const rateDraft = draftCells[getCellDraftKey(row.productId, 'rate')];
                    const outDraft = draftCells[getCellDraftKey(row.productId, 'marketOut')];
                    const retDraft = draftCells[getCellDraftKey(row.productId, 'returned')];
                    const isLastRow = rowIndex === displayRows.length - 1;

                    return (
                      <tr
                        key={row.productId}
                        className="border-b border-slate-200 transition-colors hover:bg-slate-50/70 focus-within:bg-blue-50/35"
                      >
                        <td className="font-mono-tabular border-r border-slate-200 bg-slate-50/60 py-2.5 text-center text-sm font-bold text-[#1e293b]">
                          {rowIndex + 1}
                        </td>

                        <td className="border-r border-slate-200 px-3 py-2.5">
                          <div className="font-bold text-[#0f172a]">{row.productName}</div>
                          <div className="text-xs font-semibold text-[#1e293b]">ইউনিট: {row.unit}</div>
                        </td>

                        {/* B: Auto-filled Rate */}
                        <td className="border-r border-slate-200 p-0">
                          {isAdmin ? (
                            <input
                              ref={(el) => {
                                cellRefs.current[`${row.productId}_rate`] = el;
                              }}
                              type="text"
                              inputMode="decimal"
                              enterKeyHint="next"
                              value={
                                rateDraft !== undefined
                                  ? rateDraft
                                  : row.rate === 0
                                    ? ''
                                    : String(row.rate)
                              }
                              placeholder="0"
                              onFocus={handleNumericCellFocus}
                              onChange={(e) => handleCellChange(row.productId, 'rate', e.target.value)}
                              onBlur={() => commitCellDraft(row.productId, 'rate')}
                              onKeyDown={(e) => handleCellKeyDown(e, rowIndex, 'rate', row.productId)}
                              aria-label={`${row.productName} রেট`}
                              className="font-mono-tabular h-11 w-full bg-transparent px-3 text-right text-[16px] md:text-[15px] font-bold text-[#0f172a] placeholder:text-slate-400 focus:bg-teal-50/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700"
                            />
                          ) : (
                            <div className="font-mono-tabular flex h-11 items-center justify-end px-3 text-[16px] md:text-[15px] font-bold text-[#0f172a]">
                              {formatNumber(row.rate)}
                            </div>
                          )}
                        </td>

                        {/* C: Market Out */}
                        <td className="border-r border-slate-200 p-0">
                          {isAdmin ? (
                            <input
                              ref={(el) => {
                                cellRefs.current[`${row.productId}_marketOut`] = el;
                              }}
                              type="text"
                              inputMode="numeric"
                              enterKeyHint="next"
                              value={
                                outDraft !== undefined
                                  ? outDraft
                                  : row.marketOut === 0
                                    ? ''
                                    : String(row.marketOut)
                              }
                              placeholder="0"
                              onFocus={handleNumericCellFocus}
                              onChange={(e) =>
                                handleCellChange(row.productId, 'marketOut', e.target.value)
                              }
                              onBlur={() => commitCellDraft(row.productId, 'marketOut')}
                              onKeyDown={(e) =>
                                handleCellKeyDown(e, rowIndex, 'marketOut', row.productId)
                              }
                              aria-label={`${row.productName} মার্কেটে গেছে`}
                              className="font-mono-tabular h-11 w-full bg-transparent px-3 text-right text-[16px] md:text-[15px] font-bold text-[#0f172a] placeholder:text-slate-400 focus:bg-teal-50/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700"
                            />
                          ) : (
                            <div className="font-mono-tabular flex h-11 items-center justify-end px-3 text-[16px] md:text-[15px] font-bold text-[#0f172a]">
                              {formatNumber(row.marketOut)}
                            </div>
                          )}
                        </td>

                        {/* D: Return */}
                        <td className="border-r border-slate-200 p-0">
                          {isAdmin ? (
                            <div className="relative">
                              <input
                                ref={(el) => {
                                  cellRefs.current[`${row.productId}_returned`] = el;
                                }}
                                type="text"
                                inputMode="numeric"
                                enterKeyHint={isLastRow ? 'done' : 'next'}
                                value={
                                  retDraft !== undefined
                                    ? retDraft
                                    : row.returned === 0
                                      ? ''
                                      : String(row.returned)
                                }
                                placeholder="0"
                                onFocus={handleNumericCellFocus}
                                onChange={(e) =>
                                  handleCellChange(row.productId, 'returned', e.target.value)
                                }
                                onBlur={() => commitCellDraft(row.productId, 'returned')}
                                onKeyDown={(e) =>
                                  handleCellKeyDown(e, rowIndex, 'returned', row.productId)
                                }
                                aria-label={`${row.productName} রিটার্ন`}
                                className="font-mono-tabular h-11 w-full bg-transparent px-3 text-right text-[16px] md:text-[15px] font-bold text-amber-800 placeholder:text-slate-400 focus:bg-amber-50/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-700"
                              />
                              {hasReturnWarning && (
                                <div className="pointer-events-none absolute right-2 bottom-0.5 inline-flex items-center gap-1 text-[11px] font-bold text-amber-800">
                                  <AlertTriangle className="h-3 w-3" />
                                  মার্কেটের বেশি নয়
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="font-mono-tabular flex h-11 items-center justify-end px-3 text-[16px] md:text-[15px] font-bold text-amber-800">
                              {formatNumber(row.returned)}
                            </div>
                          )}
                        </td>

                        {/* E: Live Auto Net Sold */}
                        <td className="font-mono-tabular border-r border-slate-200 bg-slate-50/40 px-3 py-2.5 text-right font-bold text-[#0f172a]">
                          {formatNumber(row.soldQty)}
                        </td>

                        {/* F: Live Auto Sales Amount */}
                        <td className="font-mono-tabular border-r border-slate-200 bg-teal-50/35 px-3 py-2.5 text-right font-extrabold text-teal-800">
                          {formatTaka(row.salesAmount)}
                        </td>

                        {/* Remove from this day's sheet (Admin Only, confirms if row has data) */}
                        {isAdmin && (
                          <td className="no-print py-2.5 text-center">
                            {confirmRemoveProductId === row.productId ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRemoveProductFromDay(row.productId);
                                    setConfirmRemoveProductId(null);
                                  }}
                                  className="rounded bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white"
                                >
                                  হ্যাঁ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemoveProductId(null)}
                                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-700"
                                >
                                  না
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => {
                                  if (row.marketOut > 0 || row.returned > 0) {
                                    setConfirmRemoveProductId(row.productId);
                                  } else {
                                    handleRemoveProductFromDay(row.productId);
                                  }
                                }}
                                className="rounded p-1.5 text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
                                title="আজকের হিসাব থেকে সরান"
                                aria-label={`${row.productName} আজকের হিসাব থেকে সরান`}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                    <td className="border-r border-slate-300 py-3.5 text-center text-sm font-bold text-[#1e293b]">
                      Σ
                    </td>
                    <td className="border-r border-slate-300 px-3 py-3.5" colSpan={2}>
                      সর্বমোট ({displayRows.length}টি প্রোডাক্ট · {formatDateBn(selectedDate)})
                    </td>
                    <td className="font-mono-tabular border-r border-slate-300 px-3 py-3.5 text-right">
                      {formatNumber(currentTotals.totalMarketOut)}
                    </td>
                    <td className="font-mono-tabular border-r border-slate-300 px-3 py-3.5 text-right text-amber-800">
                      {formatNumber(currentTotals.totalReturned)}
                    </td>
                    <td className="font-mono-tabular border-r border-slate-300 px-3 py-3.5 text-right">
                      {formatNumber(currentTotals.totalSoldQty)}
                    </td>
                    <td className="font-mono-tabular border-r border-slate-300 px-3 py-3.5 text-right text-lg font-extrabold text-teal-800">
                      {formatTaka(currentTotals.totalSalesAmount)}
                    </td>
                    {isAdmin && <td className="no-print" />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {displayRows.length > 0 && (isAdmin || savedEntry?.note) && (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3.5 sm:px-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                <label
                  htmlFor="daily-note"
                  className="text-sm font-bold text-[#0f172a] whitespace-nowrap"
                >
                  নোট / মন্তব্য:
                </label>
                {isAdmin ? (
                  <input
                    ref={noteInputRef}
                    id="daily-note"
                    type="text"
                    value={savedEntry?.note ?? ''}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleFinalizeDailyEntry();
                      }
                    }}
                    placeholder="যেমন: ডেলিভারি ম্যানের নাম, বাকি বা ক্যাশ সংক্রান্ত নোট..."
                    className="w-full min-h-[44px] sm:min-h-0 max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-[16px] sm:text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                ) : (
                  <span className="text-[15px] font-medium text-[#0f172a]">{savedEntry?.note}</span>
                )}
              </div>
              {isAdmin && (
                <p className="no-print hidden sm:block text-xs font-medium text-slate-600">
                  কিবোর্ড শর্টকাট: <span className="font-bold text-[#0f172a]">Enter / Tab</span> = পরের ঘর ·{' '}
                  <span className="font-bold text-[#0f172a]">Shift+Enter / Shift+Tab</span> = আগের ঘর ·{' '}
                  <span className="font-bold text-[#0f172a]">↑ ↓</span> = উপর-নিচ সারি
                </p>
              )}
            </div>
            {isAdmin && (
              <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center justify-between rounded-lg border border-teal-200/90 bg-teal-50/75 px-3 py-2 text-xs font-bold text-teal-900 sm:hidden">
                  <span>মোট বিক্রি: {formatNumber(currentTotals.totalSoldQty)}</span>
                  <span className="font-mono-tabular text-sm font-extrabold text-teal-800">
                    {formatTaka(currentTotals.totalSalesAmount)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleFinalizeDailyEntry}
                  className="inline-flex min-h-[44px] sm:min-h-0 w-full sm:w-auto items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2.5 sm:py-2 text-sm font-bold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
                >
                  <Check className="h-4 w-4" />
                  {savedNotice ? 'হিসাব আপডেট হয়েছে' : 'সেভ / হিসাব আপডেট'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* SAME-PAGE DAY / MONTH / YEAR SALES LEDGER FOR THIS COMPANY */}
      <section className="rounded-2xl border border-slate-200/85 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
        <div className="space-y-3 border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2.5">
              <History className="h-5 w-5 text-teal-700" />
              <div>
                <h2 className="text-lg font-bold text-[#0f172a]">
                  দিন, মাস ও বছরের সেলস হিসাব — {company.name}
                </h2>
                <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
                  {historyMode === 'day'
                    ? `${formatDateRangeLabelBn(historyDateRange)} · তারিখ অনুযায়ী প্রতিদিনের হিসাব, মাসিক ও বাৎসরিক হিসাব দেখতে পারবেন।`
                    : 'তারিখ অনুযায়ী প্রতিদিনের হিসাব, মাসিক হিসাব ও বাৎসরিক হিসাব এখানেই দেখতে পারবেন।'}
                </p>
              </div>
            </div>

            <div className="no-print flex max-w-full items-center overflow-x-auto no-scrollbar">
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setHistoryMode('day')}
                  className={`min-h-[38px] sm:min-h-0 shrink-0 rounded-md px-3 sm:px-3.5 py-1.5 text-sm font-bold transition-colors whitespace-nowrap ${
                    historyMode === 'day'
                      ? 'bg-white text-[#0f172a] shadow-xs'
                      : 'text-[#1e293b] hover:text-[#0f172a]'
                  }`}
                >
                  প্রতিদিনের হিসাব
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryMode('month')}
                  className={`min-h-[38px] sm:min-h-0 shrink-0 rounded-md px-3 sm:px-3.5 py-1.5 text-sm font-bold transition-colors whitespace-nowrap ${
                    historyMode === 'month'
                      ? 'bg-white text-[#0f172a] shadow-xs'
                      : 'text-[#1e293b] hover:text-[#0f172a]'
                  }`}
                >
                  মাসিক হিসাব
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryMode('year')}
                  className={`min-h-[38px] sm:min-h-0 shrink-0 rounded-md px-3 sm:px-3.5 py-1.5 text-sm font-bold transition-colors whitespace-nowrap ${
                    historyMode === 'year'
                      ? 'bg-white text-[#0f172a] shadow-xs'
                      : 'text-[#1e293b] hover:text-[#0f172a]'
                  }`}
                >
                  বাৎসরিক হিসাব
                </button>
              </div>
            </div>
          </div>

          <DateRangeFilterBar
            value={historyDateRange}
            onChange={(next) => {
              setHistoryDateRange(next);
              if (historyMode !== 'day') setHistoryMode('day');
            }}
            searchQuery={historySearch}
            onSearchChange={setHistorySearch}
            searchPlaceholder="তারিখ, নোট বা সেলস টাকা খুঁজুন..."
          />
        </div>

        {/* Company Day / Month / Year Totals Strip */}
        <div className="grid grid-cols-2 gap-px overflow-hidden border-b border-slate-200 bg-slate-200 lg:grid-cols-4">
          <div className="bg-teal-50/85 px-3.5 py-3 sm:px-5 sm:py-3.5 transition-colors hover:bg-teal-50">
            <p className="text-xs sm:text-sm font-bold text-teal-900">আজকের সেলস (দিন)</p>
            <p className="font-mono-tabular mt-1 text-lg sm:text-2xl font-extrabold text-teal-800">
              {formatTaka(companyPeriodTotals.todaySales)}
            </p>
          </div>
          <div className="bg-white px-3.5 py-3 sm:px-5 sm:py-3.5 transition-colors hover:bg-slate-50/60">
            <p className="text-xs sm:text-sm font-bold text-[#1e293b]">এই মাস ({formatMonthBn(currentMonth)})</p>
            <p className="font-mono-tabular mt-1 text-lg sm:text-2xl font-extrabold text-[#0f172a]">
              {formatTaka(companyPeriodTotals.monthSales)}
            </p>
          </div>
          <div className="bg-white px-3.5 py-3 sm:px-5 sm:py-3.5 transition-colors hover:bg-slate-50/60">
            <p className="text-xs sm:text-sm font-bold text-[#1e293b]">এই বছর ({currentYear})</p>
            <p className="font-mono-tabular mt-1 text-lg sm:text-2xl font-extrabold text-[#0f172a]">
              {formatTaka(companyPeriodTotals.yearSales)}
            </p>
          </div>
          <div className="bg-white px-3.5 py-3 sm:px-5 sm:py-3.5 transition-colors hover:bg-slate-50/60">
            <p className="text-xs sm:text-sm font-bold text-[#1e293b]">সর্বমোট সেলস</p>
            <p className="font-mono-tabular mt-1 text-lg sm:text-2xl font-extrabold text-[#0f172a]">
              {formatTaka(companyPeriodTotals.allTimeSales)}
            </p>
          </div>
        </div>

        {companyHistory.length === 0 ? (
          <div className="px-6 py-10 text-center text-[15px] font-medium text-[#1e293b]">
            এই কোম্পানির জন্য এখনও কোনো দৈনিক সেলস রেকর্ড জমা হয়নি। উপরের এক্সেল টেবিলে মার্কেটে যাওয়া প্রোডাক্ট এন্ট্রি করলেই এখানে প্রতিদিনের, মাসিক ও বাৎসরিক সেলস হিসাব জমা থাকবে।
          </div>
        ) : historyMode === 'day' ? (
          filteredHistory.length === 0 ? (
            <div className="px-6 py-10 text-center text-[15px] font-medium text-[#1e293b]">
              নির্বাচিত তারিখের রেঞ্জ বা সার্চে কোনো সেলস রেকর্ড পাওয়া যায়নি।
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">তারিখ</th>
                  <th className="px-3 py-3.5 text-right">মার্কেটে গেছে</th>
                  <th className="px-3 py-3.5 text-right">রিটার্ন</th>
                  <th className="px-3 py-3.5 text-right">নেট বিক্রি</th>
                  <th className="px-3 py-3.5 text-right">মোট সেলস (৳)</th>
                  <th className="no-print py-3.5 pl-3 pr-5 text-right">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {filteredHistory.map((entry) => {
                  const isActiveDate = entry.date === selectedDate;
                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedDate(entry.date)}
                      className={`cursor-pointer transition-colors ${
                        isActiveDate ? 'bg-teal-50/70' : 'hover:bg-teal-50/35'
                      }`}
                    >
                      <td className="py-3.5 pl-5 pr-3 whitespace-nowrap">
                        <div className="font-bold text-[#0f172a]">
                          {formatDateBn(entry.date)}
                          {entry.date === today && (
                            <span className="ml-2 text-xs font-bold text-teal-800">· আজ</span>
                          )}
                        </div>
                        {entry.note && (
                          <div className="mt-0.5 text-sm font-medium text-[#1e293b] whitespace-normal">{entry.note}</div>
                        )}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-[#1e293b] whitespace-nowrap">
                        {formatNumber(entry.totalMarketOut)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-amber-800 whitespace-nowrap">
                        {formatNumber(entry.totalReturned)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-[#0f172a] whitespace-nowrap">
                        {formatNumber(entry.totalSoldQty)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-extrabold text-teal-800 whitespace-nowrap">
                        {formatTaka(entry.totalSalesAmount)}
                      </td>
                      <td
                        className="no-print py-3.5 pl-3 pr-5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedDate(entry.date)}
                            className="rounded-md px-2.5 py-1 text-sm font-bold text-teal-800 hover:bg-teal-50 whitespace-nowrap"
                          >
                            {isAdmin ? 'দেখুন / এডিট' : 'দেখুন'}
                          </button>
                          {isAdmin && (
                            confirmDeleteHistoryId === entry.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteDailyEntry(entry.id);
                                    setConfirmDeleteHistoryId(null);
                                  }}
                                  className="rounded-md bg-rose-600 px-2 py-1 text-xs font-bold text-white hover:bg-rose-700"
                                >
                                  নিশ্চিত মুছুন
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteHistoryId(null)}
                                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                                >
                                  না
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteHistoryId(entry.id)}
                                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                                title="এই দিনের হিসাব মুছুন"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                  <td className="py-3.5 pl-5 pr-3 whitespace-nowrap">সর্বমোট ({filteredHistory.length} দিন)</td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                    {formatNumber(historyTotals.marketOut)}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right text-amber-800 whitespace-nowrap">
                    {formatNumber(historyTotals.returned)}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                    {formatNumber(historyTotals.soldQty)}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right text-lg font-extrabold text-teal-800 whitespace-nowrap">
                    {formatTaka(historyTotals.salesAmount)}
                  </td>
                  <td className="no-print py-3.5 pl-3 pr-5" />
                </tr>
              </tfoot>
            </table>
          </div>
          )
        ) : historyMode === 'month' ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">মাস ও বছর</th>
                  <th className="px-3 py-3.5 text-right">এন্ট্রি দিন</th>
                  <th className="px-3 py-3.5 text-right">মার্কেটে গেছে</th>
                  <th className="px-3 py-3.5 text-right">রিটার্ন</th>
                  <th className="px-3 py-3.5 text-right">নেট বিক্রি</th>
                  <th className="py-3.5 pl-3 pr-5 text-right">মোট সেলস (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {monthlyAggregates.map((m) => (
                  <tr
                    key={m.monthISO}
                    onClick={() => {
                      const [yStr, mStr] = m.monthISO.split('-');
                      const lastDay = new Date(Number(yStr), Number(mStr), 0).getDate();
                      setHistoryDateRange({
                        preset: 'custom',
                        fromDate: `${m.monthISO}-01`,
                        toDate: `${m.monthISO}-${String(lastDay).padStart(2, '0')}`,
                      });
                      setHistoryMode('day');
                    }}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="py-3.5 pl-5 pr-3 font-bold text-[#0f172a]">
                      {formatMonthBn(m.monthISO)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-[#1e293b]">
                      {m.days} দিন
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-[#1e293b]">
                      {formatNumber(m.marketOut)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-amber-800">
                      {formatNumber(m.returned)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-[#0f172a]">
                      {formatNumber(m.soldQty)}
                    </td>
                    <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right font-extrabold text-teal-800">
                      {formatTaka(m.salesAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">বছর</th>
                  <th className="px-3 py-3.5 text-right">এন্ট্রি দিন</th>
                  <th className="px-3 py-3.5 text-right">মার্কেটে গেছে</th>
                  <th className="px-3 py-3.5 text-right">রিটার্ন</th>
                  <th className="px-3 py-3.5 text-right">নেট বিক্রি</th>
                  <th className="py-3.5 pl-3 pr-5 text-right">মোট সেলস (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {yearlyAggregates.map((yr) => (
                  <tr key={yr.year} className="hover:bg-slate-50">
                    <td className="py-3.5 pl-5 pr-3 font-bold text-[#0f172a]">
                      {yr.year} সাল
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-[#1e293b]">
                      {yr.days} দিন
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-[#1e293b]">
                      {formatNumber(yr.marketOut)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-amber-800">
                      {formatNumber(yr.returned)}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-[#0f172a]">
                      {formatNumber(yr.soldQty)}
                    </td>
                    <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right font-extrabold text-teal-800">
                      {formatTaka(yr.salesAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Company Product-Wise Stock Report (Synced with Daily Sales) */}
      <section
        id="company-stock-report"
        ref={stockReportRef}
        className="rounded-2xl border border-slate-200/85 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]"
      >
        <div className="space-y-3 border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <Package className="mt-1 h-5 w-5 text-teal-700" />
              <div>
                <h2 className="text-lg font-bold text-[#0f172a]">
                  প্রোডাক্ট ভিত্তিক স্টক রিপোর্ট — {company.name}
                </h2>
                <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
                  {formatDateRangeLabelBn(stockDateRange)} · বর্তমান স্টক = পূর্বের স্টক + জমা − সময়কালের বিক্রি · স্টক রেট = সেলস রেট × ০.৯৪ (−৬%)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {isAdmin && companyStockReport.rows.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadCompanyStockCsv}
                  className="no-print inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-[#0f172a] transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  স্টক Excel (CSV)
                </button>
              )}
            </div>
          </div>

          <DateRangeFilterBar
            value={stockDateRange}
            onChange={setStockDateRange}
            searchQuery={stockSearch}
            onSearchChange={setStockSearch}
            searchPlaceholder="প্রোডাক্ট বা ইউনিট খুঁজুন..."
          />
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 gap-px overflow-hidden border-b border-slate-200 bg-slate-200 lg:grid-cols-4">
          <div className="bg-white px-3.5 py-3 sm:px-5 sm:py-3.5 transition-colors hover:bg-slate-50/60">
            <p className="text-xs sm:text-sm font-bold text-[#1e293b]">পূর্বের স্টক</p>
            <p className="font-mono-tabular mt-1 text-lg sm:text-2xl font-extrabold text-[#0f172a]">
              {formatNumber(companyStockReport.totals.openingStock)}
            </p>
          </div>
          <div className="bg-white px-3.5 py-3 sm:px-5 sm:py-3.5 transition-colors hover:bg-slate-50/60">
            <p className="text-xs sm:text-sm font-bold text-[#1e293b]">সময়কালের বিক্রি (− অটো)</p>
            <p className="font-mono-tabular mt-1 text-lg sm:text-2xl font-extrabold text-[#0f172a]">
              {companyStockReport.totals.daySold > 0
                ? `−${formatNumber(companyStockReport.totals.daySold)}`
                : '0'}
            </p>
          </div>
          <div className="bg-white px-3.5 py-3 sm:px-5 sm:py-3.5 transition-colors hover:bg-slate-50/60">
            <p className="text-xs sm:text-sm font-bold text-[#1e293b]">বর্তমান মোট স্টক (পরিমাণ)</p>
            <p className="font-mono-tabular mt-1 text-lg sm:text-2xl font-extrabold text-[#0f172a]">
              {formatNumber(companyStockReport.totals.closingStock)} ({companyStockReport.rows.length}টি)
            </p>
          </div>
          <div className="bg-teal-50/85 px-3.5 py-3 sm:px-5 sm:py-3.5 transition-colors hover:bg-teal-50">
            <p className="text-xs sm:text-sm font-bold text-teal-900">কোম্পানির মোট স্টক টাকা (−৬% রেটে)</p>
            <p className="font-mono-tabular mt-1 text-lg sm:text-2xl font-extrabold text-teal-800">
              {formatTaka(companyStockReport.totals.stockValue)}
            </p>
          </div>
        </div>

        {companyStockReport.rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-[15px] font-medium text-[#1e293b]">
            {products.length === 0
              ? 'এই কোম্পানিতে এখনও কোনো প্রোডাক্ট যোগ করা হয়নি। প্রোডাক্ট যোগ করলে এখানে প্রোডাক্ট ভিত্তিক স্টক রিপোর্ট দেখাবে।'
              : 'এই সার্চে কোনো প্রোডাক্ট পাওয়া যায়নি।'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">প্রোডাক্টের নাম</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">পূর্বের স্টক</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">স্টক জমা (+)</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">দৈনিক বিক্রি (− অটো)</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">বর্তমান স্টক (পরিমাণ)</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">স্টক রেট (−৬%) (৳)</th>
                  <th className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">মোট টাকা (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {companyStockReport.rows.map((r) => (
                  <tr key={r.productId} className="hover:bg-teal-50/35">
                    <td className="py-3.5 pl-5 pr-3">
                      <div className="font-bold text-[#0f172a]">{r.productName}</div>
                      <div className="text-xs font-semibold text-[#1e293b]">ইউনিট: {r.unit}</div>
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-[#1e293b] whitespace-nowrap">
                      {formatNumber(r.openingStock)} {r.unit}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-emerald-700 whitespace-nowrap">
                      {r.dayStockIn > 0 ? `+${formatNumber(r.dayStockIn)}` : '0'}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                      <div className="font-bold text-[#0f172a]">
                        {r.daySold > 0 ? `−${formatNumber(r.daySold)}` : '0'}
                      </div>
                      {r.dayMarketOut > 0 && (
                        <div className="text-xs font-semibold text-[#1e293b]">
                          আউট {formatNumber(r.dayMarketOut)} · রিটার্ন {formatNumber(r.dayReturned)}
                        </div>
                      )}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right font-extrabold text-[#0f172a] whitespace-nowrap">
                      {formatNumber(r.closingStock)} {r.unit}
                    </td>
                    <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                      <div className="font-semibold text-[#1e293b]">{formatTaka(r.rate)}</div>
                      <div className="text-[11px] font-medium text-slate-600">
                        সেলস: {formatTaka(r.salesRate)}
                      </div>
                    </td>
                    <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right font-extrabold text-teal-800 whitespace-nowrap">
                      {formatTaka(r.stockValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                  <td className="py-3.5 pl-5 pr-3 whitespace-nowrap">
                    কোম্পানির মোট ({companyStockReport.rows.length}টি)
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                    {formatNumber(companyStockReport.totals.openingStock)}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right text-emerald-700 whitespace-nowrap">
                    {companyStockReport.totals.dayStockIn > 0
                      ? `+${formatNumber(companyStockReport.totals.dayStockIn)}`
                      : '0'}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                    {companyStockReport.totals.daySold > 0
                      ? `−${formatNumber(companyStockReport.totals.daySold)}`
                      : '0'}
                  </td>
                  <td className="font-mono-tabular px-3 py-3.5 text-right font-extrabold text-[#0f172a] whitespace-nowrap">
                    {formatNumber(companyStockReport.totals.closingStock)}
                  </td>
                  <td className="px-3 py-3.5 text-right text-sm font-bold text-[#1e293b]">—</td>
                  <td className="font-mono-tabular py-3.5 pl-3 pr-5 text-right text-lg font-extrabold text-teal-800 whitespace-nowrap">
                    {formatTaka(companyStockReport.totals.stockValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <PrintSignatureFooter />
    </div>
  );
};
