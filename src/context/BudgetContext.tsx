import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import {
  AccountEntity,
  AppScreen,
  CategorizationRuleEntity,
  CategoryBudgetEntity,
  CategoryEntity,
  FamilyMemberEntity,
  FirebaseConfigEntity,
  OpenBankingConfig,
  OpenBankingAccountDto,
  SyncOutboxEntity,
  SyncStateEntity,
  TransactionEntity
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
  loadEncryptedByobConfig,
  loadEncryptedByobLocalCache,
  loadLanguagePreference,
  loadLegacyPlaintextByobConfig,
  loadVaultLockMeta,
  purgeLocalData,
  saveEncryptedByobConfig,
  saveEncryptedCachedData,
  saveLanguagePreference,
  saveVaultLockMeta
} from '../utils/storage';
import {
  authenticateWithBiometricPrf,
  clearBiometricCredential,
  enrollBiometricWithPrf
} from '../utils/biometricKeyvault';
import {
  base64ToUint8,
  deriveKekFromPin,
  deriveKekFromPrfSecret,
  exportDekRaw,
  generateRandomBytes,
  generateRawDek,
  importDekFromRaw,
  uint8ToBase64,
  unwrapDekWithKek,
  wrapDekWithKek
} from '../utils/crypto';
import { ParsedBankRow } from '../utils/csvParser';
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

export type SessionMode = 'DEMO' | 'FIRESTORE' | null;

export interface VaultProtectionInput {
  biometricCredId?: string;
  prfSecret?: ArrayBuffer;
  prfSalt?: Uint8Array;
  pin?: string;
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
  authInitialized: boolean;

  accounts: AccountEntity[];
  transactions: TransactionEntity[];
  categories: CategoryEntity[];
  budgets: CategoryBudgetEntity[];
  rules: CategorizationRuleEntity[];
  members: FamilyMemberEntity[];
  config: FirebaseConfigEntity;
  syncState: SyncStateEntity;
  openBankingConfig: OpenBankingConfig;
  language: 'fr' | 'en';
  currency: string;
  currentScreen: AppScreen;
  activeAccountId: string | null;
  toastMessage: string | null;

  navigateTo: (screen: AppScreen) => void;
  setLanguage: (lang: 'fr' | 'en') => void;
  setCurrency: (cur: string) => void;
  setActiveAccountId: (id: string | null) => void;
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
  enrollOrUpdateBiometrics: () => Promise<{ success: boolean; prfSupported?: boolean; error?: string }>;
  updateVaultPin: (newPin: string) => Promise<{ success: boolean; error?: string }>;
  removeVaultPin: () => Promise<{ success: boolean; error?: string }>;
  removeBiometrics: () => Promise<{ success: boolean; error?: string }>;

  addTransaction: (tx: Omit<TransactionEntity, 'id' | 'updatedAt' | 'isDeleted'>) => number;
  updateTransaction: (tx: TransactionEntity) => void;
  deleteTransaction: (id: number) => void;
  splitTransaction: (
    parentId: number,
    splits: { categoryId: number; categoryName: string; budgetId: number; budgetTitle: string; amount: number; notes: string }[]
  ) => void;
  transferBetweenAccounts: (
    sourceAccId: string,
    targetAccId: string,
    amount: number,
    notes: string,
    transferType?: 'TO_SAVINGS' | 'FROM_SAVINGS' | 'CARD_SETTLEMENT' | 'GENERAL_TRANSFER'
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

  addRule: (r: Omit<CategorizationRuleEntity, 'id' | 'updatedAt' | 'isDeleted'>) => void;
  updateRule: (r: CategorizationRuleEntity) => void;
  deleteRule: (id: number) => void;

  importCsvTransactions: (records: ParsedBankRow[], targetAccountId: string) => number;
  updateConfig: (patch: Partial<FirebaseConfigEntity>) => void;
  syncWithFirebaseNow: (options?: { forceFullPull?: boolean; resetCacheBeforePull?: boolean }) => Promise<void>;
  resetToMockData: (lang?: 'fr' | 'en') => void;

  updateOpenBankingConfig: (patch: Partial<OpenBankingConfig>) => void;
  syncOpenBankingNow: () => Promise<void>;
  testOpenBankingConn: () => Promise<{ success: boolean; message: string; accounts: OpenBankingAccountDto[] }>;

  firebaseUser: AuthUserInfo | null;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export const BudgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vaultLockMeta, setVaultLockMeta] = useState<VaultLockMeta | null>(() => loadVaultLockMeta());
  const [hasSavedVault, setHasSavedVault] = useState<boolean>(() => hasEncryptedByobConfig());
  const [legacyPlaintextConfig, setLegacyPlaintextConfig] = useState<SavedByobConfig | null>(() =>
    hasEncryptedByobConfig() ? null : loadLegacyPlaintextByobConfig()
  );
  const [isVaultUnlocked, setIsVaultUnlocked] = useState<boolean>(false);
  const [biometricGateVerified, setBiometricGateVerified] = useState<boolean>(false);
  const [savedByobConfig, setSavedByobConfig] = useState<SavedByobConfig | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>(null);
  const [authInitialized, setAuthInitialized] = useState<boolean>(true);

  const [language, setLangState] = useState<'fr' | 'en'>(() => loadLanguagePreference());
  const [currency, setCurrencyState] = useState<string>('€');

  // Empty before unlock & login; hydrated strictly from encrypted local cache + delta sync on unlock
  const [accounts, setAccounts] = useState<AccountEntity[]>([]);
  const [transactions, setTransactions] = useState<TransactionEntity[]>([]);
  const [categories, setCategories] = useState<CategoryEntity[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudgetEntity[]>([]);
  const [rules, setRules] = useState<CategorizationRuleEntity[]>([]);
  const [members, setMembers] = useState<FamilyMemberEntity[]>([]);
  const [outbox, setOutbox] = useState<SyncOutboxEntity[]>([]);
  const [config, setConfig] = useState<FirebaseConfigEntity>(() => getEmptyConfig(null));
  const [syncState, setSyncState] = useState<SyncStateEntity>(() => getEmptySyncState());
  const [openBankingConfig, setOpenBankingConfig] = useState<OpenBankingConfig>(DEFAULT_OPEN_BANKING_CONFIG);

  const [currentScreen, setCurrentScreen] = useState<AppScreen>('DASHBOARD');
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<AuthUserInfo | null>(null);

  const isSyncingRef = useRef(false);
  const activeDekRef = useRef<CryptoKey | null>(null);
  const persistCounterRef = useRef(0);

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

    if (result.incomingFamilyName) {
      setConfig(prev => ({
        ...prev,
        familyName: result.incomingFamilyName || prev.familyName
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
      checkRedirectAuthResult(tempCfg).then(user => {
        if (user && user.email) {
          setFirebaseUser(user);
          showToast(
            language === 'fr'
              ? 'Connexion Google validée. Déverrouillez le coffre avec votre empreinte ou code PIN.'
              : 'Google Sign-In completed. Unlock your vault with your fingerprint or PIN.'
          );
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

  const setLanguage = (lang: 'fr' | 'en') => {
    setLangState(lang);
    saveLanguagePreference(lang);
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
    setConfig(data.config);
    setSyncState(data.syncState);
    setOutbox([]);
    setActiveAccountId(null);
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
    setOutbox([]);
    setActiveAccountId(null);
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
    const targetCfg = savedByobConfig || config;
    await signOutGoogle(targetCfg);
    await resetFirebaseInstances();
    clearByobConfig();
    clearVaultLockMeta();
    clearBiometricCredential();
    purgeLocalData({ preserveByob: false });
    activeDekRef.current = null;
    setIsVaultUnlocked(false);
    setBiometricGateVerified(false);
    setSavedByobConfig(null);
    setVaultLockMeta(null);
    setHasSavedVault(false);
    setLegacyPlaintextConfig(null);
    eraseAllSessionMemory(null);
    showToast(
      language === 'fr'
        ? 'Configuration BYOB oubliée et toutes les données effacées.'
        : 'Saved Firestore BYOB configuration and all local data cleared.'
    );
  };

  // Transaction mutations
  const addTransaction = (tx: Omit<TransactionEntity, 'id' | 'updatedAt' | 'isDeleted'>): number => {
    const nextId = Math.max(0, ...transactions.map(t => t.id)) + 1;
    const now = Date.now();
    const newTx: TransactionEntity = {
      ...tx,
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

    showToast(language === 'fr' ? 'Transaction enregistrée' : 'Transaction saved');
    return nextId;
  };

  const updateTransaction = (updatedTx: TransactionEntity) => {
    const now = Date.now();
    const oldTx = transactions.find(t => t.id === updatedTx.id);

    setTransactions(prev =>
      prev.map(tx => (tx.id === updatedTx.id ? { ...updatedTx, updatedAt: now } : tx))
    );
    enqueueOutbox('TRANSACTION', `tx_${updatedTx.id}`, 'UPSERT');

    if (oldTx && oldTx.amount !== updatedTx.amount) {
      const diff = updatedTx.amount - oldTx.amount;
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id === updatedTx.accountId) {
            return {
              ...acc,
              currentBalance: Math.round((acc.currentBalance + diff) * 100) / 100,
              updatedAt: now
            };
          }
          return acc;
        })
      );
    }

    showToast(language === 'fr' ? 'Transaction mise à jour' : 'Transaction updated');
  };

  const deleteTransaction = (id: number) => {
    const target = transactions.find(t => t.id === id);
    if (!target) return;
    const now = Date.now();

    setTransactions(prev =>
      prev.map(tx => (tx.id === id ? { ...tx, isDeleted: true, updatedAt: now } : tx))
    );
    enqueueOutbox('TRANSACTION', `tx_${id}`, 'DELETE');

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

    showToast(language === 'fr' ? 'Transaction supprimée' : 'Transaction deleted');
  };

  const splitTransaction = (
    parentId: number,
    splits: { categoryId: number; categoryName: string; budgetId: number; budgetTitle: string; amount: number; notes: string }[]
  ) => {
    const parent = transactions.find(t => t.id === parentId);
    if (!parent) return;

    const now = Date.now();
    let nextId = Math.max(0, ...transactions.map(t => t.id)) + 1;

    const updatedParent: TransactionEntity = {
      ...parent,
      isSplitParent: true,
      updatedAt: now
    };

    const childTxs: TransactionEntity[] = splits.map(s => {
      const isExp = s.amount < 0 || parent.isExpense;
      const childAmount = isExp ? -Math.abs(s.amount) : Math.abs(s.amount);
      const cat = categories.find(c => c.id === s.categoryId);

      return {
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
        notes: s.notes || parent.notes,
        parentId: parent.id,
        accountId: parent.accountId,
        accountName: parent.accountName,
        settlementCardName: parent.settlementCardName,
        billingCycleClosingDay: parent.billingCycleClosingDay,
        updatedAt: now,
        isDeleted: false
      };
    });

    setTransactions(prev => [
      ...childTxs,
      ...prev.map(t => (t.id === parentId ? updatedParent : t))
    ]);

    enqueueOutbox('TRANSACTION', `tx_${parentId}`, 'UPSERT');
    childTxs.forEach(c => enqueueOutbox('TRANSACTION', `tx_${c.id}`, 'UPSERT'));

    showToast(language === 'fr' ? 'Transaction ventilée avec succès' : 'Transaction split successfully');
  };

  const transferBetweenAccounts = (
    sourceAccId: string,
    targetAccId: string,
    amount: number,
    notes: string,
    transferType: 'TO_SAVINGS' | 'FROM_SAVINGS' | 'CARD_SETTLEMENT' | 'GENERAL_TRANSFER' = 'GENERAL_TRANSFER'
  ) => {
    const sourceAcc = accounts.find(a => a.id === sourceAccId);
    const targetAcc = accounts.find(a => a.id === targetAccId);
    if (!sourceAcc || !targetAcc) return;

    const now = Date.now();
    let nextId = Math.max(0, ...transactions.map(t => t.id)) + 1;
    const absAmount = Math.abs(amount);

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
      title: `${language === 'fr' ? 'Virement vers' : 'Transfer to'} ${targetAcc.name}`,
      originalBankLabel: `INTERNAL TRANSFER TO ${targetAcc.name.toUpperCase()}`,
      amount: -absAmount,
      isExpense: true,
      categoryId: resolvedCategoryId,
      categoryName: resolvedCategoryName,
      categoryColor: resolvedCategoryColor,
      categoryIcon: resolvedCategoryIcon,
      budgetId: resolvedBudgetId,
      budgetTitle: resolvedBudgetTitle,
      date: now,
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
      updatedAt: now,
      isDeleted: false
    };

    const inTx: TransactionEntity = {
      id: nextId++,
      title: `${language === 'fr' ? 'Virement reçu de' : 'Transfer from'} ${sourceAcc.name}`,
      originalBankLabel: `INTERNAL TRANSFER FROM ${sourceAcc.name.toUpperCase()}`,
      amount: absAmount,
      isExpense: false,
      categoryId: resolvedCategoryId,
      categoryName: resolvedCategoryName,
      categoryColor: resolvedCategoryColor,
      categoryIcon: resolvedCategoryIcon,
      budgetId: resolvedBudgetId,
      budgetTitle: resolvedBudgetTitle,
      date: now,
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

  // Categories CRUD
  const addCategory = (cat: Omit<CategoryEntity, 'id' | 'updatedAt' | 'isDeleted'>) => {
    const nextId = Math.max(0, ...categories.map(c => c.id)) + 1;
    const now = Date.now();
    setCategories(prev => [...prev, { ...cat, id: nextId, updatedAt: now, isDeleted: false }]);
    enqueueOutbox('CATEGORY', `cat_${nextId}`, 'UPSERT');
    showToast(language === 'fr' ? 'Catégorie créée' : 'Category created');
  };

  const updateCategory = (cat: CategoryEntity) => {
    const now = Date.now();
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
    setCategories(prev => prev.map(c => (c.id === id ? { ...c, isDeleted: true, updatedAt: now } : c)));
    enqueueOutbox('CATEGORY', `cat_${id}`, 'DELETE');
    showToast(language === 'fr' ? 'Catégorie supprimée' : 'Category deleted');
  };

  // Budgets (Sub-categories) CRUD
  const addBudget = (b: Omit<CategoryBudgetEntity, 'id' | 'updatedAt' | 'isDeleted'>) => {
    const nextId = Math.max(0, ...budgets.map(bg => bg.id)) + 1;
    const now = Date.now();
    setBudgets(prev => [...prev, { ...b, id: nextId, updatedAt: now, isDeleted: false }]);
    enqueueOutbox('BUDGET', `budget_${nextId}`, 'UPSERT');
    showToast(language === 'fr' ? 'Sous-catégorie créée' : 'Sub-category created');
  };

  const updateBudget = (b: CategoryBudgetEntity) => {
    const now = Date.now();
    setBudgets(prev => prev.map(bg => (bg.id === b.id ? { ...b, updatedAt: now } : bg)));
    setRules(prev =>
      prev.map(r => (r.targetBudgetId === b.id ? { ...r, targetBudgetTitle: b.title, updatedAt: now } : r))
    );
    enqueueOutbox('BUDGET', `budget_${b.id}`, 'UPSERT');
    showToast(language === 'fr' ? 'Sous-catégorie mise à jour' : 'Sub-category updated');
  };

  const deleteBudget = (id: number) => {
    const now = Date.now();
    setBudgets(prev => prev.map(bg => (bg.id === id ? { ...bg, isDeleted: true, updatedAt: now } : bg)));
    enqueueOutbox('BUDGET', `budget_${id}`, 'DELETE');
    showToast(language === 'fr' ? 'Sous-catégorie supprimée' : 'Sub-category deleted');
  };

  // Rules CRUD
  const addRule = (r: Omit<CategorizationRuleEntity, 'id' | 'updatedAt' | 'isDeleted'>) => {
    const nextId = Math.max(0, ...rules.map(rl => rl.id)) + 1;
    const now = Date.now();
    setRules(prev => [...prev, { ...r, id: nextId, updatedAt: now, isDeleted: false }]);
    enqueueOutbox('RULE', `rule_${nextId}`, 'UPSERT');
    showToast(language === 'fr' ? 'Règle créée' : 'Rule created');
  };

  const updateRule = (r: CategorizationRuleEntity) => {
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

  // Import CSV
  const importCsvTransactions = (records: ParsedBankRow[], targetAccountId: string): number => {
    const targetAcc = accounts.find(a => a.id === targetAccountId);
    if (!targetAcc) return 0;

    const now = Date.now();
    let nextId = Math.max(0, ...transactions.map(t => t.id)) + 1;

    let balanceDelta = 0;

    const newTxs: TransactionEntity[] = records.map(rec => {
      balanceDelta += rec.amount;

      return {
        id: nextId++,
        title: rec.cleanTitle,
        originalBankLabel: rec.originalLabel,
        amount: rec.amount,
        isExpense: rec.isExpense,
        categoryId: rec.matchedCategoryId,
        categoryName: rec.matchedCategoryName,
        categoryColor: rec.matchedCategoryColor,
        categoryIcon: rec.matchedCategoryIcon,
        budgetId: rec.matchedBudgetId,
        budgetTitle: rec.matchedBudgetTitle,
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
        ? `${newTxs.length} opérations bancaires importées dans ${targetAcc.name}`
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
          members
        }
      : {
          accounts,
          transactions,
          categories,
          budgets,
          rules,
          members
        };

    if (resetCacheBeforePull) {
      setAccounts([]);
      setTransactions([]);
      setCategories([]);
      setBudgets([]);
      setRules([]);
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
    let syncOutbox: SyncOutboxEntity[] = [];
    let baseSyncState: SyncStateEntity;

    if (localCache) {
      syncAccounts = localCache.accounts;
      syncTxs = localCache.transactions;
      syncCats = localCache.categories;
      syncBudgets = localCache.budgets;
      syncRules = localCache.rules;
      syncMembers = localCache.members.length > 0 ? localCache.members : [adminMember];
      syncOutbox = localCache.outbox || [];
      baseSyncState = {
        ...localCache.syncState,
        lastSyncStatus: 'SYNCING',
        lastSyncMessage:
          language === 'fr'
            ? 'Cache chiffré déverrouillé — Synchronisation delta Firestore...'
            : 'Encrypted cache unlocked — Delta syncing Firestore...'
      };

      setOpenBankingConfig(localCache.openBankingConfig || DEFAULT_OPEN_BANKING_CONFIG);
      setCurrencyState(localCache.currency || '€');
      setAccounts(syncAccounts);
      setTransactions(syncTxs);
      setCategories(syncCats);
      setBudgets(syncBudgets);
      setRules(syncRules);
      setMembers(syncMembers);
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

    const result = await executeBidirectionalSync({
      accounts: syncAccounts,
      transactions: syncTxs,
      categories: syncCats,
      budgets: syncBudgets,
      rules: syncRules,
      members: syncMembers,
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
      members: syncMembers
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
  };

  /**
   * Finalizes local unlock once DEK has been unwrapped/derived in memory.
   * Decrypts BYOB config, waits for Firebase Auth persistence, and opens Dashboard if already signed in.
   */
  const finalizeLocalUnlock = async (dek: CryptoKey): Promise<VaultActionResult> => {
    const decryptedByob = await loadEncryptedByobConfig(dek);
    if (!decryptedByob) {
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

    const auth = getOrInitAuth(decryptedByob);
    if (auth) {
      try {
        await auth.authStateReady();
      } catch {
        // Ignore authStateReady failure and fall back to currentUser check
      }
    }

    const activeFbUser = auth?.currentUser;
    if (activeFbUser && activeFbUser.email) {
      const userInfo: AuthUserInfo = {
        uid: activeFbUser.uid,
        email: activeFbUser.email,
        displayName: activeFbUser.displayName,
        photoURL: activeFbUser.photoURL
      };
      const syncRes = await completeByobSetupWithUser(decryptedByob, userInfo, false, dek);
      return {
        success: syncRes.success,
        vaultUnlocked: true,
        biometricVerified: true,
        error: syncRes.error
      };
    }

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
  };

  const unlockVaultWithBiometrics = async (): Promise<VaultActionResult> => {
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
        const dek = await importDekFromRaw(rawDek, true);
        return await finalizeLocalUnlock(dek);
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
          ? 'Empreinte vérifiée. Saisissez votre code PIN pour déchiffrer le stockage local.'
          : 'Fingerprint verified. Enter your Vault PIN to decrypt local storage.'
    };
  };

  const unlockVaultWithPin = async (pin: string): Promise<VaultActionResult> => {
    const cleanPin = pin.trim();
    if (!cleanPin) {
      return {
        success: false,
        error: language === 'fr' ? 'Veuillez saisir votre code PIN.' : 'Please enter your Vault PIN.'
      };
    }

    const meta = vaultLockMeta || loadVaultLockMeta();
    if (!meta || !meta.wrappedDekPin || !meta.pinSaltBase64 || !hasEncryptedByobConfig()) {
      return {
        success: false,
        error:
          language === 'fr'
            ? 'Aucun code PIN configuré pour ce coffre. Utilisez votre empreinte biométrique.'
            : 'No Vault PIN is configured for this vault. Unlock with your fingerprint.'
      };
    }

    try {
      const kek = await deriveKekFromPin(cleanPin, base64ToUint8(meta.pinSaltBase64));
      const rawDek = await unwrapDekWithKek(meta.wrappedDekPin, kek);
      const dek = await importDekFromRaw(rawDek, true);
      return await finalizeLocalUnlock(dek);
    } catch {
      return {
        success: false,
        error: language === 'fr' ? 'Code PIN du coffre incorrect.' : 'Incorrect Vault PIN.'
      };
    }
  };

  /**
   * Configures mandatory local AES-256-GCM encryption (WebAuthn PRF biometric key and/or Vault PIN),
   * encrypts the BYOB config before disk persistence, and then runs Google Sign-In.
   */
  const setupProtectedVaultAndConnect = async (
    byob: { projectId: string; apiKey: string; applicationId?: string; familyName?: string },
    protection: VaultProtectionInput,
    options?: { resetLocalData?: boolean }
  ): Promise<VaultActionResult> => {
    const hasPrf = Boolean(protection.biometricCredId && protection.prfSecret && protection.prfSalt);
    const cleanPin = protection.pin?.trim() || '';
    const hasPin = cleanPin.length >= 6;

    if (!hasPrf && !hasPin) {
      return {
        success: false,
        error:
          language === 'fr'
            ? 'Protection requise : enregistrez une empreinte WebAuthn PRF ou définissez un code PIN (6 caractères min.).'
            : 'Protection required: enroll a WebAuthn PRF fingerprint or set a Vault PIN (min. 6 characters).'
      };
    }

    const cleanByob: SavedByobConfig = {
      projectId: byob.projectId.trim(),
      apiKey: byob.apiKey.trim(),
      applicationId: byob.applicationId?.trim() || '',
      familyName: byob.familyName?.trim() || 'Private Family Vault'
    };

    const rawDek = generateRawDek();
    const meta: VaultLockMeta = {
      v: 2,
      encryptionMode: hasPrf && hasPin ? 'HYBRID' : hasPrf ? 'WEBAUTHN_PRF' : 'PIN_WRAPPED',
      credentialId: protection.biometricCredId,
      updatedAt: Date.now()
    };

    if (hasPrf && protection.prfSecret && protection.prfSalt) {
      const hkdfSalt = generateRandomBytes(16);
      const kekPrf = await deriveKekFromPrfSecret(protection.prfSecret, hkdfSalt);
      meta.prfSaltBase64 = uint8ToBase64(protection.prfSalt);
      meta.hkdfSaltBase64 = uint8ToBase64(hkdfSalt);
      meta.wrappedDekPrf = await wrapDekWithKek(rawDek, kekPrf);
    }

    if (hasPin) {
      const pinSalt = generateRandomBytes(16);
      const kekPin = await deriveKekFromPin(cleanPin, pinSalt);
      meta.pinSaltBase64 = uint8ToBase64(pinSalt);
      meta.wrappedDekPin = await wrapDekWithKek(rawDek, kekPin);
    }

    const dek = await importDekFromRaw(rawDek, true);

    saveVaultLockMeta(meta);
    setVaultLockMeta(meta);
    await saveEncryptedByobConfig(cleanByob, dek);

    activeDekRef.current = dek;
    setSavedByobConfig(cleanByob);
    setHasSavedVault(true);
    setIsVaultUnlocked(true);
    setLegacyPlaintextConfig(null);

    const isSameProject = savedByobConfig?.projectId?.trim() === cleanByob.projectId;
    const shouldReset = options?.resetLocalData !== undefined ? options.resetLocalData : !isSameProject;

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
    const dek = activeDekRef.current;
    if (!isVaultUnlocked || !dek) {
      return {
        success: false,
        error:
          language === 'fr'
            ? 'Déverrouillage local requis (empreinte ou code PIN) avant la connexion Google.'
            : 'Local unlock (fingerprint or PIN) is required before Google Sign-In.'
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
      await saveEncryptedByobConfig(targetByob, dek);
      setSavedByobConfig(targetByob);
    }

    const auth = getOrInitAuth(targetByob);
    if (auth) {
      try {
        await auth.authStateReady();
      } catch {
        // Ignore
      }
    }

    const existingUser = auth?.currentUser;
    if (existingUser && existingUser.email && isSameProject) {
      const userInfo: AuthUserInfo = {
        uid: existingUser.uid,
        email: existingUser.email,
        displayName: existingUser.displayName,
        photoURL: existingUser.photoURL
      };
      const syncRes = await completeByobSetupWithUser(targetByob, userInfo, false, dek);
      return {
        success: syncRes.success,
        vaultUnlocked: true,
        error: syncRes.error
      };
    }

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
        error: googleRes.error
      };
    }

    const syncRes = await completeByobSetupWithUser(targetByob, googleRes.user, !isSameProject, dek);
    return {
      success: syncRes.success,
      vaultUnlocked: true,
      error: syncRes.error
    };
  };

  const enrollOrUpdateBiometrics = async (): Promise<{
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
            ? 'Ce navigateur ne supporte pas WebAuthn PRF. Définissez d’abord un code PIN de secours.'
            : 'This browser does not support WebAuthn PRF. Set a backup Vault PIN first.'
      };
    }

    const rawDek = await exportDekRaw(dek);
    const nextMeta: VaultLockMeta = {
      ...currentMeta,
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
  };

  const updateVaultPin = async (newPin: string): Promise<{ success: boolean; error?: string }> => {
    const cleanPin = newPin.trim();
    if (cleanPin.length < 6) {
      return {
        success: false,
        error:
          language === 'fr'
            ? 'Le code PIN doit contenir au moins 6 caractères.'
            : 'Vault PIN must be at least 6 characters.'
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

    const rawDek = await exportDekRaw(dek);
    const pinSalt = generateRandomBytes(16);
    const kekPin = await deriveKekFromPin(cleanPin, pinSalt);
    const wrappedDekPin = await wrapDekWithKek(rawDek, kekPin);

    const nextMeta: VaultLockMeta = {
      ...currentMeta,
      pinSaltBase64: uint8ToBase64(pinSalt),
      wrappedDekPin,
      encryptionMode: currentMeta.wrappedDekPrf ? 'HYBRID' : 'PIN_WRAPPED',
      updatedAt: Date.now()
    };

    saveVaultLockMeta(nextMeta);
    setVaultLockMeta(nextMeta);
    return { success: true };
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
        outbox,
        syncState,
        config: updatedCfg
      });
      applySyncResult(result, { accounts, transactions, categories, budgets, rules, members });
      if (result.success) {
        setSessionMode('FIRESTORE');
      }
      return { success: result.success, error: result.success ? undefined : result.message };
    } else if (res.error) {
      showToast(res.error);
      return { success: false, error: res.error };
    }
    return { success: false };
  };

  const updateOpenBankingConfig = (patch: Partial<OpenBankingConfig>) => {
    setOpenBankingConfig(prev => ({ ...prev, ...patch }));
  };

  const testOpenBankingConn = async () => {
    return await testOpenBankingConnection(openBankingConfig);
  };

  const syncOpenBankingNow = async () => {
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
        authInitialized,

        accounts: accounts.filter(a => !a.isDeleted),
        transactions: transactions.filter(t => !t.isDeleted),
        categories: categories.filter(c => !c.isDeleted),
        budgets: budgets.filter(b => !b.isDeleted),
        rules: rules.filter(r => !r.isDeleted),
        members,
        config,
        syncState,
        openBankingConfig,
        language,
        currency,
        currentScreen,
        activeAccountId,
        toastMessage,

        navigateTo,
        setLanguage,
        setCurrency,
        setActiveAccountId,
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

        addRule,
        updateRule,
        deleteRule,

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
