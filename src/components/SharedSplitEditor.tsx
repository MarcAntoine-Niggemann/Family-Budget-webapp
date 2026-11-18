import React, { useMemo } from 'react';
import { Users, AlertCircle, Check } from 'lucide-react';
import { FamilyMemberEntity, SharedSplitInfo, SharedSplitMode } from '../types';
import {
  buildSharedSplitParticipants,
  computeIncomeRatioPercentages,
  validateSharedSplit
} from '../utils/sharedExpenseEngine';

export interface SharedSplitDraftState {
  isShared: boolean;
  mode: SharedSplitMode;
  paidByMemberId: string;
  participantIds: string[];
  customPercentages: Record<string, string>;
  exactAmounts: Record<string, string>;
}

interface SharedSplitEditorProps {
  totalAmountAbs: number;
  isExpense: boolean;
  members: FamilyMemberEntity[];
  currency: string;
  language: 'fr' | 'en';
  draft: SharedSplitDraftState;
  onChange: (next: SharedSplitDraftState) => void;
  onQuickAddPartner?: () => void;
}

export function createInitialSharedDraft(
  existingSplit: SharedSplitInfo | null | undefined,
  defaultPayerId: string,
  members: FamilyMemberEntity[],
  defaultMode: SharedSplitMode = 'EQUAL',
  defaultParticipantIds: string[] = []
): SharedSplitDraftState {
  if (existingSplit && existingSplit.isShared && existingSplit.participants.length > 0) {
    const customPercentages: Record<string, string> = {};
    const exactAmounts: Record<string, string> = {};
    existingSplit.participants.forEach(p => {
      customPercentages[p.memberId] = String(p.percentage);
      exactAmounts[p.memberId] = String(p.shareAmount);
    });
    return {
      isShared: true,
      mode: existingSplit.mode,
      paidByMemberId: existingSplit.paidByMemberId || defaultPayerId,
      participantIds: existingSplit.participants.map(p => p.memberId),
      customPercentages,
      exactAmounts
    };
  }

  const validDefaults = defaultParticipantIds.filter(id => members.some(m => m.id === id));
  const fallbackIds =
    validDefaults.length >= 2
      ? validDefaults
      : members.slice(0, Math.min(2, members.length)).map(m => m.id);

  if (defaultPayerId && !fallbackIds.includes(defaultPayerId) && members.some(m => m.id === defaultPayerId)) {
    fallbackIds.unshift(defaultPayerId);
  }

  return {
    isShared: false,
    mode: defaultMode,
    paidByMemberId: defaultPayerId || members[0]?.id || '',
    participantIds: fallbackIds,
    customPercentages: {},
    exactAmounts: {}
  };
}

export function resolveSharedSplitFromDraft(
  draft: SharedSplitDraftState,
  totalAmountAbs: number,
  members: FamilyMemberEntity[]
): { splitInfo: SharedSplitInfo | null; valid: boolean; reason?: string } {
  if (!draft.isShared) {
    return { splitInfo: null, valid: true };
  }

  const selectedMembers = members.filter(m => draft.participantIds.includes(m.id));
  const payer = members.find(m => m.id === draft.paidByMemberId) || selectedMembers[0];

  const customPctNums: Record<string, number> = {};
  const exactAmtNums: Record<string, number> = {};
  for (const m of selectedMembers) {
    customPctNums[m.id] = parseFloat((draft.customPercentages[m.id] || '0').replace(',', '.')) || 0;
    exactAmtNums[m.id] = parseFloat((draft.exactAmounts[m.id] || '0').replace(',', '.')) || 0;
  }

  const participants = buildSharedSplitParticipants(
    totalAmountAbs,
    draft.mode,
    payer?.id || '',
    selectedMembers,
    customPctNums,
    exactAmtNums
  );

  const validation = validateSharedSplit(totalAmountAbs, draft.mode, participants, payer?.id || '');
  if (!validation.valid) {
    return { splitInfo: null, valid: false, reason: validation.reason };
  }

  return {
    splitInfo: {
      isShared: true,
      mode: draft.mode,
      paidByMemberId: payer.id,
      paidByMemberName: payer.name,
      participants
    },
    valid: true
  };
}

export const SharedSplitEditor: React.FC<SharedSplitEditorProps> = ({
  totalAmountAbs,
  isExpense,
  members,
  currency,
  language,
  draft,
  onChange,
  onQuickAddPartner
}) => {
  const isFr = language === 'fr';

  const selectedMembers = useMemo(
    () => members.filter(m => draft.participantIds.includes(m.id)),
    [members, draft.participantIds]
  );

  const customPctNums = useMemo(() => {
    const out: Record<string, number> = {};
    selectedMembers.forEach(m => {
      out[m.id] = parseFloat((draft.customPercentages[m.id] || '0').replace(',', '.')) || 0;
    });
    return out;
  }, [selectedMembers, draft.customPercentages]);

  const exactAmtNums = useMemo(() => {
    const out: Record<string, number> = {};
    selectedMembers.forEach(m => {
      out[m.id] = parseFloat((draft.exactAmounts[m.id] || '0').replace(',', '.')) || 0;
    });
    return out;
  }, [selectedMembers, draft.exactAmounts]);

  const previewParticipants = useMemo(
    () =>
      buildSharedSplitParticipants(
        totalAmountAbs,
        draft.mode,
        draft.paidByMemberId,
        selectedMembers,
        customPctNums,
        exactAmtNums
      ),
    [totalAmountAbs, draft.mode, draft.paidByMemberId, selectedMembers, customPctNums, exactAmtNums]
  );

  const validation = useMemo(
    () => validateSharedSplit(totalAmountAbs, draft.mode, previewParticipants, draft.paidByMemberId),
    [totalAmountAbs, draft.mode, previewParticipants, draft.paidByMemberId]
  );

  const incomeRatioPreview = useMemo(
    () => computeIncomeRatioPercentages(selectedMembers),
    [selectedMembers]
  );

  const hasIncomeConfigured = useMemo(
    () => selectedMembers.some(m => (Number(m.monthlyIncome) || 0) > 0),
    [selectedMembers]
  );

  const handleToggleShared = (checked: boolean) => {
    if (!checked) {
      onChange({ ...draft, isShared: false });
      return;
    }
    const baseParticipants =
      draft.participantIds.length >= 2
        ? draft.participantIds
        : members.slice(0, Math.min(2, members.length)).map(m => m.id);
    const nextMembers = members.filter(m => baseParticipants.includes(m.id));
    const seedShares = buildSharedSplitParticipants(
      totalAmountAbs,
      draft.mode,
      draft.paidByMemberId,
      nextMembers
    );
    const nextPct: Record<string, string> = { ...draft.customPercentages };
    const nextExact: Record<string, string> = { ...draft.exactAmounts };
    seedShares.forEach(s => {
      if (!nextPct[s.memberId]) nextPct[s.memberId] = String(s.percentage);
      if (!nextExact[s.memberId]) nextExact[s.memberId] = s.shareAmount.toFixed(2);
    });
    onChange({
      ...draft,
      isShared: true,
      participantIds: baseParticipants,
      customPercentages: nextPct,
      exactAmounts: nextExact
    });
  };

  const handleModeChange = (nextMode: SharedSplitMode) => {
    const nextPct: Record<string, string> = { ...draft.customPercentages };
    const nextExact: Record<string, string> = { ...draft.exactAmounts };
    if (nextMode === 'PERCENTAGE' || nextMode === 'EXACT') {
      previewParticipants.forEach(p => {
        if (!nextPct[p.memberId]) nextPct[p.memberId] = String(p.percentage);
        if (!nextExact[p.memberId]) nextExact[p.memberId] = p.shareAmount.toFixed(2);
      });
    }
    onChange({
      ...draft,
      mode: nextMode,
      customPercentages: nextPct,
      exactAmounts: nextExact
    });
  };

  const handleToggleParticipant = (memberId: string) => {
    const exists = draft.participantIds.includes(memberId);
    const nextIds = exists
      ? draft.participantIds.filter(id => id !== memberId)
      : [...draft.participantIds, memberId];
    const nextMembers = members.filter(m => nextIds.includes(m.id));
    const recalculated = buildSharedSplitParticipants(
      totalAmountAbs,
      draft.mode === 'PERCENTAGE' || draft.mode === 'EXACT' ? 'EQUAL' : draft.mode,
      draft.paidByMemberId,
      nextMembers
    );
    const nextPct = { ...draft.customPercentages };
    const nextExact = { ...draft.exactAmounts };
    recalculated.forEach(p => {
      nextPct[p.memberId] = String(p.percentage);
      nextExact[p.memberId] = p.shareAmount.toFixed(2);
    });
    onChange({
      ...draft,
      participantIds: nextIds,
      customPercentages: nextPct,
      exactAmounts: nextExact
    });
  };

  const sumPct = previewParticipants.reduce((s, p) => s + p.percentage, 0);
  const sumAmt = previewParticipants.reduce((s, p) => s + p.shareAmount, 0);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-3">
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-900 dark:text-white block">
              {isFr ? 'Partager cette opération (couple / famille)' : 'Share this expense (couple / family)'}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
              {isFr
                ? 'Suivre qui doit quoi sans modifier les totaux budgétaires'
                : 'Track who owes what without altering household budget totals'}
            </span>
          </div>
        </div>
        <input
          type="checkbox"
          checked={draft.isShared}
          onChange={e => handleToggleShared(e.target.checked)}
          className="w-4 h-4 rounded text-teal-600 dark:text-teal-500 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-teal-500 shrink-0 cursor-pointer"
        />
      </label>

      {draft.isShared && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {members.length < 2 && (
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
              <span>
                {isFr
                  ? 'Ajoutez un second membre ou partenaire pour partager des dépenses.'
                  : 'Add a second member or partner to split expenses.'}
              </span>
              {onQuickAddPartner && (
                <button
                  type="button"
                  onClick={onQuickAddPartner}
                  className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-[11px] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isFr ? '+ Ajouter' : '+ Add Partner'}
                </button>
              )}
            </div>
          )}

          {/* Paid By & Split Mode */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                {isExpense
                  ? isFr
                    ? 'Payé par'
                    : 'Paid by'
                  : isFr
                  ? 'Encaissé par'
                  : 'Received by'}
              </label>
              <select
                value={draft.paidByMemberId}
                onChange={e => onChange({ ...draft, paidByMemberId: e.target.value })}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-teal-500"
              >
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Mode Segmented Control */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'EQUAL', label: '50/50' },
                  { id: 'INCOME_RATIO', label: isFr ? 'Prorata' : 'Income' },
                  { id: 'PERCENTAGE', label: '%' },
                  { id: 'EXACT', label: isFr ? 'Montants' : 'Exact' }
                ] as { id: SharedSplitMode; label: string }[]
              ).map(opt => {
                const active = draft.mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleModeChange(opt.id)}
                    className={`py-1.5 px-2 rounded-md text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Participant Picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                {isFr ? 'Participants au partage' : 'Split between'}
              </span>
              {draft.mode === 'INCOME_RATIO' && !hasIncomeConfigured && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  {isFr ? 'Revenus non renseignés (50/50 utilisé)' : 'No incomes set (using equal)'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {members.map(m => {
                const selected = draft.participantIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleToggleParticipant(m.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      selected
                        ? 'bg-teal-50 dark:bg-teal-500/15 border-teal-300 dark:border-teal-500/40 text-teal-800 dark:text-teal-200'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 shrink-0" />}
                    <span>{m.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Per-Participant Share Breakdown */}
          {selectedMembers.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200/80 dark:divide-slate-800">
              {selectedMembers.map(m => {
                const p = previewParticipants.find(x => x.memberId === m.id);
                const share = p?.shareAmount ?? 0;
                const pct =
                  draft.mode === 'INCOME_RATIO'
                    ? incomeRatioPreview[m.id] ?? 0
                    : p?.percentage ?? 0;

                return (
                  <div key={m.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate block">
                        {m.name}
                        {m.id === draft.paidByMemberId && (
                          <span className="ml-1.5 text-[11px] font-normal text-teal-600 dark:text-teal-400">
                            · {isExpense ? (isFr ? 'Payeur' : 'Payer') : isFr ? 'Bénéficiaire' : 'Receiver'}
                          </span>
                        )}
                      </span>
                      {draft.mode === 'INCOME_RATIO' && (Number(m.monthlyIncome) || 0) > 0 && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                          {(Number(m.monthlyIncome) || 0).toLocaleString()} {currency}/{isFr ? 'mois' : 'mo'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {draft.mode === 'PERCENTAGE' ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft.customPercentages[m.id] ?? String(pct)}
                            onChange={e =>
                              onChange({
                                ...draft,
                                customPercentages: {
                                  ...draft.customPercentages,
                                  [m.id]: e.target.value
                                }
                              })
                            }
                            className="w-16 text-right font-mono tabular-nums text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                          />
                          <span className="text-slate-500">%</span>
                        </div>
                      ) : (
                        <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                          {pct.toFixed(1)}%
                        </span>
                      )}

                      {draft.mode === 'EXACT' ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft.exactAmounts[m.id] ?? share.toFixed(2)}
                            onChange={e =>
                              onChange({
                                ...draft,
                                exactAmounts: {
                                  ...draft.exactAmounts,
                                  [m.id]: e.target.value
                                }
                              })
                            }
                            className="w-20 text-right font-mono tabular-nums text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                          />
                          <span className="text-slate-500">{currency}</span>
                        </div>
                      ) : (
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white min-w-[68px] text-right">
                          {share.toFixed(2)} {currency}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Validation Notice */}
          {!validation.valid && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {validation.reason === 'NO_PARTICIPANTS' &&
                  (isFr
                    ? 'Sélectionnez au moins un autre participant que le payeur.'
                    : 'Select at least one participant other than the payer.')}
                {validation.reason === 'PCT_MISMATCH' &&
                  (isFr
                    ? `La somme des pourcentages est de ${sumPct.toFixed(1)}% (doit faire 100%).`
                    : `Percentages sum to ${sumPct.toFixed(1)}% (must equal 100%).`)}
                {validation.reason === 'AMOUNT_MISMATCH' &&
                  (isFr
                    ? `La somme des parts (${sumAmt.toFixed(2)} ${currency}) doit égaler ${totalAmountAbs.toFixed(2)} ${currency}.`
                    : `Shares sum (${sumAmt.toFixed(2)} ${currency}) must equal ${totalAmountAbs.toFixed(2)} ${currency}.`)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
