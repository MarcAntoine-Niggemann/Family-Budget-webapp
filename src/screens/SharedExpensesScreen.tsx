import React, { useMemo, useState } from 'react';
import {
  Users,
  Plus,
  ArrowRightLeft,
  ArrowRight,
  CheckCircle2,
  Pencil,
  Trash2,
  Search,
  UserPlus,
  Scale
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import {
  FamilyMemberEntity,
  SharedSettlementEntity,
  SharedSplitMode,
  TransactionEntity
} from '../types';
import {
  computeSharedBalances,
  formatSplitModeLabel
} from '../utils/sharedExpenseEngine';
import { CategoryIcon } from '../components/CategoryIcon';
import { SettleUpModal } from '../components/SettleUpModal';
import { MemberManagementModal } from '../components/MemberManagementModal';

interface SharedExpensesScreenProps {
  onOpenAddSharedTx: () => void;
  onSelectTransaction: (tx: TransactionEntity) => void;
}

type ActivityKindFilter = 'ALL' | 'EXPENSES' | 'SETTLEMENTS';

type ActivityItem =
  | { kind: 'TX'; date: number; sortKey: string; tx: TransactionEntity }
  | { kind: 'SETTLEMENT'; date: number; sortKey: string; settlement: SharedSettlementEntity };

export const SharedExpensesScreen: React.FC<SharedExpensesScreenProps> = ({
  onOpenAddSharedTx,
  onSelectTransaction
}) => {
  const {
    transactions,
    sharedSettlements,
    sharedPreset,
    members,
    deleteSharedSettlement,
    updateSharedPreset,
    language,
    currency
  } = useBudget();

  const isFr = language === 'fr';
  const activeMembers = useMemo(() => members.filter(m => !m.isDeleted), [members]);

  const balances = useMemo(
    () => computeSharedBalances(transactions, sharedSettlements, members),
    [transactions, sharedSettlements, members]
  );

  // Filters for activity feed
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>('ALL');
  const [memberFilter, setMemberFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modals
  const [settleModalState, setSettleModalState] = useState<{
    isOpen: boolean;
    fromMemberId?: string;
    toMemberId?: string;
    amount?: number;
  }>({ isOpen: false });

  const [memberModalState, setMemberModalState] = useState<{
    isOpen: boolean;
    member: FamilyMemberEntity | null;
  }>({ isOpen: false, member: null });

  const sharedTransactions = useMemo(
    () =>
      transactions.filter(
        tx =>
          !tx.isDeleted &&
          !(tx.parentId && tx.parentId > 0) &&
          Boolean(tx.sharedSplit?.isShared && tx.sharedSplit.participants.length > 0)
      ),
    [transactions]
  );

  const activeSettlements = useMemo(
    () => sharedSettlements.filter(s => !s.isDeleted),
    [sharedSettlements]
  );

  const activityItems = useMemo(() => {
    const items: ActivityItem[] = [];

    if (kindFilter === 'ALL' || kindFilter === 'EXPENSES') {
      for (const tx of sharedTransactions) {
        if (memberFilter !== 'ALL') {
          const paidByMatch = tx.sharedSplit?.paidByMemberId === memberFilter;
          const partMatch = tx.sharedSplit?.participants.some(p => p.memberId === memberFilter);
          if (!paidByMatch && !partMatch) continue;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = tx.title.toLowerCase().includes(q);
          const matchCat = tx.categoryName.toLowerCase().includes(q);
          const matchNotes = (tx.notes || '').toLowerCase().includes(q);
          const matchPayer = (tx.sharedSplit?.paidByMemberName || '').toLowerCase().includes(q);
          if (!matchTitle && !matchCat && !matchNotes && !matchPayer) continue;
        }
        items.push({ kind: 'TX', date: tx.date, sortKey: `tx_${tx.id}`, tx });
      }
    }

    if (kindFilter === 'ALL' || kindFilter === 'SETTLEMENTS') {
      for (const st of activeSettlements) {
        if (
          memberFilter !== 'ALL' &&
          st.fromMemberId !== memberFilter &&
          st.toMemberId !== memberFilter
        ) {
          continue;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchFrom = st.fromMemberName.toLowerCase().includes(q);
          const matchTo = st.toMemberName.toLowerCase().includes(q);
          const matchNotes = (st.notes || '').toLowerCase().includes(q);
          if (!matchFrom && !matchTo && !matchNotes) continue;
        }
        items.push({ kind: 'SETTLEMENT', date: st.date, sortKey: `st_${st.id}`, settlement: st });
      }
    }

    return items.sort((a, b) => b.date - a.date);
  }, [sharedTransactions, activeSettlements, kindFilter, memberFilter, searchQuery]);

  const handleOpenSettle = (fromId?: string, toId?: string, amount?: number) => {
    const firstDebt = balances.simplifiedDebts[0];
    setSettleModalState({
      isOpen: true,
      fromMemberId: fromId ?? firstDebt?.fromMemberId,
      toMemberId: toId ?? firstDebt?.toMemberId,
      amount: amount ?? firstDebt?.amount
    });
  };

  const handleDeleteSettlement = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    deleteSharedSettlement(id);
    setConfirmDeleteId(null);
  };

  const handlePresetModeChange = (mode: SharedSplitMode) => {
    updateSharedPreset({
      defaultMode: mode,
      defaultParticipantIds:
        sharedPreset.defaultParticipantIds.length >= 2
          ? sharedPreset.defaultParticipantIds
          : activeMembers.slice(0, 2).map(m => m.id)
    });
  };

  const fmtMoney = (n: number) =>
    `${n.toLocaleString(isFr ? 'fr-FR' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })} ${currency}`;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isFr ? 'Partages & Équilibre Couple / Famille' : 'Shared Expenses & Balances'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center flex-wrap gap-1.5">
            <span className="tabular-nums">
              {balances.sharedTransactionCount}{' '}
              {isFr ? 'dépenses partagées' : 'shared expenses'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {fmtMoney(balances.totalSharedVolume)} {isFr ? 'au total' : 'total'}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {balances.settlementCount}{' '}
              {isFr ? 'remboursements' : 'settlements'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={activeMembers.length < 2}
            onClick={() => handleOpenSettle()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 disabled:opacity-40 text-slate-800 dark:text-slate-200 font-semibold text-xs transition whitespace-nowrap cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>{isFr ? 'Enregistrer un remboursement' : 'Settle Up'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenAddSharedTx}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isFr ? 'Dépense partagée' : 'Add Shared Expense'}</span>
          </button>
        </div>
      </div>

      {/* Hero: Who Owes What to Whom */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isFr ? 'Qui doit quoi à qui' : 'Who Owes What to Whom'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isFr
                  ? 'Solde net simplifié incluant les paiements directs et les remboursements enregistrés'
                  : 'Simplified net transfers factoring all tagged expenses and recorded settlements'}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              {isFr ? 'Reste à équilibrer' : 'Outstanding balance'}
            </span>
            <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {fmtMoney(balances.totalOutstandingDebt)}
            </span>
          </div>
        </div>

        {activeMembers.length < 2 ? (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-amber-800 dark:text-amber-200">
              {isFr
                ? 'Ajoutez un second membre ou partenaire pour calculer les partages et soldes entre vous.'
                : 'Add a second member or partner to calculate shared expenses and balances.'}
            </div>
            <button
              type="button"
              onClick={() => setMemberModalState({ isOpen: true, member: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isFr ? 'Ajouter un partenaire' : 'Add Partner'}</span>
            </button>
          </div>
        ) : balances.simplifiedDebts.length === 0 ? (
          <div className="py-5 px-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/25 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                {isFr ? 'Tout est équilibré !' : 'All settled up!'}
              </p>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                {isFr
                  ? 'Aucun remboursement en attente entre les membres.'
                  : 'There are no outstanding balances owed between members.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
            {balances.simplifiedDebts.map(debt => (
              <div
                key={`${debt.fromMemberId}_${debt.toMemberId}`}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 flex-wrap text-sm">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {debt.fromMemberName}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                    <span>{isFr ? 'doit à' : 'owes'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {debt.toMemberName}
                  </span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {fmtMoney(debt.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleOpenSettle(debt.fromMemberId, debt.toMemberId, debt.amount)
                    }
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs whitespace-nowrap transition cursor-pointer"
                  >
                    {isFr ? 'Solder' : 'Settle Up'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Member Breakdown & Income-Proportional Configuration */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isFr
                ? 'Membres, Revenus & Répartition par défaut'
                : 'Member Balances & Income Ratio Setup'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {isFr
                ? 'Renseignez les revenus nets mensuels pour activer la répartition automatique au prorata.'
                : 'Set monthly net incomes to power automatic income-proportional expense splitting.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>{isFr ? 'Mode par défaut :' : 'Default split:'}</span>
              <select
                value={sharedPreset.defaultMode}
                onChange={e => handlePresetModeChange(e.target.value as SharedSplitMode)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="EQUAL">50/50</option>
                <option value="INCOME_RATIO">
                  {isFr ? 'Prorata revenus' : 'Income ratio'}
                </option>
                <option value="PERCENTAGE">
                  {isFr ? '% personnalisé' : 'Custom %'}
                </option>
                <option value="EXACT">
                  {isFr ? 'Montants exacts' : 'Exact amounts'}
                </option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setMemberModalState({ isOpen: true, member: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition whitespace-nowrap cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{isFr ? 'Ajouter un membre' : 'Add Member'}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4">{isFr ? 'Membre' : 'Member'}</th>
                <th className="py-2.5 px-3 text-right">{isFr ? 'Revenu / mois' : 'Monthly Income'}</th>
                <th className="py-2.5 px-3 text-right">{isFr ? 'Prorata' : 'Income Share'}</th>
                <th className="py-2.5 px-3 text-right">{isFr ? 'Payé' : 'Total Paid'}</th>
                <th className="py-2.5 px-3 text-right">{isFr ? 'Part due' : 'Fair Share'}</th>
                <th className="py-2.5 px-3 text-right">{isFr ? 'Règlements' : 'Settlements'}</th>
                <th className="py-2.5 pl-3 text-right">{isFr ? 'Solde net' : 'Net Balance'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
              {balances.memberSummaries.map(summary => {
                const memberEntity = members.find(m => m.id === summary.memberId) || null;
                const netSettledDelta = summary.settlementsSent - summary.settlementsReceived;
                const isCreditor = summary.netBalance > 0.009;
                const isDebtor = summary.netBalance < -0.009;

                return (
                  <tr
                    key={summary.memberId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-[11px] shrink-0"
                          style={{
                            backgroundColor: `#${(summary.avatarColor || 0xff0f766e)
                              .toString(16)
                              .slice(-6)}`
                          }}
                        >
                          {summary.memberName.charAt(0)}
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          {summary.memberName}
                        </span>
                        {memberEntity && !memberEntity.isDeleted && (
                          <button
                            type="button"
                            onClick={() =>
                              setMemberModalState({ isOpen: true, member: memberEntity })
                            }
                            title={isFr ? 'Modifier revenu / membre' : 'Edit income / member'}
                            className="p-1 rounded-md text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {summary.monthlyIncome > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            memberEntity &&
                            setMemberModalState({ isOpen: true, member: memberEntity })
                          }
                          className="hover:text-teal-600 dark:hover:text-teal-400 underline decoration-dotted underline-offset-4 cursor-pointer"
                        >
                          {summary.monthlyIncome.toLocaleString()} {currency}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            memberEntity &&
                            setMemberModalState({ isOpen: true, member: memberEntity })
                          }
                          className="text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 text-[11px] font-sans cursor-pointer"
                        >
                          {isFr ? 'Définir' : 'Set income'}
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {summary.incomeRatioPct.toFixed(1)}%
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {fmtMoney(summary.totalPaid)}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {fmtMoney(summary.totalFairShare)}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {netSettledDelta >= 0 ? '+' : ''}
                      {fmtMoney(netSettledDelta)}
                    </td>

                    <td className="py-3 pl-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {isCreditor ? (
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          +{fmtMoney(summary.netBalance)}{' '}
                          <span className="font-sans font-medium text-[11px]">
                            ({isFr ? 'à recevoir' : 'owed'})
                          </span>
                        </span>
                      ) : isDebtor ? (
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {fmtMoney(summary.netBalance)}{' '}
                          <span className="font-sans font-medium text-[11px]">
                            ({isFr ? 'doit' : 'owes'})
                          </span>
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-500 dark:text-slate-400 font-sans">
                          {isFr ? 'Équilibré' : 'Settled'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
          {isFr
            ? 'Comptabilité budgétaire : 100% des montants payés restent inclus dans vos budgets et rapports ; les remboursements enregistrés ne gonflent pas vos dépenses.'
            : 'Budget accounting: 100% of paid amounts stay counted in household budgets and spending reports; settlement payments are excluded from spending totals.'}
        </p>
      </div>

      {/* Shared Activity Feed */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isFr ? 'Historique des partages & remboursements' : 'Shared Activity Ledger'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Kind Tabs */}
            <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
              {(
                [
                  { id: 'ALL', label: isFr ? 'Tout' : 'All' },
                  { id: 'EXPENSES', label: isFr ? 'Dépenses' : 'Expenses' },
                  { id: 'SETTLEMENTS', label: isFr ? 'Règlements' : 'Settlements' }
                ] as { id: ActivityKindFilter; label: string }[]
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setKindFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                    kindFilter === tab.id
                      ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Member Dropdown */}
            <select
              value={memberFilter}
              onChange={e => setMemberFilter(e.target.value)}
              aria-label={isFr ? 'Filtrer par membre' : 'Filter by member'}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-teal-500"
            >
              <option value="ALL">{isFr ? 'Tous les membres' : 'All Members'}</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isFr ? 'Rechercher...' : 'Search...'}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-teal-500 w-44"
              />
            </div>
          </div>
        </div>

        {sharedTransactions.length === 0 && activeSettlements.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {isFr
                ? 'Aucune dépense partagée pour le moment'
                : 'No shared expenses recorded yet'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              {isFr
                ? 'Créez une nouvelle dépense partagée ou ouvrez une transaction existante pour activer le partage 50/50, au prorata des revenus, en % ou par montants exacts.'
                : 'Add a new shared expense or click any existing transaction to tag it with a 50/50, income-proportional, percentage, or exact amount split.'}
            </p>
            <button
              type="button"
              onClick={onOpenAddSharedTx}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isFr ? 'Ajouter une dépense partagée' : 'Add Shared Expense'}</span>
            </button>
          </div>
        ) : activityItems.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
            {isFr
              ? 'Aucun élément ne correspond aux filtres actifs.'
              : 'No shared items match your current filters.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
            {activityItems.map(item => {
              if (item.kind === 'TX') {
                const { tx } = item;
                const split = tx.sharedSplit!;
                const dateLabel = new Date(tx.date).toLocaleDateString(
                  isFr ? 'fr-FR' : 'en-US',
                  { day: 'numeric', month: 'short', year: 'numeric' }
                );
                const splitSummaryText = split.participants
                  .map(p => `${p.memberName} ${p.shareAmount.toFixed(2)}`)
                  .join(' · ');

                return (
                  <div
                    key={item.sortKey}
                    onClick={() => onSelectTransaction(tx)}
                    className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                        style={{
                          backgroundColor: `#${(tx.categoryColor || 0xff0f766e)
                            .toString(16)
                            .slice(-6)}`
                        }}
                      >
                        <CategoryIcon
                          name={tx.categoryIcon || tx.categoryName}
                          className="w-4 h-4"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-300 transition truncate">
                            {tx.title}
                          </span>
                          <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                            {formatSplitModeLabel(split.mode, language)}
                          </span>
                        </div>

                        <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="tabular-nums">{dateLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {tx.isExpense
                              ? isFr
                                ? `Payé par ${split.paidByMemberName}`
                                : `Paid by ${split.paidByMemberName}`
                              : isFr
                              ? `Encaissé par ${split.paidByMemberName}`
                              : `Received by ${split.paidByMemberName}`}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                            {splitSummaryText}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-sm font-bold font-mono tabular-nums ${
                          tx.amount < 0
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {tx.amount < 0 ? '' : '+'}
                        {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{' '}
                        {currency}
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {tx.categoryName}
                      </span>
                    </div>
                  </div>
                );
              }

              const { settlement: st } = item;
              const dateLabel = new Date(st.date).toLocaleDateString(
                isFr ? 'fr-FR' : 'en-US',
                { day: 'numeric', month: 'short', year: 'numeric' }
              );
              const isConfirming = confirmDeleteId === st.id;

              return (
                <div
                  key={item.sortKey}
                  className="p-4 flex items-center justify-between gap-3 bg-emerald-50/25 dark:bg-emerald-500/5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <ArrowRightLeft className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap text-sm font-semibold text-slate-900 dark:text-white">
                        <span>{st.fromMemberName}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>{st.toMemberName}</span>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 ml-1">
                          {isFr ? 'Remboursement' : 'Settlement'}
                        </span>
                      </div>

                      <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="tabular-nums">{dateLabel}</span>
                        {st.notes && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate max-w-xs">{st.notes}</span>
                          </>
                        )}
                        {st.linkedTransactionId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {isFr ? 'Compte mis à jour' : 'Account linked'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                      {fmtMoney(st.amount)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleDeleteSettlement(st.id)}
                      title={isFr ? 'Supprimer ce remboursement' : 'Delete settlement'}
                      className={`inline-flex items-center gap-1 p-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        isConfirming
                          ? 'px-2.5 bg-rose-50 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-200'
                          : 'text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isConfirming && (
                        <span>{isFr ? 'Confirmer' : 'Confirm'}</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <SettleUpModal
        isOpen={settleModalState.isOpen}
        onClose={() => setSettleModalState({ isOpen: false })}
        initialFromMemberId={settleModalState.fromMemberId}
        initialToMemberId={settleModalState.toMemberId}
        initialAmount={settleModalState.amount}
      />

      <MemberManagementModal
        isOpen={memberModalState.isOpen}
        member={memberModalState.member}
        onClose={() => setMemberModalState({ isOpen: false, member: null })}
      />
    </div>
  );
};
