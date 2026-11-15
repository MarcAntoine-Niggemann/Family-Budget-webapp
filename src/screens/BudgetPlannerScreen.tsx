import React, { useMemo, useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calendar,
  PauseCircle,
  ArrowUpRight,
  BarChart3
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryBudgetEntity, CategoryEntity } from '../types';
import {
  computePeriodActualTotals,
  computeSubCategoryActuals,
  formatBudgetScheduleLabel,
  formatBudgetWindowLabel,
  getBudgetActiveMonthsInYear,
  getBudgetAnnualAmount,
  getBudgetMonthlyAmount,
  getMonthLongName,
  getMonthShortName,
  isBudgetActiveInMonth
} from '../utils/budgetEngine';

export const BudgetPlannerScreen: React.FC = () => {
  const {
    categories,
    budgets,
    transactions,
    currency,
    language,
    addCategory,
    updateCategory,
    deleteCategory,
    addBudget,
    updateBudget,
    deleteBudget,
    drillDownToTransactions
  } = useBudget();

  const isFr = language === 'fr';

  const activeCategories = categories.filter(c => !c.isDeleted);
  const activeCategoryIds = new Set(activeCategories.map(c => c.id));
  const activeBudgets = budgets.filter(b => !b.isDeleted && activeCategoryIds.has(b.categoryId));
  const activeBudgetById = useMemo(() => new Map(activeBudgets.map(b => [b.id, b])), [activeBudgets]);

  // View mode (Month-by-month vs Global Year), Selected Month & Year (defaults to current)
  const now = new Date();
  const [viewMode, setViewMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0..11
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [graphSeriesMode, setGraphSeriesMode] = useState<'BOTH' | 'PLANNED' | 'ACTUAL'>('BOTH');
  const [inspectedMonthIdx, setInspectedMonthIdx] = useState<number>(now.getMonth()); // 0..11
  const selectedMonth1 = selectedMonth + 1; // 1..12

  // Category modal state (pure color/icon wrapper)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryEntity | null>(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('ShoppingCart');
  const [catColorHex, setCatColorHex] = useState('#3b82f6');

  // Sub-category budget line modal state
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<CategoryBudgetEntity | null>(null);
  const [targetCategoryId, setTargetCategoryId] = useState<number>(activeCategories[0]?.id || 1);

  const [budgetTitle, setBudgetTitle] = useState('');
  const [budgetAmountStr, setBudgetAmountStr] = useState('');
  const [budgetIsExpense, setBudgetIsExpense] = useState(true);
  const [budgetFreq, setBudgetFreq] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [budgetMonth, setBudgetMonth] = useState<number | ''>(''); // '' = spread across year, 1..12 = specific month
  const [hasSpecificDay, setHasSpecificDay] = useState<boolean>(false);
  const [budgetDay, setBudgetDay] = useState<number>(1);
  const [showWindowOptions, setShowWindowOptions] = useState<boolean>(false);
  const [startYear, setStartYear] = useState<number | ''>('');
  const [startMonth, setStartMonth] = useState<number | ''>('');
  const [endYear, setEndYear] = useState<number | ''>('');
  const [endMonth, setEndMonth] = useState<number | ''>('');
  const [budgetNotes, setBudgetNotes] = useState<string>('');
  const [budgetIsActive, setBudgetIsActive] = useState<boolean>(true);

  // Time bounds for selected month & selected year
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const monthStartDate = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0).getTime();
  const monthEndDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999).getTime();
  const monthDateFrom = `${selectedYear}-${pad2(selectedMonth + 1)}-01`;
  const monthLastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthDateTo = `${selectedYear}-${pad2(selectedMonth + 1)}-${pad2(monthLastDay)}`;

  const yearStartDate = new Date(selectedYear, 0, 1, 0, 0, 0, 0).getTime();
  const yearEndDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999).getTime();
  const yearDateFrom = `${selectedYear}-01-01`;
  const yearDateTo = `${selectedYear}-12-31`;

  const periodStartDate = viewMode === 'MONTH' ? monthStartDate : yearStartDate;
  const periodEndDate = viewMode === 'MONTH' ? monthEndDate : yearEndDate;
  const periodDateFrom = viewMode === 'MONTH' ? monthDateFrom : yearDateFrom;
  const periodDateTo = viewMode === 'MONTH' ? monthDateTo : yearDateTo;

  // Active transactions in selected period (Month or Year)
  const periodTx = transactions.filter(
    tx =>
      !tx.isDeleted &&
      !tx.isExcluded &&
      !tx.isSplitParent &&
      tx.date >= periodStartDate &&
      tx.date <= periodEndDate
  );

  // 12-month series for Year Graph (monthly net values: planned vs actual)
  const yearlyMonthlySeries = useMemo(() => {
    const yearAllTx = transactions.filter(
      tx =>
        !tx.isDeleted &&
        !tx.isExcluded &&
        !tx.isSplitParent &&
        tx.date >= yearStartDate &&
        tx.date <= yearEndDate
    );

    return Array.from({ length: 12 }, (_, mIdx) => {
      const month1 = mIdx + 1;
      const mStart = new Date(selectedYear, mIdx, 1, 0, 0, 0, 0).getTime();
      const mEnd = new Date(selectedYear, mIdx + 1, 0, 23, 59, 59, 999).getTime();

      const plannedExpense = activeBudgets
        .filter(b => b.isExpense)
        .reduce((sum, b) => sum + getBudgetMonthlyAmount(b, selectedYear, month1), 0);
      const plannedIncome = activeBudgets
        .filter(b => !b.isExpense)
        .reduce((sum, b) => sum + getBudgetMonthlyAmount(b, selectedYear, month1), 0);

      const mTx = yearAllTx.filter(
        tx =>
          tx.date >= mStart &&
          tx.date <= mEnd &&
          !tx.isInternalTransfer &&
          tx.transferType !== 'CARD_SETTLEMENT'
      );
      const mTotals = computePeriodActualTotals(mTx, activeBudgetById);
      const hasActualTx = mTx.length > 0;

      const roundedPlannedExp = Math.round(plannedExpense * 100) / 100;
      const roundedPlannedInc = Math.round(plannedIncome * 100) / 100;
      const roundedActualExp = mTotals.netExpenses;
      const roundedActualInc = mTotals.netIncome;

      return {
        monthIndex: mIdx,
        month1,
        shortName: getMonthShortName(month1, language),
        longName: getMonthLongName(month1, language),
        plannedIncome: roundedPlannedInc,
        plannedExpense: roundedPlannedExp,
        plannedNet: Math.round((roundedPlannedInc - roundedPlannedExp) * 100) / 100,
        actualIncome: roundedActualInc,
        actualExpense: roundedActualExp,
        actualNet: Math.round((roundedActualInc - roundedActualExp) * 100) / 100,
        hasActualTx
      };
    });
  }, [transactions, activeBudgets, activeBudgetById, selectedYear, yearStartDate, yearEndDate, language]);

  // Open Category wrapper modal
  const handleOpenCatModal = (cat?: CategoryEntity) => {
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatIcon(cat.icon);
      setCatColorHex(`#${cat.color.toString(16).padStart(6, '0').slice(-6)}`);
    } else {
      setEditingCategory(null);
      setCatName('');
      setCatIcon('ShoppingCart');
      setCatColorHex('#3b82f6');
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const colorNum = parseInt(catColorHex.replace('#', '0xff'), 16);

    if (editingCategory) {
      updateCategory({
        ...editingCategory,
        name: catName.trim(),
        icon: catIcon,
        color: colorNum
      });
    } else {
      addCategory({
        name: catName.trim(),
        icon: catIcon,
        color: colorNum
      });
    }
    setIsCategoryModalOpen(false);
  };

  // Open Sub-Category Budget Line modal
  const handleOpenBudgetModal = (categoryId: number, b?: CategoryBudgetEntity) => {
    setTargetCategoryId(categoryId);
    if (b) {
      setEditingBudget(b);
      setBudgetTitle(b.title);
      setBudgetAmountStr(b.amount.toString());
      setBudgetIsExpense(b.isExpense);
      setBudgetFreq(b.frequency === 'YEARLY' ? 'YEARLY' : 'MONTHLY');
      setBudgetMonth(b.frequency === 'YEARLY' && b.month != null ? b.month : '');
      const hasDay = b.day != null && b.day >= 1 && b.day <= 31;
      setHasSpecificDay(hasDay);
      setBudgetDay(hasDay ? (b.day as number) : 1);
      const hasWindow =
        b.startYear != null || b.startMonth != null || b.endYear != null || b.endMonth != null || Boolean(b.notes) || !b.isActive;
      setShowWindowOptions(hasWindow);
      setStartYear(b.startYear ?? '');
      setStartMonth(b.startMonth ?? '');
      setEndYear(b.endYear ?? '');
      setEndMonth(b.endMonth ?? '');
      setBudgetNotes(b.notes || '');
      setBudgetIsActive(b.isActive);
    } else {
      setEditingBudget(null);
      setBudgetTitle('');
      setBudgetAmountStr('');
      setBudgetIsExpense(true);
      setBudgetFreq('MONTHLY');
      setBudgetMonth('');
      setHasSpecificDay(false);
      setBudgetDay(1);
      setShowWindowOptions(false);
      setStartYear('');
      setStartMonth('');
      setEndYear('');
      setEndMonth('');
      setBudgetNotes('');
      setBudgetIsActive(true);
    }
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(budgetAmountStr.replace(',', '.'));
    if (isNaN(val) || val <= 0 || !budgetTitle.trim()) return;

    const cat = activeCategories.find(c => c.id === targetCategoryId);

    const resolvedMonth =
      budgetFreq === 'YEARLY' && typeof budgetMonth === 'number' && budgetMonth >= 1 && budgetMonth <= 12
        ? budgetMonth
        : null;

    // A specific day applies to MONTHLY lines, or YEARLY lines assigned to a specific month
    const canHaveSpecificDay = budgetFreq === 'MONTHLY' || (budgetFreq === 'YEARLY' && resolvedMonth !== null);
    const resolvedDay =
      canHaveSpecificDay && hasSpecificDay && budgetDay >= 1 && budgetDay <= 31 ? Math.floor(budgetDay) : null;

    const resolvedStartYear = typeof startYear === 'number' && startYear > 1900 ? startYear : undefined;
    const resolvedStartMonth =
      resolvedStartYear != null && typeof startMonth === 'number' && startMonth >= 1 && startMonth <= 12
        ? startMonth
        : null;
    const resolvedEndYear = typeof endYear === 'number' && endYear > 1900 ? endYear : null;
    const resolvedEndMonth =
      resolvedEndYear != null && typeof endMonth === 'number' && endMonth >= 1 && endMonth <= 12
        ? endMonth
        : null;

    const payload = {
      categoryId: targetCategoryId,
      categoryName: cat?.name || editingBudget?.categoryName || '',
      title: budgetTitle.trim(),
      amount: Math.round(val * 100) / 100,
      frequency: budgetFreq,
      year: selectedYear,
      month: resolvedMonth,
      day: resolvedDay,
      startYear: resolvedStartYear,
      startMonth: resolvedStartMonth,
      endYear: resolvedEndYear,
      endMonth: resolvedEndMonth,
      notes: budgetNotes.trim() || null,
      isExpense: budgetIsExpense,
      isActive: budgetIsActive
    };

    if (editingBudget) {
      updateBudget({
        ...editingBudget,
        ...payload
      });
    } else {
      addBudget(payload);
    }
    setIsBudgetModalOpen(false);
  };

  // Month navigation label
  const monthDate = new Date(selectedYear, selectedMonth, 1);
  const monthLabel = monthDate.toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
    month: 'long',
    year: 'numeric'
  });

  // Totals for selected period (Month or Year) using shared budget engine
  const getLinePeriodBudget = (b: CategoryBudgetEntity) =>
    viewMode === 'MONTH'
      ? getBudgetMonthlyAmount(b, selectedYear, selectedMonth1)
      : getBudgetAnnualAmount(b, selectedYear);

  const periodTotals = computePeriodActualTotals(periodTx, activeBudgetById);

  const totalExpenseBudget = activeBudgets
    .filter(b => b.isExpense)
    .reduce((sum, b) => sum + getLinePeriodBudget(b), 0);

  const totalActualExpenses = periodTotals.netExpenses;

  const totalIncomeBudget = activeBudgets
    .filter(b => !b.isExpense)
    .reduce((sum, b) => sum + getLinePeriodBudget(b), 0);

  const totalActualIncome = periodTotals.netIncome;

  const projectedPeriodNet = totalIncomeBudget - totalExpenseBudget;
  const actualPeriodNet = totalActualIncome - totalActualExpenses;

  const formatCompactNet = (val: number) => {
    const abs = Math.abs(val);
    const sign = val > 0 ? '+' : val < 0 ? '-' : '';
    if (abs >= 10000) {
      return `${sign}${(abs / 1000).toFixed(1)}k`;
    }
    return `${sign}${Math.round(abs).toLocaleString()}`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Month/Year Navigation & Action Header */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {isFr ? 'Planificateur de Budget' : 'Budget Planner'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {viewMode === 'MONTH'
              ? isFr
                ? 'Catégories et sous-catégories budgétaires mois par mois'
                : 'Month-by-month category wrappers and sub-category budget lines'
              : isFr
              ? `Vue annuelle globale ${selectedYear} et évolution mensuelle du solde net`
              : `Global ${selectedYear} annual budgets and monthly net balance overview`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month / Year Mode Switcher */}
          <div
            className="grid grid-cols-2 p-1 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold"
            role="group"
            aria-label={isFr ? 'Période budgétaire' : 'Budget period mode'}
          >
            <button
              type="button"
              onClick={() => setViewMode('MONTH')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'MONTH'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isFr ? 'Mois' : 'Month'}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('YEAR')}
              className={`px-3 py-1.5 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'YEAR'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isFr ? 'Année' : 'Year'}
            </button>
          </div>

          {/* Period Switcher (Month or Year) */}
          {viewMode === 'MONTH' ? (
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  if (selectedMonth === 0) {
                    setSelectedMonth(11);
                    setSelectedYear(y => y - 1);
                  } else {
                    setSelectedMonth(m => m - 1);
                  }
                }}
                className="px-2.5 py-1 text-slate-400 hover:text-slate-200 transition rounded-lg hover:bg-slate-800 cursor-pointer"
                aria-label={isFr ? 'Mois précédent' : 'Previous month'}
              >
                ←
              </button>
              <span className="px-3 font-semibold text-slate-200 capitalize whitespace-nowrap">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (selectedMonth === 11) {
                    setSelectedMonth(0);
                    setSelectedYear(y => y + 1);
                  } else {
                    setSelectedMonth(m => m + 1);
                  }
                }}
                className="px-2.5 py-1 text-slate-400 hover:text-slate-200 transition rounded-lg hover:bg-slate-800 cursor-pointer"
                aria-label={isFr ? 'Mois suivant' : 'Next month'}
              >
                →
              </button>
            </div>
          ) : (
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={() => setSelectedYear(y => y - 1)}
                className="px-2.5 py-1 text-slate-400 hover:text-slate-200 transition rounded-lg hover:bg-slate-800 cursor-pointer"
                aria-label={isFr ? 'Année précédente' : 'Previous year'}
              >
                ←
              </button>
              <span className="px-3 font-semibold text-slate-200 font-mono tabular-nums whitespace-nowrap">
                {selectedYear}
              </span>
              <button
                type="button"
                onClick={() => setSelectedYear(y => y + 1)}
                className="px-2.5 py-1 text-slate-400 hover:text-slate-200 transition rounded-lg hover:bg-slate-800 cursor-pointer"
                aria-label={isFr ? 'Année suivante' : 'Next year'}
              >
                →
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleOpenCatModal()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isFr ? 'Nouvelle Catégorie' : 'New Category'}</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-xs font-semibold text-slate-400 block">
            {viewMode === 'MONTH'
              ? isFr
                ? 'Dépenses du mois (Réalisé / Prévu)'
                : 'Monthly Expenses (Actual / Budget)'
              : isFr
              ? `Dépenses ${selectedYear} (Réalisé / Prévu)`
              : `${selectedYear} Expenses (Actual / Budget)`}
          </span>
          <div className="mt-2 flex items-baseline gap-2 tabular-nums">
            <span className="text-2xl font-bold text-white font-mono">
              {totalActualExpenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              / {totalExpenseBudget.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
            </span>
          </div>
          <div className="mt-2 text-xs font-medium flex items-center justify-between tabular-nums">
            <span className="text-slate-400">{isFr ? 'Reste à dépenser' : 'Remaining'}</span>
            <span
              className={`font-mono ${
                totalExpenseBudget - totalActualExpenses >= 0 ? 'text-teal-400' : 'text-rose-400'
              }`}
            >
              {(totalExpenseBudget - totalActualExpenses).toLocaleString(undefined, {
                maximumFractionDigits: 2
              })}{' '}
              {currency}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-xs font-semibold text-slate-400 block">
            {viewMode === 'MONTH'
              ? isFr
                ? 'Revenus du mois (Reçus / Attendus)'
                : 'Monthly Income (Received / Target)'
              : isFr
              ? `Revenus ${selectedYear} (Reçus / Attendus)`
              : `${selectedYear} Income (Received / Target)`}
          </span>
          <div className="mt-2 flex items-baseline gap-2 tabular-nums">
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              {totalActualIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              / {totalIncomeBudget.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
            </span>
          </div>
          <div className="mt-2 text-xs font-medium flex items-center justify-between tabular-nums">
            <span className="text-slate-400">{isFr ? 'Taux d’atteinte' : 'Completion'}</span>
            <span className="text-emerald-400 font-mono">
              {totalIncomeBudget > 0
                ? `${Math.round((totalActualIncome / totalIncomeBudget) * 100)}%`
                : '—'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-xs font-semibold text-slate-400 block">
            {viewMode === 'MONTH'
              ? isFr
                ? 'Solde Budgétaire Prévu'
                : 'Projected Monthly Net'
              : isFr
              ? `Solde Budgétaire Annuel (${selectedYear})`
              : `Projected Annual Net (${selectedYear})`}
          </span>
          <div className="mt-2 flex items-baseline gap-2 tabular-nums">
            <span
              className={`text-2xl font-bold font-mono ${
                projectedPeriodNet >= 0 ? 'text-indigo-400' : 'text-rose-400'
              }`}
            >
              {projectedPeriodNet >= 0 ? '+' : ''}
              {projectedPeriodNet.toLocaleString(undefined, {
                maximumFractionDigits: 2
              })}
            </span>
            <span className="text-xs text-slate-400">{currency}</span>
          </div>
          <div className="mt-2 text-xs font-medium flex items-center justify-between tabular-nums">
            <span className="text-slate-400">{isFr ? 'Solde réel constaté' : 'Actual net so far'}</span>
            <span
              className={`font-mono ${actualPeriodNet >= 0 ? 'text-teal-400' : 'text-rose-400'}`}
            >
              {actualPeriodNet >= 0 ? '+' : ''}
              {actualPeriodNet.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
            </span>
          </div>
        </div>
      </div>

      {/* Year Graph with Monthly Net Values (Year Mode Only) */}
      {viewMode === 'YEAR' && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-lg space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-400 shrink-0" />
                <h2 className="text-sm font-bold text-white">
                  {isFr
                    ? `Solde Net Mensuel — ${selectedYear}`
                    : `Monthly Net Values — ${selectedYear}`}
                </h2>
              </div>
              <p className="text-[11px] text-slate-400">
                {isFr
                  ? 'Revenus moins dépenses pour chaque mois (budget prévu vs réalisé). Cliquez sur un mois pour l’inspecter.'
                  : 'Income minus expenses for each month (planned budget vs. actual). Click any month to inspect or open.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Series Filter */}
              <div className="grid grid-cols-3 p-1 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setGraphSeriesMode('BOTH')}
                  className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                    graphSeriesMode === 'BOTH'
                      ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isFr ? 'Prévu & Réel' : 'Both'}
                </button>
                <button
                  type="button"
                  onClick={() => setGraphSeriesMode('PLANNED')}
                  className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                    graphSeriesMode === 'PLANNED'
                      ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isFr ? 'Prévu' : 'Planned'}
                </button>
                <button
                  type="button"
                  onClick={() => setGraphSeriesMode('ACTUAL')}
                  className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer ${
                    graphSeriesMode === 'ACTUAL'
                      ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isFr ? 'Réalisé' : 'Actual'}
                </button>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                {graphSeriesMode !== 'ACTUAL' && (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 inline-block" />
                    {isFr ? 'Net prévu' : 'Planned net'}
                  </span>
                )}
                {graphSeriesMode !== 'PLANNED' && (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-sm bg-teal-400 inline-block" />
                    {isFr ? 'Net réel' : 'Actual net'}
                  </span>
                )}
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                  {isFr ? 'Déficit' : 'Deficit'}
                </span>
              </div>
            </div>
          </div>

          {(() => {
            const valuesForScale: number[] = [0];
            for (const m of yearlyMonthlySeries) {
              if (graphSeriesMode !== 'ACTUAL') valuesForScale.push(m.plannedNet);
              if (graphSeriesMode !== 'PLANNED' && (m.hasActualTx || m.actualNet !== 0)) {
                valuesForScale.push(m.actualNet);
              }
            }

            const rawMin = Math.min(...valuesForScale);
            const rawMax = Math.max(...valuesForScale);
            const rawSpan = rawMax - rawMin || 100;
            const maxVal = rawMax > 0 ? rawMax + rawSpan * 0.14 : rawSpan * 0.1;
            const minVal = rawMin < 0 ? rawMin - rawSpan * 0.14 : 0;
            const range = maxVal - minVal || 1;

            const width = 840;
            const height = 210;
            const padX = 10;
            const padY = 18;
            const plotH = height - 2 * padY;
            const colW = (width - 2 * padX) / 12;

            const toY = (val: number) => height - padY - ((val - minVal) / range) * plotH;
            const zeroY = toY(0);

            const activeMonthData = yearlyMonthlySeries[inspectedMonthIdx] || yearlyMonthlySeries[0];
            const activeVariance = activeMonthData.hasActualTx
              ? Math.round((activeMonthData.actualNet - activeMonthData.plannedNet) * 100) / 100
              : null;

            return (
              <div className="space-y-3">
                {/* Diverging Bar SVG */}
                <div className="flex gap-2 items-stretch">
                  {/* Y-Axis Labels */}
                  <div className="flex flex-col justify-between text-[10px] font-mono tabular-nums text-slate-500 py-2 text-right min-w-[60px] shrink-0">
                    <span>
                      {maxVal > 0 ? `+${Math.round(maxVal).toLocaleString()}` : '0'} {currency}
                    </span>
                    {minVal < 0 && maxVal > 0 && <span>0 {currency}</span>}
                    <span>
                      {minVal < 0 ? Math.round(minVal).toLocaleString() : '0'} {currency}
                    </span>
                  </div>

                  {/* Chart Area */}
                  <div className="relative h-52 flex-1 select-none min-w-0">
                    <svg
                      className="w-full h-full overflow-visible"
                      preserveAspectRatio="none"
                      viewBox={`0 0 ${width} ${height}`}
                    >
                      {/* Reference horizontal grid lines */}
                      <line
                        x1={padX}
                        y1={padY + plotH * 0.25}
                        x2={width - padX}
                        y2={padY + plotH * 0.25}
                        stroke="#1e293b"
                        strokeDasharray="3 3"
                      />
                      <line
                        x1={padX}
                        y1={padY + plotH * 0.5}
                        x2={width - padX}
                        y2={padY + plotH * 0.5}
                        stroke="#1e293b"
                        strokeDasharray="3 3"
                      />
                      <line
                        x1={padX}
                        y1={padY + plotH * 0.75}
                        x2={width - padX}
                        y2={padY + plotH * 0.75}
                        stroke="#1e293b"
                        strokeDasharray="3 3"
                      />

                      {/* Zero baseline */}
                      <line
                        x1={padX}
                        y1={zeroY}
                        x2={width - padX}
                        y2={zeroY}
                        stroke="#475569"
                        strokeWidth="1.4"
                      />

                      {yearlyMonthlySeries.map((m, idx) => {
                        const x0 = padX + idx * colW;
                        const centerX = x0 + colW / 2;
                        const isInspected = inspectedMonthIdx === idx;

                        const showPlanned = graphSeriesMode !== 'ACTUAL';
                        const showActual = graphSeriesMode !== 'PLANNED' && m.hasActualTx;

                        const barWidth = graphSeriesMode === 'BOTH' ? Math.min(20, colW * 0.32) : Math.min(34, colW * 0.52);
                        const pairGap = graphSeriesMode === 'BOTH' ? 4 : 0;

                        const plannedX =
                          graphSeriesMode === 'BOTH'
                            ? centerX - barWidth - pairGap / 2
                            : centerX - barWidth / 2;
                        const actualX =
                          graphSeriesMode === 'BOTH'
                            ? centerX + pairGap / 2
                            : centerX - barWidth / 2;

                        const plannedYTop = m.plannedNet >= 0 ? toY(m.plannedNet) : zeroY;
                        const plannedH = Math.max(
                          m.plannedNet !== 0 ? 2 : 0,
                          Math.abs(toY(m.plannedNet) - zeroY)
                        );

                        const actualYTop = m.actualNet >= 0 ? toY(m.actualNet) : zeroY;
                        const actualH = Math.max(
                          m.hasActualTx ? 2 : 0,
                          Math.abs(toY(m.actualNet) - zeroY)
                        );

                        const singleBarVal =
                          graphSeriesMode === 'PLANNED'
                            ? m.plannedNet
                            : graphSeriesMode === 'ACTUAL' && m.hasActualTx
                            ? m.actualNet
                            : null;

                        return (
                          <g key={m.monthIndex}>
                            {isInspected && (
                              <rect
                                x={x0 + 2}
                                y={padY - 6}
                                width={Math.max(4, colW - 4)}
                                height={plotH + 12}
                                rx={6}
                                fill="#1e293b"
                                fillOpacity="0.55"
                              />
                            )}

                            {/* Planned Net Bar */}
                            {showPlanned && plannedH > 0 && (
                              <rect
                                x={plannedX}
                                y={plannedYTop}
                                width={barWidth}
                                height={plannedH}
                                rx={3}
                                fill={m.plannedNet >= 0 ? '#818cf8' : '#f59e0b'}
                                fillOpacity={isInspected ? 0.95 : 0.78}
                              />
                            )}

                            {/* Actual Net Bar */}
                            {showActual && actualH > 0 && (
                              <rect
                                x={actualX}
                                y={actualYTop}
                                width={barWidth}
                                height={actualH}
                                rx={3}
                                fill={m.actualNet >= 0 ? '#2dd4bf' : '#f43f5e'}
                                fillOpacity={isInspected ? 1 : 0.85}
                              />
                            )}

                            {/* Single-series inline value label */}
                            {singleBarVal !== null && (
                              <text
                                x={centerX}
                                y={
                                  singleBarVal >= 0
                                    ? Math.max(11, toY(singleBarVal) - 5)
                                    : Math.min(height - 3, toY(singleBarVal) + 12)
                                }
                                textAnchor="middle"
                                fontSize="10"
                                fontFamily="JetBrains Mono, monospace"
                                fill={
                                  singleBarVal >= 0
                                    ? graphSeriesMode === 'PLANNED'
                                      ? '#a5b4fc'
                                      : '#5eead4'
                                    : '#fda4af'
                                }
                              >
                                {formatCompactNet(singleBarVal)}
                              </text>
                            )}

                            {/* Interactive column hit box */}
                            <rect
                              x={x0}
                              y={0}
                              width={colW}
                              height={height}
                              fill="transparent"
                              className="cursor-pointer"
                              onMouseEnter={() => setInspectedMonthIdx(idx)}
                              onClick={() => setInspectedMonthIdx(idx)}
                            />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* 12-Month Net Strip (every month's exact net value visible at a glance) */}
                <div className="overflow-x-auto pb-1">
                  <div className="grid grid-cols-12 gap-1 min-w-[660px] pl-16">
                    {yearlyMonthlySeries.map((m, idx) => {
                      const isInspected = inspectedMonthIdx === idx;
                      const isCurrentCalendarMonth =
                        selectedYear === now.getFullYear() && idx === now.getMonth();

                      return (
                        <button
                          key={m.monthIndex}
                          type="button"
                          onClick={() => setInspectedMonthIdx(idx)}
                          className={`px-1 py-1.5 rounded-lg text-center transition cursor-pointer border ${
                            isInspected
                              ? 'bg-slate-800 border-teal-500/50'
                              : 'bg-slate-950/40 border-transparent hover:bg-slate-800/50'
                          }`}
                        >
                          <div
                            className={`text-[10px] font-semibold capitalize truncate ${
                              isCurrentCalendarMonth
                                ? 'text-teal-400'
                                : isInspected
                                ? 'text-white'
                                : 'text-slate-400'
                            }`}
                          >
                            {m.shortName}
                          </div>
                          {graphSeriesMode !== 'ACTUAL' && (
                            <div
                              className={`text-[10px] font-mono tabular-nums mt-0.5 ${
                                m.plannedNet >= 0 ? 'text-indigo-300' : 'text-amber-400'
                              }`}
                              title={isFr ? 'Net prévu' : 'Planned net'}
                            >
                              {formatCompactNet(m.plannedNet)}
                            </div>
                          )}
                          {graphSeriesMode !== 'PLANNED' && (
                            <div
                              className={`text-[10px] font-mono tabular-nums ${
                                !m.hasActualTx
                                  ? 'text-slate-600'
                                  : m.actualNet >= 0
                                  ? 'text-teal-400'
                                  : 'text-rose-400'
                              }`}
                              title={isFr ? 'Net réel' : 'Actual net'}
                            >
                              {m.hasActualTx ? formatCompactNet(m.actualNet) : '—'}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Inspected Month Detail Bar */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 tabular-nums">
                    <span className="font-semibold text-white capitalize">
                      {activeMonthData.longName} {selectedYear}
                    </span>

                    <span className="text-slate-400 font-mono">
                      <span className="font-sans">{isFr ? 'Prévu :' : 'Planned:'}</span>{' '}
                      <strong
                        className={
                          activeMonthData.plannedNet >= 0 ? 'text-indigo-300' : 'text-amber-400'
                        }
                      >
                        {activeMonthData.plannedNet >= 0 ? '+' : ''}
                        {activeMonthData.plannedNet.toLocaleString(undefined, {
                          maximumFractionDigits: 2
                        })}{' '}
                        {currency}
                      </strong>{' '}
                      <span className="text-[11px] text-slate-500">
                        (+{activeMonthData.plannedIncome.toLocaleString()} / -
                        {activeMonthData.plannedExpense.toLocaleString()})
                      </span>
                    </span>

                    {activeMonthData.hasActualTx ? (
                      <span className="text-slate-400 font-mono">
                        <span className="font-sans">{isFr ? 'Réel :' : 'Actual:'}</span>{' '}
                        <strong
                          className={
                            activeMonthData.actualNet >= 0 ? 'text-teal-300' : 'text-rose-400'
                          }
                        >
                          {activeMonthData.actualNet >= 0 ? '+' : ''}
                          {activeMonthData.actualNet.toLocaleString(undefined, {
                            maximumFractionDigits: 2
                          })}{' '}
                          {currency}
                        </strong>{' '}
                        <span className="text-[11px] text-slate-500">
                          (+{activeMonthData.actualIncome.toLocaleString()} / -
                          {activeMonthData.actualExpense.toLocaleString()})
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">
                        {isFr ? 'Aucune opération enregistrée' : 'No recorded transactions'}
                      </span>
                    )}

                    {activeVariance !== null && (
                      <span
                        className={`font-mono font-semibold ${
                          activeVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        ({activeVariance >= 0 ? '+' : ''}
                        {activeVariance.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                        {currency})
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth(activeMonthData.monthIndex);
                      setViewMode('MONTH');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold text-xs transition whitespace-nowrap shrink-0 cursor-pointer self-start lg:self-auto"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Ouvrir ce mois' : 'Open Month'}</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Category Wrappers & Sub-Category Budget Lines */}
      <div className="space-y-4">
        {activeCategories.map(cat => {
          const catBudgets = activeBudgets.filter(b => b.categoryId === cat.id);
          const catTx = periodTx.filter(tx => tx.categoryId === cat.id);
          const catTotals = computePeriodActualTotals(catTx, activeBudgetById);

          const catExpenses = catTotals.netExpenses;
          const catIncomeActual = catTotals.netIncome;

          const catExpenseBudget = catBudgets
            .filter(b => b.isExpense)
            .reduce((sum, b) => sum + getLinePeriodBudget(b), 0);

          const catIncomeBudget = catBudgets
            .filter(b => !b.isExpense)
            .reduce((sum, b) => sum + getLinePeriodBudget(b), 0);

          const hasExpenseLines = catBudgets.some(b => b.isExpense) || catExpenses !== 0;
          const hasIncomeLines = catBudgets.some(b => !b.isExpense) || catIncomeActual !== 0;

          const percentUsed =
            catExpenseBudget > 0 ? Math.max(0, Math.min(100, Math.round((catExpenses / catExpenseBudget) * 100))) : 0;
          const isOver = catExpenses > catExpenseBudget && catExpenseBudget > 0;

          return (
            <div
              key={cat.id}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-lg space-y-4"
            >
              {/* Category Wrapper Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    drillDownToTransactions({
                      dateFrom: periodDateFrom,
                      dateTo: periodDateTo,
                      categoryId: cat.id,
                      budgetId: 'ALL'
                    })
                  }
                  title={
                    viewMode === 'MONTH'
                      ? isFr
                        ? 'Voir les transactions de cette catégorie pour ce mois'
                        : 'View transactions for this category in selected month'
                      : isFr
                      ? `Voir les transactions de cette catégorie en ${selectedYear}`
                      : `View transactions for this category in ${selectedYear}`
                  }
                  className="flex items-center gap-3 text-left group/cat cursor-pointer min-w-0"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
                    style={{ backgroundColor: `#${cat.color.toString(16).padStart(6, '0').slice(-6)}` }}
                  >
                    <CategoryIcon name={cat.icon || cat.name} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-base text-white group-hover/cat:text-teal-300 transition truncate">
                        {cat.name}
                      </h3>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover/cat:text-teal-300 transition shrink-0" />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                      {hasExpenseLines && (
                        <span>
                          {isFr ? 'Dépenses :' : 'Spent:'}{' '}
                          <strong className="text-slate-200 font-mono">
                            {catExpenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </strong>{' '}
                          /{' '}
                          <span className="font-mono">
                            {catExpenseBudget.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
                          </span>
                        </span>
                      )}
                      {hasIncomeLines && (
                        <span>
                          {isFr ? 'Revenus :' : 'Income:'}{' '}
                          <strong className="text-emerald-400 font-mono">
                            {catIncomeActual.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </strong>{' '}
                          /{' '}
                          <span className="font-mono">
                            {catIncomeBudget.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
                          </span>
                        </span>
                      )}
                      {!hasExpenseLines && !hasIncomeLines && (
                        <span>{isFr ? 'Aucune sous-catégorie configurée' : 'No sub-categories yet'}</span>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {hasExpenseLines && catExpenseBudget > 0 && (
                    <span
                      className={`text-xs font-bold font-mono tabular-nums ${
                        isOver ? 'text-rose-400' : 'text-teal-400'
                      }`}
                    >
                      {percentUsed}%
                    </span>
                  )}

                  <button
                    onClick={() => handleOpenCatModal(cat)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                    title={isFr ? 'Modifier catégorie' : 'Edit category'}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          isFr ? `Supprimer la catégorie ${cat.name} ?` : `Delete category ${cat.name}?`
                        )
                      ) {
                        deleteCategory(cat.id);
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                    title={isFr ? 'Supprimer' : 'Delete'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Category Expense Progress Bar */}
              {hasExpenseLines && (
                <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isOver ? 'bg-rose-500' : 'bg-teal-500'
                    }`}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
              )}

              {/* Sub-Categories (Real Budget Lines) */}
              <div className="pt-3 border-t border-slate-800/60 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>
                    {isFr ? 'Sous-catégories & Lignes budgétaires' : 'Sub-categories & Budget lines'} (
                    {catBudgets.length})
                  </span>
                  <button
                    onClick={() => handleOpenBudgetModal(cat.id)}
                    className="text-teal-400 hover:text-teal-300 flex items-center gap-1 font-semibold transition whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Ajouter une sous-catégorie' : 'Add sub-category'}</span>
                  </button>
                </div>

                {catBudgets.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-1">
                    {isFr
                      ? 'Aucune sous-catégorie. Créez au moins une sous-catégorie pour y affecter des transactions ou des règles.'
                      : 'No sub-categories configured. Add at least one sub-category to assign transactions or rules.'}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800/60 rounded-xl bg-slate-950/50 border border-slate-800/80">
                    {catBudgets.map(b => {
                      const activeInSelectedMonth = isBudgetActiveInMonth(b, selectedYear, selectedMonth1);
                      const activeMonthsInYear = getBudgetActiveMonthsInYear(b, selectedYear);
                      const periodBudgeted = getLinePeriodBudget(b);
                      const windowLabel = formatBudgetWindowLabel(b, language);

                      const subActuals = computeSubCategoryActuals(b, catTx);
                      const actualForSubCat = subActuals.netActual;

                      const isActiveInPeriod =
                        viewMode === 'MONTH' ? activeInSelectedMonth : activeMonthsInYear > 0;
                      const subOver =
                        b.isExpense && isActiveInPeriod && periodBudgeted > 0 && actualForSubCat > periodBudgeted;

                      return (
                        <div
                          key={b.id}
                          onClick={() =>
                            drillDownToTransactions({
                              dateFrom: periodDateFrom,
                              dateTo: periodDateTo,
                              categoryId: cat.id,
                              budgetId: b.id
                            })
                          }
                          title={
                            viewMode === 'MONTH'
                              ? isFr
                                ? 'Voir les transactions de cette sous-catégorie pour ce mois'
                                : 'View transactions for this sub-category in selected month'
                              : isFr
                              ? `Voir les transactions de cette sous-catégorie en ${selectedYear}`
                              : `View transactions for this sub-category in ${selectedYear}`
                          }
                          className={`px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-slate-900/70 transition cursor-pointer group/sub ${
                            !b.isActive ? 'opacity-55' : ''
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-100 group-hover/sub:text-teal-300 transition">
                                {b.title}
                              </span>
                              <ArrowUpRight className="w-3 h-3 text-slate-600 group-hover/sub:text-teal-300 transition shrink-0" />
                              {!b.isActive && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                                  <PauseCircle className="w-3 h-3" />
                                  {isFr ? 'En pause' : 'Paused'}
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span>{formatBudgetScheduleLabel(b, language)}</span>
                              {windowLabel && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-500">{windowLabel}</span>
                                </>
                              )}
                              {viewMode === 'MONTH' &&
                                b.isActive &&
                                b.frequency === 'YEARLY' &&
                                b.month != null &&
                                b.month !== selectedMonth1 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-indigo-300">
                                      {isFr
                                        ? `0 ${currency} ce mois-ci (prévu en ${getMonthShortName(b.month, language)})`
                                        : `0 ${currency} this month (scheduled ${getMonthShortName(b.month, language)})`}
                                    </span>
                                  </>
                                )}
                              {viewMode === 'MONTH' && b.isActive && !activeInSelectedMonth && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-500">
                                    {isFr ? 'Hors période ce mois-ci' : 'Outside window this month'}
                                  </span>
                                </>
                              )}
                              {viewMode === 'YEAR' && b.isActive && activeMonthsInYear === 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-500">
                                    {isFr ? `Hors période en ${selectedYear}` : `Outside window in ${selectedYear}`}
                                  </span>
                                </>
                              )}
                              {viewMode === 'YEAR' &&
                                b.isActive &&
                                b.frequency === 'MONTHLY' &&
                                activeMonthsInYear > 0 &&
                                activeMonthsInYear < 12 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-indigo-300">
                                      {isFr
                                        ? `${activeMonthsInYear}/12 mois actifs`
                                        : `${activeMonthsInYear}/12 active months`}
                                    </span>
                                  </>
                                )}
                            </div>
                            {subActuals.offsetAmount > 0 && (
                              <div className="text-[11px] text-teal-300/90 font-mono tabular-nums">
                                {b.isExpense
                                  ? isFr
                                    ? `Dépenses ${subActuals.grossExpense.toLocaleString(undefined, { maximumFractionDigits: 2 })} − Crédits ${subActuals.grossIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`
                                    : `Spent ${subActuals.grossExpense.toLocaleString(undefined, { maximumFractionDigits: 2 })} − Credits ${subActuals.grossIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`
                                  : isFr
                                  ? `Reçus ${subActuals.grossIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })} − Débits ${subActuals.grossExpense.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`
                                  : `Income ${subActuals.grossIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })} − Debits ${subActuals.grossExpense.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 tabular-nums">
                            <div className="text-right">
                              <div className="font-mono font-bold text-slate-100">
                                <span
                                  className={
                                    subOver
                                      ? 'text-rose-400'
                                      : b.isExpense && actualForSubCat < 0
                                      ? 'text-emerald-400'
                                      : ''
                                  }
                                >
                                  {actualForSubCat.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-slate-500 font-normal"> / </span>
                                <span className={b.isExpense ? 'text-slate-100' : 'text-emerald-400'}>
                                  {periodBudgeted.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                                  {currency}
                                </span>
                              </div>
                              {viewMode === 'MONTH' && b.frequency === 'YEARLY' && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {isFr ? 'Annuel :' : 'Annual:'}{' '}
                                  {b.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
                                </span>
                              )}
                              {viewMode === 'YEAR' && b.frequency === 'MONTHLY' && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {isFr ? 'Mensuel :' : 'Monthly:'}{' '}
                                  {b.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  handleOpenBudgetModal(cat.id, b);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
                                title={isFr ? 'Modifier sous-catégorie' : 'Edit sub-category'}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  deleteBudget(b.id);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                                title={isFr ? 'Supprimer sous-catégorie' : 'Delete sub-category'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Wrapper Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                {editingCategory
                  ? isFr
                    ? 'Modifier la catégorie'
                    : 'Edit Category'
                  : isFr
                  ? 'Nouvelle catégorie'
                  : 'New Category'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isFr
                  ? 'Regroupement visuel (nom, icône et couleur) pour vos sous-catégories budgétaires'
                  : 'Visual wrapper (name, icon, and color) for your sub-category budget lines'}
              </p>
            </div>

            <form onSubmit={handleSaveCat} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {isFr ? 'Nom de la catégorie' : 'Category Name'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isFr ? 'Ex: Logement, Vacances, Véhicules...' : 'e.g. Housing, Vehicles, Health...'}
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Icône' : 'Icon'}
                  </label>
                  <select
                    value={catIcon}
                    onChange={e => setCatIcon(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="ShoppingCart">ShoppingCart (Courses)</option>
                    <option value="Home">Home (Logement)</option>
                    <option value="Coins">Coins (Revenus)</option>
                    <option value="Zap">Zap (Énergie)</option>
                    <option value="Car">Car (Transport)</option>
                    <option value="GraduationCap">GraduationCap (École)</option>
                    <option value="Utensils">Utensils (Sorties)</option>
                    <option value="HeartPulse">HeartPulse (Santé)</option>
                    <option value="PiggyBank">PiggyBank (Épargne)</option>
                    <option value="CreditCard">CreditCard (Banque)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Couleur' : 'Color'}
                  </label>
                  <input
                    type="color"
                    value={catColorHex}
                    onChange={e => setCatColorHex(e.target.value)}
                    className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 transition"
                >
                  {isFr ? 'Annuler' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-md transition"
                >
                  {isFr ? 'Enregistrer' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Category Budget Line Modal */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h2 className="text-lg font-bold text-white">
                {editingBudget
                  ? isFr
                    ? 'Modifier la sous-catégorie'
                    : 'Edit Sub-Category'
                  : isFr
                  ? 'Nouvelle sous-catégorie budgétaire'
                  : 'New Sub-Category Budget Line'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeCategories.find(c => c.id === targetCategoryId)?.name}
              </p>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              {/* Expense vs Income */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setBudgetIsExpense(true)}
                    className={`py-2 rounded-lg transition ${
                      budgetIsExpense
                        ? 'bg-rose-500 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isFr ? 'Dépense / Débit' : 'Spending / Expense'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBudgetIsExpense(false)}
                    className={`py-2 rounded-lg transition ${
                      !budgetIsExpense
                        ? 'bg-emerald-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isFr ? 'Revenu / Crédit' : 'Income / Salary'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  {isFr
                    ? 'Définit le sens de l’objectif budgétaire (les opérations de sens opposé, comme un remboursement ou un loyer perçu, viendront en déduction du net).'
                    : 'Sets the budget goal direction (opposite-flow transactions like reimbursements or rent offsets will reduce the net actual).'}
                </p>
              </div>

              {/* Title & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Nom de la sous-catégorie' : 'Sub-category Name'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      isFr
                        ? 'Ex: Supermarché, EDF, Taxe foncière, Vacances...'
                        : 'e.g. Groceries, Netflix, Property Tax, Vacations...'
                    }
                    value={budgetTitle}
                    onChange={e => setBudgetTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {budgetFreq === 'YEARLY'
                      ? isFr
                        ? `Montant annuel (${currency})`
                        : `Annual Amount (${currency})`
                      : isFr
                      ? `Montant mensuel (${currency})`
                      : `Monthly Amount (${currency})`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={budgetAmountStr}
                    onChange={e => setBudgetAmountStr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Recurrence: Monthly vs Yearly */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  {isFr ? 'Périodicité' : 'Recurrence'}
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setBudgetFreq('MONTHLY');
                      setBudgetMonth('');
                    }}
                    className={`py-2 rounded-lg transition ${
                      budgetFreq === 'MONTHLY'
                        ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isFr ? 'Mensuel' : 'Monthly'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBudgetFreq('YEARLY')}
                    className={`py-2 rounded-lg transition ${
                      budgetFreq === 'YEARLY'
                        ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isFr ? 'Annuel' : 'Yearly'}
                  </button>
                </div>
              </div>

              {/* Scheduling rules */}
              {budgetFreq === 'MONTHLY' ? (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                  <label className="block text-xs font-medium text-slate-300">
                    {isFr ? 'Répartition dans le mois' : 'Monthly Allocation'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setHasSpecificDay(false)}
                      className={`py-2 px-3 rounded-lg border transition text-center ${
                        !hasSpecificDay
                          ? 'bg-slate-800 border-teal-500/60 text-teal-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isFr ? 'Réparti sur le mois' : 'Spread in month'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasSpecificDay(true)}
                      className={`py-2 px-3 rounded-lg border transition text-center ${
                        hasSpecificDay
                          ? 'bg-slate-800 border-teal-500/60 text-teal-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isFr ? 'Jour précis du mois' : 'Specific day of month'}
                    </button>
                  </div>

                  {hasSpecificDay ? (
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {isFr ? 'Jour d’échéance (1 à 31)' : 'Day of month (1–31)'}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        required
                        value={budgetDay}
                        onChange={e => setBudgetDay(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))}
                        className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      {isFr
                        ? 'Idéal pour l’alimentation, le carburant ou les dépenses courantes réparties sur tout le mois.'
                        : 'Ideal for groceries, fuel, or discretionary spending spread evenly across the month.'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {isFr ? 'Mois d’affectation dans l’année' : 'Assigned Month of Year'}
                    </label>
                    <select
                      value={budgetMonth}
                      onChange={e => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : '';
                        setBudgetMonth(val);
                        if (val === '') setHasSpecificDay(false);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
                    >
                      <option value="">
                        {isFr
                          ? 'Réparti sur les 12 mois (montant ÷ 12 / mois)'
                          : 'Spread across entire year (amount ÷ 12 per month)'}
                      </option>
                      {Array.from({ length: 12 }, (_, idx) => idx + 1).map(m => (
                        <option key={m} value={m}>
                          {getMonthLongName(m, language)} ({isFr ? '100% ce mois-là' : 'Full amount in this month'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {budgetMonth !== '' ? (
                    <div className="space-y-2.5 pt-1">
                      <label className="block text-xs font-medium text-slate-300">
                        {isFr ? 'Échéance dans le mois sélectionné' : 'Timing Within Assigned Month'}
                      </label>
                      <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setHasSpecificDay(false)}
                          className={`py-2 px-3 rounded-lg border transition text-center ${
                            !hasSpecificDay
                              ? 'bg-slate-800 border-teal-500/60 text-teal-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {isFr ? 'Réparti sur ce mois' : 'Spread in month'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setHasSpecificDay(true)}
                          className={`py-2 px-3 rounded-lg border transition text-center ${
                            hasSpecificDay
                              ? 'bg-slate-800 border-teal-500/60 text-teal-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {isFr ? 'Jour précis' : 'Specific day'}
                        </button>
                      </div>

                      {hasSpecificDay ? (
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            {isFr ? 'Jour d’exécution (1 à 31)' : 'Execution day (1–31)'}
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            required
                            value={budgetDay}
                            onChange={e =>
                              setBudgetDay(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 1)))
                            }
                            className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                          />
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400">
                          {isFr
                            ? 'Ex: budget vacances réservé sur un mois précis, dépensé progressivement pendant ce mois.'
                            : 'Example: vacation budget allocated to a specific month and spent throughout that month.'}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      {isFr
                        ? 'Le montant annuel est lissé sur 12 mois dans la trésorerie et le budget mensuel.'
                        : 'The annual amount is amortized evenly (÷ 12) across monthly budgets and forecasts.'}
                    </p>
                  )}
                </div>
              )}

              {/* Optional Validity Window & Notes */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50">
                <button
                  type="button"
                  onClick={() => setShowWindowOptions(prev => !prev)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition"
                >
                  <span className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {isFr ? 'Période de validité & options (facultatif)' : 'Validity window & options (optional)'}
                  </span>
                  {showWindowOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showWindowOptions && (
                  <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-800/80 space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {isFr ? 'Mois de début' : 'Start Month'}
                        </label>
                        <select
                          value={startMonth}
                          onChange={e => setStartMonth(e.target.value ? parseInt(e.target.value, 10) : '')}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500"
                        >
                          <option value="">—</option>
                          {Array.from({ length: 12 }, (_, idx) => idx + 1).map(m => (
                            <option key={m} value={m}>
                              {getMonthLongName(m, language)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {isFr ? 'Année de début' : 'Start Year'}
                        </label>
                        <input
                          type="number"
                          min={2000}
                          max={2100}
                          placeholder={String(selectedYear)}
                          value={startYear}
                          onChange={e => setStartYear(e.target.value ? parseInt(e.target.value, 10) : '')}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {isFr ? 'Mois de fin' : 'End Month'}
                        </label>
                        <select
                          value={endMonth}
                          onChange={e => setEndMonth(e.target.value ? parseInt(e.target.value, 10) : '')}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500"
                        >
                          <option value="">—</option>
                          {Array.from({ length: 12 }, (_, idx) => idx + 1).map(m => (
                            <option key={m} value={m}>
                              {getMonthLongName(m, language)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          {isFr ? 'Année de fin' : 'End Year'}
                        </label>
                        <input
                          type="number"
                          min={2000}
                          max={2100}
                          placeholder="—"
                          value={endYear}
                          onChange={e => setEndYear(e.target.value ? parseInt(e.target.value, 10) : '')}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        {isFr ? 'Notes' : 'Notes'}
                      </label>
                      <input
                        type="text"
                        placeholder={isFr ? 'Précisions facultatives...' : 'Optional memo...'}
                        value={budgetNotes}
                        onChange={e => setBudgetNotes(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={budgetIsActive}
                        onChange={e => setBudgetIsActive(e.target.checked)}
                        className="w-4 h-4 rounded text-teal-500 bg-slate-900 border-slate-700"
                      />
                      <span>
                        {isFr ? 'Sous-catégorie active dans les calculs' : 'Active in budgets and forecasts'}
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBudgetModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 transition"
                >
                  {isFr ? 'Annuler' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-md transition"
                >
                  {isFr ? 'Enregistrer' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
