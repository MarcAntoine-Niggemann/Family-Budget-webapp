import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowRightLeft, ArrowRight, Wallet } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';

interface SettleUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFromMemberId?: string;
  initialToMemberId?: string;
  initialAmount?: number;
}

export const SettleUpModal: React.FC<SettleUpModalProps> = ({
  isOpen,
  onClose,
  initialFromMemberId,
  initialToMemberId,
  initialAmount
}) => {
  const {
    members,
    accounts,
    addSharedSettlement,
    language,
    currency
  } = useBudget();

  const isFr = language === 'fr';
  const activeMembers = useMemo(() => members.filter(m => !m.isDeleted), [members]);
  const activeAccounts = useMemo(() => accounts.filter(a => !a.isDeleted), [accounts]);

  const [fromMemberId, setFromMemberId] = useState('');
  const [toMemberId, setToMemberId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [alsoRecordAccountTx, setAlsoRecordAccountTx] = useState(false);
  const [linkedAccountId, setLinkedAccountId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const defaultFrom =
      initialFromMemberId && activeMembers.some(m => m.id === initialFromMemberId)
        ? initialFromMemberId
        : activeMembers[1]?.id || activeMembers[0]?.id || '';
    const defaultTo =
      initialToMemberId && activeMembers.some(m => m.id === initialToMemberId)
        ? initialToMemberId
        : activeMembers.find(m => m.id !== defaultFrom)?.id || activeMembers[0]?.id || '';

    setFromMemberId(defaultFrom);
    setToMemberId(defaultTo);
    setAmountStr(initialAmount && initialAmount > 0 ? initialAmount.toFixed(2) : '');
    setDateStr(new Date().toISOString().split('T')[0]);
    setNotes(isFr ? 'Règlement équilibre couple / famille' : 'Couple / family balance settlement');
    setAlsoRecordAccountTx(false);
    setLinkedAccountId(activeAccounts.find(a => a.isDefault)?.id || activeAccounts[0]?.id || '');
  }, [isOpen, initialFromMemberId, initialToMemberId, initialAmount]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const parsedAmount = parseFloat(amountStr.replace(',', '.'));
  const canSubmit = Boolean(
    fromMemberId &&
      toMemberId &&
      fromMemberId !== toMemberId &&
      Number.isFinite(parsedAmount) &&
      parsedAmount > 0
  );

  const handleSwap = () => {
    setFromMemberId(toMemberId);
    setToMemberId(fromMemberId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const fromM = activeMembers.find(m => m.id === fromMemberId);
    const toM = activeMembers.find(m => m.id === toMemberId);
    if (!fromM || !toM) return;

    const dateMs = new Date(dateStr + 'T12:00:00').getTime() || Date.now();

    addSharedSettlement(
      {
        fromMemberId: fromM.id,
        fromMemberName: fromM.name,
        toMemberId: toM.id,
        toMemberName: toM.name,
        amount: Math.round(parsedAmount * 100) / 100,
        date: dateMs,
        notes: notes.trim()
      },
      {
        linkedAccountId: alsoRecordAccountTx && linkedAccountId ? linkedAccountId : null
      }
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {isFr ? 'Enregistrer un Remboursement' : 'Record Settlement Payment'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isFr
                ? 'Solde ou réduit l’écart entre deux membres'
                : 'Clears or reduces the balance owed between members'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isFr ? 'Fermer' : 'Close'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* From -> To with Swap */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isFr ? 'Qui paie' : 'Paid by'}
              </label>
              <select
                value={fromMemberId}
                onChange={e => setFromMemberId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-teal-500"
              >
                {activeMembers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleSwap}
              title={isFr ? 'Inverser' : 'Swap'}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer mb-0.5"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isFr ? 'Qui reçoit' : 'Paid to'}
              </label>
              <select
                value={toMemberId}
                onChange={e => setToMemberId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-teal-500"
              >
                {activeMembers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {fromMemberId === toMemberId && fromMemberId !== '' && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {isFr
                ? 'Le payeur et le bénéficiaire doivent être deux personnes différentes.'
                : 'Payer and recipient must be different members.'}
            </p>
          )}

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isFr ? 'Montant' : 'Amount'} ({currency})
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                autoFocus
                placeholder="0.00"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full text-lg font-bold font-mono tabular-nums bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isFr ? 'Date' : 'Date'}
              </label>
              <input
                type="date"
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Optional account balance adjustment */}
          {activeAccounts.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoRecordAccountTx}
                  onChange={e => setAlsoRecordAccountTx(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-teal-600 dark:text-teal-500 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-teal-500 shrink-0"
                />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    {isFr
                      ? 'Déduire aussi d’un compte bancaire (exclu des budgets)'
                      : 'Also deduct from a bank account (excluded from budgets)'}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    {isFr
                      ? 'Met à jour le solde du compte sans gonfler vos dépenses mensuelles'
                      : 'Updates account balance without inflating monthly spending reports'}
                  </span>
                </div>
              </label>

              {alsoRecordAccountTx && (
                <div className="flex items-center gap-2 pt-1">
                  <Wallet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                  <select
                    value={linkedAccountId}
                    onChange={e => setLinkedAccountId(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    {activeAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currentBalance.toLocaleString()} {acc.currency || currency})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isFr ? 'Libellé / Note' : 'Notes'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isFr ? 'Ex: Virement fin de mois' : 'e.g. Monthly balance transfer'}
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 disabled:opacity-40 disabled:pointer-events-none text-white dark:text-slate-950 font-bold text-sm shadow-sm transition cursor-pointer"
            >
              <span>{isFr ? 'Valider le règlement' : 'Record Settlement'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
