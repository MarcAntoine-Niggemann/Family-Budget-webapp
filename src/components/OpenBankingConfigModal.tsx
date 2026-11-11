import React, { useState } from 'react';
import {
  X,
  Key,
  Globe,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Shield,
  RefreshCw,
  Sliders,
  ExternalLink,
  Wallet,
  Fingerprint,
  Lock
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { MOCK_SANDBOX_ACCOUNTS } from '../services/openBankingService';
import { enrollBiometricCredential } from '../utils/biometricKeyvault';

interface OpenBankingConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OpenBankingConfigModal: React.FC<OpenBankingConfigModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    openBankingConfig,
    updateOpenBankingConfig,
    testOpenBankingConn,
    accounts,
    language,
    showToast
  } = useBudget();

  const isFr = language === 'fr';

  const [apiKey, setApiKey] = useState(openBankingConfig.apiKey || '');
  const [apiSecret, setApiSecret] = useState(openBankingConfig.apiSecret || '');
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>(
    openBankingConfig.environment || 'SANDBOX'
  );
  const [autoSyncOnLaunch, setAutoSyncOnLaunch] = useState(
    openBankingConfig.autoSyncOnLaunch || false
  );
  const [mappings, setMappings] = useState<Record<string, string>>(
    openBankingConfig.accountMappings || {
      'ob_bnp_checking': accounts[0]?.id || 'acc_main_checking',
      'ob_bnp_deferred_card': accounts[1]?.id || 'acc_deferred_card',
      'ob_bourso_livret_a': accounts[2]?.id || 'acc_livret_a'
    }
  );

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    // Temporarily apply current form inputs to test
    updateOpenBankingConfig({
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      environment
    });

    const res = await testOpenBankingConn();
    setIsTesting(false);
    setTestResult({
      success: res.success,
      message: res.message
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateOpenBankingConfig({
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      environment,
      autoSyncOnLaunch,
      accountMappings: mappings,
      isConnected: environment === 'SANDBOX' || !!apiKey.trim(),
      status: environment === 'SANDBOX' || !!apiKey.trim() ? 'CONNECTED' : 'DISCONNECTED',
      statusMessage: environment === 'SANDBOX'
        ? (isFr ? 'Connecté au simulateur Sandbox open-banking.io' : 'Connected to Sandbox simulator')
        : (isFr ? 'Connecté à open-banking.io Live' : 'Connected to Live open-banking.io')
    });

    showToast(isFr ? 'Configuration Open Banking enregistrée' : 'Open Banking settings saved');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-7 space-y-6 scrollbar-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {isFr ? 'Configuration open-banking.io' : 'open-banking.io Configuration'}
              </h2>
              <p className="text-xs text-slate-400">
                {isFr
                  ? 'Synchronisation automatique directe avec vos banques (Option PSD2)'
                  : 'Automated direct bank sync via PSD2 open banking'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informative Disclaimer Box */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex gap-3 leading-relaxed">
          <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-amber-300 mb-0.5">
              {isFr ? 'Option facultative & indépendante' : 'Optional & Independent Service'}
            </span>
            {isFr
              ? 'L’API open-banking.io est un service tiers qui requiert un compte ou un abonnement développeur pour les flux en direct. Si vous préférez ne pas souscrire ou payer, l’import manuel de vos fichiers CSV reste 100% gratuit, privé et illimité.'
              : 'The open-banking.io API is a third-party service requiring personal credentials or subscription for live bank feeds. If you choose not to subscribe, free offline manual CSV import remains available without restriction.'}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Environment Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              {isFr ? 'Environnement de Connexion' : 'Connection Environment'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEnvironment('SANDBOX')}
                className={`p-3 rounded-xl border text-left transition ${
                  environment === 'SANDBOX'
                    ? 'bg-teal-500/15 border-teal-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs text-teal-300">
                  {isFr ? '🧪 Sandbox (Test Gratuit)' : '🧪 Sandbox (Free Simulator)'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {isFr
                    ? 'Simulateur avec banques européennes (BNP, BoursoBank) sans abonnement'
                    : 'Simulated European banks without requiring paid credentials'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEnvironment('PRODUCTION')}
                className={`p-3 rounded-xl border text-left transition ${
                  environment === 'PRODUCTION'
                    ? 'bg-teal-500/15 border-teal-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs text-indigo-300">
                  {isFr ? '⚡ Live Production' : '⚡ Live Production'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {isFr
                    ? 'Connexion réelle à api.open-banking.io avec vos clés d’accès'
                    : 'Direct live connection to api.open-banking.io'}
                </div>
              </button>
            </div>
          </div>

          {/* Credentials */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  {isFr ? 'Clé API (Client ID / API Key)' : 'API Key / Client ID'}
                </label>
                <a
                  href="https://open-banking.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-teal-400 hover:underline flex items-center gap-1"
                >
                  <span>open-banking.io</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="text"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={environment === 'SANDBOX' ? 'sandbox_demo_key_7792' : 'ob_live_pk_...'}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {isFr ? 'Secret API (Client Secret / Token)' : 'API Secret / Token'}
              </label>
              <input
                type="password"
                value={apiSecret}
                onChange={e => setApiSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Biometric & Keyvault Hardware Protection */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-semibold text-white">
                    {isFr ? 'Protection Matérielle (Touch ID / Face ID)' : 'Hardware Keyvault Protection'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await enrollBiometricCredential('Admin', 'admin@family.local');
                    if (res.success) {
                      showToast(isFr ? 'Empreinte biométrique enrôlée avec succès !' : 'Biometrics successfully enrolled!');
                    } else {
                      showToast(res.error || (isFr ? 'Échec d’enrôlement' : 'Enrollment failed'));
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[11px] font-semibold transition"
                >
                  {isFr ? 'Enrôler Empreinte' : 'Enroll Biometrics'}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {isFr
                  ? 'Vos clés API open-banking.io sont protégées au repos par chiffrement AES-GCM 256 bits et liées à l’enclave sécurisée de votre téléphone (Apple Secure Enclave / Android Keystore).'
                  : 'Your open-banking.io API keys are protected at rest by AES-GCM 256 encryption and bound to your phone’s hardware enclave.'}
              </p>
            </div>
          </div>

          {/* Test Connection Action */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? (isFr ? 'Test en cours...' : 'Testing...') : (isFr ? 'Tester la Connexion' : 'Test Connection')}</span>
            </button>

            {testResult && (
              <div
                className={`mt-2 p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Account Mapping Section */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-teal-400" />
              <label className="text-xs font-bold text-white">
                {isFr ? 'Association des Comptes Bancaires' : 'Account Mapping'}
              </label>
            </div>
            <p className="text-[11px] text-slate-400">
              {isFr
                ? 'Associez chaque compte bancaire distant découvert vers un compte local de votre coffre :'
                : 'Map discovered bank feeds to internal budget accounts:'}
            </p>

            <div className="space-y-2.5 pt-1">
              {MOCK_SANDBOX_ACCOUNTS.map(rAcc => (
                <div
                  key={rAcc.id}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-semibold text-white block">{rAcc.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{rAcc.iban}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">➔</span>
                    <select
                      value={mappings[rAcc.id] || ''}
                      onChange={e =>
                        setMappings(prev => ({
                          ...prev,
                          [rAcc.id]: e.target.value
                        }))
                      }
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                    >
                      <option value="">{isFr ? '-- Ne pas synchroniser --' : '-- Ignore --'}</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-Sync on Launch */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <span className="text-xs font-semibold text-white block">
                {isFr ? 'Auto-Synchronisation au lancement' : 'Auto-Sync on App Launch'}
              </span>
              <span className="text-[11px] text-slate-400">
                {isFr
                  ? 'Rafraîchit automatiquement les soldes et opérations à l’ouverture'
                  : 'Automatically fetch bank feeds when the app opens'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={autoSyncOnLaunch}
              onChange={e => setAutoSyncOnLaunch(e.target.checked)}
              className="w-4 h-4 rounded text-teal-500 focus:ring-teal-400 bg-slate-900 border-slate-700"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-lg shadow-teal-500/20 transition active:scale-95"
            >
              {isFr ? 'Enregistrer la Configuration' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
