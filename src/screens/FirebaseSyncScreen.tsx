import React, { useState } from 'react';
import {
  Shield,
  CloudCheck,
  CloudSync,
  Users,
  Lock,
  Unlock,
  RefreshCw,
  Key,
  Globe,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  QrCode
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { ShareVaultQrModal } from '../components/ShareVaultQrModal';

export const FirebaseSyncScreen: React.FC = () => {
  const {
    config,
    updateConfig,
    members,
    syncState,
    syncWithFirebaseNow,
    resetToMockData,
    language,
    setLanguage,
    navigateTo
  } = useBudget();

  const isFr = language === 'fr';

  const [familyName, setFamilyName] = useState(config.familyName || 'Family Vault');
  const [isLockEnabled, setIsLockEnabled] = useState(config.isBiometricLockEnabled || false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const handleSaveVault = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig({
      familyName: familyName.trim(),
      isBiometricLockEnabled: isLockEnabled
    });
  };

  const lastSyncDateStr = syncState.lastPushTimestamp
    ? new Date(syncState.lastPushTimestamp).toLocaleString(isFr ? 'fr-FR' : 'en-US')
    : isFr
    ? 'Jamais'
    : 'Never';

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          {isFr ? 'Configuration du Coffre & Synchronisation' : 'Vault Config & Cloud Sync'}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {isFr
            ? 'Gestion de la famille, des membres RBAC, du chiffrement et de la synchronisation hors-ligne'
            : 'Family members RBAC, offline-first transactional outbox, and security lock'}
        </p>
      </div>

      {/* Cloud & Outbox Sync Status Card */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center">
              {syncState.lastSyncStatus === 'SYNCING' ? (
                <CloudSync className="w-5 h-5 animate-spin" />
              ) : (
                <CloudCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-base text-white">
                {isFr ? 'Statut de Synchronisation du Coffre' : 'Vault Synchronization Status'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {syncState.lastSyncMessage || (isFr ? 'Toutes les données sont synchronisées.' : 'All local changes synchronized.')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
              title={isFr ? 'Partager le QR Code du Coffre' : 'Share Vault QR Code'}
            >
              <QrCode className="w-4 h-4 text-teal-400" />
              <span>{isFr ? 'Partager QR' : 'Share QR'}</span>
            </button>

            <button
              onClick={() => navigateTo('LOGIN')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
              title={isFr ? 'Changer de Coffre / Se Connecter' : 'Switch Vault / Login'}
            >
              <Key className="w-4 h-4 text-indigo-400" />
              <span>{isFr ? 'Changer Coffre' : 'Switch Vault'}</span>
            </button>

            <button
              onClick={syncWithFirebaseNow}
              disabled={syncState.lastSyncStatus === 'SYNCING'}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${syncState.lastSyncStatus === 'SYNCING' ? 'animate-spin' : ''}`}
              />
              <span>{isFr ? 'Synchroniser' : 'Sync Now'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs">
          <div>
            <span className="text-slate-500 block">{isFr ? 'Dernière synchro :' : 'Last Sync:'}</span>
            <span className="font-semibold text-slate-200 mt-0.5 block">{lastSyncDateStr}</span>
          </div>
          <div>
            <span className="text-slate-500 block">
              {isFr ? 'Modifications en attente :' : 'Outbox Queue:'}
            </span>
            <span className="font-semibold text-teal-400 mt-0.5 block">
              {syncState.pendingOutboxCount} {isFr ? 'opérations' : 'items'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">{isFr ? 'Mode de données :' : 'Storage Mode:'}</span>
            <span className="font-semibold text-indigo-300 mt-0.5 block">
              {config.isAnonymous ? 'Offline-First Local (Simulated Cloud)' : 'Cloud Live'}
            </span>
          </div>
        </div>
      </div>

      {/* Family Vault Identity & Security Settings */}
      <form
        onSubmit={handleSaveVault}
        className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-teal-400" />
          <h2 className="font-bold text-white text-base">
            {isFr ? 'Paramètres du Coffre Familial' : 'Vault Identity & Security Lock'}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Nom du Coffre Familial' : 'Family Vault Name'}
            </label>
            <input
              type="text"
              value={familyName}
              onChange={e => setFamilyName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isFr ? 'Utilisateur Actif' : 'Active User'}
            </label>
            <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs text-slate-200">
              <span className="font-semibold">{config.currentUserName}</span>
              <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold text-[10px]">
                {config.currentUserRole}
              </span>
            </div>
          </div>
        </div>

        {/* Security Lock Toggle */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              {isLockEnabled ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </div>
            <div>
              <span className="font-semibold text-xs text-white block">
                {isFr ? 'Verrouillage de sécurité du coffre' : 'Vault Security Lock'}
              </span>
              <span className="text-[11px] text-slate-400">
                {isFr
                  ? 'Protège l’accès aux soldes et transactions lors du lancement'
                  : 'Requires authentication before accessing balances'}
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={isLockEnabled}
            onChange={e => setIsLockEnabled(e.target.checked)}
            className="w-5 h-5 rounded text-teal-500 bg-slate-900 border-slate-700 cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition"
          >
            {isFr ? 'Mettre à jour le coffre' : 'Save Vault Settings'}
          </button>
        </div>
      </form>

      {/* Family Members & RBAC Roles */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-400" />
            <h2 className="font-bold text-white text-base">
              {isFr ? 'Membres de la Famille & Rôles RBAC' : 'Family Members & RBAC Roles'}
            </h2>
          </div>
          <span className="text-xs text-slate-400">{members.length} {isFr ? 'membres' : 'members'}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {members.map(m => (
            <div
              key={m.id}
              className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md"
                  style={{ backgroundColor: `#${m.avatarColor.toString(16).slice(-6)}` }}
                >
                  {m.name.charAt(0)}
                </div>
                <div>
                  <span className="font-bold text-white block">{m.name}</span>
                  <span className="text-[11px] text-slate-500">{m.email}</span>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 border border-slate-700 text-teal-300">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Demo Mock Data Reset & Language Switcher */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <h2 className="font-bold text-white text-base">
            {isFr ? 'Démonstration & Données de Test' : 'Demo Mode & Data Presets'}
          </h2>
        </div>
        <p className="text-xs text-slate-400">
          {isFr
            ? 'Vous pouvez basculer l’application en français ou en anglais et réinitialiser les comptes et les opérations avec le profil type de famille de 4 personnes (classes moyennes).'
            : 'Reset the complete dataset for a middle-class family of 4 with preloaded accounts, budgets, and transactions in English or French.'}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={() => {
              setLanguage('fr');
              resetToMockData('fr');
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            <Globe className="w-3.5 h-3.5 text-teal-400" />
            <span>Charger Démo Famille Martin (Français)</span>
          </button>

          <button
            onClick={() => {
              setLanguage('en');
              resetToMockData('en');
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            <Globe className="w-3.5 h-3.5 text-teal-400" />
            <span>Load Smith Family Demo (English)</span>
          </button>
        </div>
      </div>

      {/* Share QR Code Modal */}
      <ShareVaultQrModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
};
