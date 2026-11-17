import React, { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Calendar, User, Wallet, Tag, AlertCircle, Split, RotateCcw, CornerDownRight, ChevronLeft, ChevronRight, CreditCard } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { TransactionEntity } from '../types';
import { LumpSumVerificationPanel } from './LumpSumVerificationPanel';
import {
  computeDefaultCardPeriod,
  findDefaultCardForCheckingTx,
  formatPeriodCycleRange,
  isValidCardPeriod,
  shiftCardPeriod
} from '../utils/creditCardPeriod';

interface EditTransactionModalProps {
  transaction: TransactionEntity | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenSplit?: (tx: TransactionEntity) => void;
  onSelectTransaction?: (tx: TransactionEntity) => void;
  onAddMissingCardTx?: (cardId: string, period: string) => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onOpenSplit,
  onSelectTransaction,
  onAddMissingCardTx
}) => {
  const {
    transactions,
    accounts,
    categories,
    budgets,
    members,
    updateTransaction,
    deleteTransaction,
    unsplitTransaction,
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
  const [isLumpSumSettlement, setIsLumpSumSettlement] = useState(false);
  const [settlementCardId, setSettlementCardId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnsplit, setConfirmUnsplit] = useState(false);

  const deferredCards = useMemo(
    () => activeAccounts.filter(a => a.type === 'DEFERRED_CARD'),
    [activeAccounts]
  );

  const splitChildren = useMemo(() => {
    if (!transaction) return [];
    return transactions.filter(t => !t.isDeleted && t.parentId === transaction.id);
  }, [transactions, transaction]);

  const parentTransaction = useMemo(() => {
    if (!transaction?.parentId) return null;
    return transactions.find(t => !t.isDeleted && t.id === transaction.parentId) || null;
  }, [transactions, transaction]);

  const isSplitParent = Boolean(transaction && (transaction.isSplitParent || splitChildren.length > 0));
  const isSplitChild = Boolean(transaction?.parentId && transaction.parentId > 0);

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

    const txAcc = activeAccounts.find(a => a.id === transaction.accountId);
    const isCardAcc = txAcc?.type === 'DEFERRED_CARD';
    const isSettlement = transaction.transferType === 'CARD_SETTLEMENT' && !isCardAcc;
    setIsLumpSumSettlement(isSettlement);

    if (isCardAcc) {
      setCreditCardPeriod(
        transaction.creditCardPeriod ||
          computeDefaultCardPeriod(transaction.date, txAcc?.billingCycleClosingDay)
      );
      setSettlementCardId('');
    } else if (isSettlement) {
      const matchedCard = findDefaultCardForCheckingTx(transaction, activeAccounts);
      setSettlementCardId(matchedCard?.id || '');
      setCreditCardPeriod(
        transaction.creditCardPeriod ||
          computeDefaultCardPeriod(transaction.date, matchedCard?.billingCycleClosingDay)
      );
    } else {
      setCreditCardPeriod(transaction.creditCardPeriod || '');
      const matchedCard = findDefaultCardForCheckingTx(transaction, activeAccounts);
      setSettlementCardId(matchedCard?.id || '');
    }

    setConfirmDelete(false);
    setConfirmUnsplit(false);
  }, [isOpen, transaction]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredBudgets = useMemo(() => {
    const list = activeBudgets.filter(b => b.categoryId === selectedCategoryId);
    return [...list].sort((a, b) => Number(b.isExpense === isExpense) - Number(a.isExpense === isExpense));
  }, [activeBudgets, selectedCategoryId, isExpense]);

  if (!isOpen || !transaction) return null;

  const selectedAccount = activeAccounts.find(a => a.id === selectedAccountId) || null;
  const isSelectedAccountDeferredCard = selectedAccount?.type === 'DEFERRED_CARD';
  const parsedAmountNum = parseFloat(amountStr.replace(',', '.'));
  const numericAbsAmount = Number.isFinite(parsedAmountNum) ? Math.abs(parsedAmountNum) : Math.abs(transaction.amount);
  const txDateMs = new Date(dateStr + 'T12:00:00').getTime() || transaction.date;
  const autoCardPeriod = isSelectedAccountDeferredCard
    ? computeDefaultCardPeriod(txDateMs, selectedAccount?.billingCycleClosingDay)
    : '';

  const selectedCategory = activeCategories.find(c => c.id === selectedCategoryId);
  const selectedBudget = filteredBudgets.find(b => b.id === selectedBudgetId);
  const canSave = isSplitParent || isLumpSumSettlement
    ? Boolean(title.trim() && amountStr.trim())
    : Boolean(selectedCategory && selectedBudget && title.trim() && amountStr.trim());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(val) || val <= 0) return;
    if (!isSplitParent && !isLumpSumSettlement && (!selectedCategory || !selectedBudget)) return;

    const account = activeAccounts.find(a => a.id === selectedAccountId);
    const member = members.find(m => m.id === selectedMemberId);

    const signedAmount = isSplitChild
      ? transaction.amount
      : isExpense
      ? -Math.abs(val)
      : Math.abs(val);
    const txDate = new Date(dateStr + 'T12:00:00').getTime() || transaction.date;

    const isCardAccount = account?.type === 'DEFERRED_CARD';
    const linkedCard =
      !isCardAccount && isLumpSumSettlement
        ? deferredCards.find(c => c.id === settlementCardId) || deferredCards[0] || null
        : null;

    const resolvedPeriod = isCardAccount
      ? isValidCardPeriod(creditCardPeriod)
        ? creditCardPeriod.trim()
        : computeDefaultCardPeriod(txDate, account?.billingCycleClosingDay)
      : isLumpSumSettlement
      ? isValidCardPeriod(creditCardPeriod)
        ? creditCardPeriod.trim()
        : computeDefaultCardPeriod(txDate, linkedCard?.billingCycleClosingDay)
      : undefined;

    const wasCardSettlement = transaction.transferType === 'CARD_SETTLEMENT';

    updateTransaction({
      ...transaction,
      title: title.trim(),
      amount: signedAmount,
      isExpense: isSplitChild ? transaction.isExpense : isExpense,
      categoryId: selectedCategory?.id ?? transaction.categoryId,
      categoryName: selectedCategory?.name ?? transaction.categoryName,
      categoryColor: selectedCategory?.color ?? transaction.categoryColor,
      categoryIcon: selectedCategory?.icon ?? transaction.categoryIcon,
      budgetId: selectedBudget?.id ?? transaction.budgetId,
      budgetTitle: selectedBudget?.title ?? transaction.budgetTitle,
      date: isSplitChild ? transaction.date : txDate,
      familyMemberId: member?.id || transaction.familyMemberId,
      familyMemberName: member?.name || transaction.familyMemberName,
      paymentMethod,
      notes,
      accountId: isSplitChild ? transaction.accountId : account?.id || transaction.accountId,
      accountName: isSplitChild ? transaction.accountName : account?.name || transaction.accountName,
      isExcluded: isSplitParent ? transaction.isExcluded : isExcluded,
      isExcludedFromTotals: isSplitParent
        ? transaction.isExcludedFromTotals
        : isLumpSumSettlement
        ? isExcluded
        : wasCardSettlement
        ? false
        : transaction.isExcludedFromTotals,
      transferType: isCardAccount
        ? transaction.transferType
        : isLumpSumSettlement
        ? 'CARD_SETTLEMENT'
        : wasCardSettlement
        ? null
        : transaction.transferType,
      targetAccountId: isCardAccount
        ? transaction.targetAccountId
        : isLumpSumSettlement && linkedCard
        ? linkedCard.id
        : wasCardSettlement
        ? null
        : transaction.targetAccountId,
      targetAccountName: isCardAccount
        ? transaction.targetAccountName
        : isLumpSumSettlement && linkedCard
        ? linkedCard.name
        : wasCardSettlement
        ? null
        : transaction.targetAccountName,
      settlementCardName: isCardAccount
        ? account?.name
        : isLumpSumSettlement && linkedCard
        ? linkedCard.name
        : wasCardSettlement
        ? null
        : transaction.settlementCardName,
      billingCycleClosingDay: isCardAccount
        ? account?.billingCycleClosingDay
        : linkedCard?.billingCycleClosingDay ?? transaction.billingCycleClosingDay,
      creditCardPeriod: resolvedPeriod
    });

    onClose();
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteTransaction(transaction.id);
    onClose();
  };

  const handleUnsplit = () => {
    if (!confirmUnsplit) {
      setConfirmUnsplit(true);
      return;
    }
    unsplitTransaction(transaction.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/75 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {isSplitParent
                ? isFr
                  ? 'Modifier la transaction ventilée'
                  : 'Edit Split Parent'
                : isSplitChild
                ? isFr
                  ? 'Modifier la sous-opération'
                  : 'Edit Split Item'
                : isFr
                ? 'Modifier la Transaction'
                : 'Edit Transaction'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
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
              {isSplitParent && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-indigo-600 dark:text-indigo-300 font-medium">
                    {isFr ? `Parent (${splitChildren.length} lignes)` : `Split parent (${splitChildren.length} items)`}
                  </span>
                </>
              )}
              {isSplitChild && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-indigo-600 dark:text-indigo-300 font-medium">
                    {isFr ? 'Sous-opération ventilée' : 'Split child'}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {isSplitParent && (
            <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 space-y-2.5 text-xs">
              <div className="flex items-start gap-2 text-indigo-800 dark:text-indigo-200">
                <Split className="w-4 h-4 text-indigo-600 dark:text-indigo-300 shrink-0 mt-0.5" />
                <span>
                  {isFr
                    ? `Cette transaction est ventilée en ${splitChildren.length} sous-opérations et exclue des totaux pour éviter tout doublon.`
                    : `This transaction is split into ${splitChildren.length} sub-transactions and excluded from totals to prevent double-counting.`}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {onOpenSplit && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSplit(transaction);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white dark:text-slate-950 font-bold transition whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isFr ? `Modifier la ventilation (${splitChildren.length})` : `Edit Split (${splitChildren.length})`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleUnsplit}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold border transition whitespace-nowrap shrink-0 cursor-pointer ${
                    confirmUnsplit
                      ? 'bg-rose-50 dark:bg-rose-500/20 border-rose-300 dark:border-rose-500/50 text-rose-700 dark:text-rose-200'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {confirmUnsplit
                      ? isFr
                        ? 'Confirmer annulation'
                        : 'Confirm Un-split'
                      : isFr
                      ? 'Annuler la ventilation'
                      : 'Un-split'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {isSplitChild && parentTransaction && (
            <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-start gap-2 text-indigo-800 dark:text-indigo-200 min-w-0">
                <CornerDownRight className="w-4 h-4 text-indigo-600 dark:text-indigo-300 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="block text-slate-500 dark:text-slate-400">
                    {isFr ? 'Issue de la transaction ventilée :' : 'Child item of split transaction:'}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white truncate block">{parentTransaction.title}</span>
                </div>
              </div>
              {onOpenSplit && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSplit(parentTransaction);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white dark:text-slate-950 font-bold transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isFr ? 'Gérer le split parent' : 'Edit Parent Split'}
                </button>
              )}
            </div>
          )}

          {transaction.originalBankLabel && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium block mb-0.5">
                {isFr ? 'Libellé brut bancaire :' : 'Original Bank Label:'}
              </span>
              <span className="font-mono text-teal-700 dark:text-teal-300 break-all">{transaction.originalBankLabel}</span>
            </div>
          )}

          {/* Amount & Direction */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isFr ? 'Montant' : 'Amount'} ({currency})
              </label>
              <input
                type="text"
                required
                disabled={isSplitChild || isSplitParent}
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full text-xl font-bold font-mono tabular-nums bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 transition disabled:opacity-60"
              />
              {(isSplitChild || isSplitParent) && (
                <p className="text-[11px] text-slate-500 mt-1">
                  {isFr
                    ? 'Ajustez les montants dans l’éditeur de ventilation.'
                    : 'Adjust amounts in the Split Editor to keep totals balanced.'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isFr ? 'Type de flux' : 'Flow Direction'}
              </label>
              <select
                value={isExpense ? 'EXPENSE' : 'INCOME'}
                disabled={isSplitChild || isSplitParent}
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
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition disabled:opacity-60"
              >
                <option value="EXPENSE">{isFr ? 'Dépense (-)' : 'Expense (-)'}</option>
                <option value="INCOME">{isFr ? 'Revenu (+)' : 'Income (+)'}</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isFr ? 'Libellé / Titre' : 'Description / Title'}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          {/* Category & Mandatory Sub-Category (hidden or optional for split parent since children hold allocations) */}
          {!isSplitParent && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
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
                  className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition"
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
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {isFr ? 'Sous-catégorie (obligatoire)' : 'Sub-category (required)'}
                </label>
                <select
                  value={selectedBudgetId}
                  onChange={e => setSelectedBudgetId(parseInt(e.target.value, 10))}
                  disabled={selectedCategoryId === 0 || filteredBudgets.length === 0}
                  className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition disabled:opacity-50"
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
          )}

          {!isSplitParent && selectedBudget && selectedBudget.isExpense !== isExpense && (
            <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/25 text-[11px] text-teal-800 dark:text-teal-200">
              {!isExpense && selectedBudget.isExpense
                ? isFr
                  ? `Remboursement / crédit : ce revenu réduira le net dépensé de « ${selectedBudget.title} ».`
                  : `Reimbursement / credit: this income will offset net spending in "${selectedBudget.title}".`
                : isFr
                ? `Déduction : cette dépense réduira le net reçu de la sous-catégorie « ${selectedBudget.title} ».`
                : `Deduction: this expense will offset net income in "${selectedBudget.title}".`}
            </div>
          )}

          {!isSplitParent && selectedCategoryId > 0 && filteredBudgets.length === 0 && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
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
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold whitespace-nowrap shrink-0 transition cursor-pointer"
              >
                {isFr ? 'Planificateur' : 'Budget Planner'}
              </button>
            </div>
          )}

          {/* Account & Member */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" />
                {isFr ? 'Compte Bancaire' : 'Account'}
              </label>
              <select
                value={selectedAccountId}
                disabled={isSplitChild}
                onChange={e => {
                  const nextId = e.target.value;
                  setSelectedAccountId(nextId);
                  const nextAcc = activeAccounts.find(a => a.id === nextId);
                  if (nextAcc?.type === 'DEFERRED_CARD') {
                    setIsLumpSumSettlement(false);
                    if (!creditCardPeriod) {
                      setCreditCardPeriod(
                        computeDefaultCardPeriod(txDateMs, nextAcc.billingCycleClosingDay)
                      );
                    }
                  }
                }}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition disabled:opacity-60"
              >
                {activeAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {isFr ? 'Attribué à' : 'Assigned to'}
              </label>
              <select
                value={selectedMemberId}
                onChange={e => setSelectedMemberId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition"
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
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {isFr ? 'Date' : 'Date'}
              </label>
              <input
                type="date"
                disabled={isSplitChild}
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition disabled:opacity-60"
              />
            </div>

            {(isSelectedAccountDeferredCard || (!isLumpSumSettlement && creditCardPeriod)) && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {isFr ? 'Période Débit Différé' : 'Card Billing Period'}
                  </label>
                  {autoCardPeriod && creditCardPeriod !== autoCardPeriod && (
                    <button
                      type="button"
                      onClick={() => setCreditCardPeriod(autoCardPeriod)}
                      className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-300 dark:hover:text-teal-200 cursor-pointer"
                    >
                      {isFr ? `Auto (${autoCardPeriod})` : `Auto (${autoCardPeriod})`}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setCreditCardPeriod(
                        shiftCardPeriod(creditCardPeriod || autoCardPeriod, -1)
                      )
                    }
                    className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="text"
                    placeholder="YYYY-MM"
                    value={creditCardPeriod}
                    onChange={e => setCreditCardPeriod(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition font-mono tabular-nums text-center"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCreditCardPeriod(
                        shiftCardPeriod(creditCardPeriod || autoCardPeriod, 1)
                      )
                    }
                    className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950/80 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                {isSelectedAccountDeferredCard && isValidCardPeriod(creditCardPeriod) && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {formatPeriodCycleRange(
                      creditCardPeriod,
                      selectedAccount?.billingCycleClosingDay,
                      language
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Lump-Sum Credit Card Debit Verification (for Checking / Non-Card Debits) */}
          {!isSelectedAccountDeferredCard && !isSplitParent && !isSplitChild && isExpense && deferredCards.length > 0 && (
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <div className="flex items-start gap-2.5 min-w-0">
                  <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white block">
                      {isFr
                        ? 'Prélèvement forfaitaire de carte à débit différé'
                        : 'Lump-Sum Deferred Card Debit'}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      {isFr
                        ? 'Compare ce débit bancaire avec la somme des opérations carte de la période'
                        : 'Verify this bank debit against the sum of card transactions for a billing period'}
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isLumpSumSettlement}
                  onChange={e => {
                    const checked = e.target.checked;
                    setIsLumpSumSettlement(checked);
                    if (checked) {
                      setIsExcluded(true);
                      const fallbackCard =
                        deferredCards.find(c => c.id === settlementCardId) ||
                        findDefaultCardForCheckingTx(transaction, activeAccounts) ||
                        deferredCards[0];
                      if (fallbackCard) {
                        setSettlementCardId(fallbackCard.id);
                        if (!isValidCardPeriod(creditCardPeriod)) {
                          setCreditCardPeriod(
                            computeDefaultCardPeriod(txDateMs, fallbackCard.billingCycleClosingDay)
                          );
                        }
                      }
                    }
                  }}
                  className="w-4 h-4 rounded text-teal-600 dark:text-teal-500 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-teal-500 shrink-0"
                />
              </label>

              {isLumpSumSettlement && (
                <LumpSumVerificationPanel
                  lumpSumAmount={numericAbsAmount}
                  deferredCards={deferredCards}
                  selectedCardId={settlementCardId || deferredCards[0]?.id || ''}
                  onChangeCardId={setSettlementCardId}
                  selectedPeriod={
                    creditCardPeriod ||
                    computeDefaultCardPeriod(
                      txDateMs,
                      deferredCards.find(c => c.id === settlementCardId)?.billingCycleClosingDay
                    )
                  }
                  onChangePeriod={setCreditCardPeriod}
                  onEditCardTx={
                    onSelectTransaction
                      ? cardTx => {
                          onSelectTransaction(cardTx);
                        }
                      : undefined
                  }
                  onAddMissingCardTx={
                    onAddMissingCardTx
                      ? (cardId, period) => {
                          onClose();
                          onAddMissingCardTx(cardId, period);
                        }
                      : undefined
                  }
                  lumpSumLabel={isFr ? 'Débit bancaire' : 'Bank debit'}
                />
              )}
            </div>
          )}

          {/* Exclude Checkbox (only for non-split transactions) */}
          {!isSplitParent && !isSplitChild && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
              <input
                type="checkbox"
                id="excludeCheckbox"
                checked={isExcluded}
                onChange={e => setIsExcluded(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 dark:text-teal-500 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-teal-500"
              />
              <label htmlFor="excludeCheckbox" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                {isFr
                  ? 'Exclure des totaux et des rapports financiers (ex: règlement carte, transfert interne)'
                  : 'Exclude from budget totals and reports (e.g. card settlement lump-sum)'}
              </label>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isFr ? 'Notes' : 'Notes'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 flex-wrap">
            <div className="flex items-center gap-2">
              {!isSplitChild && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl transition cursor-pointer ${
                    confirmDelete
                      ? 'bg-rose-50 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/50 text-rose-700 dark:text-rose-200 text-xs font-semibold'
                      : 'text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                  }`}
                  title={isFr ? 'Supprimer' : 'Delete'}
                >
                  <Trash2 className="w-4 h-4" />
                  {confirmDelete && (
                    <span className="whitespace-nowrap">
                      {isSplitParent
                        ? isFr
                          ? `Supprimer + ${splitChildren.length} lignes`
                          : `Delete + ${splitChildren.length} splits`
                        : isFr
                        ? 'Confirmer suppression'
                        : 'Confirm delete'}
                    </span>
                  )}
                </button>
              )}

              {onOpenSplit && !isSplitParent && !isSplitChild && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSplit(transaction);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/40 transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isFr ? 'Ventiler (Split)' : 'Split Transaction'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 disabled:opacity-40 disabled:pointer-events-none text-white dark:text-slate-950 font-bold text-sm shadow-sm transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
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
