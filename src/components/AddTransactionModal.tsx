import React, { useState } from 'react';
import { X, ArrowDownRight, ArrowUpRight, Calendar, User, Wallet, Tag } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { CategoryIcon } from './CategoryIcon';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ isOpen, onClose }) => {
  const {
    accounts,
    categories,
    budgets,
    members,
    addTransaction,
    language,
    currency
  } = useBudget();

  const isFr = language === 'fr';

  const [isExpense, setIsExpense] = useState(true);
  const [amountStr, setAmountStr] = useState('');
  const [title, setTitle] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || 'acc_main_checking');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(categories[0]?.id || 1);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number>(0);
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id || 'primary');
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState(isFr ? 'Carte Bancaire' : 'Card');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const filteredBudgets = budgets.filter(
    b => b.categoryId === selectedCategoryId && b.isExpense === isExpense
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(val) || val <= 0) return;

    const account = accounts.find(a => a.id === selectedAccountId);
    const category = categories.find(c => c.id === selectedCategoryId);
    const budget = budgets.find(b => b.id === selectedBudgetId);
    const member = members.find(m => m.id === selectedMemberId);

    const signedAmount = isExpense ? -Math.abs(val) : Math.abs(val);

    const txDate = new Date(dateStr).getTime() || Date.now();

    addTransaction({
      title: title.trim() || (isExpense ? (isFr ? 'Dépense courante' : 'Expense') : (isFr ? 'Revenu' : 'Income')),
      originalBankLabel: null,
      amount: signedAmount,
      isExpense,
      categoryId: category?.id || 1,
      categoryName: category?.name || 'General',
      categoryColor: category?.color || 0xff3b82f6,
      categoryIcon: category?.icon || 'Tag',
      budgetId: budget?.id || 0,
      budgetTitle: budget?.title || 'General',
      date: txDate,
      familyMemberId: member?.id || 'primary',
      familyMemberName: member?.name || 'Primary User',
      source: 'MANUAL',
      status: 'PENDING',
      paymentMethod,
      notes,
      accountId: account?.id || 'acc_main_checking',
      accountName: account?.name || 'Compte Courant',
      settlementCardName: account?.type === 'DEFERRED_CARD' ? account.name : undefined,
      billingCycleClosingDay: account?.billingCycleClosingDay
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">
            {isFr ? 'Nouvelle Transaction Manuelle' : 'New Manual Transaction'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Expense vs Income Toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/60 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setIsExpense(true)}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${
                isExpense
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              {isFr ? 'Dépense' : 'Expense'}
            </button>
            <button
              type="button"
              onClick={() => setIsExpense(false)}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${
                !isExpense
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              {isFr ? 'Revenu' : 'Income'}
            </button>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Montant' : 'Amount'} ({currency})
            </label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                placeholder="0.00"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full text-2xl font-bold bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">
                {currency}
              </span>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Description / Commerçant' : 'Description / Merchant'}
            </label>
            <input
              type="text"
              required
              placeholder={isFr ? 'Ex: Courses, Restaurant, Salaire...' : 'e.g. Groceries, Dinner, Salary...'}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition"
            />
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
                {isFr ? 'Membre de la famille' : 'Family Member'}
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

          {/* Category & Budget Sub-line */}
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
                <option value={0}>{isFr ? 'Général / Sans sous-budget' : 'General'}</option>
                {filteredBudgets.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.amount} {currency})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Payment Method */}
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
                {isFr ? 'Moyen de paiement' : 'Payment Method'}
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                <option value={isFr ? 'Carte Bancaire' : 'Card'}>{isFr ? 'Carte Bancaire' : 'Card'}</option>
                <option value="Visa Premier">Visa Premier</option>
                <option value={isFr ? 'Virement' : 'Bank Transfer'}>{isFr ? 'Virement' : 'Bank Transfer'}</option>
                <option value={isFr ? 'Prélèvement' : 'Direct Debit'}>{isFr ? 'Prélèvement' : 'Direct Debit'}</option>
                <option value={isFr ? 'Espèces' : 'Cash'}>{isFr ? 'Espèces' : 'Cash'}</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Notes ou mémo (optionnel)' : 'Notes or memo (optional)'}
            </label>
            <textarea
              rows={2}
              placeholder={isFr ? 'Ajoutez un commentaire...' : 'Add a note...'}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          {/* Footer Actions */}
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
              className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95"
            >
              {isFr ? 'Enregistrer' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
