import {
  AccountEntity,
  CategoryBudgetEntity,
  CategoryEntity,
  FamilyMemberEntity,
  TransactionEntity
} from '../types';
import {
  getBudgetAnnualAmount,
  getBudgetMonthlyAmount,
  clampDayToMonth,
  isBudgetScheduledInMonth,
  computeSubCategoryActuals,
  computePeriodActualTotals
} from './budgetEngine';

export interface SubCategoryReportItem {
  budgetId: number;
  title: string;
  isExpense: boolean;
  budgetAmount: number;
  actualAmount: number;
  grossExpense: number;
  grossIncome: number;
  offsetAmount: number;
  difference: number;
  percentageUsed: number;
  isOverBudget: boolean;
}

export interface CategoryReportItem {
  categoryId: number;
  categoryName: string;
  categoryIcon: string;
  categoryColor: number;
  budgetExpense: number;
  actualSpent: number;
  difference: number; // budget - spent
  percentageUsed: number;
  isOverBudget: boolean;
  budgetIncome: number;
  actualIncome: number;
  subCategories: SubCategoryReportItem[];
}

export interface MemberSpendingItem {
  memberId: string;
  memberName: string;
  avatarColor: number;
  amount: number;
  percentage: number;
}

export interface BurnDownEvent {
  title: string;
  amount: number; // negative for expense, positive for income
  isExpense: boolean;
}

export interface BurnDownPoint {
  day: number; // 0 = start of month, 1..daysInMonth = end of day d
  idealExpense: number; // remaining expense budget (totalExpenseBudget -> 0)
  actualExpense: number | null; // remaining expense budget (totalExpenseBudget - cumulSpend), null for future days
  idealNet: number; // cumulative planned net (income - expense), starting at 0
  actualNet: number | null; // cumulative actual net (income - expense), null for future days
  scheduledEvents: BurnDownEvent[];
  // Compatibility aliases (expense burn-down)
  ideal: number;
  actual: number | null;
}

export interface MonthlyReportResult {
  monthIndex: number; // 0..11
  year: number;
  monthName: string;
  totalExpenseBudget: number;
  totalActualExpenses: number;
  totalIncomeBudget: number;
  totalActualIncome: number;
  unassignedExpenses: number;
  unassignedIncome: number;
  netSavings: number; // Income - Expense
  netBudgetDifference: number; // Budget - Spent
  savingsRate: number; // (Savings / Income) * 100
  categories: CategoryReportItem[];
  members: MemberSpendingItem[];
  burnDownPoints: BurnDownPoint[];
}

export interface YearlySubCategoryItem {
  budgetId: number;
  title: string;
  isExpense: boolean;
  annualBudget: number;
  annualActual: number;
  grossExpense: number;
  grossIncome: number;
  offsetAmount: number;
  percentageUsed: number;
}

export interface YearlyReportResult {
  year: number;
  totalAnnualBudget: number;
  totalAnnualSpent: number;
  totalAnnualIncome: number;
  remainingAnnualBudget: number;
  unassignedExpenses: number;
  monthlyBreakdown: {
    monthIndex: number;
    monthName: string;
    income: number;
    expenses: number;
    plannedExpenses: number;
    savings: number;
  }[];
  categoryBreakdown: {
    categoryId: number;
    categoryName: string;
    categoryColor: number;
    annualBudget: number;
    annualSpent: number;
    percentageUsed: number;
    subCategories: YearlySubCategoryItem[];
  }[];
}

export interface NetWorthSummary {
  liquidChecking: number;
  savingsTotal: number;
  deferredCardDebts: number;
  totalNetWorth: number;
}

export function computeNetWorth(accounts: AccountEntity[]): NetWorthSummary {
  let liquidChecking = 0;
  let savingsTotal = 0;
  let deferredCardDebts = 0;

  for (const acc of accounts) {
    if (acc.isDeleted) continue;
    if (acc.type === 'CHECKING' || acc.type === 'CASH') {
      liquidChecking += acc.currentBalance || 0;
    } else if (acc.type === 'SAVINGS' || acc.type === 'INVESTMENT') {
      savingsTotal += acc.currentBalance || 0;
    } else if (acc.type === 'DEFERRED_CARD') {
      if (acc.currentBalance < 0) {
        deferredCardDebts += Math.abs(acc.currentBalance);
      }
    }
  }

  const totalNetWorth = liquidChecking + savingsTotal - deferredCardDebts;
  return {
    liquidChecking: Math.round(liquidChecking * 100) / 100,
    savingsTotal: Math.round(savingsTotal * 100) / 100,
    deferredCardDebts: Math.round(deferredCardDebts * 100) / 100,
    totalNetWorth: Math.round(totalNetWorth * 100) / 100
  };
}

export function computeMonthlyReport(
  year: number,
  monthIndex: number, // 0..11
  transactions: TransactionEntity[],
  categories: CategoryEntity[],
  budgets: CategoryBudgetEntity[],
  members: FamilyMemberEntity[],
  locale: string = 'fr'
): MonthlyReportResult {
  const month1to12 = monthIndex + 1;
  const startDate = new Date(year, monthIndex, 1, 0, 0, 0, 0).getTime();
  const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const currentDay = now.getDate();
  const isPastMonth = year < nowYear || (year === nowYear && monthIndex < nowMonth);
  const isCurrentMonth = year === nowYear && monthIndex === nowMonth;

  const monthTx = transactions.filter(
    tx =>
      !tx.isDeleted &&
      !tx.isExcluded &&
      !tx.isSplitParent &&
      !tx.isInternalTransfer &&
      tx.transferType !== 'CARD_SETTLEMENT' &&
      tx.date >= startDate &&
      tx.date <= endDate
  );

  const activeBudgetById = new Map(budgets.filter(b => !b.isDeleted).map(b => [b.id, b]));
  const periodTotals = computePeriodActualTotals(monthTx, activeBudgetById);

  const totalActualExpenses = periodTotals.netExpenses;
  const totalActualIncome = periodTotals.netIncome;

  const activeCategoryIds = new Set(categories.filter(c => !c.isDeleted).map(c => c.id));
  const unassignedExpenses = monthTx
    .filter(tx => tx.isExpense && (!tx.categoryId || !activeCategoryIds.has(tx.categoryId) || !tx.budgetId))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const unassignedIncome = monthTx
    .filter(tx => !tx.isExpense && (!tx.categoryId || !activeCategoryIds.has(tx.categoryId) || !tx.budgetId))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Category wrapper aggregation from sub-category budget lines
  const catItems: CategoryReportItem[] = categories
    .filter(c => !c.isDeleted)
    .map(cat => {
      const catBudgets = budgets.filter(b => !b.isDeleted && b.categoryId === cat.id);
      const catTx = monthTx.filter(tx => tx.categoryId === cat.id);
      const catTotals = computePeriodActualTotals(catTx, activeBudgetById);

      const subCategories: SubCategoryReportItem[] = catBudgets.map(b => {
        const budgetAmount = Math.round(getBudgetMonthlyAmount(b, year, month1to12) * 100) / 100;
        const subActuals = computeSubCategoryActuals(b, catTx);
        const actualAmount = subActuals.netActual;
        const difference = Math.round((budgetAmount - actualAmount) * 100) / 100;
        const percentageUsed =
          budgetAmount > 0 ? Math.max(0, Math.min(100, Math.round((actualAmount / budgetAmount) * 100))) : 0;

        return {
          budgetId: b.id,
          title: b.title,
          isExpense: b.isExpense,
          budgetAmount,
          actualAmount,
          grossExpense: subActuals.grossExpense,
          grossIncome: subActuals.grossIncome,
          offsetAmount: subActuals.offsetAmount,
          difference,
          percentageUsed,
          isOverBudget: b.isExpense && actualAmount > budgetAmount && budgetAmount > 0
        };
      });

      const budgetExpense = catBudgets
        .filter(b => b.isExpense)
        .reduce((sum, b) => sum + getBudgetMonthlyAmount(b, year, month1to12), 0);

      const budgetIncome = catBudgets
        .filter(b => !b.isExpense)
        .reduce((sum, b) => sum + getBudgetMonthlyAmount(b, year, month1to12), 0);

      const actualSpent = catTotals.netExpenses;
      const actualIncome = catTotals.netIncome;

      const difference = Math.round((budgetExpense - actualSpent) * 100) / 100;
      const percentageUsed =
        budgetExpense > 0 ? Math.max(0, Math.min(100, Math.round((actualSpent / budgetExpense) * 100))) : 0;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        categoryColor: cat.color,
        budgetExpense: Math.round(budgetExpense * 100) / 100,
        actualSpent,
        difference,
        percentageUsed,
        isOverBudget: actualSpent > budgetExpense && budgetExpense > 0,
        budgetIncome: Math.round(budgetIncome * 100) / 100,
        actualIncome,
        subCategories
      };
    });

  const totalExpenseBudget = catItems.reduce((sum, c) => sum + c.budgetExpense, 0);
  const totalIncomeBudget = catItems.reduce((sum, c) => sum + c.budgetIncome, 0);

  // Net spending by member (reimbursements credited to expense sub-categories reduce member spending)
  const memberSpendingMap = new Map<string, number>();
  for (const tx of monthTx) {
    const budget = tx.budgetId ? activeBudgetById.get(tx.budgetId) : undefined;
    const targetIsExpense = budget ? budget.isExpense : tx.isExpense;
    if (!targetIsExpense) continue;
    const memId = tx.familyMemberId || 'primary';
    const delta = tx.isExpense ? Math.abs(tx.amount) : -Math.abs(tx.amount);
    memberSpendingMap.set(memId, (memberSpendingMap.get(memId) || 0) + delta);
  }

  const positiveMemberTotal = Array.from(memberSpendingMap.values()).reduce(
    (sum, v) => sum + Math.max(0, v),
    0
  );

  const memberItems: MemberSpendingItem[] = members.map(m => {
    const rawAmount = Math.round((memberSpendingMap.get(m.id) || 0) * 100) / 100;
    const amount = rawAmount;
    const percentage =
      positiveMemberTotal > 0 ? Math.max(0, Math.round((Math.max(0, amount) / positiveMemberTotal) * 100)) : 0;
    return {
      memberId: m.id,
      memberName: m.name,
      avatarColor: m.avatarColor,
      amount,
      percentage
    };
  });

  // Schedule-aware true burn-down & net cashflow curve calculation
  const idealExpenseByDay = new Array<number>(daysInMonth + 1).fill(0);
  const idealIncomeByDay = new Array<number>(daysInMonth + 1).fill(0);
  const scheduledEventsByDay: BurnDownEvent[][] = Array.from({ length: daysInMonth + 1 }, () => []);

  for (const b of budgets) {
    if (b.isDeleted || !b.isActive || !activeCategoryIds.has(b.categoryId)) continue;
    const monthlyAmt = getBudgetMonthlyAmount(b, year, month1to12);
    if (monthlyAmt <= 0) continue;

    if (isBudgetScheduledInMonth(b, year, month1to12) && b.day != null) {
      const effDay = clampDayToMonth(b.day, year, month1to12);
      if (b.isExpense) {
        idealExpenseByDay[effDay] += monthlyAmt;
      } else {
        idealIncomeByDay[effDay] += monthlyAmt;
      }
      scheduledEventsByDay[effDay].push({
        title: b.title || b.categoryName,
        amount: b.isExpense ? -Math.round(monthlyAmt * 100) / 100 : Math.round(monthlyAmt * 100) / 100,
        isExpense: b.isExpense
      });
    } else {
      const dailyAmt = monthlyAmt / daysInMonth;
      for (let d = 1; d <= daysInMonth; d++) {
        if (b.isExpense) {
          idealExpenseByDay[d] += dailyAmt;
        } else {
          idealIncomeByDay[d] += dailyAmt;
        }
      }
    }
  }

  const actualExpenseByDay = new Array<number>(daysInMonth + 1).fill(0);
  const actualIncomeByDay = new Array<number>(daysInMonth + 1).fill(0);
  for (const tx of monthTx) {
    const d = new Date(tx.date).getDate();
    if (d < 1 || d > daysInMonth) continue;
    const absAmt = Math.abs(tx.amount);
    const budget = tx.budgetId ? activeBudgetById.get(tx.budgetId) : undefined;
    const targetIsExpense = budget ? budget.isExpense : tx.isExpense;

    if (targetIsExpense) {
      actualExpenseByDay[d] += tx.isExpense ? absAmt : -absAmt;
    } else {
      actualIncomeByDay[d] += !tx.isExpense ? absAmt : -absAmt;
    }
  }

  const maxDayTracked = isPastMonth ? daysInMonth : isCurrentMonth ? currentDay : 0;
  const roundedTotalExpenseBudget = Math.round(totalExpenseBudget * 100) / 100;

  const burnDownPoints: BurnDownPoint[] = [
    {
      day: 0,
      idealExpense: roundedTotalExpenseBudget,
      actualExpense: maxDayTracked >= 1 ? roundedTotalExpenseBudget : null,
      idealNet: 0,
      actualNet: maxDayTracked >= 1 ? 0 : null,
      scheduledEvents: [],
      ideal: roundedTotalExpenseBudget,
      actual: maxDayTracked >= 1 ? roundedTotalExpenseBudget : null
    }
  ];

  let cumIdealExp = 0;
  let cumIdealInc = 0;
  let cumActualExp = 0;
  let cumActualInc = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    cumIdealExp += idealExpenseByDay[d];
    cumIdealInc += idealIncomeByDay[d];

    let idealExpense = Math.round((totalExpenseBudget - cumIdealExp) * 100) / 100;
    if (d === daysInMonth && Math.abs(idealExpense) < 0.05) {
      idealExpense = 0;
    }
    const idealNet = Math.round((cumIdealInc - cumIdealExp) * 100) / 100;

    let actualExpense: number | null = null;
    let actualNet: number | null = null;

    if (d <= maxDayTracked) {
      cumActualExp += actualExpenseByDay[d];
      cumActualInc += actualIncomeByDay[d];
      actualExpense = Math.round((totalExpenseBudget - cumActualExp) * 100) / 100;
      actualNet = Math.round((cumActualInc - cumActualExp) * 100) / 100;
    }

    burnDownPoints.push({
      day: d,
      idealExpense,
      actualExpense,
      idealNet,
      actualNet,
      scheduledEvents: scheduledEventsByDay[d],
      ideal: idealExpense,
      actual: actualExpense
    });
  }

  const netSavings = Math.round((totalActualIncome - totalActualExpenses) * 100) / 100;
  const netBudgetDifference = Math.round((totalExpenseBudget - totalActualExpenses) * 100) / 100;
  const savingsRate = totalActualIncome > 0 ? Math.round((netSavings / totalActualIncome) * 100) : 0;

  const monthDate = new Date(year, monthIndex, 1);
  const monthName = monthDate.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'long',
    year: 'numeric'
  });

  return {
    monthIndex,
    year,
    monthName,
    totalExpenseBudget: roundedTotalExpenseBudget,
    totalActualExpenses: Math.round(totalActualExpenses * 100) / 100,
    totalIncomeBudget: Math.round(totalIncomeBudget * 100) / 100,
    totalActualIncome: Math.round(totalActualIncome * 100) / 100,
    unassignedExpenses: Math.round(unassignedExpenses * 100) / 100,
    unassignedIncome: Math.round(unassignedIncome * 100) / 100,
    netSavings,
    netBudgetDifference,
    savingsRate,
    categories: catItems.sort((a, b) => b.actualSpent - a.actualSpent || b.budgetExpense - a.budgetExpense),
    members: memberItems.sort((a, b) => b.amount - a.amount),
    burnDownPoints
  };
}

export function computeYearlyReport(
  year: number,
  transactions: TransactionEntity[],
  categories: CategoryEntity[],
  budgets: CategoryBudgetEntity[],
  locale: string = 'fr'
): YearlyReportResult {
  const startOfYear = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
  const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999).getTime();

  const yearTx = transactions.filter(
    tx =>
      !tx.isDeleted &&
      !tx.isExcluded &&
      !tx.isSplitParent &&
      !tx.isInternalTransfer &&
      tx.transferType !== 'CARD_SETTLEMENT' &&
      tx.date >= startOfYear &&
      tx.date <= endOfYear
  );

  const activeBudgetById = new Map(budgets.filter(b => !b.isDeleted).map(b => [b.id, b]));
  const yearTotals = computePeriodActualTotals(yearTx, activeBudgetById);

  const totalAnnualSpent = yearTotals.netExpenses;
  const totalAnnualIncome = yearTotals.netIncome;

  const activeCategoryIds = new Set(categories.filter(c => !c.isDeleted).map(c => c.id));
  const unassignedExpenses = yearTx
    .filter(tx => tx.isExpense && (!tx.categoryId || !activeCategoryIds.has(tx.categoryId) || !tx.budgetId))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Total annual budget computed month-by-month across active sub-category lines
  const activeExpenseBudgets = budgets.filter(b => !b.isDeleted && b.isExpense && activeCategoryIds.has(b.categoryId));
  const totalAnnualBudget = activeExpenseBudgets.reduce(
    (sum, b) => sum + getBudgetAnnualAmount(b, year),
    0
  );

  const remainingAnnualBudget = Math.max(0, Math.round((totalAnnualBudget - totalAnnualSpent) * 100) / 100);

  // 12 months breakdown
  const monthlyBreakdown = Array.from({ length: 12 }, (_, mIdx) => {
    const mStart = new Date(year, mIdx, 1, 0, 0, 0, 0).getTime();
    const mEnd = new Date(year, mIdx + 1, 0, 23, 59, 59, 999).getTime();

    const mTx = yearTx.filter(tx => tx.date >= mStart && tx.date <= mEnd);
    const mTotals = computePeriodActualTotals(mTx, activeBudgetById);

    const plannedExpenses = activeExpenseBudgets.reduce(
      (sum, b) => sum + getBudgetMonthlyAmount(b, year, mIdx + 1),
      0
    );

    const mDate = new Date(year, mIdx, 1);
    const monthName = mDate.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });

    return {
      monthIndex: mIdx,
      monthName,
      income: mTotals.netIncome,
      expenses: mTotals.netExpenses,
      plannedExpenses: Math.round(plannedExpenses * 100) / 100,
      savings: Math.round((mTotals.netIncome - mTotals.netExpenses) * 100) / 100
    };
  });

  // Category wrapper breakdown for the year (with sub-categories)
  const categoryBreakdown = categories
    .filter(c => !c.isDeleted)
    .map(cat => {
      const catBudgets = budgets.filter(b => !b.isDeleted && b.categoryId === cat.id && b.isExpense);
      const catYearTx = yearTx.filter(tx => tx.categoryId === cat.id);
      const catTotals = computePeriodActualTotals(catYearTx, activeBudgetById);

      const subCategories: YearlySubCategoryItem[] = catBudgets.map(b => {
        const annualBudget = getBudgetAnnualAmount(b, year);
        const subActuals = computeSubCategoryActuals(b, catYearTx);
        const annualActual = subActuals.netActual;
        const percentageUsed =
          annualBudget > 0 ? Math.max(0, Math.min(100, Math.round((annualActual / annualBudget) * 100))) : 0;

        return {
          budgetId: b.id,
          title: b.title,
          isExpense: b.isExpense,
          annualBudget,
          annualActual,
          grossExpense: subActuals.grossExpense,
          grossIncome: subActuals.grossIncome,
          offsetAmount: subActuals.offsetAmount,
          percentageUsed
        };
      });

      const annualBudget = catBudgets.reduce((sum, b) => sum + getBudgetAnnualAmount(b, year), 0);
      const annualSpent = catTotals.netExpenses;

      const percentageUsed =
        annualBudget > 0 ? Math.max(0, Math.min(100, Math.round((annualSpent / annualBudget) * 100))) : 0;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: cat.color,
        annualBudget: Math.round(annualBudget * 100) / 100,
        annualSpent,
        percentageUsed,
        subCategories
      };
    })
    .sort((a, b) => b.annualSpent - a.annualSpent || b.annualBudget - a.annualBudget);

  return {
    year,
    totalAnnualBudget: Math.round(totalAnnualBudget * 100) / 100,
    totalAnnualSpent: Math.round(totalAnnualSpent * 100) / 100,
    totalAnnualIncome: Math.round(totalAnnualIncome * 100) / 100,
    remainingAnnualBudget,
    unassignedExpenses: Math.round(unassignedExpenses * 100) / 100,
    monthlyBreakdown,
    categoryBreakdown
  };
}
