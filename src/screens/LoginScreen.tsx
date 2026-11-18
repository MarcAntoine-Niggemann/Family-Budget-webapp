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
  ChevronUp,
  KeyRound,
  Lock
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { QrCodeScannerModal } from '../components/QrCodeScannerModal';
import { PWAInstallButton } from '../components/PWAInstallButton';
import {
  BiometricStatus,
  checkBiometricSupport,
  enrollBiometricWithPrf
} from '../utils/biometricKeyvault';
import { generateRandomBytes, MIN_VAULT_PASSPHRASE_LENGTH, evaluatePassphraseStrength } from '../utils/crypto';
import { validateFirebaseConfigFields } from '../services/firebaseSyncService';
import { BYOB_FIRESTORE_RULES } from './FirebaseSyncScreen';

export const LoginScreen: React.FC = () => {
  const {
    savedByobConfig,
    vaultLockMeta,
    hasSavedVault,
    isVaultUnlocked,
    biometricGateVerified,
    legacyPlaintextConfig,
    legacyV2VaultDetected,
    pinLockoutSecondsRemaining,
    syncState,
    startDemoMode,
    lockVault,
    unlockVaultWithBiometrics,
    unlockVaultWithPin,
    setupProtectedVaultAndConnect,
    continueUnlockedByobWithGoogle,
    forgetByobConfig,
    language,
    setLanguage,
    showToast
  } = useBudget();

  const isFr = language === 'fr';

  const [viewMode, setViewMode] = useState<'VAULT_UNLOCK' | 'SETUP'>(
    hasSavedVault ? 'VAULT_UNLOCK' : 'SETUP'
  );
  const [setupTab, setSetupTab] = useState<'BYOB' | 'DEMO'>('BYOB');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // BYOB form fields (populated from unlocked config or legacy plaintext migration only)
  const initialSource = savedByobConfig || legacyPlaintextConfig;
  const [familyName, setFamilyName] = useState(initialSource?.familyName || 'Private Family Vault');
  const [projectId, setProjectId] = useState(initialSource?.projectId || '');
  const [apiKey, setApiKey] = useState(initialSource?.apiKey || '');
  const [applicationId, setApplicationId] = useState(initialSource?.applicationId || '');

  // Unlock screen PIN state
  const [unlockPin, setUnlockPin] = useState('');
  const [showPinUnlock, setShowPinUnlock] = useState(false);

  // Mandatory Setup Protection state
  const [setupCredId, setSetupCredId] = useState<string | undefined>(undefined);
  const [setupPrfSecret, setSetupPrfSecret] = useState<ArrayBuffer | undefined>(undefined);
  const [setupPrfSalt, setSetupPrfSalt] = useState<Uint8Array | undefined>(undefined);
  const [setupPrfChecked, setSetupPrfChecked] = useState(false);
  const [enableBackupPin, setEnableBackupPin] = useState(false);
  const [setupPin, setSetupPin] = useState('');
  const [setupPinConfirm, setSetupPinConfirm] = useState('');

  // Status / Feedback states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [isEnrollingBio, setIsEnrollingBio] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>({
    isSupported: false,
    isPlatformAvailable: false,
    hasEnrolledCredential: false
  });
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [copiedError, setCopiedError] = useState(false);
  const [showRulesPanel, setShowRulesPanel] = useState(false);

  const autoPromptAttemptedRef = useRef(false);
  const setupErrorRef = useRef<HTMLDivElement | null>(null);

  // Keep form fields synced only after vault unlock or for legacy migration
  useEffect(() => {
    const source = savedByobConfig || legacyPlaintextConfig;
    if (!hasSavedVault && !source) {
      setViewMode('SETUP');
      setProjectId('');
      setApiKey('');
      setApplicationId('');
      setFamilyName('Private Family Vault');
      setUnlockPin('');
      setShowPinUnlock(false);
      autoPromptAttemptedRef.current = false;
    } else if (source) {
      setProjectId(source.projectId);
      setApiKey(source.apiKey);
      setApplicationId(source.applicationId || '');
      setFamilyName(source.familyName || 'Private Family Vault');
    }

    if (hasSavedVault && !isVaultUnlocked) {
      setViewMode('VAULT_UNLOCK');
    }
  }, [hasSavedVault, isVaultUnlocked, savedByobConfig, legacyPlaintextConfig]);

  // Check hardware biometric capability & auto-prompt once when locked vault has an enrolled credential
  useEffect(() => {
    let active = true;

    const initBiometrics = async () => {
      const status = await checkBiometricSupport();
      if (!active) return;
      setBiometricStatus(status);

      if (
        hasSavedVault &&
        !isVaultUnlocked &&
        viewMode === 'VAULT_UNLOCK' &&
        vaultLockMeta?.credentialId &&
        status.isPlatformAvailable &&
        !autoPromptAttemptedRef.current
      ) {
        autoPromptAttemptedRef.current = true;
        setIsLoading(true);
        setLoadingStage(isFr ? 'Vérification biométrique & connexion Firestore...' : 'Verifying biometrics & Firestore...');
        setErrorMsg(null);
        try {
          const res = await unlockVaultWithBiometrics();
          if (!active) return;
          if (!res.success && res.error) {
            if (res.needsPinForDecrypt) {
              setShowPinUnlock(true);
              setNoticeMsg(res.error);
            } else if (res.needsGoogleAuth) {
              setNoticeMsg(res.error);
            } else {
              setErrorMsg(res.error);
            }
          }
        } catch (err: any) {
          if (active) {
            setErrorMsg(err?.message || String(err));
          }
        } finally {
          if (active) {
            setIsLoading(false);
            setLoadingStage(null);
          }
        }
      }
    };

    initBiometrics();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSavedVault, isVaultUnlocked, viewMode, vaultLockMeta?.credentialId]);

  useEffect(() => {
    if (syncState.lastSyncStatus === 'ERROR' && syncState.lastSyncMessage) {
      setErrorMsg(syncState.lastSyncMessage);
    }
  }, [syncState.lastSyncStatus, syncState.lastSyncMessage]);

  useEffect(() => {
    if (errorMsg && setupErrorRef.current) {
      setupErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [errorMsg]);

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  const isRulesRelatedError = (msg: string | null) => {
    if (!msg) return false;
    const lower = msg.toLowerCase();
    return (
      lower.includes('permission') ||
      lower.includes('firestore.rules') ||
      lower.includes('security_config') ||
      lower.includes('insufficient')
    );
  };

  const handleCopyError = (msg: string) => {
    navigator.clipboard.writeText(msg);
    setCopiedError(true);
    showToast(isFr ? 'Détail de l’erreur copié' : 'Error details copied');
    setTimeout(() => setCopiedError(false), 2000);
  };

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
    setLoadingStage(isFr ? 'Vérification biométrique & ouverture Firestore...' : 'Verifying biometrics & opening Firestore...');
    try {
      const res = await unlockVaultWithBiometrics();
      if (res.needsPinForDecrypt) {
        setShowPinUnlock(true);
        setNoticeMsg(res.error || null);
        return;
      }
      if (!res.success && res.error) {
        if (res.needsGoogleAuth) {
          setNoticeMsg(res.error);
        } else {
          setErrorMsg(res.error);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isFr ? 'Échec du déverrouillage biométrique.' : 'Biometric unlock failed.'));
    } finally {
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  const handlePinUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);
    setIsLoading(true);
    setLoadingStage(isFr ? 'Déchiffrement local (PBKDF2) & Firestore...' : 'Decrypting local vault (PBKDF2) & Firestore...');
    try {
      const res = await unlockVaultWithPin(unlockPin);
      setUnlockPin('');
      if (!res.success && res.error) {
        if (res.needsGoogleAuth) {
          setNoticeMsg(res.error);
        } else {
          setErrorMsg(res.error);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isFr ? 'Échec du déchiffrement du coffre.' : 'Failed to decrypt vault.'));
    } finally {
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  const handleUnlockedGoogleContinue = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setIsLoading(true);
    setLoadingStage(isFr ? 'Connexion Google OAuth & synchronisation Firestore...' : 'Google OAuth & Firestore sync...');
    try {
      const res = await continueUnlockedByobWithGoogle();
      if (res.redirecting) {
        setNoticeMsg(res.error || (isFr ? 'Redirection Google en cours...' : 'Redirecting to Google...'));
        return;
      }
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isFr ? 'Erreur lors de la connexion Google / Firestore.' : 'Error connecting to Google / Firestore.'));
    } finally {
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  const handleSetupEnrollBiometrics = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setIsEnrollingBio(true);
    try {
      const prfSalt = generateRandomBytes(32);
      const res = await enrollBiometricWithPrf(
        familyName.trim() || 'Vault Owner',
        'vault@family.local',
        prfSalt
      );
      setSetupPrfChecked(true);
      if (!res.success || !res.credentialId) {
        setErrorMsg(res.error || (isFr ? 'Échec de l’enregistrement biométrique.' : 'Biometric enrollment failed.'));
        return;
      }
      setSetupCredId(res.credentialId);
      if (res.prfSupported && res.prfSecret) {
        setSetupPrfSecret(res.prfSecret);
        setSetupPrfSalt(prfSalt);
        showToast(
          isFr
            ? 'Clé matérielle WebAuthn PRF activée pour le chiffrement !'
            : 'Hardware WebAuthn PRF key ready for encryption!'
        );
      } else {
        setSetupPrfSecret(undefined);
        setSetupPrfSalt(undefined);
        setEnableBackupPin(true);
        setNoticeMsg(
          isFr
            ? `Empreinte enregistrée comme barrière d’accès. Ce navigateur ne supporte pas WebAuthn PRF : définissez un mot de passe (${MIN_VAULT_PASSPHRASE_LENGTH} caractères min.) pour chiffrer les données locales.`
            : `Fingerprint enrolled as access gate. This browser does not support WebAuthn PRF: set a Vault Passphrase (min. ${MIN_VAULT_PASSPHRASE_LENGTH} characters) to encrypt local storage.`
        );
      }
    } finally {
      setIsEnrollingBio(false);
    }
  };

  const handleConnectByob = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);

    const fieldValidation = validateFirebaseConfigFields({
      projectId: projectId.trim(),
      apiKey: apiKey.trim(),
      applicationId: applicationId.trim()
    });
    if (!fieldValidation.valid) {
      setErrorMsg(
        fieldValidation.error ||
          (isFr
            ? 'Veuillez saisir un Firebase Project ID et une Web API Key valides.'
            : 'Please provide a valid Firebase Project ID and Web API Key.')
      );
      return;
    }

    // If vault is already unlocked (editing config), skip re-enrollment and connect directly
    if (isVaultUnlocked && hasSavedVault) {
      setIsLoading(true);
      setLoadingStage(isFr ? 'Connexion Google & synchronisation Firestore...' : 'Connecting Google & Firestore...');
      try {
        const res = await continueUnlockedByobWithGoogle({
          projectId: projectId.trim(),
          apiKey: apiKey.trim(),
          applicationId: applicationId.trim(),
          familyName: familyName.trim()
        });
        if (res.redirecting) {
          setNoticeMsg(res.error || (isFr ? 'Redirection vers Google en cours...' : 'Redirecting to Google...'));
          return;
        }
        if (!res.success && res.error) {
          setErrorMsg(res.error);
        }
      } catch (err: any) {
        setErrorMsg(
          err?.message || (isFr ? 'Échec de la connexion à Firebase / Firestore.' : 'Failed to connect to Firebase / Firestore.')
        );
      } finally {
        setIsLoading(false);
        setLoadingStage(null);
      }
      return;
    }

    const hasPrf = Boolean(setupCredId && setupPrfSecret && setupPrfSalt);
    const needPin = !hasPrf || enableBackupPin;

    if (needPin) {
      if (setupPin.trim().length < MIN_VAULT_PASSPHRASE_LENGTH) {
        setErrorMsg(
          isFr
            ? `Un mot de passe de ${MIN_VAULT_PASSPHRASE_LENGTH} caractères minimum est requis pour chiffrer votre coffre local.`
            : `A Vault Passphrase of at least ${MIN_VAULT_PASSPHRASE_LENGTH} characters is required to encrypt your local vault.`
        );
        return;
      }
      if (setupPin.trim() !== setupPinConfirm.trim()) {
        setErrorMsg(
          isFr
            ? 'Les deux mots de passe / codes PIN saisis ne correspondent pas.'
            : 'The Vault Passphrase entries do not match.'
        );
        return;
      }
    }

    setIsLoading(true);
    setLoadingStage(
      isFr
        ? 'Chiffrement local AES-256-GCM, Auth Google & Firestore...'
        : 'AES-256-GCM encryption, Google Auth & Firestore...'
    );
    try {
      const res = await setupProtectedVaultAndConnect(
        {
          projectId: projectId.trim(),
          apiKey: apiKey.trim(),
          applicationId: applicationId.trim(),
          familyName: familyName.trim()
        },
        {
          biometricCredId: setupCredId,
          prfSecret: setupPrfSecret,
          prfSalt: setupPrfSalt,
          pin: needPin ? setupPin.trim() : undefined
        },
        { resetLocalData: true }
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
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isFr ? 'Échec inattendu lors de la connexion à Firestore.' : 'Unexpected error connecting to Firestore.')
      );
    } finally {
      setIsLoading(false);
      setLoadingStage(null);
    }
  };

  const handleQrCodeScanned = (scannedString: string) => {
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const data = JSON.parse(scannedString);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid QR payload');
      }

      const scannedProjectId = typeof data.projectId === 'string' ? data.projectId.trim() : '';
      const scannedApiKey = typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
      const scannedAppId = typeof data.applicationId === 'string' ? data.applicationId.trim() : '';
      const scannedFamilyName =
        typeof data.familyName === 'string' && data.familyName.trim()
          ? data.familyName.trim().slice(0, 120)
          : 'Private Family Vault';

      const validation = validateFirebaseConfigFields({
        projectId: scannedProjectId,
        apiKey: scannedApiKey,
        applicationId: scannedAppId
      });

      if (!validation.valid) {
        setErrorMsg(
          validation.error ||
            (isFr
              ? 'QR Code invalide : configuration Firebase incomplète ou malformée.'
              : 'Invalid QR Code: incomplete or malformed Firebase configuration.')
        );
        return;
      }

      setProjectId(scannedProjectId);
      setApiKey(scannedApiKey);
      setApplicationId(scannedAppId);
      setFamilyName(scannedFamilyName);
      setViewMode('SETUP');
      setSetupTab('BYOB');
      setNoticeMsg(
        isFr
          ? `Coffre BYOB « ${scannedProjectId} » importé. Protégez-le avec votre empreinte ou mot de passe (${MIN_VAULT_PASSPHRASE_LENGTH}+ car.) avant de vous connecter.`
          : `BYOB Vault "${scannedProjectId}" imported. Protect it with your fingerprint or passphrase (${MIN_VAULT_PASSPHRASE_LENGTH}+ chars) before signing in.`
      );
      showToast(isFr ? 'Identifiants BYOB chargés' : 'BYOB credentials loaded');
    } catch {
      setErrorMsg(
        isFr
          ? 'QR Code refusé : le contenu doit être un objet JSON valide généré depuis un coffre Budget Family.'
          : 'QR Code rejected: payload must be valid JSON exported from a Budget Family vault.'
      );
    }
  };

  const handleForgetByob = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setUnlockPin('');
    setShowPinUnlock(false);
    setSetupCredId(undefined);
    setSetupPrfSecret(undefined);
    setSetupPrfSalt(undefined);
    setSetupPin('');
    setSetupPinConfirm('');
    await forgetByobConfig();
    setViewMode('SETUP');
    setSetupTab('BYOB');
  };

  const encryptionLabel = (() => {
    if (!vaultLockMeta) return 'AES-256-GCM';
    switch (vaultLockMeta.encryptionMode) {
      case 'WEBAUTHN_PRF':
        return isFr ? 'AES-256-GCM · Clé matérielle WebAuthn PRF' : 'AES-256-GCM · Hardware WebAuthn PRF Key';
      case 'HYBRID':
        return isFr ? 'AES-256-GCM · Biométrie PRF + Code PIN' : 'AES-256-GCM · Biometric PRF + Vault PIN';
      case 'PIN_WRAPPED':
        return vaultLockMeta.credentialId
          ? isFr
            ? 'AES-256-GCM · Empreinte + Code PIN'
            : 'AES-256-GCM · Fingerprint + Vault PIN'
          : isFr
          ? 'AES-256-GCM · Code PIN du coffre'
          : 'AES-256-GCM · Vault PIN Protected';
    }
  })();

  const hasSetupPrf = Boolean(setupCredId && setupPrfSecret && setupPrfSalt);
  const showSetupPinInputs = !hasSetupPrf || enableBackupPin;
  const setupStrength = evaluatePassphraseStrength(setupPin);
  const setupProtectionReady =
    isVaultUnlocked ||
    hasSetupPrf ||
    (setupPin.trim().length >= MIN_VAULT_PASSPHRASE_LENGTH &&
      setupPin.trim() === setupPinConfirm.trim());

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl dark:shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header & Language Toggle */}
        <div className="flex items-center justify-between gap-3 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-teal-600 dark:bg-teal-500 flex items-center justify-center text-white dark:text-slate-950 shrink-0 shadow-sm">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight truncate">Budget Family</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isFr
                  ? 'Coffre chiffré AES-256-GCM · Firestore privé (BYOB) ou Démo'
                  : 'AES-256-GCM Encrypted Vault · Private Firestore (BYOB) or Demo'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="login" />

            <button
              type="button"
              onClick={() => setLanguage(isFr ? 'en' : 'fr')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{language.toUpperCase()}</span>
            </button>
          </div>
        </div>

        {/* VIEW A: SAVED ENCRYPTED VAULT — MANDATORY BIOMETRIC / PIN GATE BEFORE GOOGLE SIGN-IN */}
        {viewMode === 'VAULT_UNLOCK' && hasSavedVault ? (
          <div className="space-y-5">
            <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4 text-center">
              <div
                className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center border transition ${
                  isVaultUnlocked
                    ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                    : biometricGateVerified
                    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/40 text-amber-600 dark:text-amber-400'
                    : 'bg-teal-50 dark:bg-teal-500/15 border-teal-200 dark:border-teal-500/30 text-teal-600 dark:text-teal-400'
                }`}
              >
                {isVaultUnlocked ? (
                  <CheckCircle2 className="w-8 h-8" />
                ) : vaultLockMeta?.credentialId && !biometricGateVerified && !showPinUnlock ? (
                  <Fingerprint className="w-8 h-8" />
                ) : (
                  <Lock className="w-8 h-8" />
                )}
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {isVaultUnlocked && savedByobConfig
                    ? savedByobConfig.familyName || 'Private Family Vault'
                    : isFr
                    ? 'Coffre Local Chiffré & Verrouillé'
                    : 'Encrypted Vault Locked'}
                </h2>

                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {isVaultUnlocked && savedByobConfig ? (
                    <span className="font-mono text-teal-700 dark:text-teal-300">{savedByobConfig.projectId}</span>
                  ) : (
                    <span>{encryptionLabel}</span>
                  )}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 pt-1">
                  {isVaultUnlocked
                    ? isFr
                      ? 'Clé de chiffrement déverrouillée. Finalisez l’authentification Google pour synchroniser Firestore.'
                      : 'Encryption key unlocked. Complete Google Sign-In to open your Firestore vault.'
                    : biometricGateVerified
                    ? isFr
                      ? 'Empreinte vérifiée. Saisissez votre code PIN pour déchiffrer la clé locale.'
                      : 'Fingerprint verified. Enter your Vault PIN to decrypt the local vault key.'
                    : isFr
                    ? 'Le déverrouillage biométrique ou par code PIN est obligatoire avant d’accéder au coffre ou à Google.'
                    : 'Biometric or Vault PIN verification is required before accessing the vault or Google Sign-In.'}
                </p>
              </div>

              {noticeMsg && (
                <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 text-teal-800 dark:text-teal-200 text-xs text-left leading-relaxed">
                  {noticeMsg}
                </div>
              )}

              {errorMsg && (
                <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs text-left space-y-2.5 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <span className="whitespace-pre-line break-words flex-1">{errorMsg}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pl-6">
                    <button
                      type="button"
                      onClick={() => handleCopyError(errorMsg)}
                      className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-200 hover:underline font-semibold cursor-pointer"
                    >
                      {copiedError ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedError ? (isFr ? 'Erreur copiée' : 'Error copied') : (isFr ? 'Copier le détail' : 'Copy error')}</span>
                    </button>
                    {isRulesRelatedError(errorMsg) && (
                      <button
                        type="button"
                        onClick={() => setShowRulesPanel(v => !v)}
                        className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-300 hover:text-teal-600 dark:hover:text-teal-200 font-semibold underline cursor-pointer"
                      >
                        <span>{isFr ? 'Afficher & copier firestore.rules' : 'View & copy firestore.rules'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 1: LOCAL VAULT UNLOCK (NO GOOGLE BYPASS!) */}
              {!isVaultUnlocked ? (
                <div className="space-y-3 pt-1">
                  {vaultLockMeta?.credentialId && !biometricGateVerified && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={handleFingerprintUnlock}
                      className="w-full py-3.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2.5 disabled:opacity-60 whitespace-nowrap cursor-pointer shadow-sm"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span className="truncate">{loadingStage || (isFr ? 'Vérification biométrique...' : 'Verifying Biometrics...')}</span>
                        </>
                      ) : (
                        <>
                          <Fingerprint className="w-5 h-5" />
                          <span>
                            {isFr ? 'Déverrouiller avec Empreinte / Face ID' : 'Unlock with Fingerprint / Face ID'}
                          </span>
                        </>
                      )}
                    </button>
                  )}

                  {vaultLockMeta?.wrappedDekPin &&
                    (showPinUnlock || !vaultLockMeta?.credentialId || biometricGateVerified) && (
                      <form onSubmit={handlePinUnlock} className="space-y-2.5 text-left">
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                          {isFr ? 'Mot de passe / Code PIN du coffre' : 'Vault Passphrase / PIN'}
                        </label>
                        {pinLockoutSecondsRemaining > 0 && (
                          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-mono tabular-nums">
                            {isFr
                              ? `Trop de tentatives. Patientez ${pinLockoutSecondsRemaining}s avant de réessayer.`
                              : `Too many failed attempts. Wait ${pinLockoutSecondsRemaining}s before retrying.`}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="password"
                            required
                            autoFocus
                            disabled={pinLockoutSecondsRemaining > 0}
                            value={unlockPin}
                            onChange={e => setUnlockPin(e.target.value)}
                            placeholder={isFr ? 'Saisir votre mot de passe...' : 'Enter Vault Passphrase...'}
                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 disabled:opacity-50"
                          />
                          <button
                            type="submit"
                            disabled={isLoading || !unlockPin.trim() || pinLockoutSecondsRemaining > 0}
                            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs transition flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <KeyRound className="w-4 h-4" />
                            <span>
                              {pinLockoutSecondsRemaining > 0
                                ? `${pinLockoutSecondsRemaining}s`
                                : isFr
                                ? 'Déverrouiller'
                                : 'Unlock'}
                            </span>
                          </button>
                        </div>
                      </form>
                    )}

                  {vaultLockMeta?.credentialId &&
                    vaultLockMeta?.wrappedDekPin &&
                    !showPinUnlock &&
                    !biometricGateVerified && (
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          setShowPinUnlock(true);
                        }}
                        className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span>{isFr ? 'Utiliser le code PIN du coffre' : 'Unlock with Vault PIN instead'}</span>
                      </button>
                    )}
                </div>
              ) : (
                /* STEP 2: VAULT UNLOCKED — GOOGLE SIGN-IN REVEALED ONLY NOW */
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleUnlockedGoogleContinue}
                  className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-50 dark:hover:bg-slate-100 border border-slate-300 dark:border-transparent text-slate-900 font-bold text-sm transition flex items-center justify-center gap-2.5 disabled:opacity-60 whitespace-nowrap cursor-pointer shadow-sm"
                >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-teal-600 shrink-0" />
                        <span className="truncate">{loadingStage || (isFr ? 'Connexion à Firestore...' : 'Connecting to Firestore...')}</span>
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
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {isFr ? 'Règles Firestore BYOB' : 'BYOB Firestore Security Rules'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyRules}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                  >
                    {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                    <span>{copiedRules ? (isFr ? 'Copié' : 'Copied') : (isFr ? 'Copier' : 'Copy')}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-40">
                  {BYOB_FIRESTORE_RULES}
                </pre>
              </div>
            )}

            {/* Secondary navigation actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {isVaultUnlocked && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setNoticeMsg(null);
                        setViewMode('SETUP');
                        setSetupTab('BYOB');
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition whitespace-nowrap cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>{isFr ? 'Modifier Config Firestore' : 'Edit Firestore Config'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={lockVault}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition whitespace-nowrap cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>{isFr ? 'Verrouiller' : 'Lock Vault'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setNoticeMsg(null);
                    setViewMode('SETUP');
                    setSetupTab('DEMO');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium transition whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>{isFr ? 'Mode Démo' : 'Demo Mode'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleForgetByob}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-medium transition whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isFr ? 'Oublier ce coffre' : 'Forget Vault'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* VIEW B: INITIAL SETUP (OR UNLOCKED CONFIG EDIT / DEMO TAB) */
          <div className="space-y-5">
            {hasSavedVault && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                <div className="text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500 dark:text-slate-400">{isFr ? 'Coffre configuré :' : 'Configured vault:'} </span>
                  <span className="font-mono text-teal-700 dark:text-teal-300">
                    {isVaultUnlocked && savedByobConfig
                      ? savedByobConfig.projectId
                      : isFr
                      ? 'Chiffré & verrouillé'
                      : 'Encrypted & locked'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setNoticeMsg(null);
                    setViewMode('VAULT_UNLOCK');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/15 dark:hover:bg-teal-500/25 text-teal-700 dark:text-teal-300 font-semibold transition whitespace-nowrap cursor-pointer"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>{isFr ? 'Retour au Coffre' : 'Back to Vault'}</span>
                </button>
              </div>
            )}

            {legacyV2VaultDetected && !hasSavedVault && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-200 text-xs flex items-start justify-between gap-3 leading-relaxed">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {isFr
                      ? 'Ancien coffre v2 (120 000 itérations PBKDF2) détecté. Par sécurité (v3 · 600 000 itérations et mot de passe 8+ caractères), reconnectez votre projet Firestore ou effacez l’ancien cache ci-dessous.'
                      : 'Legacy v2 vault metadata (120k PBKDF2 iterations) detected. Under strict v3 hardening (600,000 iterations & 8+ char passphrase), re-link your Firestore vault or wipe the legacy cache.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleForgetByob}
                  className="px-2.5 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isFr ? 'Effacer' : 'Wipe'}
                </button>
              </div>
            )}

            {legacyPlaintextConfig && !hasSavedVault && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-200 text-xs flex items-start justify-between gap-3 leading-relaxed">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {isFr
                      ? 'Ancienne configuration non chiffrée détectée dans le navigateur. Enregistrez votre empreinte ou un mot de passe ci-dessous pour la chiffrer en AES-256-GCM.'
                      : 'Unencrypted legacy vault configuration detected in browser storage. Enroll your fingerprint or set a Vault Passphrase below to encrypt it with AES-256-GCM.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleForgetByob}
                  className="px-2.5 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isFr ? 'Effacer' : 'Wipe'}
                </button>
              </div>
            )}

            {/* Join via QR Shortcut */}
            {(!hasSavedVault || isVaultUnlocked) && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-xs text-slate-900 dark:text-white block">
                      {isFr ? 'Rejoindre une Famille existante' : 'Join an Existing Family Vault'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {isFr
                        ? 'Importez la configuration Firestore via QR Code'
                        : 'Import Firestore BYOB credentials via QR Code'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-4 py-2 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-teal-700 dark:text-teal-300 font-semibold text-xs transition whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isFr ? 'Scanner QR Code' : 'Scan QR Code'}
                </button>
              </div>
            )}

            {/* 2-Mode Switcher (Private Firestore BYOB vs Demo Mode) */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  if (hasSavedVault && !isVaultUnlocked) {
                    setViewMode('VAULT_UNLOCK');
                    return;
                  }
                  setSetupTab('BYOB');
                  setErrorMsg(null);
                }}
                className={`py-2.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
                  setupTab === 'BYOB'
                    ? 'bg-teal-600 dark:bg-teal-500 text-white dark:text-slate-950 font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
                    ? 'bg-teal-600 dark:bg-teal-500 text-white dark:text-slate-950 font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isFr ? 'Mode Démo' : 'Demo Mode'}
              </button>
            </div>

            {/* TAB 1: PRIVATE FIRESTORE BYOB */}
            {setupTab === 'BYOB' && (
              <form onSubmit={handleConnectByob} noValidate className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {isFr
                    ? 'Connectez votre propre projet Firebase / Firestore. Vos identifiants et le cache delta local sont chiffrés en AES-256-GCM via votre empreinte matérielle (WebAuthn PRF) ou code PIN, et effacés à la déconnexion.'
                    : 'Configure your own Firebase / Firestore project. Your credentials and local delta cache are encrypted with AES-256-GCM via hardware WebAuthn PRF biometrics or a Vault PIN, and erased on explicit logout.'}
                </p>

                {currentHostname && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-slate-800 dark:text-slate-300 font-semibold block">
                        {isFr ? 'Domaine à autoriser dans Firebase Auth :' : 'Authorized domain for Firebase Auth:'}
                      </span>
                      <code className="text-teal-700 dark:text-teal-300 font-mono text-[11px] break-all">{currentHostname}</code>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyHostname}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                    >
                      {copiedDomain ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      )}
                      <span>{copiedDomain ? (isFr ? 'Copié' : 'Copied') : (isFr ? 'Copier' : 'Copy')}</span>
                    </button>
                  </div>
                )}

                {noticeMsg && (
                  <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 text-teal-800 dark:text-teal-200 text-xs leading-relaxed">
                    {noticeMsg}
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs space-y-2.5 leading-relaxed">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <span className="whitespace-pre-line break-words flex-1">{errorMsg}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-6">
                      <button
                        type="button"
                        onClick={() => handleCopyError(errorMsg)}
                        className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-200 hover:underline font-semibold cursor-pointer"
                      >
                        {copiedError ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedError ? (isFr ? 'Erreur copiée' : 'Error copied') : (isFr ? 'Copier le détail' : 'Copy error')}</span>
                      </button>
                      {isRulesRelatedError(errorMsg) && (
                        <button
                          type="button"
                          onClick={() => setShowRulesPanel(v => !v)}
                          className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-300 hover:text-teal-600 dark:hover:text-teal-200 font-semibold underline cursor-pointer"
                        >
                          {showRulesPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <span>
                            {isFr ? 'Voir & copier firestore.rules' : 'View & copy firestore.rules'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {showRulesPanel && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">firestore.rules</span>
                      <button
                        type="button"
                        onClick={handleCopyRules}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                      >
                        {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                        <span>{copiedRules ? (isFr ? 'Copié' : 'Copied') : (isFr ? 'Copier' : 'Copy')}</span>
                      </button>
                    </div>
                    <pre className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-36">
                      {BYOB_FIRESTORE_RULES}
                    </pre>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Firebase Project ID
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="my-family-budget-project"
                      value={projectId}
                      onChange={e => setProjectId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Firebase Web API Key
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Application ID ({isFr ? 'optionnel' : 'optional'})
                      </label>
                      <input
                        type="text"
                        placeholder="1:123456:web:..."
                        value={applicationId}
                        onChange={e => setApplicationId(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {isFr ? 'Nom du Coffre' : 'Vault Name'}
                      </label>
                      <input
                        type="text"
                        value={familyName}
                        onChange={e => setFamilyName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Mandatory Local Vault Protection Enrollment (only when creating/upgrading a vault) */}
                {!isVaultUnlocked && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">
                          {isFr ? 'Protection Obligatoire du Coffre Local' : 'Mandatory Local Vault Protection'}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {isFr
                            ? 'Requis avant toute sauvegarde locale et connexion Google'
                            : 'Required before local storage persistence or Google Sign-In'}
                        </span>
                      </div>
                      {hasSetupPrf && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                    </div>

                    {biometricStatus.isPlatformAvailable ? (
                      <button
                        type="button"
                        disabled={isEnrollingBio}
                        onClick={handleSetupEnrollBiometrics}
                        className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-semibold transition flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                          hasSetupPrf
                            ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                            : setupCredId
                            ? 'bg-teal-50 dark:bg-teal-500/15 border-teal-200 dark:border-teal-500/40 text-teal-700 dark:text-teal-200'
                            : 'bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-700 text-teal-700 dark:text-teal-300'
                        }`}
                      >
                        <Fingerprint className="w-4 h-4" />
                        <span>
                          {isEnrollingBio
                            ? isFr
                              ? 'Enregistrement matériel...'
                              : 'Enrolling hardware key...'
                            : hasSetupPrf
                            ? isFr
                              ? 'Empreinte WebAuthn PRF activée (Clé matérielle)'
                              : 'WebAuthn PRF Fingerprint Active (Hardware Key)'
                            : setupCredId
                            ? isFr
                              ? 'Empreinte enregistrée (barrière d’accès)'
                              : 'Fingerprint Enrolled (Access Gate)'
                            : isFr
                            ? 'Enregistrer l’Empreinte / Face ID'
                            : 'Enroll Fingerprint / Face ID'}
                        </span>
                      </button>
                    ) : (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isFr
                          ? 'Capteur biométrique matériel non disponible dans ce navigateur — un code PIN est requis.'
                          : 'Hardware biometric sensor unavailable in this browser — a Vault PIN is required.'}
                      </p>
                    )}

                    {hasSetupPrf && (
                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={enableBackupPin}
                          onChange={e => setEnableBackupPin(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-500 focus:ring-teal-500"
                        />
                        <span>
                          {isFr
                            ? 'Ajouter un code PIN de secours (recommandé avant connexion Google)'
                            : 'Add a backup Vault PIN (recommended fallback before Google Sign-In)'}
                        </span>
                      </label>
                    )}

                    {showSetupPinInputs && (
                      <div className="space-y-2.5 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                              {isFr
                                ? `Mot de passe / PIN (${MIN_VAULT_PASSPHRASE_LENGTH}+ car.)`
                                : `Vault Passphrase (${MIN_VAULT_PASSPHRASE_LENGTH}+ chars)`}
                            </label>
                            <input
                              type="password"
                              required={!hasSetupPrf || enableBackupPin}
                              minLength={MIN_VAULT_PASSPHRASE_LENGTH}
                              value={setupPin}
                              onChange={e => setSetupPin(e.target.value)}
                              placeholder="••••••••"
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                              {isFr ? 'Confirmer le mot de passe' : 'Confirm Vault Passphrase'}
                            </label>
                            <input
                              type="password"
                              required={!hasSetupPrf || enableBackupPin}
                              minLength={MIN_VAULT_PASSPHRASE_LENGTH}
                              value={setupPinConfirm}
                              onChange={e => setSetupPinConfirm(e.target.value)}
                              placeholder="••••••••"
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                            />
                          </div>
                        </div>

                        {setupPin.length > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500 dark:text-slate-400">
                                {isFr ? 'Robustesse (PBKDF2 600k) :' : 'Strength (PBKDF2 600k):'}
                              </span>
                              <span
                                className={`font-semibold ${
                                  setupStrength.score >= 4
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : setupStrength.score === 3
                                    ? 'text-teal-600 dark:text-teal-400'
                                    : setupStrength.score === 2
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {setupStrength.label === 'strong'
                                  ? isFr
                                    ? 'Forte'
                                    : 'Strong'
                                  : setupStrength.label === 'good'
                                  ? isFr
                                    ? 'Bonne'
                                    : 'Good'
                                  : setupStrength.label === 'fair'
                                  ? isFr
                                    ? 'Moyenne'
                                    : 'Fair'
                                  : isFr
                                  ? 'Faible'
                                  : 'Weak'}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1 h-1.5">
                              {[1, 2, 3, 4].map(level => (
                                <div
                                  key={level}
                                  className={`rounded-full transition-colors ${
                                    setupStrength.score >= level
                                      ? setupStrength.score >= 4
                                        ? 'bg-emerald-500'
                                        : setupStrength.score === 3
                                        ? 'bg-teal-500'
                                        : setupStrength.score === 2
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                      : 'bg-slate-200 dark:bg-slate-800'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {setupPrfChecked && !hasSetupPrf && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-300/90">
                        {isFr
                          ? 'WebAuthn PRF non supporté par ce navigateur : votre code PIN dérive la clé AES-256-GCM.'
                          : 'WebAuthn PRF is unsupported in this browser: your Vault PIN derives the AES-256-GCM key.'}
                      </p>
                    )}
                  </div>
                )}

                {errorMsg && (
                  <div
                    ref={setupErrorRef}
                    className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs space-y-2 leading-relaxed"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <span className="whitespace-pre-line break-words flex-1">{errorMsg}</span>
                    </div>
                  </div>
                )}

                {isLoading && loadingStage && (
                  <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 text-teal-800 dark:text-teal-200 text-xs flex items-center gap-2.5">
                    <RefreshCw className="w-4 h-4 animate-spin text-teal-600 dark:text-teal-400 shrink-0" />
                    <span className="font-medium">{loadingStage}</span>
                  </div>
                )}

                {!isVaultUnlocked && !setupProtectionReady && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-snug">
                    {isFr
                      ? `Pour activer la connexion, enregistrez une empreinte PRF ou saisissez deux mots de passe identiques d’au moins ${MIN_VAULT_PASSPHRASE_LENGTH} caractères.`
                      : `To continue, enroll a PRF fingerprint or enter matching Vault Passphrases of at least ${MIN_VAULT_PASSPHRASE_LENGTH} characters.`}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-50 dark:hover:bg-slate-100 border border-slate-300 dark:border-transparent text-slate-900 font-bold text-sm transition flex items-center justify-center gap-3 disabled:opacity-50 whitespace-nowrap cursor-pointer shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-teal-600 shrink-0" />
                      <span className="truncate">
                        {loadingStage ||
                          (isFr
                            ? 'Chiffrement & Connexion Google...'
                            : 'Encrypting Vault & Signing in...')}
                      </span>
                    </>
                  ) : (
                    <>
                      <GoogleLogo />
                      <span>
                        {isVaultUnlocked
                          ? isFr
                            ? 'Enregistrer & Se connecter avec Google'
                            : 'Save & Sign in with Google'
                          : isFr
                          ? 'Chiffrer le Coffre & Se connecter avec Google'
                          : 'Encrypt Vault & Sign in with Google'}
                      </span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* TAB 2: DEMO MODE */}
            {setupTab === 'DEMO' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {isFr
                    ? 'Explorez toutes les fonctionnalités en mémoire vive avec un foyer complet préchargé. Aucune donnée n’est écrite dans le stockage local et tout est effacé à la déconnexion.'
                    : 'Explore all features strictly in memory with a preloaded family dataset. Nothing is written to local storage and all data is erased on logout.'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => startDemoMode('fr')}
                    className="p-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-teal-500/50 text-left space-y-1.5 transition cursor-pointer"
                  >
                    <div className="text-sm font-bold text-teal-600 dark:text-teal-400">
                      Famille Martin (FR)
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                      Compte Courant, Carte Différé, Livret A, LDDS, Salaires & Loyer
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => startDemoMode('en')}
                    className="p-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-teal-500/50 text-left space-y-1.5 transition cursor-pointer"
                  >
                    <div className="text-sm font-bold text-teal-600 dark:text-teal-400">
                      Smith Family (EN)
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
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
