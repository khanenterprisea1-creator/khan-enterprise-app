import { Company, DailyEntry, LedgerData } from '../types/ledger';
import { getCurrentMonthISO, getTodayISO } from './storage';

export interface Company1to1Summary {
  company: Company;
  // Company Ledger (Payment & Chalan)
  totalPaid: number;
  totalGoods: number;
  netLedgerBalance: number; // totalPaid - totalGoods (>0 receivable/advance, <0 payable/due)
  payableToCompany: number;
  receivableFromCompany: number;
  // Sales
  todaySales: number;
  monthSales: number;
  allTimeSales: number;
  // Cash & Expense
  totalCashIn: number;
  totalExpense: number;
  totalWithdraw: number;
  remainingCash: number;
  monthExpense: number;
  // Profit & Loss (default 5% commission - expense)
  monthProfitLoss: number;
  allTimeProfitLoss: number;
  // Customer Credit (Market Due for this company)
  customerCount: number;
  dueCustomerCount: number;
  customerCreditTotal: number;
  customerPaidTotal: number;
  customerDueTotal: number;
}

export function computeCompany1to1Summary(
  data: LedgerData,
  company: Company,
  commissionRate = 5
): Company1to1Summary {
  const today = getTodayISO();
  const currentMonth = getCurrentMonthISO();
  const companyId = company.id;

  let totalPaid = 0;
  let totalGoods = 0;
  for (const item of data.companyLedgerEntries) {
    if (item.companyId !== companyId) continue;
    if (item.type === 'payment_given') totalPaid += item.amount;
    else totalGoods += item.amount;
  }
  const netLedgerBalance = Number((totalPaid - totalGoods).toFixed(2));
  const payableToCompany =
    netLedgerBalance < 0 ? Number(Math.abs(netLedgerBalance).toFixed(2)) : 0;
  const receivableFromCompany = netLedgerBalance > 0 ? netLedgerBalance : 0;

  let todaySales = 0;
  let monthSales = 0;
  let allTimeSales = 0;
  for (const entry of Object.values(data.entries)) {
    if (entry.companyId !== companyId) continue;
    allTimeSales += entry.totalSalesAmount;
    if (entry.date === today) todaySales += entry.totalSalesAmount;
    if (entry.date.startsWith(currentMonth)) monthSales += entry.totalSalesAmount;
  }

  let totalCashIn = 0;
  let totalExpense = 0;
  let totalWithdraw = 0;
  let monthExpense = 0;
  for (const tx of data.cashTransactions) {
    if (tx.companyId !== companyId) continue;
    if (tx.type === 'cash_in') totalCashIn += tx.amount;
    else if (tx.type === 'expense') {
      totalExpense += tx.amount;
      if (tx.date.startsWith(currentMonth)) monthExpense += tx.amount;
    } else {
      totalWithdraw += tx.amount;
    }
  }
  const remainingCash = Number((totalCashIn - totalExpense - totalWithdraw).toFixed(2));

  const rateFrac = commissionRate / 100;
  const monthProfitLoss = Number((monthSales * rateFrac - monthExpense).toFixed(2));
  const allTimeProfitLoss = Number((allTimeSales * rateFrac - totalExpense).toFixed(2));

  const companyCustomers = data.customers.filter((c) => c.companyId === companyId);
  const perCustomerDue = new Map<string, number>();
  for (const cust of companyCustomers) {
    perCustomerDue.set(cust.id, 0);
  }

  let customerCreditTotal = 0;
  let customerPaidTotal = 0;
  for (const ce of data.customerCreditEntries) {
    const belongs =
      ce.companyId === companyId ||
      (!ce.companyId && perCustomerDue.has(ce.customerId));
    if (!belongs) continue;

    if (ce.type === 'credit_given') {
      customerCreditTotal += ce.amount;
      if (perCustomerDue.has(ce.customerId)) {
        perCustomerDue.set(
          ce.customerId,
          (perCustomerDue.get(ce.customerId) ?? 0) + ce.amount
        );
      }
    } else {
      customerPaidTotal += ce.amount;
      if (perCustomerDue.has(ce.customerId)) {
        perCustomerDue.set(
          ce.customerId,
          (perCustomerDue.get(ce.customerId) ?? 0) - ce.amount
        );
      }
    }
  }

  let dueCustomerCount = 0;
  for (const due of perCustomerDue.values()) {
    if (due > 0.001) dueCustomerCount += 1;
  }

  return {
    company,
    totalPaid: Number(totalPaid.toFixed(2)),
    totalGoods: Number(totalGoods.toFixed(2)),
    netLedgerBalance,
    payableToCompany,
    receivableFromCompany,
    todaySales: Number(todaySales.toFixed(2)),
    monthSales: Number(monthSales.toFixed(2)),
    allTimeSales: Number(allTimeSales.toFixed(2)),
    totalCashIn: Number(totalCashIn.toFixed(2)),
    totalExpense: Number(totalExpense.toFixed(2)),
    totalWithdraw: Number(totalWithdraw.toFixed(2)),
    remainingCash,
    monthExpense: Number(monthExpense.toFixed(2)),
    monthProfitLoss,
    allTimeProfitLoss,
    customerCount: companyCustomers.length,
    dueCustomerCount,
    customerCreditTotal: Number(customerCreditTotal.toFixed(2)),
    customerPaidTotal: Number(customerPaidTotal.toFixed(2)),
    customerDueTotal: Number((customerCreditTotal - customerPaidTotal).toFixed(2)),
  };
}

export function buildScopedLedgerData(data: LedgerData, companyId: string): LedgerData {
  const company = data.companies.find((c) => c.id === companyId);
  const scopedEntries: Record<string, DailyEntry> = {};
  for (const [key, entry] of Object.entries(data.entries)) {
    if (entry.companyId === companyId) {
      scopedEntries[key] = entry;
    }
  }

  const scopedCustomerIds = new Set(
    data.customers.filter((c) => c.companyId === companyId).map((c) => c.id)
  );

  return {
    version: data.version,
    companies: company ? [company] : [],
    products: data.products.filter((p) => p.companyId === companyId),
    entries: scopedEntries,
    cashTransactions: data.cashTransactions.filter((t) => t.companyId === companyId),
    companyLedgerEntries: data.companyLedgerEntries.filter(
      (l) => l.companyId === companyId
    ),
    stockMovements: data.stockMovements.filter((m) => m.companyId === companyId),
    customers: data.customers.filter((c) => c.companyId === companyId),
    customerCreditEntries: data.customerCreditEntries.filter(
      (e) =>
        e.companyId === companyId ||
        (!e.companyId && scopedCustomerIds.has(e.customerId))
    ),
    authConfig: data.authConfig,
  };
}

export function countUnassignedOrphans(data: LedgerData): {
  cashCount: number;
  customerCount: number;
  creditEntryCount: number;
} {
  const cashCount = data.cashTransactions.filter((t) => !t.companyId).length;
  const customerCount = data.customers.filter((c) => !c.companyId).length;
  const orphanCustIds = new Set(
    data.customers.filter((c) => !c.companyId).map((c) => c.id)
  );
  const creditEntryCount = data.customerCreditEntries.filter(
    (e) => !e.companyId || orphanCustIds.has(e.customerId)
  ).length;
  return { cashCount, customerCount, creditEntryCount };
}
