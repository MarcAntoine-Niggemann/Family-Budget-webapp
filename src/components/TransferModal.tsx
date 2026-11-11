import React, { useState } from 'react';
import { X, ArrowRightLeft, Wallet } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({ isOpen, onClose }) => {
  const { accounts, transferBetweenAccounts, language, currency } = useBudget();
  const isFr = language === 'fr';

  if (!isOpen) return null;

  const [sourceAccId, setSourceAccId] = useState(accounts[0]?.id || 'acc_main_checking');
  const [targetAccId, setTargetAccId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const [amountStr, setAmountStr] = useState('');
  const [transferType, setTransferType] = useState<
    'TO_SAVINGS' | 'FROM_SAVINGS' | 'CARD_SETTLEMENT' | 'GENERAL_TRANSFER'
  >('TO_SAVINGS');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(val) || val <= 0 || sourceAccId === targetAccId) return;

    transferBetweenAccounts(sourceAccId, targetAccId, val, notes, transferType);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100">
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
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
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
                setTransferType(e.target.value as 'TO_SAVINGS' | 'FROM_SAVINGS' | 'CARD_SETTLEMENT' | 'GENERAL_TRANSFER')
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

          {/* Amount */}
          <div>
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
              className="w-full text-2xl font-bold bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          {/* Source Account */}
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
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currentBalance} {currency})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Account */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Compte destinataire (Crédité)' : 'Target Account (Credited)'}
              </label>
              <select
                value={targetAccId}
                onChange={e => setTargetAccId(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition"
              >
                {accounts
                  .filter(a => a.id !== sourceAccId)
                  .map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currentBalance} {currency})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Mémo (optionnel)' : 'Memo (optional)'}
            </label>
            <input
              type="text"
              placeholder={isFr ? 'Ex: Épargne vacances, Débit carte fin de mois' : 'e.g. Monthly vacation savings'}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95"
            >
              {isFr ? 'Exécuter le virement' : 'Execute Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
