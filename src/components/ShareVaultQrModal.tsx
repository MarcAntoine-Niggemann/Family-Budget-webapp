import React, { useEffect, useState } from 'react';
import { X, QrCode, Copy, Check, Users, Shield, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useBudget } from '../context/BudgetContext';

interface ShareVaultQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareVaultQrModal: React.FC<ShareVaultQrModalProps> = ({ isOpen, onClose }) => {
  const { config, language } = useBudget();
  const isFr = language === 'fr';

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const payload = JSON.stringify({
    vaultId: config.id || 'family_vault_primary',
    familyName: config.familyName || 'Family Budget Vault',
    projectId: config.projectId || 'gen-lang-client-0096915776',
    apiKey: config.apiKey || 'AIzaSyCgctVVs5NJYNaEguMQto0k2GLZfIgzf-Q',
    applicationId: config.applicationId || '1:181331993196:web:f7216223fd77449f96ee49',
    adminEmail: config.currentUserEmail || 'admin@family.local',
    mode: config.isAnonymous ? 'DEMO' : 'MANAGED'
  });

  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen, payload]);

  const handleCopy = () => {
    navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 text-center space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white text-left">
              {isFr ? 'Inviter un membre de la famille' : 'Invite a Family Member'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 text-left">
          {isFr
            ? 'Scannez ce QR Code avec l’appareil photo d’un iPhone ou d’un smartphone Android pour rejoindre instantanément ce Coffre Familial.'
            : 'Scan this QR code with an iPhone or Android phone camera to instantly connect to this Family Vault.'}
        </p>

        {/* Generated QR Code Canvas */}
        <div className="p-4 rounded-2xl bg-white mx-auto inline-block shadow-xl">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Family Vault QR Code" className="w-56 h-56 mx-auto rounded-lg" />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-slate-400 font-mono text-xs">
              Generating...
            </div>
          )}
        </div>

        <div className="text-xs text-slate-400 space-y-1">
          <div className="font-bold text-white">{config.familyName}</div>
          <div className="text-[11px] text-slate-500 font-mono">{config.projectId}</div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-teal-400" />}
            <span>{copied ? (isFr ? 'Copié !' : 'Copied!') : isFr ? 'Copier le code texte' : 'Copy code string'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
