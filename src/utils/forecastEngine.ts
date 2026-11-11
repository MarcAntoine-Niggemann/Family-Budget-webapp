import {
  AccountEntity,
  CategoryBudgetEntity,
  TransactionEntity
} from '../types';

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
  const currentDay = now.getDate();

  // Days in current month
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const remainingDaysInMonth = Math.max(1, daysInCurrentMonth - currentDay);

  // Transactions in current month
  const startOfMonthMillis = new Date(currentYear, currentMonth, 1).getTime();
  const endOfMonthMillis = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999).getTime();

  const currentMonthTx = transactions.filter(
    tx => !tx.isDeleted && !tx.isExcluded && !tx.isSplitParent && tx.date >= startOfMonthMillis && tx.date <= endOfMonthMillis
  );

  // Active recurring bills and income from budgets that have a fixed day of month
  const activeBudgets = budgets.filter(b => !b.isDeleted && b.isActive);

  // Find all scheduled items with day
  const scheduledExpenses = activeBudgets.filter(b => b.isExpense && b.day != null && b.day >= 1 && b.day <= 31);
  const scheduledIncome = activeBudgets.filter(b => !b.isExpense && b.day != null && b.day >= 1 && b.day <= 31);

  // Total monthly category expense budget
  const totalMonthlyExpenseBudget = activeBudgets
    .filter(b => b.isExpense)
    .reduce((sum, b) => {
      if (b.frequency === 'MONTHLY') return sum + b.amount;
      if (b.frequency === 'YEARLY') return sum + b.amount / 12;
      return sum;
    }, 0);

  // Fixed recurring expense sum
  const fixedRecurringExpensesTotal = scheduledExpenses.reduce((sum, b) => sum + b.amount, 0);

  // Variable budget allowance for discretionary spending
  const variableMonthlyBudget = Math.max(0, totalMonthlyExpenseBudget - fixedRecurringExpensesTotal);

  // Identify which scheduled bills have already been paid this month
  // A bill on day D is considered already executed if current day > D, or matched transaction exists
  const upcomingBills = scheduledExpenses.filter(b => (b.day || 0) >= currentDay);
  const upcomingBillsTotal = upcomingBills.reduce((sum, b) => sum + b.amount, 0);

  const upcomingIncomes = scheduledIncome.filter(b => (b.day || 0) >= currentDay);
  const upcomingIncomeTotal = upcomingIncomes.reduce((sum, b) => sum + b.amount, 0);

  // Variable spent so far this month (transactions that are expenses not on the scheduled bill days or general groceries/dining)
  const variableSpentSoFar = currentMonthTx
    .filter(tx => tx.isExpense && !tx.isInternalTransfer)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const remainingVariableBudget = Math.max(0, variableMonthlyBudget - variableSpentSoFar);
  const dailyBurnRate = remainingVariableBudget / remainingDaysInMonth;

  // Safe to spend now
  const safeToSpendNow = Math.round((currentLiquidBalance - upcomingBillsTotal - remainingVariableBudget) * 100) / 100;

  // Day-by-day timeline simulation
  const timeline: CashFlowPoint[] = [];
  let simulatedBalance = currentLiquidBalance;
  let lowestBalance = currentLiquidBalance;
  let lowestBalanceDate = `${currentDay}/${currentMonth + 1}`;

  // Credit card accounts to settle
  const deferredCards = accounts.filter(a => !a.isDeleted && a.type === 'DEFERRED_CARD');

  for (let i = 0; i < horizonDays; i++) {
    const simDate = new Date(currentYear, currentMonth, currentDay + i);
    const day = simDate.getDate();
    const month = simDate.getMonth() + 1;
    const dateStr = simDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const events: TimelineEvent[] = [];

    // 1. Scheduled Income (e.g. Salaries on 28th)
    for (const inc of scheduledIncome) {
      if (inc.day === day) {
        simulatedBalance += inc.amount;
        events.push({
          title: inc.title || 'Scheduled Income',
          amount: inc.amount,
          isExpense: false,
          categoryName: inc.categoryName
        });
      }
    }

    // 2. Scheduled Recurring Expenses (e.g. Rent on 1st, Bills on 5th, etc.)
    for (const exp of scheduledExpenses) {
      if (exp.day === day) {
        simulatedBalance -= exp.amount;
        events.push({
          title: exp.title || 'Scheduled Bill',
          amount: -exp.amount,
          isExpense: true,
          categoryName: exp.categoryName
        });
      }
    }

    // 3. Deferred Credit Card settlements (e.g. on 30th)
    for (const card of deferredCards) {
      if (card.settlementDay === day) {
        // card balance is negative (e.g. -439.90) so we settle it from checking account
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

    // 4. Daily variable burn rate (prorated discretionary spending)
    if (i > 0) {
      simulatedBalance -= dailyBurnRate;
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
