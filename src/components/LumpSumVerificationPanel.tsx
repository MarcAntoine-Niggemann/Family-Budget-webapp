import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Plus,
  ArrowRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { AccountEntity, TransactionEntity } from '../types';
import { useBudget } from '../context/BudgetContext';
import {
  formatPeriodCycleRange,
  formatPeriodShortLabel,
  isValidCardPeriod,
  shiftCardPeriod,
  summarizeCardPeriod
} from '../utils/creditCardPeriod';

interface LumpSumVerificationPanelProps {
  lumpSumAmount: number;
  deferredCards: AccountEntity[];
  selectedCardId: string;
  onChangeCardId: (cardId: string) => void;
  selectedPeriod: string;
  onChangePeriod: (period: string) => void;
  onApplyCardSum?: (expectedSum: number) => void;
  onEditCardTx?: (tx: TransactionEntity) => void;
  onAddMissingCardTx?: (cardId: string, period: string) => void;
  lumpSumLabel?: string;
}

export const LumpSumVerificationPanel: React.FC<LumpSumVerificationPanelProps> = ({
  lumpSumAmount,
  deferredCards,
  selectedCardId,
  onChangeCardId,
  selectedPeriod,
  onChangePeriod,
  onApplyCardSum,
  onEditCardTx,
  onAddMissingCardTx,
  lumpSumLabel
}) => {
  const { transactions, updateTransaction, language, currency } = useBudget();
  const isFr = language === 'fr';
  const [showAdjacent, setShowAdjacent] = useState(false);

  const selectedCard = useMemo(
    () => deferredCards.find(c => c.id === selectedCardId) || deferredCards[0] || null,
    [deferredCards, selectedCardId]
  );

  const summary = useMemo(() => {
    if (!selectedCard) {
      return {
        cardId: '',
        period: selectedPeriod,
        lumpSumAmount: Math.abs(lumpSumAmount || 0),
        expectedSettlementAmount: 0,
        signedCardTotal: 0,
        delta: Math.abs(lumpSumAmount || 0),
        isMatch: false,
        transactions: [],
        adjacentTransactions: []
      };
    }
    return summarizeCardPeriod(selectedCard.id, selectedPeriod, lumpSumAmount, transactions);
  }, [selectedCard, selectedPeriod, lumpSumAmount, transactions]);

  if (!selectedCard) {
    return (
      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400">
        {isFr
          ? 'Aucun compte Carte à Débit Différé trouvé. Créez-en un pour rapprocher le prélèvement.'
          : 'No Deferred Credit Card account found. Create one first to verify lump-sum debits.'}
      </div>
    );
  }

  const periodIsValid = isValidCardPeriod(selectedPeriod);
  const prevPeriod = periodIsValid ? shiftCardPeriod(selectedPeriod, -1) : selectedPeriod;
  const nextPeriod = periodIsValid ? shiftCardPeriod(selectedPeriod, 1) : selectedPeriod;
  const cycleRangeLabel = periodIsValid
    ? formatPeriodCycleRange(selectedPeriod, selectedCard.billingCycleClosingDay, language)
    : '';
  const currSymbol = selectedCard.currency || currency;

  const handleMoveTxPeriod = (tx: TransactionEntity, targetPeriod: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateTransaction({
      ...tx,
      creditCardPeriod: targetPeriod
    });
  };

  const formatTxDate = (ms: number) =>
    new Date(ms).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short'
    });

  return (
    <div className="rounded-xl bg-slate-950/80 border border-slate-800 divide-y divide-slate-800/80 overflow-hidden">
      {/* Top Controls: Card Selector + Period Stepper */}
      <div className="p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              {isFr ? 'Carte à débit différé' : 'Deferred Card'}
            </label>
            <div className="relative">
              <CreditCard className="w-3.5 h-3.5 text-blue-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedCard.id}
                onChange={e => onChangeCardId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs font-semibold text-slate-100 focus:outline-none focus:border-teal-500"
              >
                {deferredCards.map(card => (
                  <option key={card.id} value={card.id}>
                    {card.name} ({isFr ? `arrêté ${card.billingCycleClosingDay || 25}` : `closes ${card.billingCycleClosingDay || 25}`})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              {isFr ? 'Période de relevé (AAAA-MM)' : 'Card Period (YYYY-MM)'}
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChangePeriod(prevPeriod)}
                title={isFr ? `Période précédente (${prevPeriod})` : `Previous period (${prevPeriod})`}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <input
                type="text"
                value={selectedPeriod}
                placeholder="YYYY-MM"
                onChange={e => onChangePeriod(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums text-center font-semibold text-white focus:outline-none focus:border-teal-500"
              />
              <button
                type="button"
                onClick={() => onChangePeriod(nextPeriod)}
                title={isFr ? `Période suivante (${nextPeriod})` : `Next period (${nextPeriod})`}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition shrink-0 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {cycleRangeLabel && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 flex-wrap">
            <span>
              {isFr ? 'Cycle :' : 'Cycle:'}{' '}
              <span className="text-slate-300 font-medium">{cycleRangeLabel}</span>
              <span aria-hidden="true"> · </span>
              <span>
                {isFr
                  ? `Arrêté le ${selectedCard.billingCycleClosingDay || 25}`
                  : `Closing day ${selectedCard.billingCycleClosingDay || 25}`}
              </span>
            </span>

            {onApplyCardSum && summary.expectedSettlementAmount > 0 && (
              <button
                type="button"
                onClick={() => onApplyCardSum(summary.expectedSettlementAmount)}
                className="text-[11px] font-semibold font-mono tabular-nums text-teal-300 hover:text-teal-200 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isFr
                  ? `Appliquer la somme (${summary.expectedSettlementAmount.toFixed(2)} ${currSymbol})`
                  : `Apply card sum (${summary.expectedSettlementAmount.toFixed(2)} ${currSymbol})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3-Metric Comparison Strip */}
      <div className="grid grid-cols-3 divide-x divide-slate-800/80 bg-slate-900/40">
        <div className="p-3">
          <div className="text-[11px] text-slate-400 truncate">
            {lumpSumLabel || (isFr ? 'Débit forfaitaire' : 'Lump-Sum Debit')}
          </div>
          <div className="mt-1 text-sm font-bold font-mono tabular-nums text-white">
            {summary.lumpSumAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}{' '}
            {currSymbol}
          </div>
        </div>

        <div className="p-3">
          <div className="text-[11px] text-slate-400 truncate">
            {isFr
              ? `Somme carte (${summary.transactions.length})`
              : `Card sum (${summary.transactions.length} tx)`}
          </div>
          <div className="mt-1 text-sm font-bold font-mono tabular-nums text-blue-300">
            {summary.expectedSettlementAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}{' '}
            {currSymbol}
          </div>
        </div>

        <div className="p-3">
          <div className="text-[11px] text-slate-400 truncate">
            {isFr ? 'Écart' : 'Difference'}
          </div>
          <div
            className={`mt-1 text-sm font-bold font-mono tabular-nums ${
              summary.isMatch
                ? 'text-emerald-400'
                : summary.delta > 0
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {summary.delta > 0 ? '+' : ''}
            {summary.delta.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}{' '}
            {currSymbol}
          </div>
        </div>
      </div>

      {/* Status Confirmation / Mismatch Banner */}
      <div
        className={`px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs ${
          summary.isMatch
            ? 'bg-emerald-500/10 text-emerald-300'
            : 'bg-amber-500/10 text-amber-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {summary.isMatch ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span className="font-medium">
            {summary.isMatch
              ? isFr
                ? `Correspondance exacte sur ${summary.transactions.length} opération(s) — rien ne manque.`
                : `Exact match across ${summary.transactions.length} card transaction(s) — nothing is missing.`
              : summary.delta > 0
              ? isFr
                ? `Il manque ${summary.delta.toFixed(2)} ${currSymbol} d’opérations carte sur ${selectedPeriod}.`
                : `Missing ${summary.delta.toFixed(2)} ${currSymbol} in card transactions for ${selectedPeriod}.`
              : isFr
              ? `Excédent de ${Math.abs(summary.delta).toFixed(2)} ${currSymbol} sur la carte pour ${selectedPeriod}.`
              : `Card sum exceeds lump sum by ${Math.abs(summary.delta).toFixed(2)} ${currSymbol} for ${selectedPeriod}.`}
          </span>
        </div>

        {onAddMissingCardTx && !summary.isMatch && summary.delta > 0 && (
          <button
            type="button"
            onClick={() => onAddMissingCardTx(selectedCard.id, selectedPeriod)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] whitespace-nowrap shrink-0 transition cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            <span>{isFr ? 'Ajouter manquante' : 'Add missing'}</span>
          </button>
        )}
      </div>

      {/* Associated Transactions List for Selected Period */}
      <div>
        <div className="px-3.5 py-2 flex items-center justify-between text-[11px] font-semibold text-slate-400 bg-slate-900/30">
          <span>
            {isFr
              ? `Opérations associées (${formatPeriodShortLabel(selectedPeriod, language)})`
              : `Associated Transactions (${formatPeriodShortLabel(selectedPeriod, language)})`}
          </span>
          <span className="font-mono tabular-nums text-slate-300">
            {summary.transactions.length}{' '}
            {isFr ? 'ligne(s)' : 'item(s)'}
          </span>
        </div>

        {summary.transactions.length === 0 ? (
          <div className="px-3.5 py-5 text-center text-xs text-slate-500 space-y-2">
            <p>
              {isFr
                ? `Aucune opération sur ${selectedCard.name} pour la période ${selectedPeriod}.`
                : `No transactions on ${selectedCard.name} assigned to ${selectedPeriod}.`}
            </p>
            {onAddMissingCardTx && (
              <button
                type="button"
                onClick={() => onAddMissingCardTx(selectedCard.id, selectedPeriod)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-teal-300 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isFr ? 'Saisir une opération carte' : 'Log card transaction'}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/60">
            {summary.transactions.map(tx => {
              // Positive amount on a card is a refund/credit reducing amount owed
              const isRefund = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  onClick={() => onEditCardTx?.(tx)}
                  className={`px-3.5 py-2 flex items-center justify-between gap-2 text-xs min-h-[40px] ${
                    onEditCardTx ? 'hover:bg-slate-900/70 cursor-pointer' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-100 truncate">{tx.title}</span>
                      {isRefund && (
                        <span className="text-[10px] font-semibold text-emerald-400 shrink-0">
                          · {isFr ? 'Remb.' : 'Refund'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                      <span className="tabular-nums">{formatTxDate(tx.date)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">
                        {tx.budgetTitle || tx.categoryName || (isFr ? 'À catégoriser' : 'Unassigned')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        isRefund ? 'text-emerald-400' : 'text-slate-100'
                      }`}
                    >
                      {tx.amount > 0 ? '+' : ''}
                      {tx.amount.toFixed(2)} {currSymbol}
                    </span>

                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={e => handleMoveTxPeriod(tx, prevPeriod, e)}
                        title={
                          isFr
                            ? `Déplacer vers ${prevPeriod}`
                            : `Move to ${prevPeriod}`
                        }
                        className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={e => handleMoveTxPeriod(tx, nextPeriod, e)}
                        title={
                          isFr
                            ? `Déplacer vers ${nextPeriod}`
                            : `Move to ${nextPeriod}`
                        }
                        className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collapsible Adjacent Periods & Unassigned Transactions */}
      {summary.adjacentTransactions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowAdjacent(prev => !prev)}
            className="w-full px-3.5 py-2 flex items-center justify-between text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 transition cursor-pointer"
          >
            <span>
              {isFr
                ? `Périodes voisines ou sans période (${summary.adjacentTransactions.length})`
                : `Adjacent periods or unassigned (${summary.adjacentTransactions.length})`}
            </span>
            {showAdjacent ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showAdjacent && (
            <div className="max-h-44 overflow-y-auto divide-y divide-slate-800/60 bg-slate-950/50">
              {summary.adjacentTransactions.map(tx => (
                <div
                  key={tx.id}
                  className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs min-h-[40px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-200 truncate">{tx.title}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span className="tabular-nums">{formatTxDate(tx.date)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-blue-300">
                        {tx.creditCardPeriod || (isFr ? 'Sans période' : 'No period')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono tabular-nums font-semibold text-slate-200">
                      {tx.amount.toFixed(2)} {currSymbol}
                    </span>
                    <button
                      type="button"
                      onClick={e => handleMoveTxPeriod(tx, selectedPeriod, e)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-[11px] font-semibold text-teal-300 whitespace-nowrap shrink-0 transition cursor-pointer"
                    >
                      <ArrowRight className="w-3 h-3" />
                      <span>{selectedPeriod}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
