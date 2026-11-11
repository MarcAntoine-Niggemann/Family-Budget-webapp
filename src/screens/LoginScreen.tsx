import React, { useState } from 'react';
import {
  Shield,
  QrCode,
  Key,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Globe,
  Sparkles,
  Smartphone,
  Lock,
  Cloud
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { QrCodeScannerModal } from '../components/QrCodeScannerModal';

interface LoginScreenProps {
  onSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess }) => {
  const { config, updateConfig, resetToMockData, language, setLanguage, showToast } = useBudget();
  const isFr = language === 'fr';

  const [activeTab, setActiveTab] = useState<'MANAGED' | 'BYOB' | 'DEMO'>('MANAGED');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Form states for BYOB / Managed
  const [familyName, setFamilyName] = useState(config.familyName || 'Family Vault');
  const [projectId, setProjectId] = useState(config.projectId || '');
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [applicationId, setApplicationId] = useState(config.applicationId || '');
  const [userEmail, setUserEmail] = useState(config.currentUserEmail || 'admin@family.local');
  const [userName, setUserName] = useState(config.currentUserName || 'Family Admin');
  const [vaultPin, setVaultPin] = useState('1234');

  // Handle scanned QR code
  const handleQrCodeScanned = (scannedString: string) => {
    try {
      const data = JSON.parse(scannedString);
      if (data.projectId) setProjectId(data.projectId);
      if (data.apiKey) setApiKey(data.apiKey);
      if (data.applicationId) setApplicationId(data.applicationId);
      if (data.familyName) setFamilyName(data.familyName);

      updateConfig({
        familyName: data.familyName || 'Family Vault',
        projectId: data.projectId || '',
        apiKey: data.apiKey || '',
        applicationId: data.applicationId || '',
        isConfigured: true,
        isFamilyCreated: true,
        isAnonymous: false,
        syncStatusMessage: isFr ? 'Coffre connecté via QR Code' : 'Vault connected via QR Code'
      });

      showToast(isFr ? 'Configuration du coffre importée avec succès !' : 'Vault configuration imported via QR Code!');
      onSuccess();
    } catch {
      // In case it's a simple project ID or string
      setProjectId(scannedString);
      showToast(isFr ? 'Code scanné' : 'Scanned code applied');
    }
  };

  const handleConnectManaged = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig({
      familyName: familyName.trim() || 'Family Budget Vault',
      projectId: 'gen-lang-client-0096915776',
      apiKey: 'AIzaSyCgctVVs5NJYNaEguMQto0k2GLZfIgzf-Q',
      applicationId: '1:181331993196:web:f7216223fd77449f96ee49',
      currentUserEmail: userEmail.trim(),
      currentUserName: userName.trim(),
      currentUserRole: 'ADMIN',
      isConfigured: true,
      isFamilyCreated: true,
      isGoogleAuthenticated: true,
      isAnonymous: false,
      syncStatusMessage: isFr ? 'Connecté au Coffre Cloud' : 'Connected to Managed Cloud Vault'
    });
    showToast(isFr ? 'Coffre Cloud configuré' : 'Managed Cloud Vault configured');
    onSuccess();
  };

  const handleConnectByob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId.trim() || !apiKey.trim()) {
      showToast(isFr ? 'Veuillez saisir votre Project ID et API Key' : 'Please provide Project ID and API Key');
      return;
    }

    updateConfig({
      familyName: familyName.trim() || 'Private Family Vault',
      projectId: projectId.trim(),
      apiKey: apiKey.trim(),
      applicationId: applicationId.trim(),
      currentUserEmail: userEmail.trim(),
      currentUserName: userName.trim(),
      currentUserRole: 'ADMIN',
      isConfigured: true,
      isFamilyCreated: true,
      isGoogleAuthenticated: true,
      isAnonymous: false,
      syncStatusMessage: isFr ? 'Connecté au Firebase Privé' : 'Connected to Private Firebase Vault'
    });
    showToast(isFr ? 'Coffre Privé configuré' : 'Private Firebase Vault configured');
    onSuccess();
  };

  const handleQuickDemo = (lang: 'fr' | 'en') => {
    setLanguage(lang);
    resetToMockData(lang);
    updateConfig({
      isAnonymous: true,
      isConfigured: true,
      isFamilyCreated: true
    });
    showToast(lang === 'fr' ? 'Accès Démo Activé' : 'Demo Mode Activated');
    onSuccess();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header & Logo */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-teal-500 to-emerald-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-teal-500/20">
              <Shield className="w-7 h-7 text-slate-950" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">Family Budget Vault</h1>
              <p className="text-xs text-slate-400">
                {isFr ? 'Connexion & Initialisation du Coffre' : 'Vault Setup & Onboarding'}
              </p>
            </div>
          </div>

          {/* Language Switch */}
          <button
            onClick={() => setLanguage(isFr ? 'en' : 'fr')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition"
          >
            <Globe className="w-3.5 h-3.5 text-teal-400" />
            <span>{language.toUpperCase()}</span>
          </button>
        </div>

        {/* Scan QR Shortcut Button */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-teal-500/10 to-indigo-500/10 border border-teal-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-xs text-white block">
                {isFr ? 'Rejoindre une Famille existante' : 'Join an Existing Family Vault'}
              </span>
              <span className="text-[11px] text-slate-400">
                {isFr
                  ? 'Scannez le QR Code affiché sur le téléphone d’un autre membre'
                  : 'Scan the QR Code from another member’s phone or device'}
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsScannerOpen(true)}
            className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition active:scale-95 shrink-0"
          >
            {isFr ? 'Scanner QR Code' : 'Scan QR Code'}
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-3 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('MANAGED')}
            className={`py-2 rounded-lg transition ${
              activeTab === 'MANAGED'
                ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isFr ? 'Coffre Cloud' : 'Managed Cloud'}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('BYOB')}
            className={`py-2 rounded-lg transition ${
              activeTab === 'BYOB'
                ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isFr ? 'Firebase Privé (BYOB)' : 'Private BYOB'}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DEMO')}
            className={`py-2 rounded-lg transition ${
              activeTab === 'DEMO'
                ? 'bg-teal-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isFr ? 'Mode Démo' : 'Demo Mode'}
          </button>
        </div>

        {/* TAB 1: MANAGED CLOUD */}
        {activeTab === 'MANAGED' && (
          <form onSubmit={handleConnectManaged} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {isFr ? 'Nom du Coffre de Famille' : 'Family Vault Name'}
                </label>
                <input
                  type="text"
                  required
                  value={familyName}
                  onChange={e => setFamilyName(e.target.value)}
                  placeholder="Ex: Famille Martin"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Votre Nom (Admin)' : 'Your Name (Admin)'}
                  </label>
                  <input
                    type="text"
                    required
                    value={userName}
                    onChange={e => setUserName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Adresse Email' : 'Email Address'}
                  </label>
                  <input
                    type="email"
                    required
                    value={userEmail}
                    onChange={e => setUserEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  {isFr ? 'Code PIN de Sécurité (Chiffrement Local)' : 'Security PIN (Local Encryption)'}
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={vaultPin}
                  onChange={e => setVaultPin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <span>{isFr ? 'Ouvrir mon Coffre Cloud' : 'Open Managed Cloud Vault'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* TAB 2: SELF-HOSTED (BYOB) */}
        {activeTab === 'BYOB' && (
          <form onSubmit={handleConnectByob} className="space-y-4">
            <p className="text-xs text-slate-400">
              {isFr
                ? 'Connectez votre propre projet Google Cloud / Firebase avec souveraineté complète des données.'
                : 'Connect your own Google Cloud / Firebase project for 100% private data ownership.'}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Firebase Project ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="my-family-budget-project"
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Firebase Web API Key
                </label>
                <input
                  type="password"
                  required
                  placeholder="AIzaSy..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Application ID (optional)
                  </label>
                  <input
                    type="text"
                    value={applicationId}
                    onChange={e => setApplicationId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    {isFr ? 'Votre Email' : 'Admin Email'}
                  </label>
                  <input
                    type="email"
                    required
                    value={userEmail}
                    onChange={e => setUserEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <span>{isFr ? 'Connecter le Firebase Privé' : 'Connect Private Firebase'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* TAB 3: DEMO ACCESS */}
        {activeTab === 'DEMO' && (
          <div className="space-y-4 text-center">
            <p className="text-xs text-slate-400">
              {isFr
                ? 'Accès immédiat sans configuration : charge un foyer type de 4 personnes (classes moyennes) avec comptes courants, carte à débit différé, livrets d’épargne, budgets et historique complet.'
                : 'Instant access without setup: preloads a middle-class family of 4 with checking accounts, deferred credit card, high-yield savings, budgets, and transactions.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleQuickDemo('fr')}
                className="p-4 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left space-y-1 transition group"
              >
                <div className="text-xs font-bold text-teal-400 group-hover:text-teal-300">
                  🇫🇷 Famille Martin (Français)
                </div>
                <div className="text-[11px] text-slate-400">
                  Compte Courant, Carte Différé, Livret A, LDDS, Salaires & Loyer
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('en')}
                className="p-4 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left space-y-1 transition group"
              >
                <div className="text-xs font-bold text-teal-400 group-hover:text-teal-300">
                  🇬🇧 Smith Family (English)
                </div>
                <div className="text-[11px] text-slate-400">
                  Family Checking, Deferred Visa, Savings Fund, Salaries & Mortgage
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QR Scanner Modal */}
      <QrCodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanned={handleQrCodeScanned}
      />
    </div>
  );
};
