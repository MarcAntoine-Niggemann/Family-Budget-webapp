import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Upload,
  GitCompare,
  Plus,
  Landmark,
  CreditCard,
  PiggyBank,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  HelpCircle,
  Split,
  CornerDownRight,
  Pencil
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { computeNetWorth, computeMonthlyReport } from '../utils/reportEngine';
import { computeCashFlowForecast } from '../utils/forecastEngine';
import { isSplitChildTransaction, isTransactionExcludedFromTotals } from '../utils/budgetEngine';
import { CategoryIcon } from '../components/CategoryIcon';
import { AccountEntity, TransactionEntity } from '../types';

interface DashboardScreenProps {
  onOpenAddTx: () => void;
  onOpenTransfer: () => void;
  onSelectTransaction: (tx: TransactionEntity) => void;
  onEditAccount?: (acc: AccountEntity) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onOpenAddTx,
  onOpenTransfer,
  onSelectTransaction,
  onEditAccount
}) => {
  const {
    accounts,
    transactions,
    categories,
    effectiveCategories,
    effectiveBudgets,
    activeSimulation,
    members,
    currency,
    language,
    navigateTo,
    activeAccountId,
    setActiveAccountId,
    resolvedTheme
  } = useBudget();

  const isFr = language === 'fr';
  const isDark = resolvedTheme === 'dark';
  const [expandedParentIds, setExpandedParentIds] = useState<Record<number, boolean>>({});

  const netWorth = computeNetWorth(accounts);
  const forecast = computeCashFlowForecast(accounts, transactions, effectiveBudgets, 30, language);

  const now = new Date();
  const monthlyReport = computeMonthlyReport(
    now.getFullYear(),
    now.getMonth(),
    transactions,
    effectiveCategories,
    effectiveBudgets,
    members,
    language
  );

  const activeAccounts = accounts.filter(a => !a.isDeleted);
  // Keep unassigned transaction detection strictly anchored to Live categories
  const activeCategoryIds = new Set(categories.filter(c => !c.isDeleted).map(c => c.id));
  const activeTransactions = transactions.filter(tx => !tx.isDeleted);

  const { recentGroups, childrenByParentId } = useMemo(() => {
    const activeIds = new Set(activeTransactions.map(t => t.id));
    const childMap = new Map<number, TransactionEntity[]>();
    for (const tx of activeTransactions) {
      if (isSplitChildTransaction(tx) && tx.parentId && activeIds.has(tx.parentId)) {
        const list = childMap.get(tx.parentId) || [];
        list.push(tx);
        childMap.set(tx.parentId, list);
      }
    }
    const topLevel = activeTransactions
      .filter(tx => !(isSplitChildTransaction(tx) && tx.parentId && activeIds.has(tx.parentId)))
      .filter(tx => !activeAccountId || tx.accountId === activeAccountId)
      .slice(0, 8);
    return { recentGroups: topLevel, childrenByParentId: childMap };
  }, [activeTransactions, activeAccountId]);

  const pendingManualCount = activeTransactions.filter(
    tx =>
      !isTransactionExcludedFromTotals(tx) &&
      !isSplitChildTransaction(tx) &&
      tx.source === 'MANUAL' &&
      tx.status === 'PENDING'
  ).length;

  const unassignedCount = activeTransactions.filter(
    tx =>
      !isTransactionExcludedFromTotals(tx) &&
      (!tx.categoryId || !tx.budgetId || !activeCategoryIds.has(tx.categoryId))
  ).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Forecast Included Balance + 30d Minimum Forecast Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {isFr ? 'Trésorerie Prévisionnelle' : 'Forecast Balance'}
              </span>
              {activeSimulation && (
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 truncate block mt-0.5">
                  {isFr ? 'Simulation :' : 'Simulation:'} {activeSimulation.name}
                </span>
              )}
            </div>
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-mono tabular-nums">
              {forecast.currentTotalBalance.toLocaleString()}
            </span>
            <span className="text-lg font-bold text-teal-600 dark:text-teal-400">{currency}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs gap-2">
            <span className="text-slate-500 dark:text-slate-400">
              {isFr ? 'Minimum prévu (30j) :' : '30d forecast min:'}
            </span>
            <span
              className={`font-bold font-mono tabular-nums ${
                forecast.lowestBalance >= 500
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : forecast.lowestBalance >= 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {forecast.lowestBalance.toLocaleString()} {currency} ({forecast.lowestBalanceDate})
            </span>
          </div>
        </div>

        {/* Patrimoine Net / Net Worth Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {isFr ? 'Patrimoine Net Total' : 'Total Net Worth'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-mono tabular-nums">
              {netWorth.totalNetWorth.toLocaleString()}
            </span>
            <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{currency}</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {isFr ? 'Épargne totale :' : 'Total Savings:'}{' '}
              <strong className="text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                {netWorth.savingsTotal.toLocaleString()} {currency}
              </strong>
            </span>
            {netWorth.deferredCardDebts > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-medium font-mono tabular-nums">
                -{netWorth.deferredCardDebts.toLocaleString()} {currency} carte
              </span>
            )}
          </div>
        </div>

        {/* Monthly Budget Burn Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                {isFr ? 'Budget du Mois en cours' : 'Monthly Budget Spend'}
              </span>
              {activeSimulation && (
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 truncate block mt-0.5">
                  {isFr ? 'Simulation :' : 'Simulation:'} {activeSimulation.name}
                </span>
              )}
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-mono tabular-nums">
              {monthlyReport.totalActualExpenses.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              / {monthlyReport.totalExpenseBudget.toLocaleString()} {currency}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  monthlyReport.totalActualExpenses > monthlyReport.totalExpenseBudget
                    ? 'bg-rose-500'
                    : 'bg-teal-500'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (monthlyReport.totalActualExpenses / Math.max(1, monthlyReport.totalExpenseBudget)) * 100
                  )}%`
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                {isFr ? 'Reste à dépenser :' : 'Remaining allowance:'}
              </span>
              <span
                className={`font-semibold ${
                  monthlyReport.netBudgetDifference >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {monthlyReport.netBudgetDifference.toLocaleString()} {currency}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts Bar */}
      <div className="flex items-center gap-2.5 overflow-x-auto py-1 scrollbar-none">
        <button
          onClick={onOpenAddTx}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/20 transition whitespace-nowrap active:scale-95"
        >
          <Plus className="w-4 h-4" />
          {isFr ? 'Saisie Dépense / Revenu' : 'Add Transaction'}
        </button>

        <button
          onClick={onOpenTransfer}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition whitespace-nowrap active:scale-95 shadow-xs dark:shadow-none"
        >
          <ArrowRightLeft className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          {isFr ? 'Virement entre comptes' : 'Transfer Funds'}
        </button>

        <button
          onClick={() => navigateTo('CSV_IMPORT')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition whitespace-nowrap active:scale-95 shadow-xs dark:shadow-none"
        >
          <Upload className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          {isFr ? 'Importer un relevé CSV' : 'Import Bank CSV'}
        </button>

        <button
          onClick={() => navigateTo('RECONCILIATION')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition whitespace-nowrap active:scale-95 relative shadow-xs dark:shadow-none"
        >
          <GitCompare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          {isFr ? 'Rapprochement bancaire' : 'Reconciliation'}
          {pendingManualCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px]">
              {pendingManualCount}
            </span>
          )}
        </button>
      </div>

      {/* Account Balances Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            {isFr ? 'Comptes Bancaires & Cartes' : 'Accounts & Cards'}
          </h2>
          <button
            onClick={() => setActiveAccountId(null)}
            className={`text-xs font-semibold ${
              !activeAccountId ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {isFr ? 'Voir tous' : 'View all'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {activeAccounts.map(acc => {
            const isSelected = activeAccountId === acc.id;
            return (
              <div
                key={acc.id}
                onClick={() => setActiveAccountId(isSelected ? null : acc.id)}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  isSelected
                    ? 'bg-teal-50 dark:bg-teal-500/10 border-teal-500/60 dark:border-teal-500/50 shadow-md shadow-teal-500/10'
                    : 'bg-white dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs dark:shadow-none'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">{acc.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onEditAccount && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onEditAccount(acc);
                        }}
                        title={isFr ? 'Configurer le compte' : 'Configure account'}
                        aria-label={isFr ? `Configurer ${acc.name}` : `Configure ${acc.name}`}
                        className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-teal-600 dark:hover:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {acc.type === 'CHECKING' && <Landmark className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                    {acc.type === 'DEFERRED_CARD' && <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                    {acc.type === 'SAVINGS' && <PiggyBank className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                  </div>
                </div>
                <div className="mt-2 text-xl font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                  {acc.currentBalance.toLocaleString()} {acc.currency || currency}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>
                    {acc.type === 'DEFERRED_CARD'
                      ? isFr
                        ? `Arrêté le ${acc.billingCycleClosingDay || 25}`
                        : `Closes on ${acc.billingCycleClosingDay || 25}`
                      : acc.type === 'SAVINGS'
                      ? isFr
                        ? 'Épargne sécurisée'
                        : 'Savings'
                      : isFr
                      ? 'Compte principal'
                      : 'Checking'}
                  </span>
                  <span className="text-teal-600 dark:text-teal-400 font-medium">
                    {isSelected ? (isFr ? 'Filtré ✓' : 'Filtered ✓') : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cash Flow Forecast Teaser Card */}
      <div className="rounded-2xl bg-gradient-to-r from-white via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 p-5 shadow-sm dark:shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/20 text-teal-600 dark:text-teal-300 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isFr ? 'Trésorerie Prévisionnelle (30 Jours)' : 'Cash Flow Forecast (30 Days)'}
                {activeSimulation && (
                  <span className="ml-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    · {activeSimulation.name}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isFr
                  ? `Point le plus bas estimé : ${forecast.lowestBalance.toLocaleString()} ${currency} (${forecast.lowestBalanceDate})`
                  : `Estimated lowest dip: ${forecast.lowestBalance.toLocaleString()} ${currency} (${forecast.lowestBalanceDate})`}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('CUSTOM_FORECAST')}
            className="flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition"
          >
            <span>{isFr ? 'Voir courbe interactive' : 'View interactive chart'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Warning if lowest balance dip < 500 or < 0 */}
        {forecast.hasOverdraftRisk && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>
              {isFr
                ? `Alerte Découvert : Votre solde risque de chuter à ${forecast.lowestBalance} ${currency}. Réduisez les dépenses discrétionnaires.`
                : `Overdraft Warning: Balance projected to drop to ${forecast.lowestBalance} ${currency}. Reduce discretionary spending.`}
            </span>
          </div>
        )}

        {/* Mini SVG Sparkline */}
        <div className="h-20 w-full mt-2">
          <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 300 60">
            <defs>
              <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity={isDark ? '0.4' : '0.28'} />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Draw curve */}
            {(() => {
              if (forecast.timeline.length < 2) return null;
              const minVal = Math.min(...forecast.timeline.map(p => p.balance), 0);
              const maxVal = Math.max(...forecast.timeline.map(p => p.balance), 1000);
              const range = maxVal - minVal || 1;

              const points = forecast.timeline.map((pt, idx) => {
                const x = (idx / (forecast.timeline.length - 1)) * 300;
                const y = 60 - ((pt.balance - minVal) / range) * 50 - 5;
                return `${x},${y}`;
              });

              const pathD = `M ${points[0]} ` + points.slice(1).map(p => `L ${p}`).join(' ');
              const areaD = `${pathD} L 300,60 L 0,60 Z`;

              return (
                <>
                  <path d={areaD} fill="url(#sparklineGrad)" />
                  <path d={pathD} fill="none" stroke={isDark ? '#2dd4bf' : '#0d9488'} strokeWidth="2.5" strokeLinecap="round" />
                </>
              );
            })()}
          </svg>
        </div>
      </div>

      {/* Recent Transactions List */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {isFr ? 'Dernières Opérations' : 'Recent Transactions'}
            </h2>
            {unassignedCount > 0 && (
              <button
                onClick={() => navigateTo('TRANSACTIONS')}
                className="text-xs font-semibold text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 transition tabular-nums"
              >
                {isFr
                  ? `${unassignedCount} à catégoriser →`
                  : `${unassignedCount} unassigned →`}
              </button>
            )}
          </div>
          <button
            onClick={() => navigateTo('TRANSACTIONS')}
            className="flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition"
          >
            <span>{isFr ? 'Toutes les opérations' : 'View all'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-200/80 dark:divide-slate-800/80 overflow-hidden shadow-sm dark:shadow-xl">
          {recentGroups.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              {isFr ? 'Aucune transaction enregistrée.' : 'No transactions recorded yet.'}
            </div>
          ) : (
            recentGroups.map(tx => {
              const txDate = new Date(tx.date);
              const formattedDate = txDate.toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
                day: 'numeric',
                month: 'short'
              });
              const children = (childrenByParentId.get(tx.id) || []).sort((a, b) => a.id - b.id);
              const isSplitParent = Boolean(tx.isSplitParent || children.length > 0);
              const isExpanded = Boolean(expandedParentIds[tx.id]);
              const isUnassigned =
                !isSplitParent &&
                (!tx.categoryId || !tx.budgetId || !activeCategoryIds.has(tx.categoryId));

              return (
                <div key={tx.id}>
                  <div
                    onClick={() => onSelectTransaction(tx)}
                    className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isSplitParent ? (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setExpandedParentIds(prev => ({ ...prev, [tx.id]: !isExpanded }));
                          }}
                          aria-label={isExpanded ? (isFr ? 'Réduire' : 'Collapse') : (isFr ? 'Déplier' : 'Expand')}
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
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedParentIds(prev => ({ ...prev, [tx.id]: !isExpanded }));
                              }}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-200 transition tabular-nums cursor-pointer"
                            >
                              <Split className="w-3.5 h-3.5" />
                              <span>
                                {isFr ? `Ventilé (${children.length})` : `Split (${children.length})`}
                              </span>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          <span className="tabular-nums">{formattedDate}</span>
                          <span aria-hidden="true">·</span>
                          {isSplitParent ? (
                            <span className="text-indigo-600 dark:text-indigo-300/90 font-medium">
                              {isFr ? `${children.length} sous-catégories` : `${children.length} split items`}
                            </span>
                          ) : isUnassigned ? (
                            <span className="text-amber-600 dark:text-amber-300 font-medium">
                              {isFr ? 'À catégoriser' : 'Unassigned'}
                            </span>
                          ) : (
                            <>
                              <span className="text-slate-700 dark:text-slate-300">{tx.categoryName}</span>
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
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-sm font-bold font-mono tabular-nums ${
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
                      <span className="text-[11px] text-slate-500">{tx.familyMemberName}</span>
                    </div>
                  </div>

                  {isSplitParent && isExpanded && children.length > 0 && (
                    <div className="bg-slate-50/80 dark:bg-slate-950/60 divide-y divide-slate-200/80 dark:divide-slate-800/60 border-t border-slate-200 dark:border-slate-800/80">
                      {children.map(child => (
                        <div
                          key={child.id}
                          onClick={() => onSelectTransaction(child)}
                          className="pl-8 sm:pl-14 pr-4 py-2.5 hover:bg-slate-100/70 dark:hover:bg-slate-800/35 transition cursor-pointer flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <CornerDownRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600 shrink-0" />
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                              style={{ backgroundColor: `#${child.categoryColor.toString(16).slice(-6)}` }}
                            >
                              <CategoryIcon name={child.categoryIcon || child.categoryName} className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{child.title}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                <span className="text-slate-700 dark:text-slate-300">{child.categoryName}</span>
                                {child.budgetTitle && (
                                  <>
                                    <span aria-hidden="true"> · </span>
                                    <span className="text-teal-600 dark:text-teal-300">{child.budgetTitle}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`text-xs font-bold font-mono tabular-nums shrink-0 ${
                              child.amount < 0 ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {child.amount < 0 ? '' : '+'}
                            {child.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
