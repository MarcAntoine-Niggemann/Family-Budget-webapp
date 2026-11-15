import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRightLeft,
  Calendar,
  Wallet,
  Tag,
  CheckCircle2,
  Clock,
  Sparkles,
  Split,
  EyeOff,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionEntity } from '../types';

interface TransactionsScreenProps {
  onOpenAddTx: () => void;
  onSelectTransaction: (tx: TransactionEntity) => void;
  onOpenSplit: (tx: TransactionEntity) => void;
}

export const TransactionsScreen: React.FC<TransactionsScreenProps> = ({
  onOpenAddTx,
  onSelectTransaction,
  onOpenSplit
}) => {
  const {
    transactions,
    accounts,
    categories,
    activeAccountId,
    setActiveAccountId,
    language,
    currency,
    updateTransaction
  } = useBudget();

  const isFr = language === 'fr';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<number | 'ALL' | 'UNASSIGNED'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'EXPENSE' | 'INCOME' | 'TRANSFER'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'RECONCILED' | 'VERIFIED'>('ALL');

  const activeAccounts = useMemo(() => accounts.filter(a => !a.isDeleted), [accounts]);
  const activeCategories = useMemo(() => categories.filter(c => !c.isDeleted), [categories]);
  const activeCategoryIds = useMemo(() => new Set(activeCategories.map(c => c.id)), [activeCategories]);

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

  const filteredTransactions = useMemo(() => {
    return activeTransactions.filter(tx => {
      // Account filter
      if (activeAccountId && tx.accountId !== activeAccountId) return false;

      // Category / Unassigned filter
      const isTxUnassigned =
        !tx.categoryId || !tx.budgetId || !activeCategoryIds.has(tx.categoryId);
      if (selectedCatId === 'UNASSIGNED') {
        if (!isTxUnassigned) return false;
      } else if (selectedCatId !== 'ALL' && tx.categoryId !== selectedCatId) {
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
    activeCategoryIds,
    selectedCatId,
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
                    setSelectedCatId(selectedCatId === 'UNASSIGNED' ? 'ALL' : 'UNASSIGNED')
                  }
                  className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 font-semibold transition"
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
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/20 transition active:scale-95 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{isFr ? 'Nouvelle Transaction' : 'New Transaction'}</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 shadow-lg">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={
              isFr
                ? 'Rechercher un commerçant, sous-catégorie, libellé, note...'
                : 'Search merchant, sub-category, bank label, notes...'
            }
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
          />
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
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

          {/* Category Filter */}
          <div>
            <select
              aria-label="Filter transactions by category"
              value={selectedCatId}
              onChange={e => {
                const val = e.target.value;
                setSelectedCatId(
                  val === 'ALL' || val === 'UNASSIGNED' ? val : parseInt(val, 10)
                );
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

          {/* Flow Direction */}
          <div>
            <select
              aria-label="Filter transactions by flow direction"
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
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
              onChange={e => setFilterStatus(e.target.value as any)}
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
