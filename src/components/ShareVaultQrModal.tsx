import React, { useEffect, useState } from 'react';
import { X, QrCode, Copy, Check, Users, Shield, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useBudget } from '../context/BudgetContext';

interface ShareVaultQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareVaultQrModal: React.FC<ShareVaultQrModalProps> = ({ isOpen, onClose }) => {
  const { sessionMode, config, language } = useBudget();
  const isFr = language === 'fr';
  const isAuthorizedAdmin = sessionMode === 'FIRESTORE' && config.currentUserRole === 'ADMIN' && Boolean(config.projectId);

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const payload = JSON.stringify({
    vaultId: config.id || 'family_vault_primary',
    familyName: config.familyName || 'Family Budget Vault',
    projectId: config.projectId || '',
    apiKey: config.apiKey || '',
    applicationId: config.applicationId || '',
    mode: 'BYOB'
  });

  useEffect(() => {
    if (isOpen && isAuthorizedAdmin) {
      QRCode.toDataURL(payload, {
        width: 320,
        margin: 2,
        color: {
          dark: '#04101e',
          light: '#ffffff'
        }
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('Error generating QR code:', err));
    }
  }, [isOpen, isAuthorizedAdmin, payload]);

  const handleCopy = () => {
    navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !isAuthorizedAdmin) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100 text-center space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white text-left">
              {isFr ? 'Inviter un membre de la famille' : 'Invite a Family Member'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 text-left">
          {isFr
            ? 'Scannez ce QR Code avec l’appareil photo d’un iPhone ou d’un smartphone Android pour rejoindre ce Coffre Familial.'
            : 'Scan this QR code with an iPhone or Android phone camera to connect to this Family Vault.'}
        </p>

        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-[11px] text-left leading-relaxed">
          {isFr
            ? 'Rappel RBAC : ajoutez d’abord l’adresse e-mail Google vérifiée du membre dans « Membres de la Famille & Rôles RBAC » et synchronisez avant qu’il ne scanne ce code.'
            : 'RBAC Reminder: add the invited member’s verified Google email in "Family Members & RBAC Roles" and sync before they scan this code.'}
        </div>

        {/* Generated QR Code Canvas */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 dark:border-transparent mx-auto inline-block shadow-lg dark:shadow-xl">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Family Vault QR Code" className="w-56 h-56 mx-auto rounded-lg" />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-slate-400 font-mono text-xs">
              Generating...
            </div>
          )}
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div className="font-bold text-slate-900 dark:text-white">{config.familyName}</div>
          <div className="text-[11px] text-slate-500 font-mono">{config.projectId}</div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
            <span>{copied ? (isFr ? 'Copié !' : 'Copied!') : isFr ? 'Copier le code texte' : 'Copy code string'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
