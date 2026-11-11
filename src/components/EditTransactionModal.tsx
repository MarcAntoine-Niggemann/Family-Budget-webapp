import React, { useState } from 'react';
import { X, Trash2, Calendar, User, Wallet, Tag } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { TransactionEntity } from '../types';

interface EditTransactionModalProps {
  transaction: TransactionEntity | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenSplit?: (tx: TransactionEntity) => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onOpenSplit
}) => {
  const {
    accounts,
    categories,
    budgets,
    members,
    updateTransaction,
    deleteTransaction,
    language,
    currency
  } = useBudget();

  const isFr = language === 'fr';

  if (!isOpen || !transaction) return null;

  const [title, setTitle] = useState(transaction.title);
  const [amountStr, setAmountStr] = useState(Math.abs(transaction.amount).toString());
  const [isExpense, setIsExpense] = useState(transaction.isExpense);
  const [selectedAccountId, setSelectedAccountId] = useState(transaction.accountId);
  const [selectedCategoryId, setSelectedCategoryId] = useState(transaction.categoryId);
  const [selectedBudgetId, setSelectedBudgetId] = useState(transaction.budgetId);
  const [selectedMemberId, setSelectedMemberId] = useState(transaction.familyMemberId);
  const [dateStr, setDateStr] = useState(new Date(transaction.date).toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState(transaction.paymentMethod);
  const [notes, setNotes] = useState(transaction.notes || '');
  const [isExcluded, setIsExcluded] = useState(transaction.isExcluded || false);
  const [creditCardPeriod, setCreditCardPeriod] = useState(transaction.creditCardPeriod || '');

  const filteredBudgets = budgets.filter(
    b => b.categoryId === selectedCategoryId && b.isExpense === isExpense
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(val) || val <= 0) return;

    const account = accounts.find(a => a.id === selectedAccountId);
    const category = categories.find(c => c.id === selectedCategoryId);
    const budget = budgets.find(b => b.id === selectedBudgetId);
    const member = members.find(m => m.id === selectedMemberId);

    const signedAmount = isExpense ? -Math.abs(val) : Math.abs(val);
    const txDate = new Date(dateStr).getTime() || transaction.date;

    updateTransaction({
      ...transaction,
      title: title.trim(),
      amount: signedAmount,
      isExpense,
      categoryId: category?.id || transaction.categoryId,
      categoryName: category?.name || transaction.categoryName,
      categoryColor: category?.color || transaction.categoryColor,
      categoryIcon: category?.icon || transaction.categoryIcon,
      budgetId: budget?.id || 0,
      budgetTitle: budget?.title || 'General',
      date: txDate,
      familyMemberId: member?.id || transaction.familyMemberId,
      familyMemberName: member?.name || transaction.familyMemberName,
      paymentMethod,
      notes,
      accountId: account?.id || transaction.accountId,
      accountName: account?.name || transaction.accountName,
      isExcluded,
      creditCardPeriod: creditCardPeriod || undefined
    });

    onClose();
  };

  const handleDelete = () => {
    if (confirm(isFr ? 'Supprimer cette transaction ?' : 'Delete this transaction?')) {
      deleteTransaction(transaction.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isFr ? 'Modifier la Transaction' : 'Edit Transaction'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 font-mono">
                #{transaction.id}
              </span>
              <span>{transaction.source === 'BANK_IMPORT' ? (isFr ? 'Import Banque' : 'Bank Import') : 'Manuel'}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {/* Raw Bank Label display if imported */}
          {transaction.originalBankLabel && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs">
              <span className="text-slate-400 font-medium block mb-0.5">
                {isFr ? 'Libellé brut bancaire :' : 'Original Bank Label:'}
              </span>
              <span className="font-mono text-teal-300 break-all">{transaction.originalBankLabel}</span>
            </div>
          )}

          {/* Amount & Direction */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Montant' : 'Amount'} ({currency})
              </label>
              <input
                type="text"
                required
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full text-xl font-bold bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-teal-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Type de flux' : 'Flow Direction'}
              </label>
              <select
                value={isExpense ? 'EXPENSE' : 'INCOME'}
                onChange={e => setIsExpense(e.target.value === 'EXPENSE')}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                <option value="EXPENSE">{isFr ? 'Dépense (-)' : 'Expense (-)'}</option>
                <option value="INCOME">{isFr ? 'Revenu (+)' : 'Income (+)'}</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Libellé / Titre' : 'Description / Title'}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          {/* Category & Budget */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                {isFr ? 'Catégorie' : 'Category'}
              </label>
              <select
                value={selectedCategoryId}
                onChange={e => {
                  const newCatId = parseInt(e.target.value, 10);
                  setSelectedCategoryId(newCatId);
                  const firstBudget = budgets.find(b => b.categoryId === newCatId);
                  setSelectedBudgetId(firstBudget?.id || 0);
                }}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Ligne de budget' : 'Budget Line'}
              </label>
              <select
                value={selectedBudgetId}
                onChange={e => setSelectedBudgetId(parseInt(e.target.value, 10))}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                <option value={0}>{isFr ? 'Général' : 'General'}</option>
                {filteredBudgets.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Account & Member */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" />
                {isFr ? 'Compte Bancaire' : 'Account'}
              </label>
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {isFr ? 'Attribué à' : 'Assigned to'}
              </label>
              <select
                value={selectedMemberId}
                onChange={e => setSelectedMemberId(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Deferred Card Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {isFr ? 'Date' : 'Date'}
              </label>
              <input
                type="date"
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Période Débit Différé (Ex: 2026-10)' : 'Billing Cycle (e.g. 2026-10)'}
              </label>
              <input
                type="text"
                placeholder="YYYY-MM"
                value={creditCardPeriod}
                onChange={e => setCreditCardPeriod(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition font-mono"
              />
            </div>
          </div>

          {/* Exclude Checkbox */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <input
              type="checkbox"
              id="excludeCheckbox"
              checked={isExcluded}
              onChange={e => setIsExcluded(e.target.checked)}
              className="w-4 h-4 rounded text-teal-500 bg-slate-900 border-slate-700 focus:ring-teal-500"
            />
            <label htmlFor="excludeCheckbox" className="text-xs text-slate-300 cursor-pointer">
              {isFr
                ? 'Exclure des totaux et des rapports financiers (ex: règlement carte, transfert interne)'
                : 'Exclude from budget totals and reports (e.g. card settlement lump-sum)'}
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Notes' : 'Notes'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDelete}
                className="p-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition"
                title={isFr ? 'Supprimer' : 'Delete'}
              >
                <Trash2 className="w-5 h-5" />
              </button>

              {onOpenSplit && !transaction.isSplit && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSplit(transaction);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 transition"
                >
                  {isFr ? 'Ventiler (Split)' : 'Split Transaction'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95"
              >
                {isFr ? 'Enregistrer' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
