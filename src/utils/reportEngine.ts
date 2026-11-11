import {
  AccountEntity,
  CategoryBudgetEntity,
  CategoryEntity,
  FamilyMemberEntity,
  TransactionEntity
} from '../types';

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
}

export interface MemberSpendingItem {
  memberId: string;
  memberName: string;
  avatarColor: number;
  amount: number;
  percentage: number;
}

export interface MonthlyReportResult {
  monthIndex: number; // 0..11
  year: number;
  monthName: string;
  totalExpenseBudget: number;
  totalActualExpenses: number;
  totalIncomeBudget: number;
  totalActualIncome: number;
  netSavings: number; // Income - Expense
  netBudgetDifference: number; // Budget - Spent
  savingsRate: number; // (Savings / Income) * 100
  categories: CategoryReportItem[];
  members: MemberSpendingItem[];
  burnDownPoints: { day: number; ideal: number; actual: number }[];
}

export interface YearlyReportResult {
  year: number;
  totalAnnualBudget: number;
  totalAnnualSpent: number;
  totalAnnualIncome: number;
  remainingAnnualBudget: number;
  monthlyBreakdown: {
    monthIndex: number;
    monthName: string;
    income: number;
    expenses: number;
    savings: number;
  }[];
  categoryBreakdown: {
    categoryId: number;
    categoryName: string;
    categoryColor: number;
    annualBudget: number;
    annualSpent: number;
    percentageUsed: number;
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
  const startDate = new Date(year, monthIndex, 1, 0, 0, 0, 0).getTime();
  const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const currentDay = new Date().getDate();
  const isCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() === monthIndex;

  const monthTx = transactions.filter(
    tx => !tx.isDeleted && !tx.isExcluded && !tx.isSplitParent && tx.date >= startDate && tx.date <= endDate
  );

  // Filter out internal transfers and credit card settlement debits to avoid double counting
  const expenseTx = monthTx.filter(tx => tx.isExpense && !tx.isInternalTransfer && tx.transferType !== 'CARD_SETTLEMENT');
  const incomeTx = monthTx.filter(tx => !tx.isExpense && !tx.isInternalTransfer);

  const totalActualExpenses = expenseTx.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalActualIncome = incomeTx.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Category map
  const catItems: CategoryReportItem[] = categories
    .filter(c => !c.isDeleted)
    .map(cat => {
      const catBudgets = budgets.filter(b => !b.isDeleted && b.isActive && b.categoryId === cat.id);

      const budgetExpense = catBudgets
        .filter(b => b.isExpense)
        .reduce((sum, b) => {
          if (b.month != null && b.month !== monthIndex + 1) return sum;
          if (b.frequency === 'MONTHLY') return sum + b.amount;
          if (b.frequency === 'YEARLY') return sum + b.amount / 12;
          return sum + b.amount;
        }, 0);

      const budgetIncome = catBudgets
        .filter(b => !b.isExpense)
        .reduce((sum, b) => {
          if (b.month != null && b.month !== monthIndex + 1) return sum;
          if (b.frequency === 'MONTHLY') return sum + b.amount;
          if (b.frequency === 'YEARLY') return sum + b.amount / 12;
          return sum + b.amount;
        }, 0);

      const actualSpent = expenseTx
        .filter(tx => tx.categoryId === cat.id)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      const actualIncome = incomeTx
        .filter(tx => tx.categoryId === cat.id)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      const difference = Math.round((budgetExpense - actualSpent) * 100) / 100;
      const percentageUsed = budgetExpense > 0 ? Math.min(100, Math.round((actualSpent / budgetExpense) * 100)) : 0;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        categoryColor: cat.color,
        budgetExpense: Math.round(budgetExpense * 100) / 100,
        actualSpent: Math.round(actualSpent * 100) / 100,
        difference,
        percentageUsed,
        isOverBudget: actualSpent > budgetExpense && budgetExpense > 0,
        budgetIncome: Math.round(budgetIncome * 100) / 100,
        actualIncome: Math.round(actualIncome * 100) / 100
      };
    });

  const totalExpenseBudget = catItems.reduce((sum, c) => sum + c.budgetExpense, 0);
  const totalIncomeBudget = catItems.reduce((sum, c) => sum + c.budgetIncome, 0);

  // Spending by member
  const memberSpendingMap = new Map<string, number>();
  for (const tx of expenseTx) {
    const memId = tx.familyMemberId || 'primary';
    memberSpendingMap.set(memId, (memberSpendingMap.get(memId) || 0) + Math.abs(tx.amount));
  }

  const memberItems: MemberSpendingItem[] = members.map(m => {
    const amount = Math.round((memberSpendingMap.get(m.id) || 0) * 100) / 100;
    const percentage = totalActualExpenses > 0 ? Math.round((amount / totalActualExpenses) * 100) : 0;
    return {
      memberId: m.id,
      memberName: m.name,
      avatarColor: m.avatarColor,
      amount,
      percentage
    };
  });

  // Burn down curve calculation:
  // Ideal: linear burn of totalExpenseBudget from day 1 to daysInMonth
  // Actual: cumulative spend day-by-day
  const burnDownPoints: { day: number; ideal: number; actual: number }[] = [];
  let cumulativeSpend = 0;
  const maxDayTracked = isCurrentMonth ? currentDay : daysInMonth;

  for (let d = 1; d <= daysInMonth; d++) {
    const ideal = Math.round(((totalExpenseBudget / daysInMonth) * d) * 100) / 100;
    if (d <= maxDayTracked) {
      const dayTx = expenseTx.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate.getDate() === d;
      });
      const daySpent = dayTx.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      cumulativeSpend += daySpent;
      burnDownPoints.push({ day: d, ideal, actual: Math.round(cumulativeSpend * 100) / 100 });
    } else {
      burnDownPoints.push({ day: d, ideal, actual: 0 });
    }
  }

  const netSavings = Math.round((totalActualIncome - totalActualExpenses) * 100) / 100;
  const netBudgetDifference = Math.round((totalExpenseBudget - totalActualExpenses) * 100) / 100;
  const savingsRate = totalActualIncome > 0 ? Math.round((netSavings / totalActualIncome) * 100) : 0;

  const monthDate = new Date(year, monthIndex, 1);
  const monthName = monthDate.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });

  return {
    monthIndex,
    year,
    monthName,
    totalExpenseBudget: Math.round(totalExpenseBudget * 100) / 100,
    totalActualExpenses: Math.round(totalActualExpenses * 100) / 100,
    totalIncomeBudget: Math.round(totalIncomeBudget * 100) / 100,
    totalActualIncome: Math.round(totalActualIncome * 100) / 100,
    netSavings,
    netBudgetDifference,
    savingsRate,
    categories: catItems.sort((a, b) => b.actualSpent - a.actualSpent),
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
    tx => !tx.isDeleted && !tx.isExcluded && !tx.isSplitParent && tx.date >= startOfYear && tx.date <= endOfYear
  );

  const expenseTx = yearTx.filter(tx => tx.isExpense && !tx.isInternalTransfer && tx.transferType !== 'CARD_SETTLEMENT');
  const incomeTx = yearTx.filter(tx => !tx.isExpense && !tx.isInternalTransfer);

  const totalAnnualSpent = expenseTx.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalAnnualIncome = incomeTx.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Total annual budget calculation:
  // Monthly budget * 12 + Yearly budgets
  const activeBudgets = budgets.filter(b => !b.isDeleted && b.isActive && b.isExpense);
  const totalAnnualBudget = activeBudgets.reduce((sum, b) => {
    if (b.frequency === 'MONTHLY') return sum + b.amount * 12;
    if (b.frequency === 'YEARLY') return sum + b.amount;
    return sum + b.amount;
  }, 0);

  const remainingAnnualBudget = Math.max(0, Math.round((totalAnnualBudget - totalAnnualSpent) * 100) / 100);

  // 12 months breakdown
  const monthlyBreakdown = Array.from({ length: 12 }, (_, mIdx) => {
    const mStart = new Date(year, mIdx, 1, 0, 0, 0, 0).getTime();
    const mEnd = new Date(year, mIdx + 1, 0, 23, 59, 59, 999).getTime();

    const mExpense = expenseTx
      .filter(tx => tx.date >= mStart && tx.date <= mEnd)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const mIncome = incomeTx
      .filter(tx => tx.date >= mStart && tx.date <= mEnd)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const mDate = new Date(year, mIdx, 1);
    const monthName = mDate.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });

    return {
      monthIndex: mIdx,
      monthName,
      income: Math.round(mIncome * 100) / 100,
      expenses: Math.round(mExpense * 100) / 100,
      savings: Math.round((mIncome - mExpense) * 100) / 100
    };
  });

  // Category breakdown for the year
  const categoryBreakdown = categories
    .filter(c => !c.isDeleted)
    .map(cat => {
      const catBudgets = budgets.filter(b => !b.isDeleted && b.isActive && b.categoryId === cat.id && b.isExpense);
      const annualBudget = catBudgets.reduce((sum, b) => {
        if (b.frequency === 'MONTHLY') return sum + b.amount * 12;
        return sum + b.amount;
      }, 0);

      const annualSpent = expenseTx
        .filter(tx => tx.categoryId === cat.id)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      const percentageUsed = annualBudget > 0 ? Math.min(100, Math.round((annualSpent / annualBudget) * 100)) : 0;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: cat.color,
        annualBudget: Math.round(annualBudget * 100) / 100,
        annualSpent: Math.round(annualSpent * 100) / 100,
        percentageUsed
      };
    })
    .sort((a, b) => b.annualSpent - a.annualSpent);

  return {
    year,
    totalAnnualBudget: Math.round(totalAnnualBudget * 100) / 100,
    totalAnnualSpent: Math.round(totalAnnualSpent * 100) / 100,
    totalAnnualIncome: Math.round(totalAnnualIncome * 100) / 100,
    remainingAnnualBudget,
    monthlyBreakdown,
    categoryBreakdown
  };
}
