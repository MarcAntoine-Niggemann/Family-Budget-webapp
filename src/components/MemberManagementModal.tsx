import React, { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { FamilyMemberEntity, MemberRole } from '../types';

interface MemberManagementModalProps {
  isOpen: boolean;
  member: FamilyMemberEntity | null;
  onClose: () => void;
}

const AVATAR_COLORS = [
  0xff0f766e, // teal
  0xff2563eb, // blue
  0xff7c3aed, // violet
  0xffd97706, // amber
  0xffdc2626, // crimson
  0xff059669 // emerald
];

export const MemberManagementModal: React.FC<MemberManagementModalProps> = ({
  isOpen,
  member,
  onClose
}) => {
  const { addMember, updateMember, deleteMember, members, language, currency } = useBudget();
  const isFr = language === 'fr';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('EDITOR');
  const [incomeStr, setIncomeStr] = useState('');
  const [avatarColor, setAvatarColor] = useState<number>(AVATAR_COLORS[1]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmDelete(false);
    if (member) {
      setName(member.name);
      setEmail(member.email || '');
      setRole(member.role);
      setIncomeStr(member.monthlyIncome != null && member.monthlyIncome > 0 ? String(member.monthlyIncome) : '');
      setAvatarColor(member.avatarColor || AVATAR_COLORS[0]);
    } else {
      setName('');
      setEmail('');
      setRole('EDITOR');
      setIncomeStr('');
      setAvatarColor(AVATAR_COLORS[members.length % AVATAR_COLORS.length]);
    }
  }, [isOpen, member]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const canSave = Boolean(name.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    const parsedIncome = parseFloat(incomeStr.replace(',', '.'));
    const monthlyIncome = Number.isFinite(parsedIncome) && parsedIncome >= 0 ? Math.round(parsedIncome * 100) / 100 : 0;

    if (member) {
      updateMember({
        ...member,
        name: name.trim(),
        email: email.trim(),
        role,
        avatarColor,
        monthlyIncome
      });
    } else {
      addMember({
        name: name.trim(),
        email: email.trim(),
        role,
        avatarColor,
        monthlyIncome
      });
    }
    onClose();
  };

  const handleDelete = () => {
    if (!member) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteMember(member.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/75 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {member
              ? isFr
                ? 'Modifier le membre / partenaire'
                : 'Edit Member / Partner'
              : isFr
              ? 'Ajouter un membre / partenaire'
              : 'Add Member / Partner'}
          </h2>
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
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isFr ? 'Prénom / Nom' : 'Display Name'}
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder={isFr ? 'Ex: Sophie Martin' : 'e.g. Sophie Smith'}
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isFr ? 'Revenu net mensuel' : 'Monthly Net Income'} ({currency})
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="2500"
                value={incomeStr}
                onChange={e => setIncomeStr(e.target.value)}
                className="w-full font-mono tabular-nums bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {isFr
                  ? 'Utilisé pour les partages au prorata des revenus'
                  : 'Used for income-proportional splits'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {isFr ? 'Rôle' : 'Role'}
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as MemberRole)}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="EDITOR">EDITOR</option>
                <option value="MEMBER">MEMBER</option>
                <option value="VIEWER">VIEWER</option>
                <option value="CHILD">CHILD</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isFr ? 'Email (optionnel, pour sync Firestore)' : 'Email (optional, for Firestore RBAC)'}
            </label>
            <input
              type="email"
              placeholder="partner@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {isFr ? 'Couleur d’avatar' : 'Avatar Color'}
            </label>
            <div className="flex items-center gap-2">
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarColor(c)}
                  className={`w-7 h-7 rounded-full transition cursor-pointer ${
                    avatarColor === c ? 'ring-2 ring-offset-2 ring-teal-500 dark:ring-offset-slate-900 scale-110' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: `#${c.toString(16).slice(-6)}` }}
                  aria-label="Select color"
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            {member && members.length > 1 ? (
              <button
                type="button"
                onClick={handleDelete}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  confirmDelete
                    ? 'bg-rose-50 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/50 text-rose-700 dark:text-rose-200'
                    : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>{confirmDelete ? (isFr ? 'Confirmer' : 'Confirm') : (isFr ? 'Retirer' : 'Remove')}</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 disabled:opacity-40 text-white dark:text-slate-950 font-bold text-sm shadow-sm transition cursor-pointer"
              >
                {isFr ? 'Enregistrer' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
