import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, AlertCircle, Equal, RotateCcw, Check } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { TransactionEntity } from '../types';

interface SplitTransactionModalProps {
  transaction: TransactionEntity | null;
  isOpen: boolean;
  onClose: () => void;
}

interface SplitDraft {
  id?: number;
  categoryId: number;
  categoryName: string;
  budgetId: number;
  budgetTitle: string;
  amount: number;
  notes: string;
}

export const SplitTransactionModal: React.FC<SplitTransactionModalProps> = ({
  transaction,
  isOpen,
  onClose
}) => {
  const {
    transactions,
    categories,
    budgets,
    splitTransaction,
    unsplitTransaction,
    navigateTo,
    language,
    currency
  } = useBudget();
  const isFr = language === 'fr';

  const activeCategories = useMemo(() => categories.filter(c => !c.isDeleted), [categories]);
  const activeBudgets = useMemo(() => budgets.filter(b => !b.isDeleted && b.isActive), [budgets]);

  const existingChildren = useMemo(() => {
    if (!transaction) return [];
    return transactions
      .filter(t => !t.isDeleted && t.parentId === transaction.id)
      .sort((a, b) => a.id - b.id);
  }, [transactions, transaction]);

  const isEditingExistingSplit = Boolean(
    transaction && (transaction.isSplitParent || existingChildren.length > 0)
  );

  const [splits, setSplits] = useState<SplitDraft[]>([]);
  const [confirmUnsplit, setConfirmUnsplit] = useState(false);

  useEffect(() => {
    if (!isOpen || !transaction) return;
    setConfirmUnsplit(false);

    if (existingChildren.length >= 2) {
      setSplits(
        existingChildren.map(child => ({
          id: child.id,
          categoryId: child.categoryId || 0,
          categoryName: child.categoryName || '',
          budgetId: child.budgetId || 0,
          budgetTitle: child.budgetTitle || '',
          amount: Math.round(Math.abs(child.amount) * 100) / 100,
          notes: child.notes || ''
        }))
      );
      return;
    }

    const totalAbsAmount = Math.abs(transaction.amount);
    const matchingFlowBudgets = activeBudgets.filter(b => b.isExpense === transaction.isExpense);

    const firstCat =
      activeCategories.find(c => c.id === transaction.categoryId) ||
      activeCategories.find(c => matchingFlowBudgets.some(b => b.categoryId === c.id)) ||
      activeCategories.find(c => activeBudgets.some(b => b.categoryId === c.id)) ||
      activeCategories[0];
    const firstBudget =
      activeBudgets.find(b => b.id === transaction.budgetId) ||
      matchingFlowBudgets.find(b => b.categoryId === (firstCat?.id || 0)) ||
      activeBudgets.find(b => b.categoryId === (firstCat?.id || 0));

    const secondCat =
      activeCategories.find(c => c.id !== firstCat?.id && activeBudgets.some(b => b.categoryId === c.id)) ||
      firstCat;
    const secondBudget =
      matchingFlowBudgets.find(b => b.categoryId === (secondCat?.id || 0)) ||
      activeBudgets.find(b => b.categoryId === (secondCat?.id || 0));

    const totalCents = Math.round(totalAbsAmount * 100);
    const halfCents = Math.floor(totalCents / 2);
    const restCents = totalCents - halfCents;

    setSplits([
      {
        categoryId: firstCat?.id || 0,
        categoryName: firstCat?.name || '',
        budgetId: firstBudget?.id || 0,
        budgetTitle: firstBudget?.title || '',
        amount: halfCents / 100,
        notes: ''
      },
      {
        categoryId: secondCat?.id || 0,
        categoryName: secondCat?.name || '',
        budgetId: secondBudget?.id || 0,
        budgetTitle: secondBudget?.title || '',
        amount: restCents / 100,
        notes: ''
      }
    ]);
  }, [isOpen, transaction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !transaction) return null;

  const totalAbsAmount = Math.abs(transaction.amount);
  const currentSplitsSum = splits.reduce((sum, s) => sum + (Number.isFinite(s.amount) ? s.amount : 0), 0);
  const remaining = Math.round((totalAbsAmount - currentSplitsSum) * 100) / 100;
  const isBalanced = Math.abs(remaining) < 0.01;
  const allCategorized = splits.every(s => s.categoryId > 0 && s.budgetId > 0);
  const isValid = isBalanced && splits.length >= 2 && splits.every(s => s.amount > 0) && allCategorized;

  const handleDivideEqually = () => {
    if (splits.length < 2) return;
    const totalCents = Math.round(totalAbsAmount * 100);
    const count = splits.length;
    const baseCents = Math.floor(totalCents / count);
    const extraCents = totalCents - baseCents * count;

    setSplits(prev =>
      prev.map((s, idx) => ({
        ...s,
        amount: (baseCents + (idx < extraCents ? 1 : 0)) / 100
      }))
    );
  };

  const handleApplyRemainingToRow = (idx: number) => {
    setSplits(prev =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const targetAmount = Math.max(0.01, Math.round(((s.amount || 0) + remaining) * 100) / 100);
        return { ...s, amount: targetAmount };
      })
    );
  };

  const handleAddSplit = () => {
    const defaultCat =
      activeCategories.find(c =>
        activeBudgets.some(b => b.categoryId === c.id && b.isExpense === transaction.isExpense)
      ) ||
      activeCategories.find(c => activeBudgets.some(b => b.categoryId === c.id)) ||
      activeCategories[0];
    const defaultBudget =
      activeBudgets.find(b => b.categoryId === (defaultCat?.id || 0) && b.isExpense === transaction.isExpense) ||
      activeBudgets.find(b => b.categoryId === (defaultCat?.id || 0));

    setSplits(prev => [
      ...prev,
      {
        categoryId: defaultCat?.id || 0,
        categoryName: defaultCat?.name || '',
        budgetId: defaultBudget?.id || 0,
        budgetTitle: defaultBudget?.title || '',
        amount: remaining > 0 ? remaining : 0,
        notes: ''
      }
    ]);
  };

  const handleRemoveSplit = (idx: number) => {
    if (splits.length <= 2) return;
    setSplits(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUnsplit = () => {
    if (!confirmUnsplit) {
      setConfirmUnsplit(true);
      return;
    }
    unsplitTransaction(transaction.id);
    onClose();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    splitTransaction(transaction.id, splits);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/75 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {isEditingExistingSplit
                ? isFr
                  ? 'Modifier la ventilation (Split)'
                  : 'Edit Split Transaction'
                : isFr
                ? 'Ventilation de la transaction (Split)'
                : 'Split Transaction'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap tabular-nums">
              <span className="truncate max-w-xs text-slate-700 dark:text-slate-200 font-medium">{transaction.title}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-teal-700 dark:text-teal-300 font-semibold">
                {totalAbsAmount.toFixed(2)} {currency}
              </span>
              <span aria-hidden="true">·</span>
              <span>{transaction.accountName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isFr ? 'Fermer' : 'Close'}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Allocation Summary + Equal Split Action */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 text-xs font-medium tabular-nums">
            {isValid ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-slate-600 dark:text-slate-400">{isFr ? 'Ventilé :' : 'Allocated:'}</span>
              <strong className={`font-mono ${isBalanced ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {currentSplitsSum.toFixed(2)} / {totalAbsAmount.toFixed(2)} {currency}
              </strong>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-600">·</span>
              <span className={`font-mono ${isBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {isBalanced
                  ? isFr
                    ? 'Équilibré (100%)'
                    : 'Balanced (100%)'
                  : `${isFr ? 'Reste :' : 'Remaining:'} ${remaining > 0 ? '+' : ''}${remaining.toFixed(2)} ${currency}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDivideEqually}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-teal-700 dark:text-teal-300 transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Equal className="w-3.5 h-3.5" />
            <span>{isFr ? 'Répartir à parts égales' : 'Divide Equally'}</span>
          </button>
        </div>

        {!allCategorized && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
            <span>
              {isFr
                ? 'Chaque ligne doit pointer vers une catégorie et une sous-catégorie existante.'
                : 'Every split line must point to an existing category and sub-category.'}
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigateTo('BUDGET_PLANNER');
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold whitespace-nowrap shrink-0 transition"
            >
              {isFr ? 'Planificateur' : 'Budget Planner'}
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div className="space-y-3">
            {splits.map((split, idx) => {
              const catBudgets = activeBudgets
                .filter(b => b.categoryId === split.categoryId)
                .sort((a, b) => Number(b.isExpense === transaction.isExpense) - Number(a.isExpense === transaction.isExpense));

              const canApplyRemaining = !isBalanced && (split.amount || 0) + remaining >= 0.01;

              return (
                <div
                  key={split.id ?? `new-${idx}`}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                      {isFr ? `Sous-opération #${idx + 1}` : `Split Item #${idx + 1}`}
                    </span>

                    <div className="flex items-center gap-2">
                      {canApplyRemaining && (
                        <button
                          type="button"
                          onClick={() => handleApplyRemainingToRow(idx)}
                          className="px-2.5 py-1 rounded-md bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/15 dark:hover:bg-teal-500/25 border border-teal-200 dark:border-teal-500/30 text-[11px] font-semibold font-mono tabular-nums text-teal-700 dark:text-teal-300 transition whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {isFr ? 'Appliquer reste' : 'Apply remaining'} ({remaining > 0 ? '+' : ''}
                          {remaining.toFixed(2)})
                        </button>
                      )}

                      {splits.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSplit(idx)}
                          aria-label={isFr ? 'Supprimer la ligne' : 'Remove split line'}
                          className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {isFr ? 'Montant' : 'Amount'} ({currency})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={split.amount || ''}
                        onChange={e => {
                          const parsed = parseFloat(e.target.value);
                          const val = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
                          setSplits(prev => prev.map((s, i) => (i === idx ? { ...s, amount: val } : s)));
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {isFr ? 'Catégorie' : 'Category'}
                      </label>
                      <select
                        value={split.categoryId}
                        onChange={e => {
                          const catId = parseInt(e.target.value, 10);
                          const cat = activeCategories.find(c => c.id === catId);
                          const firstBudget =
                            activeBudgets.find(b => b.categoryId === catId && b.isExpense === transaction.isExpense) ||
                            activeBudgets.find(b => b.categoryId === catId);
                          setSplits(prev =>
                            prev.map((s, i) =>
                              i === idx
                                ? {
                                    ...s,
                                    categoryId: catId,
                                    categoryName: cat?.name || '',
                                    budgetId: firstBudget?.id || 0,
                                    budgetTitle: firstBudget?.title || ''
                                  }
                                : s
                            )
                          );
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                      >
                        <option value={0}>
                          {isFr ? 'Choisir...' : 'Select...'}
                        </option>
                        {activeCategories.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {isFr ? 'Sous-catégorie' : 'Sub-category'}
                      </label>
                      <select
                        value={split.budgetId}
                        disabled={catBudgets.length === 0}
                        onChange={e => {
                          const bId = parseInt(e.target.value, 10);
                          const b = catBudgets.find(bg => bg.id === bId);
                          setSplits(prev =>
                            prev.map((s, i) =>
                              i === idx ? { ...s, budgetId: bId, budgetTitle: b?.title || '' } : s
                            )
                          );
                        }}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                      >
                        {catBudgets.length === 0 ? (
                          <option value={0}>
                            {isFr ? 'Aucune sous-catégorie' : 'No sub-categories'}
                          </option>
                        ) : (
                          catBudgets.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.title}
                              {b.isExpense !== transaction.isExpense
                                ? ` (${b.isExpense ? (isFr ? 'Dépense' : 'Spending') : isFr ? 'Revenu' : 'Income'})`
                                : ''}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  <div>
                    <input
                      type="text"
                      placeholder={isFr ? 'Note spécifique pour cette sous-opération...' : 'Note for this split item...'}
                      value={split.notes}
                      onChange={e => {
                        const val = e.target.value;
                        setSplits(prev => prev.map((s, i) => (i === idx ? { ...s, notes: val } : s)));
                      }}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-300 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAddSplit}
            className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500/60 text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>
              {isFr ? 'Ajouter une ligne de ventilation' : 'Add another split item'}
              {remaining > 0 ? ` (+${remaining.toFixed(2)} ${currency})` : ''}
            </span>
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div>
              {isEditingExistingSplit && (
                <button
                  type="button"
                  onClick={handleUnsplit}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition whitespace-nowrap shrink-0 cursor-pointer ${
                    confirmUnsplit
                      ? 'bg-rose-50 dark:bg-rose-500/20 border-rose-300 dark:border-rose-500/50 text-rose-700 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-500/30'
                      : 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 hover:border-rose-400 dark:hover:border-rose-500/40'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {confirmUnsplit
                      ? isFr
                        ? 'Confirmer l’annulation du split'
                        : 'Confirm un-split'
                      : isFr
                      ? 'Annuler la ventilation'
                      : 'Un-split transaction'}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap shrink-0"
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={!isValid}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 disabled:opacity-40 disabled:pointer-events-none text-white dark:text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isEditingExistingSplit
                  ? isFr
                    ? 'Enregistrer la ventilation'
                    : 'Save Split Changes'
                  : isFr
                  ? 'Confirmer la ventilation'
                  : 'Confirm Split'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
