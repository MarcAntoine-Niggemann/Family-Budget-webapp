import {
  AccountEntity,
  TransactionEntity,
  CategoryEntity,
  CategoryBudgetEntity,
  CategorizationRuleEntity,
  FamilyMemberEntity,
  FirebaseConfigEntity,
  OpenBankingConfig,
  ResolvedTheme,
  SharedExpensePreset,
  SharedSettlementEntity,
  SyncOutboxEntity,
  SyncStateEntity,
  ThemePreference
} from '../types';
import {
  EncryptedEnvelope,
  decryptJsonWithKey,
  encryptJsonWithKey,
  isEncryptedEnvelopeString
} from './crypto';
import {
  computeDefaultCardPeriod,
  parseCardPeriod,
  shiftCardPeriod
} from './creditCardPeriod';

export const BYOB_CONFIG_STORAGE_KEY = 'fbv_byob_config';
export const BIOMETRIC_CRED_STORAGE_KEY = 'fbv_biometric_cred_id';
export const VAULT_LOCK_META_KEY = 'fbv_vault_lock_meta';

export const CACHE_STORAGE_KEYS = {
  PROJECT_ID: 'fbv_cache_project_id',
  ACCOUNTS: 'fbv_accounts',
  TRANSACTIONS: 'fbv_transactions',
  CATEGORIES: 'fbv_categories',
  BUDGETS: 'fbv_budgets',
  RULES: 'fbv_rules',
  MEMBERS: 'fbv_members',
  SYNC_STATE: 'fbv_sync_state',
  OUTBOX: 'fbv_outbox',
  OPEN_BANKING: 'fbv_open_banking',
  CURRENCY: 'fbv_currency',
  LANGUAGE: 'fbv_language',
  THEME: 'fbv_theme',
  FAMILY_NAME: 'fbv_family_name',
  SHARED_SETTLEMENTS: 'fbv_shared_settlements',
  SHARED_PRESET: 'fbv_shared_preset'
} as const;

export interface SavedByobConfig {
  projectId: string;
  apiKey: string;
  applicationId?: string;
  familyName?: string;
}

export type VaultEncryptionMode = 'WEBAUTHN_PRF' | 'PIN_WRAPPED' | 'HYBRID';

export interface VaultLockMeta {
  v: 3;
  encryptionMode: VaultEncryptionMode;
  kdfIterations?: number;
  credentialId?: string;
  prfSaltBase64?: string;
  hkdfSaltBase64?: string;
  wrappedDekPrf?: EncryptedEnvelope;
  pinSaltBase64?: string;
  wrappedDekPin?: EncryptedEnvelope;
  updatedAt: number;
}

export function loadVaultLockMeta(): VaultLockMeta | null {
  try {
    const raw = localStorage.getItem(VAULT_LOCK_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultLockMeta;
    if (
      parsed &&
      parsed.v === 3 &&
      (parsed.wrappedDekPrf || parsed.wrappedDekPin)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function hasLegacyV2Vault(): boolean {
  try {
    const raw = localStorage.getItem(VAULT_LOCK_META_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { v?: number };
    return Boolean(parsed && typeof parsed.v === 'number' && parsed.v < 3);
  } catch {
    return false;
  }
}

export function saveVaultLockMeta(meta: VaultLockMeta): void {
  try {
    localStorage.setItem(VAULT_LOCK_META_KEY, JSON.stringify(meta));
    if (meta.credentialId) {
      localStorage.setItem(BIOMETRIC_CRED_STORAGE_KEY, meta.credentialId);
    } else {
      localStorage.removeItem(BIOMETRIC_CRED_STORAGE_KEY);
    }
  } catch (e: any) {
    console.error('Failed to save vault lock metadata:', e);
    throw new Error(
      `Impossible d’enregistrer le coffre dans le stockage local du navigateur (${e?.message || 'storage blocked'}).`
    );
  }
}

export function clearVaultLockMeta(): void {
  try {
    localStorage.removeItem(VAULT_LOCK_META_KEY);
  } catch {
    // Ignore
  }
}

export function hasEncryptedByobConfig(): boolean {
  try {
    const raw = localStorage.getItem(BYOB_CONFIG_STORAGE_KEY);
    const meta = loadVaultLockMeta();
    return Boolean(meta && isEncryptedEnvelopeString(raw));
  } catch {
    return false;
  }
}

/**
 * Detects pre-upgrade plaintext BYOB configurations so the UI can force encryption setup.
 */
export function loadLegacyPlaintextByobConfig(): SavedByobConfig | null {
  try {
    const raw = localStorage.getItem(BYOB_CONFIG_STORAGE_KEY);
    if (!raw || isEncryptedEnvelopeString(raw)) return null;
    const parsed = JSON.parse(raw) as SavedByobConfig;
    if (
      parsed &&
      typeof parsed.projectId === 'string' &&
      typeof parsed.apiKey === 'string' &&
      parsed.projectId.trim() &&
      parsed.apiKey.trim()
    ) {
      return {
        projectId: parsed.projectId.trim(),
        apiKey: parsed.apiKey.trim(),
        applicationId: parsed.applicationId?.trim() || '',
        familyName: parsed.familyName?.trim() || 'Private Family Vault'
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveEncryptedByobConfig(
  cfg: SavedByobConfig,
  dek: CryptoKey
): Promise<void> {
  const sanitized: SavedByobConfig = {
    projectId: cfg.projectId.trim(),
    apiKey: cfg.apiKey.trim(),
    applicationId: cfg.applicationId?.trim() || '',
    familyName: cfg.familyName?.trim() || 'Private Family Vault'
  };
  const encrypted = await encryptJsonWithKey(sanitized, dek);
  localStorage.setItem(BYOB_CONFIG_STORAGE_KEY, encrypted);
}

export async function loadEncryptedByobConfig(
  dek: CryptoKey
): Promise<SavedByobConfig | null> {
  try {
    const raw = localStorage.getItem(BYOB_CONFIG_STORAGE_KEY);
    if (!raw || !isEncryptedEnvelopeString(raw)) return null;
    const parsed = await decryptJsonWithKey<SavedByobConfig>(raw, dek);
    if (
      parsed &&
      typeof parsed.projectId === 'string' &&
      typeof parsed.apiKey === 'string' &&
      parsed.projectId.trim() &&
      parsed.apiKey.trim()
    ) {
      return {
        projectId: parsed.projectId.trim(),
        apiKey: parsed.apiKey.trim(),
        applicationId: parsed.applicationId?.trim() || '',
        familyName: parsed.familyName?.trim() || 'Private Family Vault'
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearByobConfig(): void {
  try {
    localStorage.removeItem(BYOB_CONFIG_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function loadLanguagePreference(): 'fr' | 'en' {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEYS.LANGUAGE);
    if (raw === 'en' || raw === '"en"') return 'en';
    return 'fr';
  } catch {
    return 'fr';
  }
}

export function saveLanguagePreference(lang: 'fr' | 'en'): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEYS.LANGUAGE, lang);
  } catch {
    // Ignore
  }
}

export function loadThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEYS.THEME);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
    return 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEYS.THEME, theme);
  } catch {
    // Ignore
  }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') {
    return pref;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function applyThemeToDocument(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = resolved;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#f8fafc');
    }
  }
  return resolved;
}

export async function saveEncryptedCachedData<T>(
  key: string,
  data: T,
  dek: CryptoKey
): Promise<void> {
  try {
    const encrypted = await encryptJsonWithKey(data, dek);
    localStorage.setItem(key, encrypted);
  } catch (e) {
    console.error(`Failed to encrypt & save ${key} to local cache:`, e);
  }
}

export async function loadEncryptedCachedData<T>(
  key: string,
  fallback: T,
  dek: CryptoKey
): Promise<T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    if (!isEncryptedEnvelopeString(raw)) {
      // Never hydrate unencrypted financial payloads into an encrypted vault session
      return fallback;
    }
    return await decryptJsonWithKey<T>(raw, dek);
  } catch (e) {
    console.error(`Failed to decrypt ${key} from local cache:`, e);
    return fallback;
  }
}

export interface ByobLocalCacheSnapshot {
  accounts: AccountEntity[];
  transactions: TransactionEntity[];
  categories: CategoryEntity[];
  budgets: CategoryBudgetEntity[];
  rules: CategorizationRuleEntity[];
  members: FamilyMemberEntity[];
  sharedSettlements: SharedSettlementEntity[];
  sharedPreset?: SharedExpensePreset;
  syncState: SyncStateEntity;
  outbox: SyncOutboxEntity[];
  openBankingConfig?: OpenBankingConfig;
  currency?: string;
  familyName?: string;
}

/**
 * Decrypts and loads the locally cached Firestore BYOB dataset for a given projectId
 * using the in-memory vault DEK so returning users can perform incremental delta sync.
 */
export async function loadEncryptedByobLocalCache(
  projectId: string,
  dek: CryptoKey
): Promise<ByobLocalCacheSnapshot | null> {
  try {
    const cachedProjectId = await loadEncryptedCachedData<string>(
      CACHE_STORAGE_KEYS.PROJECT_ID,
      '',
      dek
    );
    if (!cachedProjectId || cachedProjectId !== projectId.trim()) {
      return null;
    }

    const syncState = await loadEncryptedCachedData<SyncStateEntity | null>(
      CACHE_STORAGE_KEYS.SYNC_STATE,
      null,
      dek
    );
    if (!syncState || !syncState.lastPullTimestamp) {
      return null;
    }

    const [
      accounts,
      transactions,
      categories,
      budgets,
      rules,
      members,
      sharedSettlements,
      sharedPreset,
      outbox,
      openBankingConfig,
      currency,
      familyName
    ] = await Promise.all([
      loadEncryptedCachedData<AccountEntity[]>(CACHE_STORAGE_KEYS.ACCOUNTS, [], dek),
      loadEncryptedCachedData<TransactionEntity[]>(CACHE_STORAGE_KEYS.TRANSACTIONS, [], dek),
      loadEncryptedCachedData<CategoryEntity[]>(CACHE_STORAGE_KEYS.CATEGORIES, [], dek),
      loadEncryptedCachedData<CategoryBudgetEntity[]>(CACHE_STORAGE_KEYS.BUDGETS, [], dek),
      loadEncryptedCachedData<CategorizationRuleEntity[]>(CACHE_STORAGE_KEYS.RULES, [], dek),
      loadEncryptedCachedData<FamilyMemberEntity[]>(CACHE_STORAGE_KEYS.MEMBERS, [], dek),
      loadEncryptedCachedData<SharedSettlementEntity[]>(CACHE_STORAGE_KEYS.SHARED_SETTLEMENTS, [], dek),
      loadEncryptedCachedData<SharedExpensePreset | undefined>(CACHE_STORAGE_KEYS.SHARED_PRESET, undefined, dek),
      loadEncryptedCachedData<SyncOutboxEntity[]>(CACHE_STORAGE_KEYS.OUTBOX, [], dek),
      loadEncryptedCachedData<OpenBankingConfig | undefined>(
        CACHE_STORAGE_KEYS.OPEN_BANKING,
        undefined,
        dek
      ),
      loadEncryptedCachedData<string>(CACHE_STORAGE_KEYS.CURRENCY, '€', dek),
      loadEncryptedCachedData<string>(CACHE_STORAGE_KEYS.FAMILY_NAME, '', dek)
    ]);

    return {
      accounts,
      transactions,
      categories,
      budgets,
      rules,
      members,
      sharedSettlements,
      sharedPreset,
      syncState,
      outbox,
      openBankingConfig,
      currency,
      familyName
    };
  } catch {
    return null;
  }
}

/**
 * Erases local browser data on explicit Log Out or Forget Vault:
 * - Always clears sessionStorage, financial collections, sync state, outbox, AND Open Banking config
 *   (keys + account mappings).
 * - When preserveByob is true (normal Log Out), retains only the encrypted BYOB Firestore config,
 *   vault lock metadata, WebAuthn credential ID, and language preference.
 * - Never runs automatically on tab/window close so encrypted delta cache stays available when unlocked.
 */
export function purgeLocalData(options: { preserveByob?: boolean } = { preserveByob: true }): void {
  const preserveByob = options.preserveByob !== false;

  try {
    sessionStorage.clear();
  } catch {
    // Ignore
  }

  try {
    const preservedKeys = new Set<string>([
      BYOB_CONFIG_STORAGE_KEY,
      VAULT_LOCK_META_KEY,
      BIOMETRIC_CRED_STORAGE_KEY,
      CACHE_STORAGE_KEYS.LANGUAGE,
      CACHE_STORAGE_KEYS.THEME
    ]);

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (preserveByob && preservedKeys.has(key)) {
        continue;
      }
      if (key.startsWith('fbv_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.error('Failed to purge localStorage:', e);
  }
}

export function getEmptyConfig(byob?: SavedByobConfig | null): FirebaseConfigEntity {
  return {
    id: 'active_config',
    apiKey: byob?.apiKey || '',
    applicationId: byob?.applicationId || '',
    projectId: byob?.projectId || '',
    projectNumber: '',
    webClientId: '',
    familyName: byob?.familyName || 'Private Family Vault',
    currentUserEmail: '',
    currentUserName: '',
    currentUserRole: 'ADMIN',
    isGoogleAuthenticated: false,
    isFamilyCreated: false,
    isConfigured: !!byob,
    isEnabled: true,
    isBiometricLockEnabled: !!byob,
    isAnonymous: false,
    lastSyncTimestamp: 0,
    syncStatusMessage: ''
  };
}

export function getEmptySyncState(): SyncStateEntity {
  return {
    syncKey: 'primary_sync',
    lastPullTimestamp: 0,
    lastPushTimestamp: 0,
    lastSyncStatus: 'IDLE',
    lastSyncMessage: '',
    pendingOutboxCount: 0
  };
}

/**
 * In-memory Demo Mode dataset generator. Never persisted to localStorage.
 */
export function getInitialSeedData(language: 'fr' | 'en' = 'fr') {
  const now = Date.now();
  const dayMs = 86_400_000;
  const isEn = language === 'en';

  const config: FirebaseConfigEntity = {
    id: 'demo_config',
    apiKey: '',
    applicationId: '',
    projectId: '',
    projectNumber: '',
    webClientId: '',
    familyName: isEn ? 'Smith Family (Demo)' : 'Famille Martin (Démo)',
    currentUserEmail: isEn ? 'john.smith@demo.local' : 'jean.martin@demo.local',
    currentUserName: isEn ? 'John Smith (Demo)' : 'Jean Martin (Démo)',
    currentUserRole: 'ADMIN',
    isGoogleAuthenticated: false,
    isFamilyCreated: true,
    isConfigured: true,
    isEnabled: false,
    isBiometricLockEnabled: false,
    isAnonymous: true,
    lastSyncTimestamp: now,
    syncStatusMessage: isEn
      ? 'Demo mode active (in-memory only).'
      : 'Mode Démo actif (en mémoire uniquement).'
  };

  const members: FamilyMemberEntity[] = isEn
    ? [
        { id: 'john_smith', name: 'John Smith', email: 'john.smith@demo.local', role: 'ADMIN', avatarColor: 0xff0f766e, firestoreSynced: false, monthlyIncome: 3400, updatedAt: now, isDeleted: false },
        { id: 'sophie_smith', name: 'Sophie Smith', email: 'sophie.smith@demo.local', role: 'EDITOR', avatarColor: 0xff2563eb, firestoreSynced: false, monthlyIncome: 2250, updatedAt: now, isDeleted: false },
        { id: 'lucas_smith', name: 'Lucas Smith', email: 'lucas.smith@demo.local', role: 'MEMBER', avatarColor: 0xff7c3aed, firestoreSynced: false, monthlyIncome: 0, updatedAt: now, isDeleted: false },
        { id: 'emma_smith', name: 'Emma Smith', email: 'emma.smith@demo.local', role: 'MEMBER', avatarColor: 0xffd97706, firestoreSynced: false, monthlyIncome: 0, updatedAt: now, isDeleted: false }
      ]
    : [
        { id: 'jean_martin', name: 'Jean Martin', email: 'jean.martin@demo.local', role: 'ADMIN', avatarColor: 0xff0f766e, firestoreSynced: false, monthlyIncome: 3400, updatedAt: now, isDeleted: false },
        { id: 'sophie_martin', name: 'Sophie Martin', email: 'sophie.martin@demo.local', role: 'EDITOR', avatarColor: 0xff2563eb, firestoreSynced: false, monthlyIncome: 2250, updatedAt: now, isDeleted: false },
        { id: 'lucas_martin', name: 'Lucas Martin', email: 'lucas.martin@demo.local', role: 'MEMBER', avatarColor: 0xff7c3aed, firestoreSynced: false, monthlyIncome: 0, updatedAt: now, isDeleted: false },
        { id: 'emma_martin', name: 'Emma Martin', email: 'emma.martin@demo.local', role: 'MEMBER', avatarColor: 0xffd97706, firestoreSynced: false, monthlyIncome: 0, updatedAt: now, isDeleted: false }
      ];

  const accounts: AccountEntity[] = isEn
    ? [
        {
          id: 'acc_main_checking',
          name: 'Family Checking Account',
          type: 'CHECKING',
          currentBalance: 4250.0,
          currency: '€',
          includeInLiquidForecast: true,
          isDefault: true,
          color: 0xff0f766e,
          icon: 'Landmark',
          lastManualSyncTimestamp: now,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 'acc_card_visa',
          name: 'Visa Premier (Deferred Card)',
          type: 'DEFERRED_CARD',
          currentBalance: -296.9,
          currency: '€',
          billingCycleClosingDay: 25,
          linkedCheckingAccountId: 'acc_main_checking',
          includeInLiquidForecast: false,
          color: 0xff2563eb,
          icon: 'CreditCard',
          lastManualSyncTimestamp: now,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 'acc_savings',
          name: 'High-Yield Family Savings',
          type: 'SAVINGS',
          currentBalance: 12500.0,
          currency: '€',
          targetSavingsGoal: 15000.0,
          includeInLiquidForecast: false,
          color: 0xff10b981,
          icon: 'PiggyBank',
          isDefault: false,
          lastManualSyncTimestamp: now,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 'acc_emergency',
          name: 'Emergency Savings Fund',
          type: 'SAVINGS',
          currentBalance: 6200.0,
          currency: '€',
          targetSavingsGoal: 10000.0,
          includeInLiquidForecast: false,
          color: 0xff7c3aed,
          icon: 'ShieldCheck',
          isDefault: false,
          lastManualSyncTimestamp: now,
          updatedAt: now,
          isDeleted: false
        }
      ]
    : [
        {
          id: 'acc_main_checking',
          name: 'Compte Courant Famille',
          type: 'CHECKING',
          currentBalance: 4250.0,
          currency: '€',
          includeInLiquidForecast: true,
          isDefault: true,
          color: 0xff0f766e,
          icon: 'Landmark',
          lastManualSyncTimestamp: now,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 'acc_card_visa',
          name: 'Carte Visa Premier (Différé)',
          type: 'DEFERRED_CARD',
          currentBalance: -296.9,
          currency: '€',
          billingCycleClosingDay: 25,
          linkedCheckingAccountId: 'acc_main_checking',
          includeInLiquidForecast: false,
          color: 0xff2563eb,
          icon: 'CreditCard',
          lastManualSyncTimestamp: now,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 'acc_livret_a',
          name: 'Livret A Épargne (Famille)',
          type: 'SAVINGS',
          currentBalance: 12500.0,
          currency: '€',
          targetSavingsGoal: 15000.0,
          includeInLiquidForecast: false,
          color: 0xff10b981,
          icon: 'PiggyBank',
          isDefault: false,
          lastManualSyncTimestamp: now,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 'acc_ldds',
          name: 'LDDS Sophie (Précaution)',
          type: 'SAVINGS',
          currentBalance: 6200.0,
          currency: '€',
          targetSavingsGoal: 10000.0,
          includeInLiquidForecast: false,
          color: 0xff7c3aed,
          icon: 'ShieldCheck',
          isDefault: false,
          lastManualSyncTimestamp: now,
          updatedAt: now,
          isDeleted: false
        }
      ];

  const categories: CategoryEntity[] = isEn
    ? [
        { id: 1, name: 'Income & Salaries', icon: 'Coins', color: 0xff10b981, updatedAt: now, isDeleted: false },
        { id: 2, name: 'Housing & Rent', icon: 'Home', color: 0xff3b82f6, updatedAt: now, isDeleted: false },
        { id: 3, name: 'Groceries & Food', icon: 'ShoppingCart', color: 0xfff59e0b, updatedAt: now, isDeleted: false },
        { id: 4, name: 'Bills & Utilities', icon: 'Zap', color: 0xffef4444, updatedAt: now, isDeleted: false },
        { id: 5, name: 'Transport & Fuel', icon: 'Car', color: 0xff8b5cf6, updatedAt: now, isDeleted: false },
        { id: 6, name: 'Children & School', icon: 'GraduationCap', color: 0xffec4899, updatedAt: now, isDeleted: false },
        { id: 7, name: 'Leisure & Dining Out', icon: 'Utensils', color: 0xff14b8a6, updatedAt: now, isDeleted: false },
        { id: 8, name: 'Health & Medical', icon: 'HeartPulse', color: 0xff06b6d4, updatedAt: now, isDeleted: false },
        { id: 9, name: 'Savings & Investments', icon: 'PiggyBank', color: 0xff6366f1, updatedAt: now, isDeleted: false }
      ]
    : [
        { id: 1, name: 'Emploi & Revenus', icon: 'Coins', color: 0xff10b981, updatedAt: now, isDeleted: false },
        { id: 2, name: 'Logement & Loyer', icon: 'Home', color: 0xff3b82f6, updatedAt: now, isDeleted: false },
        { id: 3, name: 'Alimentation & Courses', icon: 'ShoppingCart', color: 0xfff59e0b, updatedAt: now, isDeleted: false },
        { id: 4, name: 'Factures & Énergie', icon: 'Zap', color: 0xffef4444, updatedAt: now, isDeleted: false },
        { id: 5, name: 'Transports & Carburant', icon: 'Car', color: 0xff8b5cf6, updatedAt: now, isDeleted: false },
        { id: 6, name: 'Enfants & Scolarité', icon: 'GraduationCap', color: 0xffec4899, updatedAt: now, isDeleted: false },
        { id: 7, name: 'Loisirs & Sorties', icon: 'Utensils', color: 0xff14b8a6, updatedAt: now, isDeleted: false },
        { id: 8, name: 'Santé & Prévoyance', icon: 'HeartPulse', color: 0xff06b6d4, updatedAt: now, isDeleted: false },
        { id: 9, name: 'Épargne & Investissement', icon: 'PiggyBank', color: 0xff6366f1, updatedAt: now, isDeleted: false }
      ];

  const budgets: CategoryBudgetEntity[] = isEn
    ? [
        { id: 101, categoryId: 1, categoryName: 'Income & Salaries', title: 'John Salary', amount: 3400.0, frequency: 'MONTHLY', month: null, day: 28, isExpense: false, isActive: true, updatedAt: now, isDeleted: false },
        { id: 102, categoryId: 1, categoryName: 'Income & Salaries', title: 'Sophie Salary', amount: 2250.0, frequency: 'MONTHLY', month: null, day: 28, isExpense: false, isActive: true, updatedAt: now, isDeleted: false },
        { id: 103, categoryId: 2, categoryName: 'Housing & Rent', title: 'Rent / Mortgage', amount: 1200.0, frequency: 'MONTHLY', month: null, day: 1, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 114, categoryId: 2, categoryName: 'Housing & Rent', title: 'Annual Property Tax', amount: 1450.0, frequency: 'YEARLY', month: 10, day: 15, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 104, categoryId: 3, categoryName: 'Groceries & Food', title: 'Supermarket & Groceries', amount: 650.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 105, categoryId: 3, categoryName: 'Groceries & Food', title: 'Bakeries & Fresh Markets', amount: 150.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 106, categoryId: 4, categoryName: 'Bills & Utilities', title: 'Electricity Utility (EDF)', amount: 140.0, frequency: 'MONTHLY', month: null, day: 5, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 107, categoryId: 4, categoryName: 'Bills & Utilities', title: 'Home Insurance', amount: 45.0, frequency: 'MONTHLY', month: null, day: 18, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 108, categoryId: 4, categoryName: 'Bills & Utilities', title: 'Fiber Internet & Phones', amount: 60.0, frequency: 'MONTHLY', month: null, day: 10, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 109, categoryId: 5, categoryName: 'Transport & Fuel', title: 'Fuel & Commute', amount: 220.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 116, categoryId: 5, categoryName: 'Transport & Fuel', title: 'Annual Car Insurance & Service', amount: 720.0, frequency: 'YEARLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 110, categoryId: 6, categoryName: 'Children & School', title: 'School Lunches & Childcare', amount: 240.0, frequency: 'MONTHLY', month: null, day: 12, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 111, categoryId: 7, categoryName: 'Leisure & Dining Out', title: 'Family Outings & Dinners', amount: 200.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 115, categoryId: 7, categoryName: 'Leisure & Dining Out', title: 'Summer Vacations', amount: 2400.0, frequency: 'YEARLY', month: 7, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 112, categoryId: 8, categoryName: 'Health & Medical', title: 'Pharmacy & Doctor Checkups', amount: 80.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 113, categoryId: 9, categoryName: 'Savings & Investments', title: 'Monthly Livret A Transfer', amount: 300.0, frequency: 'MONTHLY', month: null, day: 29, isExpense: true, isActive: true, updatedAt: now, isDeleted: false }
      ]
    : [
        { id: 101, categoryId: 1, categoryName: 'Emploi & Revenus', title: 'Salaire Jean', amount: 3400.0, frequency: 'MONTHLY', month: null, day: 28, isExpense: false, isActive: true, updatedAt: now, isDeleted: false },
        { id: 102, categoryId: 1, categoryName: 'Emploi & Revenus', title: 'Salaire Sophie', amount: 2250.0, frequency: 'MONTHLY', month: null, day: 28, isExpense: false, isActive: true, updatedAt: now, isDeleted: false },
        { id: 103, categoryId: 2, categoryName: 'Logement & Loyer', title: 'Loyer / Prêt Immobilier', amount: 1200.0, frequency: 'MONTHLY', month: null, day: 1, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 114, categoryId: 2, categoryName: 'Logement & Loyer', title: 'Taxe Foncière & Impôts', amount: 1450.0, frequency: 'YEARLY', month: 10, day: 15, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 104, categoryId: 3, categoryName: 'Alimentation & Courses', title: 'Supermarché & Courses', amount: 650.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 105, categoryId: 3, categoryName: 'Alimentation & Courses', title: 'Boulangerie & Marché', amount: 150.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 106, categoryId: 4, categoryName: 'Factures & Énergie', title: 'Électricité (EDF)', amount: 140.0, frequency: 'MONTHLY', month: null, day: 5, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 107, categoryId: 4, categoryName: 'Factures & Énergie', title: 'Assurance Habitation', amount: 45.0, frequency: 'MONTHLY', month: null, day: 18, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 108, categoryId: 4, categoryName: 'Factures & Énergie', title: 'Internet Fibre & Téléphonie', amount: 60.0, frequency: 'MONTHLY', month: null, day: 10, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 109, categoryId: 5, categoryName: 'Transports & Carburant', title: 'Carburant & Déplacements', amount: 220.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 116, categoryId: 5, categoryName: 'Transports & Carburant', title: 'Assurance Auto & Entretien Annuel', amount: 720.0, frequency: 'YEARLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 110, categoryId: 6, categoryName: 'Enfants & Scolarité', title: 'Cantine & Activités extrascolaires', amount: 240.0, frequency: 'MONTHLY', month: null, day: 12, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 111, categoryId: 7, categoryName: 'Loisirs & Sorties', title: 'Restaurants & Sorties famille', amount: 200.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 115, categoryId: 7, categoryName: 'Loisirs & Sorties', title: 'Vacances d’Été', amount: 2400.0, frequency: 'YEARLY', month: 7, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 112, categoryId: 8, categoryName: 'Santé & Prévoyance', title: 'Pharmacie & Médecins', amount: 80.0, frequency: 'MONTHLY', month: null, day: null, isExpense: true, isActive: true, updatedAt: now, isDeleted: false },
        { id: 113, categoryId: 9, categoryName: 'Épargne & Investissement', title: 'Virement Épargne Mensuel', amount: 300.0, frequency: 'MONTHLY', month: null, day: 29, isExpense: true, isActive: true, updatedAt: now, isDeleted: false }
      ];

  const rules: CategorizationRuleEntity[] = isEn
    ? [
        { id: 201, pattern: 'SUPERMARKET|GROCERY|WHOLESALE|CARREFOUR', matchType: 'REGEX', targetCategoryId: 3, targetCategoryName: 'Groceries & Food', targetBudgetId: 104, targetBudgetTitle: 'Supermarket & Groceries', priority: 15, isActive: true, updatedAt: now, isDeleted: false },
        { id: 202, pattern: 'ELECTRICITY|POWER|EDF', matchType: 'REGEX', targetCategoryId: 4, targetCategoryName: 'Bills & Utilities', targetBudgetId: 106, targetBudgetTitle: 'Electricity Utility (EDF)', priority: 14, isActive: true, updatedAt: now, isDeleted: false },
        { id: 203, pattern: 'FUEL|GAS|TOTAL|SHELL|BP', matchType: 'REGEX', targetCategoryId: 5, targetCategoryName: 'Transport & Fuel', targetBudgetId: 109, targetBudgetTitle: 'Fuel & Commute', priority: 13, isActive: true, updatedAt: now, isDeleted: false },
        { id: 204, pattern: 'INTERNET|ORANGE|FIBER|FREE|SFR', matchType: 'REGEX', targetCategoryId: 4, targetCategoryName: 'Bills & Utilities', targetBudgetId: 108, targetBudgetTitle: 'Fiber Internet & Phones', priority: 12, isActive: true, updatedAt: now, isDeleted: false },
        { id: 205, pattern: 'INSURANCE|AXA|ALLIANZ', matchType: 'REGEX', targetCategoryId: 4, targetCategoryName: 'Bills & Utilities', targetBudgetId: 107, targetBudgetTitle: 'Home Insurance', priority: 11, isActive: true, updatedAt: now, isDeleted: false },
        { id: 206, pattern: 'SCHOOL|MUNICIPAL', matchType: 'CONTAINS', targetCategoryId: 6, targetCategoryName: 'Children & School', targetBudgetId: 110, targetBudgetTitle: 'School Lunches & Childcare', priority: 10, isActive: true, updatedAt: now, isDeleted: false },
        { id: 207, pattern: 'PHARMACY|CLINIC', matchType: 'CONTAINS', targetCategoryId: 8, targetCategoryName: 'Health & Medical', targetBudgetId: 112, targetBudgetTitle: 'Pharmacy & Doctor Checkups', priority: 9, isActive: true, updatedAt: now, isDeleted: false },
        { id: 208, pattern: 'SALARY|PAYROLL', matchType: 'CONTAINS', targetCategoryId: 1, targetCategoryName: 'Income & Salaries', targetBudgetId: 101, targetBudgetTitle: 'John Salary', priority: 20, isActive: true, updatedAt: now, isDeleted: false }
      ]
    : [
        { id: 201, pattern: 'CARREFOUR|AUCHAN|LECLERC|MONOPRIX|LIDL|INTERMARCHE', matchType: 'REGEX', targetCategoryId: 3, targetCategoryName: 'Alimentation & Courses', targetBudgetId: 104, targetBudgetTitle: 'Supermarché & Courses', priority: 15, isActive: true, updatedAt: now, isDeleted: false },
        { id: 202, pattern: 'EDF|ENGIE|TOTALENERGIES', matchType: 'REGEX', targetCategoryId: 4, targetCategoryName: 'Factures & Énergie', targetBudgetId: 106, targetBudgetTitle: 'Électricité (EDF)', priority: 14, isActive: true, updatedAt: now, isDeleted: false },
        { id: 203, pattern: 'STATION|ESSENCE|TOTAL|SHELL|ESSO|BP', matchType: 'REGEX', targetCategoryId: 5, targetCategoryName: 'Transports & Carburant', targetBudgetId: 109, targetBudgetTitle: 'Carburant & Déplacements', priority: 13, isActive: true, updatedAt: now, isDeleted: false },
        { id: 204, pattern: 'ORANGE|FREE TELECOM|SFR|BOUYGUES', matchType: 'REGEX', targetCategoryId: 4, targetCategoryName: 'Factures & Énergie', targetBudgetId: 108, targetBudgetTitle: 'Internet Fibre & Téléphonie', priority: 12, isActive: true, updatedAt: now, isDeleted: false },
        { id: 205, pattern: 'MACIF|MAIF|ALLIANZ|AXA', matchType: 'REGEX', targetCategoryId: 4, targetCategoryName: 'Factures & Énergie', targetBudgetId: 107, targetBudgetTitle: 'Assurance Habitation', priority: 11, isActive: true, updatedAt: now, isDeleted: false },
        { id: 206, pattern: 'CANTINE|MAIRIE|SCOLAIRE', matchType: 'REGEX', targetCategoryId: 6, targetCategoryName: 'Enfants & Scolarité', targetBudgetId: 110, targetBudgetTitle: 'Cantine & Activités extrascolaires', priority: 10, isActive: true, updatedAt: now, isDeleted: false },
        { id: 207, pattern: 'PHARMACIE|DOCTOLIB|LABORATOIRE', matchType: 'REGEX', targetCategoryId: 8, targetCategoryName: 'Santé & Prévoyance', targetBudgetId: 112, targetBudgetTitle: 'Pharmacie & Médecins', priority: 9, isActive: true, updatedAt: now, isDeleted: false },
        { id: 208, pattern: 'VIREMENT SALAIRE|PAYE', matchType: 'REGEX', targetCategoryId: 1, targetCategoryName: 'Emploi & Revenus', targetBudgetId: 101, targetBudgetTitle: 'Salaire Jean', priority: 20, isActive: true, updatedAt: now, isDeleted: false }
      ];

  const primaryUser = members[0];
  const secondUser = members[1];
  const checkingAcc = accounts[0];
  const cardAcc = accounts[1];
  const savingsAcc = accounts[2];

  const currentCardPeriod = computeDefaultCardPeriod(now, 25);
  const prevCardPeriod = shiftCardPeriod(currentCardPeriod, -1);
  const parsedPrevPeriod = parseCardPeriod(prevCardPeriod)!;
  const prevCyclePurchase1Ms = new Date(
    parsedPrevPeriod.year,
    parsedPrevPeriod.month1to12 - 1,
    14,
    12,
    0,
    0,
    0
  ).getTime();
  const prevCyclePurchase2Ms = new Date(
    parsedPrevPeriod.year,
    parsedPrevPeriod.month1to12 - 1,
    20,
    12,
    0,
    0,
    0
  ).getTime();
  const prevCycleSettlementMs = new Date(
    parsedPrevPeriod.year,
    parsedPrevPeriod.month1to12 - 1,
    28,
    12,
    0,
    0,
    0
  ).getTime();

  const transactions: TransactionEntity[] = isEn
    ? [
        {
          id: 1,
          title: 'Monthly Savings Transfer',
          originalBankLabel: 'INTERNAL TRANSFER TO SAVINGS',
          amount: -300.0,
          isExpense: true,
          categoryId: 9,
          categoryName: 'Savings & Investments',
          categoryColor: 0xff6366f1,
          categoryIcon: 'PiggyBank',
          budgetId: 113,
          budgetTitle: 'Monthly Livret A Transfer',
          date: now - 3 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Transfer',
          notes: 'Automatic savings',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          targetAccountId: savingsAcc.id,
          targetAccountName: savingsAcc.name,
          isInternalTransfer: true,
          transferType: 'TO_SAVINGS',
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 2,
          title: 'Weekly Supermarket Groceries',
          originalBankLabel: 'SUPERMARKET WHOLESALE CARREFOUR',
          amount: -142.5,
          isExpense: true,
          categoryId: 3,
          categoryName: 'Groceries & Food',
          categoryColor: 0xfff59e0b,
          categoryIcon: 'ShoppingCart',
          budgetId: 104,
          budgetTitle: 'Supermarket & Groceries',
          date: now - 1 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Visa Premier',
          notes: 'Groceries for the week',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: computeDefaultCardPeriod(now - 1 * dayMs, 25),
          sharedSplit: {
            isShared: true,
            mode: 'EQUAL',
            paidByMemberId: primaryUser.id,
            paidByMemberName: primaryUser.name,
            participants: [
              { memberId: primaryUser.id, memberName: primaryUser.name, percentage: 50, shareAmount: 71.25 },
              { memberId: secondUser.id, memberName: secondUser.name, percentage: 50, shareAmount: 71.25 }
            ]
          },
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 3,
          title: 'Kids Sports Shoes & Gear',
          originalBankLabel: 'DECATHLON SPORTS GEAR',
          amount: -69.9,
          isExpense: true,
          categoryId: 6,
          categoryName: 'Children & School',
          categoryColor: 0xffec4899,
          categoryIcon: 'GraduationCap',
          budgetId: 110,
          budgetTitle: 'School Lunches & Childcare',
          date: now - 2 * dayMs,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Visa Premier',
          notes: 'Football sneakers Lucas',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: computeDefaultCardPeriod(now - 2 * dayMs, 25),
          sharedSplit: {
            isShared: true,
            mode: 'EQUAL',
            paidByMemberId: secondUser.id,
            paidByMemberName: secondUser.name,
            participants: [
              { memberId: primaryUser.id, memberName: primaryUser.name, percentage: 50, shareAmount: 34.95 },
              { memberId: secondUser.id, memberName: secondUser.name, percentage: 50, shareAmount: 34.95 }
            ]
          },
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 4,
          title: 'Family Dinner at Pizzeria',
          originalBankLabel: 'BELLA VISTA PIZZERIA',
          amount: -84.5,
          isExpense: true,
          categoryId: 7,
          categoryName: 'Leisure & Dining Out',
          categoryColor: 0xff14b8a6,
          categoryIcon: 'Utensils',
          budgetId: 111,
          budgetTitle: 'Family Outings & Dinners',
          date: now - 4 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'MANUAL',
          status: 'VERIFIED',
          paymentMethod: 'Visa Premier',
          notes: 'Weekend dinner',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: computeDefaultCardPeriod(now - 4 * dayMs, 25),
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 5,
          title: 'Highway Fuel Gas Station',
          originalBankLabel: 'TOTAL HIGHWAY FUEL',
          amount: -68.0,
          isExpense: true,
          categoryId: 5,
          categoryName: 'Transport & Fuel',
          categoryColor: 0xff8b5cf6,
          categoryIcon: 'Car',
          budgetId: 109,
          budgetTitle: 'Fuel & Commute',
          date: now - 3 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Card',
          notes: '',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 6,
          title: 'Corner Pharmacy Medicine',
          originalBankLabel: 'PHARMACIE CENTRALE',
          amount: -28.4,
          isExpense: true,
          categoryId: 8,
          categoryName: 'Health & Medical',
          categoryColor: 0xff06b6d4,
          categoryIcon: 'HeartPulse',
          budgetId: 112,
          budgetTitle: 'Pharmacy & Doctor Checkups',
          date: now - 5 * dayMs,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'MANUAL',
          status: 'PENDING',
          paymentMethod: 'Card',
          notes: 'Cough syrup and vitamins',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 7,
          title: 'Electricity Utility Bill (EDF)',
          originalBankLabel: 'PRLV EDF POWER COMPANY',
          amount: -140.0,
          isExpense: true,
          categoryId: 4,
          categoryName: 'Bills & Utilities',
          categoryColor: 0xffef4444,
          categoryIcon: 'Zap',
          budgetId: 106,
          budgetTitle: 'Electricity Utility (EDF)',
          date: now - 7 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Direct Debit',
          notes: 'Monthly regularisation',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          sharedSplit: {
            isShared: true,
            mode: 'INCOME_RATIO',
            paidByMemberId: primaryUser.id,
            paidByMemberName: primaryUser.name,
            participants: [
              { memberId: primaryUser.id, memberName: primaryUser.name, percentage: 60.18, shareAmount: 84.25 },
              { memberId: secondUser.id, memberName: secondUser.name, percentage: 39.82, shareAmount: 55.75 }
            ]
          },
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 8,
          title: 'Fiber Internet & Mobile',
          originalBankLabel: 'PRLV ORANGE INTERNET',
          amount: -60.0,
          isExpense: true,
          categoryId: 4,
          categoryName: 'Bills & Utilities',
          categoryColor: 0xffef4444,
          categoryIcon: 'Zap',
          budgetId: 108,
          budgetTitle: 'Fiber Internet & Phones',
          date: now - 10 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Direct Debit',
          notes: 'Monthly fiber line',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 9,
          title: 'School Cafeteria & Lunches',
          originalBankLabel: 'PRLV CAISSE DES ECOLES',
          amount: -240.0,
          isExpense: true,
          categoryId: 6,
          categoryName: 'Children & School',
          categoryColor: 0xffec4899,
          categoryIcon: 'GraduationCap',
          budgetId: 110,
          budgetTitle: 'School Lunches & Childcare',
          date: now - 12 * dayMs,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Direct Debit',
          notes: 'Lunches Lucas & Emma',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 10,
          title: 'Monthly Salary John',
          originalBankLabel: 'VIR EMETTEUR TECH CORP SALARY',
          amount: 3400.0,
          isExpense: false,
          categoryId: 1,
          categoryName: 'Income & Salaries',
          categoryColor: 0xff10b981,
          categoryIcon: 'Coins',
          budgetId: 101,
          budgetTitle: 'John Salary',
          date: now - 14 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Transfer',
          notes: 'Monthly pay',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 11,
          title: 'Monthly Salary Sophie',
          originalBankLabel: 'VIR CLINIQUE MUNICIPALE SALAIRE',
          amount: 2250.0,
          isExpense: false,
          categoryId: 1,
          categoryName: 'Income & Salaries',
          categoryColor: 0xff10b981,
          categoryIcon: 'Coins',
          budgetId: 102,
          budgetTitle: 'Sophie Salary',
          date: now - 14 * dayMs,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Transfer',
          notes: 'Monthly pay',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 12,
          title: 'Mortgage / Rent Payment',
          originalBankLabel: 'PRLV PRET IMMOBILIER',
          amount: -1200.0,
          isExpense: true,
          categoryId: 2,
          categoryName: 'Housing & Rent',
          categoryColor: 0xff3b82f6,
          categoryIcon: 'Home',
          budgetId: 103,
          budgetTitle: 'Rent / Mortgage',
          date: now - 15 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Direct Debit',
          notes: 'Monthly home mortgage',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          sharedSplit: {
            isShared: true,
            mode: 'INCOME_RATIO',
            paidByMemberId: primaryUser.id,
            paidByMemberName: primaryUser.name,
            participants: [
              { memberId: primaryUser.id, memberName: primaryUser.name, percentage: 60.18, shareAmount: 722.16 },
              { memberId: secondUser.id, memberName: secondUser.name, percentage: 39.82, shareAmount: 477.84 }
            ]
          },
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 13,
          title: `Visa Premier Lump-Sum Settlement (${prevCardPeriod})`,
          originalBankLabel: 'PRLV CARTE DIFFERE VISA PREMIER',
          amount: -185.0,
          isExpense: true,
          categoryId: 0,
          categoryName: 'Card Settlement',
          categoryColor: 0xff2563eb,
          categoryIcon: 'CreditCard',
          budgetId: 0,
          budgetTitle: '',
          date: prevCycleSettlementMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Card Settlement',
          notes: `Monthly deferred card debit (${prevCardPeriod})`,
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          targetAccountId: cardAcc.id,
          targetAccountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: prevCardPeriod,
          isInternalTransfer: true,
          transferType: 'CARD_SETTLEMENT',
          isExcluded: true,
          isExcludedFromTotals: true,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 14,
          title: 'Prior Cycle Fuel & Tolls',
          originalBankLabel: 'AUTOROUTES & TOTAL VISA',
          amount: -70.0,
          isExpense: true,
          categoryId: 5,
          categoryName: 'Transport & Fuel',
          categoryColor: 0xff8b5cf6,
          categoryIcon: 'Car',
          budgetId: 109,
          budgetTitle: 'Fuel & Commute',
          date: prevCyclePurchase2Ms,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Visa Premier',
          notes: '',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: prevCardPeriod,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 15,
          title: 'Prior Cycle Supermarket Order',
          originalBankLabel: 'CARREFOUR DRIVE VISA',
          amount: -115.0,
          isExpense: true,
          categoryId: 3,
          categoryName: 'Groceries & Food',
          categoryColor: 0xfff59e0b,
          categoryIcon: 'ShoppingCart',
          budgetId: 104,
          budgetTitle: 'Supermarket & Groceries',
          date: prevCyclePurchase1Ms,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Visa Premier',
          notes: '',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: prevCardPeriod,
          updatedAt: now,
          isDeleted: false
        }
      ]
    : [
        {
          id: 1,
          title: 'Virement Épargne Mensuel (Livret A)',
          originalBankLabel: 'VIR INTERNE VERS LIVRET A',
          amount: -300.0,
          isExpense: true,
          categoryId: 9,
          categoryName: 'Épargne & Investissement',
          categoryColor: 0xff6366f1,
          categoryIcon: 'PiggyBank',
          budgetId: 113,
          budgetTitle: 'Virement Épargne Mensuel',
          date: now - 3 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Virement',
          notes: 'Épargne mensuelle automatique',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          targetAccountId: savingsAcc.id,
          targetAccountName: savingsAcc.name,
          isInternalTransfer: true,
          transferType: 'TO_SAVINGS',
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 2,
          title: 'Courses de la semaine Carrefour',
          originalBankLabel: 'CARREFOUR MARKET ST MARTIN',
          amount: -142.5,
          isExpense: true,
          categoryId: 3,
          categoryName: 'Alimentation & Courses',
          categoryColor: 0xfff59e0b,
          categoryIcon: 'ShoppingCart',
          budgetId: 104,
          budgetTitle: 'Supermarché & Courses',
          date: now - 1 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Carte Visa Premier',
          notes: 'Ravitaillement frais et épicerie',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: computeDefaultCardPeriod(now - 1 * dayMs, 25),
          sharedSplit: {
            isShared: true,
            mode: 'EQUAL',
            paidByMemberId: primaryUser.id,
            paidByMemberName: primaryUser.name,
            participants: [
              { memberId: primaryUser.id, memberName: primaryUser.name, percentage: 50, shareAmount: 71.25 },
              { memberId: secondUser.id, memberName: secondUser.name, percentage: 50, shareAmount: 71.25 }
            ]
          },
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 3,
          title: 'Chaussures de sport Lucas',
          originalBankLabel: 'DECATHLON VELIZY SPORT',
          amount: -69.9,
          isExpense: true,
          categoryId: 6,
          categoryName: 'Enfants & Scolarité',
          categoryColor: 0xffec4899,
          categoryIcon: 'GraduationCap',
          budgetId: 110,
          budgetTitle: 'Cantine & Activités extrascolaires',
          date: now - 2 * dayMs,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Carte Visa Premier',
          notes: 'Crampons de foot',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: computeDefaultCardPeriod(now - 2 * dayMs, 25),
          sharedSplit: {
            isShared: true,
            mode: 'EQUAL',
            paidByMemberId: secondUser.id,
            paidByMemberName: secondUser.name,
            participants: [
              { memberId: primaryUser.id, memberName: primaryUser.name, percentage: 50, shareAmount: 34.95 },
              { memberId: secondUser.id, memberName: secondUser.name, percentage: 50, shareAmount: 34.95 }
            ]
          },
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 4,
          title: 'Dîner famille Pizzeria Bella Vista',
          originalBankLabel: 'BELLA VISTA PIZZERIA',
          amount: -84.5,
          isExpense: true,
          categoryId: 7,
          categoryName: 'Loisirs & Sorties',
          categoryColor: 0xff14b8a6,
          categoryIcon: 'Utensils',
          budgetId: 111,
          budgetTitle: 'Restaurants & Sorties famille',
          date: now - 4 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'MANUAL',
          status: 'VERIFIED',
          paymentMethod: 'Carte Visa Premier',
          notes: 'Sortie du vendredi soir',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: computeDefaultCardPeriod(now - 4 * dayMs, 25),
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 5,
          title: 'Plein de carburant Station Total',
          originalBankLabel: 'TOTAL RELAIS AUTOROUTE',
          amount: -68.0,
          isExpense: true,
          categoryId: 5,
          categoryName: 'Transports & Carburant',
          categoryColor: 0xff8b5cf6,
          categoryIcon: 'Car',
          budgetId: 109,
          budgetTitle: 'Carburant & Déplacements',
          date: now - 3 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Carte Bancaire',
          notes: '',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 6,
          title: 'Pharmacie centrale - Médicaments',
          originalBankLabel: 'PHARMACIE CENTRALE DE LA GARE',
          amount: -28.4,
          isExpense: true,
          categoryId: 8,
          categoryName: 'Santé & Prévoyance',
          categoryColor: 0xff06b6d4,
          categoryIcon: 'HeartPulse',
          budgetId: 112,
          budgetTitle: 'Pharmacie & Médecins',
          date: now - 5 * dayMs,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'MANUAL',
          status: 'PENDING',
          paymentMethod: 'Carte',
          notes: 'Sirop toux et vitamines enfants',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 7,
          title: 'Facture Électricité EDF',
          originalBankLabel: 'PRLV EDF ELECTRICITE DE FRANCE',
          amount: -140.0,
          isExpense: true,
          categoryId: 4,
          categoryName: 'Factures & Énergie',
          categoryColor: 0xffef4444,
          categoryIcon: 'Zap',
          budgetId: 106,
          budgetTitle: 'Électricité (EDF)',
          date: now - 7 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Prélèvement',
          notes: 'Mensualité électricité',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          sharedSplit: {
            isShared: true,
            mode: 'INCOME_RATIO',
            paidByMemberId: primaryUser.id,
            paidByMemberName: primaryUser.name,
            participants: [
              { memberId: primaryUser.id, memberName: primaryUser.name, percentage: 60.18, shareAmount: 84.25 },
              { memberId: secondUser.id, memberName: secondUser.name, percentage: 39.82, shareAmount: 55.75 }
            ]
          },
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 8,
          title: 'Abonnement Fibre Orange',
          originalBankLabel: 'PRLV ORANGE FIBRE INTERNET',
          amount: -60.0,
          isExpense: true,
          categoryId: 4,
          categoryName: 'Factures & Énergie',
          categoryColor: 0xffef4444,
          categoryIcon: 'Zap',
          budgetId: 108,
          budgetTitle: 'Internet Fibre & Téléphonie',
          date: now - 10 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Prélèvement',
          notes: 'Box fibre + 2 forfaits mobile',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 9,
          title: 'Cantine Scolaire & Garderie',
          originalBankLabel: 'PRLV CAISSE DES ECOLES',
          amount: -240.0,
          isExpense: true,
          categoryId: 6,
          categoryName: 'Enfants & Scolarité',
          categoryColor: 0xffec4899,
          categoryIcon: 'GraduationCap',
          budgetId: 110,
          budgetTitle: 'Cantine & Activités extrascolaires',
          date: now - 12 * dayMs,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Prélèvement',
          notes: 'Repas Lucas et Emma',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 10,
          title: 'Salaire Jean',
          originalBankLabel: 'VIR EMETTEUR SOCIETE SALAIRE',
          amount: 3400.0,
          isExpense: false,
          categoryId: 1,
          categoryName: 'Emploi & Revenus',
          categoryColor: 0xff10b981,
          categoryIcon: 'Coins',
          budgetId: 101,
          budgetTitle: 'Salaire Jean',
          date: now - 14 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Virement',
          notes: 'Virement employeur',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 11,
          title: 'Salaire Sophie',
          originalBankLabel: 'VIR CLINIQUE MUNICIPALE SALAIRE',
          amount: 2250.0,
          isExpense: false,
          categoryId: 1,
          categoryName: 'Emploi & Revenus',
          categoryColor: 0xff10b981,
          categoryIcon: 'Coins',
          budgetId: 102,
          budgetTitle: 'Salaire Sophie',
          date: now - 14 * dayMs,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Virement',
          notes: 'Virement hôpital',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 12,
          title: 'Mensualité Prêt Immobilier',
          originalBankLabel: 'PRLV ECHEANCE PRET IMMO BANQUE',
          amount: -1200.0,
          isExpense: true,
          categoryId: 2,
          categoryName: 'Logement & Loyer',
          categoryColor: 0xff3b82f6,
          categoryIcon: 'Home',
          budgetId: 103,
          budgetTitle: 'Loyer / Prêt Immobilier',
          date: now - 15 * dayMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Prélèvement',
          notes: 'Échéance crédit résidence principale',
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          sharedSplit: {
            isShared: true,
            mode: 'INCOME_RATIO',
            paidByMemberId: primaryUser.id,
            paidByMemberName: primaryUser.name,
            participants: [
              { memberId: primaryUser.id, memberName: primaryUser.name, percentage: 60.18, shareAmount: 722.16 },
              { memberId: secondUser.id, memberName: secondUser.name, percentage: 39.82, shareAmount: 477.84 }
            ]
          },
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 13,
          title: `Prélèvement Carte Différée Visa Premier (${prevCardPeriod})`,
          originalBankLabel: 'PRLV CARTE DIFFERE VISA PREMIER',
          amount: -185.0,
          isExpense: true,
          categoryId: 0,
          categoryName: 'Règlement Carte',
          categoryColor: 0xff2563eb,
          categoryIcon: 'CreditCard',
          budgetId: 0,
          budgetTitle: '',
          date: prevCycleSettlementMs,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Prélèvement Carte',
          notes: `Débit mensuel carte différée (${prevCardPeriod})`,
          accountId: checkingAcc.id,
          accountName: checkingAcc.name,
          targetAccountId: cardAcc.id,
          targetAccountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: prevCardPeriod,
          isInternalTransfer: true,
          transferType: 'CARD_SETTLEMENT',
          isExcluded: true,
          isExcludedFromTotals: true,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 14,
          title: 'Péages & Carburant cycle précédent',
          originalBankLabel: 'VINCI AUTOROUTES & TOTAL',
          amount: -70.0,
          isExpense: true,
          categoryId: 5,
          categoryName: 'Transports & Carburant',
          categoryColor: 0xff8b5cf6,
          categoryIcon: 'Car',
          budgetId: 109,
          budgetTitle: 'Carburant & Déplacements',
          date: prevCyclePurchase2Ms,
          familyMemberId: primaryUser.id,
          familyMemberName: primaryUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Carte Visa Premier',
          notes: '',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: prevCardPeriod,
          updatedAt: now,
          isDeleted: false
        },
        {
          id: 15,
          title: 'Commande Courses Drive cycle précédent',
          originalBankLabel: 'CARREFOUR DRIVE VISA',
          amount: -115.0,
          isExpense: true,
          categoryId: 3,
          categoryName: 'Alimentation & Courses',
          categoryColor: 0xfff59e0b,
          categoryIcon: 'ShoppingCart',
          budgetId: 104,
          budgetTitle: 'Supermarché & Courses',
          date: prevCyclePurchase1Ms,
          familyMemberId: secondUser.id,
          familyMemberName: secondUser.name,
          source: 'BANK_IMPORT',
          status: 'VERIFIED',
          paymentMethod: 'Carte Visa Premier',
          notes: '',
          accountId: cardAcc.id,
          accountName: cardAcc.name,
          settlementCardName: cardAcc.name,
          billingCycleClosingDay: 25,
          creditCardPeriod: prevCardPeriod,
          updatedAt: now,
          isDeleted: false
        }
      ];

  const sharedSettlements: SharedSettlementEntity[] = [
    {
      id: 'settle_demo_1',
      fromMemberId: secondUser.id,
      fromMemberName: secondUser.name,
      toMemberId: primaryUser.id,
      toMemberName: primaryUser.name,
      amount: 400.0,
      date: now - 6 * dayMs,
      notes: isEn ? 'Monthly housing & utilities advance' : 'Virement mensuel part logement & charges',
      linkedTransactionId: null,
      updatedAt: now,
      isDeleted: false
    }
  ];

  const sharedPreset: SharedExpensePreset = {
    defaultMode: 'EQUAL',
    defaultParticipantIds: [primaryUser.id, secondUser.id]
  };

  const syncState: SyncStateEntity = {
    syncKey: 'primary_sync',
    lastPullTimestamp: now,
    lastPushTimestamp: now,
    lastSyncStatus: 'SUCCESS',
    lastSyncMessage: isEn ? 'Demo mode active (in-memory only).' : 'Mode Démo actif (en mémoire uniquement).',
    pendingOutboxCount: 0
  };

  return {
    accounts,
    transactions,
    categories,
    budgets,
    rules,
    members,
    sharedSettlements,
    sharedPreset,
    config,
    syncState
  };
}
