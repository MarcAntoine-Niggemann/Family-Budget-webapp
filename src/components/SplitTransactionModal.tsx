import React, { useState } from 'react';
import { X, Plus, Trash2, Tag, AlertCircle } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { TransactionEntity } from '../types';

interface SplitTransactionModalProps {
  transaction: TransactionEntity | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SplitTransactionModal: React.FC<SplitTransactionModalProps> = ({
  transaction,
  isOpen,
  onClose
}) => {
  const { categories, budgets, splitTransaction, language, currency } = useBudget();
  const isFr = language === 'fr';

  if (!isOpen || !transaction) return null;

  const totalAbsAmount = Math.abs(transaction.amount);

  const [splits, setSplits] = useState<
    { categoryId: number; categoryName: string; budgetId: number; budgetTitle: string; amount: number; notes: string }[]
  >([
    {
      categoryId: transaction.categoryId,
      categoryName: transaction.categoryName,
      budgetId: transaction.budgetId,
      budgetTitle: transaction.budgetTitle,
      amount: Math.round((totalAbsAmount / 2) * 100) / 100,
      notes: ''
    },
    {
      categoryId: categories[1]?.id || categories[0]?.id || 1,
      categoryName: categories[1]?.name || categories[0]?.name || 'General',
      budgetId: 0,
      budgetTitle: 'General',
      amount: Math.round((totalAbsAmount - totalAbsAmount / 2) * 100) / 100,
      notes: ''
    }
  ]);

  const currentSplitsSum = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
  const remaining = Math.round((totalAbsAmount - currentSplitsSum) * 100) / 100;
  const isValid = Math.abs(remaining) < 0.01 && splits.every(s => s.amount > 0);

  const handleAddSplit = () => {
    const defaultCat = categories[0] || { id: 1, name: 'General' };
    setSplits(prev => [
      ...prev,
      {
        categoryId: defaultCat.id,
        categoryName: defaultCat.name,
        budgetId: 0,
        budgetTitle: 'General',
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
            <p className="text-xs text-slate-400 mt-0.5">
              {transaction.title} • {totalAbsAmount.toFixed(2)} {currency}
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
          className={`mt-4 p-3 rounded-xl border flex items-center justify-between text-xs font-medium ${
            isValid
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {isFr ? 'Total ventilé :' : 'Allocated:'}{' '}
              <strong>
                {currentSplitsSum.toFixed(2)} / {totalAbsAmount.toFixed(2)} {currency}
              </strong>
            </span>
          </div>
          <span>
            {remaining === 0
              ? isFr
                ? 'Équilibré (100%)'
                : 'Balanced (100%)'
              : `${isFr ? 'Reste à répartir :' : 'Remaining:'} ${remaining.toFixed(2)} ${currency}`}
          </span>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div className="space-y-3">
            {splits.map((split, idx) => {
              const catBudgets = budgets.filter(b => b.categoryId === split.categoryId);

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
                    {/* Amount */}
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
                          setSplits(prev =>
                            prev.map((s, i) => (i === idx ? { ...s, amount: val } : s))
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>

                    {/* Category */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        {isFr ? 'Catégorie' : 'Category'}
                      </label>
                      <select
                        value={split.categoryId}
                        onChange={e => {
                          const catId = parseInt(e.target.value, 10);
                          const cat = categories.find(c => c.id === catId);
                          setSplits(prev =>
                            prev.map((s, i) =>
                              i === idx
                                ? {
                                    ...s,
                                    categoryId: catId,
                                    categoryName: cat?.name || 'General',
                                    budgetId: 0,
                                    budgetTitle: 'General'
                                  }
                                : s
                            )
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Sub-Budget */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        {isFr ? 'Sous-budget' : 'Sub-budget'}
                      </label>
                      <select
                        value={split.budgetId}
                        onChange={e => {
                          const bId = parseInt(e.target.value, 10);
                          const b = budgets.find(bg => bg.id === bId);
                          setSplits(prev =>
                            prev.map((s, i) =>
                              i === idx
                                ? { ...s, budgetId: bId, budgetTitle: b?.title || 'General' }
                                : s
                            )
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                      >
                        <option value={0}>{isFr ? 'Général' : 'General'}</option>
                        {catBudgets.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <input
                      type="text"
                      placeholder={isFr ? 'Note spécifique pour ce poste...' : 'Note for this split...'}
                      value={split.notes}
                      onChange={e => {
                        const val = e.target.value;
                        setSplits(prev =>
                          prev.map((s, i) => (i === idx ? { ...s, notes: val } : s))
                        );
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
