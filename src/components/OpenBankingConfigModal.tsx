import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  ExternalLink,
  Wallet,
  ShieldCheck,
  Unplug
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { OpenBankingAccountDto } from '../types';
import {
  DEFAULT_OPEN_BANKING_CONFIG,
  validateOpenBankingProxyUrl
} from '../services/openBankingService';

interface OpenBankingConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const buildSignature = (env: string, key: string, secret: string, proxyUrl: string) =>
  `${env}::${key.trim()}::${secret.trim()}::${proxyUrl.trim().replace(/\/+$/, '')}`;

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
  const [proxyUrl, setProxyUrl] = useState(openBankingConfig.proxyUrl || '');
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>(
    openBankingConfig.environment || 'PRODUCTION'
  );
  const [autoSyncOnLaunch, setAutoSyncOnLaunch] = useState(
    openBankingConfig.autoSyncOnLaunch || false
  );
  const [discoveredAccounts, setDiscoveredAccounts] = useState<OpenBankingAccountDto[]>(
    openBankingConfig.isConnected ? (openBankingConfig.discoveredAccounts || []) : []
  );
  const [mappings, setMappings] = useState<Record<string, string>>(
    openBankingConfig.isConnected ? (openBankingConfig.accountMappings || {}) : {}
  );
  const [verifiedSignature, setVerifiedSignature] = useState<string | null>(
    openBankingConfig.isConnected
      ? buildSignature(
          openBankingConfig.environment || 'PRODUCTION',
          openBankingConfig.apiKey || '',
          openBankingConfig.apiSecret || '',
          openBankingConfig.proxyUrl || ''
        )
      : null
  );

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const env = openBankingConfig.environment || 'PRODUCTION';
    const key = openBankingConfig.apiKey || '';
    const secret = openBankingConfig.apiSecret || '';
    const proxy = openBankingConfig.proxyUrl || '';
    setApiKey(key);
    setApiSecret(secret);
    setProxyUrl(proxy);
    setEnvironment(env);
    setAutoSyncOnLaunch(openBankingConfig.autoSyncOnLaunch || false);
    setDiscoveredAccounts(
      openBankingConfig.isConnected ? (openBankingConfig.discoveredAccounts || []) : []
    );
    setMappings(
      openBankingConfig.isConnected ? (openBankingConfig.accountMappings || {}) : {}
    );
    setVerifiedSignature(
      openBankingConfig.isConnected ? buildSignature(env, key, secret, proxy) : null
    );
    setTestResult(null);
  }, [isOpen, openBankingConfig]);

  if (!isOpen) return null;

  const currentSignature = buildSignature(environment, apiKey, apiSecret, proxyUrl);

  const handleEnvironmentChange = (nextEnv: 'SANDBOX' | 'PRODUCTION') => {
    setEnvironment(nextEnv);
    setTestResult(null);
    if (buildSignature(nextEnv, apiKey, apiSecret, proxyUrl) !== verifiedSignature) {
      setDiscoveredAccounts([]);
    }
  };

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    setTestResult(null);
    if (buildSignature(environment, val, apiSecret, proxyUrl) !== verifiedSignature) {
      setDiscoveredAccounts([]);
    }
  };

  const handleApiSecretChange = (val: string) => {
    setApiSecret(val);
    setTestResult(null);
    if (buildSignature(environment, apiKey, val, proxyUrl) !== verifiedSignature) {
      setDiscoveredAccounts([]);
    }
  };

  const handleProxyUrlChange = (val: string) => {
    setProxyUrl(val);
    setTestResult(null);
    if (buildSignature(environment, apiKey, apiSecret, val) !== verifiedSignature) {
      setDiscoveredAccounts([]);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const trimmedKey = apiKey.trim();
    const trimmedSecret = apiSecret.trim();
    const trimmedProxy = proxyUrl.trim().replace(/\/+$/, '');

    const res = await testOpenBankingConn({
      apiKey: trimmedKey,
      apiSecret: trimmedSecret,
      proxyUrl: trimmedProxy,
      environment
    });

    setIsTesting(false);
    setTestResult({
      success: res.success,
      message: res.message
    });

    if (res.success) {
      setDiscoveredAccounts(res.accounts);
      setVerifiedSignature(buildSignature(environment, trimmedKey, trimmedSecret, trimmedProxy));
      // Keep only mappings relevant to discovered accounts
      setMappings(prev => {
        const next: Record<string, string> = {};
        res.accounts.forEach(acc => {
          if (prev[acc.id]) next[acc.id] = prev[acc.id];
        });
        return next;
      });
    } else {
      setDiscoveredAccounts([]);
      setVerifiedSignature(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedKey = apiKey.trim();
    const trimmedSecret = apiSecret.trim();
    const trimmedProxy = proxyUrl.trim().replace(/\/+$/, '');

    if (environment === 'PRODUCTION') {
      const endpointCheck = validateOpenBankingProxyUrl(trimmedProxy);
      if (!endpointCheck.valid) {
        setTestResult({
          success: false,
          message: endpointCheck.error || (isFr ? 'URL Open Banking HTTPS invalide.' : 'Invalid HTTPS Open Banking URL.')
        });
        return;
      }
      if (!trimmedKey || (!endpointCheck.isCustomProxy && !trimmedSecret)) {
        setTestResult({
          success: false,
          message: isFr
            ? 'Veuillez saisir votre API Key et API Secret pour l’environnement Live Production.'
            : 'Please enter both API Key and API Secret for Live Production.'
        });
        return;
      }
    }

    let accountsToSave = discoveredAccounts;

    // Verify connection if credentials or environment have changed since last verification
    if (verifiedSignature !== currentSignature) {
      setIsSaving(true);
      setTestResult(null);
      const res = await testOpenBankingConn({
        apiKey: trimmedKey,
        apiSecret: trimmedSecret,
        proxyUrl: trimmedProxy,
        environment
      });
      setIsSaving(false);

      if (!res.success) {
        setTestResult({ success: false, message: res.message });
        setDiscoveredAccounts([]);
        setVerifiedSignature(null);
        return;
      }

      accountsToSave = res.accounts;
      setDiscoveredAccounts(res.accounts);
      setVerifiedSignature(currentSignature);
      setTestResult({ success: true, message: res.message });
    }

    const filteredMappings: Record<string, string> = {};
    accountsToSave.forEach(acc => {
      if (mappings[acc.id]) {
        filteredMappings[acc.id] = mappings[acc.id];
      }
    });

    updateOpenBankingConfig({
      apiKey: trimmedKey,
      apiSecret: trimmedSecret,
      proxyUrl: trimmedProxy,
      environment,
      autoSyncOnLaunch,
      discoveredAccounts: accountsToSave,
      accountMappings: filteredMappings,
      isConnected: true,
      status: 'CONNECTED',
      statusMessage:
        environment === 'SANDBOX'
          ? isFr
            ? 'Connecté au simulateur Sandbox open-banking.io'
            : 'Connected to Sandbox simulator'
          : trimmedProxy
            ? isFr
              ? 'Connecté via proxy HTTPS Open Banking'
              : 'Connected via HTTPS Open Banking proxy'
            : isFr
              ? 'Connecté à open-banking.io (Live Production)'
              : 'Connected to open-banking.io (Live Production)'
    });

    showToast(isFr ? 'Configuration Open Banking enregistrée' : 'Open Banking settings saved');
    onClose();
  };

  const handleDisconnect = () => {
    updateOpenBankingConfig({
      ...DEFAULT_OPEN_BANKING_CONFIG,
      environment
    });
    setApiKey('');
    setApiSecret('');
    setProxyUrl('');
    setDiscoveredAccounts([]);
    setMappings({});
    setVerifiedSignature(null);
    setTestResult(null);
    showToast(isFr ? 'Service Open Banking déconnecté' : 'Open Banking service disconnected');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-6 scrollbar-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-500/20 text-teal-600 dark:text-teal-300 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                {isFr ? 'Configuration open-banking.io' : 'open-banking.io Configuration'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isFr
                  ? 'Synchronisation automatique directe via open-banking.io ou simulateur Sandbox'
                  : 'Automated bank sync directly via open-banking.io or Sandbox simulator'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informative Disclaimer Box */}
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex gap-3 leading-relaxed">
          <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-amber-800 dark:text-amber-300 mb-0.5">
              {isFr ? 'Option facultative — Chiffrement local du coffre' : 'Optional Service — Local Vault Encrypted'}
            </span>
            {isFr
              ? 'Cet agrégateur est totalement facultatif : l’import CSV reste 100% gratuit. Si vous connectez open-banking.io, vos clés API Key et API Secret sont chiffrées en AES-256-GCM dans votre cache local (et effacées à la déconnexion), sans proxy obligatoire.'
              : 'This aggregator is completely optional: CSV import remains 100% free. When connecting open-banking.io directly, your API Key and API Secret are encrypted with AES-256-GCM in your local vault cache and cleared on logout—no backend proxy required.'}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Environment Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {isFr ? 'Environnement de Connexion' : 'Connection Environment'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleEnvironmentChange('SANDBOX')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                  environment === 'SANDBOX'
                    ? 'bg-teal-50 dark:bg-teal-500/15 border-teal-500 text-slate-900 dark:text-white shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs text-teal-700 dark:text-teal-300">
                  {isFr ? 'Sandbox (Test Gratuit)' : 'Sandbox (Free Simulator)'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {isFr
                    ? 'Simulateur local avec banques européennes (BNP, BoursoBank)'
                    : 'Local simulated European banks without live API keys'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleEnvironmentChange('PRODUCTION')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                  environment === 'PRODUCTION'
                    ? 'bg-teal-50 dark:bg-teal-500/15 border-teal-500 text-slate-900 dark:text-white shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs text-indigo-700 dark:text-indigo-300">
                  {isFr ? 'Live Production (Clés Réelles)' : 'Live Production (Direct API)'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {isFr
                    ? 'Connexion directe à api.open-banking.io (proxy optionnel)'
                    : 'Direct connection to api.open-banking.io (proxy optional)'}
                </div>
              </button>
            </div>
          </div>

          {/* Credentials */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isFr ? 'Clé API (Client ID)' : 'API Key (Client ID)'}
                </label>
                <a
                  href="https://open-banking.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
                >
                  <span>open-banking.io</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={e => handleApiKeyChange(e.target.value)}
                placeholder={environment === 'SANDBOX' ? 'sandbox_demo_key_7792' : 'ob_live_key_...'}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {isFr ? 'Secret API (Client Secret)' : 'API Secret (Client Secret)'}
              </label>
              <input
                type="password"
                value={apiSecret}
                onChange={e => handleApiSecretChange(e.target.value)}
                placeholder={environment === 'SANDBOX' ? 'sandbox_secret_••••••••' : 'ob_live_secret_...'}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            {environment === 'PRODUCTION' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isFr
                    ? 'URL Proxy HTTPS personnalisée (optionnel)'
                    : 'Custom HTTPS Proxy URL (Optional)'}
                </label>
                <input
                  type="url"
                  value={proxyUrl}
                  onChange={e => handleProxyUrlChange(e.target.value)}
                  placeholder="https://api.open-banking.io (laisser vide par défaut)"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            )}

            {/* Vault AES-256-GCM Storage Security Notice */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-semibold text-slate-900 dark:text-white">
                  {isFr ? 'Protection locale AES-256-GCM du coffre' : 'Vault AES-256-GCM Local Protection'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {isFr
                  ? 'Votre API Key, votre API Secret et les associations de comptes sont chiffrés dans le cache local par la clé AES-256-GCM de votre coffre (WebAuthn PRF / PBKDF2 600k), jamais stockés en clair, et effacés à la déconnexion.'
                  : 'Your API Key, API Secret, and account mappings are encrypted at rest inside your local AES-256-GCM vault cache (WebAuthn PRF / PBKDF2 600k), never stored in plaintext, and wiped on logout.'}
              </p>
            </div>
          </div>

          {/* Test Connection Action */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? (isFr ? 'Test en cours...' : 'Testing...') : (isFr ? 'Tester la Connexion' : 'Test Connection')}</span>
            </button>

            {testResult && (
              <div
                className={`mt-2 p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Account Mapping Section */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <label className="text-xs font-bold text-slate-900 dark:text-white">
                {isFr ? 'Association des Comptes Bancaires' : 'Account Mapping'}
              </label>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isFr
                ? 'Associez chaque compte bancaire distant découvert vers un compte local de votre coffre :'
                : 'Map discovered bank feeds from your connected service to internal budget accounts:'}
            </p>

            {discoveredAccounts.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-200 dark:border-slate-800 text-center text-[11px] text-slate-500 dark:text-slate-400">
                {testResult?.success
                  ? isFr
                    ? 'Connexion établie, mais aucun compte bancaire n’a été retourné par ce service.'
                    : 'Connected, but no bank accounts were returned by this service.'
                  : isFr
                    ? 'Configurez vos identifiants puis cliquez sur « Tester la Connexion » pour afficher les comptes bancaires de votre service connecté.'
                    : 'Configure your credentials and click "Test Connection" to load bank accounts from your connected service.'}
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                {discoveredAccounts.map(rAcc => (
                  <div
                    key={rAcc.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-white block">{rAcc.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{rAcc.iban || rAcc.institution}</span>
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
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 focus:outline-none focus:border-teal-500"
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
            )}
          </div>

          {/* Auto-Sync on Launch */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-xs font-semibold text-slate-900 dark:text-white block">
                {isFr ? 'Auto-Synchronisation au lancement' : 'Auto-Sync on App Launch'}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {isFr
                  ? 'Rafraîchit automatiquement les soldes et opérations à l’ouverture'
                  : 'Automatically fetch bank feeds when the app opens'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={autoSyncOnLaunch}
              onChange={e => setAutoSyncOnLaunch(e.target.checked)}
              className="w-4 h-4 rounded text-teal-600 dark:text-teal-500 focus:ring-teal-400 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div>
              {openBankingConfig.isConnected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold transition cursor-pointer"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  <span>{isFr ? 'Déconnecter' : 'Disconnect'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isTesting || isSaving}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 text-xs font-bold shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSaving
                  ? isFr
                    ? 'Vérification...'
                    : 'Connecting...'
                  : isFr
                    ? 'Enregistrer et Connecter'
                    : 'Save & Connect'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
