import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  Firestore,
  writeBatch,
  doc,
  collection,
  getDocs,
  query,
  where,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  AccountEntity,
  CategorizationRuleEntity,
  CategoryBudgetEntity,
  CategoryEntity,
  FamilyMemberEntity,
  FirebaseConfigEntity,
  MemberRole,
  SharedSettlementEntity,
  SyncOutboxEntity,
  SyncStateEntity,
  TransactionEntity
} from '../types';

let firebaseAppInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let activeConfigSignature = '';

const PROJECT_ID_REGEX = /^[a-z0-9-]{4,64}$/;
const API_KEY_REGEX = /^[A-Za-z0-9_-]{20,128}$/;
const APP_ID_REGEX = /^1:\d+:web:[a-fA-F0-9]+$/;

export function validateFirebaseConfigFields(config?: Partial<FirebaseConfigEntity>): {
  valid: boolean;
  error?: string;
} {
  const projectId = config?.projectId?.trim() || '';
  const apiKey = config?.apiKey?.trim() || '';
  const appId = config?.applicationId?.trim() || '';

  if (!PROJECT_ID_REGEX.test(projectId)) {
    return {
      valid: false,
      error: 'Format de Firebase Project ID invalide (lettres minuscules, chiffres et tirets uniquement, 4-64 caractères).'
    };
  }
  if (!API_KEY_REGEX.test(apiKey)) {
    return {
      valid: false,
      error: 'Format de Firebase Web API Key invalide.'
    };
  }
  if (appId && !APP_ID_REGEX.test(appId)) {
    return {
      valid: false,
      error: 'Format de Firebase Application ID invalide (attendu : 1:<num>:web:<hex>).'
    };
  }
  return { valid: true };
}

function buildConfigSignature(config?: Partial<FirebaseConfigEntity>): string {
  const apiKey = config?.apiKey?.trim() || '';
  const projectId = config?.projectId?.trim() || '';
  const appId = config?.applicationId?.trim() || '';
  return `${projectId}::${apiKey}::${appId}`;
}

export async function resetFirebaseInstances(): Promise<void> {
  const appToDelete = firebaseAppInstance;
  firebaseAppInstance = null;
  firestoreInstance = null;
  activeConfigSignature = '';
  if (appToDelete) {
    try {
      await deleteApp(appToDelete);
    } catch {
      // Ignore cleanup failures
    }
  }
}

export function getOrInitFirestore(config?: Partial<FirebaseConfigEntity>): {
  app: FirebaseApp | null;
  db: Firestore | null;
  error?: string;
} {
  try {
    const apiKey = config?.apiKey?.trim() || '';
    const projectId = config?.projectId?.trim() || '';
    const appId = config?.applicationId?.trim() || '';

    // If no explicit user credentials are provided, remain in clean offline local mode
    if (!apiKey || !projectId) {
      return { app: null, db: null };
    }

    const validation = validateFirebaseConfigFields({ projectId, apiKey, applicationId: appId });
    if (!validation.valid) {
      return { app: null, db: null, error: validation.error };
    }

    const nextSig = buildConfigSignature(config);
    if (firestoreInstance && firebaseAppInstance && activeConfigSignature === nextSig) {
      return { app: firebaseAppInstance, db: firestoreInstance };
    }

    const appName = `byob_${projectId}_${apiKey.slice(-6)}`;
    const existingNamedApp = getApps().find(a => a.name === appName);

    if (existingNamedApp) {
      firebaseAppInstance = existingNamedApp;
    } else {
      const firebaseConfig: Record<string, string> = {
        apiKey,
        projectId,
        authDomain: `${projectId}.firebaseapp.com`,
        storageBucket: `${projectId}.firebasestorage.app`
      };
      if (appId) {
        firebaseConfig.appId = appId;
      }
      firebaseAppInstance = initializeApp(firebaseConfig, appName);
    }

    try {
      firestoreInstance = initializeFirestore(firebaseAppInstance, {
        experimentalAutoDetectLongPolling: true
      });
    } catch {
      // Already initialized on this FirebaseApp instance
      firestoreInstance = getFirestore(firebaseAppInstance);
    }
    activeConfigSignature = nextSig;
    return { app: firebaseAppInstance, db: firestoreInstance };
  } catch (err: any) {
    console.warn('Could not initialize Firebase Firestore SDK:', err);
    return { app: null, db: null, error: err?.message || 'Firebase initialization failed' };
  }
}

export interface SyncPayload {
  accounts: AccountEntity[];
  transactions: TransactionEntity[];
  categories: CategoryEntity[];
  budgets: CategoryBudgetEntity[];
  rules: CategorizationRuleEntity[];
  members: FamilyMemberEntity[];
  sharedSettlements?: SharedSettlementEntity[];
  outbox: SyncOutboxEntity[];
  syncState: SyncStateEntity;
  config: FirebaseConfigEntity;
}

export interface SyncResult {
  success: boolean;
  pushedCount: number;
  pulledCount: number;
  message: string;
  updatedSyncState: SyncStateEntity;
  incomingTransactions?: TransactionEntity[];
  incomingAccounts?: AccountEntity[];
  incomingCategories?: CategoryEntity[];
  incomingBudgets?: CategoryBudgetEntity[];
  incomingRules?: CategorizationRuleEntity[];
  incomingMembers?: FamilyMemberEntity[];
  incomingSharedSettlements?: SharedSettlementEntity[];
  incomingFamilyName?: string;
  resolvedUserRole?: MemberRole;
}

function toMillis(val: any, fallback: number): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (val && typeof val.toMillis === 'function') return val.toMillis();
  if (val && typeof val.seconds === 'number') return val.seconds * 1000;
  return fallback;
}

function parseNumericId(docId: string, rawId: any, fallbackIndex: number): number {
  if (typeof rawId === 'number' && !Number.isNaN(rawId) && rawId > 0) return rawId;
  const cleaned = String(docId).replace(/^[a-zA-Z_]+/, '');
  const parsed = parseInt(cleaned, 10);
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  return fallbackIndex;
}

function stripUndefined<T extends Record<string, any>>(obj: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const FIRESTORE_OP_TIMEOUT_MS = 20_000;

function withFirestoreTimeout<T>(promise: Promise<T>, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const timeoutErr: any = new Error(
          `Délai dépassé (${FIRESTORE_OP_TIMEOUT_MS / 1000}s) sans réponse de Cloud Firestore à l’étape « ${stage} ».`
        );
        timeoutErr.code = 'deadline-exceeded';
        reject(timeoutErr);
      }, FIRESTORE_OP_TIMEOUT_MS);
    })
  ]);
}

/**
 * Executes the Atomic RBAC Bootstrap + Transactional Outbox Push + Delta Pull sync pipeline
 * against real BYOB Cloud Firestore.
 */
export async function executeBidirectionalSync(payload: SyncPayload): Promise<SyncResult> {
  const syncStartTime = Date.now();
  const hasByobConfig = !!(payload.config.projectId?.trim() && payload.config.apiKey?.trim());

  // Demo / In-Memory Mode (no BYOB Firebase configured)
  if (!hasByobConfig) {
    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      message: 'Mode Démo (en mémoire uniquement) — Configurez un projet Firestore BYOB pour synchroniser.',
      updatedSyncState: {
        ...payload.syncState,
        lastSyncStatus: 'IDLE',
        lastSyncMessage: 'Mode Démo en mémoire (aucun stockage local ou cloud).',
        pendingOutboxCount: 0
      }
    };
  }

  const { app, db, error } = getOrInitFirestore(payload.config);

  if (!db || !app) {
    const errMsg = error || 'Impossible d’initialiser le SDK Firebase avec ces identifiants.';
    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      message: errMsg,
      updatedSyncState: {
        ...payload.syncState,
        lastSyncStatus: 'ERROR',
        lastSyncMessage: errMsg
      }
    };
  }

  // Enforce real verified Firebase Auth check for BYOB Firestore
  const auth = getAuth(app);
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email || !currentUser.emailVerified) {
    const authErrMsg = !currentUser || !currentUser.email
      ? 'Authentification Google OAuth requise pour synchroniser avec votre Firestore BYOB.'
      : 'Votre adresse e-mail Google doit être vérifiée pour accéder à votre coffre Firestore.';
    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      message: authErrMsg,
      updatedSyncState: {
        ...payload.syncState,
        lastSyncStatus: 'ERROR',
        lastSyncMessage: authErrMsg
      }
    };
  }

  let pushedCount = 0;
  let pulledCount = 0;
  let currentStage = 'Initialisation synchronisation Firestore';

  try {
    // -------------------------------------------------------------
    // PHASE 1: ATOMIC RBAC & METADATA BOOTSTRAP (must run BEFORE Outbox Push)
    // -------------------------------------------------------------
    let incomingFamilyName: string | undefined;
    const rolesRef = doc(db, 'security_config', 'roles');
    const vaultRef = doc(db, 'family_meta', 'vault');
    const userEmailLower = currentUser.email.toLowerCase();

    currentStage = 'Lecture des rôles et métadonnées (security_config/roles, family_meta/vault)';
    let rolesExists = false;
    let vaultExists = false;
    let existingRolesData: Record<string, string> | undefined;
    let existingVaultData: Record<string, any> | undefined;
    let readDenied = false;

    try {
      const [rolesSnap, vaultSnap] = await withFirestoreTimeout(
        Promise.all([getDoc(rolesRef), getDoc(vaultRef)]),
        currentStage
      );
      rolesExists = rolesSnap.exists();
      vaultExists = vaultSnap.exists();
      existingRolesData = rolesExists
        ? (rolesSnap.data()?.userRoles as Record<string, string> | undefined)
        : undefined;
      existingVaultData = vaultExists ? vaultSnap.data() : undefined;
      if (existingVaultData?.familyName) {
        incomingFamilyName = String(existingVaultData.familyName);
      }
    } catch (readErr: any) {
      const readCode = readErr?.code || '';
      const readMsg = String(readErr?.message || '');
      if (
        readCode === 'permission-denied' ||
        readMsg.includes('permission') ||
        readMsg.includes('Missing or insufficient permissions')
      ) {
        // Under zero-trust rules, get(security_config/roles) is denied before roles doc exists.
        // We safely attempt atomic create-only bootstrap below; rules will reject it if vault already exists.
        readDenied = true;
      } else {
        throw readErr;
      }
    }

    const isFreshVaultBootstrap = (!rolesExists && !vaultExists) || readDenied;
    let serverRole: MemberRole = isFreshVaultBootstrap
      ? 'ADMIN'
      : ((existingRolesData?.[userEmailLower] as MemberRole | undefined) || 'VIEWER');
    let isCallerAdmin = serverRole === 'ADMIN';

    if (isFreshVaultBootstrap) {
      currentStage = 'Initialisation atomique du coffre (security_config/roles + family_meta/vault)';
      const userRolesMap: Record<string, string> = {
        [userEmailLower]: 'ADMIN'
      };
      for (const m of payload.members) {
        if (m.email && m.email.trim()) {
          const emailKey = m.email.trim().toLowerCase();
          if (emailKey !== userEmailLower) {
            userRolesMap[emailKey] = m.role;
          }
        }
      }

      const bootstrapBatch = writeBatch(db);
      bootstrapBatch.set(rolesRef, {
        userRoles: userRolesMap,
        updatedAt: syncStartTime
      });
      bootstrapBatch.set(vaultRef, {
        familyName: (payload.config.familyName || 'Family Budget Vault').trim().slice(0, 120) || 'Family Budget Vault',
        adminEmail: currentUser.email,
        updatedAt: syncStartTime
      });
      await withFirestoreTimeout(bootstrapBatch.commit(), currentStage);
      serverRole = 'ADMIN';
      isCallerAdmin = true;
    } else if (isCallerAdmin) {
      if (payload.outbox.some(o => o.entityType === 'MEMBER')) {
        currentStage = 'Mise à jour des rôles RBAC (security_config/roles)';
        const userRolesMap: Record<string, string> = {};
        for (const m of payload.members) {
          if (!m.isDeleted && m.email && m.email.trim()) {
            userRolesMap[m.email.trim().toLowerCase()] = m.role;
          }
        }
        userRolesMap[userEmailLower] = 'ADMIN';
        await withFirestoreTimeout(
          setDoc(rolesRef, { userRoles: userRolesMap, updatedAt: syncStartTime }),
          currentStage
        );
      }

      const desiredName = (payload.config.familyName || '').trim().slice(0, 120);
      if (desiredName && existingVaultData && desiredName !== existingVaultData.familyName) {
        currentStage = 'Mise à jour du nom du coffre (family_meta/vault)';
        await withFirestoreTimeout(
          setDoc(
            vaultRef,
            {
              familyName: desiredName,
              updatedAt: syncStartTime
            },
            { merge: true }
          ),
          currentStage
        );
      }
    }

    // -------------------------------------------------------------
    // PHASE 2: PUSH OUTBOX (Local Device -> Firestore) in chunks of 400
    // -------------------------------------------------------------
    const pendingOutbox = [...payload.outbox];

    for (let i = 0; i < pendingOutbox.length; i += 400) {
      const chunk = pendingOutbox.slice(i, i + 400);
      const batch = writeBatch(db);
      let chunkOps = 0;

      for (const item of chunk) {
        if (item.entityType === 'TRANSACTION') {
          const rawId = item.entityId.replace('tx_', '');
          const txId = parseInt(rawId, 10);
          const docRef = doc(db, 'transactions', `tx_${txId}`);
          const tx = payload.transactions.find(t => t.id === txId);

          if (item.operation === 'DELETE') {
            if (tx) {
              batch.set(docRef, stripUndefined({ ...tx, isDeleted: true, updatedAt: item.createdAt }));
              chunkOps++;
            }
          } else if (tx) {
            batch.set(docRef, stripUndefined({ ...tx, updatedAt: item.createdAt }), { merge: true });
            chunkOps++;
          }
        } else if (item.entityType === 'ACCOUNT') {
          const accId = item.entityId;
          const docRef = doc(db, 'accounts', accId);
          const acc = payload.accounts.find(a => a.id === accId);
          if (item.operation === 'DELETE') {
            if (acc) {
              batch.set(docRef, stripUndefined({ ...acc, isDeleted: true, updatedAt: item.createdAt }));
              chunkOps++;
            }
          } else if (acc) {
            batch.set(docRef, stripUndefined({ ...acc, updatedAt: item.createdAt }), { merge: true });
            chunkOps++;
          }
        } else if (item.entityType === 'CATEGORY') {
          const rawId = item.entityId.replace('cat_', '');
          const catId = parseInt(rawId, 10);
          const docRef = doc(db, 'categories', `cat_${catId}`);
          const cat = payload.categories.find(c => c.id === catId);
          if (item.operation === 'DELETE') {
            if (cat) {
              batch.set(docRef, stripUndefined({ ...cat, isDeleted: true, updatedAt: item.createdAt }));
              chunkOps++;
            }
          } else if (cat) {
            batch.set(docRef, stripUndefined({ ...cat, updatedAt: item.createdAt }), { merge: true });
            chunkOps++;
          }
        } else if (item.entityType === 'BUDGET') {
          const rawId = item.entityId.replace('budget_', '');
          const bId = parseInt(rawId, 10);
          const docRef = doc(db, 'category_budgets', `budget_${bId}`);
          const b = payload.budgets.find(bg => bg.id === bId);
          if (item.operation === 'DELETE') {
            if (b) {
              batch.set(docRef, stripUndefined({ ...b, isDeleted: true, updatedAt: item.createdAt }));
              chunkOps++;
            }
          } else if (b) {
            batch.set(docRef, stripUndefined({ ...b, updatedAt: item.createdAt }), { merge: true });
            chunkOps++;
          }
        } else if (item.entityType === 'RULE') {
          const rawId = item.entityId.replace('rule_', '');
          const rId = parseInt(rawId, 10);
          const docRef = doc(db, 'rules', `rule_${rId}`);
          const r = payload.rules.find(rl => rl.id === rId);
          if (item.operation === 'DELETE') {
            if (r) {
              batch.set(docRef, stripUndefined({ ...r, isDeleted: true, updatedAt: item.createdAt }));
              chunkOps++;
            }
          } else if (r) {
            batch.set(docRef, stripUndefined({ ...r, updatedAt: item.createdAt }), { merge: true });
            chunkOps++;
          }
        } else if (item.entityType === 'MEMBER') {
          if (!isCallerAdmin) continue;
          const memberId = item.entityId;
          const docRef = doc(db, 'family_members', memberId);
          const m = payload.members.find(mb => mb.id === memberId);
          if (item.operation === 'DELETE') {
            if (m) {
              batch.set(docRef, stripUndefined({ ...m, isDeleted: true, updatedAt: item.createdAt }));
              chunkOps++;
            }
          } else if (m) {
            batch.set(docRef, stripUndefined({ ...m, updatedAt: item.createdAt }), { merge: true });
            chunkOps++;
          }
        } else if (item.entityType === 'SHARED_SETTLEMENT') {
          const settlementId = item.entityId;
          const docRef = doc(db, 'shared_settlements', settlementId);
          const st = (payload.sharedSettlements || []).find(s => s.id === settlementId);
          if (item.operation === 'DELETE') {
            if (st) {
              batch.set(docRef, stripUndefined({ ...st, isDeleted: true, updatedAt: item.createdAt }));
              chunkOps++;
            }
          } else if (st) {
            batch.set(docRef, stripUndefined({ ...st, updatedAt: item.createdAt }), { merge: true });
            chunkOps++;
          }
        }
      }

      if (chunkOps > 0) {
        currentStage = `Envoi des modifications locales (Outbox : ${chunk.map(c => c.entityType).slice(0, 3).join(', ')})`;
        await withFirestoreTimeout(batch.commit(), currentStage);
        pushedCount += chunkOps;
      }
    }

    // -------------------------------------------------------------
    // PHASE 4: DELTA PULL PIPELINE (Firestore -> Device)
    // Pull ALL synced collections cleanly using lastPull watermark
    // -------------------------------------------------------------
    const dirtyIds = new Set(payload.outbox.map(o => o.entityId));
    const lastPull = payload.syncState.lastPullTimestamp || 0;

    const incomingTxs: TransactionEntity[] = [];
    const incomingAccs: AccountEntity[] = [];
    const incomingCats: CategoryEntity[] = [];
    const incomingBgts: CategoryBudgetEntity[] = [];
    const incomingRules: CategorizationRuleEntity[] = [];
    const incomingMembers: FamilyMemberEntity[] = [];
    const incomingSharedSettlements: SharedSettlementEntity[] = [];

    // 4a. Pull Categories
    currentStage = 'Lecture de la collection Firestore (categories)';
    const catCol = collection(db, 'categories');
    const catQuery = lastPull > 0 ? query(catCol, where('updatedAt', '>', lastPull)) : query(catCol);
    const catSnap = await withFirestoreTimeout(getDocs(catQuery), currentStage);
    let catIdx = 1;
    catSnap.forEach(docSnap => {
      if (!dirtyIds.has(docSnap.id)) {
        const raw = docSnap.data();
        incomingCats.push({
          id: parseNumericId(docSnap.id, raw.id, catIdx++),
          name: raw.name || 'Catégorie',
          icon: raw.icon || 'Tag',
          color: typeof raw.color === 'number' ? raw.color : 0xff6366f1,
          updatedAt: toMillis(raw.updatedAt, syncStartTime),
          isDeleted: Boolean(raw.isDeleted)
        });
        pulledCount++;
      }
    });

    // 4b. Pull Category Budgets
    currentStage = 'Lecture de la collection Firestore (category_budgets)';
    const budgetCol = collection(db, 'category_budgets');
    const budgetQuery = lastPull > 0 ? query(budgetCol, where('updatedAt', '>', lastPull)) : query(budgetCol);
    const budgetSnap = await withFirestoreTimeout(getDocs(budgetQuery), currentStage);
    let bgtIdx = 1;
    budgetSnap.forEach(docSnap => {
      if (!dirtyIds.has(docSnap.id)) {
        const raw = docSnap.data();
        incomingBgts.push({
          id: parseNumericId(docSnap.id, raw.id, bgtIdx++),
          categoryId: Number(raw.categoryId) || 0,
          categoryName: raw.categoryName || '',
          amount: Number(raw.amount) || 0,
          frequency: raw.frequency || 'MONTHLY',
          year: raw.year,
          month: raw.month ?? null,
          day: raw.day ?? null,
          startYear: raw.startYear,
          startMonth: raw.startMonth ?? null,
          endYear: raw.endYear ?? null,
          endMonth: raw.endMonth ?? null,
          title: raw.title || raw.categoryName || 'Budget',
          notes: raw.notes ?? null,
          isExpense: raw.isExpense !== undefined ? Boolean(raw.isExpense) : true,
          isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
          updatedAt: toMillis(raw.updatedAt, syncStartTime),
          isDeleted: Boolean(raw.isDeleted)
        });
        pulledCount++;
      }
    });

    // 4c. Pull Rules
    currentStage = 'Lecture de la collection Firestore (rules)';
    const ruleCol = collection(db, 'rules');
    const ruleQuery = lastPull > 0 ? query(ruleCol, where('updatedAt', '>', lastPull)) : query(ruleCol);
    const ruleSnap = await withFirestoreTimeout(getDocs(ruleQuery), currentStage);
    let ruleIdx = 1;
    ruleSnap.forEach(docSnap => {
      if (!dirtyIds.has(docSnap.id)) {
        const raw = docSnap.data();
        incomingRules.push({
          id: parseNumericId(docSnap.id, raw.id, ruleIdx++),
          pattern: raw.pattern || '',
          matchType: raw.matchType || 'CONTAINS',
          targetCategoryId: Number(raw.targetCategoryId) || 0,
          targetCategoryName: raw.targetCategoryName || '',
          targetBudgetId: Number(raw.targetBudgetId) || 0,
          targetBudgetTitle: raw.targetBudgetTitle || '',
          priority: Number(raw.priority) || 10,
          isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
          updatedAt: toMillis(raw.updatedAt, syncStartTime),
          isDeleted: Boolean(raw.isDeleted)
        });
        pulledCount++;
      }
    });

    // 4d. Pull Accounts (with legacy account_balance fallback on initial sync)
    currentStage = 'Lecture de la collection Firestore (accounts)';
    const accCol = collection(db, 'accounts');
    const accQuery = lastPull > 0 ? query(accCol, where('updatedAt', '>', lastPull)) : query(accCol);
    const accSnap = await withFirestoreTimeout(getDocs(accQuery), currentStage);
    accSnap.forEach(docSnap => {
      if (!dirtyIds.has(docSnap.id)) {
        const raw = docSnap.data();
        incomingAccs.push({
          id: raw.id || docSnap.id,
          name: raw.name || 'Compte',
          type: raw.type || 'CHECKING',
          currentBalance: Number(raw.currentBalance) || 0,
          currency: raw.currency || '€',
          billingCycleClosingDay: raw.billingCycleClosingDay ?? null,
          settlementDay: raw.settlementDay ?? null,
          linkedCheckingAccountId: raw.linkedCheckingAccountId ?? null,
          includeInLiquidForecast: raw.includeInLiquidForecast !== undefined ? Boolean(raw.includeInLiquidForecast) : true,
          targetSavingsGoal: raw.targetSavingsGoal ?? null,
          monthlyClosingOverrides: raw.monthlyClosingOverrides ?? null,
          color: typeof raw.color === 'number' ? raw.color : 0xff0f766e,
          icon: raw.icon || 'Landmark',
          isDefault: Boolean(raw.isDefault),
          lastManualSyncTimestamp: toMillis(raw.lastManualSyncTimestamp, syncStartTime),
          openBankingAccountId: raw.openBankingAccountId ?? null,
          openBankingInstitution: raw.openBankingInstitution ?? null,
          openBankingIban: raw.openBankingIban ?? null,
          lastOpenBankingSync: raw.lastOpenBankingSync ?? null,
          updatedAt: toMillis(raw.updatedAt, syncStartTime),
          isDeleted: Boolean(raw.isDeleted)
        });
        pulledCount++;
      }
    });

    if (lastPull === 0 && incomingAccs.length === 0) {
      currentStage = 'Lecture de la collection héritée Firestore (account_balance)';
      const legacyBalSnap = await withFirestoreTimeout(
        getDocs(query(collection(db, 'account_balance'))),
        currentStage
      );
      legacyBalSnap.forEach(docSnap => {
        const raw = docSnap.data();
        if (!raw.isDeleted) {
          incomingAccs.push({
            id: raw.id || docSnap.id || 'primary_account',
            name: raw.accountName || 'Main Family Account',
            type: 'CHECKING',
            currentBalance: Number(raw.currentBalance) || 0,
            currency: '€',
            includeInLiquidForecast: true,
            isDefault: true,
            color: 0xff0f766e,
            icon: 'Landmark',
            lastManualSyncTimestamp: toMillis(raw.lastManualSyncTimestamp, syncStartTime),
            updatedAt: toMillis(raw.updatedAt, syncStartTime),
            isDeleted: false
          });
          pulledCount++;
        }
      });
    }

    // 4e. Pull Transactions
    currentStage = 'Lecture de la collection Firestore (transactions)';
    const txCol = collection(db, 'transactions');
    const txQuery = lastPull > 0 ? query(txCol, where('updatedAt', '>', lastPull)) : query(txCol);
    const txSnap = await withFirestoreTimeout(getDocs(txQuery), currentStage);
    let txIdx = 1;
    txSnap.forEach(docSnap => {
      if (!dirtyIds.has(docSnap.id)) {
        const raw = docSnap.data();
        const amount = Number(raw.amount) || 0;
        const isExpense = raw.isExpense !== undefined ? Boolean(raw.isExpense) : amount < 0;
        incomingTxs.push({
          id: parseNumericId(docSnap.id, raw.id, txIdx++),
          remoteId: docSnap.id,
          title: raw.title || raw.originalBankLabel || 'Transaction',
          originalBankLabel: raw.originalBankLabel ?? null,
          amount,
          isExpense,
          categoryId: Number(raw.categoryId) || 0,
          categoryName: raw.categoryName || '',
          categoryColor: typeof raw.categoryColor === 'number' ? raw.categoryColor : 0xff64748b,
          categoryIcon: raw.categoryIcon || 'HelpCircle',
          budgetId: Number(raw.budgetId) || 0,
          budgetTitle: raw.budgetTitle || '',
          date: toMillis(raw.date, syncStartTime),
          familyMemberId: raw.familyMemberId || 'primary',
          familyMemberName: raw.familyMemberName || currentUser.displayName || 'User',
          source: raw.source || 'MANUAL',
          status: raw.status || 'VERIFIED',
          reconciledWithId: raw.reconciledWithId ?? null,
          paymentMethod: raw.paymentMethod || 'CARD',
          notes: raw.notes || '',
          parentId:
            raw.parentId !== null && raw.parentId !== undefined && raw.parentId !== ''
              ? Number.isFinite(Number(raw.parentId)) && Number(raw.parentId) > 0
                ? Number(raw.parentId)
                : null
              : null,
          isSplitParent: Boolean(raw.isSplitParent),
          isSplit: Boolean(raw.isSplit),
          isExcluded: Boolean(raw.isExcluded),
          isExcludedFromTotals: Boolean(raw.isExcludedFromTotals),
          settlementCardName: raw.settlementCardName ?? null,
          billingCycleClosingDay: raw.billingCycleClosingDay ?? null,
          billingCycleEndDate: raw.billingCycleEndDate ?? null,
          billingCycleStartDate: raw.billingCycleStartDate ?? null,
          accountId: raw.accountId || 'primary_account',
          accountName: raw.accountName || 'Main Account',
          targetAccountId: raw.targetAccountId ?? null,
          targetAccountName: raw.targetAccountName ?? null,
          isInternalTransfer: Boolean(raw.isInternalTransfer),
          transferType: raw.transferType ?? null,
          creditCardPeriod: raw.creditCardPeriod ?? null,
          sharedSplit: raw.sharedSplit ?? null,
          updatedAt: toMillis(raw.updatedAt, syncStartTime),
          isDeleted: Boolean(raw.isDeleted)
        });
        pulledCount++;
      }
    });

    // 4f. Pull Family Members
    currentStage = 'Lecture de la collection Firestore (family_members)';
    const memberSnap = await withFirestoreTimeout(
      getDocs(query(collection(db, 'family_members'))),
      currentStage
    );
    memberSnap.forEach(docSnap => {
      const raw = docSnap.data();
      if (!raw.isDeleted) {
        incomingMembers.push({
          id: raw.id || docSnap.id,
          name: raw.name || raw.email || 'Member',
          email: raw.email || '',
          role: raw.role || 'MEMBER',
          avatarColor: typeof raw.avatarColor === 'number' ? raw.avatarColor : 0xff0f766e,
          firestoreSynced: true,
          customPermissions: raw.customPermissions ?? null,
          monthlyIncome: typeof raw.monthlyIncome === 'number' ? raw.monthlyIncome : null,
          updatedAt: toMillis(raw.updatedAt, syncStartTime),
          isDeleted: Boolean(raw.isDeleted)
        });
      }
    });

    if (incomingMembers.length === 0 && existingRolesData) {
      for (const [email, role] of Object.entries(existingRolesData)) {
        incomingMembers.push({
          id: email.replace(/[^a-z0-9]/gi, '_'),
          name: email.split('@')[0],
          email,
          role: (role as any) || 'MEMBER',
          avatarColor: role === 'ADMIN' ? 0xff0f766e : 0xff2563eb,
          firestoreSynced: true
        });
      }
    }

    // 4g. Pull Shared Settlements
    currentStage = 'Lecture de la collection Firestore (shared_settlements)';
    const settlementCol = collection(db, 'shared_settlements');
    const settlementQuery =
      lastPull > 0 ? query(settlementCol, where('updatedAt', '>', lastPull)) : query(settlementCol);
    const settlementSnap = await withFirestoreTimeout(getDocs(settlementQuery), currentStage);
    settlementSnap.forEach(docSnap => {
      if (!dirtyIds.has(docSnap.id)) {
        const raw = docSnap.data();
        incomingSharedSettlements.push({
          id: raw.id || docSnap.id,
          fromMemberId: raw.fromMemberId || '',
          fromMemberName: raw.fromMemberName || '',
          toMemberId: raw.toMemberId || '',
          toMemberName: raw.toMemberName || '',
          amount: Number(raw.amount) || 0,
          date: toMillis(raw.date, syncStartTime),
          notes: raw.notes || '',
          linkedTransactionId: raw.linkedTransactionId ?? null,
          updatedAt: toMillis(raw.updatedAt, syncStartTime),
          isDeleted: Boolean(raw.isDeleted)
        });
        pulledCount++;
      }
    });

    // -------------------------------------------------------------
    // PHASE 5: ADVANCE WATERMARK
    // -------------------------------------------------------------
    const updatedSyncState: SyncStateEntity = {
      syncKey: 'primary_sync',
      lastPullTimestamp: syncStartTime,
      lastPushTimestamp: syncStartTime,
      lastSyncStatus: 'SUCCESS',
      lastSyncMessage: `Firestore (${payload.config.projectId}) : ${pushedCount} envoyés, ${pulledCount} reçus.`,
      pendingOutboxCount: 0
    };

    return {
      success: true,
      pushedCount,
      pulledCount,
      message: `Synchronisation Firestore (${payload.config.projectId}) réussie : ${pushedCount} envoyés, ${pulledCount} reçus.`,
      updatedSyncState,
      incomingTransactions: incomingTxs,
      incomingAccounts: incomingAccs,
      incomingCategories: incomingCats,
      incomingBudgets: incomingBgts,
      incomingRules: incomingRules,
      incomingMembers: incomingMembers.length > 0 ? incomingMembers : undefined,
      incomingSharedSettlements: incomingSharedSettlements.length > 0 ? incomingSharedSettlements : undefined,
      incomingFamilyName,
      resolvedUserRole: serverRole
    };
  } catch (err: any) {
    console.error('Firestore sync error:', { stage: currentStage, err });
    const code = err?.code || 'unknown';
    const msg = err?.message || String(err);
    const isPermissionError =
      code === 'permission-denied' ||
      msg.toLowerCase().includes('permission') ||
      msg.includes('Missing or insufficient permissions');

    let helpfulMsg = `Échec Firestore [${code}] à l’étape « ${currentStage} » : ${msg}`;
    if (isPermissionError) {
      helpfulMsg =
        `Accès Firestore refusé [${code}] pour ${currentUser.email} sur le projet « ${payload.config.projectId} ».\n` +
        `Étape : ${currentStage}\n` +
        `Vérifications : (1) Publiez la dernière version de firestore.rules dans Firebase Console → Firestore → Rules, (2) vérifiez que votre e-mail « ${currentUser.email} » figure bien dans security_config/roles (userRoles), et (3) vérifiez que le document family_meta/vault existe si ce coffre existait déjà.`;
    } else if (code === 'not-found') {
      helpfulMsg =
        `Base Cloud Firestore introuvable [not-found] pour le projet « ${payload.config.projectId} ».\n` +
        `Étape : ${currentStage}\n` +
        `Créez la base Firestore dans Firebase Console → Build → Firestore Database (${msg}).`;
    } else if (code === 'unauthenticated') {
      helpfulMsg =
        `Session Google expirée ou invalide [unauthenticated] à l’étape « ${currentStage} ».\n` +
        `Reconnectez-vous avec Google (${msg}).`;
    } else if (code === 'deadline-exceeded') {
      helpfulMsg =
        `Délai d’attente Firestore dépassé [deadline-exceeded] pour le projet « ${payload.config.projectId} ».\n` +
        `Étape : ${currentStage}\n` +
        `Vérifications : (1) Le Project ID « ${payload.config.projectId} » est-il exact ? (2) Cloud Firestore est-il bien créé/activé dans Firebase Console → Build → Firestore Database ? (3) Un bloqueur réseau ou VPN bloque-t-il firestore.googleapis.com ?`;
    } else if (code === 'unavailable' || msg.toLowerCase().includes('offline')) {
      helpfulMsg =
        `Firestore injoignable [${code}] à l’étape « ${currentStage} ».\n` +
        `Vérifiez votre connexion internet, le Project ID « ${payload.config.projectId} », ou que Firestore Database est bien activé (${msg}).`;
    } else if (code === 'failed-precondition') {
      helpfulMsg =
        `Précondition Firestore non satisfaite [failed-precondition] à l’étape « ${currentStage} » : ${msg}`;
    }

    return {
      success: false,
      pushedCount,
      pulledCount,
      message: helpfulMsg,
      updatedSyncState: {
        ...payload.syncState,
        lastSyncStatus: 'ERROR',
        lastSyncMessage: helpfulMsg
      }
    };
  }
}
