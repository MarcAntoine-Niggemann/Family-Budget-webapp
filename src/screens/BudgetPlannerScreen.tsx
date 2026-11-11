import React, { useState } from 'react';
import {
  CalendarDays,
  Plus,
  Edit2,
  Trash2,
  TrendingDown,
  TrendingUp,
  Tag,
  Clock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryBudgetEntity, CategoryEntity } from '../types';

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
    deleteBudget
  } = useBudget();

  const isFr = language === 'fr';

  // Selected Month & Year (defaults to current)
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth()); // 0..11
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Modal states
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryEntity | null>(null);

  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<CategoryBudgetEntity | null>(null);
  const [targetCategoryForNewBudget, setTargetCategoryForNewBudget] = useState<number>(categories[0]?.id || 1);

  // Form states for category
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('ShoppingCart');
  const [catColorHex, setCatColorHex] = useState('#3b82f6');

  // Form states for budget line
  const [budgetTitle, setBudgetTitle] = useState('');
  const [budgetAmountStr, setBudgetAmountStr] = useState('');
  const [budgetDay, setBudgetDay] = useState<number | ''>('');
  const [budgetFreq, setBudgetFreq] = useState<'MONTHLY' | 'YEARLY' | 'ONCE'>('MONTHLY');
  const [budgetIsExpense, setBudgetIsExpense] = useState(true);

  // Time bounds
  const startDate = new Date(selectedYear, selectedMonth, 1, 0, 0, 0).getTime();
  const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59).getTime();

  // Transactions in selected month
  const monthTx = transactions.filter(
    tx => !tx.isDeleted && !tx.isExcluded && !tx.isSplitParent && tx.date >= startDate && tx.date <= endDate
  );

  // Open Category modal
  const handleOpenCatModal = (cat?: CategoryEntity) => {
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatIcon(cat.icon);
      setCatColorHex(`#${cat.color.toString(16).slice(-6)}`);
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

  // Open Budget Line modal
  const handleOpenBudgetModal = (categoryId: number, b?: CategoryBudgetEntity) => {
    setTargetCategoryForNewBudget(categoryId);
    if (b) {
      setEditingBudget(b);
      setBudgetTitle(b.title);
      setBudgetAmountStr(b.amount.toString());
      setBudgetDay(b.day != null ? b.day : '');
      setBudgetFreq(b.frequency);
      setBudgetIsExpense(b.isExpense);
    } else {
      setEditingBudget(null);
      setBudgetTitle('');
      setBudgetAmountStr('');
      setBudgetDay('');
      setBudgetFreq('MONTHLY');
      setBudgetIsExpense(true);
    }
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(budgetAmountStr.replace(',', '.'));
    if (isNaN(val) || val <= 0) return;

    const cat = categories.find(c => c.id === targetCategoryForNewBudget);
    const dayVal = typeof budgetDay === 'number' && budgetDay >= 1 && budgetDay <= 31 ? budgetDay : null;

    if (editingBudget) {
      updateBudget({
        ...editingBudget,
        categoryId: targetCategoryForNewBudget,
        categoryName: cat?.name || editingBudget.categoryName,
        title: budgetTitle.trim() || 'Budget Line',
        amount: val,
        frequency: budgetFreq,
        day: dayVal,
        isExpense: budgetIsExpense
      });
    } else {
      addBudget({
        categoryId: targetCategoryForNewBudget,
        categoryName: cat?.name || 'General',
        title: budgetTitle.trim() || 'Budget Line',
        amount: val,
        frequency: budgetFreq,
        day: dayVal,
        isExpense: budgetIsExpense,
        isActive: true
      });
    }
    setIsBudgetModalOpen(false);
  };

  // Month navigation names
  const monthDate = new Date(selectedYear, selectedMonth, 1);
  const monthLabel = monthDate.toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
    month: 'long',
    year: 'numeric'
  });

  // Calculate totals
  const totalExpenseBudget = budgets
    .filter(b => b.isExpense && b.isActive)
    .reduce((sum, b) => {
      if (b.frequency === 'MONTHLY') return sum + b.amount;
      if (b.frequency === 'YEARLY') return sum + b.amount / 12;
      return sum + b.amount;
    }, 0);

  const totalActualExpenses = monthTx
    .filter(tx => tx.isExpense && !tx.isInternalTransfer && tx.transferType !== 'CARD_SETTLEMENT')
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const totalIncomeBudget = budgets
    .filter(b => !b.isExpense && b.isActive)
    .reduce((sum, b) => {
      if (b.frequency === 'MONTHLY') return sum + b.amount;
      if (b.frequency === 'YEARLY') return sum + b.amount / 12;
      return sum + b.amount;
    }, 0);

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
          <p className="text-xs text-slate-400 mt-0.5 capitalize">{monthLabel}</p>
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
            >
              ←
            </button>
            <span className="px-3 font-semibold text-slate-200 capitalize">{monthLabel}</span>
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
            >
              →
            </button>
          </div>

          <button
            onClick={() => handleOpenCatModal()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{isFr ? 'Nouvelle Catégorie' : 'New Category'}</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Expenses Budget vs Actual */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {isFr ? 'Dépenses Prévues / Réalisées' : 'Expenses Budget vs Actual'}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">
              {totalActualExpenses.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">
              / {totalExpenseBudget.toLocaleString()} {currency}
            </span>
          </div>
          <div className="mt-2 text-xs font-medium flex items-center justify-between">
            <span className="text-slate-400">{isFr ? 'Reste à dépenser :' : 'Remaining:'}</span>
            <span
              className={
                totalExpenseBudget - totalActualExpenses >= 0 ? 'text-teal-400' : 'text-rose-400'
              }
            >
              {(totalExpenseBudget - totalActualExpenses).toLocaleString()} {currency}
            </span>
          </div>
        </div>

        {/* Income Targets vs Actual */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {isFr ? 'Revenus Estimés / Reçus' : 'Income Targets vs Received'}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">
              {totalActualIncome.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">
              / {totalIncomeBudget.toLocaleString()} {currency}
            </span>
          </div>
          <div className="mt-2 text-xs font-medium flex items-center justify-between">
            <span className="text-slate-400">{isFr ? 'Atteinte des revenus :' : 'Target completion:'}</span>
            <span className="text-emerald-400">
              {totalIncomeBudget > 0
                ? `${Math.round((totalActualIncome / totalIncomeBudget) * 100)}%`
                : '100%'}
            </span>
          </div>
        </div>

        {/* Projected Monthly Savings */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            {isFr ? 'Capacité d’Épargne Estimée' : 'Projected Net Savings'}
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-400">
              {(totalIncomeBudget - totalExpenseBudget).toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">{currency}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {isFr ? 'Épargne théorique de fin de mois' : 'Theoretical end of month surplus'}
          </div>
        </div>
      </div>

      {/* Category Envelopes Breakdown */}
      <div className="space-y-4">
        {categories.map(cat => {
          const catBudgets = budgets.filter(b => b.categoryId === cat.id);
          const catExpenses = monthTx
            .filter(tx => tx.categoryId === cat.id && tx.isExpense && !tx.isInternalTransfer)
            .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          const catExpenseBudget = catBudgets
            .filter(b => b.isExpense)
            .reduce((sum, b) => {
              if (b.frequency === 'MONTHLY') return sum + b.amount;
              if (b.frequency === 'YEARLY') return sum + b.amount / 12;
              return sum + b.amount;
            }, 0);

          const percentUsed =
            catExpenseBudget > 0 ? Math.min(100, Math.round((catExpenses / catExpenseBudget) * 100)) : 0;
          const isOver = catExpenses > catExpenseBudget && catExpenseBudget > 0;

          return (
            <div
              key={cat.id}
              className="rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-lg space-y-4"
            >
              {/* Category Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
                    style={{ backgroundColor: `#${cat.color.toString(16).slice(-6)}` }}
                  >
                    <CategoryIcon name={cat.icon || cat.name} className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">{cat.name}</h3>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {isFr ? 'Dépensé :' : 'Spent:'}{' '}
                      <strong className="text-slate-200">
                        {catExpenses.toLocaleString()} {currency}
                      </strong>{' '}
                      /{' '}
                      <span className="text-slate-400">
                        {catExpenseBudget.toLocaleString()} {currency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      isOver
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-teal-500/10 text-teal-300 border border-teal-500/20'
                    }`}
                  >
                    {percentUsed}%
                  </span>

                  <button
                    onClick={() => handleOpenCatModal(cat)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                    title={isFr ? 'Modifier catégorie' : 'Edit category'}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(isFr ? `Supprimer la catégorie ${cat.name} ?` : `Delete category ${cat.name}?`)) {
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

              {/* Progress Bar */}
              <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOver ? 'bg-rose-500' : 'bg-teal-500'
                  }`}
                  style={{ width: `${percentUsed}%` }}
                />
              </div>

              {/* Sub-Budget Lines */}
              <div className="pt-2 border-t border-slate-800/60 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>{isFr ? 'Postes & Échéances programmées' : 'Budget lines & Scheduled bills'}</span>
                  <button
                    onClick={() => handleOpenBudgetModal(cat.id)}
                    className="text-teal-400 hover:text-teal-300 flex items-center gap-1 font-semibold transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isFr ? 'Ajouter une ligne' : 'Add line'}</span>
                  </button>
                </div>

                {catBudgets.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-1">
                    {isFr
                      ? 'Aucune ligne de budget spécifique. Cliquez sur "Ajouter une ligne".'
                      : 'No specific budget lines configured.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {catBudgets.map(b => (
                      <div
                        key={b.id}
                        className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs group hover:border-slate-700 transition"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-200 truncate">{b.title}</span>
                            {b.day != null && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                                {isFr ? `Jour ${b.day}` : `Day ${b.day}`}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 mt-0.5 block">
                            {b.isExpense ? (isFr ? 'Dépense' : 'Expense') : isFr ? 'Revenu' : 'Income'} •{' '}
                            {b.frequency}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-slate-100">
                            {b.amount.toLocaleString()} {currency}
                          </span>
                          <button
                            onClick={() => handleOpenBudgetModal(cat.id, b)}
                            className="p-1 rounded text-slate-500 hover:text-slate-300 transition opacity-0 group-hover:opacity-100"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteBudget(b.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 transition opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">
              {editingCategory
                ? isFr
                  ? 'Modifier la catégorie'
                  : 'Edit Category'
                : isFr
                ? 'Nouvelle catégorie'
                : 'New Category'}
            </h2>

            <form onSubmit={handleSaveCat} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {isFr ? 'Nom de la catégorie' : 'Category Name'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Éducation, Loisirs..."
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Icône' : 'Icon Key'}
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

      {/* Budget Line Modal */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">
              {editingBudget
                ? isFr
                  ? 'Modifier la ligne de budget'
                  : 'Edit Budget Line'
                : isFr
                ? 'Nouvelle ligne de budget'
                : 'New Budget Line'}
            </h2>

            <form onSubmit={handleSaveBudget} className="space-y-4">
              {/* Expense vs Income */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setBudgetIsExpense(true)}
                  className={`py-1.5 rounded-lg transition ${
                    budgetIsExpense
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isFr ? 'Dépense / Débit' : 'Expense'}
                </button>
                <button
                  type="button"
                  onClick={() => setBudgetIsExpense(false)}
                  className={`py-1.5 rounded-lg transition ${
                    !budgetIsExpense
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isFr ? 'Revenu / Salaire' : 'Income'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {isFr ? 'Titre de la ligne' : 'Title'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: EDF, Assurance auto, Loyer..."
                  value={budgetTitle}
                  onChange={e => setBudgetTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Montant' : 'Amount'} ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={budgetAmountStr}
                    onChange={e => setBudgetAmountStr(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm font-bold text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Jour de prélèvement (1..31)' : 'Day of month (1..31)'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Ex: 5"
                    value={budgetDay}
                    onChange={e =>
                      setBudgetDay(e.target.value ? parseInt(e.target.value, 10) : '')
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
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
