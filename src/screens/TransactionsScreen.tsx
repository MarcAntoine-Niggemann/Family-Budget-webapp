import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Calendar,
  HelpCircle,
  AlertCircle,
  Split,
  EyeOff,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  CornerDownRight
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionEntity } from '../types';
import { isSplitChildTransaction, isTransactionExcludedFromTotals } from '../utils/budgetEngine';
import { findDefaultCardForCheckingTx, summarizeCardPeriod } from '../utils/creditCardPeriod';

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
  const [expandedParentIds, setExpandedParentIds] = useState<Record<number, boolean>>({});

  const {
    dateFrom,
    dateTo,
    categoryId: selectedCatId,
    budgetId: selectedBudgetId,
    searchTerm,
    filterType,
    filterStatus,
    creditCardPeriod: selectedPeriod = 'ALL'
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
        tx =>
          !isTransactionExcludedFromTotals(tx) &&
          (!tx.categoryId || !tx.budgetId || !activeCategoryIds.has(tx.categoryId))
      ).length,
    [activeTransactions, activeCategoryIds]
  );

  const availableCardPeriods = useMemo(() => {
    const periods = new Set<string>();
    for (const tx of activeTransactions) {
      if (tx.creditCardPeriod) {
        periods.add(tx.creditCardPeriod);
      }
    }
    return Array.from(periods).sort((a, b) => b.localeCompare(a));
  }, [activeTransactions]);

  const isAnyFilterActive = Boolean(
    dateFrom ||
      dateTo ||
      selectedCatId !== 'ALL' ||
      selectedBudgetId !== 'ALL' ||
      searchTerm.trim() ||
      filterType !== 'ALL' ||
      filterStatus !== 'ALL' ||
      selectedPeriod !== 'ALL' ||
      activeAccountId
  );

  const hasChildTargetedFilter = Boolean(
    selectedCatId !== 'ALL' || selectedBudgetId !== 'ALL' || searchTerm.trim()
  );

  const { groupedTransactions, totalFilteredSum } = useMemo(() => {
    const fromMs = parseLocalStartOfDay(dateFrom);
    const toMs = parseLocalEndOfDay(dateTo);

    const activeIds = new Set(activeTransactions.map(t => t.id));
    const childrenByParentId = new Map<number, TransactionEntity[]>();

    for (const tx of activeTransactions) {
      if (isSplitChildTransaction(tx) && tx.parentId && activeIds.has(tx.parentId)) {
        const list = childrenByParentId.get(tx.parentId) || [];
        list.push(tx);
        childrenByParentId.set(tx.parentId, list);
      }
    }

    const matchesFilters = (tx: TransactionEntity, isParentRow: boolean): boolean => {
      if (activeAccountId && tx.accountId !== activeAccountId) return false;
      if (fromMs !== null && tx.date < fromMs) return false;
      if (toMs !== null && tx.date > toMs) return false;

      const isTxUnassigned =
        !tx.categoryId || !tx.budgetId || !activeCategoryIds.has(tx.categoryId);
      if (selectedCatId === 'UNASSIGNED') {
        if (isParentRow || !isTxUnassigned) return false;
      } else if (selectedCatId !== 'ALL' && tx.categoryId !== selectedCatId) {
        return false;
      }

      if (selectedBudgetId !== 'ALL' && tx.budgetId !== selectedBudgetId) {
        return false;
      }

      if (filterType === 'EXPENSE' && (!tx.isExpense || tx.isInternalTransfer)) return false;
      if (filterType === 'INCOME' && (tx.isExpense || tx.isInternalTransfer)) return false;
      if (filterType === 'TRANSFER' && !tx.isInternalTransfer) return false;

      if (filterStatus !== 'ALL' && tx.status !== filterStatus) return false;

      if (selectedPeriod !== 'ALL' && tx.creditCardPeriod !== selectedPeriod) return false;

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
    };

    const topLevel = activeTransactions.filter(
      tx => !(isSplitChildTransaction(tx) && tx.parentId && activeIds.has(tx.parentId))
    );

    const groups: {
      parent: TransactionEntity;
      children: TransactionEntity[];
      allChildrenCount: number;
      autoExpand: boolean;
    }[] = [];

    let sum = 0;

    for (const tx of topLevel) {
      const allChildren = (childrenByParentId.get(tx.id) || []).sort((a, b) => a.id - b.id);
      const isParent = Boolean(tx.isSplitParent || allChildren.length > 0);

      if (!isParent) {
        if (matchesFilters(tx, false)) {
          groups.push({ parent: tx, children: [], allChildrenCount: 0, autoExpand: false });
          if (!isTransactionExcludedFromTotals(tx)) {
            sum += tx.amount;
          }
        }
        continue;
      }

      const matchingChildren = allChildren.filter(c => matchesFilters(c, false));
      const parentMatches = matchesFilters(tx, true);

      const shouldIncludeGroup =
        selectedCatId === 'UNASSIGNED'
          ? matchingChildren.length > 0
          : hasChildTargetedFilter
          ? matchingChildren.length > 0 || parentMatches
          : parentMatches || matchingChildren.length > 0;

      if (!shouldIncludeGroup) continue;

      const visibleChildren = hasChildTargetedFilter && matchingChildren.length > 0
        ? matchingChildren
        : allChildren;

      groups.push({
        parent: tx,
        children: visibleChildren,
        allChildrenCount: allChildren.length,
        autoExpand: hasChildTargetedFilter && matchingChildren.length > 0
      });

      for (const child of visibleChildren) {
        if (!isTransactionExcludedFromTotals(child)) {
          sum += child.amount;
        }
      }
    }

    return {
      groupedTransactions: groups,
      totalFilteredSum: Math.round(sum * 100) / 100
    };
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
    selectedPeriod,
    searchTerm,
    hasChildTargetedFilter
  ]);

  const toggleExpandParent = (parentId: number, currentExpanded: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedParentIds(prev => ({
      ...prev,
      [parentId]: !currentExpanded
    }));
  };

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
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isFr ? 'Opérations & Historique' : 'Transactions & History'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center flex-wrap gap-1.5">
            <span className="tabular-nums">
              {groupedTransactions.length}{' '}
              {isFr ? 'transactions filtrées' : 'matching transactions'}
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={`font-semibold font-mono tabular-nums ${
                totalFilteredSum >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'
              }`}
            >
              {totalFilteredSum >= 0 ? '+' : ''}
              {totalFilteredSum.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
            </span>
            {unassignedCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() =>
                    setTransactionFilters(prev => ({
                      ...prev,
                      categoryId: prev.categoryId === 'UNASSIGNED' ? 'ALL' : 'UNASSIGNED',
                      budgetId: 'ALL'
                    }))
                  }
                  className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 font-semibold transition cursor-pointer"
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
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/20 transition active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{isFr ? 'Nouvelle Transaction' : 'New Transaction'}</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm dark:shadow-lg">
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
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          {isAnyFilterActive && (
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{isFr ? 'Réinitialiser' : 'Reset filters'}</span>
            </button>
          )}
        </div>

        {/* Date Range + Category + Sub-category Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          {/* Date From */}
          <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 focus-within:border-teal-500 transition">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-500 dark:text-slate-400 shrink-0">{isFr ? 'Du' : 'From'}</span>
            <input
              type="date"
              aria-label={isFr ? 'Date de début' : 'From date'}
              value={dateFrom}
              max={dateTo || undefined}
              onChange={e =>
                setTransactionFilters(prev => ({ ...prev, dateFrom: e.target.value }))
              }
              className="w-full bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          </label>

          {/* Date To */}
          <label className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 focus-within:border-teal-500 transition">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-500 dark:text-slate-400 shrink-0">{isFr ? 'Au' : 'To'}</span>
            <input
              type="date"
              aria-label={isFr ? 'Date de fin' : 'To date'}
              value={dateTo}
              min={dateFrom || undefined}
              onChange={e =>
                setTransactionFilters(prev => ({ ...prev, dateTo: e.target.value }))
              }
              className="w-full bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none"
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
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-teal-500"
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
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-teal-500 disabled:opacity-50"
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

        {/* Account, Flow Direction, Status, Card Period Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          {/* Account Filter */}
          <div>
            <select
              aria-label="Filter transactions by account"
              value={activeAccountId || 'ALL'}
              onChange={e => setActiveAccountId(e.target.value === 'ALL' ? null : e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-teal-500"
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
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-teal-500"
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
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:border-teal-500"
            >
              <option value="ALL">{isFr ? 'Tous les statuts' : 'All Statuses'}</option>
              <option value="PENDING">{isFr ? 'En attente (Manuel)' : 'Pending (Manual)'}</option>
              <option value="RECONCILED">{isFr ? 'Rapprochés ✓' : 'Reconciled ✓'}</option>
              <option value="VERIFIED">{isFr ? 'Vérifiés (Banque)' : 'Verified (Bank)'}</option>
            </select>
          </div>

          {/* Credit Card Period Filter */}
          <div>
            <select
              aria-label={isFr ? 'Filtrer par période carte' : 'Filter transactions by card period'}
              value={selectedPeriod}
              onChange={e =>
                setTransactionFilters(prev => ({ ...prev, creditCardPeriod: e.target.value }))
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-300 font-mono tabular-nums focus:outline-none focus:border-teal-500"
            >
              <option value="ALL" className="font-sans">
                {isFr ? 'Toutes périodes carte' : 'All Card Periods'}
              </option>
              {availableCardPeriods.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-200/80 dark:divide-slate-800/80 overflow-hidden shadow-sm dark:shadow-xl">
        {groupedTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            {isFr ? 'Aucune opération ne correspond à vos filtres.' : 'No transactions match your search.'}
          </div>
        ) : (
          groupedTransactions.map(({ parent: tx, children, allChildrenCount, autoExpand }) => {
            const txDate = new Date(tx.date);
            const formattedDate = txDate.toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });
            const isSplitParent = Boolean(tx.isSplitParent || allChildrenCount > 0);
            const isExpanded =
              expandedParentIds[tx.id] !== undefined ? expandedParentIds[tx.id] : autoExpand;
            const isUnassigned =
              !isSplitParent &&
              (!tx.categoryId || !tx.budgetId || !activeCategoryIds.has(tx.categoryId));

            return (
              <div key={tx.id}>
                {/* Parent or Standard Transaction Row */}
                <div
                  onClick={() => onSelectTransaction(tx)}
                  className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer flex items-center justify-between gap-3 group ${
                    tx.isExcluded ? 'opacity-45 bg-slate-100/70 dark:bg-slate-950/40' : ''
                  }`}
                >
                  {/* Left: Expand toggle (if split parent) + Icon + info */}
                  <div className="flex items-center gap-3 min-w-0">
                    {isSplitParent ? (
                      <button
                        type="button"
                        onClick={e => toggleExpandParent(tx.id, isExpanded, e)}
                        aria-label={isExpanded ? (isFr ? 'Réduire le split' : 'Collapse split') : (isFr ? 'Déplier le split' : 'Expand split')}
                        className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 shrink-0 transition cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>
                    ) : isUnassigned ? (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 shrink-0">
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
                        <span className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-300 transition truncate">
                          {tx.title}
                        </span>

                        {tx.status === 'PENDING' && (
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                            {isFr ? 'En attente' : 'Pending'}
                          </span>
                        )}

                        {tx.status === 'RECONCILED' && (
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
                            {isFr ? 'Rapproché ✓' : 'Reconciled ✓'}
                          </span>
                        )}

                        {isSplitParent && (
                          <button
                            type="button"
                            onClick={e => toggleExpandParent(tx.id, isExpanded, e)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-200 transition tabular-nums cursor-pointer"
                          >
                            <Split className="w-3.5 h-3.5" />
                            <span>
                              {isFr
                                ? `Ventilé (${allChildrenCount} lignes)`
                                : `Split (${allChildrenCount} items)`}
                            </span>
                          </button>
                        )}

                        {tx.creditCardPeriod && (() => {
                          const txAcc = activeAccounts.find(a => a.id === tx.accountId);
                          const isCheckingSettlement =
                            tx.transferType === 'CARD_SETTLEMENT' &&
                            tx.amount < 0 &&
                            txAcc?.type !== 'DEFERRED_CARD';
                          const matchedCard = isCheckingSettlement
                            ? findDefaultCardForCheckingTx(tx, activeAccounts)
                            : null;
                          const settlementSummary =
                            isCheckingSettlement && matchedCard && matchedCard.id !== tx.accountId
                              ? summarizeCardPeriod(
                                  matchedCard.id,
                                  tx.creditCardPeriod,
                                  Math.abs(tx.amount),
                                  activeTransactions
                                )
                              : null;

                          return (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-blue-600 dark:text-blue-300 tabular-nums">
                              <span>{tx.creditCardPeriod}</span>
                              {settlementSummary && (
                                <span
                                  className={
                                    settlementSummary.isMatch
                                      ? 'font-sans font-semibold text-emerald-600 dark:text-emerald-400'
                                      : 'font-semibold text-amber-600 dark:text-amber-300'
                                  }
                                >
                                  ·{' '}
                                  {settlementSummary.isMatch
                                    ? isFr
                                      ? `Vérifié (${settlementSummary.transactions.length})`
                                      : `Matched (${settlementSummary.transactions.length})`
                                    : `Δ ${settlementSummary.delta > 0 ? '+' : ''}${settlementSummary.delta.toFixed(2)} ${currency}`}
                                </span>
                              )}
                            </span>
                          );
                        })()}

                        {isSplitParent ? (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {isFr ? 'Exclu des totaux' : 'Excluded from totals'}
                          </span>
                        ) : (
                          tx.isExcluded && (
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              {isFr ? 'Exclu des totaux' : 'Excluded'}
                            </span>
                          )
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                        <span className="tabular-nums">{formattedDate}</span>
                        <span aria-hidden="true">·</span>
                        {isSplitParent ? (
                          <span className="text-indigo-600 dark:text-indigo-300/90 font-medium">
                            {children.length < allChildrenCount
                              ? isFr
                                ? `${children.length} sur ${allChildrenCount} sous-opérations filtrées`
                                : `${children.length} of ${allChildrenCount} split items shown`
                              : isFr
                              ? `${allChildrenCount} sous-catégories ventilées`
                              : `${allChildrenCount} categorized splits`}
                          </span>
                        ) : isUnassigned ? (
                          <span className="text-amber-600 dark:text-amber-300 font-semibold">
                            {isFr ? 'À catégoriser (cliquer pour éditer)' : 'Unassigned (click to edit)'}
                          </span>
                        ) : (
                          <>
                            <span className="text-slate-700 dark:text-slate-300 font-medium">{tx.categoryName}</span>
                            {tx.budgetTitle && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-teal-600 dark:text-teal-300">{tx.budgetTitle}</span>
                              </>
                            )}
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{tx.accountName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-400 dark:text-slate-500">{tx.paymentMethod}</span>
                      </div>

                      {tx.notes && (
                        <div className="text-[11px] text-teal-600 dark:text-teal-400/80 mt-0.5 truncate">
                          {tx.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Amount & quick actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div
                        className={`text-base font-bold font-mono tabular-nums ${
                          isSplitParent
                            ? 'text-slate-400 line-through decoration-slate-400 dark:decoration-slate-600'
                            : tx.amount < 0
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {tx.amount < 0 ? '' : '+'}
                        {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                      </div>
                      <span className="text-xs text-slate-500">{tx.familyMemberName}</span>
                    </div>

                    {/* Quick Action buttons */}
                    <div className="flex items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition">
                      {!isSplitChildTransaction(tx) && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onOpenSplit(tx);
                          }}
                          title={
                            isSplitParent
                              ? isFr
                                ? 'Modifier la ventilation'
                                : 'Edit split'
                              : isFr
                              ? 'Ventiler'
                              : 'Split'
                          }
                          className={`p-2 rounded-lg transition cursor-pointer ${
                            isSplitParent
                              ? 'text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/15'
                              : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Split className="w-4 h-4" />
                        </button>
                      )}

                      {!isSplitParent && (
                        <button
                          type="button"
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
                          className="p-2 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Nested Child Sub-Transactions */}
                {isSplitParent && isExpanded && children.length > 0 && (
                  <div className="bg-slate-50/80 dark:bg-slate-950/60 divide-y divide-slate-200/80 dark:divide-slate-800/60 border-t border-slate-200 dark:border-slate-800/80">
                    {children.map(child => {
                      const childUnassigned =
                        !child.categoryId || !child.budgetId || !activeCategoryIds.has(child.categoryId);

                      return (
                        <div
                          key={child.id}
                          onClick={() => onSelectTransaction(child)}
                          className={`pl-8 sm:pl-14 pr-4 py-3 hover:bg-slate-100/70 dark:hover:bg-slate-800/35 transition cursor-pointer flex items-center justify-between gap-3 group/child ${
                            child.isExcluded ? 'opacity-45' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <CornerDownRight className="w-4 h-4 text-slate-400 dark:text-slate-600 shrink-0" />
                            {childUnassigned ? (
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 shrink-0">
                                <HelpCircle className="w-4 h-4" />
                              </div>
                            ) : (
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                                style={{ backgroundColor: `#${child.categoryColor.toString(16).slice(-6)}` }}
                              >
                                <CategoryIcon name={child.categoryIcon || child.categoryName} className="w-4 h-4" />
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover/child:text-teal-600 dark:group-hover/child:text-teal-300 transition truncate">
                                  {child.title}
                                </span>
                                {child.isExcluded && (
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {isFr ? 'Exclu' : 'Excluded'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                {childUnassigned ? (
                                  <span className="text-amber-600 dark:text-amber-300 font-semibold">
                                    {isFr ? 'À catégoriser' : 'Unassigned'}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-slate-700 dark:text-slate-300">{child.categoryName}</span>
                                    {child.budgetTitle && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="text-teal-600 dark:text-teal-300">{child.budgetTitle}</span>
                                      </>
                                    )}
                                  </>
                                )}
                                {child.notes && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-teal-600 dark:text-teal-400/80 truncate">{child.notes}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div
                              className={`text-sm font-bold font-mono tabular-nums ${
                                child.amount < 0 ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {child.amount < 0 ? '' : '+'}
                              {child.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                            </div>
                            <button
                              type="button"
                              onClick={e => toggleExclude(child, e)}
                              title={
                                child.isExcluded
                                  ? isFr
                                    ? 'Inclure dans les totaux'
                                    : 'Include in totals'
                                  : isFr
                                  ? 'Exclure des totaux'
                                  : 'Exclude from totals'
                              }
                              className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 opacity-80 sm:opacity-0 sm:group-hover/child:opacity-100 transition cursor-pointer"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
