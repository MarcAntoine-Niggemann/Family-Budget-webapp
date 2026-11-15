import {
  AccountEntity,
  CategoryBudgetEntity,
  TransactionEntity
} from '../types';
import {
  clampDayToMonth,
  doesBudgetTriggerOnDate,
  getBudgetMonthlyAmount,
  getDaysInMonth,
  isBudgetScheduledInMonth
} from './budgetEngine';

export interface TimelineEvent {
  title: string;
  amount: number; // positive for income, negative for expense
  isExpense: boolean;
  categoryName?: string;
}

export interface CashFlowPoint {
  dateMillis: number;
  dateStr: string; // "14 Nov", "28 Nov", etc.
  dayOfMonth: number;
  balance: number;
  events: TimelineEvent[];
  isPayday?: boolean;
  isBillDay?: boolean;
  isLowestPoint?: boolean;
}

export interface CashFlowForecastResult {
  currentTotalBalance: number;
  accountCount: number;
  upcomingBillsTotal: number;
  upcomingIncomeTotal: number;
  variableMonthlyBudget: number;
  variableSpentSoFar: number;
  remainingVariableBudget: number;
  dailyBurnRate: number;
  lowestBalance: number;
  lowestBalanceDate: string;
  hasOverdraftRisk: boolean; // lowest < 0
  hasBufferWarning: boolean; // lowest >= 0 && lowest < 500
  timeline: CashFlowPoint[];
}

function computeMonthSpreadBudget(
  budgets: CategoryBudgetEntity[],
  year: number,
  month1to12: number,
  isExpense: boolean
): number {
  let spreadTotal = 0;

  for (const b of budgets) {
    if (b.isExpense !== isExpense) continue;
    const monthlyAmt = getBudgetMonthlyAmount(b, year, month1to12);
    if (monthlyAmt <= 0) continue;
    if (!isBudgetScheduledInMonth(b, year, month1to12)) {
      spreadTotal += monthlyAmt;
    }
  }

  return Math.max(0, spreadTotal);
}

export function computeCashFlowForecast(
  accounts: AccountEntity[],
  transactions: TransactionEntity[],
  budgets: CategoryBudgetEntity[],
  horizonDays: number = 30,
  locale: 'fr' | 'en' = 'fr'
): CashFlowForecastResult {
  // 1. Starting balance from all active accounts marked includeInLiquidForecast = true
  const includedAccounts = accounts.filter(a => !a.isDeleted && a.includeInLiquidForecast);
  const includedAccountIds = new Set(includedAccounts.map(a => a.id));
  const currentTotalBalance = includedAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0);

  // Deferred cards that are NOT directly included in the forecast starting balance still settle
  // their current negative balance ONCE on their next settlement day against a linked/included account.
  const excludedDeferredCards = accounts.filter(
    a =>
      !a.isDeleted &&
      !a.includeInLiquidForecast &&
      a.type === 'DEFERRED_CARD' &&
      a.currentBalance < 0 &&
      a.settlementDay != null &&
      a.settlementDay >= 1 &&
      (!a.linkedCheckingAccountId || includedAccountIds.has(a.linkedCheckingAccountId))
  );
  const settledCardIds = new Set<string>();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0..11
  const currentMonth1 = currentMonth + 1; // 1..12
  const currentDay = now.getDate();

  const daysInCurrentMonth = getDaysInMonth(currentYear, currentMonth1);
  // Remaining days AFTER today in the current month (since i = 0 represents today's starting/end-of-day balance)
  const daysAfterToday = Math.max(0, daysInCurrentMonth - currentDay);

  const startOfMonthMillis = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0).getTime();
  const endOfMonthMillis = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999).getTime();

  const currentMonthTx = transactions.filter(
    tx =>
      !tx.isDeleted &&
      !tx.isExcluded &&
      !tx.isSplitParent &&
      tx.date >= startOfMonthMillis &&
      tx.date <= endOfMonthMillis
  );

  const activeBudgets = budgets.filter(b => !b.isDeleted && b.isActive);

  // Track already-booked transactions per scheduled budget ID in the current month to avoid double-counting
  const actualExpenseByBudgetId = new Map<number, number>();
  const actualIncomeByBudgetId = new Map<number, number>();
  for (const tx of currentMonthTx) {
    if (tx.isInternalTransfer || tx.transferType === 'CARD_SETTLEMENT') continue;
    if (!tx.budgetId) continue;
    const absAmt = Math.abs(tx.amount);
    if (tx.isExpense) {
      actualExpenseByBudgetId.set(tx.budgetId, (actualExpenseByBudgetId.get(tx.budgetId) || 0) + absAmt);
    } else {
      actualIncomeByBudgetId.set(tx.budgetId, (actualIncomeByBudgetId.get(tx.budgetId) || 0) + absAmt);
    }
  }

  const scheduledExpenseIdsInCurrentMonth = new Set(
    activeBudgets
      .filter(b => b.isExpense && isBudgetScheduledInMonth(b, currentYear, currentMonth1))
      .map(b => b.id)
  );
  const scheduledIncomeIdsInCurrentMonth = new Set(
    activeBudgets
      .filter(b => !b.isExpense && isBudgetScheduledInMonth(b, currentYear, currentMonth1))
      .map(b => b.id)
  );

  // Current month spread (non-fixed-day) expense budget & remaining allowance
  const variableMonthlyBudget = computeMonthSpreadBudget(activeBudgets, currentYear, currentMonth1, true);
  const variableSpentSoFar = currentMonthTx
    .filter(
      tx =>
        tx.isExpense &&
        !tx.isInternalTransfer &&
        tx.transferType !== 'CARD_SETTLEMENT' &&
        !scheduledExpenseIdsInCurrentMonth.has(tx.budgetId)
    )
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const remainingVariableBudget = Math.max(0, variableMonthlyBudget - variableSpentSoFar);
  const dailyBurnRate = daysAfterToday > 0 ? remainingVariableBudget / daysAfterToday : 0;

  // Current month spread (non-fixed-day) income budget & remaining expected spread income
  const spreadIncomeMonthlyBudget = computeMonthSpreadBudget(activeBudgets, currentYear, currentMonth1, false);
  const spreadIncomeReceivedSoFar = currentMonthTx
    .filter(
      tx =>
        !tx.isExpense &&
        !tx.isInternalTransfer &&
        !scheduledIncomeIdsInCurrentMonth.has(tx.budgetId)
    )
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const remainingSpreadIncome = Math.max(0, spreadIncomeMonthlyBudget - spreadIncomeReceivedSoFar);
  const dailySpreadIncomeRate = daysAfterToday > 0 ? remainingSpreadIncome / daysAfterToday : 0;

  const monthExpenseRateCache = new Map<string, number>();
  const monthIncomeRateCache = new Map<string, number>();

  const getDailySpreadExpenseForMonth = (yr: number, mo1: number): number => {
    if (yr === currentYear && mo1 === currentMonth1) {
      return dailyBurnRate;
    }
    const key = `${yr}-${mo1}`;
    if (!monthExpenseRateCache.has(key)) {
      const monthVar = computeMonthSpreadBudget(activeBudgets, yr, mo1, true);
      const dim = getDaysInMonth(yr, mo1);
      monthExpenseRateCache.set(key, monthVar / dim);
    }
    return monthExpenseRateCache.get(key) || 0;
  };

  const getDailySpreadIncomeForMonth = (yr: number, mo1: number): number => {
    if (yr === currentYear && mo1 === currentMonth1) {
      return dailySpreadIncomeRate;
    }
    const key = `${yr}-${mo1}`;
    if (!monthIncomeRateCache.has(key)) {
      const monthVar = computeMonthSpreadBudget(activeBudgets, yr, mo1, false);
      const dim = getDaysInMonth(yr, mo1);
      monthIncomeRateCache.set(key, monthVar / dim);
    }
    return monthIncomeRateCache.get(key) || 0;
  };

  // Day-by-day timeline simulation over requested horizonDays
  const simDays = Math.max(1, horizonDays);
  const timeline: CashFlowPoint[] = [];
  let simulatedBalance = currentTotalBalance;
  let lowestBalance = Number.POSITIVE_INFINITY;
  let lowestBalanceDate = '';

  let upcomingBillsTotal = 0;
  let upcomingIncomeTotal = 0;

  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-US';

  for (let i = 0; i < simDays; i++) {
    const simDate = new Date(currentYear, currentMonth, currentDay + i);
    const simYear = simDate.getFullYear();
    const simMonth1 = simDate.getMonth() + 1;
    const day = simDate.getDate();
    const dateStr = simDate.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
    const events: TimelineEvent[] = [];
    const isInCurrentMonth = simYear === currentYear && simMonth1 === currentMonth1;

    // 1. Scheduled Income (Monthly or Yearly matching exact day/month)
    for (const b of activeBudgets) {
      if (!b.isExpense && doesBudgetTriggerOnDate(b, simYear, simMonth1, day)) {
        const scheduledAmount = getBudgetMonthlyAmount(b, simYear, simMonth1);
        const alreadyBooked = isInCurrentMonth ? actualIncomeByBudgetId.get(b.id) || 0 : 0;
        const effectiveAmount = Math.max(0, Math.round((scheduledAmount - alreadyBooked) * 100) / 100);

        if (effectiveAmount > 0) {
          upcomingIncomeTotal += effectiveAmount;
          simulatedBalance += effectiveAmount;
          events.push({
            title: b.title || b.categoryName || 'Scheduled Income',
            amount: effectiveAmount,
            isExpense: false,
            categoryName: b.categoryName
          });
        }
      }
    }

    // 2. Scheduled Recurring Expenses (Monthly or Yearly matching exact day/month)
    for (const b of activeBudgets) {
      if (b.isExpense && doesBudgetTriggerOnDate(b, simYear, simMonth1, day)) {
        const scheduledAmount = getBudgetMonthlyAmount(b, simYear, simMonth1);
        const alreadyBooked = isInCurrentMonth ? actualExpenseByBudgetId.get(b.id) || 0 : 0;
        const effectiveAmount = Math.max(0, Math.round((scheduledAmount - alreadyBooked) * 100) / 100);

        if (effectiveAmount > 0) {
          upcomingBillsTotal += effectiveAmount;
          simulatedBalance -= effectiveAmount;
          events.push({
            title: b.title || b.categoryName || 'Scheduled Bill',
            amount: -effectiveAmount,
            isExpense: true,
            categoryName: b.categoryName
          });
        }
      }
    }

    // 3. One-time settlement for excluded deferred credit cards with existing debt
    for (const card of excludedDeferredCards) {
      if (settledCardIds.has(card.id) || card.settlementDay == null) continue;
      const clampedSettlement = clampDayToMonth(card.settlementDay, simYear, simMonth1);
      if (clampedSettlement === day) {
        const cardDebt = Math.round(Math.abs(card.currentBalance) * 100) / 100;
        if (cardDebt > 0) {
          settledCardIds.add(card.id);
          upcomingBillsTotal += cardDebt;
          simulatedBalance -= cardDebt;
          events.push({
            title: `${locale === 'fr' ? 'Prélèvement carte' : 'Card Settlement'}: ${card.name}`,
            amount: -cardDebt,
            isExpense: true,
            categoryName: locale === 'fr' ? 'Carte différée' : 'Deferred Card'
          });
        }
      }
    }

    // 4. Daily spread income and expenses (prorated across future days)
    if (i > 0) {
      simulatedBalance += getDailySpreadIncomeForMonth(simYear, simMonth1);
      simulatedBalance -= getDailySpreadExpenseForMonth(simYear, simMonth1);
    }

    const roundedBal = Math.round(simulatedBalance * 100) / 100;
    if (roundedBal < lowestBalance) {
      lowestBalance = roundedBal;
      lowestBalanceDate = dateStr;
    }

    timeline.push({
      dateMillis: simDate.getTime(),
      dateStr,
      dayOfMonth: day,
      balance: roundedBal,
      events,
      isPayday: events.some(e => !e.isExpense),
      isBillDay: events.some(e => e.isExpense)
    });
  }

  if (!Number.isFinite(lowestBalance)) {
    lowestBalance = Math.round(currentTotalBalance * 100) / 100;
    lowestBalanceDate = now.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' });
  }

  // Mark point(s) with lowest balance
  timeline.forEach(pt => {
    if (Math.abs(pt.balance - lowestBalance) < 0.01) {
      pt.isLowestPoint = true;
    }
  });

  return {
    currentTotalBalance: Math.round(currentTotalBalance * 100) / 100,
    accountCount: includedAccounts.length,
    upcomingBillsTotal: Math.round(upcomingBillsTotal * 100) / 100,
    upcomingIncomeTotal: Math.round(upcomingIncomeTotal * 100) / 100,
    variableMonthlyBudget: Math.round(variableMonthlyBudget * 100) / 100,
    variableSpentSoFar: Math.round(variableSpentSoFar * 100) / 100,
    remainingVariableBudget: Math.round(remainingVariableBudget * 100) / 100,
    dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
    lowestBalance: Math.round(lowestBalance * 100) / 100,
    lowestBalanceDate,
    hasOverdraftRisk: lowestBalance < 0,
    hasBufferWarning: lowestBalance >= 0 && lowestBalance < 500,
    timeline
  };
}
