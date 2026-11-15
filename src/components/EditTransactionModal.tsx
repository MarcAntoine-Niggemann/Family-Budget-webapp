import React, { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Calendar, User, Wallet, Tag, AlertCircle } from 'lucide-react';
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
    navigateTo,
    language,
    currency
  } = useBudget();

  const isFr = language === 'fr';

  const activeAccounts = useMemo(() => accounts.filter(a => !a.isDeleted), [accounts]);
  const activeCategories = useMemo(() => categories.filter(c => !c.isDeleted), [categories]);
  const activeBudgets = useMemo(() => budgets.filter(b => !b.isDeleted && b.isActive), [budgets]);

  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [isExpense, setIsExpense] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(0);
  const [selectedBudgetId, setSelectedBudgetId] = useState(0);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [isExcluded, setIsExcluded] = useState(false);
  const [creditCardPeriod, setCreditCardPeriod] = useState('');

  useEffect(() => {
    if (!isOpen || !transaction) return;
    setTitle(transaction.title);
    setAmountStr(Math.abs(transaction.amount).toString());
    setIsExpense(transaction.isExpense);
    setSelectedAccountId(transaction.accountId);
    setSelectedCategoryId(transaction.categoryId || 0);
    setSelectedBudgetId(transaction.budgetId || 0);
    setSelectedMemberId(transaction.familyMemberId);
    setDateStr(new Date(transaction.date).toISOString().split('T')[0]);
    setPaymentMethod(transaction.paymentMethod);
    setNotes(transaction.notes || '');
    setIsExcluded(transaction.isExcluded || false);
    setCreditCardPeriod(transaction.creditCardPeriod || '');
  }, [isOpen, transaction]);

  const filteredBudgets = useMemo(() => {
    const list = activeBudgets.filter(b => b.categoryId === selectedCategoryId);
    return [...list].sort((a, b) => Number(b.isExpense === isExpense) - Number(a.isExpense === isExpense));
  }, [activeBudgets, selectedCategoryId, isExpense]);

  if (!isOpen || !transaction) return null;

  const selectedCategory = activeCategories.find(c => c.id === selectedCategoryId);
  const selectedBudget = filteredBudgets.find(b => b.id === selectedBudgetId);
  const canSave = Boolean(selectedCategory && selectedBudget && title.trim() && amountStr.trim());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(val) || val <= 0 || !selectedCategory || !selectedBudget) return;

    const account = activeAccounts.find(a => a.id === selectedAccountId);
    const member = members.find(m => m.id === selectedMemberId);

    const signedAmount = isExpense ? -Math.abs(val) : Math.abs(val);
    const txDate = new Date(dateStr).getTime() || transaction.date;

    updateTransaction({
      ...transaction,
      title: title.trim(),
      amount: signedAmount,
      isExpense,
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      categoryColor: selectedCategory.color,
      categoryIcon: selectedCategory.icon,
      budgetId: selectedBudget.id,
      budgetTitle: selectedBudget.title,
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
              <span className="font-mono">#{transaction.id}</span>
              <span aria-hidden="true">·</span>
              <span>
                {transaction.source === 'BANK_IMPORT'
                  ? isFr
                    ? 'Import Banque'
                    : 'Bank Import'
                  : transaction.source === 'OPEN_BANKING'
                  ? 'Open Banking'
                  : isFr
                  ? 'Manuel'
                  : 'Manual'}
              </span>
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
                className="w-full text-xl font-bold font-mono bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-teal-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Type de flux' : 'Flow Direction'}
              </label>
              <select
                value={isExpense ? 'EXPENSE' : 'INCOME'}
                onChange={e => {
                  const nextIsExpense = e.target.value === 'EXPENSE';
                  setIsExpense(nextIsExpense);
                  const stillValid = activeBudgets.some(
                    b => b.id === selectedBudgetId && b.categoryId === selectedCategoryId
                  );
                  if (!stillValid) {
                    const firstMatch =
                      activeBudgets.find(b => b.categoryId === selectedCategoryId && b.isExpense === nextIsExpense) ||
                      activeBudgets.find(b => b.categoryId === selectedCategoryId);
                    setSelectedBudgetId(firstMatch?.id || 0);
                  }
                }}
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

          {/* Category & Mandatory Sub-Category */}
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
                  const firstBudget =
                    activeBudgets.find(b => b.categoryId === newCatId && b.isExpense === isExpense) ||
                    activeBudgets.find(b => b.categoryId === newCatId);
                  setSelectedBudgetId(firstBudget?.id || 0);
                }}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                <option value={0}>
                  {isFr ? 'Sélectionner une catégorie...' : 'Select a category...'}
                </option>
                {activeCategories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Sous-catégorie (obligatoire)' : 'Sub-category (required)'}
              </label>
              <select
                value={selectedBudgetId}
                onChange={e => setSelectedBudgetId(parseInt(e.target.value, 10))}
                disabled={selectedCategoryId === 0 || filteredBudgets.length === 0}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition disabled:opacity-50"
              >
                <option value={0}>
                  {selectedCategoryId === 0
                    ? isFr
                      ? 'Choisir une catégorie d’abord'
                      : 'Select category first'
                    : filteredBudgets.length === 0
                    ? isFr
                      ? 'Aucune sous-catégorie'
                      : 'No sub-categories'
                    : isFr
                    ? 'Sélectionner une sous-catégorie...'
                    : 'Select a sub-category...'}
                </option>
                {filteredBudgets.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                    {b.isExpense !== isExpense
                      ? ` (${b.isExpense ? (isFr ? 'Budget dépense' : 'Spending') : isFr ? 'Budget revenu' : 'Income'})`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedBudget && selectedBudget.isExpense !== isExpense && (
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/25 text-[11px] text-teal-200">
              {!isExpense && selectedBudget.isExpense
                ? isFr
                  ? `Remboursement / crédit : ce revenu réduira le net dépensé de « ${selectedBudget.title} ».`
                  : `Reimbursement / credit: this income will offset net spending in "${selectedBudget.title}".`
                : isFr
                ? `Déduction : cette dépense réduira le net reçu de la sous-catégorie « ${selectedBudget.title} ».`
                : `Deduction: this expense will offset net income in "${selectedBudget.title}".`}
            </div>
          )}

          {selectedCategoryId > 0 && filteredBudgets.length === 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  {isFr
                    ? 'Aucune sous-catégorie dans cette catégorie. Créez-en une dans le Planificateur.'
                    : 'No sub-categories in this category. Create one in Budget Planner first.'}
                </span>
              </div>
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
                {activeAccounts.map(acc => (
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
                disabled={!canSave}
                className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95"
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
