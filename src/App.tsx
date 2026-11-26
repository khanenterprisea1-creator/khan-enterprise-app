import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  Clock,
  Database,
  FileSpreadsheet,
  Home,
  KeyRound,
  LogOut,
  Package,
  Plus,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  AuthSession,
  CashTransaction,
  Company,
  CompanyLedgerEntry,
  Customer,
  CustomerCreditEntry,
  DailyEntry,
  LedgerData,
  Product,
  StockMovement,
} from './types/ledger';
import {
  computeLineItem,
  DEMO_COMPANY_IDS,
  downloadAllInOneExcelCsv,
  emptyLedgerData,
  generateId,
  getCloudSyncStatus,
  getEntryKey,
  getTodayISO,
  hasDemoLedgerData,
  loadCachedLedgerData,
  loadLedgerData,
  mergeSampleLedgerData,
  removeDemoLedgerData,
  saveLedgerData,
  subscribeCloudSyncStatus,
  summarizeEntry,
  type CloudSyncStatus,
} from './utils/storage';
import { isSupabaseConfigured, supabase } from './utils/supabase';
import type { Session } from '@supabase/supabase-js';
import {
  buildStockNotifications,
  LAST_FIVE_STOCK_THRESHOLD,
  loadReadNotificationSignatures,
  saveReadNotificationSignatures,
} from './utils/notifications';
import {
  clearAllSalesDrafts,
  loadLastActiveViewJson,
  loadLastCompanyWorkspaceId,
  loadSelectedModuleCompanyId,
  saveLastActiveViewJson,
  saveLastCompanyWorkspaceId,
  saveSelectedModuleCompanyId,
} from './utils/salesDrafts';
import {
  clearAuthSession,
  hashPassword,
  loadAuthSession,
  saveAuthSession,
} from './utils/auth';
import {
  buildScopedLedgerData,
  computeCompany1to1Summary,
  countUnassignedOrphans,
} from './utils/companySummary';
import { AllCompaniesOverview } from './components/AllCompaniesOverview';
import { CompanyWorkspace } from './components/CompanyWorkspace';
import { DailySummaryView } from './components/DailySummaryView';
import { CashExpensePage } from './components/CashExpensePage';
import { ProfitLossPage } from './components/ProfitLossPage';
import { CompanyLedgerPage } from './components/CompanyLedgerPage';
import { StockAlertFilterMode, StockReportPage } from './components/StockReportPage';
import { CustomerCreditPage } from './components/CustomerCreditPage';
import { AuthGate } from './components/AuthGate';
import { CloudSetupNotice, CloudSignIn, CloudSyncBanner } from './components/CloudSignIn';
import { SecurityModal } from './components/SecurityModal';
import { CompanyModal, CompanySavePayload } from './components/CompanyModal';
import { ProductModal } from './components/ProductModal';
import { BackupModal } from './components/BackupModal';
import { SRSecurityShield } from './components/SRSecurityShield';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { BrandLogo } from './components/BrandLogo';
import { CompanyLogoAvatar } from './components/CompanyLogoAvatar';
import { ProfilePage } from './components/ProfilePage';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import {
  ChalanVerifyNotesPage,
  CompanyProfileMetaUpdate,
} from './components/ChalanVerifyNotesPage';

type ActiveView =
  | { type: 'overview' }
  | { type: 'stock'; alertFilter?: StockAlertFilterMode; companyId?: string; filterNonce?: number }
  | { type: 'company_ledger' }
  | { type: 'customer_credit' }
  | { type: 'cash' }
  | { type: 'profit_loss' }
  | { type: 'summary' }
  | { type: 'chalan_verify' }
  | { type: 'company'; companyId: string };

export default function App() {
  // Ledger data starts empty and is loaded from the cloud (or the offline
  // cache) once the cloud gate is open — see the load effect below.
  const [data, setData] = useState<LedgerData>(() => emptyLedgerData());
  const [dataLoaded, setDataLoaded] = useState(false);
  const [cloudSession, setCloudSession] = useState<Session | null>(null);
  const [cloudChecked, setCloudChecked] = useState(false);
  const [continueOffline, setContinueOffline] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(() =>
    getCloudSyncStatus()
  );
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    try {
      const raw = loadLastActiveViewJson();
      if (!raw) return { type: 'overview' };
      const parsed = JSON.parse(raw) as ActiveView;
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        if (parsed.type === 'company') {
          const initialData = loadCachedLedgerData();
          if (initialData.companies.some((c) => c.id === parsed.companyId)) {
            return parsed;
          }
          return { type: 'overview' };
        }
        if (
          parsed.type === 'overview' ||
          parsed.type === 'stock' ||
          parsed.type === 'company_ledger' ||
          parsed.type === 'customer_credit' ||
          parsed.type === 'cash' ||
          parsed.type === 'profit_loss' ||
          parsed.type === 'summary' ||
          parsed.type === 'chalan_verify'
        ) {
          return parsed;
        }
      }
    } catch {
      // ignore invalid stored view
    }
    return { type: 'overview' };
  });

  const [selectedModuleCompanyId, setSelectedModuleCompanyId] = useState<string>(() => {
    const saved = loadSelectedModuleCompanyId();
    if (saved && data.companies.some((c) => c.id === saved)) {
      return saved;
    }
    return data.companies[0]?.id ?? '';
  });

  const [lastVisitedCompanyId, setLastVisitedCompanyId] = useState<string>(() => {
    const saved = loadLastCompanyWorkspaceId();
    if (saved && data.companies.some((c) => c.id === saved)) {
      return saved;
    }
    const savedModule = loadSelectedModuleCompanyId();
    if (savedModule && data.companies.some((c) => c.id === savedModule)) {
      return savedModule;
    }
    return data.companies[0]?.id ?? '';
  });

  useEffect(() => {
    if (session?.role === 'admin') {
      saveLastActiveViewJson(JSON.stringify(activeView));
    }
  }, [activeView, session?.role]);

  useEffect(() => {
    if (session?.role === 'admin' && selectedModuleCompanyId) {
      saveSelectedModuleCompanyId(selectedModuleCompanyId);
    }
  }, [selectedModuleCompanyId, session?.role]);

  useEffect(() => {
    if (session?.role === 'admin' && lastVisitedCompanyId) {
      saveLastCompanyWorkspaceId(lastVisitedCompanyId);
    }
  }, [lastVisitedCompanyId, session?.role]);

  // Keep selectedModuleCompanyId & lastVisitedCompanyId aligned to valid companies
  useEffect(() => {
    if (data.companies.length === 0) {
      if (selectedModuleCompanyId !== '') setSelectedModuleCompanyId('');
      if (lastVisitedCompanyId !== '') setLastVisitedCompanyId('');
      return;
    }
    if (!data.companies.some((c) => c.id === selectedModuleCompanyId)) {
      setSelectedModuleCompanyId(data.companies[0].id);
    }
    if (!data.companies.some((c) => c.id === lastVisitedCompanyId)) {
      setLastVisitedCompanyId(data.companies[0].id);
    }
  }, [data.companies, selectedModuleCompanyId, lastVisitedCompanyId]);

  // Sync selectedModuleCompanyId and lastVisitedCompanyId when opening a company workspace
  useEffect(() => {
    if (activeView.type === 'company' && activeView.companyId) {
      setSelectedModuleCompanyId(activeView.companyId);
      setLastVisitedCompanyId(activeView.companyId);
    }
  }, [activeView]);

  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [viewingPublicHome, setViewingPublicHome] = useState(false);
  const [readNotificationSignatures, setReadNotificationSignatures] = useState<string[]>(() =>
    loadReadNotificationSignatures()
  );
  const [toastDismissed, setToastDismissed] = useState(false);
  const lastUnreadCountRef = useRef<number>(0);

  // Persist every change: offline cache immediately, cloud upsert debounced
  // (see storage.ts). Skipped until the initial cloud load finishes, so an
  // empty ledger can never overwrite the cloud row before it has been read.
  useEffect(() => {
    if (!dataLoaded) return;
    void saveLedgerData(data);
  }, [data, dataLoaded]);

  // --- Cloud sync (Supabase) -------------------------------------------------
  // Track the owner Supabase session (first gate, before the in-app passwords).
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setCloudChecked(true);
      return;
    }
    let cancelled = false;
    // Narrowed once here so the async callbacks below can use it.
    const client = supabase;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setCloudSession(session);
    });
    client.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (cancelled) return;
        if (session) {
          setCloudSession(session);
          setCloudChecked(true);
          return;
        }
        // No session yet: sign in anonymously in the background so nobody
        // ever sees the cloud login screen — the owner and S.R.s only ever
        // enter the in-app admin / company password. Anonymous users still
        // count as `authenticated` for the ledger RLS policies, and the
        // code never uses the session's user id, so an anonymous session
        // works exactly like the owner session here. Requires "Anonymous"
        // sign-ins to be enabled in Supabase (Authentication → Providers).
        // If that is off (or the network fails), fall through with no
        // session — the owner login screen (CloudSignIn) is shown instead.
        try {
          const { data: anonData, error: anonError } =
            await client.auth.signInAnonymously();
          if (cancelled) return;
          if (anonError) throw anonError;
          setCloudSession(anonData.session);
        } catch {
          if (!cancelled) setCloudSession(null);
        } finally {
          if (!cancelled) setCloudChecked(true);
        }
      })
      .catch(() => {
        // Unreachable (offline?) — still unblock the UI; the sign-in form
        // will show the network error if the user tries to sign in.
        if (!cancelled) setCloudChecked(true);
      });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => subscribeCloudSyncStatus(setCloudSyncStatus), []);

  // Load the ledger once the cloud gate is open (signed in, or offline mode).
  useEffect(() => {
    if (!cloudChecked || dataLoaded) return;
    if (!isSupabaseConfigured && !continueOffline) return;
    if (isSupabaseConfigured && !cloudSession && !continueOffline) return;
    let cancelled = false;
    void loadLedgerData().then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      setDataLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [cloudChecked, cloudSession, continueOffline, dataLoaded]);

  useEffect(() => {
    saveReadNotificationSignatures(readNotificationSignatures);
  }, [readNotificationSignatures]);

  const stockNotifications = useMemo(() => buildStockNotifications(data), [data]);

  const unreadNotifications = useMemo(() => {
    const readSet = new Set(readNotificationSignatures);
    return stockNotifications.filter((n) => !readSet.has(n.signature));
  }, [stockNotifications, readNotificationSignatures]);

  const unreadAgedCount = useMemo(
    () => unreadNotifications.filter((n) => n.category === 'godown_aged').length,
    [unreadNotifications]
  );
  const unreadLowCount = useMemo(
    () => unreadNotifications.filter((n) => n.category === 'low_stock').length,
    [unreadNotifications]
  );

  // Re-open live toast & optional browser notification if new unread alerts appear
  useEffect(() => {
    if (session?.role !== 'admin') return;
    if (unreadNotifications.length > lastUnreadCountRef.current) {
      setToastDismissed(false);
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted' &&
        lastUnreadCountRef.current > 0
      ) {
        try {
          new window.Notification('Khan Enterprise · নতুন স্টক সতর্কতা', {
            body: `${unreadLowCount}টি লো-স্টক এবং ${unreadAgedCount}টি ১ মাসের+ গুদামের সতর্কতা রয়েছে।`,
          });
        } catch {
          // ignore
        }
      }
    }
    lastUnreadCountRef.current = unreadNotifications.length;
  }, [session?.role, unreadNotifications.length, unreadLowCount, unreadAgedCount]);

  const handleMarkNotificationRead = (signature: string) => {
    setReadNotificationSignatures((prev) =>
      prev.includes(signature) ? prev : [...prev, signature]
    );
  };

  const handleMarkAllNotificationsRead = () => {
    const allSigs = stockNotifications.map((n) => n.signature);
    setReadNotificationSignatures((prev) => Array.from(new Set([...prev, ...allSigs])));
    setToastDismissed(true);
  };

  const companyUserCompany = useMemo(() => {
    if (session?.role !== 'company') return null;
    const found = data.companies.find((c) => c.id === session.companyId) ?? null;
    if (!found || !data.authConfig.companyPasswordHashes[found.id]) {
      return null;
    }
    return found;
  }, [session, data.companies, data.authConfig.companyPasswordHashes]);

  const activeCompany = useMemo(() => {
    if (session?.role === 'company') {
      return companyUserCompany;
    }
    if (activeView.type !== 'company') return null;
    return data.companies.find((c) => c.id === activeView.companyId) ?? null;
  }, [session, companyUserCompany, activeView, data.companies]);

  const activeCompanyProducts = useMemo(() => {
    if (!activeCompany) return [];
    return data.products.filter((p) => p.companyId === activeCompany.id);
  }, [activeCompany, data.products]);

  const selectedModuleCompany = useMemo(() => {
    return (
      data.companies.find((c) => c.id === selectedModuleCompanyId) ??
      data.companies[0] ??
      null
    );
  }, [data.companies, selectedModuleCompanyId]);

  const scopedModuleData = useMemo(() => {
    if (!selectedModuleCompany) {
      return buildScopedLedgerData(data, '');
    }
    return buildScopedLedgerData(data, selectedModuleCompany.id);
  }, [data, selectedModuleCompany]);

  const selectedModuleSummary = useMemo(() => {
    if (!selectedModuleCompany) return null;
    return computeCompany1to1Summary(data, selectedModuleCompany);
  }, [data, selectedModuleCompany]);

  const orphans = useMemo(() => countUnassignedOrphans(data), [data]);

  const handleSaveCompany = async (payload: CompanySavePayload) => {
    if (session?.role !== 'admin') return;
    const newHash = payload.password ? await hashPassword(payload.password) : undefined;

    if (editingCompany) {
      const targetId = editingCompany.id;
      setData((prev) => {
        const nextHashes = { ...prev.authConfig.companyPasswordHashes };
        if (newHash) {
          nextHashes[targetId] = newHash;
        } else if (payload.clearPassword) {
          delete nextHashes[targetId];
        }
        return {
          ...prev,
          companies: prev.companies.map((c) =>
            c.id === targetId
              ? {
                  ...c,
                  name: payload.name,
                  code: payload.code,
                  contactPerson: payload.contactPerson,
                  phone: payload.phone,
                  logoUrl: payload.logoUrl,
                  tsmName: payload.tsmName,
                  tsmPhone: payload.tsmPhone,
                  srContacts: payload.srContacts,
                }
              : c
          ),
          authConfig: {
            ...prev.authConfig,
            companyPasswordHashes: nextHashes,
          },
        };
      });
      setEditingCompany(null);
      return;
    }

    const newCompany: Company = {
      id: generateId('comp'),
      name: payload.name,
      code: payload.code,
      contactPerson: payload.contactPerson,
      phone: payload.phone,
      logoUrl: payload.logoUrl,
      tsmName: payload.tsmName,
      tsmPhone: payload.tsmPhone,
      srContacts: payload.srContacts,
      createdAt: new Date().toISOString(),
    };

    setData((prev) => {
      const nextHashes = { ...prev.authConfig.companyPasswordHashes };
      if (newHash) {
        nextHashes[newCompany.id] = newHash;
      }
      return {
        ...prev,
        companies: [...prev.companies, newCompany],
        authConfig: {
          ...prev.authConfig,
          companyPasswordHashes: nextHashes,
        },
      };
    });
    setSelectedModuleCompanyId(newCompany.id);
    setActiveView({ type: 'company', companyId: newCompany.id });
  };

  // Profile-only metadata update (logo, TSM, SR) — NEVER touches financial accounts or ledgers
  const handleUpdateCompanyProfileMeta = (
    companyId: string,
    meta: CompanyProfileMetaUpdate
  ) => {
    if (session?.role !== 'admin') return;
    const primarySr = meta.srContacts?.[0];
    setData((prev) => ({
      ...prev,
      companies: prev.companies.map((c) =>
        c.id === companyId
          ? {
              ...c,
              logoUrl: meta.logoUrl,
              tsmName: meta.tsmName,
              tsmPhone: meta.tsmPhone,
              srContacts: meta.srContacts,
              contactPerson: primarySr?.name || meta.tsmName || c.contactPerson,
              phone: primarySr?.phone || meta.tsmPhone || c.phone,
            }
          : c
      ),
    }));
  };

  const handleDeleteCompany = (companyId: string) => {
    if (session?.role !== 'admin') return;
    setData((prev) => {
      const nextEntries: Record<string, DailyEntry> = {};
      for (const [key, entry] of Object.entries(prev.entries)) {
        if (entry.companyId !== companyId) {
          nextEntries[key] = entry;
        }
      }
      const deletedCustomerIds = new Set(
        prev.customers.filter((c) => c.companyId === companyId).map((c) => c.id)
      );
      const nextHashes = { ...prev.authConfig.companyPasswordHashes };
      delete nextHashes[companyId];

      return {
        ...prev,
        companies: prev.companies.filter((c) => c.id !== companyId),
        products: prev.products.filter((p) => p.companyId !== companyId),
        entries: nextEntries,
        cashTransactions: prev.cashTransactions.filter(
          (t) => t.companyId !== companyId
        ),
        companyLedgerEntries: prev.companyLedgerEntries.filter(
          (item) => item.companyId !== companyId
        ),
        stockMovements: prev.stockMovements.filter(
          (mv) => mv.companyId !== companyId
        ),
        customers: prev.customers.filter((c) => c.companyId !== companyId),
        customerCreditEntries: prev.customerCreditEntries.filter(
          (e) => e.companyId !== companyId && !deletedCustomerIds.has(e.customerId)
        ),
        authConfig: {
          ...prev.authConfig,
          companyPasswordHashes: nextHashes,
        },
      };
    });
    setActiveView({ type: 'overview' });
  };

  const handleSaveProduct = (payload: {
    name: string;
    unit: string;
    rate: number;
    minStock?: number;
  }) => {
    if (session?.role !== 'admin' || !activeCompany) return;

    if (editingProduct) {
      const today = getTodayISO();
      const todayKey = getEntryKey(activeCompany.id, today);

      setData((prev) => {
        const nextProducts = prev.products.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                name: payload.name,
                unit: payload.unit,
                rate: payload.rate,
                minStock: payload.minStock,
              }
            : p
        );

        const nextEntries = { ...prev.entries };
        const todayEntry = nextEntries[todayKey];
        if (todayEntry) {
          const updatedItems = todayEntry.items.map((item) => {
            if (item.productId !== editingProduct.id) return item;
            return computeLineItem(
              item.productId,
              payload.name,
              payload.unit,
              payload.rate,
              item.marketOut,
              item.returned
            );
          });
          nextEntries[todayKey] = summarizeEntry(
            activeCompany.id,
            today,
            updatedItems,
            todayEntry.note
          );
        }

        return {
          ...prev,
          products: nextProducts,
          entries: nextEntries,
        };
      });
      setEditingProduct(null);
      return;
    }

    const newProduct: Product = {
      id: generateId('prod'),
      companyId: activeCompany.id,
      name: payload.name,
      unit: payload.unit,
      rate: payload.rate,
      minStock: payload.minStock,
      createdAt: new Date().toISOString(),
    };

    setData((prev) => ({
      ...prev,
      products: [...prev.products, newProduct],
    }));
  };

  const handleUpdateProductMinStock = (productId: string, minStock?: number) => {
    if (session?.role !== 'admin') return;
    setData((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId ? { ...p, minStock } : p
      ),
    }));
  };

  const handleDeleteProduct = (productId: string) => {
    if (session?.role !== 'admin') return;
    setData((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== productId),
      stockMovements: prev.stockMovements.filter((mv) => mv.productId !== productId),
    }));
  };

  const handleSaveDailyEntry = (entry: DailyEntry) => {
    if (session?.role !== 'admin') return;
    setData((prev) => ({
      ...prev,
      entries: {
        ...prev.entries,
        [entry.id]: entry,
      },
    }));
  };

  const handleDeleteDailyEntry = (entryId: string) => {
    if (session?.role !== 'admin') return;
    setData((prev) => {
      const nextEntries = { ...prev.entries };
      delete nextEntries[entryId];
      return {
        ...prev,
        entries: nextEntries,
      };
    });
  };

  const handleAddCashTransaction = (
    payload: Omit<CashTransaction, 'id' | 'createdAt'>
  ) => {
    if (session?.role !== 'admin') return;
    const companyId = payload.companyId ?? selectedModuleCompany?.id;
    const newTx: CashTransaction = {
      id: generateId('tx'),
      ...payload,
      companyId,
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      cashTransactions: [...prev.cashTransactions, newTx],
    }));
  };

  const handleDeleteCashTransaction = (txId: string) => {
    if (session?.role !== 'admin') return;
    setData((prev) => ({
      ...prev,
      cashTransactions: prev.cashTransactions.filter((t) => t.id !== txId),
    }));
  };

  const handleAddCompanyLedgerEntry = (
    payload: Omit<CompanyLedgerEntry, 'id' | 'createdAt'>
  ) => {
    if (session?.role !== 'admin') return;
    const newEntry: CompanyLedgerEntry = {
      id: generateId('cl'),
      ...payload,
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      companyLedgerEntries: [...prev.companyLedgerEntries, newEntry],
    }));
  };

  const handleDeleteCompanyLedgerEntry = (entryId: string) => {
    if (session?.role !== 'admin') return;
    setData((prev) => ({
      ...prev,
      companyLedgerEntries: prev.companyLedgerEntries.filter((item) => item.id !== entryId),
    }));
  };

  const handleAddStockMovement = (
    payload: Omit<StockMovement, 'id' | 'createdAt'>
  ) => {
    if (session?.role !== 'admin') return;
    const newMovement: StockMovement = {
      id: generateId('stk'),
      ...payload,
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      stockMovements: [...prev.stockMovements, newMovement],
    }));
  };

  const handleDeleteStockMovement = (movementId: string) => {
    if (session?.role !== 'admin') return;
    setData((prev) => ({
      ...prev,
      stockMovements: prev.stockMovements.filter((mv) => mv.id !== movementId),
    }));
  };

  const handleSaveCustomer = (
    payload: {
      companyId?: string;
      name: string;
      shopName?: string;
      phone?: string;
      address?: string;
      nextCollectionDate?: string;
      expectedCollectionAmount?: number;
      collectionNote?: string;
    },
    editingId?: string
  ): Customer | undefined => {
    if (session?.role !== 'admin') return undefined;
    const resolvedCompanyId = payload.companyId ?? selectedModuleCompany?.id;
    if (editingId) {
      let updated: Customer | undefined;
      setData((prev) => ({
        ...prev,
        customers: prev.customers.map((c) => {
          if (c.id !== editingId) return c;
          updated = {
            ...c,
            ...payload,
            companyId: resolvedCompanyId ?? c.companyId,
          };
          return updated;
        }),
      }));
      return updated;
    }

    const newCustomer: Customer = {
      id: generateId('cust'),
      ...payload,
      companyId: resolvedCompanyId,
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      customers: [...prev.customers, newCustomer],
    }));
    return newCustomer;
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (session?.role !== 'admin') return;
    setData((prev) => ({
      ...prev,
      customers: prev.customers.filter((c) => c.id !== customerId),
      customerCreditEntries: prev.customerCreditEntries.filter(
        (entry) => entry.customerId !== customerId
      ),
    }));
  };

  const handleAddCustomerCreditEntry = (
    payload: Omit<CustomerCreditEntry, 'id' | 'createdAt'>
  ) => {
    if (session?.role !== 'admin') return;
    const matchingCust = data.customers.find((c) => c.id === payload.customerId);
    const resolvedCompanyId =
      payload.companyId ?? matchingCust?.companyId ?? selectedModuleCompany?.id;
    const newEntry: CustomerCreditEntry = {
      id: generateId('cc'),
      ...payload,
      companyId: resolvedCompanyId,
      createdAt: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      customerCreditEntries: [...prev.customerCreditEntries, newEntry],
    }));
  };

  const handleDeleteCustomerCreditEntry = (entryId: string) => {
    if (session?.role !== 'admin') return;
    setData((prev) => ({
      ...prev,
      customerCreditEntries: prev.customerCreditEntries.filter(
        (entry) => entry.id !== entryId
      ),
    }));
  };

  const handleAssignOrphansToCompany = (targetCompanyId: string) => {
    if (session?.role !== 'admin' || !targetCompanyId) return;
    setData((prev) => {
      const orphanCustIds = new Set(
        prev.customers.filter((c) => !c.companyId).map((c) => c.id)
      );
      return {
        ...prev,
        cashTransactions: prev.cashTransactions.map((tx) =>
          tx.companyId ? tx : { ...tx, companyId: targetCompanyId }
        ),
        customers: prev.customers.map((c) =>
          c.companyId ? c : { ...c, companyId: targetCompanyId }
        ),
        customerCreditEntries: prev.customerCreditEntries.map((ce) => {
          if (ce.companyId) return ce;
          if (orphanCustIds.has(ce.customerId) || !ce.companyId) {
            const cust = prev.customers.find((c) => c.id === ce.customerId);
            return {
              ...ce,
              companyId: cust?.companyId ?? targetCompanyId,
            };
          }
          return ce;
        }),
      };
    });
  };

  const hasDemoData = useMemo(() => hasDemoLedgerData(data), [data]);

  const handleLoadSampleData = () => {
    if (session?.role !== 'admin') return;
    setData((prev) => mergeSampleLedgerData(prev));
    setReadNotificationSignatures([]);
    setToastDismissed(false);
  };

  const handleClearDemoData = () => {
    if (session?.role !== 'admin') return;
    clearAllSalesDrafts();
    setData((prev) => removeDemoLedgerData(prev));
    setActiveView((prevView) => {
      if (
        prevView.type === 'company' &&
        (prevView.companyId === 'comp_pran' ||
          prevView.companyId === 'comp_square' ||
          prevView.companyId === 'comp_akij')
      ) {
        return { type: 'overview' };
      }
      return prevView;
    });
  };

  const handleLogout = () => {
    clearAuthSession();
    setSession(null);
    setShowAuthGate(false);
    setViewingPublicHome(false);
    setActiveView({ type: 'overview' });
    // NOTE: intentionally does NOT sign out of the cloud (Supabase) session.
    // The cloud session is anonymous and created automatically in the
    // background, so signing out here only ends the in-app admin / company
    // session. The next visit connects to the cloud again automatically.
  };

  const handleAuthenticated = (nextSession: AuthSession) => {
    saveAuthSession(nextSession);
    setSession(nextSession);
    setShowAuthGate(false);
    setViewingPublicHome(false);
    if (nextSession.role === 'company') {
      setActiveView({ type: 'company', companyId: nextSession.companyId });
    } else {
      setActiveView({ type: 'overview' });
    }
  };

  const handleSetInitialAdminPassword = (adminPasswordHash: string) => {
    setData((prev) => ({
      ...prev,
      authConfig: {
        ...prev.authConfig,
        adminPasswordHash,
      },
    }));
  };

  const handleSetCompanyPasswordHash = (companyId: string, hash: string | null) => {
    setData((prev) => {
      const nextHashes = { ...prev.authConfig.companyPasswordHashes };
      if (hash) {
        nextHashes[companyId] = hash;
      } else {
        delete nextHashes[companyId];
      }
      return {
        ...prev,
        authConfig: {
          ...prev.authConfig,
          companyPasswordHashes: nextHashes,
        },
      };
    });
  };

  // --- Cloud gates (run before the in-app password gates) --------------------
  if (!cloudChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7fa] px-4">
        <p className="text-sm font-bold text-[#1e293b]">লোড হচ্ছে…</p>
      </div>
    );
  }
  if (!isSupabaseConfigured && !continueOffline) {
    return <CloudSetupNotice onContinueOffline={() => setContinueOffline(true)} />;
  }
  if (isSupabaseConfigured && !cloudSession && !continueOffline) {
    return <CloudSignIn />;
  }
  if (!dataLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f7fa] px-4">
        <p className="text-sm font-bold text-[#1e293b]">হিসাব আনা হচ্ছে…</p>
      </div>
    );
  }

  // Require password setup / login before rendering workspace
  const isSessionValid =
    Boolean(data.authConfig.adminPasswordHash) &&
    session !== null &&
    (session.role === 'admin' || companyUserCompany !== null);

  if (!isSessionValid) {
    if (!showAuthGate) {
      return (
        <ProfilePage
          isAuthenticated={false}
          onEnterApp={() => setShowAuthGate(true)}
        />
      );
    }
    return (
      <AuthGate
        companies={data.companies}
        authConfig={data.authConfig}
        onSetInitialAdminPassword={handleSetInitialAdminPassword}
        onAuthenticated={handleAuthenticated}
        onBackToHome={() => setShowAuthGate(false)}
      />
    );
  }

  if (session.role === 'admin' && viewingPublicHome) {
    return (
      <ProfilePage
        isAuthenticated={true}
        onEnterApp={() => setViewingPublicHome(false)}
      />
    );
  }

  // Scoped Read-Only View when logged in with a Company's separate password (S.R View)
  if (session.role === 'company' && companyUserCompany) {
    return (
      <SRSecurityShield companyName={companyUserCompany.name}>
        <div className="min-h-screen bg-[#f4f7fa] text-[#0f172a] overflow-x-clip">
          <CloudSyncBanner status={cloudSyncStatus} />
          <header className="no-print md:sticky md:top-0 z-30 border-b border-slate-300/80 bg-[#F8FAFC]/95 backdrop-blur-md shadow-sm">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-4 px-3 py-2.5 sm:px-6 sm:py-3">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                <BrandLogo className="h-10 w-10 sm:h-12 sm:w-12" />
                <div className="min-w-0 leading-tight">
                  <span className="block truncate text-[17px] sm:text-[24px] font-extrabold tracking-tight text-[#1E3A8A]">
                    Khan Enterprise
                  </span>
                  <span className="block truncate text-[11px] sm:text-[13px] font-semibold text-slate-600">
                    ডিস্ট্রিবিউশন ও ডেইলি লেজার
                  </span>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-2 text-[15px] font-semibold text-[#0f172a] whitespace-nowrap shrink-0">
                <span>{companyUserCompany.name}</span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  S.R ভিউ
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-[#0f172a] shadow-xs transition-all hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-4 w-4 text-rose-600" />
                  লগআউট
                </button>
              </div>
            </div>
            <div className="flex md:hidden items-center justify-between gap-2 border-t border-slate-200/80 bg-amber-50/75 px-3 py-1.5 text-xs font-bold text-amber-950">
              <span className="truncate">{companyUserCompany.name}</span>
              <span className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px]">
                S.R ভিউ
              </span>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            <CompanyWorkspace
              isAdmin={false}
              company={companyUserCompany}
              products={activeCompanyProducts}
              entries={data.entries}
              stockMovements={data.stockMovements.filter(
                (mv) => mv.companyId === companyUserCompany.id
              )}
              onEditCompany={() => {}}
              onDeleteCompany={() => {}}
              onOpenAddProduct={() => {}}
              onQuickAddProduct={() => {}}
              onOpenEditProduct={() => {}}
              onDeleteProduct={() => {}}
              onSaveDailyEntry={() => {}}
              onDeleteDailyEntry={() => {}}
            />
          </main>
          <ScrollToTopButton />
        </div>
      </SRSecurityShield>
    );
  }

  return (
    <div id="app-main-shell" className="min-h-screen bg-[#f4f7fa] text-[#0f172a] overflow-x-clip">
      <CloudSyncBanner status={cloudSyncStatus} />
      {/* Clean Light Header with Balanced Brand Bar + Single-Row Navigation Tabs + Uniform Toolbar */}
      <header className="no-print md:sticky md:top-0 z-30 border-b border-slate-300/85 bg-[#F8FAFC]/95 backdrop-blur-md shadow-sm">
        {/* Top Row: Clean Sharp Logo + Bold #1E3A8A Brand + Balanced Utility Actions */}
        <div className="border-b border-slate-200/90 bg-white/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-3 px-3 py-2.5 sm:px-6">
            <button
              type="button"
              onClick={() => setActiveView({ type: 'overview' })}
              className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] rounded-2xl"
            >
              <BrandLogo className="h-10 w-10 sm:h-12 sm:w-12 xl:h-14 xl:w-14" />
              <div className="min-w-0 leading-tight">
                <span className="block truncate text-[16.5px] min-[390px]:text-[18.5px] sm:text-[23px] xl:text-[26px] font-extrabold tracking-tight text-[#1E3A8A]">
                  Khan Enterprise
                </span>
                <span className="block truncate text-[10.5px] min-[390px]:text-[11.5px] sm:text-[13px] font-semibold text-slate-600">
                  ডিস্ট্রিবিউশন ও ডেইলি অ্যাকাউন্টস
                </span>
              </div>
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden xl:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    window.scrollTo({ top: 0 });
                    setViewingPublicHome(true);
                  }}
                  title="Khan Enterprise পরিচিতি পেজ দেখুন"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200/90 bg-blue-50/75 px-3 text-[13.5px] font-bold text-[#1E3A8A] transition-colors hover:border-blue-300 hover:bg-blue-100 whitespace-nowrap shrink-0"
                >
                  <Home className="h-4 w-4 text-[#1E3A8A] shrink-0" />
                  পরিচিতি
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationModalOpen(true)}
                  title="গুদাম ও স্টক নোটিফিকেশন সেন্টার"
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13.5px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                    unreadNotifications.length > 0
                      ? 'border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100'
                      : 'border-slate-200 bg-slate-50 text-[#0f172a] hover:bg-slate-100'
                  }`}
                >
                  <Bell
                    className={`h-4 w-4 shrink-0 ${
                      unreadNotifications.length > 0 ? 'text-amber-700' : 'text-slate-600'
                    }`}
                  />
                  <span>নোটিফিকেশন</span>
                  {stockNotifications.length > 0 && (
                    <span
                      className={`font-mono-tabular inline-flex h-5 min-w-[20px] items-center justify-center rounded px-1 text-[11px] font-extrabold leading-none ${
                        unreadNotifications.length > 0
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-200 text-[#0f172a]'
                      }`}
                    >
                      {unreadNotifications.length > 0
                        ? unreadNotifications.length
                        : stockNotifications.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadAllInOneExcelCsv(data)}
                  title="সকল পেজের রিপোর্ট এক ক্লিকে Excel (All-In-One CSV) ডাউনলোড"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-teal-700/30 bg-teal-50 px-3 text-[13.5px] font-bold text-teal-900 transition-colors hover:bg-teal-100 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="h-4 w-4 text-teal-700 shrink-0" />
                  Excel ব্যাকআপ
                </button>
                <button
                  type="button"
                  onClick={() => setSecurityModalOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13.5px] font-semibold text-[#0f172a] transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <KeyRound className="h-4 w-4 text-slate-600 shrink-0" />
                  পাসওয়ার্ড
                </button>
                <button
                  type="button"
                  onClick={() => setBackupModalOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13.5px] font-semibold text-[#0f172a] transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Database className="h-4 w-4 text-slate-600 shrink-0" />
                  রিস্টোর ও ডাটা
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/70 px-3 text-[13.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-100 whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  লগআউট
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingCompany(null);
                  setCompanyModalOpen(true);
                }}
                className="inline-flex min-h-[40px] sm:min-h-[36px] sm:h-9 items-center gap-1 sm:gap-1.5 rounded-lg bg-[#1E3A8A] px-2.5 sm:px-3.5 text-[12px] min-[390px]:text-[13px] sm:text-[13.5px] font-bold text-white shadow-xs transition-all hover:bg-[#172e6e] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:ring-offset-2"
              >
                <Plus className="h-4 w-4 shrink-0" />
                নতুন কোম্পানি
              </button>
            </div>
          </div>
        </div>

        {/* Middle Row: Smooth Horizontal Scrollable Navigation Tabs (40px+ Touch Targets on Mobile) */}
        <div className="border-b border-slate-200/90 bg-[#F8FAFC]">
          <nav
            aria-label="প্রধান মেনু"
            className="mx-auto flex max-w-7xl flex-nowrap overflow-x-auto no-scrollbar scroll-smooth items-center gap-1.5 px-3 py-2 sm:px-6"
          >
            {(
              [
                {
                  key: 'overview' as const,
                  label: 'সকল কোম্পানি',
                  badge: data.companies.length,
                  Icon: Building2,
                },
                {
                  key: 'cash' as const,
                  label: 'ক্যাশ ও খরচ',
                  Icon: Wallet,
                },
                {
                  key: 'profit_loss' as const,
                  label: 'লাভ ও লস',
                  Icon: TrendingUp,
                },
                {
                  key: 'company_ledger' as const,
                  label: 'পেমেন্ট ও চালান',
                  Icon: Receipt,
                },
                {
                  key: 'stock' as const,
                  label: 'স্টক রিপোর্ট',
                  Icon: Package,
                },
                {
                  key: 'customer_credit' as const,
                  label: 'কাস্টমার বাকি',
                  Icon: Users,
                },
                {
                  key: 'summary' as const,
                  label: 'সেলস রিপোর্ট',
                  Icon: BarChart3,
                },
                {
                  key: 'chalan_verify' as const,
                  label: 'চালান যাচাই ও নোট',
                  Icon: ClipboardCheck,
                },
              ] as const
            ).map((item) => {
              const { key, label, Icon } = item;
              const badge = 'badge' in item ? item.badge : undefined;
              const isActive = activeView.type === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveView({ type: key })}
                  className={`inline-flex min-h-[40px] lg:min-h-[38px] items-center gap-1.5 rounded-lg px-3 lg:px-3.5 text-[13px] lg:text-[13.5px] xl:text-[14.5px] leading-none transition-all whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-[#EFF6FF] text-[#1E3A8A] font-extrabold border border-blue-300 border-b-[3px] border-b-[#1E3A8A] shadow-xs'
                      : 'bg-white text-[#0f172a] font-semibold border border-slate-200/90 hover:bg-blue-50/60 hover:text-[#1E3A8A] hover:border-blue-200'
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 xl:h-4 xl:w-4 shrink-0 ${
                      isActive ? 'text-[#1E3A8A]' : 'text-slate-600'
                    }`}
                  />
                  <span>{label}</span>
                  {typeof badge === 'number' && (
                    <span
                      className={`font-mono-tabular inline-flex h-4.5 min-w-[18px] items-center justify-center rounded px-1 text-[11px] font-extrabold leading-none ${
                        isActive
                          ? 'bg-[#1E3A8A] text-white'
                          : 'bg-slate-200/80 text-[#0f172a]'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Row: Clean Responsive Company Sheet Toolbar & Aligned Utility Actions */}
        <div className="bg-[#F1F5F9]/90">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-2 sm:px-6 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
            {/* Company Sheet Controls (Scrollable on mobile, wrapped on sm+) */}
            <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap items-center gap-1.5 min-w-0 py-0.5">
              <span className="inline-flex h-8 items-center pr-1 text-xs font-bold tracking-wide text-slate-700 whitespace-nowrap shrink-0">
                কোম্পানি শিট:
              </span>

              {lastVisitedCompanyId &&
                (activeView.type !== 'company' || activeView.companyId !== lastVisitedCompanyId) &&
                (() => {
                  const lastComp = data.companies.find((c) => c.id === lastVisitedCompanyId);
                  if (!lastComp) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => setActiveView({ type: 'company', companyId: lastComp.id })}
                      title={`সর্বশেষ খোলা কোম্পানি শিট (${lastComp.name})-এ ফিরে যান`}
                      className="inline-flex min-h-[38px] sm:min-h-0 sm:h-8 items-center justify-center gap-1 rounded-lg border border-teal-700/40 bg-teal-50 px-2.5 text-[12px] sm:text-[12.5px] font-extrabold text-teal-900 leading-none transition-colors hover:bg-teal-100 whitespace-nowrap shrink-0"
                    >
                      <span>↩ ফিরে যান: {lastComp.name}</span>
                    </button>
                  );
                })()}

              {data.companies.map((company) => {
                const isSelected =
                  activeView.type === 'company' && activeView.companyId === company.id;
                const isDemoCompany = DEMO_COMPANY_IDS.includes(
                  company.id as (typeof DEMO_COMPANY_IDS)[number]
                );
                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setActiveView({ type: 'company', companyId: company.id })}
                    className={`inline-flex min-h-[38px] sm:min-h-0 sm:h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12.5px] sm:text-[13px] leading-none transition-all whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-teal-700 text-white font-bold border border-teal-800 shadow-xs'
                        : isDemoCompany
                          ? 'bg-amber-50/85 text-[#0f172a] font-semibold border border-amber-300/90 hover:border-amber-400 hover:bg-amber-100/70'
                          : 'bg-white text-[#0f172a] font-semibold border border-slate-200/90 hover:border-teal-300 hover:bg-teal-50/70'
                    }`}
                  >
                    <CompanyLogoAvatar
                      name={company.name}
                      logoUrl={company.logoUrl}
                      isDemo={isDemoCompany}
                      className="h-5 w-5 rounded"
                      textClassName="text-[10px] font-extrabold"
                    />
                    <span>{company.name}</span>
                    {isDemoCompany && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold leading-none ${
                          isSelected
                            ? 'bg-amber-300 text-amber-950'
                            : 'border border-amber-300 bg-amber-100 text-amber-900'
                        }`}
                      >
                        স্যাম্পল
                      </span>
                    )}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setEditingCompany(null);
                  setCompanyModalOpen(true);
                }}
                className="inline-flex min-h-[38px] sm:min-h-0 sm:h-8 items-center justify-center gap-1 rounded-lg border border-dashed border-teal-600/55 bg-white px-2.5 text-[12.5px] sm:text-[13px] font-bold text-teal-800 leading-none transition-colors hover:bg-teal-50 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                কোম্পানি যোগ
              </button>
            </div>

            {/* Utility Toolbar for Small & Medium Screens (2x3 on <400px, 3x2 on >=400px, Single Row on md/lg) */}
            <div className="grid grid-cols-2 min-[400px]:grid-cols-3 gap-1.5 border-t border-slate-200/80 pt-2 md:flex md:flex-nowrap md:items-center md:justify-start md:gap-2 xl:hidden">
              <button
                type="button"
                onClick={() => setActiveView({ type: 'chalan_verify' })}
                className={`inline-flex min-h-[40px] md:min-h-0 md:h-8 items-center justify-center gap-1.5 rounded-lg border px-2 sm:px-2.5 text-[12.5px] sm:text-[13px] font-bold leading-none transition-colors whitespace-nowrap shrink-0 ${
                  activeView.type === 'chalan_verify'
                    ? 'border-indigo-700 bg-indigo-700 text-white'
                    : 'border-indigo-200 bg-indigo-50/85 text-indigo-900 hover:bg-indigo-100'
                }`}
              >
                <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
                <span>চালান যাচাই</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  window.scrollTo({ top: 0 });
                  setViewingPublicHome(true);
                }}
                className="inline-flex min-h-[40px] md:min-h-0 md:h-8 items-center justify-center gap-1.5 rounded-lg border border-blue-200/90 bg-blue-50/80 px-2 sm:px-2.5 text-[12.5px] sm:text-[13px] font-bold text-[#1E3A8A] leading-none transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0"
              >
                <Home className="h-3.5 w-3.5 text-[#1E3A8A] shrink-0" />
                <span>পরিচিতি</span>
              </button>
              <button
                type="button"
                onClick={() => setNotificationModalOpen(true)}
                className={`inline-flex min-h-[40px] md:min-h-0 md:h-8 items-center justify-center gap-1 sm:gap-1.5 rounded-lg border px-2 sm:px-2.5 text-[12.5px] sm:text-[13px] font-bold leading-none transition-colors whitespace-nowrap shrink-0 ${
                  unreadNotifications.length > 0
                    ? 'border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100'
                    : 'border-slate-200 bg-white text-[#0f172a] hover:bg-slate-50'
                }`}
              >
                <Bell className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                <span>নোটিফিকেশন</span>
                {stockNotifications.length > 0 && (
                  <span
                    className={`font-mono-tabular inline-flex h-4.5 min-w-[18px] items-center justify-center rounded px-1 text-[10.5px] sm:text-[11px] font-extrabold leading-none shrink-0 ${
                      unreadNotifications.length > 0
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-200 text-[#0f172a]'
                    }`}
                  >
                    {unreadNotifications.length > 0
                      ? unreadNotifications.length
                      : stockNotifications.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => downloadAllInOneExcelCsv(data)}
                className="inline-flex min-h-[40px] md:min-h-0 md:h-8 items-center justify-center gap-1.5 rounded-lg border border-teal-700/30 bg-teal-50 px-2 sm:px-2.5 text-[12.5px] sm:text-[13px] font-bold text-teal-900 leading-none transition-colors hover:bg-teal-100 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setSecurityModalOpen(true)}
                className="inline-flex min-h-[40px] md:min-h-0 md:h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-[12.5px] sm:text-[13px] font-semibold text-[#0f172a] leading-none transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <KeyRound className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                <span>পাসওয়ার্ড</span>
              </button>
              <button
                type="button"
                onClick={() => setBackupModalOpen(true)}
                className="inline-flex min-h-[40px] md:min-h-0 md:h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-[12.5px] sm:text-[13px] font-semibold text-[#0f172a] leading-none transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Database className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                <span>রিস্টোর</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-[40px] md:min-h-0 md:h-8 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 sm:px-2.5 text-[12.5px] sm:text-[13px] font-semibold text-rose-700 leading-none transition-colors hover:bg-rose-100 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span>লগআউট</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {activeView.type === 'overview' && (
          <AllCompaniesOverview
            data={data}
            hasDemoData={hasDemoData}
            lastVisitedCompanyId={lastVisitedCompanyId}
            notifications={stockNotifications}
            unreadNotificationCount={unreadNotifications.length}
            onOpenNotifications={() => setNotificationModalOpen(true)}
            onSelectCompany={(companyId) =>
              setActiveView({ type: 'company', companyId })
            }
            onEditCompany={(comp) => {
              setEditingCompany(comp);
              setCompanyModalOpen(true);
            }}
            onOpenPeriodReports={() => setActiveView({ type: 'summary' })}
            onOpenChalanVerify={() => setActiveView({ type: 'chalan_verify' })}
            onOpenCustomerCredit={() => setActiveView({ type: 'customer_credit' })}
            onOpenStockReport={() => setActiveView({ type: 'stock' })}
            onAddCompany={() => {
              setEditingCompany(null);
              setCompanyModalOpen(true);
            }}
            onLoadSampleData={handleLoadSampleData}
            onClearDemoData={handleClearDemoData}
            onOpenProfilePage={() => {
              window.scrollTo({ top: 0 });
              setViewingPublicHome(true);
            }}
          />
        )}

        {activeView.type === 'stock' && (
          <StockReportPage
            data={scopedModuleData}
            companies={data.companies}
            selectedCompanyId={selectedModuleCompany?.id ?? ''}
            onSelectCompanyId={setSelectedModuleCompanyId}
            oneToOneSummary={selectedModuleSummary}
            initialAlertFilter={activeView.alertFilter}
            initialCompanyId={activeView.companyId}
            initialFilterNonce={activeView.filterNonce}
            onAddStockMovement={handleAddStockMovement}
            onDeleteStockMovement={handleDeleteStockMovement}
            onUpdateProductMinStock={handleUpdateProductMinStock}
            onAddCompany={() => {
              setEditingCompany(null);
              setCompanyModalOpen(true);
            }}
            onSelectCompanyWorkspace={(companyId) =>
              setActiveView({ type: 'company', companyId })
            }
          />
        )}

        {activeView.type === 'company_ledger' && (
          <CompanyLedgerPage
            companies={data.companies}
            selectedCompanyId={selectedModuleCompany?.id ?? ''}
            onSelectCompanyId={setSelectedModuleCompanyId}
            oneToOneSummary={selectedModuleSummary}
            onOpenWorkspace={(companyId) =>
              setActiveView({ type: 'company', companyId })
            }
            entries={scopedModuleData.companyLedgerEntries}
            onAddEntry={handleAddCompanyLedgerEntry}
            onDeleteEntry={handleDeleteCompanyLedgerEntry}
            onAddCompany={() => {
              setEditingCompany(null);
              setCompanyModalOpen(true);
            }}
          />
        )}

        {activeView.type === 'customer_credit' && (
          <CustomerCreditPage
            customers={scopedModuleData.customers}
            entries={scopedModuleData.customerCreditEntries}
            companies={data.companies}
            selectedCompanyId={selectedModuleCompany?.id ?? ''}
            onSelectCompanyId={setSelectedModuleCompanyId}
            oneToOneSummary={selectedModuleSummary}
            orphanCustomerCount={orphans.customerCount + orphans.creditEntryCount}
            onAssignOrphansToCompany={handleAssignOrphansToCompany}
            onOpenWorkspace={(companyId) =>
              setActiveView({ type: 'company', companyId })
            }
            onAddCompany={() => {
              setEditingCompany(null);
              setCompanyModalOpen(true);
            }}
            onSaveCustomer={handleSaveCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onAddEntry={handleAddCustomerCreditEntry}
            onDeleteEntry={handleDeleteCustomerCreditEntry}
          />
        )}

        {activeView.type === 'cash' && (
          <CashExpensePage
            transactions={scopedModuleData.cashTransactions}
            companies={data.companies}
            selectedCompanyId={selectedModuleCompany?.id ?? ''}
            onSelectCompanyId={setSelectedModuleCompanyId}
            oneToOneSummary={selectedModuleSummary}
            orphanCashCount={orphans.cashCount}
            onAssignOrphansToCompany={handleAssignOrphansToCompany}
            onOpenWorkspace={(companyId) =>
              setActiveView({ type: 'company', companyId })
            }
            onAddCompany={() => {
              setEditingCompany(null);
              setCompanyModalOpen(true);
            }}
            onAddTransaction={handleAddCashTransaction}
            onDeleteTransaction={handleDeleteCashTransaction}
          />
        )}

        {activeView.type === 'profit_loss' && (
          <ProfitLossPage
            data={scopedModuleData}
            companies={data.companies}
            selectedCompanyId={selectedModuleCompany?.id ?? ''}
            onSelectCompanyId={setSelectedModuleCompanyId}
            oneToOneSummary={selectedModuleSummary}
            onOpenWorkspace={(companyId) =>
              setActiveView({ type: 'company', companyId })
            }
            onAddCompany={() => {
              setEditingCompany(null);
              setCompanyModalOpen(true);
            }}
          />
        )}

        {activeView.type === 'summary' && (
          <DailySummaryView
            data={scopedModuleData}
            companies={data.companies}
            selectedCompanyId={selectedModuleCompany?.id ?? ''}
            onSelectCompanyId={setSelectedModuleCompanyId}
            oneToOneSummary={selectedModuleSummary}
            onOpenWorkspace={(companyId) =>
              setActiveView({ type: 'company', companyId })
            }
            onAddCompany={() => {
              setEditingCompany(null);
              setCompanyModalOpen(true);
            }}
            onSelectCompany={(companyId) =>
              setActiveView({ type: 'company', companyId })
            }
          />
        )}

        {activeView.type === 'chalan_verify' && (
          <ChalanVerifyNotesPage
            companies={data.companies}
            onUpdateCompanyProfileMeta={handleUpdateCompanyProfileMeta}
          />
        )}

        {activeView.type === 'company' && activeCompany && (
          <CompanyWorkspace
            key={activeCompany.id}
            company={activeCompany}
            products={activeCompanyProducts}
            entries={data.entries}
            stockMovements={data.stockMovements.filter(
              (mv) => mv.companyId === activeCompany.id
            )}
            oneToOneSummary={computeCompany1to1Summary(data, activeCompany)}
            onOpenModule={(tab) => {
              setSelectedModuleCompanyId(activeCompany.id);
              setActiveView({ type: tab });
            }}
            onEditCompany={(comp) => {
              setEditingCompany(comp);
              setCompanyModalOpen(true);
            }}
            onDeleteCompany={handleDeleteCompany}
            onOpenAddProduct={() => {
              setEditingProduct(null);
              setProductModalOpen(true);
            }}
            onQuickAddProduct={(payload) => {
              const newProduct: Product = {
                id: generateId('prod'),
                companyId: activeCompany.id,
                name: payload.name,
                unit: payload.unit,
                rate: payload.rate,
                createdAt: new Date().toISOString(),
              };
              setData((prev) => ({
                ...prev,
                products: [...prev.products, newProduct],
              }));
            }}
            onOpenEditProduct={(prod) => {
              setEditingProduct(prod);
              setProductModalOpen(true);
            }}
            onDeleteProduct={handleDeleteProduct}
            onSaveDailyEntry={handleSaveDailyEntry}
            onDeleteDailyEntry={handleDeleteDailyEntry}
          />
        )}
      </main>

      {/* Modals */}
      <CompanyModal
        isOpen={companyModalOpen}
        initialCompany={editingCompany}
        hasExistingPassword={
          editingCompany
            ? Boolean(data.authConfig.companyPasswordHashes[editingCompany.id])
            : false
        }
        onClose={() => {
          setCompanyModalOpen(false);
          setEditingCompany(null);
        }}
        onSave={handleSaveCompany}
      />

      <ProductModal
        isOpen={productModalOpen}
        companyName={activeCompany?.name ?? ''}
        initialProduct={editingProduct}
        onClose={() => {
          setProductModalOpen(false);
          setEditingProduct(null);
        }}
        onSave={handleSaveProduct}
      />

      <SecurityModal
        isOpen={securityModalOpen}
        companies={data.companies}
        authConfig={data.authConfig}
        onClose={() => setSecurityModalOpen(false)}
        onUpdateAdminPasswordHash={(nextHash) =>
          setData((prev) => ({
            ...prev,
            authConfig: {
              ...prev.authConfig,
              adminPasswordHash: nextHash,
            },
          }))
        }
        onSetCompanyPasswordHash={handleSetCompanyPasswordHash}
      />

      <BackupModal
        isOpen={backupModalOpen}
        data={data}
        hasDemoData={hasDemoData}
        onClose={() => setBackupModalOpen(false)}
        onImport={(imported) => {
          clearAllSalesDrafts();
          setData(imported);
          setActiveView({ type: 'overview' });
        }}
        onLoadSampleData={handleLoadSampleData}
        onClearDemoData={handleClearDemoData}
        onClearAll={() => {
          clearAllSalesDrafts();
          setData((prev) => ({
            version: 1,
            companies: [],
            products: [],
            entries: {},
            cashTransactions: [],
            companyLedgerEntries: [],
            stockMovements: [],
            customers: [],
            customerCreditEntries: [],
            authConfig: {
              adminPasswordHash: prev.authConfig.adminPasswordHash,
              companyPasswordHashes: {},
            },
          }));
          setActiveView({ type: 'overview' });
        }}
      />
      <NotificationCenterModal
        isOpen={notificationModalOpen}
        notifications={stockNotifications}
        readSignatures={readNotificationSignatures}
        onClose={() => setNotificationModalOpen(false)}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onNavigateToStock={(alertFilter, companyId) => {
          if (companyId) {
            setSelectedModuleCompanyId(companyId);
          }
          setActiveView({
            type: 'stock',
            alertFilter,
            companyId,
            filterNonce: Date.now(),
          });
        }}
      />

      {/* Non-intrusive Live Alert Toast for Unread Godown Aging / Last 5 Carton Stock */}
      {unreadNotifications.length > 0 && !toastDismissed && !notificationModalOpen && (
        <div
          role="status"
          className="no-print fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-[0_18px_40px_-10px_rgba(15,41,66,0.28)]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1E3A8A] text-white">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-[#0f172a]">
                  নতুন স্টক নোটিফিকেশন ({unreadNotifications.length})
                </p>
                <div className="mt-1 space-y-0.5 text-xs font-semibold">
                  {unreadLowCount > 0 && (
                    <p className="flex items-center gap-1 text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {unreadLowCount}টি প্রোডাক্ট লাস্ট {LAST_FIVE_STOCK_THRESHOLD} কার্টন / লো-স্টকে
                    </p>
                  )}
                  {unreadAgedCount > 0 && (
                    <p className="flex items-center gap-1 text-amber-800">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {unreadAgedCount}টি প্রোডাক্ট ১ মাসের বেশি গুদামে
                    </p>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToastDismissed(true)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="নোটিশ বন্ধ করুন"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleMarkAllNotificationsRead}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              পঠিত
            </button>
            <button
              type="button"
              onClick={() => setNotificationModalOpen(true)}
              className="rounded-lg bg-[#1E3A8A] px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-[#172e6e]"
            >
              বিস্তারিত দেখুন
            </button>
          </div>
        </div>
      )}

      <ScrollToTopButton
        bottomPositionClass={
          unreadNotifications.length > 0 && !toastDismissed && !notificationModalOpen
            ? 'bottom-40'
            : 'bottom-5'
        }
      />
    </div>
  );
}

