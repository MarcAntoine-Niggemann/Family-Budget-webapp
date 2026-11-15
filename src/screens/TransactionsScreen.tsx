import React, { useMemo } from 'react';
import {
  Search,
  Plus,
  Calendar,
  HelpCircle,
  AlertCircle,
  Split,
  EyeOff,
  RotateCcw
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionEntity } from '../types';

interface TransactionsScreenProps {
  onOpenAddTx: () => void;
  onSelectTransaction: (tx: TransactionEntity) => void;
  onOpenSplit: (tx: TransactionEntity) => void;
}

const parseLocalStartOfDay = (ymd: string): number | null => {
  if (!ymd) return null;
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
};

const parseLocalEndOfDay = (ymd: string): number | null => {
  if (!ymd) return null;
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();
};

export const TransactionsScreen: React.FC<TransactionsScreenProps> = ({
  onOpenAddTx,
  onSelectTransaction,
  onOpenSplit
}) => {
  const {
    transactions,
    accounts,
    categories,
    budgets,
    activeAccountId,
    setActiveAccountId,
    transactionFilters,
    setTransactionFilters,
    resetTransactionFilters,
    language,
    currency,
    updateTransaction
  } = useBudget();

  const isFr = language === 'fr';

  const {
    dateFrom,
    dateTo,
    categoryId: selectedCatId,
    budgetId: selectedBudgetId,
    searchTerm,
    filterType,
    filterStatus
  } = transactionFilters;

  const activeAccounts = useMemo(() => accounts.filter(a => !a.isDeleted), [accounts]);
  const activeCategories = useMemo(() => categories.filter(c => !c.isDeleted), [categories]);
  const activeBudgets = useMemo(() => budgets.filter(b => !b.isDeleted), [budgets]);
  const activeCategoryIds = useMemo(() => new Set(activeCategories.map(c => c.id)), [activeCategories]);

  const subCategoryOptions = useMemo(() => {
    if (selectedCatId === 'UNASSIGNED') return [];
    if (typeof selectedCatId === 'number') {
      return activeBudgets.filter(b => b.categoryId === selectedCatId);
    }
    return activeBudgets;
  }, [activeBudgets, selectedCatId]);

  const activeTransactions = useMemo(
    () => transactions.filter(tx => !tx.isDeleted),
    [transactions]
  );

  const unassignedCount = useMemo(
    () =>
      activeTransactions.filter(
        tx => !tx.isSplitParent && (!tx.categoryId || !tx.budgetId || !activeCategoryIds.has(tx.categoryId))
      ).length,
    [activeTransactions, activeCategoryIds]
  );

  const isAnyFilterActive = Boolean(
    dateFrom ||
      dateTo ||
      selectedCatId !== 'ALL' ||
      selectedBudgetId !== 'ALL' ||
      searchTerm.trim() ||
      filterType !== 'ALL' ||
      filterStatus !== 'ALL' ||
      activeAccountId
  );

  const filteredTransactions = useMemo(() => {
    const fromMs = parseLocalStartOfDay(dateFrom);
    const toMs = parseLocalEndOfDay(dateTo);

    return activeTransactions.filter(tx => {
      // Account filter
      if (activeAccountId && tx.accountId !== activeAccountId) return false;

      // Date range filter (From / To)
      if (fromMs !== null && tx.date < fromMs) return false;
      if (toMs !== null && tx.date > toMs) return false;

      // Category / Unassigned filter
      const isTxUnassigned =
        !tx.categoryId || !tx.budgetId || !activeCategoryIds.has(tx.categoryId);
      if (selectedCatId === 'UNASSIGNED') {
        if (!isTxUnassigned) return false;
      } else if (selectedCatId !== 'ALL' && tx.categoryId !== selectedCatId) {
        return false;
      }

      // Sub-category filter
      if (selectedBudgetId !== 'ALL' && tx.budgetId !== selectedBudgetId) {
        return false;
      }

      // Type filter
      if (filterType === 'EXPENSE' && (!tx.isExpense || tx.isInternalTransfer)) return false;
      if (filterType === 'INCOME' && (tx.isExpense || tx.isInternalTransfer)) return false;
      if (filterType === 'TRANSFER' && !tx.isInternalTransfer) return false;

      // Status filter
      if (filterStatus !== 'ALL' && tx.status !== filterStatus) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesTitle = tx.title.toLowerCase().includes(q);
        const matchesLabel = (tx.originalBankLabel || '').toLowerCase().includes(q);
        const matchesNotes = (tx.notes || '').toLowerCase().includes(q);
        const matchesCategory = tx.categoryName.toLowerCase().includes(q);
        const matchesSubCategory = (tx.budgetTitle || '').toLowerCase().includes(q);
        const matchesMember = tx.familyMemberName.toLowerCase().includes(q);
        if (
          !matchesTitle &&
          !matchesLabel &&
          !matchesNotes &&
          !matchesCategory &&
          !matchesSubCategory &&
          !matchesMember
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    activeTransactions,
    activeAccountId,
    dateFrom,
    dateTo,
    activeCategoryIds,
    selectedCatId,
    selectedBudgetId,
    filterType,
    filterStatus,
    searchTerm
  ]);

  const totalFilteredSum = useMemo(() => {
    return filteredTransactions
      .filter(tx => !tx.isExcluded && !tx.isSplitParent)
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  const toggleExclude = (tx: TransactionEntity, e: React.MouseEvent) => {
    e.stopPropagation();
    updateTransaction({
      ...tx,
      isExcluded: !tx.isExcluded
    });
  };

  const handleResetAllFilters = () => {
    resetTransactionFilters();
    setActiveAccountId(null);
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Controls Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {isFr ? 'Opérations & Historique' : 'Transactions & History'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center flex-wrap gap-1.5">
            <span className="tabular-nums">
              {filteredTransactions.length}{' '}
              {isFr ? 'transactions filtrées' : 'matching transactions'}
            </span>
            <span>·</span>
            <span
              className={`font-semibold font-mono tabular-nums ${
                totalFilteredSum >= 0 ? 'text-emerald-400' : 'text-slate-200'
              }`}
            >
              {totalFilteredSum >= 0 ? '+' : ''}
              {totalFilteredSum.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
            </span>
            {unassignedCount > 0 && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={() =>
                    setTransactionFilters(prev => ({
                      ...prev,
                      categoryId: prev.categoryId === 'UNASSIGNED' ? 'ALL' : 'UNASSIGNED',
                      budgetId: 'ALL'
                    }))
                  }
                  className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 font-semibold transition cursor-pointer"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="tabular-nums">
                    {isFr
                      ? `${unassignedCount} à catégoriser`
                      : `${unassignedCount} unassigned`}
                  </span>
                </button>
              </>
            )}
          </p>
        </div>

        <button
          onClick={onOpenAddTx}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/20 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{isFr ? 'Nouvelle Transaction' : 'New Transaction'}</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-lg">
        {/* Search Input + Reset button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                isFr
                  ? 'Rechercher un commerçant, sous-catégorie, libellé, note...'
                  : 'Search merchant, sub-category, bank label, notes...'
              }
              value={searchTerm}
              onChange={e =>
                setTransactionFilters(prev => ({ ...prev, searchTerm: e.target.value }))
              }
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          {isAnyFilterActive && (
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-teal-400" />
              <span>{isFr ? 'Réinitialiser' : 'Reset filters'}</span>
            </button>
          )}
        </div>

        {/* Date Range + Category + Sub-category Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          {/* Date From */}
          <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus-within:border-teal-500 transition">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-400 shrink-0">{isFr ? 'Du' : 'From'}</span>
            <input
              type="date"
              aria-label={isFr ? 'Date de début' : 'From date'}
              value={dateFrom}
              max={dateTo || undefined}
              onChange={e =>
                setTransactionFilters(prev => ({ ...prev, dateFrom: e.target.value }))
              }
              className="w-full bg-transparent text-slate-200 focus:outline-none [color-scheme:dark]"
            />
          </label>

          {/* Date To */}
          <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 focus-within:border-teal-500 transition">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-400 shrink-0">{isFr ? 'Au' : 'To'}</span>
            <input
              type="date"
              aria-label={isFr ? 'Date de fin' : 'To date'}
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e =>
                setTransactionFilters(prev => ({ ...prev, dateTo: e.target.value }))
              }
              className="w-full bg-transparent text-slate-200 focus:outline-none [color-scheme:dark]"
            />
          </label>

          {/* Category Filter */}
          <div>
            <select
              aria-label="Filter transactions by category"
              value={selectedCatId}
              onChange={e => {
                const val = e.target.value;
                if (val === 'ALL' || val === 'UNASSIGNED') {
                  setTransactionFilters(prev => ({
                    ...prev,
                    categoryId: val,
                    budgetId: val === 'UNASSIGNED' ? 'ALL' : prev.budgetId
                  }));
                } else {
                  const nextCatId = parseInt(val, 10);
                  setTransactionFilters(prev => {
                    const currentBudgetValid =
                      prev.budgetId === 'ALL' ||
                      activeBudgets.some(b => b.id === prev.budgetId && b.categoryId === nextCatId);
                    return {
                      ...prev,
                      categoryId: nextCatId,
                      budgetId: currentBudgetValid ? prev.budgetId : 'ALL'
                    };
                  });
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-teal-500"
            >
              <option value="ALL">{isFr ? 'Toutes catégories' : 'All Categories'}</option>
              <option value="UNASSIGNED">
                {isFr
                  ? `À catégoriser (${unassignedCount})`
                  : `Unassigned (${unassignedCount})`}
              </option>
              {activeCategories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sub-Category Filter */}
          <div>
            <select
              aria-label="Filter transactions by sub-category"
              value={selectedBudgetId}
              disabled={selectedCatId === 'UNASSIGNED'}
              onChange={e => {
                const val = e.target.value;
                if (val === 'ALL') {
                  setTransactionFilters(prev => ({ ...prev, budgetId: 'ALL' }));
                } else {
                  const nextBudgetId = parseInt(val, 10);
                  const matchedBudget = activeBudgets.find(b => b.id === nextBudgetId);
                  setTransactionFilters(prev => ({
                    ...prev,
                    budgetId: nextBudgetId,
                    categoryId: matchedBudget ? matchedBudget.categoryId : prev.categoryId
                  }));
                }
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-teal-500 disabled:opacity-50"
            >
              <option value="ALL">
                {isFr ? 'Toutes sous-catégories' : 'All Sub-categories'}
              </option>
              {subCategoryOptions.map(b => (
                <option key={b.id} value={b.id}>
                  {selectedCatId === 'ALL' && b.categoryName
                    ? `${b.categoryName} › ${b.title}`
                    : b.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Account, Flow Direction, Status Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          {/* Account Filter */}
          <div>
            <select
              aria-label="Filter transactions by account"
              value={activeAccountId || 'ALL'}
              onChange={e => setActiveAccountId(e.target.value === 'ALL' ? null : e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-teal-500"
            >
              <option value="ALL">{isFr ? 'Tous les comptes' : 'All Accounts'}</option>
              {activeAccounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Flow Direction */}
          <div>
            <select
              aria-label="Filter transactions by flow direction"
              value={filterType}
              onChange={e =>
                setTransactionFilters(prev => ({ ...prev, filterType: e.target.value as any }))
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-teal-500"
            >
              <option value="ALL">{isFr ? 'Tous les flux' : 'All Types'}</option>
              <option value="EXPENSE">{isFr ? 'Dépenses uniquement' : 'Expenses only'}</option>
              <option value="INCOME">{isFr ? 'Revenus uniquement' : 'Income only'}</option>
              <option value="TRANSFER">{isFr ? 'Virements internes' : 'Internal transfers'}</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              aria-label="Filter transactions by status"
              value={filterStatus}
              onChange={e =>
                setTransactionFilters(prev => ({ ...prev, filterStatus: e.target.value as any }))
              }
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-teal-500"
            >
              <option value="ALL">{isFr ? 'Tous les statuts' : 'All Statuses'}</option>
              <option value="PENDING">{isFr ? 'En attente (Manuel)' : 'Pending (Manual)'}</option>
              <option value="RECONCILED">{isFr ? 'Rapprochés ✓' : 'Reconciled ✓'}</option>
              <option value="VERIFIED">{isFr ? 'Vérifiés (Banque)' : 'Verified (Bank)'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 divide-y divide-slate-800/80 overflow-hidden shadow-xl">
        {filteredTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            {isFr ? 'Aucune opération ne correspond à vos filtres.' : 'No transactions match your search.'}
          </div>
        ) : (
          filteredTransactions.map(tx => {
            const txDate = new Date(tx.date);
            const formattedDate = txDate.toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });
            const isUnassigned =
              !tx.categoryId || !tx.budgetId || !activeCategoryIds.has(tx.categoryId);

            return (
              <div
                key={tx.id}
                onClick={() => onSelectTransaction(tx)}
                className={`p-4 hover:bg-slate-800/40 transition cursor-pointer flex items-center justify-between gap-3 group ${
                  tx.isExcluded ? 'opacity-40 bg-slate-950/40' : ''
                }`}
              >
                {/* Left: Icon & info */}
                <div className="flex items-center gap-3 min-w-0">
                  {isUnassigned ? (
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                      <HelpCircle className="w-5 h-5" />
                    </div>
                  ) : (
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
                      style={{ backgroundColor: `#${tx.categoryColor.toString(16).slice(-6)}` }}
                    >
                      <CategoryIcon name={tx.categoryIcon || tx.categoryName} className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-white group-hover:text-teal-300 transition truncate">
                        {tx.title}
                      </span>

                      {tx.status === 'PENDING' && (
                        <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                          {isFr ? 'En attente' : 'Pending'}
                        </span>
                      )}

                      {tx.status === 'RECONCILED' && (
                        <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                          {isFr ? 'Rapproché ✓' : 'Reconciled ✓'}
                        </span>
                      )}

                      {tx.isSplit && (
                        <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                          Split
                        </span>
                      )}

                      {tx.creditCardPeriod && (
                        <span className="text-[10px] font-mono text-blue-300">
                          💳 {tx.creditCardPeriod}
                        </span>
                      )}

                      {tx.isExcluded && (
                        <span className="text-[10px] font-medium text-slate-400">
                          {isFr ? 'Exclu des totaux' : 'Excluded'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 truncate">
                      <span className="tabular-nums">{formattedDate}</span>
                      <span>·</span>
                      {isUnassigned ? (
                        <span className="text-amber-300 font-semibold">
                          {isFr ? 'À catégoriser (cliquer pour éditer)' : 'Unassigned (click to edit)'}
                        </span>
                      ) : (
                        <>
                          <span className="text-slate-300 font-medium">{tx.categoryName}</span>
                          {tx.budgetTitle && (
                            <>
                              <span>·</span>
                              <span className="text-teal-300">{tx.budgetTitle}</span>
                            </>
                          )}
                        </>
                      )}
                      <span>·</span>
                      <span>{tx.accountName}</span>
                      <span>·</span>
                      <span className="text-slate-500">{tx.paymentMethod}</span>
                    </div>

                    {tx.notes && (
                      <div className="text-[11px] text-teal-400/80 mt-0.5 truncate">
                        💬 {tx.notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Amount & quick actions */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div
                      className={`text-base font-bold font-mono tabular-nums ${
                        tx.amount < 0 ? 'text-slate-100' : 'text-emerald-400'
                      }`}
                    >
                      {tx.amount < 0 ? '' : '+'}
                      {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                    </div>
                    <span className="text-xs text-slate-500">{tx.familyMemberName}</span>
                  </div>

                  {/* Quick Action buttons */}
                  <div className="flex items-center gap-1 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    {!tx.isSplit && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onOpenSplit(tx);
                        }}
                        title={isFr ? 'Ventiler' : 'Split'}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition"
                      >
                        <Split className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={e => toggleExclude(tx, e)}
                      title={
                        tx.isExcluded
                          ? isFr
                            ? 'Inclure dans les totaux'
                            : 'Include in totals'
                          : isFr
                          ? 'Exclure des totaux'
                          : 'Exclude from totals'
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
