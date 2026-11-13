import React, { useState, useEffect } from 'react';
import {
  X,
  Landmark,
  CreditCard,
  PiggyBank,
  Wallet,
  TrendingUp,
  Tag,
  Trash2,
  Check
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { AccountEntity, AccountType } from '../types';

interface AccountModalProps {
  isOpen: boolean;
  account: AccountEntity | null; // null = create mode, non-null = edit mode
  onClose: () => void;
}

const ACCOUNT_TYPES: {
  type: AccountType;
  labelFr: string;
  labelEn: string;
  defaultIcon: string;
  defaultColor: number;
  icon: React.ReactNode;
}[] = [
  {
    type: 'CHECKING',
    labelFr: 'Compte Courant',
    labelEn: 'Checking',
    defaultIcon: 'Landmark',
    defaultColor: 0xff0f766e,
    icon: <Landmark className="w-4 h-4" />
  },
  {
    type: 'DEFERRED_CARD',
    labelFr: 'Carte Débit Différé',
    labelEn: 'Deferred Card',
    defaultIcon: 'CreditCard',
    defaultColor: 0xff2563eb,
    icon: <CreditCard className="w-4 h-4" />
  },
  {
    type: 'SAVINGS',
    labelFr: 'Épargne',
    labelEn: 'Savings',
    defaultIcon: 'PiggyBank',
    defaultColor: 0xff10b981,
    icon: <PiggyBank className="w-4 h-4" />
  },
  {
    type: 'CASH',
    labelFr: 'Espèces',
    labelEn: 'Cash',
    defaultIcon: 'Wallet',
    defaultColor: 0xffd97706,
    icon: <Wallet className="w-4 h-4" />
  },
  {
    type: 'INVESTMENT',
    labelFr: 'Investissement',
    labelEn: 'Investment',
    defaultIcon: 'TrendingUp',
    defaultColor: 0xff7c3aed,
    icon: <TrendingUp className="w-4 h-4" />
  },
  {
    type: 'OTHER',
    labelFr: 'Autre',
    labelEn: 'Other',
    defaultIcon: 'Tag',
    defaultColor: 0xff475569,
    icon: <Tag className="w-4 h-4" />
  }
];

const COLOR_SWATCHES: { value: number; hex: string; label: string }[] = [
  { value: 0xff0f766e, hex: '#0f766e', label: 'Teal' },
  { value: 0xff2563eb, hex: '#2563eb', label: 'Blue' },
  { value: 0xff10b981, hex: '#10b981', label: 'Emerald' },
  { value: 0xff7c3aed, hex: '#7c3aed', label: 'Violet' },
  { value: 0xffd97706, hex: '#d97706', label: 'Amber' },
  { value: 0xffe11d48, hex: '#e11d48', label: 'Rose' },
  { value: 0xff0891b2, hex: '#0891b2', label: 'Cyan' },
  { value: 0xff475569, hex: '#475569', label: 'Slate' }
];

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, account, onClose }) => {
  const {
    accounts,
    transactions,
    addAccount,
    updateAccount,
    deleteAccount,
    language,
    currency
  } = useBudget();

  const isFr = language === 'fr';
  const isEditing = account !== null;

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('CHECKING');
  const [balanceStr, setBalanceStr] = useState('0');
  const [accCurrency, setAccCurrency] = useState(currency || '€');
  const [includeInLiquidForecast, setIncludeInLiquidForecast] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [color, setColor] = useState(0xff0f766e);
  const [closingDayStr, setClosingDayStr] = useState('25');
  const [settlementDayStr, setSettlementDayStr] = useState('30');
  const [linkedCheckingAccountId, setLinkedCheckingAccountId] = useState('');
  const [targetSavingsGoalStr, setTargetSavingsGoalStr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkingAccounts = accounts.filter(
    a => a.type === 'CHECKING' && a.id !== account?.id
  );

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setConfirmDelete(false);

    if (account) {
      setName(account.name);
      setType(account.type);
      setBalanceStr(String(account.currentBalance));
      setAccCurrency(account.currency || currency || '€');
      setIncludeInLiquidForecast(account.includeInLiquidForecast);
      setIsDefault(Boolean(account.isDefault));
      setColor(account.color || 0xff0f766e);
      setClosingDayStr(String(account.billingCycleClosingDay ?? 25));
      setSettlementDayStr(String(account.settlementDay ?? 30));
      setLinkedCheckingAccountId(
        account.linkedCheckingAccountId || checkingAccounts[0]?.id || ''
      );
      setTargetSavingsGoalStr(
        account.targetSavingsGoal != null ? String(account.targetSavingsGoal) : ''
      );
    } else {
      setName('');
      setType('CHECKING');
      setBalanceStr('0');
      setAccCurrency(currency || '€');
      setIncludeInLiquidForecast(true);
      setIsDefault(accounts.length === 0);
      setColor(0xff0f766e);
      setClosingDayStr('25');
      setSettlementDayStr('30');
      setLinkedCheckingAccountId(
        accounts.find(a => a.type === 'CHECKING')?.id || ''
      );
      setTargetSavingsGoalStr('');
    }
  }, [isOpen, account, currency]);

  if (!isOpen) return null;

  const handleTypeChange = (nextType: AccountType) => {
    setType(nextType);
    const meta = ACCOUNT_TYPES.find(t => t.type === nextType);
    if (!isEditing && meta) {
      setColor(meta.defaultColor);
    }
    if (!isEditing) {
      setIncludeInLiquidForecast(nextType === 'CHECKING' || nextType === 'CASH');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg(isFr ? 'Veuillez saisir un nom de compte.' : 'Please enter an account name.');
      return;
    }

    const parsedBalance = parseFloat(balanceStr.replace(',', '.'));
    if (isNaN(parsedBalance)) {
      setErrorMsg(isFr ? 'Le solde doit être un nombre valide.' : 'Balance must be a valid number.');
      return;
    }

    const meta = ACCOUNT_TYPES.find(t => t.type === type);
    const iconName = meta?.defaultIcon || 'Landmark';

    const closingDay =
      type === 'DEFERRED_CARD'
        ? Math.min(31, Math.max(1, parseInt(closingDayStr, 10) || 25))
        : null;
    const settlementDay =
      type === 'DEFERRED_CARD'
        ? Math.min(31, Math.max(1, parseInt(settlementDayStr, 10) || 30))
        : null;
    const linkedChecking =
      type === 'DEFERRED_CARD' ? linkedCheckingAccountId || null : null;

    const parsedGoal = parseFloat(targetSavingsGoalStr.replace(',', '.'));
    const targetSavingsGoal =
      (type === 'SAVINGS' || type === 'INVESTMENT') && !isNaN(parsedGoal) && parsedGoal > 0
        ? parsedGoal
        : null;

    const now = Date.now();

    if (account) {
      updateAccount({
        ...account,
        name: trimmedName,
        type,
        currentBalance: parsedBalance,
        currency: accCurrency.trim() || currency || '€',
        includeInLiquidForecast,
        isDefault,
        color,
        icon: iconName,
        billingCycleClosingDay: closingDay,
        settlementDay,
        linkedCheckingAccountId: linkedChecking,
        targetSavingsGoal,
        lastManualSyncTimestamp:
          account.currentBalance !== parsedBalance ? now : account.lastManualSyncTimestamp
      });
    } else {
      const slug = trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24);
      const id = `acc_${slug || 'account'}_${now.toString(36)}`;

      addAccount({
        id,
        name: trimmedName,
        type,
        currentBalance: parsedBalance,
        currency: accCurrency.trim() || currency || '€',
        includeInLiquidForecast,
        isDefault,
        color,
        icon: iconName,
        billingCycleClosingDay: closingDay,
        settlementDay,
        linkedCheckingAccountId: linkedChecking,
        targetSavingsGoal,
        lastManualSyncTimestamp: now
      });
    }

    onClose();
  };

  const handleDelete = () => {
    if (!account) return;
    if (accounts.length <= 1) {
      setErrorMsg(
        isFr
          ? 'Impossible de supprimer le dernier compte actif du coffre.'
          : 'Cannot delete the last remaining active account in the vault.'
      );
      setConfirmDelete(false);
      return;
    }
    deleteAccount(account.id);
    onClose();
  };

  const linkedTxCount = account
    ? transactions.filter(
        t => t.accountId === account.id || t.targetAccountId === account.id
      ).length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h2 className="text-lg font-bold text-white">
            {isEditing
              ? isFr
                ? 'Modifier le Compte'
                : 'Edit Account'
              : isFr
              ? 'Nouveau Compte'
              : 'New Account'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Account Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Nom du compte' : 'Account Name'}
            </label>
            <input
              type="text"
              required
              placeholder={isFr ? 'ex: Compte Courant BoursoBank' : 'e.g., Joint Checking Account'}
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          {/* Account Type Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              {isFr ? 'Type de compte' : 'Account Type'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map(item => {
                const active = type === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => handleTypeChange(item.type)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition ${
                      active
                        ? 'bg-teal-500/15 border-teal-500 text-teal-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {item.icon}
                    <span className="truncate">{isFr ? item.labelFr : item.labelEn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Balance & Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Solde actuel' : 'Current Balance'}
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={balanceStr}
                onChange={e => setBalanceStr(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Devise' : 'Currency'}
              </label>
              <select
                value={accCurrency}
                onChange={e => setAccCurrency(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm font-semibold text-white focus:outline-none focus:border-teal-500"
              >
                <option value="€">€ (EUR)</option>
                <option value="$">$ (USD)</option>
                <option value="£">£ (GBP)</option>
                <option value="CHF">CHF</option>
                <option value="CAD">CAD</option>
              </select>
            </div>
          </div>

          {/* Deferred Card Specific Settings */}
          {type === 'DEFERRED_CARD' && (
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-blue-300">
                {isFr ? 'Paramètres Carte à Débit Différé' : 'Deferred Card Cycle Settings'}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {isFr ? 'Jour d’arrêté (1–31)' : 'Closing Day (1–31)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={closingDayStr}
                    onChange={e => setClosingDayStr(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {isFr ? 'Jour de prélèvement (1–31)' : 'Settlement Day (1–31)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={settlementDayStr}
                    onChange={e => setSettlementDayStr(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {checkingAccounts.length > 0 && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {isFr ? 'Compte courant débité' : 'Linked Checking Account'}
                  </label>
                  <select
                    value={linkedCheckingAccountId}
                    onChange={e => setLinkedCheckingAccountId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="">{isFr ? '-- Aucun --' : '-- None --'}</option>
                    {checkingAccounts.map(ca => (
                      <option key={ca.id} value={ca.id}>
                        {ca.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Savings / Investment Goal */}
          {(type === 'SAVINGS' || type === 'INVESTMENT') && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                {isFr ? 'Objectif d’épargne (optionnel)' : 'Target Savings Goal (optional)'}
              </label>
              <input
                type="number"
                step="1"
                min={0}
                placeholder="15000"
                value={targetSavingsGoalStr}
                onChange={e => setTargetSavingsGoalStr(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
              />
            </div>
          )}

          {/* Color Swatch Picker */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              {isFr ? 'Couleur d’identification' : 'Badge Color'}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_SWATCHES.map(swatch => {
                const selected = color === swatch.value;
                return (
                  <button
                    key={swatch.value}
                    type="button"
                    title={swatch.label}
                    onClick={() => setColor(swatch.value)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                      selected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  >
                    {selected && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer">
              <div>
                <span className="text-xs font-semibold text-white block">
                  {isFr ? 'Inclure dans la trésorerie prévisionnelle' : 'Include in Liquid Cash Flow Forecast'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isFr
                    ? 'Intègre ce solde dans le calcul « Dépensable sans risque »'
                    : 'Includes this balance in Safe-to-Spend & forecast curves'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={includeInLiquidForecast}
                onChange={e => setIncludeInLiquidForecast(e.target.checked)}
                className="w-4 h-4 rounded text-teal-500 bg-slate-900 border-slate-700"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer">
              <div>
                <span className="text-xs font-semibold text-white block">
                  {isFr ? 'Compte par défaut' : 'Default Account'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isFr
                    ? 'Sélectionné en priorité pour les nouvelles saisies'
                    : 'Preselected for new transactions and imports'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={isDefault}
                onChange={e => setIsDefault(e.target.checked)}
                className="w-4 h-4 rounded text-teal-500 bg-slate-900 border-slate-700"
              />
            </label>
          </div>

          {/* Footer Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
            {isEditing ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition"
                  >
                    {isFr
                      ? `Confirmer (${linkedTxCount} op.)`
                      : `Confirm (${linkedTxCount} tx)`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    {isFr ? 'Non' : 'No'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isFr ? 'Supprimer' : 'Delete'}</span>
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-lg shadow-teal-500/20 transition active:scale-95"
              >
                {isEditing
                  ? isFr
                    ? 'Enregistrer'
                    : 'Save Changes'
                  : isFr
                  ? 'Créer le Compte'
                  : 'Create Account'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
