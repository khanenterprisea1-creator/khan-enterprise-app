import { DailyLineItem } from '../types/ledger';

const DRAFTS_STORAGE_KEY = 'khan_enterprise_sales_drafts_v1';
const COMPANY_DATES_STORAGE_KEY = 'khan_enterprise_company_dates_v1';
const ACTIVE_VIEW_STORAGE_KEY = 'khan_enterprise_active_view_v1';
const SELECTED_MODULE_COMPANY_KEY = 'khan_enterprise_selected_module_company_v1';
const LAST_COMPANY_WORKSPACE_KEY = 'khan_enterprise_last_company_workspace_v1';
const PAGE_FILTERS_STORAGE_KEY = 'khan_enterprise_page_filters_v1';

export interface SalesSheetDraft {
  companyId: string;
  date: string; // YYYY-MM-DD
  items: DailyLineItem[];
  note: string;
  draftCells: Record<string, string>;
  updatedAt: string; // ISO timestamp
}

export function getSalesDraftKey(companyId: string, date: string): string {
  return `${companyId}_${date}`;
}

export function loadAllSalesDrafts(): Record<string, SalesSheetDraft> {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, SalesSheetDraft>;
  } catch {
    return {};
  }
}

export function loadSalesDraft(companyId: string, date: string): SalesSheetDraft | null {
  const all = loadAllSalesDrafts();
  const key = getSalesDraftKey(companyId, date);
  const draft = all[key];
  if (!draft || draft.companyId !== companyId || draft.date !== date) {
    return null;
  }
  return draft;
}

export function getCompanySalesDrafts(companyId: string): SalesSheetDraft[] {
  const all = loadAllSalesDrafts();
  return Object.values(all)
    .filter((d) => d && d.companyId === companyId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveSalesDraft(draft: SalesSheetDraft): void {
  try {
    const all = loadAllSalesDrafts();
    const key = getSalesDraftKey(draft.companyId, draft.date);
    all[key] = draft;
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to persist sales draft:', err);
  }
}

export function clearSalesDraft(companyId: string, date: string): void {
  try {
    const all = loadAllSalesDrafts();
    const key = getSalesDraftKey(companyId, date);
    if (key in all) {
      delete all[key];
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(all));
    }
  } catch (err) {
    console.error('Failed to clear sales draft:', err);
  }
}

export function clearAllSalesDrafts(): void {
  try {
    localStorage.removeItem(DRAFTS_STORAGE_KEY);
    localStorage.removeItem(COMPANY_DATES_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function loadLastCompanyDate(companyId: string): string | null {
  try {
    const raw = localStorage.getItem(COMPANY_DATES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const val = parsed?.[companyId];
    return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null;
  } catch {
    return null;
  }
}

export function saveLastCompanyDate(companyId: string, date: string): void {
  try {
    const raw = localStorage.getItem(COMPANY_DATES_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const next = parsed && typeof parsed === 'object' ? parsed : {};
    next[companyId] = date;
    localStorage.setItem(COMPANY_DATES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function loadLastActiveViewJson(): string | null {
  try {
    return localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLastActiveViewJson(serializedView: string): void {
  try {
    localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, serializedView);
  } catch {
    // ignore storage errors
  }
}

export function loadSelectedModuleCompanyId(): string {
  try {
    return localStorage.getItem(SELECTED_MODULE_COMPANY_KEY) || '';
  } catch {
    return '';
  }
}

export function saveSelectedModuleCompanyId(companyId: string): void {
  try {
    if (companyId) {
      localStorage.setItem(SELECTED_MODULE_COMPANY_KEY, companyId);
    } else {
      localStorage.removeItem(SELECTED_MODULE_COMPANY_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function loadLastCompanyWorkspaceId(): string {
  try {
    return localStorage.getItem(LAST_COMPANY_WORKSPACE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveLastCompanyWorkspaceId(companyId: string): void {
  try {
    if (companyId) {
      localStorage.setItem(LAST_COMPANY_WORKSPACE_KEY, companyId);
    } else {
      localStorage.removeItem(LAST_COMPANY_WORKSPACE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function loadPersistedFilter<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PAGE_FILTERS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || !(key in parsed)) {
      return fallback;
    }
    return parsed[key] as T;
  } catch {
    return fallback;
  }
}

export function savePersistedFilter<T>(key: string, value: T): void {
  try {
    const raw = localStorage.getItem(PAGE_FILTERS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const next = parsed && typeof parsed === 'object' ? parsed : {};
    next[key] = value;
    localStorage.setItem(PAGE_FILTERS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

