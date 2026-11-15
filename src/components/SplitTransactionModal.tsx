import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { TransactionEntity } from '../types';

interface SplitTransactionModalProps {
  transaction: TransactionEntity | null;
  isOpen: boolean;
  onClose: () => void;
}

interface SplitDraft {
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
  const { categories, budgets, splitTransaction, navigateTo, language, currency } = useBudget();
  const isFr = language === 'fr';

  const activeCategories = useMemo(() => categories.filter(c => !c.isDeleted), [categories]);
  const activeBudgets = useMemo(() => budgets.filter(b => !b.isDeleted && b.isActive), [budgets]);

  const [splits, setSplits] = useState<SplitDraft[]>([]);

  useEffect(() => {
    if (!isOpen || !transaction) return;
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

    const half = Math.round((totalAbsAmount / 2) * 100) / 100;
    const rest = Math.round((totalAbsAmount - half) * 100) / 100;

    setSplits([
      {
        categoryId: firstCat?.id || 0,
        categoryName: firstCat?.name || '',
        budgetId: firstBudget?.id || 0,
        budgetTitle: firstBudget?.title || '',
        amount: half,
        notes: ''
      },
      {
        categoryId: secondCat?.id || 0,
        categoryName: secondCat?.name || '',
        budgetId: secondBudget?.id || 0,
        budgetTitle: secondBudget?.title || '',
        amount: rest,
        notes: ''
      }
    ]);
  }, [isOpen, transaction]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !transaction) return null;

  const totalAbsAmount = Math.abs(transaction.amount);
  const currentSplitsSum = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
  const remaining = Math.round((totalAbsAmount - currentSplitsSum) * 100) / 100;
  const allCategorized = splits.every(s => s.categoryId > 0 && s.budgetId > 0);
  const isValid = Math.abs(remaining) < 0.01 && splits.every(s => s.amount > 0) && allCategorized;

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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    splitTransaction(transaction.id, splits);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isFr ? 'Ventilation de la dépense (Split)' : 'Split Transaction'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {transaction.title} · {totalAbsAmount.toFixed(2)} {currency}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sum Indicator */}
        <div
          className={`mt-4 p-3 rounded-xl border flex items-center justify-between text-xs font-medium tabular-nums ${
            isValid
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {isFr ? 'Total ventilé :' : 'Allocated:'}{' '}
              <strong className="font-mono">
                {currentSplitsSum.toFixed(2)} / {totalAbsAmount.toFixed(2)} {currency}
              </strong>
            </span>
          </div>
          <span className="font-mono">
            {Math.abs(remaining) < 0.01
              ? isFr
                ? 'Équilibré (100%)'
                : 'Balanced (100%)'
              : `${isFr ? 'Reste :' : 'Remaining:'} ${remaining.toFixed(2)} ${currency}`}
          </span>
        </div>

        {!allCategorized && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
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
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold whitespace-nowrap shrink-0 transition"
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

              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5 relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-400">
                      {isFr ? `Ligne ${idx + 1}` : `Split #${idx + 1}`}
                    </span>
                    {splits.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSplit(idx)}
                        className="text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        {isFr ? 'Montant' : 'Amount'} ({currency})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={split.amount || ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          setSplits(prev => prev.map((s, i) => (i === idx ? { ...s, amount: val } : s)));
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-bold font-mono text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
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
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                      >
                        {activeCategories.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
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
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 disabled:opacity-50"
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
                      placeholder={isFr ? 'Note spécifique pour ce poste...' : 'Note for this split...'}
                      value={split.notes}
                      onChange={e => {
                        const val = e.target.value;
                        setSplits(prev => prev.map((s, i) => (i === idx ? { ...s, notes: val } : s)));
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-xs text-slate-300 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAddSplit}
            className="w-full py-2 rounded-xl border border-dashed border-slate-700 hover:border-teal-500/60 text-slate-400 hover:text-teal-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            {isFr ? 'Ajouter une ligne de ventilation' : 'Add another split item'}
          </button>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95"
            >
              {isFr ? 'Confirmer la ventilation' : 'Confirm Split'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
