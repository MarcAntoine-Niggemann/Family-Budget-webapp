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
  currentLiquidBalance: number;
  upcomingBillsTotal: number;
  upcomingIncomeTotal: number;
  variableMonthlyBudget: number;
  variableSpentSoFar: number;
  remainingVariableBudget: number;
  dailyBurnRate: number;
  safeToSpendNow: number;
  lowestBalance: number;
  lowestBalanceDate: string;
  hasOverdraftRisk: boolean; // lowest < 0
  hasBufferWarning: boolean; // lowest < 500
  timeline: CashFlowPoint[];
}

function computeMonthVariableBudget(
  budgets: CategoryBudgetEntity[],
  year: number,
  month1to12: number
): number {
  let totalExpense = 0;
  let scheduledExpense = 0;

  for (const b of budgets) {
    if (!b.isExpense) continue;
    const monthlyAmt = getBudgetMonthlyAmount(b, year, month1to12);
    if (monthlyAmt <= 0) continue;
    totalExpense += monthlyAmt;
    if (isBudgetScheduledInMonth(b, year, month1to12)) {
      scheduledExpense += monthlyAmt;
    }
  }

  return Math.max(0, totalExpense - scheduledExpense);
}

export function computeCashFlowForecast(
  accounts: AccountEntity[],
  transactions: TransactionEntity[],
  budgets: CategoryBudgetEntity[],
  horizonDays: number = 30
): CashFlowForecastResult {
  // 1. Current liquid balance from all checking / liquid accounts
  const liquidAccounts = accounts.filter(a => !a.isDeleted && a.includeInLiquidForecast);
  const currentLiquidBalance = liquidAccounts.reduce((acc, a) => acc + (a.currentBalance || 0), 0);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0..11
  const currentMonth1 = currentMonth + 1; // 1..12
  const currentDay = now.getDate();

  const daysInCurrentMonth = getDaysInMonth(currentYear, currentMonth1);
  const remainingDaysInMonth = Math.max(1, daysInCurrentMonth - currentDay + 1);

  const startOfMonthMillis = new Date(currentYear, currentMonth, 1).getTime();
  const endOfMonthMillis = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999).getTime();

  const currentMonthTx = transactions.filter(
    tx =>
      !tx.isDeleted &&
      !tx.isExcluded &&
      !tx.isSplitParent &&
      tx.date >= startOfMonthMillis &&
      tx.date <= endOfMonthMillis
  );

  // Active sub-category budgets
  const activeBudgets = budgets.filter(b => !b.isDeleted && b.isActive);

  // Identify scheduled expense sub-categories for the current month so their actual debits
  // do not eat into the discretionary spread variable budget.
  const scheduledExpenseIdsInCurrentMonth = new Set(
    activeBudgets
      .filter(b => b.isExpense && isBudgetScheduledInMonth(b, currentYear, currentMonth1))
      .map(b => b.id)
  );

  const variableMonthlyBudget = computeMonthVariableBudget(activeBudgets, currentYear, currentMonth1);

  // Variable spent so far this month (spread/discretionary expenses not tied to scheduled fixed bills)
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
  const dailyBurnRate = remainingVariableBudget / remainingDaysInMonth;

  // Day-by-day timeline simulation
  const timeline: CashFlowPoint[] = [];
  let simulatedBalance = currentLiquidBalance;
  let lowestBalance = currentLiquidBalance;
  let lowestBalanceDate = `${currentDay}/${currentMonth1}`;

  let upcomingBillsTotal = 0;
  let upcomingIncomeTotal = 0;
  let upcomingBillsNext30Days = 0;

  const deferredCards = accounts.filter(a => !a.isDeleted && a.type === 'DEFERRED_CARD');
  const monthVariableRateCache = new Map<string, number>();

  const getDailyVariableBurnForMonth = (yr: number, mo1: number): number => {
    if (yr === currentYear && mo1 === currentMonth1) {
      return dailyBurnRate;
    }
    const key = `${yr}-${mo1}`;
    if (!monthVariableRateCache.has(key)) {
      const monthVar = computeMonthVariableBudget(activeBudgets, yr, mo1);
      const dim = getDaysInMonth(yr, mo1);
      monthVariableRateCache.set(key, monthVar / dim);
    }
    return monthVariableRateCache.get(key) || 0;
  };

  const simDays = Math.max(horizonDays, 30);

  for (let i = 0; i < simDays; i++) {
    const simDate = new Date(currentYear, currentMonth, currentDay + i);
    const simYear = simDate.getFullYear();
    const simMonth1 = simDate.getMonth() + 1;
    const day = simDate.getDate();
    const dateStr = simDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const events: TimelineEvent[] = [];

    // 1. Scheduled Income (Monthly or Yearly matching exact day/month)
    for (const b of activeBudgets) {
      if (!b.isExpense && doesBudgetTriggerOnDate(b, simYear, simMonth1, day)) {
        if (i < horizonDays) {
          upcomingIncomeTotal += b.amount;
        }
        simulatedBalance += b.amount;
        events.push({
          title: b.title || b.categoryName || 'Scheduled Income',
          amount: b.amount,
          isExpense: false,
          categoryName: b.categoryName
        });
      }
    }

    // 2. Scheduled Recurring Expenses (Monthly or Yearly matching exact day/month)
    for (const b of activeBudgets) {
      if (b.isExpense && doesBudgetTriggerOnDate(b, simYear, simMonth1, day)) {
        if (i < horizonDays) {
          upcomingBillsTotal += b.amount;
        }
        if (i < 30) {
          upcomingBillsNext30Days += b.amount;
        }
        simulatedBalance -= b.amount;
        events.push({
          title: b.title || b.categoryName || 'Scheduled Bill',
          amount: -b.amount,
          isExpense: true,
          categoryName: b.categoryName
        });
      }
    }

    // 3. Deferred Credit Card settlements
    for (const card of deferredCards) {
      if (card.settlementDay != null && card.settlementDay >= 1) {
        const clampedSettlement = clampDayToMonth(card.settlementDay, simYear, simMonth1);
        if (clampedSettlement === day) {
          const cardDebt = Math.abs(card.currentBalance);
          if (cardDebt > 0) {
            simulatedBalance -= cardDebt;
            events.push({
              title: `Card Settlement: ${card.name}`,
              amount: -cardDebt,
              isExpense: true,
              categoryName: 'Bank Settlement'
            });
          }
        }
      }
    }

    // 4. Daily variable burn rate (prorated spread discretionary spending)
    if (i > 0) {
      simulatedBalance -= getDailyVariableBurnForMonth(simYear, simMonth1);
    }

    if (i < horizonDays) {
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
  }

  // Safe to spend now reserves upcoming scheduled bills in the next 30 days + remaining spread variable budget
  const safeToSpendNow =
    Math.round((currentLiquidBalance - upcomingBillsNext30Days - remainingVariableBudget) * 100) / 100;

  // Mark point with lowest balance
  timeline.forEach(pt => {
    if (Math.abs(pt.balance - lowestBalance) < 0.01) {
      pt.isLowestPoint = true;
    }
  });

  return {
    currentLiquidBalance: Math.round(currentLiquidBalance * 100) / 100,
    upcomingBillsTotal: Math.round(upcomingBillsTotal * 100) / 100,
    upcomingIncomeTotal: Math.round(upcomingIncomeTotal * 100) / 100,
    variableMonthlyBudget: Math.round(variableMonthlyBudget * 100) / 100,
    variableSpentSoFar: Math.round(variableSpentSoFar * 100) / 100,
    remainingVariableBudget: Math.round(remainingVariableBudget * 100) / 100,
    dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
    safeToSpendNow,
    lowestBalance: Math.round(lowestBalance * 100) / 100,
    lowestBalanceDate,
    hasOverdraftRisk: lowestBalance < 0,
    hasBufferWarning: lowestBalance >= 0 && lowestBalance < 500,
    timeline
  };
}
