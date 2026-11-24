export interface CompanyRepContact {
  id: string;
  name: string;
  phone: string;
  role?: 'TSM' | 'SR' | 'Other';
}

export interface Company {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  logoUrl?: string;
  tsmName?: string;
  tsmPhone?: string;
  srContacts?: CompanyRepContact[];
  createdAt: string;
}

export interface Product {
  id: string;
  companyId: string;
  name: string;
  unit: string; // e.g., পিস, কার্টন, বক্স, কেজি
  rate: number; // Unit price in BDT (৳)
  minStock?: number; // সর্বনিম্ন স্টক সতর্কতা সীমা
  createdAt: string;
}

export interface DailyLineItem {
  productId: string;
  productName: string; // Snapshot so historical records stay readable even if product is renamed/deleted
  unit: string;
  rate: number; // Snapshot rate for that day (editable per day or synced from product rate)
  marketOut: number; // মার্কেটে গিয়েছে
  returned: number; // রিটার্ন এসেছে
  soldQty: number; // নেট বিক্রি = marketOut - returned
  salesAmount: number; // মোট সেলস = soldQty * rate
}

export interface DailyEntry {
  id: string; // `${companyId}_${date}`
  companyId: string;
  date: string; // YYYY-MM-DD
  items: DailyLineItem[];
  totalMarketOut: number;
  totalReturned: number;
  totalSoldQty: number;
  totalSalesAmount: number;
  note?: string;
  updatedAt: string;
}

export type CashTransactionType = 'cash_in' | 'expense' | 'withdraw';

export interface CashTransaction {
  id: string;
  companyId?: string;
  date: string; // YYYY-MM-DD
  type: CashTransactionType;
  title: string; // খাত / বিবরণ
  amount: number; // ৳
  note?: string;
  createdAt: string;
}

export type CompanyLedgerType = 'payment_given' | 'goods_received';

export interface CompanyLedgerEntry {
  id: string;
  companyId: string;
  date: string; // YYYY-MM-DD
  type: CompanyLedgerType;
  amount: number; // ৳
  reference?: string; // স্লিপ নং / চালান নং / বিবরণ
  attachmentDataUrl?: string; // Compressed slip/chalan image Data URL
  attachmentName?: string;
  createdAt: string;
}

export type StockMovementType = 'stock_in' | 'damage_adjust';

export interface StockMovement {
  id: string;
  companyId: string;
  productId: string;
  date: string; // YYYY-MM-DD
  type: StockMovementType;
  quantity: number;
  note?: string;
  createdAt: string;
}

export type CustomerCreditEntryType = 'credit_given' | 'payment_received';

export interface Customer {
  id: string;
  companyId?: string;
  name: string;
  shopName?: string;
  phone?: string;
  address?: string;
  nextCollectionDate?: string; // YYYY-MM-DD (পরবর্তী কালেকশন / কিস্তির তারিখ)
  expectedCollectionAmount?: number; // নির্ধারিত কিস্তি / সম্ভাব্য কালেকশন টাকা (৳)
  collectionNote?: string; // কালেকশন রিমাইন্ডার নোট
  createdAt: string;
}

export interface CustomerCreditEntry {
  id: string;
  companyId?: string;
  customerId: string;
  date: string; // YYYY-MM-DD
  type: CustomerCreditEntryType;
  amount: number; // ৳
  memoNo?: string; // মেমো নং / বিবরণ
  note?: string;
  memoImageDataUrl?: string; // Compressed memo photo Data URL
  memoImageName?: string;
  createdAt: string;
}

export interface AuthConfig {
  adminPasswordHash?: string;
  companyPasswordHashes: Record<string, string>;
}

export type AuthSession =
  | { role: 'admin' }
  | { role: 'company'; companyId: string };

export interface LedgerData {
  version: number;
  companies: Company[];
  products: Product[];
  entries: Record<string, DailyEntry>; // Keyed by `${companyId}_${date}`
  cashTransactions: CashTransaction[];
  companyLedgerEntries: CompanyLedgerEntry[];
  stockMovements: StockMovement[];
  customers: Customer[];
  customerCreditEntries: CustomerCreditEntry[];
  authConfig: AuthConfig;
}
