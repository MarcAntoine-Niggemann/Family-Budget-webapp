import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calendar,
  PauseCircle,
  ArrowUpRight
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryBudgetEntity, CategoryEntity } from '../types';
import {
  formatBudgetScheduleLabel,
  formatBudgetWindowLabel,
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
  const activeBudgets = budgets.filter(b => !b.isDeleted);

  // Selected Month & Year (defaults to current)
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0..11
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
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

  // Time bounds for selected month
  const startDate = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0).getTime();
  const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999).getTime();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const monthDateFrom = `${selectedYear}-${pad2(selectedMonth + 1)}-01`;
  const monthLastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthDateTo = `${selectedYear}-${pad2(selectedMonth + 1)}-${pad2(monthLastDay)}`;

  // Active transactions in selected month
  const monthTx = transactions.filter(
    tx => !tx.isDeleted && !tx.isExcluded && !tx.isSplitParent && tx.date >= startDate && tx.date <= endDate
  );

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

  // Totals for selected month using shared budget engine
  const totalExpenseBudget = activeBudgets
    .filter(b => b.isExpense)
    .reduce((sum, b) => sum + getBudgetMonthlyAmount(b, selectedYear, selectedMonth1), 0);

  const totalActualExpenses = monthTx
    .filter(tx => tx.isExpense && !tx.isInternalTransfer && tx.transferType !== 'CARD_SETTLEMENT')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const totalIncomeBudget = activeBudgets
    .filter(b => !b.isExpense)
    .reduce((sum, b) => sum + getBudgetMonthlyAmount(b, selectedYear, selectedMonth1), 0);

  const totalActualIncome = monthTx
    .filter(tx => !tx.isExpense && !tx.isInternalTransfer)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Month Navigation & Action Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {isFr ? 'Planificateur de Budget' : 'Budget Planner'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isFr
              ? 'Catégories (groupes visuels) et sous-catégories budgétaires (mensuelles, annuelles, réparties ou datées)'
              : 'Category wrappers and sub-category budget lines (monthly, yearly, spread, or scheduled)'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Month Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => {
                if (selectedMonth === 0) {
                  setSelectedMonth(11);
                  setSelectedYear(y => y - 1);
                } else {
                  setSelectedMonth(m => m - 1);
                }
              }}
              className="px-2.5 py-1 text-slate-400 hover:text-slate-200 transition rounded-lg hover:bg-slate-800"
              aria-label={isFr ? 'Mois précédent' : 'Previous month'}
            >
              ←
            </button>
            <span className="px-3 font-semibold text-slate-200 capitalize whitespace-nowrap">{monthLabel}</span>
            <button
              onClick={() => {
                if (selectedMonth === 11) {
                  setSelectedMonth(0);
                  setSelectedYear(y => y + 1);
                } else {
                  setSelectedMonth(m => m + 1);
                }
              }}
              className="px-2.5 py-1 text-slate-400 hover:text-slate-200 transition rounded-lg hover:bg-slate-800"
              aria-label={isFr ? 'Mois suivant' : 'Next month'}
            >
              →
            </button>
          </div>

          <button
            onClick={() => handleOpenCatModal()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition active:scale-95 whitespace-nowrap shrink-0"
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
            {isFr ? 'Dépenses du mois (Réalisé / Prévu)' : 'Monthly Expenses (Actual / Budget)'}
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
            {isFr ? 'Revenus du mois (Reçus / Attendus)' : 'Monthly Income (Received / Target)'}
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
            {isFr ? 'Solde Budgétaire Prévu' : 'Projected Monthly Net'}
          </span>
          <div className="mt-2 flex items-baseline gap-2 tabular-nums">
            <span
              className={`text-2xl font-bold font-mono ${
                totalIncomeBudget - totalExpenseBudget >= 0 ? 'text-indigo-400' : 'text-rose-400'
              }`}
            >
              {(totalIncomeBudget - totalExpenseBudget).toLocaleString(undefined, {
                maximumFractionDigits: 2
              })}
            </span>
            <span className="text-xs text-slate-400">{currency}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {isFr ? 'Revenus prévus moins dépenses prévues' : 'Planned income minus planned expenses'}
          </div>
        </div>
      </div>

      {/* Category Wrappers & Sub-Category Budget Lines */}
      <div className="space-y-4">
        {activeCategories.map(cat => {
          const catBudgets = activeBudgets.filter(b => b.categoryId === cat.id);

          const catExpenses = monthTx
            .filter(
              tx =>
                tx.categoryId === cat.id &&
                tx.isExpense &&
                !tx.isInternalTransfer &&
                tx.transferType !== 'CARD_SETTLEMENT'
            )
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          const catIncomeActual = monthTx
            .filter(tx => tx.categoryId === cat.id && !tx.isExpense && !tx.isInternalTransfer)
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          const catExpenseBudget = catBudgets
            .filter(b => b.isExpense)
            .reduce((sum, b) => sum + getBudgetMonthlyAmount(b, selectedYear, selectedMonth1), 0);

          const catIncomeBudget = catBudgets
            .filter(b => !b.isExpense)
            .reduce((sum, b) => sum + getBudgetMonthlyAmount(b, selectedYear, selectedMonth1), 0);

          const hasExpenseLines = catBudgets.some(b => b.isExpense) || catExpenses > 0;
          const hasIncomeLines = catBudgets.some(b => !b.isExpense) || catIncomeActual > 0;

          const percentUsed =
            catExpenseBudget > 0 ? Math.min(100, Math.round((catExpenses / catExpenseBudget) * 100)) : 0;
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
                      dateFrom: monthDateFrom,
                      dateTo: monthDateTo,
                      categoryId: cat.id,
                      budgetId: 'ALL'
                    })
                  }
                  title={
                    isFr
                      ? 'Voir les transactions de cette catégorie pour ce mois'
                      : 'View transactions for this category in selected month'
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
                      const monthlyBudgeted = getBudgetMonthlyAmount(b, selectedYear, selectedMonth1);
                      const windowLabel = formatBudgetWindowLabel(b, language);

                      const actualForSubCat = monthTx
                        .filter(
                          tx =>
                            tx.budgetId === b.id &&
                            tx.isExpense === b.isExpense &&
                            !tx.isInternalTransfer &&
                            tx.transferType !== 'CARD_SETTLEMENT'
                        )
                        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

                      const subOver =
                        b.isExpense && activeInSelectedMonth && monthlyBudgeted > 0 && actualForSubCat > monthlyBudgeted;

                      return (
                        <div
                          key={b.id}
                          onClick={() =>
                            drillDownToTransactions({
                              dateFrom: monthDateFrom,
                              dateTo: monthDateTo,
                              categoryId: cat.id,
                              budgetId: b.id
                            })
                          }
                          title={
                            isFr
                              ? 'Voir les transactions de cette sous-catégorie pour ce mois'
                              : 'View transactions for this sub-category in selected month'
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
                              {b.isActive &&
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
                              {b.isActive && !activeInSelectedMonth && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-500">
                                    {isFr ? 'Hors période ce mois-ci' : 'Outside window this month'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 tabular-nums">
                            <div className="text-right">
                              <div className="font-mono font-bold text-slate-100">
                                <span className={subOver ? 'text-rose-400' : ''}>
                                  {actualForSubCat.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-slate-500 font-normal"> / </span>
                                <span className={b.isExpense ? 'text-slate-100' : 'text-emerald-400'}>
                                  {monthlyBudgeted.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                                  {currency}
                                </span>
                              </div>
                              {b.frequency === 'YEARLY' && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {isFr ? 'Annuel :' : 'Annual:'}{' '}
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
