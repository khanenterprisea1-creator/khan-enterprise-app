import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  Clock,
  Download,
  Package,
  Plus,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { Company, LedgerData, Product, StockMovement } from '../types/ledger';
import {
  computeStockRate,
  downloadStockReportCsv,
  formatDateBn,
  formatNumber,
  formatTaka,
  getTodayISO,
  StockReportCsvRow,
} from '../utils/storage';
import { loadPersistedFilter, savePersistedFilter } from '../utils/salesDrafts';
import { Company1to1Summary } from '../utils/companySummary';
import { CompanyScopeBar } from './CompanyScopeBar';
import {
  computeProductStockSnapshots,
  GODOWN_AGE_ALERT_DAYS,
  LAST_FIVE_STOCK_THRESHOLD,
  loadDefaultMinStock,
  saveDefaultMinStock,
} from '../utils/notifications';
import { PrintLetterhead, PrintSignatureFooter } from './PrintLetterhead';
import {
  createDateRangePreset,
  DateRangeFilterBar,
  DateRangeValue,
  formatDateRangeLabelBn,
  isDateInRange,
} from './DateRangeFilterBar';

export type StockAlertFilterMode = 'all' | 'low_stock' | 'aged_godown';

interface StockReportPageProps {
  data: LedgerData;
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompanyId: (companyId: string) => void;
  oneToOneSummary?: Company1to1Summary | null;
  initialAlertFilter?: StockAlertFilterMode;
  initialCompanyId?: string;
  initialFilterNonce?: number;
  onAddStockMovement: (movement: Omit<StockMovement, 'id' | 'createdAt'>) => void;
  onDeleteStockMovement: (movementId: string) => void;
  onUpdateProductMinStock: (productId: string, minStock?: number) => void;
  onAddCompany: () => void;
  onSelectCompanyWorkspace: (companyId: string) => void;
}

interface ProductStockRow {
  product: Product;
  productId: string;
  companyId: string;
  companyName: string;
  productName: string;
  unit: string;
  rate: number;
  salesRate: number;
  minStockLimit: number;
  hasCustomMinStock: boolean;
  isOutOfStock: boolean;
  isLastFiveOrLess: boolean;
  isLowStock: boolean;
  daysInGodown: number;
  oldestUnsoldStockDate: string | null;
  isAgedInGodown: boolean;
  openingStock: number;
  dayStockIn: number;
  dayMarketOut: number;
  dayReturned: number;
  daySold: number;
  closingStock: number;
  stockValue: number;
}

export const StockReportPage: React.FC<StockReportPageProps> = ({
  data,
  companies,
  selectedCompanyId,
  onSelectCompanyId,
  oneToOneSummary,
  initialAlertFilter,
  initialCompanyId,
  initialFilterNonce,
  onAddStockMovement,
  onDeleteStockMovement,
  onUpdateProductMinStock,
  onAddCompany,
  onSelectCompanyWorkspace,
}) => {
  const selectedCompany =
    companies.find((c) => c.id === selectedCompanyId) ?? companies[0] ?? null;

  const today = getTodayISO();
  const qtyInputRef = useRef<HTMLInputElement | null>(null);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const lastFilterNonceRef = useRef<number | undefined>(undefined);

  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const saved = loadPersistedFilter<DateRangeValue | null>('stock_date_range', null);
    if (saved && saved.preset && saved.fromDate && saved.toDate) {
      return saved;
    }
    return createDateRangePreset('today', today);
  });
  const selectedDate = dateRange.toDate || today;
  const rangeLabel = useMemo(() => formatDateRangeLabelBn(dateRange), [dateRange]);
  const [searchQuery, setSearchQuery] = useState<string>(() =>
    loadPersistedFilter<string>('stock_search', '')
  );
  const [alertFilterMode, setAlertFilterMode] = useState<StockAlertFilterMode>(() => {
    if (initialAlertFilter) return initialAlertFilter;
    const saved = loadPersistedFilter<string>('stock_alert_filter', 'all');
    return saved === 'low_stock' || saved === 'aged_godown' ? saved : 'all';
  });
  const [defaultMinStock, setDefaultMinStock] = useState<number>(() => loadDefaultMinStock());

  // Quick per-product minStock threshold modal
  const [thresholdProduct, setThresholdProduct] = useState<Product | null>(null);
  const [thresholdInput, setThresholdInput] = useState<string>('');

  // Stock entry form state (locked 1-to-1 to selectedCompany)
  const [formProductId, setFormProductId] = useState<string>('');
  const [entryDate, setEntryDate] = useState<string>(today);
  const [quantity, setQuantity] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  useEffect(() => {
    saveDefaultMinStock(defaultMinStock);
  }, [defaultMinStock]);

  useEffect(() => {
    savePersistedFilter('stock_date_range', dateRange);
  }, [dateRange]);

  useEffect(() => {
    savePersistedFilter('stock_search', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    savePersistedFilter('stock_alert_filter', alertFilterMode);
  }, [alertFilterMode]);

  useEffect(() => {
    if (initialFilterNonce === lastFilterNonceRef.current) return;
    lastFilterNonceRef.current = initialFilterNonce;
    if (initialAlertFilter) {
      setAlertFilterMode(initialAlertFilter);
    }
    if (initialCompanyId && initialCompanyId !== selectedCompanyId) {
      onSelectCompanyId(initialCompanyId);
    }
  }, [initialAlertFilter, initialCompanyId, initialFilterNonce, selectedCompanyId, onSelectCompanyId]);

  useEffect(() => {
    if (!thresholdProduct) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setThresholdProduct(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [thresholdProduct]);

  const formCompanyProducts = useMemo(() => {
    if (!selectedCompany) return [];
    return data.products.filter((p) => p.companyId === selectedCompany.id);
  }, [data.products, selectedCompany]);

  // Sync formProductId when formCompanyProducts change
  useEffect(() => {
    if (
      formCompanyProducts.length > 0 &&
      !formCompanyProducts.some((p) => p.id === formProductId)
    ) {
      setFormProductId(formCompanyProducts[0].id);
    } else if (formCompanyProducts.length === 0) {
      setFormProductId('');
    }
  }, [formCompanyProducts, formProductId]);

  // Pre-aggregate all daily sales and stock movements per productId over selected date range
  const productAggregates = useMemo(() => {
    const map = new Map<
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
      let rec = map.get(productId);
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
        map.set(productId, rec);
      }
      return rec;
    };

    const { fromDate, toDate } = dateRange;

    for (const mv of data.stockMovements) {
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

    for (const entry of Object.values(data.entries)) {
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

    return map;
  }, [data.stockMovements, data.entries, dateRange]);

  // Compute FIFO warehouse age snapshots as of selectedDate
  const snapshotMap = useMemo(() => {
    const list = computeProductStockSnapshots(data, selectedDate, defaultMinStock);
    return new Map(list.map((s) => [s.product.id, s]));
  }, [data, selectedDate, defaultMinStock]);

  // Build 1-to-1 selected company stock report (unfiltered by alertFilterMode for alert summary)
  const allCompanyGroups = useMemo(() => {
    if (!selectedCompany) return [];
    const q = searchQuery.trim().toLowerCase();

    return data.companies
      .filter((c) => c.id === selectedCompany.id)
      .map((company) => {
        const products = data.products
          .filter((p) => p.companyId === company.id)
          .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));

        const rows: ProductStockRow[] = products.map((product) => {
          const agg = productAggregates.get(product.id);
          const snap = snapshotMap.get(product.id);
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
          const hasCustomMinStock = product.minStock !== undefined;
          const minStockLimit = hasCustomMinStock ? product.minStock! : defaultMinStock;
          const isOutOfStock = closingStock <= 0;
          const isLastFiveOrLess = closingStock <= LAST_FIVE_STOCK_THRESHOLD;
          const isLowStock =
            isOutOfStock ||
            isLastFiveOrLess ||
            (minStockLimit > 0 && closingStock <= minStockLimit);

          const daysInGodown = closingStock > 0 ? (snap?.daysInGodown ?? 0) : 0;
          const oldestUnsoldStockDate = closingStock > 0 ? (snap?.oldestUnsoldStockDate ?? null) : null;
          const isAgedInGodown = closingStock > 0 && daysInGodown >= GODOWN_AGE_ALERT_DAYS;

          return {
            product,
            productId: product.id,
            companyId: company.id,
            companyName: company.name,
            productName: product.name,
            unit: product.unit,
            rate: stockRate,
            salesRate: product.rate,
            minStockLimit,
            hasCustomMinStock,
            isOutOfStock,
            isLastFiveOrLess,
            isLowStock,
            daysInGodown,
            oldestUnsoldStockDate,
            isAgedInGodown,
            openingStock,
            dayStockIn,
            dayMarketOut: Number((agg?.dayMarketOut ?? 0).toFixed(2)),
            dayReturned: Number((agg?.dayReturned ?? 0).toFixed(2)),
            daySold,
            closingStock,
            stockValue,
          };
        });

        return {
          company,
          rows,
        };
      });
  }, [
    data.companies,
    data.products,
    productAggregates,
    snapshotMap,
    selectedCompany,
    searchQuery,
    defaultMinStock,
  ]);

  const lowStockAlerts = useMemo(() => {
    return allCompanyGroups
      .flatMap((g) => g.rows)
      .filter((r) => r.isLowStock)
      .sort((a, b) => a.closingStock - b.closingStock);
  }, [allCompanyGroups]);

  const agedGodownAlerts = useMemo(() => {
    return allCompanyGroups
      .flatMap((g) => g.rows)
      .filter((r) => r.isAgedInGodown)
      .sort((a, b) => b.daysInGodown - a.daysInGodown);
  }, [allCompanyGroups]);

  const companyGroups = useMemo(() => {
    return allCompanyGroups
      .map(({ company, rows }) => {
        const visibleRows =
          alertFilterMode === 'low_stock'
            ? rows.filter((r) => r.isLowStock)
            : alertFilterMode === 'aged_godown'
              ? rows.filter((r) => r.isAgedInGodown)
              : rows;
        const totals = visibleRows.reduce(
          (acc, r) => {
            acc.openingStock += r.openingStock;
            acc.dayStockIn += r.dayStockIn;
            acc.daySold += r.daySold;
            acc.closingStock += r.closingStock;
            acc.stockValue += r.stockValue;
            if (r.isLowStock) acc.lowCount += 1;
            if (r.isAgedInGodown) acc.agedCount += 1;
            return acc;
          },
          {
            openingStock: 0,
            dayStockIn: 0,
            daySold: 0,
            closingStock: 0,
            stockValue: 0,
            lowCount: 0,
            agedCount: 0,
          }
        );

        return {
          company,
          rows: visibleRows,
          totals: {
            openingStock: Number(totals.openingStock.toFixed(2)),
            dayStockIn: Number(totals.dayStockIn.toFixed(2)),
            daySold: Number(totals.daySold.toFixed(2)),
            closingStock: Number(totals.closingStock.toFixed(2)),
            stockValue: Number(totals.stockValue.toFixed(2)),
            lowCount: totals.lowCount,
            agedCount: totals.agedCount,
          },
        };
      })
      .filter((g) => !(alertFilterMode !== 'all' && g.rows.length === 0));
  }, [allCompanyGroups, alertFilterMode]);

  // Flat rows & overall KPIs
  const flatRows = useMemo(() => {
    return companyGroups.flatMap((g) => g.rows);
  }, [companyGroups]);

  const kpis = useMemo(() => {
    let totalClosingQty = 0;
    let totalStockValue = 0;
    let totalDaySold = 0;
    let totalDayMarketOut = 0;
    let totalDayReturned = 0;
    let totalDayStockIn = 0;

    for (const r of flatRows) {
      totalClosingQty += r.closingStock;
      totalStockValue += r.stockValue;
      totalDaySold += r.daySold;
      totalDayMarketOut += r.dayMarketOut;
      totalDayReturned += r.dayReturned;
      totalDayStockIn += r.dayStockIn;
    }

    return {
      totalProducts: flatRows.length,
      totalClosingQty: Number(totalClosingQty.toFixed(2)),
      totalStockValue: Number(totalStockValue.toFixed(2)),
      totalDaySold: Number(totalDaySold.toFixed(2)),
      totalDayMarketOut: Number(totalDayMarketOut.toFixed(2)),
      totalDayReturned: Number(totalDayReturned.toFixed(2)),
      totalDayStockIn: Number(totalDayStockIn.toFixed(2)),
      lowStockCount: lowStockAlerts.length,
      outOfStockCount: lowStockAlerts.filter((r) => r.isOutOfStock).length,
      agedGodownCount: agedGodownAlerts.length,
    };
  }, [flatRows, lowStockAlerts, agedGodownAlerts]);

  const companyNameMap = useMemo(
    () => new Map(data.companies.map((c) => [c.id, c.name])),
    [data.companies]
  );

  const productMap = useMemo(
    () => new Map(data.products.map((p) => [p.id, p])),
    [data.products]
  );

  // Recent Stock Additions History strictly scoped to selectedCompany, date range & search query
  const stockInHistory = useMemo(() => {
    if (!selectedCompany) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.stockMovements
      .filter((mv) => mv.type === 'stock_in')
      .filter((mv) => mv.companyId === selectedCompany.id)
      .filter((mv) => isDateInRange(mv.date, dateRange))
      .filter((mv) => {
        if (!q) return true;
        const compName = companyNameMap.get(mv.companyId) ?? '';
        const prodName = productMap.get(mv.productId)?.name ?? '';
        const hay = `${compName} ${prodName} ${mv.note ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        if (d !== 0) return d;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [data.stockMovements, selectedCompany, dateRange, searchQuery, companyNameMap, productMap]);

  const handleQuickAddStockForProduct = (_companyId: string, productId: string) => {
    setFormProductId(productId);
    setEntryDate(selectedDate);
    setFormError('');
    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      qtyInputRef.current?.focus();
    }, 250);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) {
      setFormError('অনুগ্রহ করে একটি কোম্পানি সিলেক্ট করুন।');
      return;
    }
    if (!formProductId) {
      setFormError('অনুগ্রহ করে একটি প্রোডাক্ট সিলেক্ট করুন।');
      return;
    }
    const numericQty = Number(quantity);
    if (!Number.isFinite(numericQty) || numericQty <= 0) {
      setFormError('সঠিক পরিমাণ (০ এর বেশি) লিখুন।');
      return;
    }

    onAddStockMovement({
      companyId: selectedCompany.id,
      productId: formProductId,
      date: entryDate,
      type: 'stock_in',
      quantity: Number(numericQty.toFixed(2)),
      note: note.trim() || undefined,
    });

    setQuantity('');
    setNote('');
    setFormError('');
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleExportCsv = () => {
    const csvRows: StockReportCsvRow[] = flatRows.map((r) => ({
      companyName: r.companyName,
      productName: r.productName,
      unit: r.unit,
      rate: r.rate,
      openingStock: r.openingStock,
      dayStockIn: r.dayStockIn,
      daySold: r.daySold,
      closingStock: r.closingStock,
      stockValue: r.stockValue,
    }));
    downloadStockReportCsv(csvRows, selectedDate, selectedCompany?.name);
  };

  const selectedFormProduct = productMap.get(formProductId);

  if (!selectedCompany) {
    return (
      <div className="space-y-6">
        <CompanyScopeBar
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          onSelectCompanyId={onSelectCompanyId}
          onAddCompany={onAddCompany}
          moduleLabel="স্টক রিপোর্ট"
        />
      </div>
    );
  }

  const openThresholdModal = (product: Product) => {
    setThresholdProduct(product);
    setThresholdInput(
      product.minStock !== undefined ? String(product.minStock) : String(defaultMinStock)
    );
  };

  const handleSaveThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    if (!thresholdProduct) return;
    const trimmed = thresholdInput.trim();
    if (trimmed === '') {
      onUpdateProductMinStock(thresholdProduct.id, undefined);
      setThresholdProduct(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    onUpdateProductMinStock(thresholdProduct.id, Number(parsed.toFixed(2)));
    setThresholdProduct(null);
  };

  return (
    <div className="space-y-8">
      <PrintLetterhead
        reportTitle={`${selectedCompany.name} · স্টক রিপোর্ট`}
        reportDate={rangeLabel}
        subtitle={`কোম্পানি: ${selectedCompany.name} · স্টক মূল্য: ${formatTaka(kpis.totalStockValue)}${
          kpis.lowStockCount > 0 ? ` · লো-স্টক সতর্কতা: ${kpis.lowStockCount}টি প্রোডাক্ট` : ''
        }`}
      />

      <CompanyScopeBar
        companies={companies}
        selectedCompanyId={selectedCompany.id}
        onSelectCompanyId={onSelectCompanyId}
        summary={oneToOneSummary}
        onOpenWorkspace={onSelectCompanyWorkspace}
        onAddCompany={onAddCompany}
        moduleLabel="স্টক রিপোর্ট"
      />

      {/* Page Header & Controls */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1e293b]">
            Khan Enterprise · {selectedCompany.name} · স্টক রিপোর্ট · {rangeLabel}
          </p>
          <h1 className="mt-1 text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#0f172a]">
            {selectedCompany.name} — প্রোডাক্ট ভিত্তিক স্টক রিপোর্ট
          </h1>
          <p className="mt-1 text-[15px] font-medium text-[#1e293b]">
            {selectedCompany.name}-এর প্রতিটি প্রোডাক্টের নাম, বর্তমান পরিমাণ (দৈনিক বিক্রি অটো বাদ), স্টক রেট (সেলস রেটের চেয়ে ৬% কম) এবং মোট টাকা।
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={flatRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Excel (CSV)
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            প্রিন্ট
          </button>
        </div>
      </div>

      {/* 3-Column Stock Summary KPI Strip */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="bg-teal-50/70 px-5 py-5 transition-colors hover:bg-teal-50/90">
          <p className="text-sm font-bold text-teal-900">
            পুরো স্টকের মোট টাকা ({selectedCompany.name})
          </p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-teal-800">
            {formatTaka(kpis.totalStockValue)}
          </p>
          <p className="mt-1 text-sm font-medium text-[#1e293b]">
            {kpis.totalProducts}টি প্রোডাক্ট (পরিমাণ × স্টক রেট, −৬%)
          </p>
        </div>

        <div className="px-5 py-5 transition-colors hover:bg-slate-50/70">
          <p className="text-sm font-bold text-[#0f172a]">
            মোট বর্তমান স্টক পরিমাণ ({rangeLabel})
          </p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {formatNumber(kpis.totalClosingQty)}
          </p>
          <p className="font-mono-tabular mt-1 text-sm font-medium text-[#1e293b]">
            এই সময়ে নতুন স্টক জমা: +{formatNumber(kpis.totalDayStockIn)}
          </p>
        </div>

        <div className="px-5 py-5 transition-colors hover:bg-slate-50/70">
          <p className="text-sm font-bold text-[#0f172a]">
            নির্বাচিত সময়ের বিক্রি (স্টক থেকে অটো বাদ)
          </p>
          <p className="font-mono-tabular mt-1.5 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {formatNumber(kpis.totalDaySold)}
          </p>
          <p className="font-mono-tabular mt-1 text-sm font-medium text-[#1e293b]">
            মার্কেট আউট {formatNumber(kpis.totalDayMarketOut)} · রিটার্ন {formatNumber(kpis.totalDayReturned)}
          </p>
        </div>
      </div>

      {/* Low-Stock Alert Banner (Last 5 Cartons / Threshold) */}
      {lowStockAlerts.length > 0 && (
        <section className="rounded-2xl border-2 border-rose-300 bg-gradient-to-br from-rose-50 via-white to-rose-50/70 p-5 shadow-[0_2px_14px_-4px_rgba(225,29,72,0.12)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-rose-950">
                  স্টক সতর্কতা: {lowStockAlerts.length}টি প্রোডাক্ট লাস্ট {LAST_FIVE_STOCK_THRESHOLD} কার্টন বা নির্ধারিত সীমায় রয়েছে
                  {kpis.outOfStockCount > 0 ? ` (${kpis.outOfStockCount}টি স্টক শেষ)` : ''}
                </h2>
                <p className="mt-0.5 text-sm font-semibold text-rose-900/90">
                  লাল চিহ্নিত প্রোডাক্টগুলোর ওপর ক্লিক করে দ্রুত নতুন স্টক জমা দিন অথবা প্রতিটি প্রোডাক্টের সীমা কাস্টমাইজ করুন।
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setAlertFilterMode((m) => (m === 'low_stock' ? 'all' : 'low_stock'))
              }
              className={`no-print inline-flex items-center gap-1.5 self-start rounded-xl border px-3.5 py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                alertFilterMode === 'low_stock'
                  ? 'border-rose-800 bg-rose-700 text-white'
                  : 'border-rose-400 bg-white text-rose-800 hover:bg-rose-50'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              {alertFilterMode === 'low_stock'
                ? 'সব প্রোডাক্ট দেখুন'
                : `শুধু লো-স্টক দেখুন (${lowStockAlerts.length})`}
            </button>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2">
            {lowStockAlerts.map((r) => (
              <button
                key={r.productId}
                type="button"
                onClick={() => handleQuickAddStockForProduct(r.companyId, r.productId)}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-left text-xs font-bold text-[#0f172a] shadow-2xs transition-colors hover:border-rose-500 hover:bg-rose-50"
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-extrabold ${
                    r.isOutOfStock
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-100 text-rose-900 border border-rose-300'
                  }`}
                >
                  {r.isOutOfStock
                    ? 'স্টক শেষ'
                    : r.isLastFiveOrLess
                      ? `লাস্ট ${LAST_FIVE_STOCK_THRESHOLD}`
                      : 'লো স্টক'}
                </span>
                <span>{r.productName}</span>
                <span className="font-mono-tabular text-rose-700">
                  ({formatNumber(r.closingStock)} / সীমা {formatNumber(r.minStockLimit)} {r.unit})
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 1+ Month Godown Aging Alert Banner */}
      {agedGodownAlerts.length > 0 && (
        <section className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-amber-50/70 p-5 shadow-[0_2px_14px_-4px_rgba(217,119,6,0.12)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-amber-950">
                  গুদাম বয়স সতর্কতা: {agedGodownAlerts.length}টি প্রোডাক্ট ১ মাসের বেশি ({GODOWN_AGE_ALERT_DAYS}+ দিন) গুদামে পড়ে আছে
                </h2>
                <p className="mt-0.5 text-sm font-semibold text-amber-900/90">
                  এই প্রোডাক্টগুলো দীর্ঘদিন অবিক্রিত রয়েছে — দ্রুত মার্কেটিং বা ডিসকাউন্টে ছাড়ার ব্যবস্থা নিন।
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setAlertFilterMode((m) => (m === 'aged_godown' ? 'all' : 'aged_godown'))
              }
              className={`no-print inline-flex items-center gap-1.5 self-start rounded-xl border px-3.5 py-2 text-sm font-bold transition-colors whitespace-nowrap ${
                alertFilterMode === 'aged_godown'
                  ? 'border-amber-800 bg-amber-700 text-white'
                  : 'border-amber-400 bg-white text-amber-900 hover:bg-amber-50'
              }`}
            >
              <Clock className="h-4 w-4" />
              {alertFilterMode === 'aged_godown'
                ? 'সব প্রোডাক্ট দেখুন'
                : `১ মাসের+ গুদামের পণ্য (${agedGodownAlerts.length})`}
            </button>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2">
            {agedGodownAlerts.map((r) => (
              <div
                key={`aged_${r.productId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-[#0f172a] shadow-2xs"
              >
                <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-950">
                  {formatNumber(r.daysInGodown)} দিন গুদামে
                </span>
                <span>{r.productName}</span>
                <span className="font-mono-tabular text-amber-800">
                  ({formatNumber(r.closingStock)} {r.unit} · {formatTaka(r.stockValue)})
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unified Date Range, Company, Threshold & Product Search Filter Bar */}
      <div className="space-y-2.5">
        <DateRangeFilterBar
          value={dateRange}
          onChange={setDateRange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="প্রোডাক্ট বা নোট খুঁজুন..."
          extraControls={
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-[#0f172a]">
                <span>ডিফল্ট সতর্কতা সীমা:</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={defaultMinStock}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0) setDefaultMinStock(n);
                  }}
                  aria-label="ডিফল্ট সর্বনিম্ন স্টক সীমা"
                  className="font-mono-tabular w-14 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-center text-sm font-bold text-[#0f172a] focus:border-teal-600 focus:outline-none"
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  setAlertFilterMode((m) => (m === 'low_stock' ? 'all' : 'low_stock'))
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors whitespace-nowrap ${
                  alertFilterMode === 'low_stock'
                    ? 'border-rose-700 bg-rose-600 text-white'
                    : lowStockAlerts.length > 0
                      ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                      : 'border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                লো-স্টক ({lowStockAlerts.length})
              </button>

              <button
                type="button"
                onClick={() =>
                  setAlertFilterMode((m) => (m === 'aged_godown' ? 'all' : 'aged_godown'))
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors whitespace-nowrap ${
                  alertFilterMode === 'aged_godown'
                    ? 'border-amber-700 bg-amber-600 text-white'
                    : agedGodownAlerts.length > 0
                      ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                      : 'border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                ১ মাসের+ গুদামে ({agedGodownAlerts.length})
              </button>

              {(alertFilterMode !== 'all' || searchQuery.trim() !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setAlertFilterMode('all');
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  রিসেট
                </button>
              )}
            </div>
          }
        />
        <p className="px-1 text-sm font-medium text-[#1e293b]">
          হিসাব ({rangeLabel}): <span className="font-bold text-[#0f172a]">বর্তমান স্টক = পূর্বের স্টক + সময়ের জমা − সময়ের বিক্রি</span> · <span className="font-bold text-[#0f172a]">স্টক রেট = সেলস রেট × ০.৯৪ (−৬%)</span> · <span className="font-bold text-[#0f172a]">মোট টাকা = পরিমাণ × স্টক রেট</span>
        </p>
      </div>

      {/* Company-wise Product Stock Report Sections */}
      <div className="space-y-6">
        {companyGroups.length === 0 && alertFilterMode !== 'all' ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
            <p className="text-base font-bold text-[#0f172a]">
              {alertFilterMode === 'aged_godown'
                ? 'কোনো প্রোডাক্ট ১ মাসের বেশি গুদামে জমে নেই।'
                : 'কোনো প্রোডাক্ট নির্ধারিত স্টক সীমার নিচে নেই।'}
            </p>
            <button
              type="button"
              onClick={() => setAlertFilterMode('all')}
              className="mt-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50"
            >
              সব প্রোডাক্ট দেখুন
            </button>
          </div>
        ) : (
          companyGroups.map(({ company, rows, totals }) => (
          <section key={company.id} className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-[#0f172a]">{company.name}</h2>
                  {totals.lowCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-xs font-extrabold text-rose-900">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {totals.lowCount}টি লো-স্টক
                    </span>
                  )}
                  {totals.agedCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-950">
                      <Clock className="h-3.5 w-3.5" />
                      {totals.agedCount}টি ১ মাসের+ গুদামে
                    </span>
                  )}
                </div>
                <p className="font-mono-tabular mt-0.5 text-sm font-medium text-[#1e293b]">
                  {rows.length}টি প্রোডাক্ট · মোট পরিমাণ: {formatNumber(totals.closingStock)} · কোম্পানির স্টক মূল্য:{' '}
                  <span className="font-bold text-teal-800">{formatTaka(totals.stockValue)}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => onSelectCompanyWorkspace(company.id)}
                className="no-print inline-flex items-center gap-1 self-start rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
              >
                দৈনিক সেলস শিট খুলুন
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="px-6 py-10 text-center text-[15px] font-medium text-[#1e293b]">
                {searchQuery.trim()
                  ? `এই কোম্পানিতে “${searchQuery}” নামে কোনো প্রোডাক্ট পাওয়া যায়নি।`
                  : 'এই কোম্পানিতে এখনও কোনো প্রোডাক্ট যোগ করা হয়নি।'}
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
                      <th className="px-3 py-3.5 text-right whitespace-nowrap">বর্তমান স্টক ও সতর্কতা</th>
                      <th className="px-3 py-3.5 text-right whitespace-nowrap">স্টক রেট (−৬%) (৳)</th>
                      <th className="px-3 py-3.5 text-right whitespace-nowrap">মোট টাকা (৳)</th>
                      <th className="no-print py-3.5 pl-3 pr-5 text-right whitespace-nowrap">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80">
                    {rows.map((r) => (
                      <tr
                        key={r.productId}
                        className={
                          r.isLowStock
                            ? 'border-l-4 border-l-rose-600 bg-rose-50/85 hover:bg-rose-100/75'
                            : r.isAgedInGodown
                              ? 'border-l-4 border-l-amber-500 bg-amber-50/70 hover:bg-amber-100/60'
                              : 'hover:bg-teal-50/45'
                        }
                      >
                        <td className="py-3.5 pl-5 pr-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-[#0f172a]">{r.productName}</span>
                            {r.isOutOfStock ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white shadow-2xs">
                                <AlertTriangle className="h-3 w-3" />
                                স্টক শেষ
                              </span>
                            ) : r.isLowStock ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-xs font-extrabold text-rose-900">
                                <AlertTriangle className="h-3 w-3" />
                                {r.isLastFiveOrLess ? `লাস্ট ${LAST_FIVE_STOCK_THRESHOLD} সীমা` : 'লো স্টক'}
                              </span>
                            ) : null}
                            {r.isAgedInGodown && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-950">
                                <Clock className="h-3 w-3" />
                                {formatNumber(r.daysInGodown)} দিন গুদামে
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-medium text-[#1e293b]">
                            <span>ইউনিট: {r.unit}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular text-xs font-semibold text-slate-700">
                              সতর্কতা সীমা: {formatNumber(r.minStockLimit)} {r.unit}
                              {r.hasCustomMinStock ? ' (কাস্টম)' : ' (ডিফল্ট)'}
                            </span>
                            {r.oldestUnsoldStockDate && r.closingStock > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-xs font-semibold text-slate-700">
                                  গুদামে জমার তারিখ: {formatDateBn(r.oldestUnsoldStockDate)}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="font-mono-tabular px-3 py-3.5 text-right font-medium text-[#0f172a] whitespace-nowrap">
                          {formatNumber(r.openingStock)} {r.unit}
                        </td>
                        <td className="font-mono-tabular px-3 py-3.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {r.dayStockIn > 0 ? `+${formatNumber(r.dayStockIn)}` : '0'}
                        </td>
                        <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                          <div className="font-semibold text-[#0f172a]">
                            {r.daySold > 0 ? `−${formatNumber(r.daySold)}` : '0'}
                          </div>
                          {r.dayMarketOut > 0 && (
                            <div className="text-xs font-medium text-[#1e293b]">
                              আউট {formatNumber(r.dayMarketOut)} · রিটার্ন {formatNumber(r.dayReturned)}
                            </div>
                          )}
                        </td>
                        <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                          <div
                            className={`font-extrabold ${
                              r.isLowStock ? 'text-rose-700' : 'text-[#0f172a]'
                            }`}
                          >
                            {formatNumber(r.closingStock)} {r.unit}
                          </div>
                          {r.isLowStock && (
                            <div className="mt-0.5 text-xs font-bold text-rose-700">
                              {r.isOutOfStock
                                ? 'জরুরি স্টক প্রয়োজন!'
                                : r.isLastFiveOrLess
                                  ? `মাত্র ${formatNumber(r.closingStock)} ${r.unit} বাকি!`
                                  : `সীমা ${formatNumber(r.minStockLimit)} বা তার নিচে`}
                            </div>
                          )}
                        </td>
                        <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                          <div className="font-semibold text-[#0f172a]">{formatTaka(r.rate)}</div>
                          <div className="text-[11px] font-medium text-slate-600">
                            সেলস: {formatTaka(r.salesRate)}
                          </div>
                        </td>
                        <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-teal-800 whitespace-nowrap">
                          {formatTaka(r.stockValue)}
                        </td>
                        <td className="no-print py-3.5 pl-3 pr-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openThresholdModal(r.product)}
                              title="সর্বনিম্ন স্টক সীমা নির্ধারণ"
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-600" />
                              সীমা
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAddStockForProduct(r.companyId, r.productId)}
                              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap ${
                                r.isLowStock
                                  ? 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700'
                                  : 'border-slate-300 bg-white text-teal-800 hover:border-teal-600 hover:bg-teal-50'
                              }`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              স্টক যোগ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                      <td className="py-3.5 pl-5 pr-3 whitespace-nowrap">কোম্পানির মোট ({rows.length}টি)</td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                        {formatNumber(totals.openingStock)}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right text-emerald-800 whitespace-nowrap">
                        {totals.dayStockIn > 0 ? `+${formatNumber(totals.dayStockIn)}` : '0'}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right whitespace-nowrap">
                        {totals.daySold > 0 ? `−${formatNumber(totals.daySold)}` : '0'}
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right font-extrabold text-[#0f172a] whitespace-nowrap">
                        {formatNumber(totals.closingStock)}
                      </td>
                      <td className="px-3 py-3.5 text-right text-sm font-medium text-[#1e293b]">—</td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right text-base font-extrabold text-teal-800 whitespace-nowrap">
                        {formatTaka(totals.stockValue)}
                      </td>
                      <td className="no-print" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
          ))
        )}

        {/* Whole Stock Grand Total Bar */}
        {flatRows.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-300 bg-[#0f2942] px-6 py-4.5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-200">
                {selectedCompany.name} · সকল প্রোডাক্ট মিলে
              </p>
              <p className="text-lg font-bold">মোট স্টকের হিসাব ({selectedCompany.name})</p>
            </div>
            <div className="flex flex-wrap items-center gap-6 sm:gap-10">
              <div>
                <p className="text-sm font-medium text-slate-200">মোট পরিমাণ</p>
                <p className="font-mono-tabular text-xl font-bold">
                  {formatNumber(kpis.totalClosingQty)} ({kpis.totalProducts}টি প্রোডাক্ট)
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-sm font-medium text-slate-200">সর্বমোট স্টক টাকা</p>
                <p className="font-mono-tabular text-2xl font-extrabold text-teal-300">
                  {formatTaka(kpis.totalStockValue)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stock Entry Form + Stock Additions History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Add Stock Entry Form */}
        <section
          ref={formSectionRef}
          id="stock-entry-form"
          className="no-print rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] lg:col-span-5"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-teal-700" />
              <h2 className="text-lg font-bold text-[#0f172a]">নতুন স্টক জমা এন্ট্রি</h2>
            </div>
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                <Check className="h-4 w-4" />
                সেভ হয়েছে
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            <div>
              <span className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                নির্বাচিত কোম্পানি (১-টু-১ লক)
              </span>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3.5 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 shrink-0 text-[#1E3A8A]" />
                  <span className="truncate text-[15px] font-extrabold text-[#1E3A8A]">
                    {selectedCompany.name}
                  </span>
                </div>
                <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-bold text-[#1E3A8A] border border-blue-200">
                  ১-টু-১
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="stk-product"
                className="mb-1.5 block text-sm font-bold text-[#0f172a]"
              >
                প্রোডাক্ট সিলেক্ট করুন <span className="text-rose-600">*</span>
              </label>
              {formCompanyProducts.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-[#1e293b]">
                  এই কোম্পানিতে এখনও কোনো প্রোডাক্ট নেই।{' '}
                  <button
                    type="button"
                    onClick={() => onSelectCompanyWorkspace(selectedCompany.id)}
                    className="font-bold text-teal-700 underline"
                  >
                    প্রোডাক্ট যোগ করুন
                  </button>
                </div>
              ) : (
                <select
                  id="stk-product"
                  value={formProductId}
                  onChange={(e) => {
                    setFormProductId(e.target.value);
                    if (formError) setFormError('');
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                >
                  {formCompanyProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit} · {formatTaka(p.rate)})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="stk-qty"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  পরিমাণ ({selectedFormProduct?.unit ?? 'ইউনিট'}) <span className="text-rose-600">*</span>
                </label>
                <input
                  ref={qtyInputRef}
                  id="stk-qty"
                  type="number"
                  min="0"
                  step="any"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="0"
                  className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              <div>
                <label
                  htmlFor="stk-date"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  তারিখ
                </label>
                <input
                  id="stk-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => {
                    if (e.target.value) setEntryDate(e.target.value);
                  }}
                  className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[15px] font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="stk-note" className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                মন্তব্য / চালান নং (ঐচ্ছিক)
              </label>
              <input
                id="stk-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="যেমন: চালান #CH-১২৫ / প্রারম্ভিক স্টক"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
              />
            </div>

            {formError && <p className="text-sm font-semibold text-rose-600">{formError}</p>}

            <button
              type="submit"
              disabled={!formProductId}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              স্টক জমা সেভ করুন
            </button>
          </form>
        </section>

        {/* Right: Stock Additions History */}
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] lg:col-span-7">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#0f172a]">
                স্টক জমার ইতিহাস ({stockInHistory.length})
              </h2>
              <p className="text-sm font-medium text-[#1e293b]">
                আগে যোগ করা প্রোডাক্ট স্টকের তালিকা।
              </p>
            </div>
          </div>

          {stockInHistory.length === 0 ? (
            <div className="px-6 py-14 text-center text-[15px] font-medium text-[#1e293b]">
              এখনও কোনো স্টক জমা এন্ট্রি করা হয়নি। বাম পাশের ফর্ম থেকে প্রোডাক্টের স্টক যোগ করুন।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                    <th className="py-3.5 pl-5 pr-3">তারিখ ও কোম্পানি</th>
                    <th className="px-3 py-3.5">প্রোডাক্ট ও বিবরণ</th>
                    <th className="px-3 py-3.5 text-right">জমা পরিমাণ</th>
                    <th className="no-print py-3.5 pl-3 pr-5 text-right">মুছুন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {stockInHistory.map((mv) => {
                    const compName = companyNameMap.get(mv.companyId) ?? 'অজানা কোম্পানি';
                    const prod = productMap.get(mv.productId);

                    return (
                      <tr key={mv.id} className="hover:bg-slate-50/70">
                        <td className="py-3.5 pl-5 pr-3">
                          <div className="font-semibold text-[#0f172a]">{compName}</div>
                          <div className="font-mono-tabular text-sm font-medium text-[#1e293b]">
                            {formatDateBn(mv.date)}
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="font-semibold text-[#0f172a]">
                            {prod?.name ?? 'মুছে ফেলা প্রোডাক্ট'}
                          </div>
                          <div className="text-sm font-medium text-[#1e293b]">
                            {mv.note ? mv.note : 'স্টক জমা'}
                          </div>
                        </td>
                        <td className="font-mono-tabular px-3 py-3.5 text-right font-bold text-emerald-700">
                          + {formatNumber(mv.quantity)} {prod?.unit ?? ''}
                        </td>
                        <td className="no-print py-3.5 pl-3 pr-5 text-right">
                          <button
                            type="button"
                            onClick={() => onDeleteStockMovement(mv.id)}
                            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                            title="মুছে ফেলুন"
                            aria-label="স্টক এন্ট্রি মুছুন"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Quick Per-Product Minimum Stock Threshold Modal */}
      {thresholdProduct && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="threshold-modal-title"
          onClick={() => setThresholdProduct(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/85 bg-white shadow-[0_20px_50px_-12px_rgba(15,41,66,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 id="threshold-modal-title" className="text-lg font-bold text-[#0f172a]">
                  সর্বনিম্ন স্টক সতর্কতা সীমা সেট করুন
                </h2>
                <p className="text-sm font-semibold text-teal-800">
                  {thresholdProduct.name} ({thresholdProduct.unit})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setThresholdProduct(null)}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="বন্ধ করুন"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveThreshold} className="space-y-4 px-6 py-5">
              <div>
                <label
                  htmlFor="custom-min-stock"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  সর্বনিম্ন স্টক সীমা ({thresholdProduct.unit})
                </label>
                <input
                  id="custom-min-stock"
                  type="number"
                  min="0"
                  step="any"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  placeholder={`ডিফল্ট (${defaultMinStock})`}
                  className="font-mono-tabular w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] font-bold text-[#0f172a] focus:border-teal-600 focus:outline-none"
                  autoFocus
                />
                <p className="mt-1.5 text-xs font-medium text-[#1e293b]">
                  স্টক এই সংখ্যার নিচে নামলে প্রোডাক্টটি লাল ব্যাজ ও সতর্কতা তালিকায় হাইলাইট হবে। ফাঁকা রাখলে ডিফল্ট সীমা ({defaultMinStock}) প্রযোজ্য হবে।
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateProductMinStock(thresholdProduct.id, undefined);
                    setThresholdProduct(null);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-[#1e293b] hover:bg-slate-50"
                >
                  ডিফল্টে ফিরিয়ে নিন
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setThresholdProduct(null)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50"
                  >
                    বাতিল
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    সীমা সেভ করুন
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <PrintSignatureFooter />
    </div>
  );
};
