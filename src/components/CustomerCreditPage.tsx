import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileImage,
  Pencil,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Share2,
  Store,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  Company,
  Customer,
  CustomerCreditEntry,
  CustomerCreditEntryType,
} from '../types/ledger';
import {
  compressImageFileToDataUrl,
  downloadCustomerCreditCsv,
  formatDateBn,
  formatTaka,
  getTodayISO,
  shiftDateISO,
} from '../utils/storage';
import { loadPersistedFilter, savePersistedFilter } from '../utils/salesDrafts';
import { Company1to1Summary } from '../utils/companySummary';
import { CompanyScopeBar } from './CompanyScopeBar';
import { PrintLetterhead, PrintSignatureFooter } from './PrintLetterhead';
import {
  createDateRangePreset,
  DateRangeFilterBar,
  DateRangeValue,
  formatDateRangeLabelBn,
  isDateInRange,
} from './DateRangeFilterBar';
import { ChalanMemoData, ChalanMemoModal } from './ChalanMemoModal';

type CustomerSummaryFilter =
  | 'all'
  | 'today_collection'
  | 'overdue'
  | 'due_only'
  | 'has_reminder';

function diffDaysFromISO(fromISO: string, toISO: string): number | null {
  if (!fromISO || !toISO) return null;
  const fromMs = new Date(`${fromISO}T00:00:00`).getTime();
  const toMs = new Date(`${toISO}T00:00:00`).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return null;
  return Math.round((toMs - fromMs) / 86400000);
}

function formatDaysAgoBn(daysAgo: number | null): string {
  if (daysAgo === null) return '';
  if (daysAgo === 0) return 'আজ দিয়েছে';
  if (daysAgo === 1) return 'গতকাল দিয়েছে';
  if (daysAgo > 1) return `${daysAgo} দিন আগে`;
  return 'আগাম তারিখ';
}

interface CustomerCreditPageProps {
  customers: Customer[];
  entries: CustomerCreditEntry[];
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompanyId: (companyId: string) => void;
  oneToOneSummary?: Company1to1Summary | null;
  orphanCustomerCount?: number;
  onAssignOrphansToCompany?: (companyId: string) => void;
  onOpenWorkspace?: (companyId: string) => void;
  onAddCompany?: () => void;
  onSaveCustomer: (
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
  ) => Customer | undefined;
  onDeleteCustomer: (customerId: string) => void;
  onAddEntry: (entry: Omit<CustomerCreditEntry, 'id' | 'createdAt'>) => void;
  onDeleteEntry: (entryId: string) => void;
}

export const CustomerCreditPage: React.FC<CustomerCreditPageProps> = ({
  customers,
  entries,
  companies,
  selectedCompanyId,
  onSelectCompanyId,
  oneToOneSummary,
  orphanCustomerCount = 0,
  onAssignOrphansToCompany,
  onOpenWorkspace,
  onAddCompany,
  onSaveCustomer,
  onDeleteCustomer,
  onAddEntry,
  onDeleteEntry,
}) => {
  const selectedCompany =
    companies.find((c) => c.id === selectedCompanyId) ?? companies[0] ?? null;

  const today = getTodayISO();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const entryFormRef = useRef<HTMLElement | null>(null);

  // Entry form state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    () => customers[0]?.id ?? ''
  );
  const [entryType, setEntryType] = useState<CustomerCreditEntryType>('credit_given');
  const [date, setDate] = useState<string>(today);
  const [amount, setAmount] = useState<string>('');
  const [memoNo, setMemoNo] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [memoImageDataUrl, setMemoImageDataUrl] = useState<string | undefined>(undefined);
  const [memoImageName, setMemoImageName] = useState<string | undefined>(undefined);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  // Optional collection reminder update during entry submit
  const [updateReminderOnEntry, setUpdateReminderOnEntry] = useState<boolean>(false);
  const [entryNextCollectionDate, setEntryNextCollectionDate] = useState<string>(() =>
    shiftDateISO(today, 7)
  );
  const [entryExpectedAmount, setEntryExpectedAmount] = useState<string>('');
  const [entryCollectionNote, setEntryCollectionNote] = useState<string>('');

  // Filters & search (persisted across tab switches & reloads)
  const [customerSearch, setCustomerSearch] = useState<string>(() =>
    loadPersistedFilter<string>('credit_customer_search', '')
  );
  const [customerFilter, setCustomerFilter] = useState<CustomerSummaryFilter>(() => {
    const saved = loadPersistedFilter<string>('credit_customer_filter', 'all');
    return saved === 'today_collection' ||
      saved === 'overdue' ||
      saved === 'due_only' ||
      saved === 'has_reminder'
      ? saved
      : 'all';
  });
  const [filterCustomerId, setFilterCustomerId] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | CustomerCreditEntryType>(() => {
    const saved = loadPersistedFilter<string>('credit_entry_type', 'all');
    return saved === 'credit_given' || saved === 'payment_received' ? saved : 'all';
  });
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const saved = loadPersistedFilter<DateRangeValue | null>('credit_date_range', null);
    if (saved && saved.preset && saved.fromDate && saved.toDate) {
      return saved;
    }
    return createDateRangePreset('all', today);
  });
  const [entrySearch, setEntrySearch] = useState<string>('');

  useEffect(() => {
    savePersistedFilter('credit_customer_search', customerSearch);
  }, [customerSearch]);

  useEffect(() => {
    savePersistedFilter('credit_customer_filter', customerFilter);
  }, [customerFilter]);

  useEffect(() => {
    savePersistedFilter('credit_entry_type', filterType);
  }, [filterType]);

  useEffect(() => {
    savePersistedFilter('credit_date_range', dateRange);
  }, [dateRange]);

  // Lightbox preview for memo photo
  const [previewEntry, setPreviewEntry] = useState<CustomerCreditEntry | null>(null);

  // Customer add/edit modal state
  const [customerModalOpen, setCustomerModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [custName, setCustName] = useState<string>('');
  const [custShopName, setCustShopName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [custAddress, setCustAddress] = useState<string>('');
  const [custNextCollectionDate, setCustNextCollectionDate] = useState<string>('');
  const [custExpectedAmount, setCustExpectedAmount] = useState<string>('');
  const [custCollectionNote, setCustCollectionNote] = useState<string>('');
  const [custError, setCustError] = useState<string>('');
  const [confirmDeleteCustomerId, setConfirmDeleteCustomerId] = useState<string | null>(null);
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null);

  // Quick collection reminder modal state
  const [reminderCustomer, setReminderCustomer] = useState<Customer | null>(null);
  const [remDate, setRemDate] = useState<string>('');
  const [remExpectedAmount, setRemExpectedAmount] = useState<string>('');
  const [remNote, setRemNote] = useState<string>('');

  // Chalan / Memo print & share modal state
  const [activeMemo, setActiveMemo] = useState<ChalanMemoData | null>(null);

  useEffect(() => {
    setFilterCustomerId('all');
  }, [selectedCompany?.id]);

  useEffect(() => {
    if (customers.length > 0 && !customers.some((c) => c.id === selectedCustomerId)) {
      setSelectedCustomerId(customers[0].id);
    } else if (customers.length === 0) {
      setSelectedCustomerId('');
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (!previewEntry && !customerModalOpen && !reminderCustomer) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewEntry) setPreviewEntry(null);
        else if (reminderCustomer) setReminderCustomer(null);
        else if (customerModalOpen) setCustomerModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewEntry, customerModalOpen, reminderCustomer]);

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers]
  );

  // Automated per-customer summary & chronological running balance per entry
  const { customerSummaries, runningBalanceByEntryId } = useMemo(() => {
    const summaryMap = new Map<
      string,
      {
        customer: Customer;
        totalCredit: number;
        totalPaid: number;
        currentDue: number;
        memoCount: number;
        paymentCount: number;
        lastDate: string;
        lastPaymentDate: string;
        lastPaymentAmount: number;
        lastCreditDate: string;
        daysSinceLastPayment: number | null;
        isTodayCollection: boolean;
        isOverdueCollection: boolean;
        isUpcomingCollection: boolean;
        overdueDays: number;
        hasReminder: boolean;
      }
    >();

    for (const c of customers) {
      summaryMap.set(c.id, {
        customer: c,
        totalCredit: 0,
        totalPaid: 0,
        currentDue: 0,
        memoCount: 0,
        paymentCount: 0,
        lastDate: '',
        lastPaymentDate: '',
        lastPaymentAmount: 0,
        lastCreditDate: '',
        daysSinceLastPayment: null,
        isTodayCollection: false,
        isOverdueCollection: false,
        isUpcomingCollection: false,
        overdueDays: 0,
        hasReminder: Boolean(
          c.nextCollectionDate ||
            c.collectionNote?.trim() ||
            (c.expectedCollectionAmount && c.expectedCollectionAmount > 0)
        ),
      });
    }

    // Sort chronologically ascending to compute exact running balance & latest payment date/amount
    const chronological = [...entries].sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.createdAt.localeCompare(b.createdAt);
    });

    const runningMap = new Map<string, number>();

    for (const item of chronological) {
      const row = summaryMap.get(item.customerId);
      if (!row) continue;

      if (item.type === 'credit_given') {
        row.totalCredit = Number((row.totalCredit + item.amount).toFixed(2));
        row.memoCount += 1;
        if (!row.lastCreditDate || item.date >= row.lastCreditDate) {
          row.lastCreditDate = item.date;
        }
      } else {
        row.totalPaid = Number((row.totalPaid + item.amount).toFixed(2));
        row.paymentCount += 1;
        if (!row.lastPaymentDate || item.date >= row.lastPaymentDate) {
          row.lastPaymentDate = item.date;
          row.lastPaymentAmount = item.amount;
        }
      }
      row.currentDue = Number((row.totalCredit - row.totalPaid).toFixed(2));
      if (!row.lastDate || item.date > row.lastDate) {
        row.lastDate = item.date;
      }
      runningMap.set(item.id, row.currentDue);
    }

    for (const row of summaryMap.values()) {
      row.daysSinceLastPayment = row.lastPaymentDate
        ? diffDaysFromISO(row.lastPaymentDate, today)
        : null;
      const nextDate = row.customer.nextCollectionDate;
      if (nextDate) {
        if (nextDate === today) {
          row.isTodayCollection = true;
        } else if (nextDate < today && row.currentDue > 0) {
          row.isOverdueCollection = true;
          row.overdueDays = diffDaysFromISO(nextDate, today) ?? 0;
        } else if (nextDate > today) {
          row.isUpcomingCollection = true;
        }
      }
    }

    return {
      customerSummaries: Array.from(summaryMap.values()).sort(
        (a, b) => b.currentDue - a.currentDue
      ),
      runningBalanceByEntryId: runningMap,
    };
  }, [customers, entries, today]);

  const filteredCustomerSummaries = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    return customerSummaries.filter((row) => {
      if (customerFilter === 'due_only' && row.currentDue <= 0) return false;
      if (customerFilter === 'today_collection' && !row.isTodayCollection) return false;
      if (customerFilter === 'overdue' && !row.isOverdueCollection) return false;
      if (customerFilter === 'has_reminder' && !row.hasReminder) return false;

      if (!q) return true;
      const hay = [
        row.customer.name,
        row.customer.shopName ?? '',
        row.customer.phone ?? '',
        row.customer.address ?? '',
        row.customer.collectionNote ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [customerSummaries, customerSearch, customerFilter]);

  const agencyTotals = useMemo(() => {
    let totalCredit = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let dueCustomerCount = 0;
    let todayCount = 0;
    let todayExpectedTotal = 0;
    let todayDueTotal = 0;
    let overdueCount = 0;
    let overdueDueTotal = 0;
    let reminderCount = 0;

    for (const row of customerSummaries) {
      totalCredit += row.totalCredit;
      totalPaid += row.totalPaid;
      totalDue += row.currentDue;
      if (row.currentDue > 0) dueCustomerCount += 1;
      if (row.hasReminder) reminderCount += 1;

      if (row.isTodayCollection) {
        todayCount += 1;
        const target =
          row.customer.expectedCollectionAmount && row.customer.expectedCollectionAmount > 0
            ? row.customer.expectedCollectionAmount
            : Math.max(0, row.currentDue);
        todayExpectedTotal += target;
        todayDueTotal += Math.max(0, row.currentDue);
      }

      if (row.isOverdueCollection) {
        overdueCount += 1;
        overdueDueTotal += Math.max(0, row.currentDue);
      }
    }

    return {
      totalCredit: Number(totalCredit.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalDue: Number(totalDue.toFixed(2)),
      dueCustomerCount,
      todayCount,
      todayExpectedTotal: Number(todayExpectedTotal.toFixed(2)),
      todayDueTotal: Number(todayDueTotal.toFixed(2)),
      overdueCount,
      overdueDueTotal: Number(overdueDueTotal.toFixed(2)),
      reminderCount,
    };
  }, [customerSummaries]);

  const todayCollectionRows = useMemo(
    () => customerSummaries.filter((row) => row.isTodayCollection),
    [customerSummaries]
  );

  const selectedCustomerSummary = useMemo(() => {
    return customerSummaries.find((s) => s.customer.id === selectedCustomerId) ?? null;
  }, [customerSummaries, selectedCustomerId]);

  const projectedBalance = useMemo(() => {
    if (!selectedCustomerSummary) return null;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const next =
      entryType === 'credit_given'
        ? selectedCustomerSummary.currentDue + numeric
        : selectedCustomerSummary.currentDue - numeric;
    return Number(next.toFixed(2));
  }, [selectedCustomerSummary, amount, entryType]);

  const filteredEntries = useMemo(() => {
    const q = entrySearch.trim().toLowerCase();
    return entries
      .filter((item) =>
        filterCustomerId === 'all' ? true : item.customerId === filterCustomerId
      )
      .filter((item) => (filterType === 'all' ? true : item.type === filterType))
      .filter((item) => isDateInRange(item.date, dateRange))
      .filter((item) => {
        if (!q) return true;
        const cust = customerMap.get(item.customerId);
        const hay = [
          cust?.name ?? '',
          cust?.shopName ?? '',
          item.memoNo ?? '',
          item.note ?? '',
          String(item.amount),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [entries, filterCustomerId, filterType, dateRange, entrySearch, customerMap]);

  const filteredEntryTotals = useMemo(() => {
    let totalCredit = 0;
    let totalPaid = 0;
    for (const item of filteredEntries) {
      if (item.type === 'credit_given') totalCredit += item.amount;
      else totalPaid += item.amount;
    }
    return {
      totalCredit: Number(totalCredit.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
    };
  }, [filteredEntries]);

  const openAddCustomerModal = () => {
    setEditingCustomer(null);
    setCustName('');
    setCustShopName('');
    setCustPhone('');
    setCustAddress('');
    setCustNextCollectionDate('');
    setCustExpectedAmount('');
    setCustCollectionNote('');
    setCustError('');
    setCustomerModalOpen(true);
  };

  const openEditCustomerModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustName(customer.name);
    setCustShopName(customer.shopName ?? '');
    setCustPhone(customer.phone ?? '');
    setCustAddress(customer.address ?? '');
    setCustNextCollectionDate(customer.nextCollectionDate ?? '');
    setCustExpectedAmount(
      customer.expectedCollectionAmount && customer.expectedCollectionAmount > 0
        ? String(customer.expectedCollectionAmount)
        : ''
    );
    setCustCollectionNote(customer.collectionNote ?? '');
    setCustError('');
    setCustomerModalOpen(true);
  };

  const openReminderModal = (customer: Customer) => {
    setReminderCustomer(customer);
    setRemDate(customer.nextCollectionDate || today);
    setRemExpectedAmount(
      customer.expectedCollectionAmount && customer.expectedCollectionAmount > 0
        ? String(customer.expectedCollectionAmount)
        : ''
    );
    setRemNote(customer.collectionNote ?? '');
  };

  const handleReminderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderCustomer || !selectedCompany) return;
    const numericExpected = Number(remExpectedAmount);
    onSaveCustomer(
      {
        companyId: selectedCompany.id,
        name: reminderCustomer.name,
        shopName: reminderCustomer.shopName,
        phone: reminderCustomer.phone,
        address: reminderCustomer.address,
        nextCollectionDate: remDate.trim() || undefined,
        expectedCollectionAmount:
          Number.isFinite(numericExpected) && numericExpected > 0
            ? Number(numericExpected.toFixed(2))
            : undefined,
        collectionNote: remNote.trim() || undefined,
      },
      reminderCustomer.id
    );
    setReminderCustomer(null);
  };

  const handleCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    const cleanName = custName.trim();
    if (!cleanName) {
      setCustError('কাস্টমারের নাম অবশ্যই লিখতে হবে।');
      return;
    }
    const numericExpected = Number(custExpectedAmount);
    const saved = onSaveCustomer(
      {
        companyId: selectedCompany.id,
        name: cleanName,
        shopName: custShopName.trim() || undefined,
        phone: custPhone.trim() || undefined,
        address: custAddress.trim() || undefined,
        nextCollectionDate: custNextCollectionDate.trim() || undefined,
        expectedCollectionAmount:
          Number.isFinite(numericExpected) && numericExpected > 0
            ? Number(numericExpected.toFixed(2))
            : undefined,
        collectionNote: custCollectionNote.trim() || undefined,
      },
      editingCustomer?.id
    );
    if (saved && !editingCustomer) {
      setSelectedCustomerId(saved.id);
    }
    setCustomerModalOpen(false);
    setEditingCustomer(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFormError('অনুগ্রহ করে শুধু ছবির ফাইল (JPG, PNG, WebP) সিলেক্ট করুন।');
      return;
    }

    setIsCompressing(true);
    setFormError('');
    try {
      const compressed = await compressImageFileToDataUrl(file, 1200, 0.72);
      setMemoImageDataUrl(compressed);
      setMemoImageName(file.name);
    } catch {
      setFormError('মেমোর ছবিটি প্রসেস করা যায়নি। অন্য ছবি দিয়ে চেষ্টা করুন।');
    } finally {
      setIsCompressing(false);
    }
  };

  const clearSelectedFile = () => {
    setMemoImageDataUrl(undefined);
    setMemoImageName(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEntrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    if (!selectedCustomerId) {
      setFormError('অনুগ্রহ করে একজন কাস্টমার সিলেক্ট করুন।');
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError('সঠিক টাকার পরিমাণ (০ এর বেশি) লিখুন।');
      return;
    }

    onAddEntry({
      companyId: selectedCompany.id,
      customerId: selectedCustomerId,
      date,
      type: entryType,
      amount: Number(numericAmount.toFixed(2)),
      memoNo: memoNo.trim() || undefined,
      note: note.trim() || undefined,
      memoImageDataUrl,
      memoImageName,
    });

    if (updateReminderOnEntry) {
      const targetCustomer = customerMap.get(selectedCustomerId);
      if (targetCustomer) {
        const numericExpected = Number(entryExpectedAmount);
        onSaveCustomer(
          {
            companyId: selectedCompany.id,
            name: targetCustomer.name,
            shopName: targetCustomer.shopName,
            phone: targetCustomer.phone,
            address: targetCustomer.address,
            nextCollectionDate: entryNextCollectionDate.trim() || undefined,
            expectedCollectionAmount:
              Number.isFinite(numericExpected) && numericExpected > 0
                ? Number(numericExpected.toFixed(2))
                : targetCustomer.expectedCollectionAmount,
            collectionNote:
              entryCollectionNote.trim() || targetCustomer.collectionNote || undefined,
          },
          targetCustomer.id
        );
      }
      setUpdateReminderOnEntry(false);
      setEntryExpectedAmount('');
      setEntryCollectionNote('');
    }

    setAmount('');
    setMemoNo('');
    setNote('');
    clearSelectedFile();
    setFormError('');
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleQuickAction = (
    customerId: string,
    mode: CustomerCreditEntryType
  ) => {
    setSelectedCustomerId(customerId);
    setEntryType(mode);
    setFilterCustomerId(customerId);
    setFormError('');
    entryFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => amountInputRef.current?.focus(), 250);
  };

  if (!selectedCompany) {
    return (
      <div className="space-y-6">
        <CompanyScopeBar
          companies={companies}
          selectedCompanyId={selectedCompanyId}
          onSelectCompanyId={onSelectCompanyId}
          onAddCompany={onAddCompany}
          moduleLabel="কাস্টমার বাকি"
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PrintLetterhead
        reportTitle={`${selectedCompany.name} · কাস্টমার বাকি (ক্রেডিট) ও কালেকশন রিপোর্ট`}
        reportDate={formatDateBn(today, true)}
        subtitle={`কোম্পানি: ${selectedCompany.name} · মোট ক্রেডিট: ${formatTaka(agencyTotals.totalCredit)} · মোট জমা: ${formatTaka(agencyTotals.totalPaid)} · মোট বাকি: ${formatTaka(agencyTotals.totalDue)}${
          agencyTotals.todayCount > 0
            ? ` · আজকের কালেকশন: ${agencyTotals.todayCount}টি দোকান (${formatTaka(agencyTotals.todayExpectedTotal)})`
            : ''
        }`}
      />

      <CompanyScopeBar
        companies={companies}
        selectedCompanyId={selectedCompany.id}
        onSelectCompanyId={onSelectCompanyId}
        summary={oneToOneSummary}
        onOpenWorkspace={onOpenWorkspace}
        onAddCompany={onAddCompany}
        moduleLabel="কাস্টমার বাকি"
      />

      {orphanCustomerCount > 0 && onAssignOrphansToCompany && (
        <div className="no-print flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-amber-950">
            পুরানো {orphanCustomerCount}টি কাস্টমার / বাকি এন্ট্রি কোনো নির্দিষ্ট কোম্পানির সাথে যুক্ত নেই।
          </p>
          <button
            type="button"
            onClick={() => onAssignOrphansToCompany(selectedCompany.id)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-[#1E3A8A] px-3.5 py-1.5 text-xs sm:text-sm font-bold text-white hover:bg-[#172e6e] whitespace-nowrap sm:self-auto"
          >
            সবগুলো {selectedCompany.name}-এ যুক্ত করুন
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1e293b]">
            Khan Enterprise · {selectedCompany.name} · স্বয়ংক্রিয় কাস্টমার ক্রেডিট ও মেমো সংরক্ষণ
          </p>
          <h1 className="mt-1 text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#0f172a]">
            {selectedCompany.name} — কাস্টমার বাকি (ক্রেডিট) খাতা
          </h1>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openAddCustomerModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap"
          >
            <UserPlus className="h-4 w-4" />
            নতুন কাস্টমার
          </button>

          {entries.length > 0 && (
            <button
              type="button"
              onClick={() =>
                downloadCustomerCreditCsv(entries, customers, selectedCompany.name)
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              Excel (CSV)
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            প্রিন্ট
          </button>
        </div>
      </div>

      {/* Agency Customer Credit KPI Summary Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-6px_rgba(15,41,66,0.1)]">
          <p className="text-sm font-bold text-[#0f172a]">মোট কাস্টমার</p>
          <p className="font-mono-tabular mt-2 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {customers.length} জন
          </p>
          <p className="mt-1 text-sm font-medium text-[#1e293b]">
            বাকি আছে: {agencyTotals.dueCustomerCount} জনের কাছে
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-6px_rgba(15,41,66,0.1)]">
          <p className="text-sm font-bold text-[#0f172a]">মোট ক্রেডিট (মাল নিয়েছে)</p>
          <p className="font-mono-tabular mt-2 text-2xl sm:text-[26px] font-extrabold text-[#0f2942]">
            {formatTaka(agencyTotals.totalCredit)}
          </p>
          <p className="mt-1 text-sm font-medium text-[#1e293b]">
            সকল মেমো মিলিয়ে মোট বাকি দেওয়া
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/60 p-5 shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-6px_rgba(15,41,66,0.1)]">
          <p className="text-sm font-bold text-emerald-900">মোট টাকা জমা (পোস্ট)</p>
          <p className="font-mono-tabular mt-2 text-2xl sm:text-[26px] font-extrabold text-emerald-800">
            {formatTaka(agencyTotals.totalPaid)}
          </p>
          <p className="mt-1 text-sm font-medium text-[#1e293b]">
            কাস্টমারদের থেকে আদায়কৃত টাকা
          </p>
        </div>

        <div
          className={`rounded-2xl border p-5 shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-6px_rgba(15,41,66,0.1)] ${
            agencyTotals.totalDue > 0
              ? 'border-amber-300/90 bg-amber-50/70'
              : 'border-teal-200/90 bg-teal-50/65'
          }`}
        >
          <p className="text-sm font-bold text-[#0f172a]">বর্তমান মোট বাকি পাওনা</p>
          <p
            className={`font-mono-tabular mt-2 text-2xl sm:text-[26px] font-extrabold ${
              agencyTotals.totalDue > 0 ? 'text-amber-800' : 'text-teal-800'
            }`}
          >
            {formatTaka(Math.abs(agencyTotals.totalDue))}
          </p>
          <p className="mt-1 text-sm font-medium text-[#1e293b]">
            {agencyTotals.totalDue > 0
              ? 'সকল কাস্টমারের কাছে মোট পাওনা'
              : agencyTotals.totalDue < 0
                ? 'কাস্টমারদের অগ্রিম জমা আছে'
                : 'কোনো বকেয়া নেই'}
          </p>
        </div>
      </section>

      {/* Today's Collection & Overdue Reminder Tracking Strip */}
      {customers.length > 0 && (
        <section className="rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-50/75 via-white to-amber-50/50 p-5 shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-xs">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-[#0f172a]">
                  আজকের কালেকশন ও কিস্তি রিমাইন্ডার ট্র্যাকিং ({formatDateBn(today)})
                </h2>
                <p className="mt-0.5 text-sm font-medium text-[#1e293b]">
                  আজ কোন কোন দোকান থেকে টাকা পাওয়া যাবে এবং কাদের রিমাইন্ডার তারিখ পার হয়েছে তা এক নজরে দেখুন।
                </p>
              </div>
            </div>

            <div className="no-print flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCustomerFilter((prev) =>
                    prev === 'today_collection' ? 'all' : 'today_collection'
                  )
                }
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold transition-all whitespace-nowrap ${
                  customerFilter === 'today_collection'
                    ? 'border-teal-800 bg-teal-700 text-white shadow-xs'
                    : 'border-teal-300 bg-white text-[#0f172a] hover:bg-teal-50'
                }`}
              >
                <Bell className="h-4 w-4" />
                <span>আজকের কালেকশন: {agencyTotals.todayCount}টি</span>
                {agencyTotals.todayExpectedTotal > 0 && (
                  <span
                    className={`font-mono-tabular rounded-md px-1.5 py-0.5 text-xs font-bold ${
                      customerFilter === 'today_collection'
                        ? 'bg-teal-800 text-white'
                        : 'bg-teal-100 text-teal-900'
                    }`}
                  >
                    {formatTaka(agencyTotals.todayExpectedTotal)}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  setCustomerFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))
                }
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold transition-all whitespace-nowrap ${
                  customerFilter === 'overdue'
                    ? 'border-rose-700 bg-rose-600 text-white shadow-xs'
                    : agencyTotals.overdueCount > 0
                      ? 'border-rose-300 bg-rose-50/80 text-rose-900 hover:bg-rose-100'
                      : 'border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50'
                }`}
              >
                <AlertCircle className="h-4 w-4" />
                <span>তারিখ পার / ওভারডিউ: {agencyTotals.overdueCount}টি</span>
                {agencyTotals.overdueDueTotal > 0 && (
                  <span
                    className={`font-mono-tabular rounded-md px-1.5 py-0.5 text-xs font-bold ${
                      customerFilter === 'overdue'
                        ? 'bg-rose-800 text-white'
                        : 'bg-rose-100 text-rose-900'
                    }`}
                  >
                    {formatTaka(agencyTotals.overdueDueTotal)}
                  </span>
                )}
              </button>
            </div>
          </div>

          {todayCollectionRows.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {todayCollectionRows.map((row) => {
                const targetAmount =
                  row.customer.expectedCollectionAmount &&
                  row.customer.expectedCollectionAmount > 0
                    ? row.customer.expectedCollectionAmount
                    : Math.max(0, row.currentDue);

                return (
                  <div
                    key={row.customer.id}
                    className="flex flex-col justify-between rounded-xl border border-teal-200 bg-white p-3.5 shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-bold text-[#0f172a]">
                            {row.customer.shopName || row.customer.name}
                          </p>
                          <p className="truncate text-xs font-semibold text-[#1e293b]">
                            {row.customer.shopName ? `${row.customer.name}` : ''}
                            {row.customer.phone ? ` · ${row.customer.phone}` : ''}
                          </p>
                        </div>
                        <span className="font-mono-tabular shrink-0 rounded-md bg-teal-50 px-2 py-1 text-xs font-extrabold text-teal-900 border border-teal-200">
                          {targetAmount > 0 ? formatTaka(targetAmount) : 'পরিশোধিত'}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[#1e293b]">
                        <span>
                          মোট বাকি:{' '}
                          <strong className="font-mono-tabular text-amber-800">
                            {formatTaka(Math.max(0, row.currentDue))}
                          </strong>
                        </span>
                        <span>
                          শেষ জমা:{' '}
                          <strong className="font-mono-tabular text-[#0f172a]">
                            {row.lastPaymentDate
                              ? `${formatDateBn(row.lastPaymentDate)} (${formatDaysAgoBn(row.daysSinceLastPayment)})`
                              : 'এখনও দেয়নি'}
                          </strong>
                        </span>
                      </div>

                      {row.customer.collectionNote && (
                        <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-1.5 text-xs font-semibold text-[#0f172a]">
                          নোট: {row.customer.collectionNote}
                        </p>
                      )}
                    </div>

                    <div className="no-print mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                      <button
                        type="button"
                        onClick={() => openReminderModal(row.customer)}
                        className="text-xs font-bold text-teal-800 hover:underline"
                      >
                        তারিখ / নোট বদলান
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickAction(row.customer.id, 'payment_received')
                        }
                        className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
                      >
                        − কালেকশন জমা নিন
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-teal-300/80 bg-white/80 px-4 py-3 text-sm font-medium text-[#1e293b]">
              <span>
                আজকের জন্য কোনো দোকানের কালেকশন রিমাইন্ডার সেট করা নেই। নিচের টেবিল থেকে যেকোনো দোকানে <strong>“রিমাইন্ডার সেট”</strong> বাটনে ক্লিক করে তারিখ ও নোট দিন।
              </span>
              {agencyTotals.overdueCount > 0 && (
                <button
                  type="button"
                  onClick={() => setCustomerFilter('overdue')}
                  className="no-print text-sm font-bold text-rose-700 hover:underline"
                >
                  তারিখ পার হওয়া {agencyTotals.overdueCount}টি দোকান দেখুন →
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Automated Customer-Wise Balance Summary Table */}
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)]">
        <div className="space-y-3 border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#0f172a]">
                কাস্টমার ওয়াইজ বকেয়া, শেষ জমা ও কালেকশন ট্র্যাকিং
              </h2>
              <p className="text-sm font-medium text-[#1e293b]">
                কোন দোকানে কত বাকি, শেষ কবে টাকা দিয়েছে এবং পরবর্তী কালেকশনের তারিখ ও রিমাইন্ডার নোট একসাথে দেখুন।
              </p>
            </div>

            {customers.length > 0 && (
              <div className="no-print relative min-w-0 w-full sm:max-w-xs lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="দোকান, কাস্টমার, ফোন বা নোট খুঁজুন..."
                  className="w-full min-h-[42px] sm:min-h-0 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-base sm:text-sm font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
                />
              </div>
            )}
          </div>

          {customers.length > 0 && (
            <div className="no-print flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => setCustomerFilter('all')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  customerFilter === 'all'
                    ? 'border-[#0f2942] bg-[#0f2942] text-white'
                    : 'border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50'
                }`}
              >
                সব দোকান ({customerSummaries.length})
              </button>
              <button
                type="button"
                onClick={() => setCustomerFilter('today_collection')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  customerFilter === 'today_collection'
                    ? 'border-teal-700 bg-teal-700 text-white'
                    : 'border-teal-300 bg-teal-50/70 text-teal-900 hover:bg-teal-100'
                }`}
              >
                আজকের কালেকশন ({agencyTotals.todayCount})
              </button>
              <button
                type="button"
                onClick={() => setCustomerFilter('overdue')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  customerFilter === 'overdue'
                    ? 'border-rose-700 bg-rose-600 text-white'
                    : agencyTotals.overdueCount > 0
                      ? 'border-rose-300 bg-rose-50/80 text-rose-900 hover:bg-rose-100'
                      : 'border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50'
                }`}
              >
                তারিখ পার / বকেয়া ({agencyTotals.overdueCount})
              </button>
              <button
                type="button"
                onClick={() => setCustomerFilter('due_only')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  customerFilter === 'due_only'
                    ? 'border-amber-700 bg-amber-600 text-white'
                    : 'border-amber-300 bg-amber-50/70 text-amber-950 hover:bg-amber-100'
                }`}
              >
                শুধু বাকি আছে ({agencyTotals.dueCustomerCount})
              </button>
              <button
                type="button"
                onClick={() => setCustomerFilter('has_reminder')}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  customerFilter === 'has_reminder'
                    ? 'border-indigo-700 bg-indigo-700 text-white'
                    : 'border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50'
                }`}
              >
                রিমাইন্ডার সেট আছে ({agencyTotals.reminderCount})
              </button>
              {(customerFilter !== 'all' || customerSearch.trim() !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerFilter('all');
                    setCustomerSearch('');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  ফিল্টার রিসেট
                </button>
              )}
            </div>
          )}
        </div>

        {customers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Users className="mx-auto h-9 w-9 text-slate-400" />
            <p className="mt-2 text-base font-bold text-[#0f172a]">
              এখনও কোনো কাস্টমার যোগ করা হয়নি
            </p>
            <p className="mt-1 text-sm font-medium text-[#1e293b]">
              কাস্টমার বাকি, মেমোর ছবি ও টাকা আদায়ের হিসাব রাখতে প্রথম কাস্টমার যোগ করুন।
            </p>
            <button
              type="button"
              onClick={openAddCustomerModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              <UserPlus className="h-4 w-4" />
              প্রথম কাস্টমার যোগ করুন
            </button>
          </div>
        ) : filteredCustomerSummaries.length === 0 ? (
          <div className="px-6 py-10 text-center text-[15px] font-medium text-[#1e293b]">
            এই সার্চ বা ফিল্টারে কোনো কাস্টমার/দোকান পাওয়া যায়নি।
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                  <th className="py-3.5 pl-5 pr-3">দোকান ও কাস্টমার</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">মোট ক্রেডিট (+)</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">মোট টাকা জমা (−)</th>
                  <th className="px-3 py-3.5 text-right whitespace-nowrap">বর্তমান বাকি</th>
                  <th className="px-3 py-3.5 whitespace-nowrap">শেষ কবে টাকা দিয়েছে</th>
                  <th className="px-3 py-3.5">পরবর্তী কালেকশন ও রিমাইন্ডার</th>
                  <th className="no-print py-3.5 pl-3 pr-5 text-right whitespace-nowrap">দ্রুত এন্ট্রি ও অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {filteredCustomerSummaries.map((row) => {
                  const isFiltered = filterCustomerId === row.customer.id;
                  const isConfirmingDelete = confirmDeleteCustomerId === row.customer.id;

                  return (
                    <tr
                      key={row.customer.id}
                      onClick={() => {
                        setSelectedCustomerId(row.customer.id);
                        setFilterCustomerId((prev) =>
                          prev === row.customer.id ? 'all' : row.customer.id
                        );
                      }}
                      className={`cursor-pointer transition-colors ${
                        isFiltered
                          ? 'bg-teal-50/75'
                          : row.isTodayCollection
                            ? 'bg-teal-50/30 hover:bg-teal-50/60'
                            : row.isOverdueCollection
                              ? 'bg-rose-50/25 hover:bg-rose-50/50'
                              : 'hover:bg-teal-50/40'
                      }`}
                    >
                      <td className="py-3.5 pl-5 pr-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5 font-bold text-[#0f172a]">
                          {row.customer.shopName ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-teal-900">
                                <Store className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                                {row.customer.shopName}
                              </span>
                              <span className="text-sm font-semibold text-[#1e293b]">
                                · {row.customer.name}
                              </span>
                            </>
                          ) : (
                            <span>{row.customer.name}</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-[#1e293b]">
                          {row.customer.phone && (
                            <a
                              href={`tel:${row.customer.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono-tabular inline-flex items-center gap-1 font-semibold text-teal-800 hover:underline"
                            >
                              <Phone className="h-3 w-3" />
                              {row.customer.phone}
                            </a>
                          )}
                          {row.customer.address && <span>· {row.customer.address}</span>}
                          <span className="text-xs font-semibold text-slate-600">
                            (মেমো {row.memoCount} · জমা {row.paymentCount})
                          </span>
                        </div>
                      </td>

                      <td className="font-mono-tabular px-3 py-3.5 text-right align-top font-semibold text-[#0f172a] whitespace-nowrap">
                        {formatTaka(row.totalCredit)}
                      </td>

                      <td className="font-mono-tabular px-3 py-3.5 text-right align-top font-semibold text-emerald-700 whitespace-nowrap">
                        {formatTaka(row.totalPaid)}
                      </td>

                      <td className="font-mono-tabular px-3 py-3.5 text-right align-top whitespace-nowrap">
                        {row.currentDue > 0 ? (
                          <div>
                            <div className="font-extrabold text-amber-800">
                              {formatTaka(row.currentDue)}
                            </div>
                            <div className="text-xs font-bold text-amber-800">
                              বাকি পাব
                            </div>
                          </div>
                        ) : row.currentDue < 0 ? (
                          <div>
                            <div className="font-bold text-emerald-700">
                              {formatTaka(Math.abs(row.currentDue))}
                            </div>
                            <div className="text-xs font-semibold text-emerald-700">
                              অগ্রিম জমা
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            ৳ 0 (পরিশোধ)
                          </span>
                        )}
                      </td>

                      {/* Last Payment Date & Amount */}
                      <td className="px-3 py-3.5 align-top whitespace-nowrap">
                        {row.lastPaymentDate ? (
                          <div>
                            <div className="font-mono-tabular text-sm font-bold text-[#0f172a]">
                              {formatDateBn(row.lastPaymentDate)}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold">
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800 border border-emerald-200">
                                {formatDaysAgoBn(row.daysSinceLastPayment)}
                              </span>
                              <span className="font-mono-tabular text-[#1e293b]">
                                {formatTaka(row.lastPaymentAmount)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-sm font-semibold text-rose-700">
                              এখনও জমা দেয়নি
                            </div>
                            {row.lastCreditDate && (
                              <div className="font-mono-tabular text-xs font-medium text-[#1e293b]">
                                শেষ মাল: {formatDateBn(row.lastCreditDate)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Next Collection Date, Target Amount & Reminder Note */}
                      <td
                        className="px-3 py-3.5 align-top min-w-[210px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="space-y-1">
                          {row.isTodayCollection ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-teal-300 bg-teal-100/90 px-2 py-0.5 text-xs font-extrabold text-teal-950">
                              <Bell className="h-3 w-3" />
                              আজ কালেকশন ({formatDateBn(row.customer.nextCollectionDate!)})
                            </span>
                          ) : row.isOverdueCollection ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-xs font-extrabold text-rose-900">
                              <AlertCircle className="h-3 w-3" />
                              সময় পার ({row.overdueDays} দিন) ·{' '}
                              {formatDateBn(row.customer.nextCollectionDate!)}
                            </span>
                          ) : row.customer.nextCollectionDate ? (
                            <span className="font-mono-tabular inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-bold text-[#0f172a]">
                              <CalendarClock className="h-3 w-3 text-teal-700" />
                              {formatDateBn(row.customer.nextCollectionDate)}
                            </span>
                          ) : null}

                          {row.customer.expectedCollectionAmount &&
                            row.customer.expectedCollectionAmount > 0 && (
                              <div className="font-mono-tabular text-xs font-bold text-[#0f2942]">
                                নির্ধারিত কিস্তি: {formatTaka(row.customer.expectedCollectionAmount)}
                              </div>
                            )}

                          {row.customer.collectionNote && (
                            <p className="text-xs font-semibold text-[#1e293b] leading-snug">
                              {row.customer.collectionNote}
                            </p>
                          )}

                          <button
                            type="button"
                            onClick={() => openReminderModal(row.customer)}
                            className="no-print inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold text-teal-800 hover:border-teal-600 hover:bg-teal-50"
                          >
                            <CalendarClock className="h-3 w-3" />
                            {row.hasReminder ? 'রিমাইন্ডার এডিট' : 'রিমাইন্ডার সেট'}
                          </button>
                        </div>
                      </td>

                      <td
                        className="no-print py-3.5 pl-3 pr-5 text-right align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-rose-700">মুছবেন?</span>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteCustomer(row.customer.id);
                                setConfirmDeleteCustomerId(null);
                              }}
                              className="rounded-md bg-rose-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-rose-700"
                            >
                              হ্যাঁ
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCustomerId(null)}
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-[#0f172a] hover:bg-slate-50"
                            >
                              না
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleQuickAction(row.customer.id, 'credit_given')
                              }
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-[#0f172a] hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800 whitespace-nowrap"
                            >
                              + মেমো
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleQuickAction(row.customer.id, 'payment_received')
                              }
                              className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                            >
                              − টাকা জমা
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMemo({
                                  docKind: 'customer_statement',
                                  docNumber: `বকেয়া স্টেটমেন্ট`,
                                  title: 'কাস্টমার বকেয়া ও কিস্তি মেমো',
                                  badgeText:
                                    row.currentDue > 0
                                      ? 'বকেয়া পাওনা'
                                      : row.currentDue < 0
                                        ? 'অগ্রিম জমা'
                                        : 'পরিশোধিত',
                                  badgeTone:
                                    row.currentDue > 0
                                      ? 'amber'
                                      : row.currentDue < 0
                                        ? 'emerald'
                                        : 'teal',
                                  date: today,
                                  partyLabel: 'কাস্টমার ও দোকান',
                                  partyName: row.customer.shopName || row.customer.name,
                                  partySubline: row.customer.shopName ? row.customer.name : undefined,
                                  partyPhone: row.customer.phone,
                                  partyAddress: row.customer.address,
                                  description: `মোট ক্রেডিট মেমো: ${row.memoCount}টি · মোট টাকা জমা: ${row.paymentCount}টি`,
                                  note: row.customer.collectionNote,
                                  primaryAmountLabel: 'বর্তমান অবশিষ্ট বাকি',
                                  primaryAmount: Math.max(0, row.currentDue),
                                  secondaryStats: [
                                    {
                                      label: 'মোট ক্রেডিট (মাল)',
                                      value: formatTaka(row.totalCredit),
                                    },
                                    {
                                      label: 'মোট টাকা জমা',
                                      value: formatTaka(row.totalPaid),
                                      highlight: 'emerald',
                                    },
                                    {
                                      label: 'শেষ টাকা দিয়েছে',
                                      value: row.lastPaymentDate
                                        ? `${formatDateBn(row.lastPaymentDate)} (${formatTaka(row.lastPaymentAmount)})`
                                        : 'এখনও জমা দেয়নি',
                                    },
                                    {
                                      label: 'পরবর্তী কালেকশন তারিখ',
                                      value: row.customer.nextCollectionDate
                                        ? formatDateBn(row.customer.nextCollectionDate)
                                        : 'নির্ধারিত নেই',
                                      highlight: row.isOverdueCollection ? 'rose' : 'default',
                                    },
                                  ],
                                });
                              }}
                              className="rounded-md border border-slate-300 bg-white p-1.5 text-[#0f2942] transition-colors hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800"
                              title="বকেয়া মেমো প্রিন্ট ও শেয়ার"
                              aria-label="বকেয়া মেমো প্রিন্ট ও শেয়ার"
                            >
                              <Share2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditCustomerModal(row.customer)}
                              className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#0f172a]"
                              title="কাস্টমার এডিট"
                              aria-label="কাস্টমার এডিট"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCustomerId(row.customer.id)}
                              className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
                              title="কাস্টমার মুছুন"
                              aria-label="কাস্টমার মুছুন"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Main Entry Form + Automated Ledger & Memo Pictures */}
      {customers.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Entry Form */}
          <section
            ref={entryFormRef}
            className="no-print rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] lg:col-span-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="truncate text-lg font-bold text-[#0f172a]">
                  নতুন মেমো ক্রেডিট / টাকা জমা পোস্ট
                </h2>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#1E3A8A]">
                  <Building2 className="h-3 w-3" />
                  {selectedCompany.name}
                </span>
              </div>
              {savedNotice && (
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-700">
                  <Check className="h-4 w-4" />
                  অটো আপডেট হয়েছে
                </span>
              )}
            </div>

            <form onSubmit={handleEntrySubmit} className="space-y-4 p-5">
              {/* Type Toggle */}
              <div>
                <span className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                  লেনদেনের ধরন সিলেক্ট করুন
                </span>
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setEntryType('credit_given')}
                    className={`rounded-md py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                      entryType === 'credit_given'
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'text-[#0f172a] hover:bg-white/70'
                    }`}
                  >
                    মাল নিয়েছে / মেমো (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryType('payment_received')}
                    className={`rounded-md py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                      entryType === 'payment_received'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-[#0f172a] hover:bg-white/70'
                    }`}
                  >
                    টাকা জমা / পোস্ট (−)
                  </button>
                </div>
              </div>

              {/* Customer Selector */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="cc-customer"
                    className="block text-sm font-bold text-[#0f172a]"
                  >
                    কাস্টমার সিলেক্ট করুন <span className="text-rose-600">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={openAddCustomerModal}
                    className="text-sm font-semibold text-teal-800 hover:underline"
                  >
                    + নতুন কাস্টমার
                  </button>
                </div>
                {/* Quick-Pick Recent / Due Customers */}
                {customers.length > 1 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11.5px] font-bold text-slate-600">দ্রুত বাছাই:</span>
                    {customers
                      .slice(0, 5)
                      .map((c) => {
                        const isChosen = c.id === selectedCustomerId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(c.id);
                              if (formError) setFormError('');
                            }}
                            className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                              isChosen
                                ? 'border-teal-700 bg-teal-700 text-white'
                                : 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-teal-50 hover:border-teal-400'
                            }`}
                          >
                            {c.shopName || c.name}
                          </button>
                        );
                      })}
                  </div>
                )}

                <select
                  id="cc-customer"
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    if (formError) setFormError('');
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.shopName ? ` (${c.shopName})` : ''}
                    </option>
                  ))}
                </select>

                {/* Live Automated Balance & Last Payment Preview */}
                {selectedCustomerSummary && (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#1e293b]">বর্তমান বাকি:</span>
                      <span
                        className={`font-mono-tabular font-bold ${
                          selectedCustomerSummary.currentDue > 0
                            ? 'text-amber-800'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatTaka(selectedCustomerSummary.currentDue)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1e293b]">শেষ টাকা দিয়েছে:</span>
                      <span className="font-mono-tabular font-semibold text-[#0f172a]">
                        {selectedCustomerSummary.lastPaymentDate
                          ? `${formatDateBn(selectedCustomerSummary.lastPaymentDate)} (${formatTaka(selectedCustomerSummary.lastPaymentAmount)})`
                          : 'এখনও জমা দেয়নি'}
                      </span>
                    </div>
                    {selectedCustomerSummary.customer.nextCollectionDate && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#1e293b]">নির্ধারিত কালেকশন:</span>
                        <span className="font-mono-tabular font-bold text-teal-800">
                          {formatDateBn(selectedCustomerSummary.customer.nextCollectionDate)}
                        </span>
                      </div>
                    )}
                    {projectedBalance !== null && (
                      <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1.5">
                        <span className="font-semibold text-[#0f172a]">
                          এই এন্ট্রির পর নতুন বাকি হবে:
                        </span>
                        <span className="font-mono-tabular font-extrabold text-teal-800">
                          {formatTaka(projectedBalance)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="cc-date"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    তারিখ <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="cc-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="font-mono-tabular w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="cc-amount"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    {entryType === 'credit_given'
                      ? 'ক্রেডিট / মেমো টাকা (৳)'
                      : 'জমা টাকা (৳)'}{' '}
                    <span className="text-rose-600">*</span>
                  </label>
                  <input
                    ref={amountInputRef}
                    id="cc-amount"
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      if (formError) setFormError('');
                    }}
                    placeholder="যেমন: 5500"
                    className="font-mono-tabular w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="cc-memo-no"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  {entryType === 'credit_given'
                    ? 'মেমো নং / মালের বিবরণ'
                    : 'রশিদ নং / জমার মাধ্যম'}
                </label>
                <input
                  id="cc-memo-no"
                  type="text"
                  value={memoNo}
                  onChange={(e) => setMemoNo(e.target.value)}
                  placeholder={
                    entryType === 'credit_given'
                      ? 'যেমন: মেমো #M-502 · প্রাণ জুস ও চানাচুর'
                      : 'যেমন: ক্যাশ / বিকাশ কালেকশন #R-201'
                  }
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              <div>
                <label
                  htmlFor="cc-note"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  অতিরিক্ত নোট (ঐচ্ছিক)
                </label>
                <input
                  id="cc-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="যেমন: আগামী সপ্তাহে পরিশোধ করবে"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              {/* Memo Picture Attachment */}
              <div>
                <span className="mb-1.5 block text-sm font-bold text-[#0f172a]">
                  {entryType === 'credit_given'
                    ? 'মেমোর ছবি সংযুক্ত করুন (ঐচ্ছিক)'
                    : 'রশিদ / স্লিপের ছবি (ঐচ্ছিক)'}
                </span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {!memoImageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressing}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-semibold text-[#0f172a] transition-colors hover:border-teal-600 hover:bg-teal-50/40"
                  >
                    <Upload className="h-4 w-4 text-teal-700" />
                    {isCompressing
                      ? 'মেমোর ছবি প্রসেস হচ্ছে...'
                      : 'মেমোর ছবি তুলুন বা আপলোড করুন'}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={memoImageDataUrl}
                        alt="মেমোর ছবি প্রিভিউ"
                        className="h-12 w-12 shrink-0 rounded-md border border-slate-200 object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0f172a]">
                          {memoImageName ?? 'মেমোর ছবি সংযুক্ত'}
                        </p>
                        <p className="text-xs font-semibold text-emerald-700">
                          ছবি সংরক্ষণের জন্য প্রস্তুত
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      className="rounded-md px-2.5 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-50 whitespace-nowrap"
                    >
                      সরিয়ে ফেলুন
                    </button>
                  </div>
                )}
              </div>

              {/* Optional Next Collection Date & Reminder Update */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[#0f172a]">
                  <input
                    type="checkbox"
                    checked={updateReminderOnEntry}
                    onChange={(e) => setUpdateReminderOnEntry(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span>পরবর্তী কালেকশন তারিখ ও রিমাইন্ডার আপডেট করুন (ঐচ্ছিক)</span>
                </label>

                {updateReminderOnEntry && (
                  <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'আজ', val: today },
                        { label: 'আগামীকাল', val: shiftDateISO(today, 1) },
                        { label: '৩ দিন পর', val: shiftDateISO(today, 3) },
                        { label: '৭ দিন পর', val: shiftDateISO(today, 7) },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setEntryNextCollectionDate(preset.val)}
                          className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                            entryNextCollectionDate === preset.val
                              ? 'border-teal-700 bg-teal-700 text-white'
                              : 'border-slate-300 bg-white text-[#0f172a] hover:bg-slate-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="cc-next-collection-date"
                          className="mb-1 block text-xs font-bold text-[#0f172a]"
                        >
                          কালেকশন তারিখ
                        </label>
                        <input
                          id="cc-next-collection-date"
                          type="date"
                          value={entryNextCollectionDate}
                          onChange={(e) => setEntryNextCollectionDate(e.target.value)}
                          className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="cc-next-expected-amount"
                          className="mb-1 block text-xs font-bold text-[#0f172a]"
                        >
                          সম্ভাব্য কিস্তি (৳)
                        </label>
                        <input
                          id="cc-next-expected-amount"
                          type="number"
                          min="0"
                          step="any"
                          value={entryExpectedAmount}
                          onChange={(e) => setEntryExpectedAmount(e.target.value)}
                          placeholder="যেমন: 3000"
                          className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="cc-collection-note"
                        className="mb-1 block text-xs font-bold text-[#0f172a]"
                      >
                        রিমাইন্ডার নোট
                      </label>
                      <input
                        id="cc-collection-note"
                        type="text"
                        value={entryCollectionNote}
                        onChange={(e) => setEntryCollectionNote(e.target.value)}
                        placeholder="যেমন: বাকি টাকা আগামী সপ্তাহে দিবে"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {formError && <p className="text-sm font-semibold text-rose-600">{formError}</p>}

              <button
                type="submit"
                disabled={isCompressing}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[15px] font-semibold text-white transition-colors disabled:opacity-60 ${
                  entryType === 'credit_given'
                    ? 'bg-teal-700 hover:bg-teal-800'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                <Plus className="h-4 w-4" />
                {entryType === 'credit_given'
                  ? 'মেমো ও ক্রেডিট সেভ করুন'
                  : 'টাকা জমা পোস্ট করুন'}
              </button>
            </form>
          </section>

          {/* Right: Automated Running Ledger & Attached Memo Photos */}
          <section className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_14px_-4px_rgba(15,41,66,0.06)] lg:col-span-7">
            <div className="space-y-3 border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#0f172a]">
                    মেমো, টাকা জমা ও অটো বাকি তালিকা ({filteredEntries.length})
                  </h2>
                  <p className="text-sm font-medium text-[#1e293b]">
                    {formatDateRangeLabelBn(dateRange)} · মেমোর ছবির ওপর ক্লিক করলে বড় আকারে দেখা যাবে।
                  </p>
                </div>

                <div className="no-print flex flex-wrap items-center gap-2">
                  <select
                    value={filterCustomerId}
                    onChange={(e) => setFilterCustomerId(e.target.value)}
                    aria-label="কাস্টমার অনুযায়ী ফিল্টার"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none"
                  >
                    <option value="all">সব কাস্টমার</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.shopName ? ` (${c.shopName})` : ''}
                      </option>
                    ))}
                  </select>

                  <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setFilterType('all')}
                      className={`rounded-md px-2.5 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                        filterType === 'all' ? 'bg-white text-[#0f172a] shadow-xs' : 'text-[#1e293b]'
                      }`}
                    >
                      সব
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('credit_given')}
                      className={`rounded-md px-2.5 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                        filterType === 'credit_given'
                          ? 'bg-white text-[#0f172a] shadow-xs'
                          : 'text-[#1e293b]'
                      }`}
                    >
                      মেমো / বাকি
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('payment_received')}
                      className={`rounded-md px-2.5 py-1 text-sm font-semibold transition-colors whitespace-nowrap ${
                        filterType === 'payment_received'
                          ? 'bg-white text-[#0f172a] shadow-xs'
                          : 'text-[#1e293b]'
                      }`}
                    >
                      টাকা জমা
                    </button>
                  </div>
                </div>
              </div>

              <DateRangeFilterBar
                value={dateRange}
                onChange={setDateRange}
                searchQuery={entrySearch}
                onSearchChange={setEntrySearch}
                searchPlaceholder="মেমো নং, কাস্টমার, নোট বা টাকা খুঁজুন..."
              />
            </div>

            {filteredEntries.length === 0 ? (
              <div className="px-6 py-14 text-center text-[15px] font-medium text-[#1e293b]">
                এই ফিল্টারে কোনো ক্রেডিট বা টাকা জমার এন্ট্রি নেই। বাম পাশের ফর্ম থেকে নতুন মেমো বা টাকা জমা যোগ করুন।
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[15px]">
                  <thead>
                    <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-[#0f172a]">
                      <th className="py-3.5 pl-5 pr-3">তারিখ ও কাস্টমার</th>
                      <th className="px-3 py-3.5">ধরন ও মেমো নং</th>
                      <th className="px-3 py-3.5 text-right">টাকা (৳)</th>
                      <th className="px-3 py-3.5 text-right">অবশিষ্ট বাকি</th>
                      <th className="px-3 py-3.5 text-center">মেমোর ছবি</th>
                      <th className="no-print py-3.5 pl-3 pr-5 text-right whitespace-nowrap">মেমো / মুছুন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80">
                    {filteredEntries.map((item) => {
                      const cust = customerMap.get(item.customerId);
                      const isCredit = item.type === 'credit_given';
                      const runningDue = runningBalanceByEntryId.get(item.id) ?? 0;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="py-3.5 pl-5 pr-3">
                            <div className="font-semibold text-[#0f172a]">
                              {cust?.name ?? 'অজানা কাস্টমার'}
                            </div>
                            <div className="font-mono-tabular text-sm font-medium text-[#1e293b]">
                              {formatDateBn(item.date)}
                              {cust?.shopName ? ` · ${cust.shopName}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <div
                              className={`text-sm font-bold ${
                                isCredit ? 'text-[#0f172a]' : 'text-emerald-700'
                              }`}
                            >
                              {isCredit ? 'মাল নিয়েছে / ক্রেডিট (+)' : 'টাকা জমা (−)'}
                            </div>
                            <div className="text-sm font-medium text-[#1e293b]">
                              {item.memoNo || '—'}
                            </div>
                            {item.note && (
                              <div className="text-xs font-medium text-[#1e293b]">{item.note}</div>
                            )}
                          </td>
                          <td
                            className={`font-mono-tabular px-3 py-3.5 text-right font-bold ${
                              isCredit ? 'text-[#0f172a]' : 'text-emerald-700'
                            }`}
                          >
                            {isCredit ? '+' : '−'} {formatTaka(item.amount)}
                          </td>
                          <td className="font-mono-tabular px-3 py-3.5 text-right font-bold">
                            <span
                              className={
                                runningDue > 0 ? 'text-amber-800' : 'text-emerald-700'
                              }
                            >
                              {formatTaka(runningDue)}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            {item.memoImageDataUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewEntry(item)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm font-semibold text-teal-800 hover:border-teal-600 hover:bg-teal-50 whitespace-nowrap"
                              >
                                <img
                                  src={item.memoImageDataUrl}
                                  alt="মেমো"
                                  className="h-5 w-5 rounded object-cover"
                                />
                                <Eye className="h-3.5 w-3.5" />
                                ছবি দেখুন
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-500">
                                <FileImage className="h-3.5 w-3.5" />
                                ছবি নেই
                              </span>
                            )}
                          </td>
                          <td className="no-print py-3.5 pl-3 pr-5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const custSummary = customerSummaries.find(
                                    (s) => s.customer.id === item.customerId
                                  );
                                  setActiveMemo({
                                    docKind: 'customer_memo',
                                    docNumber:
                                      item.memoNo?.trim() ||
                                      `মেমো-${item.id.slice(-5).toUpperCase()}`,
                                    title: isCredit
                                      ? 'কাস্টমার বিক্রয় ও ক্রেডিট মেমো'
                                      : 'টাকা জমার রশিদ',
                                    badgeText: isCredit
                                      ? 'মাল বিক্রয় / ক্রেডিট'
                                      : 'টাকা জমা',
                                    badgeTone: isCredit ? 'amber' : 'emerald',
                                    date: item.date,
                                    partyLabel: 'কাস্টমার ও দোকান',
                                    partyName: cust?.shopName || cust?.name || 'অজানা কাস্টমার',
                                    partySubline: cust?.shopName ? cust.name : undefined,
                                    partyPhone: cust?.phone,
                                    partyAddress: cust?.address,
                                    description:
                                      item.memoNo ||
                                      (isCredit
                                        ? 'বাকিতে পণ্য বিক্রয় / মেমো'
                                        : 'নগদ / অনলাইন টাকা জমা'),
                                    note: item.note,
                                    primaryAmountLabel: isCredit
                                      ? 'মেমোর টাকা'
                                      : 'জমা টাকা',
                                    primaryAmount: item.amount,
                                    secondaryStats: [
                                      {
                                        label: 'এই এন্ট্রির পর বাকি',
                                        value: formatTaka(runningDue),
                                        highlight: runningDue > 0 ? 'amber' : 'emerald',
                                      },
                                      {
                                        label: 'বর্তমান মোট বকেয়া',
                                        value: formatTaka(
                                          custSummary?.currentDue ?? runningDue
                                        ),
                                        highlight:
                                          (custSummary?.currentDue ?? runningDue) > 0
                                            ? 'amber'
                                            : 'emerald',
                                      },
                                    ],
                                    attachmentDataUrl: item.memoImageDataUrl,
                                    attachmentLabel: isCredit
                                      ? 'সংযুক্ত মেমোর ছবি'
                                      : 'সংযুক্ত জমার রশিদ',
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-[#0f2942] transition-colors hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800 whitespace-nowrap"
                                title="মেমো প্রিন্ট ও শেয়ার"
                              >
                                <Share2 className="h-3.5 w-3.5" />
                                প্রিন্ট / শেয়ার
                              </button>

                              {confirmDeleteEntryId === item.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteEntry(item.id);
                                      setConfirmDeleteEntryId(null);
                                    }}
                                    className="rounded-md bg-rose-600 px-2 py-1 text-xs font-bold text-white hover:bg-rose-700"
                                  >
                                    নিশ্চিত?
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteEntryId(null)}
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                                  >
                                    না
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteEntryId(item.id)}
                                  className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                                  title="মুছে ফেলুন"
                                  aria-label="এন্ট্রি মুছুন"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#0f2942]/30 bg-[#0f2942]/[0.07] font-bold text-[#0f172a]">
                      <td className="py-3.5 pl-5 pr-3 whitespace-nowrap" colSpan={2}>
                        ফিল্টার করা মোট ({filteredEntries.length}টি এন্ট্রি)
                      </td>
                      <td className="font-mono-tabular px-3 py-3.5 text-right text-sm whitespace-nowrap" colSpan={2}>
                        <span className="text-[#0f172a]">
                          ক্রেডিট +{formatTaka(filteredEntryTotals.totalCredit)}
                        </span>
                        <span className="mx-1.5 text-slate-500">·</span>
                        <span className="text-emerald-800">
                          জমা −{formatTaka(filteredEntryTotals.totalPaid)}
                        </span>
                      </td>
                      <td className="px-3 py-3.5" />
                      <td className="no-print py-3.5 pl-3 pr-5" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {customerModalOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-modal-title"
          onClick={() => setCustomerModalOpen(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/85 bg-white shadow-[0_20px_50px_-12px_rgba(15,41,66,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="customer-modal-title" className="text-lg font-semibold text-slate-900">
                {editingCustomer ? 'কাস্টমার তথ্য আপডেট করুন' : 'নতুন কাস্টমার যোগ করুন'}
              </h2>
              <button
                type="button"
                onClick={() => setCustomerModalOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="বন্ধ করুন"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCustomerSubmit} className="space-y-4 px-6 py-5">
              <div>
                <label
                  htmlFor="cust-name"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  কাস্টমারের নাম <span className="text-rose-600">*</span>
                </label>
                <input
                  id="cust-name"
                  type="text"
                  value={custName}
                  onChange={(e) => {
                    setCustName(e.target.value);
                    if (custError) setCustError('');
                  }}
                  placeholder="যেমন: মোঃ জসিম উদ্দিন"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="cust-shop"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    দোকানের নাম (ঐচ্ছিক)
                  </label>
                  <input
                    id="cust-shop"
                    type="text"
                    value={custShopName}
                    onChange={(e) => setCustShopName(e.target.value)}
                    placeholder="যেমন: আলম স্টোর"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cust-phone"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    মোবাইল নম্বর (ঐচ্ছিক)
                  </label>
                  <input
                    id="cust-phone"
                    type="tel"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="যেমন: 01715-000000"
                    className="font-mono-tabular w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="cust-address"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  ঠিকানা / বাজার (ঐচ্ছিক)
                </label>
                <input
                  id="cust-address"
                  type="text"
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  placeholder="যেমন: চকবাজার মেইন রোড"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              {/* Collection Schedule & Reminder Fields */}
              <div className="space-y-3 rounded-xl border border-teal-200/80 bg-teal-50/40 p-4">
                <p className="text-sm font-bold text-[#0f172a]">
                  কালেকশন ও কিস্তি রিমাইন্ডার (ঐচ্ছিক)
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="cust-next-collection"
                      className="mb-1 block text-xs font-bold text-[#0f172a]"
                    >
                      পরবর্তী কালেকশন তারিখ
                    </label>
                    <input
                      id="cust-next-collection"
                      type="date"
                      value={custNextCollectionDate}
                      onChange={(e) => setCustNextCollectionDate(e.target.value)}
                      className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="cust-expected-amount"
                      className="mb-1 block text-xs font-bold text-[#0f172a]"
                    >
                      নির্ধারিত কিস্তি / টার্গেট (৳)
                    </label>
                    <input
                      id="cust-expected-amount"
                      type="number"
                      min="0"
                      step="any"
                      value={custExpectedAmount}
                      onChange={(e) => setCustExpectedAmount(e.target.value)}
                      placeholder="যেমন: 5000"
                      className="font-mono-tabular w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="cust-collection-note"
                    className="mb-1 block text-xs font-bold text-[#0f172a]"
                  >
                    কালেকশন রিমাইন্ডার নোট
                  </label>
                  <input
                    id="cust-collection-note"
                    type="text"
                    value={custCollectionNote}
                    onChange={(e) => setCustCollectionNote(e.target.value)}
                    placeholder="যেমন: প্রতি মঙ্গলবার সাপ্তাহিক কিস্তি দিবে"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              {custError && <p className="text-sm font-semibold text-rose-600">{custError}</p>}

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  {editingCustomer ? 'আপডেট করুন' : 'কাস্টমার সেভ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Collection Reminder Modal */}
      {reminderCustomer && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reminder-modal-title"
          onClick={() => setReminderCustomer(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200/85 bg-white shadow-[0_20px_50px_-12px_rgba(15,41,66,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 id="reminder-modal-title" className="text-lg font-bold text-[#0f172a]">
                  কালেকশন রিমাইন্ডার ও তারিখ সেট করুন
                </h2>
                <p className="text-sm font-semibold text-teal-800">
                  {reminderCustomer.shopName
                    ? `${reminderCustomer.shopName} (${reminderCustomer.name})`
                    : reminderCustomer.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReminderCustomer(null)}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="বন্ধ করুন"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleReminderSubmit} className="space-y-4 px-6 py-5">
              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#1e293b]">
                  দ্রুত তারিখ সিলেক্ট করুন
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'আজ', val: today },
                    { label: 'আগামীকাল', val: shiftDateISO(today, 1) },
                    { label: '৩ দিন পর', val: shiftDateISO(today, 3) },
                    { label: '৭ দিন পর', val: shiftDateISO(today, 7) },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setRemDate(preset.val)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                        remDate === preset.val
                          ? 'border-teal-700 bg-teal-700 text-white'
                          : 'border-slate-300 bg-white text-[#0f172a] hover:bg-slate-50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRemDate('')}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                  >
                    তারিখ মুছুন
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="rem-date"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    কালেকশনের তারিখ
                  </label>
                  <input
                    id="rem-date"
                    type="date"
                    value={remDate}
                    onChange={(e) => setRemDate(e.target.value)}
                    className="font-mono-tabular w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] font-semibold text-[#0f172a] focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rem-amount"
                    className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                  >
                    নির্ধারিত কিস্তি (৳)
                  </label>
                  <input
                    id="rem-amount"
                    type="number"
                    min="0"
                    step="any"
                    value={remExpectedAmount}
                    onChange={(e) => setRemExpectedAmount(e.target.value)}
                    placeholder="যেমন: 4000"
                    className="font-mono-tabular w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] font-semibold text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="rem-note"
                  className="mb-1.5 block text-sm font-bold text-[#0f172a]"
                >
                  রিমাইন্ডার নোট
                </label>
                <textarea
                  id="rem-note"
                  rows={2}
                  value={remNote}
                  onChange={(e) => setRemNote(e.target.value)}
                  placeholder="যেমন: দুপুর ১২টার মধ্যে দোকানে গিয়ে টাকা সংগ্রহ করতে হবে"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-[15px] font-medium text-[#0f172a] placeholder:text-slate-500 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setReminderCustomer(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  রিমাইন্ডার সেভ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Memo Picture */}
      {previewEntry && previewEntry.memoImageDataUrl && (
        <div
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4"
          onClick={() => setPreviewEntry(null)}
          role="dialog"
          aria-modal="true"
          aria-label="মেমোর ছবি"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_50px_-12px_rgba(15,41,66,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-base font-bold text-[#0f172a]">
                  {customerMap.get(previewEntry.customerId)?.name ?? 'কাস্টমার'} ·{' '}
                  {previewEntry.type === 'credit_given'
                    ? 'ক্রেডিট মেমোর ছবি'
                    : 'টাকা জমার রশিদ'}
                </h3>
                <p className="font-mono-tabular text-sm font-semibold text-[#1e293b]">
                  {formatDateBn(previewEntry.date)} · {formatTaka(previewEntry.amount)}
                  {previewEntry.memoNo ? ` · ${previewEntry.memoNo}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewEntry.memoImageDataUrl}
                  download={
                    previewEntry.memoImageName ||
                    `memo_${previewEntry.date}.jpg`
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#0f172a] hover:bg-slate-50 whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  ডাউনলোড
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewEntry(null)}
                  className="rounded-lg p-1.5 text-[#0f172a] hover:bg-slate-100"
                  aria-label="বন্ধ করুন"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-100 p-4 text-center">
              <img
                src={previewEntry.memoImageDataUrl}
                alt={previewEntry.memoNo ?? 'মেমোর ছবি'}
                className="mx-auto max-h-[70vh] rounded-lg border border-slate-200 bg-white object-contain"
              />
            </div>
          </div>
        </div>
      )}

      <ChalanMemoModal memo={activeMemo} onClose={() => setActiveMemo(null)} />

      <PrintSignatureFooter />
    </div>
  );
};
