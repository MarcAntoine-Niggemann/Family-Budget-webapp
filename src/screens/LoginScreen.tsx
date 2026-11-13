import React, { useEffect, useRef, useState } from 'react';
import {
  Shield,
  QrCode,
  Globe,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Fingerprint,
  SlidersHorizontal,
  Trash2,
  Play,
  CheckCircle2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { QrCodeScannerModal } from '../components/QrCodeScannerModal';
import { checkBiometricSupport, BiometricStatus } from '../utils/biometricKeyvault';
import { BYOB_FIRESTORE_RULES } from './FirebaseSyncScreen';

export const LoginScreen: React.FC = () => {
  const {
    savedByobConfig,
    authInitialized,
    firebaseUser,
    startDemoMode,
    connectAndSyncByob,
    unlockSavedByobWithBiometrics,
    loginSavedByobWithGoogle,
    forgetByobConfig,
    language,
    setLanguage,
    showToast
  } = useBudget();

  const isFr = language === 'fr';

  // If user already configured BYOB Firestore, show the Fingerprint Unlock view by default
  const [viewMode, setViewMode] = useState<'BIOMETRIC_UNLOCK' | 'SETUP'>(
    savedByobConfig ? 'BIOMETRIC_UNLOCK' : 'SETUP'
  );
  const [setupTab, setSetupTab] = useState<'BYOB' | 'DEMO'>('BYOB');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // BYOB form fields
  const [familyName, setFamilyName] = useState(savedByobConfig?.familyName || 'Private Family Vault');
  const [projectId, setProjectId] = useState(savedByobConfig?.projectId || '');
  const [apiKey, setApiKey] = useState(savedByobConfig?.apiKey || '');
  const [applicationId, setApplicationId] = useState(savedByobConfig?.applicationId || '');

  // Status / Feedback states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>({
    isSupported: false,
    isPlatformAvailable: false,
    hasEnrolledCredential: false
  });
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);

  const autoPromptAttemptedRef = useRef(false);

  // Sync viewMode if savedByobConfig changes (e.g., forgotten or loaded)
  useEffect(() => {
    if (!savedByobConfig) {
      setViewMode('SETUP');
      setProjectId('');
      setApiKey('');
      setApplicationId('');
      setFamilyName('Private Family Vault');
      setBiometricVerified(false);
      autoPromptAttemptedRef.current = false;
    } else {
      setProjectId(savedByobConfig.projectId);
      setApiKey(savedByobConfig.apiKey);
      setApplicationId(savedByobConfig.applicationId || '');
      setFamilyName(savedByobConfig.familyName || 'Private Family Vault');
    }
  }, [savedByobConfig]);

  // Check hardware biometric availability & auto-prompt directly when BYOB is already configured
  useEffect(() => {
    let active = true;

    const initBiometrics = async () => {
      const status = await checkBiometricSupport();
      if (!active) return;
      setBiometricStatus(status);

      if (
        savedByobConfig &&
        viewMode === 'BIOMETRIC_UNLOCK' &&
        authInitialized &&
        status.isPlatformAvailable &&
        status.hasEnrolledCredential &&
        !autoPromptAttemptedRef.current
      ) {
        autoPromptAttemptedRef.current = true;
        setIsLoading(true);
        setErrorMsg(null);
        try {
          const res = await unlockSavedByobWithBiometrics();
          if (!active) return;
          if (res.biometricVerified) {
            setBiometricVerified(true);
          }
          if (!res.success && res.error) {
            if (res.needsGoogleAuth) {
              setNoticeMsg(res.error);
            } else {
              setErrorMsg(res.error);
            }
          }
        } finally {
          if (active) setIsLoading(false);
        }
      }
    };

    initBiometrics();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedByobConfig, viewMode, authInitialized]);

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopyHostname = () => {
    if (!currentHostname) return;
    navigator.clipboard.writeText(currentHostname);
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2000);
  };

  const handleCopyRules = () => {
    navigator.clipboard.writeText(BYOB_FIRESTORE_RULES);
    setCopiedRules(true);
    showToast(isFr ? 'Règles Firestore copiées' : 'Firestore rules copied');
    setTimeout(() => setCopiedRules(false), 2000);
  };

  const handleFingerprintUnlock = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setIsLoading(true);
    try {
      const res = await unlockSavedByobWithBiometrics();
      if (res.biometricVerified) {
        setBiometricVerified(true);
      }
      if (res.redirecting) {
        setNoticeMsg(res.error || (isFr ? 'Redirection Google en cours...' : 'Redirecting to Google...'));
        return;
      }
      if (!res.success && res.error) {
        if (res.needsGoogleAuth) {
          setNoticeMsg(res.error);
        } else {
          setErrorMsg(res.error);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavedByobGoogleSignIn = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setIsLoading(true);
    try {
      const res = await loginSavedByobWithGoogle();
      if (res.redirecting) {
        setNoticeMsg(res.error || (isFr ? 'Redirection Google en cours...' : 'Redirecting to Google...'));
        return;
      }
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectByob = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);

    if (!projectId.trim() || !apiKey.trim()) {
      setErrorMsg(
        isFr
          ? 'Veuillez saisir votre Firebase Project ID et Web API Key.'
          : 'Please provide your Firebase Project ID and Web API Key.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const isSameProject = savedByobConfig?.projectId?.trim() === projectId.trim();
      const res = await connectAndSyncByob(
        {
          projectId: projectId.trim(),
          apiKey: apiKey.trim(),
          applicationId: applicationId.trim(),
          familyName: familyName.trim()
        },
        { resetLocalData: !isSameProject }
      );

      if (res.redirecting) {
        setNoticeMsg(res.error || (isFr ? 'Redirection vers Google en cours...' : 'Redirecting to Google...'));
        return;
      }

      if (!res.success) {
        setErrorMsg(
          res.error ||
            (isFr ? 'Échec de la connexion à Firebase / Firestore.' : 'Failed to connect to Firebase / Firestore.')
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQrCodeScanned = (scannedString: string) => {
    try {
      const data = JSON.parse(scannedString);
      if (data.projectId) setProjectId(data.projectId);
      if (data.apiKey) setApiKey(data.apiKey);
      if (data.applicationId) setApplicationId(data.applicationId);
      if (data.familyName) setFamilyName(data.familyName);

      if (data.projectId && data.apiKey) {
        setViewMode('SETUP');
        setSetupTab('BYOB');
        setErrorMsg(null);
        setNoticeMsg(
          isFr
            ? `Coffre BYOB « ${data.projectId} » importé. Connectez-vous avec votre compte Google pour accéder aux données.`
            : `BYOB Vault "${data.projectId}" imported. Sign in with your Google account to access Firestore.`
        );
        showToast(isFr ? 'Identifiants BYOB chargés — Connexion requise' : 'BYOB credentials loaded — Sign-in required');
        return;
      }
    } catch {
      setProjectId(scannedString);
    }
    setViewMode('SETUP');
    setSetupTab('BYOB');
  };

  const handleForgetByob = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    await forgetByobConfig();
    setViewMode('SETUP');
    setSetupTab('BYOB');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header & Language Toggle */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-teal-500 flex items-center justify-center text-slate-950 shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Budget Family</h1>
              <p className="text-xs text-slate-400">
                {isFr
                  ? 'Firestore privé (BYOB) avec cache delta local ou Mode Démo'
                  : 'Private Firestore (BYOB) with local delta cache, or Demo Mode'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLanguage(isFr ? 'en' : 'fr')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-teal-400" />
            <span>{language.toUpperCase()}</span>
          </button>
        </div>

        {/* VIEW A: SAVED BYOB FIRESTORE — FINGERPRINT UNLOCK DIRECTLY */}
        {viewMode === 'BIOMETRIC_UNLOCK' && savedByobConfig ? (
          <div className="space-y-5">
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4 text-center">
              <div
                className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center border transition ${
                  biometricVerified
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-teal-500/15 border-teal-500/30 text-teal-400'
                }`}
              >
                {biometricVerified ? (
                  <CheckCircle2 className="w-8 h-8" />
                ) : (
                  <Fingerprint className="w-8 h-8" />
                )}
              </div>

              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white">
                  {savedByobConfig.familyName || 'Private Family Vault'}
                </h2>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                  <span className="font-mono text-teal-300">{savedByobConfig.projectId}</span>
                  {firebaseUser?.email && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{firebaseUser.email}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400 pt-1">
                  {biometricVerified
                    ? isFr
                      ? 'Empreinte vérifiée. Finalisez la connexion à votre compte Google pour ouvrir Firestore.'
                      : 'Fingerprint verified. Complete Google Sign-In to open your Firestore vault.'
                    : isFr
                    ? 'Coffre Firestore déjà configuré. Authentifiez-vous avec votre empreinte digitale pour vous connecter.'
                    : 'Firestore vault already configured. Verify your fingerprint to connect directly.'}
                </p>
              </div>

              {noticeMsg && (
                <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-200 text-xs text-left leading-relaxed">
                  {noticeMsg}
                </div>
              )}

              {errorMsg && (
                <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-200 text-xs text-left space-y-2 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                  {errorMsg.toLowerCase().includes('permission') && (
                    <button
                      type="button"
                      onClick={() => setShowRulesPanel(v => !v)}
                      className="inline-flex items-center gap-1.5 text-teal-300 hover:text-teal-200 font-semibold underline cursor-pointer"
                    >
                      <span>{isFr ? 'Afficher & copier firestore.rules' : 'View & copy firestore.rules'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Primary Action: Fingerprint OR Google completion if biometric already passed */}
              {!biometricVerified ? (
                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleFingerprintUnlock}
                    className="w-full py-3.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2.5 disabled:opacity-60 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{isFr ? 'Vérification & Connexion...' : 'Verifying & Connecting...'}</span>
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-5 h-5" />
                        <span>
                          {biometricStatus.hasEnrolledCredential
                            ? isFr
                              ? 'Déverrouiller avec l’Empreinte / Face ID'
                              : 'Unlock with Fingerprint / Face ID'
                            : isFr
                            ? 'Enregistrer l’Empreinte & Se Connecter'
                            : 'Verify Fingerprint & Connect'}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleSavedByobGoogleSignIn}
                    className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs transition flex items-center justify-center gap-2.5 disabled:opacity-60 cursor-pointer"
                  >
                    <GoogleLogo />
                    <span>
                      {isFr ? 'Se connecter avec mon compte Google' : 'Sign in with Google Account'}
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleSavedByobGoogleSignIn}
                  className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm transition flex items-center justify-center gap-2.5 disabled:opacity-60 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                      <span>{isFr ? 'Connexion à Firestore...' : 'Connecting to Firestore...'}</span>
                    </>
                  ) : (
                    <>
                      <GoogleLogo />
                      <span>
                        {isFr ? 'Continuer avec Google & Firestore' : 'Continue with Google & Firestore'}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>

            {showRulesPanel && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-200">
                    {isFr ? 'Règles Firestore BYOB' : 'BYOB Firestore Security Rules'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyRules}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
                  >
                    {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-teal-400" />}
                    <span>{copiedRules ? (isFr ? 'Copié' : 'Copied') : (isFr ? 'Copier' : 'Copy')}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-40">
                  {BYOB_FIRESTORE_RULES}
                </pre>
              </div>
            )}

            {/* Secondary navigation actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setNoticeMsg(null);
                    setViewMode('SETUP');
                    setSetupTab('BYOB');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition whitespace-nowrap cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
                  <span>{isFr ? 'Modifier Config Firestore' : 'Edit Firestore Config'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setNoticeMsg(null);
                    setViewMode('SETUP');
                    setSetupTab('DEMO');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-teal-400" />
                  <span>{isFr ? 'Mode Démo' : 'Demo Mode'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleForgetByob}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 font-medium transition whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isFr ? 'Oublier ce coffre' : 'Forget Config'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* VIEW B: INITIAL SETUP — CHOOSE PRIVATE FIRESTORE (BYOB) OR DEMO MODE */
          <div className="space-y-5">
            {savedByobConfig && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <div className="text-slate-300">
                  <span className="text-slate-400">{isFr ? 'Coffre configuré :' : 'Configured vault:'} </span>
                  <span className="font-mono text-teal-300">{savedByobConfig.projectId}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setNoticeMsg(null);
                    setViewMode('BIOMETRIC_UNLOCK');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 font-semibold transition cursor-pointer"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>{isFr ? 'Retour Empreinte' : 'Fingerprint Unlock'}</span>
                </button>
              </div>
            )}

            {/* Join via QR Shortcut */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-semibold text-xs text-white block">
                    {isFr ? 'Rejoindre une Famille existante' : 'Join an Existing Family Vault'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {isFr
                      ? 'Importez la configuration Firestore via QR Code'
                      : 'Import Firestore BYOB credentials via QR Code'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-300 font-semibold text-xs transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isFr ? 'Scanner QR Code' : 'Scan QR Code'}
              </button>
            </div>

            {/* 2-Mode Switcher (Private Firestore BYOB vs Demo Mode) */}
            <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setSetupTab('BYOB');
                  setErrorMsg(null);
                }}
                className={`py-2.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  setupTab === 'BYOB'
                    ? 'bg-teal-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isFr ? 'Mon Firestore (BYOB)' : 'My Firestore (BYOB)'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setSetupTab('DEMO');
                  setErrorMsg(null);
                }}
                className={`py-2.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  setupTab === 'DEMO'
                    ? 'bg-teal-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isFr ? 'Mode Démo' : 'Demo Mode'}
              </button>
            </div>

            {/* TAB 1: PRIVATE FIRESTORE BYOB */}
            {setupTab === 'BYOB' && (
              <form onSubmit={handleConnectByob} className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isFr
                    ? 'Connectez votre propre projet Firebase / Firestore. Une authentification Google est requise avant tout accès. Un cache local synchronisé en delta évite de tout recharger à chaque ouverture (effacé à la déconnexion).'
                    : 'Configure your own Firebase / Firestore project. Google account sign-in is required before accessing anything. A local delta cache avoids full reloads on each launch and is erased on logout.'}
                </p>

                {currentHostname && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-slate-300 font-semibold block">
                        {isFr ? 'Domaine à autoriser dans Firebase Auth :' : 'Authorized domain for Firebase Auth:'}
                      </span>
                      <code className="text-teal-300 font-mono text-[11px] break-all">{currentHostname}</code>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyHostname}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                    >
                      {copiedDomain ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-teal-400" />
                      )}
                      <span>{copiedDomain ? (isFr ? 'Copié' : 'Copied') : (isFr ? 'Copier' : 'Copy')}</span>
                    </button>
                  </div>
                )}

                {noticeMsg && (
                  <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-200 text-xs leading-relaxed">
                    {noticeMsg}
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-200 text-xs space-y-2 leading-relaxed">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                    {errorMsg.toLowerCase().includes('permission') && (
                      <button
                        type="button"
                        onClick={() => setShowRulesPanel(v => !v)}
                        className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200 font-semibold underline cursor-pointer"
                      >
                        {showRulesPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span>
                          {isFr ? 'Voir & copier firestore.rules' : 'View & copy firestore.rules'}
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {showRulesPanel && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200">firestore.rules</span>
                      <button
                        type="button"
                        onClick={handleCopyRules}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold cursor-pointer"
                      >
                        {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-teal-400" />}
                        <span>{copiedRules ? (isFr ? 'Copié' : 'Copied') : (isFr ? 'Copier' : 'Copy')}</span>
                      </button>
                    </div>
                    <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-36">
                      {BYOB_FIRESTORE_RULES}
                    </pre>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Firebase Project ID
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="my-family-budget-project"
                      value={projectId}
                      onChange={e => setProjectId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Firebase Web API Key
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Application ID ({isFr ? 'optionnel' : 'optional'})
                      </label>
                      <input
                        type="text"
                        placeholder="1:123456:web:..."
                        value={applicationId}
                        onChange={e => setApplicationId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        {isFr ? 'Nom du Coffre' : 'Vault Name'}
                      </label>
                      <input
                        type="text"
                        value={familyName}
                        onChange={e => setFamilyName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm transition flex items-center justify-center gap-3 disabled:opacity-60 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                      <span>
                        {isFr
                          ? 'Authentification Google & Connexion Firestore...'
                          : 'Signing in with Google & Connecting Firestore...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <GoogleLogo />
                      <span>
                        {isFr
                          ? 'Se connecter avec Google & Firestore'
                          : 'Sign in with Google & Connect Firestore'}
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 2: DEMO MODE */}
            {setupTab === 'DEMO' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isFr
                    ? 'Explorez toutes les fonctionnalités en mémoire vive avec un foyer complet préchargé. Aucune donnée n’est écrite dans le stockage local et tout est effacé à la déconnexion.'
                    : 'Explore all features strictly in memory with a preloaded family dataset. Nothing is written to local storage and all data is erased on logout.'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => startDemoMode('fr')}
                    className="p-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/50 text-left space-y-1.5 transition cursor-pointer"
                  >
                    <div className="text-sm font-bold text-teal-400">
                      Famille Martin (FR)
                    </div>
                    <div className="text-xs text-slate-400 leading-snug">
                      Compte Courant, Carte Différé, Livret A, LDDS, Salaires & Loyer
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => startDemoMode('en')}
                    className="p-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/50 text-left space-y-1.5 transition cursor-pointer"
                  >
                    <div className="text-sm font-bold text-teal-400">
                      Smith Family (EN)
                    </div>
                    <div className="text-xs text-slate-400 leading-snug">
                      Family Checking, Deferred Visa, Savings Fund, Salaries & Mortgage
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <QrCodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanned={handleQrCodeScanned}
      />
    </div>
  );
};

const GoogleLogo: React.FC = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
    />
  </svg>
);
