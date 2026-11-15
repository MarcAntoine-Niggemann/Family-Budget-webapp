import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
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
  SyncOutboxEntity,
  SyncStateEntity,
  TransactionEntity
} from '../types';

let firebaseAppInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let activeConfigSignature = '';

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

    firestoreInstance = getFirestore(firebaseAppInstance);
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
  incomingFamilyName?: string;
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

/**
 * Executes the Transactional Outbox Push + Delta Pull sync pipeline
 * specified in docs/SYNC_ALGORITHM.md against real BYOB Cloud Firestore.
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

  // Enforce real Firebase Auth check for BYOB Firestore
  const auth = getAuth(app);
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) {
    const authErrMsg = 'Authentification Google OAuth requise pour synchroniser avec votre Firestore BYOB.';
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

  try {
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

          if (item.operation === 'DELETE') {
            batch.set(docRef, { isDeleted: true, updatedAt: item.createdAt }, { merge: true });
            chunkOps++;
          } else {
            const tx = payload.transactions.find(t => t.id === txId);
            if (tx) {
              batch.set(docRef, stripUndefined({ ...tx, updatedAt: item.createdAt }), { merge: true });
              chunkOps++;
            }
          }
        } else if (item.entityType === 'ACCOUNT') {
          const accId = item.entityId;
          const docRef = doc(db, 'accounts', accId);
          if (item.operation === 'DELETE') {
            batch.set(docRef, { isDeleted: true, updatedAt: item.createdAt }, { merge: true });
            chunkOps++;
          } else {
            const acc = payload.accounts.find(a => a.id === accId);
            if (acc) {
              batch.set(docRef, stripUndefined({ ...acc, updatedAt: item.createdAt }), { merge: true });
              chunkOps++;
            }
          }
        } else if (item.entityType === 'CATEGORY') {
          const rawId = item.entityId.replace('cat_', '');
          const catId = parseInt(rawId, 10);
          const docRef = doc(db, 'categories', `cat_${catId}`);
          if (item.operation === 'DELETE') {
            batch.set(docRef, { isDeleted: true, updatedAt: item.createdAt }, { merge: true });
            chunkOps++;
          } else {
            const cat = payload.categories.find(c => c.id === catId);
            if (cat) {
              batch.set(docRef, stripUndefined({ ...cat, updatedAt: item.createdAt }), { merge: true });
              chunkOps++;
            }
          }
        } else if (item.entityType === 'BUDGET') {
          const rawId = item.entityId.replace('budget_', '');
          const bId = parseInt(rawId, 10);
          const docRef = doc(db, 'category_budgets', `budget_${bId}`);
          if (item.operation === 'DELETE') {
            batch.set(docRef, { isDeleted: true, updatedAt: item.createdAt }, { merge: true });
            chunkOps++;
          } else {
            const b = payload.budgets.find(bg => bg.id === bId);
            if (b) {
              batch.set(docRef, stripUndefined({ ...b, updatedAt: item.createdAt }), { merge: true });
              chunkOps++;
            }
          }
        } else if (item.entityType === 'RULE') {
          const rawId = item.entityId.replace('rule_', '');
          const rId = parseInt(rawId, 10);
          const docRef = doc(db, 'rules', `rule_${rId}`);
          if (item.operation === 'DELETE') {
            batch.set(docRef, { isDeleted: true, updatedAt: item.createdAt }, { merge: true });
            chunkOps++;
          } else {
            const r = payload.rules.find(rl => rl.id === rId);
            if (r) {
              batch.set(docRef, stripUndefined({ ...r, updatedAt: item.createdAt }), { merge: true });
              chunkOps++;
            }
          }
        } else if (item.entityType === 'MEMBER') {
          const memberId = item.entityId;
          const docRef = doc(db, 'family_members', memberId);
          if (item.operation === 'DELETE') {
            batch.set(docRef, { isDeleted: true, updatedAt: item.createdAt }, { merge: true });
            chunkOps++;
          } else {
            const m = payload.members.find(mb => mb.id === memberId);
            if (m) {
              batch.set(docRef, stripUndefined({ ...m, updatedAt: item.createdAt }), { merge: true });
              chunkOps++;
            }
          }
        }
      }

      if (chunkOps > 0) {
        await batch.commit();
        pushedCount += chunkOps;
      }
    }

    // -------------------------------------------------------------
    // PHASE 3: METADATA & RBAC ROLES SYNC (Read first, bootstrap only if empty)
    // -------------------------------------------------------------
    let incomingFamilyName: string | undefined;
    const rolesSnap = await getDoc(doc(db, 'security_config', 'roles'));
    const vaultSnap = await getDoc(doc(db, 'family_meta', 'vault'));

    const existingRolesData = rolesSnap.exists() ? (rolesSnap.data()?.userRoles as Record<string, string> | undefined) : undefined;
    const existingVaultData = vaultSnap.exists() ? vaultSnap.data() : undefined;

    if (existingVaultData?.familyName) {
      incomingFamilyName = String(existingVaultData.familyName);
    }

    const userEmailLower = currentUser.email.toLowerCase();
    const isRolesEmpty = !existingRolesData || Object.keys(existingRolesData).length === 0;
    const isCallerAdmin =
      isRolesEmpty ||
      !existingVaultData ||
      existingRolesData?.[userEmailLower] === 'ADMIN' ||
      String(existingVaultData?.adminEmail || '').toLowerCase() === userEmailLower;

    // Bootstrap security_config/roles and family_meta/vault only if uninitialized OR caller is Admin updating members
    if (isRolesEmpty || !existingVaultData) {
      const userRolesMap: Record<string, string> = {
        ...(existingRolesData || {}),
        [userEmailLower]: 'ADMIN'
      };
      for (const m of payload.members) {
        if (m.email) {
          userRolesMap[m.email.toLowerCase()] = m.role;
        }
      }

      await setDoc(
        doc(db, 'security_config', 'roles'),
        { userRoles: userRolesMap, updatedAt: syncStartTime },
        { merge: true }
      );

      if (!existingVaultData) {
        await setDoc(
          doc(db, 'family_meta', 'vault'),
          {
            familyName: payload.config.familyName || 'Family Budget Vault',
            adminEmail: currentUser.email,
            updatedAt: syncStartTime
          },
          { merge: true }
        );
      }
    } else if (isCallerAdmin && payload.outbox.some(o => o.entityType === 'MEMBER')) {
      const userRolesMap: Record<string, string> = {};
      for (const m of payload.members) {
        if (m.email) {
          userRolesMap[m.email.toLowerCase()] = m.role;
        }
      }
      userRolesMap[userEmailLower] = 'ADMIN';
      await setDoc(
        doc(db, 'security_config', 'roles'),
        { userRoles: userRolesMap, updatedAt: syncStartTime },
        { merge: true }
      );
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

    // 4a. Pull Categories
    const catCol = collection(db, 'categories');
    const catQuery = lastPull > 0 ? query(catCol, where('updatedAt', '>', lastPull)) : query(catCol);
    const catSnap = await getDocs(catQuery);
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
    const budgetCol = collection(db, 'category_budgets');
    const budgetQuery = lastPull > 0 ? query(budgetCol, where('updatedAt', '>', lastPull)) : query(budgetCol);
    const budgetSnap = await getDocs(budgetQuery);
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
    const ruleCol = collection(db, 'rules');
    const ruleQuery = lastPull > 0 ? query(ruleCol, where('updatedAt', '>', lastPull)) : query(ruleCol);
    const ruleSnap = await getDocs(ruleQuery);
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
    const accCol = collection(db, 'accounts');
    const accQuery = lastPull > 0 ? query(accCol, where('updatedAt', '>', lastPull)) : query(accCol);
    const accSnap = await getDocs(accQuery);
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
      const legacyBalSnap = await getDocs(query(collection(db, 'account_balance')));
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
    const txCol = collection(db, 'transactions');
    const txQuery = lastPull > 0 ? query(txCol, where('updatedAt', '>', lastPull)) : query(txCol);
    const txSnap = await getDocs(txQuery);
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
          parentId: raw.parentId ?? null,
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
          updatedAt: toMillis(raw.updatedAt, syncStartTime),
          isDeleted: Boolean(raw.isDeleted)
        });
        pulledCount++;
      }
    });

    // 4f. Pull Family Members
    const memberSnap = await getDocs(query(collection(db, 'family_members')));
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
          customPermissions: raw.customPermissions ?? null
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
      incomingFamilyName
    };
  } catch (err: any) {
    console.error('Firestore sync error:', err);
    const code = err?.code || '';
    const msg = err?.message || String(err);
    const isPermissionError = code === 'permission-denied' || msg.includes('permission') || msg.includes('Missing or insufficient permissions');

    let helpfulMsg = `Erreur Firestore (${code || 'sync'}) : ${msg}`;
    if (isPermissionError) {
      helpfulMsg = `Accès Firestore refusé (permission-denied) pour ${currentUser.email}. Vérifiez que vous avez publié firestore.rules dans votre projet Firebase (${payload.config.projectId}) et que votre email est autorisé dans security_config/roles.`;
    } else if (code === 'unavailable' || msg.includes('offline')) {
      helpfulMsg = `Firestore injoignable : vérifiez votre connexion ou que la base Firestore Database existe bien dans le projet ${payload.config.projectId}.`;
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
