import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { LumpSumVerificationPanel } from './LumpSumVerificationPanel';
import {
  computeDefaultCardPeriod,
  getAvailableCardPeriods,
  isValidCardPeriod
} from '../utils/creditCardPeriod';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMissingCardTx?: (cardId: string, period: string) => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  onAddMissingCardTx
}) => {
  const { accounts, transactions, transferBetweenAccounts, language, currency } = useBudget();
  const isFr = language === 'fr';

  const activeAccounts = useMemo(() => accounts.filter(a => !a.isDeleted), [accounts]);
  const deferredCards = useMemo(
    () => activeAccounts.filter(a => a.type === 'DEFERRED_CARD'),
    [activeAccounts]
  );

  const [sourceAccId, setSourceAccId] = useState('');
  const [targetAccId, setTargetAccId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [transferType, setTransferType] = useState<
    'TO_SAVINGS' | 'FROM_SAVINGS' | 'CARD_SETTLEMENT' | 'GENERAL_TRANSFER'
  >('TO_SAVINGS');
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [creditCardPeriod, setCreditCardPeriod] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const defaultChecking =
      activeAccounts.find(a => a.type === 'CHECKING') || activeAccounts[0];
    const defaultSavings =
      activeAccounts.find(a => a.type === 'SAVINGS' && a.id !== defaultChecking?.id) ||
      activeAccounts.find(a => a.id !== defaultChecking?.id) ||
      activeAccounts[0];

    setTransferType('TO_SAVINGS');
    setSourceAccId(defaultChecking?.id || '');
    setTargetAccId(defaultSavings?.id || '');
    setAmountStr('');
    setDateStr(new Date().toISOString().split('T')[0]);
    setNotes('');

    const firstCard = deferredCards[0];
    if (firstCard) {
      const periods = getAvailableCardPeriods(
        firstCard.id,
        transactions,
        firstCard.billingCycleClosingDay
      );
      setCreditCardPeriod(
        periods[0] || computeDefaultCardPeriod(Date.now(), firstCard.billingCycleClosingDay)
      );
    } else {
      setCreditCardPeriod('');
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTransferTypeChange = (
    nextType: 'TO_SAVINGS' | 'FROM_SAVINGS' | 'CARD_SETTLEMENT' | 'GENERAL_TRANSFER'
  ) => {
    setTransferType(nextType);
    if (nextType === 'CARD_SETTLEMENT') {
      const targetCard =
        deferredCards.find(c => c.id === targetAccId) || deferredCards[0];
      if (targetCard) {
        setTargetAccId(targetCard.id);
        if (
          targetCard.linkedCheckingAccountId &&
          activeAccounts.some(a => a.id === targetCard.linkedCheckingAccountId)
        ) {
          setSourceAccId(targetCard.linkedCheckingAccountId);
        } else {
          const checking = activeAccounts.find(
            a => a.type === 'CHECKING' && a.id !== targetCard.id
          );
          if (checking) setSourceAccId(checking.id);
        }
        const periods = getAvailableCardPeriods(
          targetCard.id,
          transactions,
          targetCard.billingCycleClosingDay
        );
        if (!isValidCardPeriod(creditCardPeriod)) {
          setCreditCardPeriod(
            periods[0] || computeDefaultCardPeriod(Date.now(), targetCard.billingCycleClosingDay)
          );
        }
      }
    }
  };

  if (!isOpen) return null;

  const parsedAmount = parseFloat(amountStr.replace(',', '.'));
  const numericAmount = Number.isFinite(parsedAmount) ? Math.abs(parsedAmount) : 0;

  const selectedCardForSettlement =
    deferredCards.find(c => c.id === targetAccId) ||
    deferredCards.find(c => c.id === sourceAccId) ||
    deferredCards[0] ||
    null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(parsedAmount) || parsedAmount <= 0 || sourceAccId === targetAccId) return;

    const dateMillis = new Date(dateStr + 'T12:00:00').getTime() || Date.now();
    transferBetweenAccounts(
      sourceAccId,
      targetAccId,
      parsedAmount,
      notes,
      transferType,
      transferType === 'CARD_SETTLEMENT'
        ? {
            creditCardPeriod: isValidCardPeriod(creditCardPeriod)
              ? creditCardPeriod.trim()
              : undefined,
            dateMillis
          }
        : { dateMillis }
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {isFr ? 'Virement Entre Comptes' : 'Transfer Between Accounts'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Transfer Type Preset */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Motif du virement' : 'Transfer Type'}
            </label>
            <select
              value={transferType}
              onChange={e =>
                handleTransferTypeChange(
                  e.target.value as
                    | 'TO_SAVINGS'
                    | 'FROM_SAVINGS'
                    | 'CARD_SETTLEMENT'
                    | 'GENERAL_TRANSFER'
                )
              }
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
            >
              <option value="TO_SAVINGS">
                {isFr ? 'Épargne mensuelle (Vers Livret / Épargne)' : 'Savings (To Savings Account)'}
              </option>
              <option value="CARD_SETTLEMENT">
                {isFr ? 'Règlement Carte à Débit Différé' : 'Credit Card Lump-Sum Settlement'}
              </option>
              <option value="FROM_SAVINGS">
                {isFr ? 'Rapatriement Épargne (Vers Courant)' : 'From Savings to Checking'}
              </option>
              <option value="GENERAL_TRANSFER">
                {isFr ? 'Autre virement interne' : 'General Internal Transfer'}
              </option>
            </select>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Montant du virement' : 'Transfer Amount'} ({currency})
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="0.00"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full text-2xl font-bold font-mono tabular-nums bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-teal-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Date' : 'Date'}
              </label>
              <input
                type="date"
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Source Account & Target Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Compte émetteur (Débité)' : 'Source Account (Debited)'}
              </label>
              <select
                value={sourceAccId}
                onChange={e => setSourceAccId(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                {activeAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currentBalance.toFixed(2)} {acc.currency || currency})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Compte destinataire (Crédité)' : 'Target Account (Credited)'}
              </label>
              <select
                value={targetAccId}
                onChange={e => {
                  const nextTarget = e.target.value;
                  setTargetAccId(nextTarget);
                  const card = deferredCards.find(c => c.id === nextTarget);
                  if (card && transferType === 'CARD_SETTLEMENT') {
                    const periods = getAvailableCardPeriods(
                      card.id,
                      transactions,
                      card.billingCycleClosingDay
                    );
                    if (periods[0]) setCreditCardPeriod(periods[0]);
                  }
                }}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                {activeAccounts
                  .filter(a => a.id !== sourceAccId)
                  .map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currentBalance.toFixed(2)} {acc.currency || currency})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Lump-Sum Verification Panel for Credit Card Settlement */}
          {transferType === 'CARD_SETTLEMENT' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-300">
                  {isFr
                    ? 'Vérification du prélèvement forfaitaire'
                    : 'Lump-Sum Period Verification'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isFr
                    ? 'Exclu des totaux budget pour éviter tout doublon'
                    : 'Excluded from budget totals to prevent double-counting'}
                </span>
              </div>
              <LumpSumVerificationPanel
                lumpSumAmount={numericAmount}
                deferredCards={deferredCards}
                selectedCardId={selectedCardForSettlement?.id || ''}
                onChangeCardId={cardId => {
                  setTargetAccId(cardId);
                  const card = deferredCards.find(c => c.id === cardId);
                  if (
                    card?.linkedCheckingAccountId &&
                    activeAccounts.some(a => a.id === card.linkedCheckingAccountId)
                  ) {
                    setSourceAccId(card.linkedCheckingAccountId);
                  }
                }}
                selectedPeriod={
                  creditCardPeriod ||
                  computeDefaultCardPeriod(
                    new Date(dateStr + 'T12:00:00').getTime() || Date.now(),
                    selectedCardForSettlement?.billingCycleClosingDay
                  )
                }
                onChangePeriod={setCreditCardPeriod}
                onApplyCardSum={sum => setAmountStr(sum.toFixed(2))}
                onAddMissingCardTx={
                  onAddMissingCardTx
                    ? (cardId, period) => {
                        onClose();
                        onAddMissingCardTx(cardId, period);
                      }
                    : undefined
                }
                lumpSumLabel={isFr ? 'Virement saisi' : 'Settlement amount'}
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Mémo (optionnel)' : 'Memo (optional)'}
            </label>
            <input
              type="text"
              placeholder={
                transferType === 'CARD_SETTLEMENT'
                  ? isFr
                    ? 'Ex: Prélèvement différé période 2026-11'
                    : 'e.g. Monthly deferred card settlement'
                  : isFr
                  ? 'Ex: Épargne vacances, Virement mensuel'
                  : 'e.g. Monthly vacation savings'
              }
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={!parsedAmount || parsedAmount <= 0 || sourceAccId === targetAccId}
              className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95 cursor-pointer"
            >
              {isFr ? 'Exécuter le virement' : 'Execute Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
