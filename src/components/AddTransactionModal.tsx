import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowDownRight, ArrowUpRight, Calendar, User, Wallet, Tag, AlertCircle, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import {
  computeDefaultCardPeriod,
  formatPeriodCycleRange,
  isValidCardPeriod,
  shiftCardPeriod
} from '../utils/creditCardPeriod';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAccountId?: string | null;
  initialCreditCardPeriod?: string | null;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  initialAccountId,
  initialCreditCardPeriod
}) => {
  const {
    accounts,
    categories,
    budgets,
    members,
    addTransaction,
    navigateTo,
    language,
    currency
  } = useBudget();

  const isFr = language === 'fr';

  const activeAccounts = useMemo(() => accounts.filter(a => !a.isDeleted), [accounts]);
  const activeCategories = useMemo(() => categories.filter(c => !c.isDeleted), [categories]);
  const activeBudgets = useMemo(() => budgets.filter(b => !b.isDeleted && b.isActive), [budgets]);

  const [isExpense, setIsExpense] = useState(true);
  const [amountStr, setAmountStr] = useState('');
  const [title, setTitle] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccounts[0]?.id || '');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(activeCategories[0]?.id || 0);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number>(0);
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id || 'primary');
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState(isFr ? 'Carte Bancaire' : 'Card');
  const [creditCardPeriod, setCreditCardPeriod] = useState('');
  const [isPeriodManuallyEdited, setIsPeriodManuallyEdited] = useState(false);
  const [notes, setNotes] = useState('');

  const filteredBudgets = useMemo(() => {
    const list = activeBudgets.filter(b => b.categoryId === selectedCategoryId);
    return [...list].sort((a, b) => Number(b.isExpense === isExpense) - Number(a.isExpense === isExpense));
  }, [activeBudgets, selectedCategoryId, isExpense]);

  const selectedAccount = useMemo(
    () => activeAccounts.find(a => a.id === selectedAccountId) || null,
    [activeAccounts, selectedAccountId]
  );

  const computedDefaultPeriod = useMemo(() => {
    if (selectedAccount?.type !== 'DEFERRED_CARD') return '';
    const parsedDate = new Date(dateStr + 'T12:00:00').getTime() || Date.now();
    return computeDefaultCardPeriod(parsedDate, selectedAccount.billingCycleClosingDay);
  }, [selectedAccount, dateStr]);

  // Initialize defaults when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const defaultCat =
      activeCategories.find(c => activeBudgets.some(b => b.categoryId === c.id && b.isExpense === isExpense)) ||
      activeCategories.find(c => activeBudgets.some(b => b.categoryId === c.id)) ||
      activeCategories[0];
    const catId = defaultCat?.id || 0;
    const firstBudget =
      activeBudgets.find(b => b.categoryId === catId && b.isExpense === isExpense) ||
      activeBudgets.find(b => b.categoryId === catId);

    const targetAccId =
      initialAccountId && activeAccounts.some(a => a.id === initialAccountId)
        ? initialAccountId
        : activeAccounts.some(a => a.id === selectedAccountId)
        ? selectedAccountId
        : activeAccounts[0]?.id || '';
    const targetAcc = activeAccounts.find(a => a.id === targetAccId);
    const todayStr = new Date().toISOString().split('T')[0];

    setSelectedAccountId(targetAccId);
    setSelectedCategoryId(catId);
    setSelectedBudgetId(firstBudget?.id || 0);
    setSelectedMemberId(members[0]?.id || 'primary');
    setDateStr(todayStr);
    setAmountStr('');
    setTitle('');
    setNotes('');

    if (targetAcc?.type === 'DEFERRED_CARD') {
      if (initialCreditCardPeriod && isValidCardPeriod(initialCreditCardPeriod)) {
        setCreditCardPeriod(initialCreditCardPeriod);
        setIsPeriodManuallyEdited(true);
      } else {
        const parsedMs = new Date(todayStr + 'T12:00:00').getTime() || Date.now();
        setCreditCardPeriod(computeDefaultCardPeriod(parsedMs, targetAcc.billingCycleClosingDay));
        setIsPeriodManuallyEdited(false);
      }
    } else {
      setCreditCardPeriod('');
      setIsPeriodManuallyEdited(false);
    }
  }, [isOpen, initialAccountId, initialCreditCardPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-update default period when date or deferred card account changes (unless manually overridden)
  useEffect(() => {
    if (!isOpen) return;
    if (selectedAccount?.type !== 'DEFERRED_CARD') {
      setCreditCardPeriod('');
      setIsPeriodManuallyEdited(false);
      return;
    }
    if (!isPeriodManuallyEdited) {
      setCreditCardPeriod(computedDefaultPeriod);
    }
  }, [isOpen, selectedAccount?.id, selectedAccount?.type, computedDefaultPeriod, isPeriodManuallyEdited]);

  // Keep sub-category aligned with selected category
  useEffect(() => {
    if (!filteredBudgets.some(b => b.id === selectedBudgetId)) {
      setSelectedBudgetId(filteredBudgets[0]?.id || 0);
    }
  }, [filteredBudgets, selectedBudgetId]);

  if (!isOpen) return null;

  const selectedCategory = activeCategories.find(c => c.id === selectedCategoryId);
  const selectedBudget = filteredBudgets.find(b => b.id === selectedBudgetId);
  const canSubmit = Boolean(selectedCategory && selectedBudget && amountStr.trim() && title.trim());

  const handleDirectionChange = (nextIsExpense: boolean) => {
    setIsExpense(nextIsExpense);
    const currentHasAnySub = activeBudgets.some(b => b.categoryId === selectedCategoryId);
    if (!currentHasAnySub) {
      const catWithMatch =
        activeCategories.find(c =>
          activeBudgets.some(b => b.categoryId === c.id && b.isExpense === nextIsExpense)
        ) || activeCategories.find(c => activeBudgets.some(b => b.categoryId === c.id));
      if (catWithMatch) {
        setSelectedCategoryId(catWithMatch.id);
        const firstSub =
          activeBudgets.find(b => b.categoryId === catWithMatch.id && b.isExpense === nextIsExpense) ||
          activeBudgets.find(b => b.categoryId === catWithMatch.id);
        setSelectedBudgetId(firstSub?.id || 0);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(val) || val <= 0 || !selectedCategory || !selectedBudget) return;

    const account = activeAccounts.find(a => a.id === selectedAccountId);
    const member = members.find(m => m.id === selectedMemberId);
    const signedAmount = isExpense ? -Math.abs(val) : Math.abs(val);
    const txDate = new Date(dateStr + 'T12:00:00').getTime() || Date.now();
    const resolvedPeriod =
      account?.type === 'DEFERRED_CARD'
        ? isValidCardPeriod(creditCardPeriod)
          ? creditCardPeriod.trim()
          : computeDefaultCardPeriod(txDate, account.billingCycleClosingDay)
        : undefined;

    addTransaction({
      title: title.trim(),
      originalBankLabel: null,
      amount: signedAmount,
      isExpense,
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      categoryColor: selectedCategory.color,
      categoryIcon: selectedCategory.icon,
      budgetId: selectedBudget.id,
      budgetTitle: selectedBudget.title,
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
      billingCycleClosingDay: account?.billingCycleClosingDay,
      creditCardPeriod: resolvedPeriod
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto">
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
              onClick={() => handleDirectionChange(true)}
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
              onClick={() => handleDirectionChange(false)}
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
                className="w-full text-2xl font-bold font-mono bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-teal-500 transition"
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
                disabled={filteredBudgets.length === 0}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition disabled:opacity-50"
              >
                {filteredBudgets.length === 0 ? (
                  <option value={0}>
                    {isFr ? 'Aucune sous-catégorie' : 'No sub-categories'}
                  </option>
                ) : (
                  filteredBudgets.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                      {b.isExpense !== isExpense
                        ? ` (${b.isExpense ? (isFr ? 'Budget dépense' : 'Spending') : isFr ? 'Budget revenu' : 'Income'})`
                        : ''}{' '}
                      ({b.amount} {currency})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Informational note when offsetting an opposite-direction budget */}
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

          {/* Blocking notice when selected category lacks any sub-category */}
          {filteredBudgets.length === 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  {isFr
                    ? 'Cette catégorie n’a aucune sous-catégorie. Créez-en une dans le Planificateur de Budget pour continuer.'
                    : 'This category has no sub-categories. Create one in Budget Planner before saving.'}
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

          {/* Deferred Card Billing Period (auto-computed, editable) */}
          {selectedAccount?.type === 'DEFERRED_CARD' && (
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-300">
                  {isFr ? 'Période Débit Différé (AAAA-MM)' : 'Deferred Card Period (YYYY-MM)'}
                </label>
                {isPeriodManuallyEdited && computedDefaultPeriod && creditCardPeriod !== computedDefaultPeriod && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreditCardPeriod(computedDefaultPeriod);
                      setIsPeriodManuallyEdited(false);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-300 hover:text-teal-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{isFr ? `Auto (${computedDefaultPeriod})` : `Auto (${computedDefaultPeriod})`}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCreditCardPeriod(shiftCardPeriod(creditCardPeriod || computedDefaultPeriod, -1));
                    setIsPeriodManuallyEdited(true);
                  }}
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  value={creditCardPeriod}
                  placeholder="YYYY-MM"
                  onChange={e => {
                    setCreditCardPeriod(e.target.value);
                    setIsPeriodManuallyEdited(true);
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-center font-semibold text-white focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCreditCardPeriod(shiftCardPeriod(creditCardPeriod || computedDefaultPeriod, 1));
                    setIsPeriodManuallyEdited(true);
                  }}
                  className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {isValidCardPeriod(creditCardPeriod) && (
                <p className="text-[11px] text-slate-400">
                  {isFr ? 'Cycle :' : 'Cycle:'}{' '}
                  <span className="text-slate-300">
                    {formatPeriodCycleRange(creditCardPeriod, selectedAccount.billingCycleClosingDay, language)}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>
                    {isFr
                      ? `Arrêté le ${selectedAccount.billingCycleClosingDay || 25}`
                      : `Closing day ${selectedAccount.billingCycleClosingDay || 25}`}
                  </span>
                </p>
              )}
            </div>
          )}

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
              disabled={!canSubmit}
              className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95"
            >
              {isFr ? 'Enregistrer' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
