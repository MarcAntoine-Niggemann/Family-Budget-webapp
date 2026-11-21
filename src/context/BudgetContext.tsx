import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import {
  AccountEntity,
  AppScreen,
  BudgetSimulationEntity,
  CategorizationRuleEntity,
  CategoryBudgetEntity,
  CategoryEntity,
  FamilyMemberEntity,
  FirebaseConfigEntity,
  MemberRole,
  OpenBankingConfig,
  OpenBankingAccountDto,
  ResolvedTheme,
  SharedExpensePreset,
  SharedSettlementEntity,
  SyncOutboxEntity,
  SyncStateEntity,
  ThemePreference,
  TransactionEntity,
  TransactionFilters
} from '../types';
import {
  CACHE_STORAGE_KEYS,
  SavedByobConfig,
  VaultLockMeta,
  clearByobConfig,
  clearVaultLockMeta,
  getEmptyConfig,
  getEmptySyncState,
  getInitialSeedData,
  hasEncryptedByobConfig,
  hasLegacyV2Vault,
  loadEncryptedByobConfig,
  loadEncryptedByobLocalCache,
  loadLanguagePreference,
  loadLegacyPlaintextByobConfig,
  loadThemePreference,
  loadVaultLockMeta,
  purgeLocalData,
  applyThemeToDocument,
  saveEncryptedByobConfig,
  saveEncryptedCachedData,
  saveLanguagePreference,
  saveThemePreference,
  saveVaultLockMeta
} from '../utils/storage';
import {
  authenticateWithBiometricPrf,
  clearBiometricCredential,
  enrollBiometricWithPrf
} from '../utils/biometricKeyvault';
import {
  MIN_VAULT_PASSPHRASE_LENGTH,
  PBKDF2_ITERATIONS,
  base64ToUint8,
  deriveKekFromPin,
  deriveKekFromPrfSecret,
  generateRandomBytes,
  generateRawDek,
  importDekFromRaw,
  uint8ToBase64,
  unwrapDekWithKek,
  wrapDekWithKek
} from '../utils/crypto';
import { ParsedBankRow, detectCsvDuplicates } from '../utils/csvParser';
import { computeDefaultCardPeriod } from '../utils/creditCardPeriod';
import { executeBidirectionalSync, resetFirebaseInstances, SyncResult } from '../services/firebaseSyncService';
import {
  DEFAULT_OPEN_BANKING_CONFIG,
  executeOpenBankingSync,
  testOpenBankingConnection
} from '../services/openBankingService';
import {
  AuthUserInfo,
  consumePendingByobConfig,
  getOrInitAuth,
  signInWithGoogle,
  signOutGoogle,
  subscribeToAuth,
  checkRedirectAuthResult
} from '../services/firebaseAuthService';
import {
  clearAuthTrace,
  formatCspSummary,
  initAuthDiagnostics,
  recordAuthTrace
} from '../utils/authDiagnostics';

export type SessionMode = 'DEMO' | 'FIRESTORE' | null;

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  dateFrom: '',
  dateTo: '',
  categoryId: 'ALL',
  budgetId: 'ALL',
  searchTerm: '',
  filterType: 'ALL',
  filterStatus: 'ALL',
  filterShared: 'ALL',
  creditCardPeriod: 'ALL'
};

export interface VaultProtectionInput {
  biometricCredId?: string;
  prfSecret?: ArrayBuffer;
  prfSalt?: Uint8Array;
  pin?: string;
}

export interface SplitInputItem {
  id?: number;
  categoryId: number;
  categoryName: string;
  budgetId: number;
  budgetTitle: string;
  amount: number;
  notes: string;
}

export interface VaultActionResult {
  success: boolean;
  redirecting?: boolean;
  vaultUnlocked?: boolean;
  biometricVerified?: boolean;
  needsPinForDecrypt?: boolean;
  needsGoogleAuth?: boolean;
  error?: string;
  message?: string;
}

interface BudgetContextType {
  sessionMode: SessionMode;
  savedByobConfig: SavedByobConfig | null;
  vaultLockMeta: VaultLockMeta | null;
  hasSavedVault: boolean;
  isVaultUnlocked: boolean;
  biometricGateVerified: boolean;
  legacyPlaintextConfig: SavedByobConfig | null;
  legacyV2VaultDetected: boolean;
  pinLockoutSecondsRemaining: number;
  authInitialized: boolean;

  accounts: AccountEntity[];
  transactions: TransactionEntity[];
  categories: CategoryEntity[];
  budgets: CategoryBudgetEntity[];
  rules: CategorizationRuleEntity[];
  members: FamilyMemberEntity[];
  sharedSettlements: SharedSettlementEntity[];
  sharedPreset: SharedExpensePreset;
  simulations: BudgetSimulationEntity[];
  activeSimulationId: string | null;
  activeSimulation: BudgetSimulationEntity | null;
  effectiveCategories: CategoryEntity[];
  effectiveBudgets: CategoryBudgetEntity[];
  config: FirebaseConfigEntity;
  syncState: SyncStateEntity;
  openBankingConfig: OpenBankingConfig;
  language: 'fr' | 'en';
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  currency: string;
  currentScreen: AppScreen;
  activeAccountId: string | null;
  transactionFilters: TransactionFilters;
  toastMessage: string | null;

  navigateTo: (screen: AppScreen) => void;
  setLanguage: (lang: 'fr' | 'en') => void;
  setThemePreference: (theme: ThemePreference) => void;
  setCurrency: (cur: string) => void;
  setActiveAccountId: (id: string | null) => void;
  setTransactionFilters: React.Dispatch<React.SetStateAction<TransactionFilters>>;
  resetTransactionFilters: () => void;
  drillDownToTransactions: (filter: Partial<TransactionFilters>) => void;
  showToast: (msg: string) => void;
  dismissToast: () => void;

  startDemoMode: (lang?: 'fr' | 'en') => void;
  lockVault: () => void;
  logout: () => Promise<void>;
  forgetByobConfig: () => Promise<void>;
  unlockVaultWithBiometrics: () => Promise<VaultActionResult>;
  unlockVaultWithPin: (pin: string) => Promise<VaultActionResult>;
  setupProtectedVaultAndConnect: (
    byob: { projectId: string; apiKey: string; applicationId?: string; familyName?: string },
    protection: VaultProtectionInput,
    options?: { resetLocalData?: boolean }
  ) => Promise<VaultActionResult>;
  continueUnlockedByobWithGoogle: (overrideByob?: {
    projectId: string;
    apiKey: string;
    applicationId?: string;
    familyName?: string;
  }) => Promise<VaultActionResult>;
  enrollOrUpdateBiometrics: (currentPin?: string) => Promise<{ success: boolean; prfSupported?: boolean; error?: string }>;
  updateVaultPin: (newPin: string, currentPin?: string) => Promise<{ success: boolean; error?: string }>;
  removeVaultPin: () => Promise<{ success: boolean; error?: string }>;
  removeBiometrics: () => Promise<{ success: boolean; error?: string }>;

  addTransaction: (tx: Omit<TransactionEntity, 'id' | 'updatedAt' | 'isDeleted'>) => number;
  updateTransaction: (tx: TransactionEntity) => void;
  deleteTransaction: (id: number) => void;
  splitTransaction: (parentId: number, splits: SplitInputItem[]) => void;
  unsplitTransaction: (parentId: number) => void;
  transferBetweenAccounts: (
    sourceAccId: string,
    targetAccId: string,
    amount: number,
    notes: string,
    transferType?: 'TO_SAVINGS' | 'FROM_SAVINGS' | 'CARD_SETTLEMENT' | 'GENERAL_TRANSFER',
    options?: { creditCardPeriod?: string; dateMillis?: number }
  ) => void;
  reconcilePair: (manualId: number, bankId: number) => void;

  addAccount: (acc: Omit<AccountEntity, 'updatedAt' | 'isDeleted'>) => void;
  updateAccount: (acc: AccountEntity) => void;
  deleteAccount: (id: string) => void;
  updateAccountBalance: (id: string, newBalance: number) => void;

  addCategory: (cat: Omit<CategoryEntity, 'id' | 'updatedAt' | 'isDeleted'>) => void;
  updateCategory: (cat: CategoryEntity) => void;
  deleteCategory: (id: number) => void;

  addBudget: (b: Omit<CategoryBudgetEntity, 'id' | 'updatedAt' | 'isDeleted'>) => void;
  updateBudget: (b: CategoryBudgetEntity) => void;
  deleteBudget: (id: number) => void;

  setActiveSimulationId: (id: string | null) => void;
  createSimulation: (input: {
    name: string;
    description?: string;
    sourceId: 'LIVE' | string;
  }) => string | null;
  duplicateSimulation: (sourceSimId: string, name?: string) => string | null;
  renameSimulation: (id: string, name: string, description?: string | null) => void;
  deleteSimulation: (id: string) => void;

  addRule: (r: Omit<CategorizationRuleEntity, 'id' | 'updatedAt' | 'isDeleted'>) => void;
  updateRule: (r: CategorizationRuleEntity) => void;
  deleteRule: (id: number) => void;

  addSharedSettlement: (
    s: Omit<SharedSettlementEntity, 'id' | 'updatedAt' | 'isDeleted'>,
    options?: { linkedAccountId?: string | null }
  ) => void;
  deleteSharedSettlement: (id: string) => void;
  updateSharedPreset: (preset: SharedExpensePreset) => void;

  addMember: (m: Omit<FamilyMemberEntity, 'id' | 'firestoreSynced' | 'updatedAt' | 'isDeleted'>) => string;
  updateMember: (m: FamilyMemberEntity) => void;
  deleteMember: (id: string) => void;

  importCsvTransactions: (
    records: ParsedBankRow[],
    targetAccountId: string,
    options?: { skipDuplicates?: boolean }
  ) => number;
  updateConfig: (patch: Partial<FirebaseConfigEntity>) => void;
  syncWithFirebaseNow: (options?: { forceFullPull?: boolean; resetCacheBeforePull?: boolean }) => Promise<void>;
  resetToMockData: (lang?: 'fr' | 'en') => void;

  updateOpenBankingConfig: (patch: Partial<OpenBankingConfig>) => void;
  syncOpenBankingNow: () => Promise<void>;
  testOpenBankingConn: (
    overrideConfig?: Partial<OpenBankingConfig>
  ) => Promise<{ success: boolean; message: string; accounts: OpenBankingAccountDto[] }>;

  firebaseUser: AuthUserInfo | null;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export const BudgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  initAuthDiagnostics();
  const [vaultLockMeta, setVaultLockMeta] = useState<VaultLockMeta | null>(() => loadVaultLockMeta());
  const [hasSavedVault, setHasSavedVault] = useState<boolean>(() => hasEncryptedByobConfig());
  const [legacyPlaintextConfig, setLegacyPlaintextConfig] = useState<SavedByobConfig | null>(() =>
    hasEncryptedByobConfig() ? null : loadLegacyPlaintextByobConfig()
  );
  const [legacyV2VaultDetected, setLegacyV2VaultDetected] = useState<boolean>(() =>
    !hasEncryptedByobConfig() && hasLegacyV2Vault()
  );
  const [pinLockoutSecondsRemaining, setPinLockoutSecondsRemaining] = useState<number>(0);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);
  const [biometricGateVerified, setBiometricGateVerified] = useState<boolean>(false);
  const [savedByobConfig, setSavedByobConfig] = useState<SavedByobConfig | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>(null);
  const [authInitialized, setAuthInitialized] = useState<boolean>(true);

  const [language, setLangState] = useState<'fr' | 'en'>(() => loadLanguagePreference());
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => loadThemePreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    applyThemeToDocument(loadThemePreference())
  );
  const [currency, setCurrencyState] = useState<string>('€');

  // Empty before unlock & login; hydrated strictly from encrypted local cache + delta sync on unlock
  const [accounts, setAccounts] = useState<AccountEntity[]>([]);
  const [transactions, setTransactions] = useState<TransactionEntity[]>([]);
  const [categories, setCategories] = useState<CategoryEntity[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudgetEntity[]>([]);
  const [rules, setRules] = useState<CategorizationRuleEntity[]>([]);
  const [members, setMembers] = useState<FamilyMemberEntity[]>([]);
  const [sharedSettlements, setSharedSettlements] = useState<SharedSettlementEntity[]>([]);
  const [sharedPreset, setSharedPreset] = useState<SharedExpensePreset>({
    defaultMode: 'EQUAL',
    defaultParticipantIds: []
  });
  const [simulations, setSimulations] = useState<BudgetSimulationEntity[]>([]);
  const [activeSimulationId, setActiveSimulationId] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<SyncOutboxEntity[]>([]);
  const [config, setConfig] = useState<FirebaseConfigEntity>(() => getEmptyConfig(null));
  const [syncState, setSyncState] = useState<SyncStateEntity>(() => getEmptySyncState());
  const [openBankingConfig, setOpenBankingConfig] = useState<OpenBankingConfig>(DEFAULT_OPEN_BANKING_CONFIG);

  const visibleSimulations = simulations.filter(s => !s.isDeleted);
  const activeSimulation = activeSimulationId
    ? visibleSimulations.find(s => s.id === activeSimulationId) || null
    : null;
  const effectiveCategories = activeSimulation ? activeSimulation.categories : categories;
  const effectiveBudgets = activeSimulation ? activeSimulation.budgets : budgets;

  const [currentScreen, setCurrentScreen] = useState<AppScreen>('DASHBOARD');
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [transactionFilters, setTransactionFilters] = useState<TransactionFilters>(DEFAULT_TRANSACTION_FILTERS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<AuthUserInfo | null>(null);

  const isSyncingRef = useRef(false);
  const activeDekRef = useRef<CryptoKey | null>(null);
  const persistCounterRef = useRef(0);
  const failedPinAttemptsRef = useRef(0);
  const pinLockoutUntilRef = useRef<number>(0);

  const resetPinBackoff = () => {
    failedPinAttemptsRef.current = 0;
    pinLockoutUntilRef.current = 0;
    setPinLockoutSecondsRemaining(0);
  };

  useEffect(() => {
    if (pinLockoutSecondsRemaining <= 0) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((pinLockoutUntilRef.current - Date.now()) / 1000));
      setPinLockoutSecondsRemaining(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [pinLockoutSecondsRemaining]);

  // Persist AES-256-GCM encrypted local cache ONLY while unlocked & authenticated in BYOB Firestore mode
  useEffect(() => {
    const dek = activeDekRef.current;
    if (sessionMode !== 'FIRESTORE' || !isVaultUnlocked || !dek || !config.projectId?.trim()) {
      return;
    }

    const opId = ++persistCounterRef.current;
    const projectIdTrimmed = config.projectId.trim();

    const persistEncryptedCache = async () => {
      if (opId !== persistCounterRef.current || activeDekRef.current !== dek) return;
      await Promise.all([
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.PROJECT_ID, projectIdTrimmed, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.FAMILY_NAME, config.familyName, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.ACCOUNTS, accounts, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.TRANSACTIONS, transactions, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.CATEGORIES, categories, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.BUDGETS, budgets, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.RULES, rules, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.MEMBERS, members, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.SHARED_SETTLEMENTS, sharedSettlements, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.SHARED_PRESET, sharedPreset, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.BUDGET_SIMULATIONS, simulations, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.SYNC_STATE, syncState, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.OUTBOX, outbox, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.OPEN_BANKING, openBankingConfig, dek),
        saveEncryptedCachedData(CACHE_STORAGE_KEYS.CURRENCY, currency, dek)
      ]);
      saveLanguagePreference(language);
    };

    persistEncryptedCache();
  }, [
    sessionMode,
    isVaultUnlocked,
    config.projectId,
    config.familyName,
    accounts,
    transactions,
    categories,
    budgets,
    rules,
    members,
    sharedSettlements,
    sharedPreset,
    simulations,
    syncState,
    outbox,
    openBankingConfig,
    currency,
    language
  ]);

  const applySyncResult = (
    result: SyncResult,
    base: {
      accounts: AccountEntity[];
      transactions: TransactionEntity[];
      categories: CategoryEntity[];
      budgets: CategoryBudgetEntity[];
      rules: CategorizationRuleEntity[];
      members: FamilyMemberEntity[];
      sharedSettlements?: SharedSettlementEntity[];
      simulations?: BudgetSimulationEntity[];
    }
  ) => {
    if (result.incomingTransactions && result.incomingTransactions.length > 0) {
      const map = new Map(base.transactions.map(t => [t.id, t]));
      for (const inc of result.incomingTransactions) {
        map.set(inc.id, inc);
      }
      setTransactions(Array.from(map.values()).sort((a, b) => b.date - a.date));
    }

    if (result.incomingAccounts && result.incomingAccounts.length > 0) {
      const map = new Map(base.accounts.map(a => [a.id, a]));
      for (const inc of result.incomingAccounts) {
        map.set(inc.id, inc);
      }
      setAccounts(Array.from(map.values()));
    }

    if (result.incomingCategories && result.incomingCategories.length > 0) {
      const map = new Map(base.categories.map(c => [c.id, c]));
      for (const inc of result.incomingCategories) {
        map.set(inc.id, inc);
      }
      setCategories(Array.from(map.values()));
    }

    if (result.incomingBudgets && result.incomingBudgets.length > 0) {
      const map = new Map(base.budgets.map(b => [b.id, b]));
      for (const inc of result.incomingBudgets) {
        map.set(inc.id, inc);
      }
      setBudgets(Array.from(map.values()));
    }

    if (result.incomingRules && result.incomingRules.length > 0) {
      const map = new Map(base.rules.map(r => [r.id, r]));
      for (const inc of result.incomingRules) {
        map.set(inc.id, inc);
      }
      setRules(Array.from(map.values()));
    }

    if (result.incomingMembers && result.incomingMembers.length > 0) {
      setMembers(result.incomingMembers);
    }

    if (result.incomingSharedSettlements && result.incomingSharedSettlements.length > 0) {
      const map = new Map((base.sharedSettlements || []).map(s => [s.id, s]));
      for (const inc of result.incomingSharedSettlements) {
        map.set(inc.id, inc);
      }
      setSharedSettlements(Array.from(map.values()).sort((a, b) => b.date - a.date));
    }

    if (result.incomingSimulations && result.incomingSimulations.length > 0) {
      const map = new Map((base.simulations || []).map(s => [s.id, s]));
      for (const inc of result.incomingSimulations) {
        map.set(inc.id, inc);
      }
      const nextSims = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      setSimulations(nextSims);
      if (activeSimulationId && !nextSims.some(s => s.id === activeSimulationId && !s.isDeleted)) {
        setActiveSimulationId(null);
      }
    }

    if (result.incomingFamilyName || result.resolvedUserRole) {
      setConfig(prev => ({
        ...prev,
        familyName: result.incomingFamilyName || prev.familyName,
        currentUserRole: result.resolvedUserRole || prev.currentUserRole
      }));
    }

    if (result.success) {
      setOutbox([]);
      setConfig(prev => ({
        ...prev,
        lastSyncTimestamp: Date.now(),
        syncStatusMessage: result.message
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        syncStatusMessage: result.message
      }));
    }

    setSyncState(result.updatedSyncState);
  };

  // Handle Google redirect OAuth return on mount + subscribe to Firebase Auth ONLY after vault unlock
  useEffect(() => {
    const pendingByob = consumePendingByobConfig();
    if (pendingByob && pendingByob.projectId && pendingByob.apiKey) {
      const tempCfg: Partial<FirebaseConfigEntity> = {
        projectId: pendingByob.projectId,
        apiKey: pendingByob.apiKey,
        applicationId: pendingByob.applicationId
      };
      checkRedirectAuthResult(tempCfg).then(({ user, error }) => {
        if (error) {
          setSyncState(prev => ({
            ...prev,
            lastSyncStatus: 'ERROR',
            lastSyncMessage: error
          }));
          showToast(error);
          return;
        }
        if (user) {
          if (!user.email || !user.emailVerified) {
            const verifyErr =
              language === 'fr'
                ? 'Le compte Google doit disposer d’une adresse e-mail vérifiée.'
                : 'Your Google account must have a verified email address.';
            setSyncState(prev => ({
              ...prev,
              lastSyncStatus: 'ERROR',
              lastSyncMessage: verifyErr
            }));
            showToast(verifyErr);
            return;
          }
          setFirebaseUser(user);
          showToast(
            language === 'fr'
              ? 'Connexion Google validée. Déverrouillez le coffre avec votre empreinte ou code PIN.'
              : 'Google Sign-In completed. Unlock your vault with your fingerprint or PIN.'
          );
          return;
        }
        const auth = getOrInitAuth(tempCfg);
        if (!auth?.currentUser) {
          const redirectEmptyErr =
            language === 'fr'
              ? 'La redirection Google OAuth est revenue sans session active (cookies tiers / stockage partitionné bloqué). Autorisez les popups ou ouvrez l’application dans un onglet dédié.'
              : 'Google OAuth redirect returned without an active session (blocked third-party storage). Allow browser popups or open the app in a dedicated tab.';
          setSyncState(prev => ({
            ...prev,
            lastSyncStatus: 'ERROR',
            lastSyncMessage: redirectEmptyErr
          }));
          showToast(redirectEmptyErr);
        }
      });
    }

    const activeProjectId = isVaultUnlocked
      ? config.projectId?.trim() || savedByobConfig?.projectId?.trim() || ''
      : '';
    const activeApiKey = isVaultUnlocked
      ? config.apiKey?.trim() || savedByobConfig?.apiKey?.trim() || ''
      : '';
    const activeAppId = isVaultUnlocked
      ? config.applicationId?.trim() || savedByobConfig?.applicationId?.trim() || ''
      : '';

    if (!activeProjectId || !activeApiKey) {
      setAuthInitialized(true);
      return;
    }

    setAuthInitialized(false);
    const unsub = subscribeToAuth(
      { projectId: activeProjectId, apiKey: activeApiKey, applicationId: activeAppId },
      user => {
        setFirebaseUser(user);
        setAuthInitialized(true);
        if (user && user.email) {
          setConfig(prev => ({
            ...prev,
            isGoogleAuthenticated: true,
            currentUserEmail: user.email!,
            currentUserName: user.displayName || user.email!.split('@')[0],
            isAnonymous: false
          }));
        } else {
          setConfig(prev =>
            prev.isGoogleAuthenticated
              ? {
                  ...prev,
                  isGoogleAuthenticated: false
                }
              : prev
          );
        }
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVaultUnlocked, config.projectId, config.apiKey, config.applicationId, savedByobConfig?.projectId, savedByobConfig?.apiKey]);

  // Auto-sync pending mutations to Firestore when in FIRESTORE mode
  useEffect(() => {
    if (
      sessionMode !== 'FIRESTORE' ||
      outbox.length === 0 ||
      !firebaseUser ||
      isSyncingRef.current ||
      syncState.lastSyncStatus === 'SYNCING' ||
      syncState.lastSyncStatus === 'ERROR'
    ) {
      return;
    }

    const timer = setTimeout(() => {
      syncWithFirebaseNow();
    }, 600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionMode, outbox.length, firebaseUser, syncState.lastSyncStatus]);

  const enqueueOutbox = (entityType: string, entityId: string, operation: 'UPSERT' | 'DELETE') => {
    if (sessionMode !== 'FIRESTORE') return;
    const nextOutboxId = Date.now() + Math.floor(Math.random() * 1000);
    const newEntry: SyncOutboxEntity = {
      outboxId: nextOutboxId,
      entityType,
      entityId,
      operation,
      payloadJson: '',
      createdAt: Date.now()
    };
    setOutbox(prev => [...prev, newEntry]);
    setSyncState(prev => ({
      ...prev,
      lastSyncStatus: prev.lastSyncStatus === 'ERROR' ? 'IDLE' : prev.lastSyncStatus,
      pendingOutboxCount: (prev.pendingOutboxCount || 0) + 1
    }));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  const dismissToast = () => {
    setToastMessage(null);
  };

  const navigateTo = (screen: AppScreen) => {
    setCurrentScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetTransactionFilters = () => {
    setTransactionFilters(DEFAULT_TRANSACTION_FILTERS);
  };

  const drillDownToTransactions = (filter: Partial<TransactionFilters>) => {
    if (
      (typeof filter.categoryId === 'number' && filter.categoryId < 0) ||
      (typeof filter.budgetId === 'number' && filter.budgetId < 0)
    ) {
      showToast(
        language === 'fr'
          ? 'Ligne propre à la simulation — aucune opération réelle ne peut lui être associée.'
          : 'Simulation-only budget item — no real transactions can be associated with it.'
      );
      return;
    }
    setTransactionFilters({
      ...DEFAULT_TRANSACTION_FILTERS,
      ...filter
    });
    navigateTo('TRANSACTIONS');
  };

  useEffect(() => {
    setResolvedTheme(applyThemeToDocument(themePreference));
    if (themePreference !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setResolvedTheme(applyThemeToDocument('system'));
    };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // Safari < 14 fallback
    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [themePreference]);

  const setLanguage = (lang: 'fr' | 'en') => {
    setLangState(lang);
    saveLanguagePreference(lang);
  };

  const setThemePreference = (theme: ThemePreference) => {
    saveThemePreference(theme);
    setThemePreferenceState(theme);
    setResolvedTheme(applyThemeToDocument(theme));
  };

  const setCurrency = (cur: string) => {
    setCurrencyState(cur);
  };

  const startDemoMode = (lang: 'fr' | 'en' = language) => {
    setLangState(lang);
    const data = getInitialSeedData(lang);
    setAccounts(data.accounts);
    setTransactions(data.transactions);
    setCategories(data.categories);
    setBudgets(data.budgets);
    setRules(data.rules);
    setMembers(data.members);
    setSharedSettlements(data.sharedSettlements || []);
    setSharedPreset(data.sharedPreset || { defaultMode: 'EQUAL', defaultParticipantIds: data.members.slice(0, 2).map(m => m.id) });
    setSimulations(data.simulations || []);
    setActiveSimulationId(null);
    setConfig(data.config);
    setSyncState(data.syncState);
    setOutbox([]);
    setActiveAccountId(null);
    setTransactionFilters(DEFAULT_TRANSACTION_FILTERS);
    setOpenBankingConfig(DEFAULT_OPEN_BANKING_CONFIG);
    setSessionMode('DEMO');
    setCurrentScreen('DASHBOARD');
    showToast(lang === 'fr' ? 'Mode Démo activé (en mémoire uniquement)' : 'Demo Mode activated (in-memory only)');
  };

  const resetToMockData = (lang: 'fr' | 'en' = language) => {
    if (sessionMode === 'DEMO') {
      startDemoMode(lang);
    } else {
      const data = getInitialSeedData(lang);
      setAccounts(data.accounts);
      setTransactions(data.transactions);
      setCategories(data.categories);
      setBudgets(data.budgets);
      setRules(data.rules);
      setMembers(data.members);
      setSharedSettlements(data.sharedSettlements || []);
      setSharedPreset(data.sharedPreset || { defaultMode: 'EQUAL', defaultParticipantIds: data.members.slice(0, 2).map(m => m.id) });
      setSimulations(data.simulations || []);
      setActiveSimulationId(null);
      setOutbox([]);
      setActiveAccountId(null);
      showToast(lang === 'fr' ? 'Données de démonstration chargées' : 'Demo data loaded');
    }
  };

  const eraseAllSessionMemory = (preservedByob: SavedByobConfig | null) => {
    setAccounts([]);
    setTransactions([]);
    setCategories([]);
    setBudgets([]);
    setRules([]);
    setMembers([]);
    setSharedSettlements([]);
    setSharedPreset({ defaultMode: 'EQUAL', defaultParticipantIds: [] });
    setSimulations([]);
    setActiveSimulationId(null);
    setOutbox([]);
    setActiveAccountId(null);
    setTransactionFilters(DEFAULT_TRANSACTION_FILTERS);
    setOpenBankingConfig(DEFAULT_OPEN_BANKING_CONFIG);
    setSyncState(getEmptySyncState());
    setConfig(getEmptyConfig(preservedByob));
    setFirebaseUser(null);
    setSessionMode(null);
    setCurrentScreen('DASHBOARD');
  };

  /**
   * Locks the vault immediately (wiping the in-memory DEK and React financial state),
   * while preserving encrypted localStorage delta cache and Open Banking config
   * plus the active Firebase Auth session for fast biometric/PIN re-entry.
   */
  const lockVault = () => {
    persistCounterRef.current++;
    activeDekRef.current = null;
    setIsVaultUnlocked(false);
    setBiometricGateVerified(false);
    setSavedByobConfig(null);
    eraseAllSessionMemory(null);
    showToast(
      language === 'fr'
        ? 'Coffre verrouillé — clé de chiffrement effacée de la mémoire.'
        : 'Vault locked — encryption key cleared from memory.'
    );
  };

  /**
   * Explicit user Log Out:
   * - Signs out of Firebase Auth
   * - Permanently erases all financial cache AND Open Banking config (keys + account mappings)
   * - Preserves ONLY the AES-256-GCM encrypted BYOB vault config and lock metadata.
   */
  const logout = async () => {
    persistCounterRef.current++;
    const targetCfg = savedByobConfig || config;
    await signOutGoogle(targetCfg);
    await resetFirebaseInstances();
    purgeLocalData({ preserveByob: true });
    activeDekRef.current = null;
    setIsVaultUnlocked(false);
    setBiometricGateVerified(false);
    setSavedByobConfig(null);
    setVaultLockMeta(loadVaultLockMeta());
    setHasSavedVault(hasEncryptedByobConfig());
    eraseAllSessionMemory(null);
    showToast(
      language === 'fr'
        ? 'Déconnecté — données financières et clés Open Banking effacées.'
        : 'Logged out — financial data and Open Banking keys erased.'
    );
  };

  const forgetByobConfig = async () => {
    persistCounterRef.current++;
    const targetCfg = savedByobConfig || config;
    await signOutGoogle(targetCfg);
    await resetFirebaseInstances();
    clearByobConfig();
    clearVaultLockMeta();
    clearBiometricCredential();
    purgeLocalData({ preserveByob: false });
    activeDekRef.current = null;
    resetPinBackoff();
    setIsVaultUnlocked(false);
    setBiometricGateVerified(false);
    setSavedByobConfig(null);
    setVaultLockMeta(null);
    setHasSavedVault(false);
    setLegacyPlaintextConfig(null);
    setLegacyV2VaultDetected(false);
    eraseAllSessionMemory(null);
    showToast(
      language === 'fr'
        ? 'Configuration BYOB oubliée et toutes les données effacées.'
        : 'Saved Firestore BYOB configuration and all local data cleared.'
    );
  };

  // Live-only assignment isolation helpers (simulation-only categories/budgets never enter real transactions or rules)
  const liveCategoryById = new Map(categories.filter(c => !c.isDeleted).map(c => [c.id, c]));
  const liveBudgetById = new Map(budgets.filter(b => !b.isDeleted).map(b => [b.id, b]));

  const isLiveCategoryId = (categoryId: number) => categoryId > 0 && liveCategoryById.has(categoryId);
  const isLiveBudgetForCategory = (budgetId: number, categoryId: number) => {
    if (budgetId <= 0 || categoryId <= 0) return false;
    const b = liveBudgetById.get(budgetId);
    return Boolean(b && b.categoryId === categoryId);
  };

  const sanitizeTxLiveRefs = <T extends {
    categoryId: number;
    categoryName: string;
    categoryColor: number;
    categoryIcon: string;
    budgetId: number;
    budgetTitle: string;
  }>(
    item: T
  ): { sanitized: T; stripped: boolean } => {
    if (item.categoryId === 0) {
      if (item.budgetId !== 0) {
        return {
          sanitized: { ...item, budgetId: 0, budgetTitle: '' },
          stripped: item.budgetId < 0
        };
      }
      return { sanitized: item, stripped: false };
    }
    if (!isLiveCategoryId(item.categoryId)) {
      return {
        sanitized: {
          ...item,
          categoryId: 0,
          categoryName: '',
          categoryColor: 0xff64748b,
          categoryIcon: 'HelpCircle',
          budgetId: 0,
          budgetTitle: ''
        },
        stripped: true
      };
    }
    if (item.budgetId !== 0 && !isLiveBudgetForCategory(item.budgetId, item.categoryId)) {
      return {
        sanitized: {
          ...item,
          budgetId: 0,
          budgetTitle: ''
        },
        stripped: true
      };
    }
    return { sanitized: item, stripped: false };
  };

  // Transaction mutations
  const addTransaction = (tx: Omit<TransactionEntity, 'id' | 'updatedAt' | 'isDeleted'>): number => {
    const { sanitized, stripped } = sanitizeTxLiveRefs(tx);
    const nextId = Math.max(0, ...transactions.map(t => t.id)) + 1;
    const now = Date.now();
    const newTx: TransactionEntity = {
      ...sanitized,
      id: nextId,
      updatedAt: now,
      isDeleted: false
    };

    setTransactions(prev => [newTx, ...prev]);
    enqueueOutbox('TRANSACTION', `tx_${nextId}`, 'UPSERT');

    setAccounts(prev =>
      prev.map(acc => {
        if (acc.id === newTx.accountId) {
          return {
            ...acc,
            currentBalance: Math.round((acc.currentBalance + newTx.amount) * 100) / 100,
            updatedAt: now
          };
        }
        return acc;
      })
    );

    showToast(
      stripped
        ? language === 'fr'
          ? 'Catégorie de simulation ignorée — transaction enregistrée sans affectation'
          : 'Simulation category blocked — transaction saved as unassigned'
        : language === 'fr'
        ? 'Transaction enregistrée'
        : 'Transaction saved'
    );
    return nextId;
  };

  const updateTransaction = (updatedTx: TransactionEntity) => {
    const now = Date.now();
    const oldTx = transactions.find(t => t.id === updatedTx.id);
    if (!oldTx) return;

    const categoryOrBudgetChanged =
      updatedTx.categoryId !== oldTx.categoryId || updatedTx.budgetId !== oldTx.budgetId;
    const hasSimulationRef = updatedTx.categoryId < 0 || updatedTx.budgetId < 0;
    const refCheck =
      hasSimulationRef || categoryOrBudgetChanged
        ? sanitizeTxLiveRefs(updatedTx)
        : { sanitized: updatedTx, stripped: false };
    const safeUpdatedTx = refCheck.sanitized;

    const isChild = oldTx.parentId !== null && oldTx.parentId !== undefined && oldTx.parentId > 0;

    if (isChild) {
      // Split children inherit amount/flow/account from the parent split group to prevent sum drift
      const sanitizedChild: TransactionEntity = {
        ...safeUpdatedTx,
        amount: oldTx.amount,
        isExpense: oldTx.isExpense,
        accountId: oldTx.accountId,
        accountName: oldTx.accountName,
        parentId: oldTx.parentId,
        isSplit: true,
        isSplitParent: false,
        updatedAt: now
      };
      setTransactions(prev => prev.map(tx => (tx.id === updatedTx.id ? sanitizedChild : tx)));
      enqueueOutbox('TRANSACTION', `tx_${updatedTx.id}`, 'UPSERT');
      showToast(
        refCheck.stripped
          ? language === 'fr'
            ? 'Impossible d’associer une catégorie de simulation à une transaction réelle'
            : 'Cannot associate a simulation category with a real transaction'
          : language === 'fr'
          ? 'Transaction mise à jour'
          : 'Transaction updated'
      );
      return;
    }

    const isParent = Boolean(oldTx.isSplitParent || safeUpdatedTx.isSplitParent);
    const sanitizedTx: TransactionEntity = isParent
      ? {
          ...safeUpdatedTx,
          isSplitParent: true,
          isSplit: true,
          isExcludedFromTotals: true,
          updatedAt: now
        }
      : {
          ...safeUpdatedTx,
          updatedAt: now
        };

    const childIdsToSync: number[] = [];
    setTransactions(prev =>
      prev.map(tx => {
        if (tx.id === updatedTx.id) return sanitizedTx;
        if (isParent && !tx.isDeleted && tx.parentId === updatedTx.id) {
          childIdsToSync.push(tx.id);
          return {
            ...tx,
            date: sanitizedTx.date,
            accountId: sanitizedTx.accountId,
            accountName: sanitizedTx.accountName,
            familyMemberId: sanitizedTx.familyMemberId,
            familyMemberName: sanitizedTx.familyMemberName,
            paymentMethod: sanitizedTx.paymentMethod,
            creditCardPeriod: sanitizedTx.creditCardPeriod,
            updatedAt: now
          };
        }
        return tx;
      })
    );
    enqueueOutbox('TRANSACTION', `tx_${updatedTx.id}`, 'UPSERT');
    childIdsToSync.forEach(cid => enqueueOutbox('TRANSACTION', `tx_${cid}`, 'UPSERT'));

    if (oldTx.accountId !== sanitizedTx.accountId) {
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id === oldTx.accountId) {
            return {
              ...acc,
              currentBalance: Math.round((acc.currentBalance - oldTx.amount) * 100) / 100,
              updatedAt: now
            };
          }
          if (acc.id === sanitizedTx.accountId) {
            return {
              ...acc,
              currentBalance: Math.round((acc.currentBalance + sanitizedTx.amount) * 100) / 100,
              updatedAt: now
            };
          }
          return acc;
        })
      );
      enqueueOutbox('ACCOUNT', oldTx.accountId, 'UPSERT');
      enqueueOutbox('ACCOUNT', sanitizedTx.accountId, 'UPSERT');
    } else if (oldTx.amount !== sanitizedTx.amount) {
      const diff = sanitizedTx.amount - oldTx.amount;
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id === sanitizedTx.accountId) {
            return {
              ...acc,
              currentBalance: Math.round((acc.currentBalance + diff) * 100) / 100,
              updatedAt: now
            };
          }
          return acc;
        })
      );
      enqueueOutbox('ACCOUNT', sanitizedTx.accountId, 'UPSERT');
    }

    showToast(
      refCheck.stripped
        ? language === 'fr'
          ? 'Impossible d’associer une catégorie de simulation à une transaction réelle'
          : 'Cannot associate a simulation category with a real transaction'
        : language === 'fr'
        ? 'Transaction mise à jour'
        : 'Transaction updated'
    );
  };

  const deleteTransaction = (id: number) => {
    const target = transactions.find(t => t.id === id && !t.isDeleted);
    if (!target) return;
    const now = Date.now();

    const isChild = target.parentId !== null && target.parentId !== undefined && target.parentId > 0;
    const activeChildren = transactions.filter(t => !t.isDeleted && t.parentId === id);
    const childIds = new Set(activeChildren.map(c => c.id));

    setTransactions(prev =>
      prev.map(tx =>
        tx.id === id || childIds.has(tx.id) ? { ...tx, isDeleted: true, updatedAt: now } : tx
      )
    );
    enqueueOutbox('TRANSACTION', `tx_${id}`, 'DELETE');
    activeChildren.forEach(c => enqueueOutbox('TRANSACTION', `tx_${c.id}`, 'DELETE'));

    // Only top-level transactions affect real-world account balance (and only once for a split group)
    if (!isChild) {
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id === target.accountId) {
            return {
              ...acc,
              currentBalance: Math.round((acc.currentBalance - target.amount) * 100) / 100,
              updatedAt: now
            };
          }
          return acc;
        })
      );
      enqueueOutbox('ACCOUNT', target.accountId, 'UPSERT');
    }

    showToast(
      activeChildren.length > 0
        ? language === 'fr'
          ? `Transaction et ses ${activeChildren.length} sous-opérations supprimées`
          : `Transaction and ${activeChildren.length} split items deleted`
        : language === 'fr'
        ? 'Transaction supprimée'
        : 'Transaction deleted'
    );
  };

  const splitTransaction = (parentId: number, splits: SplitInputItem[]) => {
    const parent = transactions.find(t => t.id === parentId && !t.isDeleted);
    if (!parent || (parent.parentId && parent.parentId > 0) || splits.length < 2) return;

    const hasInvalidLiveRef = splits.some(
      s =>
        !isLiveCategoryId(s.categoryId) ||
        (s.budgetId !== 0 && !isLiveBudgetForCategory(s.budgetId, s.categoryId))
    );
    if (hasInvalidLiveRef) {
      showToast(
        language === 'fr'
          ? 'Impossible d’associer une catégorie de simulation à une transaction réelle.'
          : 'Cannot associate a simulation category with a real transaction.'
      );
      return;
    }

    const existingChildren = transactions.filter(t => !t.isDeleted && t.parentId === parentId);
    const existingById = new Map(existingChildren.map(c => [c.id, c]));
    const wasAlreadySplit = Boolean(parent.isSplitParent || existingChildren.length > 0);

    const now = Date.now();
    let nextId = Math.max(0, ...transactions.map(t => t.id)) + 1;

    const updatedParent: TransactionEntity = {
      ...parent,
      isSplitParent: true,
      isSplit: true,
      isExcludedFromTotals: true,
      updatedAt: now
    };

    const reusedChildIds = new Set<number>();
    const updatedChildren: TransactionEntity[] = [];
    const createdChildren: TransactionEntity[] = [];

    for (const s of splits) {
      const isExp = parent.isExpense;
      const childAmount = isExp ? -Math.abs(s.amount) : Math.abs(s.amount);
      const cat = categories.find(c => c.id === s.categoryId);
      const existingChild = s.id && existingById.has(s.id) && !reusedChildIds.has(s.id)
        ? existingById.get(s.id)
        : undefined;

      if (existingChild) {
        reusedChildIds.add(existingChild.id);
        updatedChildren.push({
          ...existingChild,
          title: `${parent.title} (${s.budgetTitle || s.categoryName})`,
          originalBankLabel: parent.originalBankLabel,
          amount: childAmount,
          isExpense: isExp,
          categoryId: s.categoryId,
          categoryName: s.categoryName,
          categoryColor: cat?.color ?? existingChild.categoryColor ?? 0xff3b82f6,
          categoryIcon: cat?.icon || existingChild.categoryIcon || 'Tag',
          budgetId: s.budgetId,
          budgetTitle: s.budgetTitle,
          date: parent.date,
          familyMemberId: parent.familyMemberId,
          familyMemberName: parent.familyMemberName,
          source: parent.source,
          status: parent.status,
          paymentMethod: parent.paymentMethod,
          notes: s.notes || '',
          parentId: parent.id,
          isSplitParent: false,
          isSplit: true,
          isExcluded: false,
          isExcludedFromTotals: false,
          accountId: parent.accountId,
          accountName: parent.accountName,
          settlementCardName: parent.settlementCardName,
          billingCycleClosingDay: parent.billingCycleClosingDay,
          billingCycleStartDate: parent.billingCycleStartDate,
          billingCycleEndDate: parent.billingCycleEndDate,
          creditCardPeriod: parent.creditCardPeriod,
          isInternalTransfer: parent.isInternalTransfer,
          transferType: parent.transferType,
          targetAccountId: parent.targetAccountId,
          targetAccountName: parent.targetAccountName,
          updatedAt: now,
          isDeleted: false
        });
      } else {
        createdChildren.push({
          id: nextId++,
          title: `${parent.title} (${s.budgetTitle || s.categoryName})`,
          originalBankLabel: parent.originalBankLabel,
          amount: childAmount,
          isExpense: isExp,
          categoryId: s.categoryId,
          categoryName: s.categoryName,
          categoryColor: cat?.color || 0xff3b82f6,
          categoryIcon: cat?.icon || 'Tag',
          budgetId: s.budgetId,
          budgetTitle: s.budgetTitle,
          date: parent.date,
          familyMemberId: parent.familyMemberId,
          familyMemberName: parent.familyMemberName,
          source: parent.source,
          status: parent.status,
          paymentMethod: parent.paymentMethod,
          notes: s.notes || parent.notes || '',
          parentId: parent.id,
          isSplitParent: false,
          isSplit: true,
          isExcluded: false,
          isExcludedFromTotals: false,
          accountId: parent.accountId,
          accountName: parent.accountName,
          settlementCardName: parent.settlementCardName,
          billingCycleClosingDay: parent.billingCycleClosingDay,
          billingCycleStartDate: parent.billingCycleStartDate,
          billingCycleEndDate: parent.billingCycleEndDate,
          creditCardPeriod: parent.creditCardPeriod,
          isInternalTransfer: parent.isInternalTransfer,
          transferType: parent.transferType,
          targetAccountId: parent.targetAccountId,
          targetAccountName: parent.targetAccountName,
          updatedAt: now,
          isDeleted: false
        });
      }
    }

    const updatedChildMap = new Map(updatedChildren.map(c => [c.id, c]));
    const removedChildren = existingChildren.filter(c => !reusedChildIds.has(c.id));
    const removedChildIds = new Set(removedChildren.map(c => c.id));

    setTransactions(prev => [
      ...createdChildren,
      ...prev.map(t => {
        if (t.id === parentId) return updatedParent;
        if (updatedChildMap.has(t.id)) return updatedChildMap.get(t.id)!;
        if (removedChildIds.has(t.id)) return { ...t, isDeleted: true, updatedAt: now };
        return t;
      })
    ]);

    enqueueOutbox('TRANSACTION', `tx_${parentId}`, 'UPSERT');
    updatedChildren.forEach(c => enqueueOutbox('TRANSACTION', `tx_${c.id}`, 'UPSERT'));
    createdChildren.forEach(c => enqueueOutbox('TRANSACTION', `tx_${c.id}`, 'UPSERT'));
    removedChildren.forEach(c => enqueueOutbox('TRANSACTION', `tx_${c.id}`, 'DELETE'));

    showToast(
      wasAlreadySplit
        ? language === 'fr'
          ? 'Ventilation mise à jour'
          : 'Split updated successfully'
        : language === 'fr'
        ? 'Transaction ventilée avec succès'
        : 'Transaction split successfully'
    );
  };

  const unsplitTransaction = (parentId: number) => {
    const parent = transactions.find(t => t.id === parentId && !t.isDeleted);
    if (!parent) return;

    const activeChildren = transactions.filter(t => !t.isDeleted && t.parentId === parentId);
    const childIds = new Set(activeChildren.map(c => c.id));
    const now = Date.now();

    const firstChild = activeChildren[0];
    const hasParentCategory = parent.categoryId > 0 && parent.budgetId > 0;

    const restoredParent: TransactionEntity = {
      ...parent,
      ...(hasParentCategory || !firstChild
        ? {}
        : {
            categoryId: firstChild.categoryId,
            categoryName: firstChild.categoryName,
            categoryColor: firstChild.categoryColor,
            categoryIcon: firstChild.categoryIcon,
            budgetId: firstChild.budgetId,
            budgetTitle: firstChild.budgetTitle
          }),
      isSplitParent: false,
      isSplit: false,
      isExcludedFromTotals: false,
      updatedAt: now
    };

    setTransactions(prev =>
      prev.map(t => {
        if (t.id === parentId) return restoredParent;
        if (childIds.has(t.id)) return { ...t, isDeleted: true, updatedAt: now };
        return t;
      })
    );

    enqueueOutbox('TRANSACTION', `tx_${parentId}`, 'UPSERT');
    activeChildren.forEach(c => enqueueOutbox('TRANSACTION', `tx_${c.id}`, 'DELETE'));

    showToast(
      language === 'fr'
        ? 'Ventilation annulée, transaction d’origine restaurée'
        : 'Split reverted to original transaction'
    );
  };

  const transferBetweenAccounts = (
    sourceAccId: string,
    targetAccId: string,
    amount: number,
    notes: string,
    transferType: 'TO_SAVINGS' | 'FROM_SAVINGS' | 'CARD_SETTLEMENT' | 'GENERAL_TRANSFER' = 'GENERAL_TRANSFER',
    options?: { creditCardPeriod?: string; dateMillis?: number }
  ) => {
    const sourceAcc = accounts.find(a => a.id === sourceAccId);
    const targetAcc = accounts.find(a => a.id === targetAccId);
    if (!sourceAcc || !targetAcc) return;

    const now = Date.now();
    const txDate = options?.dateMillis || now;
    let nextId = Math.max(0, ...transactions.map(t => t.id)) + 1;
    const absAmount = Math.abs(amount);

    const cardAcc =
      targetAcc.type === 'DEFERRED_CARD'
        ? targetAcc
        : sourceAcc.type === 'DEFERRED_CARD'
        ? sourceAcc
        : null;
    const resolvedPeriod =
      transferType === 'CARD_SETTLEMENT'
        ? options?.creditCardPeriod ||
          (cardAcc ? computeDefaultCardPeriod(txDate, cardAcc.billingCycleClosingDay) : undefined)
        : undefined;
    const isCardSettlement = transferType === 'CARD_SETTLEMENT';

    const savingsCat = categories.find(c => !c.isDeleted && c.id === 9) || categories.find(c => !c.isDeleted);
    const savingsBudget =
      budgets.find(b => !b.isDeleted && b.categoryId === (savingsCat?.id || 9) && b.isExpense) ||
      budgets.find(b => !b.isDeleted && b.categoryId === (savingsCat?.id || 9));

    const resolvedCategoryId = savingsCat?.id || 0;
    const resolvedCategoryName = savingsCat?.name || '';
    const resolvedCategoryColor = savingsCat?.color || 0xff6366f1;
    const resolvedCategoryIcon = savingsCat?.icon || 'PiggyBank';
    const resolvedBudgetId = savingsBudget?.id || 0;
    const resolvedBudgetTitle = savingsBudget?.title || '';

    const outTx: TransactionEntity = {
      id: nextId++,
      title: isCardSettlement
        ? `${language === 'fr' ? 'Prélèvement carte' : 'Card settlement'} ${cardAcc?.name || targetAcc.name}`
        : `${language === 'fr' ? 'Virement vers' : 'Transfer to'} ${targetAcc.name}`,
      originalBankLabel: `INTERNAL TRANSFER TO ${targetAcc.name.toUpperCase()}`,
      amount: -absAmount,
      isExpense: true,
      categoryId: resolvedCategoryId,
      categoryName: resolvedCategoryName,
      categoryColor: resolvedCategoryColor,
      categoryIcon: resolvedCategoryIcon,
      budgetId: resolvedBudgetId,
      budgetTitle: resolvedBudgetTitle,
      date: txDate,
      familyMemberId: members[0]?.id || 'primary',
      familyMemberName: members[0]?.name || 'Primary User',
      source: 'MANUAL',
      status: 'VERIFIED',
      paymentMethod: language === 'fr' ? 'Virement' : 'Transfer',
      notes,
      accountId: sourceAcc.id,
      accountName: sourceAcc.name,
      targetAccountId: targetAcc.id,
      targetAccountName: targetAcc.name,
      isInternalTransfer: true,
      transferType,
      settlementCardName: cardAcc?.name,
      billingCycleClosingDay: cardAcc?.billingCycleClosingDay,
      creditCardPeriod: resolvedPeriod,
      isExcluded: isCardSettlement ? true : undefined,
      isExcludedFromTotals: isCardSettlement ? true : undefined,
      updatedAt: now,
      isDeleted: false
    };

    const inTx: TransactionEntity = {
      id: nextId++,
      title: isCardSettlement
        ? `${language === 'fr' ? 'Règlement reçu de' : 'Settlement from'} ${sourceAcc.name}`
        : `${language === 'fr' ? 'Virement reçu de' : 'Transfer from'} ${sourceAcc.name}`,
      originalBankLabel: `INTERNAL TRANSFER FROM ${sourceAcc.name.toUpperCase()}`,
      amount: absAmount,
      isExpense: false,
      categoryId: resolvedCategoryId,
      categoryName: resolvedCategoryName,
      categoryColor: resolvedCategoryColor,
      categoryIcon: resolvedCategoryIcon,
      budgetId: resolvedBudgetId,
      budgetTitle: resolvedBudgetTitle,
      date: txDate,
      familyMemberId: members[0]?.id || 'primary',
      familyMemberName: members[0]?.name || 'Primary User',
      source: 'MANUAL',
      status: 'VERIFIED',
      paymentMethod: language === 'fr' ? 'Virement' : 'Transfer',
      notes,
      accountId: targetAcc.id,
      accountName: targetAcc.name,
      targetAccountId: sourceAcc.id,
      targetAccountName: sourceAcc.name,
      isInternalTransfer: true,
      transferType,
      settlementCardName: cardAcc?.name,
      billingCycleClosingDay: cardAcc?.billingCycleClosingDay,
      creditCardPeriod: resolvedPeriod,
      isExcluded: isCardSettlement ? true : undefined,
      isExcludedFromTotals: isCardSettlement ? true : undefined,
      updatedAt: now,
      isDeleted: false
    };

    setTransactions(prev => [outTx, inTx, ...prev]);
    enqueueOutbox('TRANSACTION', `tx_${outTx.id}`, 'UPSERT');
    enqueueOutbox('TRANSACTION', `tx_${inTx.id}`, 'UPSERT');
    enqueueOutbox('ACCOUNT', sourceAccId, 'UPSERT');
    enqueueOutbox('ACCOUNT', targetAccId, 'UPSERT');

    setAccounts(prev =>
      prev.map(acc => {
        if (acc.id === sourceAccId) {
          return {
            ...acc,
            currentBalance: Math.round((acc.currentBalance - absAmount) * 100) / 100,
            updatedAt: now
          };
        }
        if (acc.id === targetAccId) {
          return {
            ...acc,
            currentBalance: Math.round((acc.currentBalance + absAmount) * 100) / 100,
            updatedAt: now
          };
        }
        return acc;
      })
    );

    showToast(language === 'fr' ? 'Virement effectué avec succès' : 'Transfer completed successfully');
  };

  const reconcilePair = (manualId: number, bankId: number) => {
    const now = Date.now();
    setTransactions(prev =>
      prev.map(tx => {
        if (tx.id === manualId) {
          return {
            ...tx,
            status: 'RECONCILED',
            reconciledWithId: bankId,
            updatedAt: now
          };
        }
        if (tx.id === bankId) {
          return {
            ...tx,
            status: 'RECONCILED',
            reconciledWithId: manualId,
            updatedAt: now
          };
        }
        return tx;
      })
    );
    enqueueOutbox('TRANSACTION', `tx_${manualId}`, 'UPSERT');
    enqueueOutbox('TRANSACTION', `tx_${bankId}`, 'UPSERT');

    showToast(
      language === 'fr'
        ? 'Dépense manuelle et relevé bancaire réconciliés avec succès'
        : 'Manual expense and bank statement reconciled successfully'
    );
  };

  // Accounts CRUD
  const addAccount = (acc: Omit<AccountEntity, 'updatedAt' | 'isDeleted'>) => {
    const now = Date.now();
    const prevDefaults = acc.isDefault ? accounts.filter(a => a.isDefault && !a.isDeleted) : [];
    setAccounts(prev => {
      const updated = acc.isDefault
        ? prev.map(a => (a.isDefault ? { ...a, isDefault: false, updatedAt: now } : a))
        : prev;
      return [...updated, { ...acc, updatedAt: now, isDeleted: false }];
    });
    prevDefaults.forEach(a => enqueueOutbox('ACCOUNT', a.id, 'UPSERT'));
    enqueueOutbox('ACCOUNT', acc.id, 'UPSERT');
    showToast(language === 'fr' ? 'Compte créé' : 'Account created');
  };

  const updateAccount = (acc: AccountEntity) => {
    const now = Date.now();
    const prevAccount = accounts.find(a => a.id === acc.id);
    const clearedDefaults = acc.isDefault
      ? accounts.filter(a => a.id !== acc.id && a.isDefault && !a.isDeleted)
      : [];
    setAccounts(prev =>
      prev.map(a => {
        if (a.id === acc.id) return { ...acc, updatedAt: now };
        if (acc.isDefault && a.isDefault) return { ...a, isDefault: false, updatedAt: now };
        return a;
      })
    );
    clearedDefaults.forEach(a => enqueueOutbox('ACCOUNT', a.id, 'UPSERT'));
    if (prevAccount && prevAccount.name !== acc.name) {
      const affectedTxIds: number[] = [];
      setTransactions(prev =>
        prev.map(tx => {
          if (tx.accountId === acc.id || tx.targetAccountId === acc.id) {
            affectedTxIds.push(tx.id);
            return {
              ...tx,
              accountName: tx.accountId === acc.id ? acc.name : tx.accountName,
              targetAccountName: tx.targetAccountId === acc.id ? acc.name : tx.targetAccountName,
              updatedAt: now
            };
          }
          return tx;
        })
      );
      affectedTxIds.forEach(txId => enqueueOutbox('TRANSACTION', `tx_${txId}`, 'UPSERT'));
    }
    enqueueOutbox('ACCOUNT', acc.id, 'UPSERT');
    showToast(language === 'fr' ? 'Compte mis à jour' : 'Account updated');
  };

  const deleteAccount = (id: string) => {
    const now = Date.now();
    setAccounts(prev => prev.map(a => (a.id === id ? { ...a, isDeleted: true, updatedAt: now } : a)));
    if (activeAccountId === id) {
      setActiveAccountId(null);
    }
    enqueueOutbox('ACCOUNT', id, 'DELETE');
    showToast(language === 'fr' ? 'Compte supprimé' : 'Account deleted');
  };

  const updateAccountBalance = (id: string, newBalance: number) => {
    const now = Date.now();
    setAccounts(prev =>
      prev.map(a =>
        a.id === id ? { ...a, currentBalance: newBalance, lastManualSyncTimestamp: now, updatedAt: now } : a
      )
    );
    enqueueOutbox('ACCOUNT', id, 'UPSERT');
    showToast(language === 'fr' ? 'Solde bancaire actualisé' : 'Account balance updated');
  };

  // What-If Budget Simulations CRUD
  const createSimulation = (input: {
    name: string;
    description?: string;
    sourceId: 'LIVE' | string;
  }): string | null => {
    const cleanName = input.name.trim().slice(0, 120);
    if (!cleanName) return null;

    const now = Date.now();
    let clonedCategories: CategoryEntity[] = [];
    let clonedBudgets: CategoryBudgetEntity[] = [];
    let clonedFromName = language === 'fr' ? 'Budget Actuel (Live)' : 'Live Budget';

    if (input.sourceId === 'LIVE') {
      const liveCats = categories.filter(c => !c.isDeleted);
      const liveCatIds = new Set(liveCats.map(c => c.id));
      const liveBgts = budgets.filter(b => !b.isDeleted && liveCatIds.has(b.categoryId));
      clonedCategories = liveCats.map(c => ({ ...c }));
      clonedBudgets = liveBgts.map(b => ({ ...b }));
    } else {
      const sourceSim = simulations.find(s => s.id === input.sourceId && !s.isDeleted);
      if (!sourceSim) return null;
      clonedFromName = sourceSim.name.slice(0, 120);
      const srcCats = sourceSim.categories.filter(c => !c.isDeleted);
      const srcCatIds = new Set(srcCats.map(c => c.id));
      const srcBgts = sourceSim.budgets.filter(b => !b.isDeleted && srcCatIds.has(b.categoryId));
      clonedCategories = srcCats.map(c => ({ ...c }));
      clonedBudgets = srcBgts.map(b => ({ ...b }));
    }

    const id = `sim_${now}_${Math.floor(Math.random() * 10000)}`;
    const newSim: BudgetSimulationEntity = {
      id,
      name: cleanName,
      description: input.description?.trim().slice(0, 500) || null,
      clonedFromName,
      categories: clonedCategories,
      budgets: clonedBudgets,
      createdAt: now,
      updatedAt: now,
      isDeleted: false
    };

    setSimulations(prev => [newSim, ...prev]);
    setActiveSimulationId(id);
    enqueueOutbox('SIMULATION', id, 'UPSERT');
    showToast(
      language === 'fr'
        ? `Simulation « ${cleanName} » créée et activée`
        : `Simulation "${cleanName}" created and active`
    );
    return id;
  };

  const duplicateSimulation = (sourceSimId: string, customName?: string): string | null => {
    const src = simulations.find(s => s.id === sourceSimId && !s.isDeleted);
    if (!src) return null;
    const fallbackName = `${src.name} (${language === 'fr' ? 'Copie' : 'Copy'})`.slice(0, 120);
    return createSimulation({
      name: customName?.trim() || fallbackName,
      description: src.description || undefined,
      sourceId: src.id
    });
  };

  const renameSimulation = (id: string, name: string, description?: string | null) => {
    const cleanName = name.trim().slice(0, 120);
    if (!cleanName) return;
    const now = Date.now();
    setSimulations(prev =>
      prev.map(s =>
        s.id === id
          ? {
              ...s,
              name: cleanName,
              description: description !== undefined ? description?.trim().slice(0, 500) || null : s.description,
              updatedAt: now
            }
          : s
      )
    );
    enqueueOutbox('SIMULATION', id, 'UPSERT');
    showToast(language === 'fr' ? 'Simulation renommée' : 'Simulation renamed');
  };

  const deleteSimulation = (id: string) => {
    const now = Date.now();
    setSimulations(prev => prev.map(s => (s.id === id ? { ...s, isDeleted: true, updatedAt: now } : s)));
    if (activeSimulationId === id) {
      setActiveSimulationId(null);
    }
    enqueueOutbox('SIMULATION', id, 'DELETE');
    showToast(language === 'fr' ? 'Simulation supprimée' : 'Simulation deleted');
  };

  // Categories CRUD (routes to active simulation when simulating, otherwise updates Live)
  const addCategory = (cat: Omit<CategoryEntity, 'id' | 'updatedAt' | 'isDeleted'>) => {
    const now = Date.now();
    if (activeSimulation) {
      const nextSimCatId = Math.min(0, ...activeSimulation.categories.map(c => c.id)) - 1;
      const newCat: CategoryEntity = { ...cat, id: nextSimCatId, updatedAt: now, isDeleted: false };
      setSimulations(prev =>
        prev.map(s =>
          s.id === activeSimulation.id
            ? { ...s, categories: [...s.categories, newCat], updatedAt: now }
            : s
        )
      );
      enqueueOutbox('SIMULATION', activeSimulation.id, 'UPSERT');
      showToast(language === 'fr' ? 'Catégorie ajoutée à la simulation' : 'Category added to simulation');
      return;
    }

    const nextId = Math.max(0, ...categories.map(c => c.id)) + 1;
    setCategories(prev => [...prev, { ...cat, id: nextId, updatedAt: now, isDeleted: false }]);
    enqueueOutbox('CATEGORY', `cat_${nextId}`, 'UPSERT');
    showToast(language === 'fr' ? 'Catégorie créée' : 'Category created');
  };

  const updateCategory = (cat: CategoryEntity) => {
    const now = Date.now();
    if (activeSimulation) {
      setSimulations(prev =>
        prev.map(s =>
          s.id === activeSimulation.id
            ? {
                ...s,
                categories: s.categories.map(c => (c.id === cat.id ? { ...cat, updatedAt: now } : c)),
                budgets: s.budgets.map(b =>
                  b.categoryId === cat.id ? { ...b, categoryName: cat.name, updatedAt: now } : b
                ),
                updatedAt: now
              }
            : s
        )
      );
      enqueueOutbox('SIMULATION', activeSimulation.id, 'UPSERT');
      showToast(language === 'fr' ? 'Catégorie simulée mise à jour' : 'Simulated category updated');
      return;
    }

    setCategories(prev => prev.map(c => (c.id === cat.id ? { ...cat, updatedAt: now } : c)));
    setBudgets(prev =>
      prev.map(b => (b.categoryId === cat.id ? { ...b, categoryName: cat.name, updatedAt: now } : b))
    );
    setRules(prev =>
      prev.map(r => (r.targetCategoryId === cat.id ? { ...r, targetCategoryName: cat.name, updatedAt: now } : r))
    );
    enqueueOutbox('CATEGORY', `cat_${cat.id}`, 'UPSERT');
    showToast(language === 'fr' ? 'Catégorie mise à jour' : 'Category updated');
  };

  const deleteCategory = (id: number) => {
    const now = Date.now();
    if (activeSimulation) {
      setSimulations(prev =>
        prev.map(s =>
          s.id === activeSimulation.id
            ? {
                ...s,
                categories: s.categories.map(c => (c.id === id ? { ...c, isDeleted: true, updatedAt: now } : c)),
                updatedAt: now
              }
            : s
        )
      );
      enqueueOutbox('SIMULATION', activeSimulation.id, 'UPSERT');
      showToast(language === 'fr' ? 'Catégorie retirée de la simulation' : 'Category removed from simulation');
      return;
    }

    setCategories(prev => prev.map(c => (c.id === id ? { ...c, isDeleted: true, updatedAt: now } : c)));
    enqueueOutbox('CATEGORY', `cat_${id}`, 'DELETE');
    showToast(language === 'fr' ? 'Catégorie supprimée' : 'Category deleted');
  };

  // Budgets (Sub-categories) CRUD (routes to active simulation when simulating, otherwise updates Live)
  const addBudget = (b: Omit<CategoryBudgetEntity, 'id' | 'updatedAt' | 'isDeleted'>) => {
    const now = Date.now();
    if (activeSimulation) {
      const nextSimBudgetId = Math.min(0, ...activeSimulation.budgets.map(bg => bg.id)) - 1;
      const newBudget: CategoryBudgetEntity = { ...b, id: nextSimBudgetId, updatedAt: now, isDeleted: false };
      setSimulations(prev =>
        prev.map(s =>
          s.id === activeSimulation.id
            ? { ...s, budgets: [...s.budgets, newBudget], updatedAt: now }
            : s
        )
      );
      enqueueOutbox('SIMULATION', activeSimulation.id, 'UPSERT');
      showToast(language === 'fr' ? 'Ligne ajoutée à la simulation' : 'Budget line added to simulation');
      return;
    }

    const nextId = Math.max(0, ...budgets.map(bg => bg.id)) + 1;
    setBudgets(prev => [...prev, { ...b, id: nextId, updatedAt: now, isDeleted: false }]);
    enqueueOutbox('BUDGET', `budget_${nextId}`, 'UPSERT');
    showToast(language === 'fr' ? 'Sous-catégorie créée' : 'Sub-category created');
  };

  const updateBudget = (b: CategoryBudgetEntity) => {
    const now = Date.now();
    if (activeSimulation) {
      setSimulations(prev =>
        prev.map(s =>
          s.id === activeSimulation.id
            ? {
                ...s,
                budgets: s.budgets.map(bg => (bg.id === b.id ? { ...b, updatedAt: now } : bg)),
                updatedAt: now
              }
            : s
        )
      );
      enqueueOutbox('SIMULATION', activeSimulation.id, 'UPSERT');
      showToast(language === 'fr' ? 'Ligne simulée mise à jour' : 'Simulated budget line updated');
      return;
    }

    setBudgets(prev => prev.map(bg => (bg.id === b.id ? { ...b, updatedAt: now } : bg)));
    setRules(prev =>
      prev.map(r => (r.targetBudgetId === b.id ? { ...r, targetBudgetTitle: b.title, updatedAt: now } : r))
    );
    enqueueOutbox('BUDGET', `budget_${b.id}`, 'UPSERT');
    showToast(language === 'fr' ? 'Sous-catégorie mise à jour' : 'Sub-category updated');
  };

  const deleteBudget = (id: number) => {
    const now = Date.now();
    if (activeSimulation) {
      setSimulations(prev =>
        prev.map(s =>
          s.id === activeSimulation.id
            ? {
                ...s,
                budgets: s.budgets.map(bg => (bg.id === id ? { ...bg, isDeleted: true, updatedAt: now } : bg)),
                updatedAt: now
              }
            : s
        )
      );
      enqueueOutbox('SIMULATION', activeSimulation.id, 'UPSERT');
      showToast(language === 'fr' ? 'Ligne retirée de la simulation' : 'Budget line removed from simulation');
      return;
    }

    setBudgets(prev => prev.map(bg => (bg.id === id ? { ...bg, isDeleted: true, updatedAt: now } : bg)));
    enqueueOutbox('BUDGET', `budget_${id}`, 'DELETE');
    showToast(language === 'fr' ? 'Sous-catégorie supprimée' : 'Sub-category deleted');
  };

  // Rules CRUD (strictly Live-only)
  const addRule = (r: Omit<CategorizationRuleEntity, 'id' | 'updatedAt' | 'isDeleted'>) => {
    if (
      !isLiveCategoryId(r.targetCategoryId) ||
      (r.targetBudgetId !== 0 && !isLiveBudgetForCategory(r.targetBudgetId, r.targetCategoryId))
    ) {
      showToast(
        language === 'fr'
          ? 'Une règle ne peut cibler qu’une catégorie réelle du budget Live.'
          : 'Auto-categorization rules can only target Live categories and budgets.'
      );
      return;
    }
    const nextId = Math.max(0, ...rules.map(rl => rl.id)) + 1;
    const now = Date.now();
    setRules(prev => [...prev, { ...r, id: nextId, updatedAt: now, isDeleted: false }]);
    enqueueOutbox('RULE', `rule_${nextId}`, 'UPSERT');
    showToast(language === 'fr' ? 'Règle créée' : 'Rule created');
  };

  const updateRule = (r: CategorizationRuleEntity) => {
    if (
      !isLiveCategoryId(r.targetCategoryId) ||
      (r.targetBudgetId !== 0 && !isLiveBudgetForCategory(r.targetBudgetId, r.targetCategoryId))
    ) {
      showToast(
        language === 'fr'
          ? 'Une règle ne peut cibler qu’une catégorie réelle du budget Live.'
          : 'Auto-categorization rules can only target Live categories and budgets.'
      );
      return;
    }
    const now = Date.now();
    setRules(prev => prev.map(rl => (rl.id === r.id ? { ...r, updatedAt: now } : rl)));
    enqueueOutbox('RULE', `rule_${r.id}`, 'UPSERT');
    showToast(language === 'fr' ? 'Règle mise à jour' : 'Rule updated');
  };

  const deleteRule = (id: number) => {
    const now = Date.now();
    setRules(prev => prev.map(rl => (rl.id === id ? { ...rl, isDeleted: true, updatedAt: now } : rl)));
    enqueueOutbox('RULE', `rule_${id}`, 'DELETE');
    showToast(language === 'fr' ? 'Règle supprimée' : 'Rule deleted');
  };

  // Shared Settlements & Couple/Family Member CRUD
  const addSharedSettlement = (
    s: Omit<SharedSettlementEntity, 'id' | 'updatedAt' | 'isDeleted'>,
    options?: { linkedAccountId?: string | null }
  ) => {
    const now = Date.now();
    const id = `settle_${now}_${Math.floor(Math.random() * 1000)}`;
    const absAmount = Math.round(Math.abs(s.amount) * 100) / 100;
    if (absAmount <= 0) return;

    let linkedTxId: number | null = s.linkedTransactionId ?? null;
    const linkedAccId = options?.linkedAccountId;

    if (linkedAccId) {
      const acc = accounts.find(a => a.id === linkedAccId && !a.isDeleted);
      if (acc) {
        const nextTxId = Math.max(0, ...transactions.map(t => t.id)) + 1;
        const settlementTx: TransactionEntity = {
          id: nextTxId,
          title:
            language === 'fr'
              ? `Remboursement partagé : ${s.fromMemberName} → ${s.toMemberName}`
              : `Shared settlement: ${s.fromMemberName} → ${s.toMemberName}`,
          originalBankLabel: null,
          amount: -absAmount,
          isExpense: true,
          categoryId: 0,
          categoryName: language === 'fr' ? 'Remboursement partagé' : 'Shared Settlement',
          categoryColor: 0xff0d9488,
          categoryIcon: 'ArrowRightLeft',
          budgetId: 0,
          budgetTitle: '',
          date: s.date || now,
          familyMemberId: s.fromMemberId,
          familyMemberName: s.fromMemberName,
          source: 'MANUAL',
          status: 'VERIFIED',
          paymentMethod: language === 'fr' ? 'Virement' : 'Transfer',
          notes: s.notes || '',
          accountId: acc.id,
          accountName: acc.name,
          isExcluded: true,
          isExcludedFromTotals: true,
          updatedAt: now,
          isDeleted: false
        };
        setTransactions(prev => [settlementTx, ...prev]);
        enqueueOutbox('TRANSACTION', `tx_${nextTxId}`, 'UPSERT');
        setAccounts(prev =>
          prev.map(a =>
            a.id === acc.id
              ? { ...a, currentBalance: Math.round((a.currentBalance - absAmount) * 100) / 100, updatedAt: now }
              : a
          )
        );
        enqueueOutbox('ACCOUNT', acc.id, 'UPSERT');
        linkedTxId = nextTxId;
      }
    }

    const newSettlement: SharedSettlementEntity = {
      ...s,
      id,
      amount: absAmount,
      linkedTransactionId: linkedTxId,
      updatedAt: now,
      isDeleted: false
    };

    setSharedSettlements(prev => [newSettlement, ...prev]);
    enqueueOutbox('SHARED_SETTLEMENT', id, 'UPSERT');
    showToast(language === 'fr' ? 'Remboursement enregistré' : 'Settlement recorded');
  };

  const deleteSharedSettlement = (id: string) => {
    const now = Date.now();
    const target = sharedSettlements.find(s => s.id === id && !s.isDeleted);
    if (!target) return;

    setSharedSettlements(prev => prev.map(s => (s.id === id ? { ...s, isDeleted: true, updatedAt: now } : s)));
    enqueueOutbox('SHARED_SETTLEMENT', id, 'DELETE');

    if (target.linkedTransactionId) {
      deleteTransaction(target.linkedTransactionId);
    }

    showToast(language === 'fr' ? 'Remboursement supprimé' : 'Settlement removed');
  };

  const updateSharedPreset = (preset: SharedExpensePreset) => {
    setSharedPreset(preset);
    showToast(language === 'fr' ? 'Préférence de partage enregistrée' : 'Shared split preset updated');
  };

  const addMember = (
    m: Omit<FamilyMemberEntity, 'id' | 'firestoreSynced' | 'updatedAt' | 'isDeleted'>
  ): string => {
    const now = Date.now();
    const slug = m.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'member';
    const id = `${slug}_${now % 10000}`;
    const newMember: FamilyMemberEntity = {
      ...m,
      id,
      firestoreSynced: sessionMode === 'FIRESTORE',
      updatedAt: now,
      isDeleted: false
    };
    setMembers(prev => [...prev, newMember]);
    enqueueOutbox('MEMBER', id, 'UPSERT');
    showToast(language === 'fr' ? 'Membre ajouté' : 'Member added');
    return id;
  };

  const updateMember = (updated: FamilyMemberEntity) => {
    const now = Date.now();
    setMembers(prev => prev.map(m => (m.id === updated.id ? { ...updated, updatedAt: now } : m)));
    enqueueOutbox('MEMBER', updated.id, 'UPSERT');
    showToast(language === 'fr' ? 'Membre mis à jour' : 'Member updated');
  };

  const deleteMember = (id: string) => {
    const activeCount = members.filter(m => !m.isDeleted).length;
    if (activeCount <= 1) {
      showToast(language === 'fr' ? 'Au moins un membre doit rester actif.' : 'At least one member must remain active.');
      return;
    }
    const now = Date.now();
    setMembers(prev => prev.map(m => (m.id === id ? { ...m, isDeleted: true, updatedAt: now } : m)));
    enqueueOutbox('MEMBER', id, 'DELETE');
    showToast(language === 'fr' ? 'Membre retiré' : 'Member removed');
  };

  // Import CSV
  const importCsvTransactions = (
    records: ParsedBankRow[],
    targetAccountId: string,
    options?: { skipDuplicates?: boolean }
  ): number => {
    const targetAcc = accounts.find(a => a.id === targetAccountId);
    if (!targetAcc) return 0;

    const skipDuplicates = options?.skipDuplicates ?? true;
    let rowsToImport = records;
    let skippedCount = 0;

    if (skipDuplicates && records.length > 0) {
      const dupMap = detectCsvDuplicates(records, transactions, targetAccountId);
      rowsToImport = records.filter(r => !dupMap.get(r.id)?.isDuplicate);
      skippedCount = records.length - rowsToImport.length;
    }

    if (rowsToImport.length === 0) {
      showToast(
        language === 'fr'
          ? `Aucune nouvelle opération à importer (${skippedCount} doublon(s) ignoré(s))`
          : `No new transactions to import (${skippedCount} duplicate(s) skipped)`
      );
      return 0;
    }

    const now = Date.now();
    let nextId = Math.max(0, ...transactions.map(t => t.id)) + 1;

    let balanceDelta = 0;

    const newTxs: TransactionEntity[] = rowsToImport.map(rec => {
      balanceDelta += rec.amount;
      const safeRefs = sanitizeTxLiveRefs({
        categoryId: rec.matchedCategoryId,
        categoryName: rec.matchedCategoryName,
        categoryColor: rec.matchedCategoryColor,
        categoryIcon: rec.matchedCategoryIcon,
        budgetId: rec.matchedBudgetId,
        budgetTitle: rec.matchedBudgetTitle
      }).sanitized;

      return {
        id: nextId++,
        title: rec.cleanTitle,
        originalBankLabel: rec.originalLabel,
        amount: rec.amount,
        isExpense: rec.isExpense,
        categoryId: safeRefs.categoryId,
        categoryName: safeRefs.categoryName,
        categoryColor: safeRefs.categoryColor,
        categoryIcon: safeRefs.categoryIcon,
        budgetId: safeRefs.budgetId,
        budgetTitle: safeRefs.budgetTitle,
        date: rec.dateMillis,
        familyMemberId: members[0]?.id || 'primary',
        familyMemberName: members[0]?.name || 'Primary User',
        source: 'BANK_IMPORT',
        status: 'VERIFIED',
        paymentMethod: targetAcc.type === 'DEFERRED_CARD' ? targetAcc.name : 'Card',
        notes: rec.matchedRulePattern ? `Auto-categorized by rule: ${rec.matchedRulePattern}` : '',
        accountId: targetAcc.id,
        accountName: targetAcc.name,
        settlementCardName: targetAcc.type === 'DEFERRED_CARD' ? targetAcc.name : undefined,
        billingCycleClosingDay: targetAcc.billingCycleClosingDay,
        creditCardPeriod:
          targetAcc.type === 'DEFERRED_CARD'
            ? computeDefaultCardPeriod(rec.dateMillis, targetAcc.billingCycleClosingDay)
            : undefined,
        updatedAt: now,
        isDeleted: false
      };
    });

    setTransactions(prev => [...newTxs, ...prev]);
    newTxs.forEach(t => enqueueOutbox('TRANSACTION', `tx_${t.id}`, 'UPSERT'));
    enqueueOutbox('ACCOUNT', targetAccountId, 'UPSERT');

    setAccounts(prev =>
      prev.map(acc => {
        if (acc.id === targetAccountId) {
          return {
            ...acc,
            currentBalance: Math.round((acc.currentBalance + balanceDelta) * 100) / 100,
            lastManualSyncTimestamp: now,
            updatedAt: now
          };
        }
        return acc;
      })
    );

    showToast(
      language === 'fr'
        ? skippedCount > 0
          ? `${newTxs.length} opérations importées dans ${targetAcc.name} (${skippedCount} doublon(s) ignoré(s))`
          : `${newTxs.length} opérations bancaires importées dans ${targetAcc.name}`
        : skippedCount > 0
          ? `${newTxs.length} transactions imported into ${targetAcc.name} (${skippedCount} duplicate(s) skipped)`
          : `${newTxs.length} bank transactions imported into ${targetAcc.name}`
    );

    return newTxs.length;
  };

  const updateConfig = (patch: Partial<FirebaseConfigEntity>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    if (patch.familyName && sessionMode === 'FIRESTORE' && savedByobConfig && activeDekRef.current) {
      const updated = { ...savedByobConfig, familyName: patch.familyName };
      saveEncryptedByobConfig(updated, activeDekRef.current).catch(err =>
        console.error('Failed to re-encrypt updated vault name:', err)
      );
      setSavedByobConfig(updated);
    }
    showToast(language === 'fr' ? 'Configuration mise à jour' : 'Configuration updated');
  };

  const syncWithFirebaseNow = async (options?: { forceFullPull?: boolean; resetCacheBeforePull?: boolean }) => {
    if (sessionMode !== 'FIRESTORE') {
      showToast(
        language === 'fr'
          ? 'Mode Démo (en mémoire uniquement) — Connectez votre Firestore pour synchroniser.'
          : 'Demo Mode (in-memory only) — Connect your Firestore to sync.'
      );
      return;
    }

    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    const forceFullPull = options?.forceFullPull || false;
    const resetCacheBeforePull = options?.resetCacheBeforePull || false;

    const baseSyncState: SyncStateEntity = {
      ...syncState,
      lastPullTimestamp: forceFullPull ? 0 : syncState.lastPullTimestamp,
      lastSyncStatus: 'SYNCING',
      lastSyncMessage: language === 'fr' ? 'Synchronisation Cloud Firestore en cours...' : 'Syncing with Cloud Firestore...'
    };
    setSyncState(baseSyncState);

    const baseData = resetCacheBeforePull
      ? {
          accounts: [],
          transactions: [],
          categories: [],
          budgets: [],
          rules: [],
          members,
          sharedSettlements: [],
          simulations: []
        }
      : {
          accounts,
          transactions,
          categories,
          budgets,
          rules,
          members,
          sharedSettlements,
          simulations
        };

    if (resetCacheBeforePull) {
      setAccounts([]);
      setTransactions([]);
      setCategories([]);
      setBudgets([]);
      setRules([]);
      setSharedSettlements([]);
      setSimulations([]);
      setActiveSimulationId(null);
      setOutbox([]);
      setActiveAccountId(null);
    }

    try {
      const result = await executeBidirectionalSync({
        accounts: baseData.accounts,
        transactions: baseData.transactions,
        categories: baseData.categories,
        budgets: baseData.budgets,
        rules: baseData.rules,
        members: baseData.members,
        sharedSettlements: baseData.sharedSettlements,
        simulations: baseData.simulations,
        outbox: resetCacheBeforePull ? [] : outbox,
        syncState: baseSyncState,
        config
      });

      applySyncResult(result, baseData);
      showToast(result.message);
    } catch (err: any) {
      const errMsg = err?.message || 'Sync failed';
      setSyncState(prev => ({
        ...prev,
        lastSyncStatus: 'ERROR',
        lastSyncMessage: errMsg
      }));
      showToast(errMsg);
    } finally {
      isSyncingRef.current = false;
    }
  };

  const completeByobSetupWithUser = async (
    byob: { projectId: string; apiKey: string; applicationId?: string; familyName?: string },
    user: AuthUserInfo,
    resetLocalData: boolean,
    dekOverride?: CryptoKey
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      const dek = dekOverride || activeDekRef.current;
      if (!dek) {
        return {
          success: false,
          error:
            language === 'fr'
              ? 'Clé de chiffrement locale indisponible. Veuillez déverrouiller le coffre.'
              : 'Local vault encryption key is unavailable. Please unlock your vault.'
        };
      }

      const cleanByob: SavedByobConfig = {
        projectId: byob.projectId.trim(),
        apiKey: byob.apiKey.trim(),
        applicationId: byob.applicationId?.trim() || '',
        familyName: byob.familyName?.trim() || 'Private Family Vault'
      };

      await saveEncryptedByobConfig(cleanByob, dek);
      setSavedByobConfig(cleanByob);
      setHasSavedVault(true);
      setLegacyPlaintextConfig(null);

      const adminMember: FamilyMemberEntity = {
        id: user.uid,
        name: user.displayName || user.email?.split('@')[0] || 'Admin',
        email: user.email || '',
        role: 'ADMIN',
        avatarColor: 0xff0f766e,
        firestoreSynced: true
      };

      // Decrypt local delta cache if connecting to the same projectId and not resetting
      const localCache = !resetLocalData
        ? await loadEncryptedByobLocalCache(cleanByob.projectId, dek)
        : null;

      let syncAccounts: AccountEntity[] = [];
      let syncTxs: TransactionEntity[] = [];
      let syncCats: CategoryEntity[] = [];
      let syncBudgets: CategoryBudgetEntity[] = [];
      let syncRules: CategorizationRuleEntity[] = [];
      let syncMembers: FamilyMemberEntity[] = [adminMember];
      let syncSettlements: SharedSettlementEntity[] = [];
      let syncSimulations: BudgetSimulationEntity[] = [];
      let syncOutbox: SyncOutboxEntity[] = [];
      let baseSyncState: SyncStateEntity;

      if (localCache) {
        syncAccounts = localCache.accounts;
        syncTxs = localCache.transactions;
        syncCats = localCache.categories;
        syncBudgets = localCache.budgets;
        syncRules = localCache.rules;
        syncMembers = localCache.members.length > 0 ? localCache.members : [adminMember];
        syncSettlements = localCache.sharedSettlements || [];
        syncSimulations = localCache.simulations || [];
        syncOutbox = localCache.outbox || [];
        baseSyncState = {
          ...localCache.syncState,
          lastSyncStatus: 'SYNCING',
          lastSyncMessage:
            language === 'fr'
              ? 'Cache chiffré déverrouillé — Synchronisation delta Firestore...'
              : 'Encrypted cache unlocked — Delta syncing Firestore...'
        };

        const cachedOb = localCache.openBankingConfig;
        setOpenBankingConfig(
          cachedOb
            ? {
                ...DEFAULT_OPEN_BANKING_CONFIG,
                ...cachedOb,
                discoveredAccounts: cachedOb.isConnected ? (cachedOb.discoveredAccounts || []) : [],
                accountMappings: cachedOb.isConnected ? (cachedOb.accountMappings || {}) : {}
              }
            : DEFAULT_OPEN_BANKING_CONFIG
        );
        setCurrencyState(localCache.currency || '€');
        setAccounts(syncAccounts);
        setTransactions(syncTxs);
        setCategories(syncCats);
        setBudgets(syncBudgets);
        setRules(syncRules);
        setMembers(syncMembers);
        setSharedSettlements(syncSettlements);
        if (localCache.sharedPreset) {
          setSharedPreset(localCache.sharedPreset);
        }
        setSimulations(syncSimulations);
        setActiveSimulationId(null);
        setOutbox(syncOutbox);
        setActiveAccountId(null);
      } else {
        if (resetLocalData) {
          purgeLocalData({ preserveByob: true });
        }
        baseSyncState = {
          syncKey: 'primary_sync',
          lastPullTimestamp: 0,
          lastPushTimestamp: 0,
          lastSyncStatus: 'SYNCING',
          lastSyncMessage:
            language === 'fr' ? 'Téléchargement initial depuis Firestore...' : 'Initial pull from Firestore...',
          pendingOutboxCount: 0
        };

        setAccounts([]);
        setTransactions([]);
        setCategories([]);
        setBudgets([]);
        setRules([]);
        setMembers([adminMember]);
        setSharedSettlements([]);
        setSimulations([]);
        setActiveSimulationId(null);
        setOutbox([]);
        setActiveAccountId(null);
        setOpenBankingConfig(DEFAULT_OPEN_BANKING_CONFIG);
      }

      const nextConfig: FirebaseConfigEntity = {
        ...config,
        familyName: localCache?.familyName || cleanByob.familyName || 'Private Family Vault',
        projectId: cleanByob.projectId,
        apiKey: cleanByob.apiKey,
        applicationId: cleanByob.applicationId || '',
        currentUserEmail: user.email || '',
        currentUserName: user.displayName || user.email?.split('@')[0] || 'Admin',
        currentUserRole: 'ADMIN',
        isConfigured: true,
        isFamilyCreated: true,
        isGoogleAuthenticated: true,
        isBiometricLockEnabled: true,
        isAnonymous: false,
        syncStatusMessage: baseSyncState.lastSyncMessage || ''
      };

      setFirebaseUser(user);
      setConfig(nextConfig);
      setSyncState(baseSyncState);

      recordAuthTrace(`4/4 · Synchronisation Cloud Firestore (${cleanByob.projectId})...`);
      const result = await executeBidirectionalSync({
        accounts: syncAccounts,
        transactions: syncTxs,
        categories: syncCats,
        budgets: syncBudgets,
        rules: syncRules,
        members: syncMembers,
        sharedSettlements: syncSettlements,
        simulations: syncSimulations,
        outbox: syncOutbox,
        syncState: baseSyncState,
        config: nextConfig
      });

      applySyncResult(result, {
        accounts: syncAccounts,
        transactions: syncTxs,
        categories: syncCats,
        budgets: syncBudgets,
        rules: syncRules,
        members: syncMembers,
        sharedSettlements: syncSettlements,
        simulations: syncSimulations
      });

      const isOfflineWithCache =
        !result.success &&
        typeof navigator !== 'undefined' &&
        !navigator.onLine &&
        localCache !== null;

      if (result.success || isOfflineWithCache) {
        setSessionMode('FIRESTORE');
        setCurrentScreen('DASHBOARD');
        showToast(
          isOfflineWithCache
            ? language === 'fr'
              ? 'Mode hors-ligne : cache chiffré local chargé.'
              : 'Offline mode: encrypted local cache loaded.'
            : result.message
        );
        return { success: true, message: result.message };
      } else {
        showToast(result.message);
        return { success: false, error: result.message };
      }
    } catch (err: any) {
      const code = err?.code ? ` [${err.code}]` : '';
      const errMsg =
        (language === 'fr'
          ? `Erreur lors de l’initialisation ou de la connexion au coffre Firestore${code} : `
          : `Failed to initialize or connect to Firestore vault${code}: `) +
        (err?.message || String(err));
      console.error('completeByobSetupWithUser error:', err);
      setSyncState(prev => ({
        ...prev,
        lastSyncStatus: 'ERROR',
        lastSyncMessage: errMsg
      }));
      showToast(errMsg);
      return { success: false, error: errMsg };
    }
  };

  /**
   * Finalizes local unlock once DEK has been unwrapped/derived in memory.
   * Decrypts BYOB config, waits for Firebase Auth persistence, and opens Dashboard if already signed in.
   */
  const finalizeLocalUnlock = async (dek: CryptoKey): Promise<VaultActionResult> => {
    try {
      recordAuthTrace('Déchiffrement de la configuration BYOB locale...');
      const decryptedByob = await loadEncryptedByobConfig(dek);
      if (!decryptedByob) {
        recordAuthTrace('Échec du déchiffrement de la configuration locale');
        return {
          success: false,
          error:
            language === 'fr'
              ? 'Impossible de déchiffrer la configuration du coffre.'
              : 'Failed to decrypt saved vault configuration.'
        };
      }

      activeDekRef.current = dek;
      setSavedByobConfig(decryptedByob);
      setIsVaultUnlocked(true);
      setBiometricGateVerified(false);
      setConfig(prev => ({
        ...getEmptyConfig(decryptedByob),
        ...prev,
        projectId: decryptedByob.projectId,
        apiKey: decryptedByob.apiKey,
        applicationId: decryptedByob.applicationId || '',
        familyName: decryptedByob.familyName || 'Private Family Vault',
        isConfigured: true,
        isBiometricLockEnabled: true
      }));

      recordAuthTrace(`Vérification de session Firebase existante (${decryptedByob.projectId})...`);
      const auth = getOrInitAuth(decryptedByob);
      if (auth) {
        try {
          await Promise.race([
            auth.authStateReady(),
            new Promise<void>(resolve => setTimeout(resolve, 5000))
          ]);
        } catch {
          // Ignore authStateReady failure and fall back to currentUser check
        }
      }

      const activeFbUser = auth?.currentUser;
      if (activeFbUser && activeFbUser.email && activeFbUser.emailVerified) {
        recordAuthTrace(`Session Firebase active trouvée (${activeFbUser.email}) — synchronisation Firestore...`);
        const userInfo: AuthUserInfo = {
          uid: activeFbUser.uid,
          email: activeFbUser.email,
          displayName: activeFbUser.displayName,
          photoURL: activeFbUser.photoURL,
          emailVerified: activeFbUser.emailVerified
        };
        const syncRes = await completeByobSetupWithUser(decryptedByob, userInfo, false, dek);
        return {
          success: syncRes.success,
          vaultUnlocked: true,
          biometricVerified: true,
          error: syncRes.error
        };
      }

      recordAuthTrace('Coffre déverrouillé — authentification Google requise');
      return {
        success: false,
        vaultUnlocked: true,
        biometricVerified: true,
        needsGoogleAuth: true,
        error:
          language === 'fr'
            ? 'Coffre déchiffré. Connectez-vous avec votre compte Google pour ouvrir Firestore.'
            : 'Vault decrypted. Sign in with your Google account to open your Firestore vault.'
      };
    } catch (err: any) {
      const errMsg =
        (language === 'fr'
          ? 'Erreur lors du déverrouillage local du coffre : '
          : 'Error while finalizing local vault unlock: ') + (err?.message || String(err));
      recordAuthTrace(`Erreur finalizeLocalUnlock: ${err?.message || String(err)}`);
      console.error('finalizeLocalUnlock error:', err);
      return { success: false, error: errMsg };
    }
  };

  const unlockVaultWithBiometrics = async (): Promise<VaultActionResult> => {
    clearAuthTrace('Déverrouillage biométrique WebAuthn...');
    const meta = vaultLockMeta || loadVaultLockMeta();
    if (!meta || !hasEncryptedByobConfig()) {
      return {
        success: false,
        error:
          language === 'fr'
            ? 'Aucun coffre chiffré enregistré sur cet appareil.'
            : 'No encrypted vault found on this device.'
      };
    }

    if (!meta.credentialId) {
      return {
        success: false,
        error:
          language === 'fr'
            ? 'Aucune empreinte biométrique configurée sur ce coffre. Utilisez votre code PIN.'
            : 'No biometric credential enrolled for this vault. Use your Vault PIN.'
      };
    }

    const prfSalt = meta.prfSaltBase64 ? base64ToUint8(meta.prfSaltBase64) : undefined;
    const authRes = await authenticateWithBiometricPrf(meta.credentialId, prfSalt);

    if (!authRes.success) {
      recordAuthTrace(`Échec biométrie: ${authRes.error || 'cancelled'}`);
      return { success: false, error: authRes.error };
    }

    if (meta.wrappedDekPrf && meta.hkdfSaltBase64) {
      if (!authRes.prfSecret) {
        if (meta.wrappedDekPin) {
          setBiometricGateVerified(true);
          return {
            success: false,
            biometricVerified: true,
            needsPinForDecrypt: true,
            error:
              language === 'fr'
                ? 'Empreinte vérifiée, mais la clé matérielle PRF est indisponible. Saisissez votre code PIN.'
                : 'Fingerprint verified, but hardware PRF key was not returned. Enter your Vault PIN to decrypt.'
          };
        }
        return {
          success: false,
          biometricVerified: true,
          error:
            language === 'fr'
              ? 'Cet authenticateur n’a pas fourni la clé matérielle WebAuthn PRF requise.'
              : 'This authenticator did not return the required WebAuthn PRF key material.'
        };
      }

      try {
        const kek = await deriveKekFromPrfSecret(authRes.prfSecret, base64ToUint8(meta.hkdfSaltBase64));
        const rawDek = await unwrapDekWithKek(meta.wrappedDekPrf, kek);
        try {
          const dek = await importDekFromRaw(rawDek, false);
          resetPinBackoff();
          return await finalizeLocalUnlock(dek);
        } finally {
          rawDek.fill(0);
        }
      } catch {
        return {
          success: false,
          biometricVerified: true,
          error:
            language === 'fr'
              ? 'Échec du déchiffrement avec cette empreinte matérielle.'
              : 'Failed to unwrap vault key with this biometric credential.'
        };
      }
    }

    // Standard WebAuthn gate without PRF: biometric verified presence, now PIN unwraps DEK
    setBiometricGateVerified(true);
    return {
      success: false,
      biometricVerified: true,
      needsPinForDecrypt: true,
      error:
        language === 'fr'
          ? 'Empreinte vérifiée. Saisissez votre mot de passe / code PIN pour déchiffrer le stockage local.'
          : 'Fingerprint verified. Enter your Vault Passphrase to decrypt local storage.'
    };
  };

  const unlockVaultWithPin = async (pin: string): Promise<VaultActionResult> => {
    clearAuthTrace('Déchiffrement PBKDF2-SHA256 du coffre local...');
    const cleanPin = pin.trim();
    if (!cleanPin) {
      return {
        success: false,
        error: language === 'fr' ? 'Veuillez saisir votre mot de passe / PIN.' : 'Please enter your Vault Passphrase.'
      };
    }

    const now = Date.now();
    if (pinLockoutUntilRef.current > now) {
      const secs = Math.max(1, Math.ceil((pinLockoutUntilRef.current - now) / 1000));
      setPinLockoutSecondsRemaining(secs);
      return {
        success: false,
        error:
          language === 'fr'
            ? `Trop de tentatives incorrectes. Réessayez dans ${secs}s.`
            : `Too many failed attempts. Try again in ${secs}s.`
      };
    }

    const meta = vaultLockMeta || loadVaultLockMeta();
    if (!meta || !meta.wrappedDekPin || !meta.pinSaltBase64 || !hasEncryptedByobConfig()) {
      return {
        success: false,
        error:
          language === 'fr'
            ? 'Aucun mot de passe configuré pour ce coffre. Utilisez votre empreinte biométrique.'
            : 'No Vault Passphrase is configured for this vault. Unlock with your fingerprint.'
      };
    }

    try {
      const kek = await deriveKekFromPin(
        cleanPin,
        base64ToUint8(meta.pinSaltBase64),
        meta.kdfIterations || PBKDF2_ITERATIONS
      );
      const rawDek = await unwrapDekWithKek(meta.wrappedDekPin, kek);
      try {
        const dek = await importDekFromRaw(rawDek, false);
        resetPinBackoff();
        return await finalizeLocalUnlock(dek);
      } finally {
        rawDek.fill(0);
      }
    } catch (err: any) {
      const isWrongTag =
        err?.name === 'OperationError' ||
        String(err?.message || '').toLowerCase().includes('decrypt');
      if (!isWrongTag) {
        const unexpectedErr =
          (language === 'fr'
            ? 'Erreur cryptographique lors du déchiffrement local : '
            : 'Cryptographic error decrypting local vault: ') + (err?.message || String(err));
        console.error('unlockVaultWithPin error:', err);
        return {
          success: false,
          error: unexpectedErr
        };
      }
      const attempts = ++failedPinAttemptsRef.current;
      if (attempts >= 3) {
        const penaltySec = Math.min(300, Math.pow(2, attempts - 2) * 5);
        pinLockoutUntilRef.current = Date.now() + penaltySec * 1000;
        setPinLockoutSecondsRemaining(penaltySec);
        return {
          success: false,
          error:
            language === 'fr'
              ? `Mot de passe du coffre incorrect. Verrouillage temporaire de ${penaltySec}s.`
              : `Incorrect Vault Passphrase. Temporarily locked for ${penaltySec}s.`
        };
      }
      return {
        success: false,
        error: language === 'fr' ? 'Mot de passe / PIN du coffre incorrect.' : 'Incorrect Vault Passphrase.'
      };
    }
  };

  /**
   * Configures mandatory local AES-256-GCM encryption (WebAuthn PRF biometric key and/or 8+ char passphrase),
   * encrypts the BYOB config before disk persistence, and then runs Google Sign-In.
   */
  const setupProtectedVaultAndConnect = async (
    byob: { projectId: string; apiKey: string; applicationId?: string; familyName?: string },
    protection: VaultProtectionInput,
    options?: { resetLocalData?: boolean }
  ): Promise<VaultActionResult> => {
    clearAuthTrace('1/4 · Dérivation des clés AES-256-GCM locales...');
    try {
      const hasPrf = Boolean(protection.biometricCredId && protection.prfSecret && protection.prfSalt);
      const cleanPin = protection.pin?.trim() || '';
      const hasPin = cleanPin.length >= MIN_VAULT_PASSPHRASE_LENGTH;

      if (!hasPrf && !hasPin) {
        return {
          success: false,
          error:
            language === 'fr'
              ? `Protection requise : enregistrez une empreinte WebAuthn PRF ou définissez un mot de passe (${MIN_VAULT_PASSPHRASE_LENGTH} caractères min.).`
              : `Protection required: enroll a WebAuthn PRF fingerprint or set a Vault Passphrase (min. ${MIN_VAULT_PASSPHRASE_LENGTH} characters).`
        };
      }

      const cleanByob: SavedByobConfig = {
        projectId: byob.projectId.trim(),
        apiKey: byob.apiKey.trim(),
        applicationId: byob.applicationId?.trim() || '',
        familyName: byob.familyName?.trim() || 'Private Family Vault'
      };

      const rawDek = generateRawDek();
      let dek: CryptoKey;
      const meta: VaultLockMeta = {
        v: 3,
        encryptionMode: hasPrf && hasPin ? 'HYBRID' : hasPrf ? 'WEBAUTHN_PRF' : 'PIN_WRAPPED',
        kdfIterations: hasPin ? PBKDF2_ITERATIONS : undefined,
        credentialId: protection.biometricCredId,
        updatedAt: Date.now()
      };

      try {
        if (hasPrf && protection.prfSecret && protection.prfSalt) {
          recordAuthTrace('1/4 · Dérivation HKDF depuis WebAuthn PRF...');
          const hkdfSalt = generateRandomBytes(16);
          const kekPrf = await deriveKekFromPrfSecret(protection.prfSecret, hkdfSalt);
          meta.prfSaltBase64 = uint8ToBase64(protection.prfSalt);
          meta.hkdfSaltBase64 = uint8ToBase64(hkdfSalt);
          meta.wrappedDekPrf = await wrapDekWithKek(rawDek, kekPrf);
        }

        if (hasPin) {
          recordAuthTrace(`1/4 · Dérivation PBKDF2 (${PBKDF2_ITERATIONS.toLocaleString()} itérations)...`);
          const pinSalt = generateRandomBytes(16);
          const kekPin = await deriveKekFromPin(cleanPin, pinSalt, PBKDF2_ITERATIONS);
          meta.pinSaltBase64 = uint8ToBase64(pinSalt);
          meta.wrappedDekPin = await wrapDekWithKek(rawDek, kekPin);
        }

        dek = await importDekFromRaw(rawDek, false);
      } finally {
        rawDek.fill(0);
      }

      recordAuthTrace('2/4 · Sauvegarde chiffrée du coffre dans localStorage...');
      saveVaultLockMeta(meta);
      setVaultLockMeta(meta);
      await saveEncryptedByobConfig(cleanByob, dek);

      resetPinBackoff();
      activeDekRef.current = dek;
      setSavedByobConfig(cleanByob);
      setHasSavedVault(true);
      setIsVaultUnlocked(true);
      setLegacyPlaintextConfig(null);
      setLegacyV2VaultDetected(false);

      const isSameProject = savedByobConfig?.projectId?.trim() === cleanByob.projectId;
      const shouldReset = options?.resetLocalData !== undefined ? options.resetLocalData : !isSameProject;

      recordAuthTrace('3/4 · Demande d’authentification Google OAuth...');
      const googleRes = await signInWithGoogle(cleanByob, {
        projectId: cleanByob.projectId,
        apiKey: cleanByob.apiKey,
        applicationId: cleanByob.applicationId || '',
        familyName: cleanByob.familyName || 'Private Family Vault',
        resetLocalData: shouldReset
      });

      if (googleRes.redirecting) {
        return {
          success: false,
          redirecting: true,
          vaultUnlocked: true,
          error: googleRes.error
        };
      }

      if (!googleRes.success || !googleRes.user) {
        return {
          success: false,
          vaultUnlocked: true,
          needsGoogleAuth: true,
          error:
            googleRes.error ||
            (language === 'fr' ? 'Échec de l’authentification Google' : 'Google authentication failed')
        };
      }

      const syncRes = await completeByobSetupWithUser(cleanByob, googleRes.user, shouldReset, dek);
      return {
        success: syncRes.success,
        vaultUnlocked: true,
        error: syncRes.error,
        message: syncRes.message
      };
    } catch (err: any) {
      const code = err?.code ? ` [${err.code}]` : '';
      const csp = formatCspSummary();
      const errMsg =
        (language === 'fr'
          ? `Erreur lors de la création du coffre ou de la connexion Google${code} : `
          : `Error while setting up vault or connecting to Google${code}: `) +
        (err?.message || String(err)) +
        (csp ? `\n\n${csp}` : '');
      recordAuthTrace(`Échec setupProtectedVaultAndConnect: ${err?.message || String(err)}`);
      console.error('setupProtectedVaultAndConnect error:', err);
      return {
        success: false,
        error: errMsg
      };
    }
  };

  /**
   * Proceeds with Google Sign-In ONLY AFTER the vault DEK is already unlocked in memory.
   */
  const continueUnlockedByobWithGoogle = async (overrideByob?: {
    projectId: string;
    apiKey: string;
    applicationId?: string;
    familyName?: string;
  }): Promise<VaultActionResult> => {
    clearAuthTrace('1/3 · Préparation de la session Google OAuth...');
    try {
      const dek = activeDekRef.current;
      if (!isVaultUnlocked || !dek) {
        return {
          success: false,
          error:
            language === 'fr'
              ? 'Déverrouillage local requis (empreinte ou mot de passe) avant la connexion Google.'
              : 'Local unlock (fingerprint or passphrase) is required before Google Sign-In.'
        };
      }

      const targetByob = overrideByob
        ? {
            projectId: overrideByob.projectId.trim(),
            apiKey: overrideByob.apiKey.trim(),
            applicationId: overrideByob.applicationId?.trim() || '',
            familyName: overrideByob.familyName?.trim() || 'Private Family Vault'
          }
        : savedByobConfig || (await loadEncryptedByobConfig(dek));

      if (!targetByob) {
        return {
          success: false,
          error:
            language === 'fr'
              ? 'Configuration du coffre introuvable.'
              : 'Vault configuration not found.'
        };
      }

      const isSameProject = savedByobConfig?.projectId?.trim() === targetByob.projectId;
      if (overrideByob) {
        recordAuthTrace('1/3 · Mise à jour de la config BYOB chiffrée...');
        await saveEncryptedByobConfig(targetByob, dek);
        setSavedByobConfig(targetByob);
      }

      recordAuthTrace(`2/3 · Vérification de l’état Firebase Auth (${targetByob.projectId})...`);
      const auth = getOrInitAuth(targetByob);
      if (auth) {
        try {
          await Promise.race([
            auth.authStateReady(),
            new Promise<void>(resolve => setTimeout(resolve, 5000))
          ]);
        } catch {
          // Ignore
        }
      }

      const existingUser = auth?.currentUser;
      if (existingUser && existingUser.email && existingUser.emailVerified && isSameProject) {
        recordAuthTrace(`Session Google active détectée (${existingUser.email}) — synchronisation Firestore...`);
        const userInfo: AuthUserInfo = {
          uid: existingUser.uid,
          email: existingUser.email,
          displayName: existingUser.displayName,
          photoURL: existingUser.photoURL,
          emailVerified: existingUser.emailVerified
        };
        const syncRes = await completeByobSetupWithUser(targetByob, userInfo, false, dek);
        return {
          success: syncRes.success,
          vaultUnlocked: true,
          error: syncRes.error
        };
      }

      recordAuthTrace('2/3 · Ouverture de la connexion Google OAuth...');
      const googleRes = await signInWithGoogle(targetByob, {
        projectId: targetByob.projectId,
        apiKey: targetByob.apiKey,
        applicationId: targetByob.applicationId || '',
        familyName: targetByob.familyName || 'Private Family Vault',
        resetLocalData: !isSameProject
      });

      if (googleRes.redirecting) {
        return {
          success: false,
          redirecting: true,
          vaultUnlocked: true,
          error: googleRes.error
        };
      }

      if (!googleRes.success || !googleRes.user) {
        return {
          success: false,
          vaultUnlocked: true,
          needsGoogleAuth: true,
          error:
            googleRes.error ||
            (language === 'fr' ? 'Échec de l’authentification Google' : 'Google authentication failed')
        };
      }

      const syncRes = await completeByobSetupWithUser(targetByob, googleRes.user, !isSameProject, dek);
      return {
        success: syncRes.success,
        vaultUnlocked: true,
        error: syncRes.error
      };
    } catch (err: any) {
      const code = err?.code ? ` [${err.code}]` : '';
      const csp = formatCspSummary();
      const errMsg =
        (language === 'fr'
          ? `Erreur lors de la connexion Google / Firestore${code} : `
          : `Error connecting to Google / Firestore${code}: `) +
        (err?.message || String(err)) +
        (csp ? `\n\n${csp}` : '');
      recordAuthTrace(`Échec continueUnlockedByobWithGoogle: ${err?.message || String(err)}`);
      console.error('continueUnlockedByobWithGoogle error:', err);
      return {
        success: false,
        vaultUnlocked: true,
        error: errMsg
      };
    }
  };

  /**
   * Transiently unwraps the encrypted DEK using fresh step-up verification
   * (current Vault Passphrase or WebAuthn PRF assertion) so the active runtime DEK
   * remains strictly non-extractable during normal operation.
   */
  const obtainRawDekForRotation = async (
    currentMeta: VaultLockMeta,
    currentPin?: string
  ): Promise<{ rawDek?: Uint8Array; error?: string }> => {
    const cleanCurrentPin = currentPin?.trim() || '';

    if (cleanCurrentPin && currentMeta.wrappedDekPin && currentMeta.pinSaltBase64) {
      try {
        const kekPin = await deriveKekFromPin(
          cleanCurrentPin,
          base64ToUint8(currentMeta.pinSaltBase64),
          currentMeta.kdfIterations || PBKDF2_ITERATIONS
        );
        const rawDek = await unwrapDekWithKek(currentMeta.wrappedDekPin, kekPin);
        return { rawDek };
      } catch {
        return {
          error:
            language === 'fr'
              ? 'Le mot de passe / PIN actuel saisi est incorrect.'
              : 'The current Vault Passphrase entered is incorrect.'
        };
      }
    }

    if (
      currentMeta.wrappedDekPrf &&
      currentMeta.hkdfSaltBase64 &&
      currentMeta.credentialId
    ) {
      const prfSalt = currentMeta.prfSaltBase64
        ? base64ToUint8(currentMeta.prfSaltBase64)
        : undefined;
      const authRes = await authenticateWithBiometricPrf(currentMeta.credentialId, prfSalt);
      if (authRes.success && authRes.prfSecret) {
        try {
          const kekPrf = await deriveKekFromPrfSecret(
            authRes.prfSecret,
            base64ToUint8(currentMeta.hkdfSaltBase64)
          );
          const rawDek = await unwrapDekWithKek(currentMeta.wrappedDekPrf, kekPrf);
          return { rawDek };
        } catch {
          // Fall through to PIN error message if wrapped PRF key failed
        }
      }
      if (currentMeta.wrappedDekPin) {
        return {
          error:
            language === 'fr'
              ? 'Saisissez votre mot de passe / PIN actuel pour confirmer ce changement de sécurité.'
              : 'Enter your current Vault Passphrase to authorize this security change.'
        };
      }
      return {
        error:
          authRes.error ||
          (language === 'fr'
            ? 'Vérification biométrique requise pour modifier les clés du coffre.'
            : 'Biometric verification is required to rotate vault keys.')
      };
    }

    return {
      error:
        language === 'fr'
          ? 'Veuillez saisir votre mot de passe / PIN actuel pour confirmer ce changement de sécurité.'
          : 'Please enter your current Vault Passphrase to authorize this security change.'
    };
  };

  const enrollOrUpdateBiometrics = async (
    currentPin?: string
  ): Promise<{
    success: boolean;
    prfSupported?: boolean;
    error?: string;
  }> => {
    const dek = activeDekRef.current;
    const currentMeta = vaultLockMeta || loadVaultLockMeta();
    if (!dek || !currentMeta) {
      return {
        success: false,
        error: language === 'fr' ? 'Le coffre doit être déverrouillé.' : 'Vault must be unlocked.'
      };
    }

    const stepUp = await obtainRawDekForRotation(currentMeta, currentPin);
    if (!stepUp.rawDek) {
      return { success: false, error: stepUp.error };
    }

    const rawDek = stepUp.rawDek;
    try {
      const prfSalt = generateRandomBytes(32);
      const enrollRes = await enrollBiometricWithPrf(
        firebaseUser?.displayName || config.currentUserName || 'Vault Owner',
        firebaseUser?.email || config.currentUserEmail || 'vault@family.local',
        prfSalt
      );

      if (!enrollRes.success || !enrollRes.credentialId) {
        return { success: false, error: enrollRes.error };
      }

      if (!enrollRes.prfSupported && !currentMeta.wrappedDekPin) {
        return {
          success: false,
          prfSupported: false,
          error:
            language === 'fr'
              ? 'Ce navigateur ne supporte pas WebAuthn PRF. Définissez d’abord un mot de passe de secours.'
              : 'This browser does not support WebAuthn PRF. Set a backup Vault Passphrase first.'
        };
      }

      const nextMeta: VaultLockMeta = {
        ...currentMeta,
        v: 3,
        credentialId: enrollRes.credentialId,
        updatedAt: Date.now()
      };

      if (enrollRes.prfSupported && enrollRes.prfSecret) {
        const hkdfSalt = generateRandomBytes(16);
        const kekPrf = await deriveKekFromPrfSecret(enrollRes.prfSecret, hkdfSalt);
        nextMeta.prfSaltBase64 = uint8ToBase64(prfSalt);
        nextMeta.hkdfSaltBase64 = uint8ToBase64(hkdfSalt);
        nextMeta.wrappedDekPrf = await wrapDekWithKek(rawDek, kekPrf);
        nextMeta.encryptionMode = nextMeta.wrappedDekPin ? 'HYBRID' : 'WEBAUTHN_PRF';
      } else {
        delete nextMeta.prfSaltBase64;
        delete nextMeta.hkdfSaltBase64;
        delete nextMeta.wrappedDekPrf;
        nextMeta.encryptionMode = 'PIN_WRAPPED';
      }

      saveVaultLockMeta(nextMeta);
      setVaultLockMeta(nextMeta);
      return { success: true, prfSupported: enrollRes.prfSupported };
    } finally {
      rawDek.fill(0);
    }
  };

  const updateVaultPin = async (
    newPin: string,
    currentPin?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanPin = newPin.trim();
    if (cleanPin.length < MIN_VAULT_PASSPHRASE_LENGTH) {
      return {
        success: false,
        error:
          language === 'fr'
            ? `Le mot de passe du coffre doit contenir au moins ${MIN_VAULT_PASSPHRASE_LENGTH} caractères.`
            : `Vault Passphrase must be at least ${MIN_VAULT_PASSPHRASE_LENGTH} characters.`
      };
    }

    const dek = activeDekRef.current;
    const currentMeta = vaultLockMeta || loadVaultLockMeta();
    if (!dek || !currentMeta) {
      return {
        success: false,
        error: language === 'fr' ? 'Le coffre doit être déverrouillé.' : 'Vault must be unlocked.'
      };
    }

    const stepUp = await obtainRawDekForRotation(currentMeta, currentPin);
    if (!stepUp.rawDek) {
      return { success: false, error: stepUp.error };
    }

    const rawDek = stepUp.rawDek;
    try {
      const pinSalt = generateRandomBytes(16);
      const kekPin = await deriveKekFromPin(cleanPin, pinSalt, PBKDF2_ITERATIONS);
      const wrappedDekPin = await wrapDekWithKek(rawDek, kekPin);

      const nextMeta: VaultLockMeta = {
        ...currentMeta,
        v: 3,
        kdfIterations: PBKDF2_ITERATIONS,
        pinSaltBase64: uint8ToBase64(pinSalt),
        wrappedDekPin,
        encryptionMode: currentMeta.wrappedDekPrf ? 'HYBRID' : 'PIN_WRAPPED',
        updatedAt: Date.now()
      };

      saveVaultLockMeta(nextMeta);
      setVaultLockMeta(nextMeta);
      return { success: true };
    } finally {
      rawDek.fill(0);
    }
  };

  const removeVaultPin = async (): Promise<{ success: boolean; error?: string }> => {
    const currentMeta = vaultLockMeta || loadVaultLockMeta();
    if (!currentMeta) return { success: false };
    if (!currentMeta.wrappedDekPrf) {
      return {
        success: false,
        error:
          language === 'fr'
            ? 'Impossible de retirer le code PIN sans clé biométrique WebAuthn PRF active.'
            : 'Cannot remove Vault PIN unless WebAuthn PRF hardware key is active.'
      };
    }

    const nextMeta: VaultLockMeta = {
      ...currentMeta,
      encryptionMode: 'WEBAUTHN_PRF',
      updatedAt: Date.now()
    };
    delete nextMeta.pinSaltBase64;
    delete nextMeta.wrappedDekPin;

    saveVaultLockMeta(nextMeta);
    setVaultLockMeta(nextMeta);
    return { success: true };
  };

  const removeBiometrics = async (): Promise<{ success: boolean; error?: string }> => {
    const currentMeta = vaultLockMeta || loadVaultLockMeta();
    if (!currentMeta) return { success: false };
    if (!currentMeta.wrappedDekPin) {
      return {
        success: false,
        error:
          language === 'fr'
            ? 'Définissez d’abord un code PIN avant de retirer votre empreinte.'
            : 'Set a Vault PIN first before removing fingerprint unlock.'
      };
    }

    clearBiometricCredential();
    const nextMeta: VaultLockMeta = {
      ...currentMeta,
      encryptionMode: 'PIN_WRAPPED',
      updatedAt: Date.now()
    };
    delete nextMeta.credentialId;
    delete nextMeta.prfSaltBase64;
    delete nextMeta.hkdfSaltBase64;
    delete nextMeta.wrappedDekPrf;

    saveVaultLockMeta(nextMeta);
    setVaultLockMeta(nextMeta);
    return { success: true };
  };

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!isVaultUnlocked || !activeDekRef.current) {
        return {
          success: false,
          error:
            language === 'fr'
              ? 'Déverrouillez le coffre avant de vous connecter avec Google.'
              : 'Unlock your vault before signing in with Google.'
        };
      }

      const res = await signInWithGoogle(config);
      if (res.success && res.user) {
        setFirebaseUser(res.user);
        const updatedCfg: FirebaseConfigEntity = {
          ...config,
          isGoogleAuthenticated: true,
          currentUserEmail: res.user.email || '',
          currentUserName: res.user.displayName || '',
          isConfigured: true,
          isAnonymous: false,
          syncStatusMessage: `Connecté (${res.user.email})`
        };
        setConfig(updatedCfg);
        showToast(language === 'fr' ? `Connecté avec Google (${res.user.email})` : `Signed in as ${res.user.email}`);

        const result = await executeBidirectionalSync({
          accounts,
          transactions,
          categories,
          budgets,
          rules,
          members,
          sharedSettlements,
          simulations,
          outbox,
          syncState,
          config: updatedCfg
        });
        applySyncResult(result, {
          accounts,
          transactions,
          categories,
          budgets,
          rules,
          members,
          sharedSettlements,
          simulations
        });
        if (result.success) {
          setSessionMode('FIRESTORE');
        }
        return { success: result.success, error: result.success ? undefined : result.message };
      } else if (res.error) {
        showToast(res.error);
        return { success: false, error: res.error };
      }
      return {
        success: false,
        error:
          language === 'fr'
            ? 'La connexion Google a échoué sans renvoyer d’utilisateur.'
            : 'Google Sign-In failed without returning a user.'
      };
    } catch (err: any) {
      const code = err?.code ? ` [${err.code}]` : '';
      const errMsg =
        (language === 'fr'
          ? `Erreur lors de la connexion Google / Firestore${code} : `
          : `Google / Firestore sign-in error${code}: `) +
        (err?.message || String(err));
      console.error('loginWithGoogle error:', err);
      showToast(errMsg);
      return { success: false, error: errMsg };
    }
  };

  const updateOpenBankingConfig = (patch: Partial<OpenBankingConfig>) => {
    setOpenBankingConfig(prev => ({ ...prev, ...patch }));
  };

  const testOpenBankingConn = async (overrideConfig?: Partial<OpenBankingConfig>) => {
    return await testOpenBankingConnection({ ...openBankingConfig, ...overrideConfig });
  };

  const syncOpenBankingNow = async () => {
    if (!openBankingConfig.isConnected) {
      showToast(
        language === 'fr'
          ? 'Veuillez d’abord configurer et connecter vos identifiants Open Banking.'
          : 'Please configure and connect your Open Banking credentials first.'
      );
      return;
    }

    updateOpenBankingConfig({ status: 'SYNCING' });
    try {
      const res = await executeOpenBankingSync(
        openBankingConfig,
        accounts,
        transactions,
        rules,
        categories,
        budgets
      );
      setTransactions(res.newTransactions);
      setAccounts(res.updatedAccounts);
      updateOpenBankingConfig({
        status: 'CONNECTED',
        isConnected: true,
        discoveredAccounts: res.remoteAccounts,
        lastSyncTimestamp: Date.now(),
        statusMessage: res.summaryMessage
      });
      showToast(res.summaryMessage);
    } catch (err: any) {
      updateOpenBankingConfig({
        status: 'ERROR',
        statusMessage: err.message || 'Erreur lors de la synchronisation bancaire'
      });
      showToast(language === 'fr' ? 'Erreur synchro open-banking.io' : 'Open Banking sync error');
    }
  };

  return (
    <BudgetContext.Provider
      value={{
        sessionMode,
        savedByobConfig,
        vaultLockMeta,
        hasSavedVault,
        isVaultUnlocked,
        biometricGateVerified,
        legacyPlaintextConfig,
        legacyV2VaultDetected,
        pinLockoutSecondsRemaining,
        authInitialized,

        accounts: accounts.filter(a => !a.isDeleted),
        transactions: transactions.filter(t => !t.isDeleted),
        categories: categories.filter(c => !c.isDeleted),
        budgets: budgets.filter(b => !b.isDeleted),
        rules: rules.filter(r => !r.isDeleted),
        members: members.filter(m => !m.isDeleted),
        sharedSettlements: sharedSettlements.filter(s => !s.isDeleted),
        sharedPreset,
        simulations: visibleSimulations,
        activeSimulationId: activeSimulation ? activeSimulation.id : null,
        activeSimulation,
        effectiveCategories: effectiveCategories.filter(c => !c.isDeleted),
        effectiveBudgets: effectiveBudgets.filter(b => !b.isDeleted),
        config,
        syncState,
        openBankingConfig,
        language,
        themePreference,
        resolvedTheme,
        currency,
        currentScreen,
        activeAccountId,
        transactionFilters,
        toastMessage,

        navigateTo,
        setLanguage,
        setThemePreference,
        setCurrency,
        setActiveAccountId,
        setTransactionFilters,
        resetTransactionFilters,
        drillDownToTransactions,
        showToast,
        dismissToast,

        startDemoMode,
        lockVault,
        logout,
        forgetByobConfig,
        unlockVaultWithBiometrics,
        unlockVaultWithPin,
        setupProtectedVaultAndConnect,
        continueUnlockedByobWithGoogle,
        enrollOrUpdateBiometrics,
        updateVaultPin,
        removeVaultPin,
        removeBiometrics,

        addTransaction,
        updateTransaction,
        deleteTransaction,
        splitTransaction,
        unsplitTransaction,
        transferBetweenAccounts,
        reconcilePair,

        addAccount,
        updateAccount,
        deleteAccount,
        updateAccountBalance,

        addCategory,
        updateCategory,
        deleteCategory,

        addBudget,
        updateBudget,
        deleteBudget,

        setActiveSimulationId,
        createSimulation,
        duplicateSimulation,
        renameSimulation,
        deleteSimulation,

        addRule,
        updateRule,
        deleteRule,

        addSharedSettlement,
        deleteSharedSettlement,
        updateSharedPreset,

        addMember,
        updateMember,
        deleteMember,

        importCsvTransactions,
        updateConfig,
        syncWithFirebaseNow,
        resetToMockData,

        updateOpenBankingConfig,
        syncOpenBankingNow,
        testOpenBankingConn,

        firebaseUser,
        loginWithGoogle
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudget = () => {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error('useBudget must be used within a BudgetProvider');
  }
  return context;
};
