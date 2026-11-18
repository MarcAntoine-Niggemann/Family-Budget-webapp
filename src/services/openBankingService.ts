import {
  OpenBankingConfig,
  OpenBankingAccountDto,
  OpenBankingTransactionDto,
  AccountEntity,
  TransactionEntity,
  CategorizationRuleEntity,
  CategoryEntity,
  CategoryBudgetEntity
} from '../types';
import { computeDefaultCardPeriod } from '../utils/creditCardPeriod';
import { isSafeRegexPattern } from '../utils/csvParser';

export const DEFAULT_OPEN_BANKING_IO_URL = 'https://api.open-banking.io';

export const DEFAULT_OPEN_BANKING_CONFIG: OpenBankingConfig = {
  apiKey: '',
  apiSecret: '',
  proxyUrl: '',
  environment: 'PRODUCTION',
  autoSyncOnLaunch: false,
  isConnected: false,
  lastSyncTimestamp: null,
  status: 'DISCONNECTED',
  statusMessage: 'Aucune connexion active. Utilisez l’import CSV gratuit ou connectez open-banking.io.',
  discoveredAccounts: [],
  accountMappings: {}
};

export function validateOpenBankingProxyUrl(proxyUrl?: string): {
  valid: boolean;
  normalized: string;
  isCustomProxy: boolean;
  error?: string;
} {
  const raw = (proxyUrl || '').trim().replace(/\/+$/, '');
  if (!raw) {
    return {
      valid: true,
      normalized: DEFAULT_OPEN_BANKING_IO_URL,
      isCustomProxy: false
    };
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        normalized: DEFAULT_OPEN_BANKING_IO_URL,
        isCustomProxy: true,
        error: 'L’URL personnalisée Open Banking doit utiliser le protocole HTTPS.'
      };
    }
    return {
      valid: true,
      normalized: parsed.origin + parsed.pathname.replace(/\/+$/, ''),
      isCustomProxy: true
    };
  } catch {
    return {
      valid: false,
      normalized: DEFAULT_OPEN_BANKING_IO_URL,
      isCustomProxy: true,
      error: 'URL personnalisée Open Banking invalide.'
    };
  }
}

function buildOpenBankingHeaders(config: OpenBankingConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${config.apiKey.trim()}`,
    'Accept': 'application/json'
  };
  if (config.apiSecret && config.apiSecret.trim()) {
    headers['X-API-Secret'] = config.apiSecret.trim();
  }
  return headers;
}

/**
 * Mock sandbox accounts matching European PSD2 / open-banking.io schema.
 */
export const MOCK_SANDBOX_ACCOUNTS: OpenBankingAccountDto[] = [
  {
    id: 'ob_bnp_checking',
    name: 'BNP Paribas — Compte Courant Individuel',
    institution: 'BNP Paribas',
    iban: 'FR76 3000 4012 3456 7890 1234 567',
    currency: 'EUR',
    balance: 3420.50,
    type: 'CHECKING'
  },
  {
    id: 'ob_bnp_deferred_card',
    name: 'BNP Paribas — Visa Premier (Débit Différé)',
    institution: 'BNP Paribas',
    iban: 'FR76 3000 4012 3456 7890 9876 543',
    currency: 'EUR',
    balance: -540.20,
    type: 'DEFERRED_CARD'
  },
  {
    id: 'ob_bourso_livret_a',
    name: 'BoursoBank — Livret A Réglementé',
    institution: 'BoursoBank',
    iban: 'FR76 4061 8802 0000 1234 5678 901',
    currency: 'EUR',
    balance: 14500.00,
    type: 'SAVINGS'
  }
];

/**
 * Generates fresh sandbox bank transactions relative to current date.
 */
export function getMockSandboxTransactions(): OpenBankingTransactionDto[] {
  const now = new Date();
  const formatOffset = (daysAgo: number) => {
    const d = new Date(now.getTime() - daysAgo * 86_400_000);
    return d.toISOString().split('T')[0];
  };

  return [
    {
      id: 'ob_tx_' + formatOffset(0) + '_1',
      accountId: 'ob_bnp_checking',
      date: formatOffset(0),
      description: 'CARREFOUR EXPRESS PARIS 15',
      originalLabel: 'CARREFOUR EXP 75015 CB*4974',
      amount: -42.80,
      currency: 'EUR'
    },
    {
      id: 'ob_tx_' + formatOffset(1) + '_2',
      accountId: 'ob_bnp_checking',
      date: formatOffset(1),
      description: 'TOTAL ENERGIES BORNE RECHARGE EV',
      originalLabel: 'TOTAL BORNE AUTOSTRADA CB*4974',
      amount: -28.50,
      currency: 'EUR'
    },
    {
      id: 'ob_tx_' + formatOffset(2) + '_3',
      accountId: 'ob_bnp_deferred_card',
      date: formatOffset(2),
      description: 'NETFLIX ABONNEMENT MENSUEL',
      originalLabel: 'PRLV NETFLIX COM AMSTERDAM',
      amount: -19.99,
      currency: 'EUR'
    },
    {
      id: 'ob_tx_' + formatOffset(3) + '_4',
      accountId: 'ob_bnp_deferred_card',
      date: formatOffset(3),
      description: 'PHARMACIE CENTRALE SOINS',
      originalLabel: 'PHARMACIE GARE CB*4974',
      amount: -24.60,
      currency: 'EUR'
    },
    {
      id: 'ob_tx_' + formatOffset(4) + '_5',
      accountId: 'ob_bnp_checking',
      date: formatOffset(4),
      description: 'VIREMENT RECU REMBOURSEMENT SANTE',
      originalLabel: 'VIR CPAM ASSURANCE MALADIE',
      amount: 65.40,
      currency: 'EUR'
    }
  ];
}

/**
 * Tests connection with Open Banking (via Sandbox simulator, direct api.open-banking.io, or optional HTTPS proxy).
 */
export async function testOpenBankingConnection(
  config: OpenBankingConfig
): Promise<{ success: boolean; message: string; accounts: OpenBankingAccountDto[] }> {
  // Only return simulated accounts when explicitly using SANDBOX environment
  if (config.environment === 'SANDBOX') {
    await new Promise(r => setTimeout(r, 600)); // Simulate brief network roundtrip
    return {
      success: true,
      message: 'Connexion Sandbox open-banking.io réussie ! 3 comptes simulés découverts.',
      accounts: MOCK_SANDBOX_ACCOUNTS
    };
  }

  const endpointCheck = validateOpenBankingProxyUrl(config.proxyUrl);
  if (!endpointCheck.valid) {
    return {
      success: false,
      message: endpointCheck.error || 'URL Open Banking HTTPS invalide.',
      accounts: []
    };
  }

  if (!config.apiKey || !config.apiKey.trim()) {
    return {
      success: false,
      message: 'Veuillez saisir votre API Key pour vous connecter en environnement Live Production.',
      accounts: []
    };
  }

  if (!endpointCheck.isCustomProxy && (!config.apiSecret || !config.apiSecret.trim())) {
    return {
      success: false,
      message: 'Veuillez saisir votre API Key et API Secret pour la connexion directe open-banking.io.',
      accounts: []
    };
  }

  try {
    const res = await fetch(`${endpointCheck.normalized}/v1/accounts`, {
      method: 'GET',
      headers: buildOpenBankingHeaders(config)
    });

    if (!res.ok) {
      throw new Error(`Erreur API (${res.status}): ${res.statusText}`);
    }

    const data = await res.json();
    const rawAccounts = Array.isArray(data) ? data : (data.accounts || data.data || []);
    const fetchedAccounts: OpenBankingAccountDto[] = rawAccounts.map((acc: any) => ({
      id: acc.id || acc.account_id,
      name: acc.name || acc.displayName || 'Compte Bancaire',
      institution: acc.institution || acc.bank_name || 'Banque PSD2',
      iban: acc.iban || acc.masked_pan || '',
      currency: acc.currency || 'EUR',
      balance: parseFloat(acc.balance?.amount ?? acc.current_balance ?? acc.balance ?? 0),
      type: acc.type === 'card' || acc.type === 'DEFERRED_CARD'
        ? 'DEFERRED_CARD'
        : acc.type === 'savings' || acc.type === 'SAVINGS'
          ? 'SAVINGS'
          : 'CHECKING'
    }));

    return {
      success: true,
      message: `Connexion Live réussie ! ${fetchedAccounts.length} compte(s) découvert(s).`,
      accounts: fetchedAccounts
    };
  } catch (err: any) {
    // Do not fall back to fake accounts when live connection fails
    return {
      success: false,
      message: `Échec de connexion : ${err.message || 'Impossible de joindre api.open-banking.io'}.`,
      accounts: []
    };
  }
}

/**
 * Synchronizes accounts and transactions from Open Banking with deduplication & auto-categorization.
 */
export async function executeOpenBankingSync(
  config: OpenBankingConfig,
  currentAccounts: AccountEntity[],
  currentTransactions: TransactionEntity[],
  rules: CategorizationRuleEntity[],
  categories: CategoryEntity[],
  budgets: CategoryBudgetEntity[]
): Promise<{
  newTransactions: TransactionEntity[];
  updatedAccounts: AccountEntity[];
  remoteAccounts: OpenBankingAccountDto[];
  importedCount: number;
  duplicateSkippedCount: number;
  reconciledCount: number;
  summaryMessage: string;
}> {
  if (!config.isConnected) {
    throw new Error('Open Banking service is not connected. Please configure your credentials first.');
  }

  // 1. Fetch remote accounts & transactions strictly from the configured environment
  let remoteAccounts: OpenBankingAccountDto[] = [];
  let remoteTransactions: OpenBankingTransactionDto[] = [];

  if (config.environment === 'SANDBOX') {
    remoteAccounts = MOCK_SANDBOX_ACCOUNTS;
    remoteTransactions = getMockSandboxTransactions();
  } else {
    const endpointCheck = validateOpenBankingProxyUrl(config.proxyUrl);
    if (!endpointCheck.valid) {
      throw new Error(endpointCheck.error || 'Invalid Open Banking HTTPS endpoint.');
    }

    const conn = await testOpenBankingConnection(config);
    if (!conn.success) {
      throw new Error(conn.message);
    }
    remoteAccounts = conn.accounts;

    const txRes = await fetch(`${endpointCheck.normalized}/v1/transactions`, {
      method: 'GET',
      headers: buildOpenBankingHeaders(config)
    });

    if (!txRes.ok) {
      throw new Error(`Erreur API Transactions (${txRes.status}): ${txRes.statusText}`);
    }

    const txData = await txRes.json();
    const rawTxs = Array.isArray(txData) ? txData : (txData.transactions || txData.data || []);
    remoteTransactions = rawTxs.map((tx: any) => ({
      id: String(tx.id || tx.transaction_id),
      accountId: String(tx.accountId || tx.account_id),
      date: tx.date || tx.bookingDate || tx.booking_date || new Date().toISOString().split('T')[0],
      bookingDate: tx.bookingDate || tx.booking_date,
      description: tx.description || tx.remittance_information || tx.label || 'Opération bancaire',
      originalLabel: tx.originalLabel || tx.original_label || tx.description || '',
      amount: parseFloat(tx.amount?.amount ?? tx.amount ?? 0),
      currency: tx.currency || tx.amount?.currency || 'EUR'
    }));
  }

  // Existing remoteIds index for O(1) deduplication
  const existingRemoteIds = new Set(
    currentTransactions.filter(t => t.remoteId).map(t => t.remoteId as string)
  );

  let importedCount = 0;
  let duplicateSkippedCount = 0;
  let reconciledCount = 0;

  const newTxList: TransactionEntity[] = [];
  const updatedTxMap = new Map<number, TransactionEntity>();
  currentTransactions.forEach(t => updatedTxMap.set(t.id, t));

  // 2. Process remote transactions
  for (const rtx of remoteTransactions) {
    // Check direct remoteId deduplication
    if (existingRemoteIds.has(rtx.id)) {
      duplicateSkippedCount++;
      continue;
    }

    // Determine target local account; skip ignored/unmapped accounts
    const targetLocalAccId = config.accountMappings[rtx.accountId];
    if (!targetLocalAccId) {
      continue;
    }
    const targetAcc = currentAccounts.find(a => a.id === targetLocalAccId);
    if (!targetAcc) {
      continue;
    }
    const rtxDateMs = new Date(rtx.date).getTime();

    // Check fuzzy duplicate against manual transactions (same account, ±3 days, exact amount)
    const matchedManual = currentTransactions.find(t => {
      if (t.remoteId) return false; // Already matched
      if (t.paymentMethod !== targetLocalAccId && t.source !== 'MANUAL') return false;
      const daysDiff = Math.abs(t.date - rtxDateMs) / 86_400_000;
      const amountDiff = Math.abs(Math.abs(t.amount) - Math.abs(rtx.amount));
      return daysDiff <= 3 && amountDiff < 0.05;
    });

    if (matchedManual) {
      // Reconcile and link remoteId instead of creating duplicate
      const reconciledTx: TransactionEntity = {
        ...matchedManual,
        remoteId: rtx.id,
        status: 'RECONCILED',
        originalBankLabel: rtx.originalLabel || rtx.description,
        updatedAt: Date.now()
      };
      updatedTxMap.set(matchedManual.id, reconciledTx);
      reconciledCount++;
      existingRemoteIds.add(rtx.id);
      continue;
    }

    // Apply Priority Categorization Rule
    const cleanLabel = (rtx.description || '').toUpperCase();
    let assignedCategory: CategoryEntity | null = null;
    let assignedBudget: CategoryBudgetEntity | null = null;

    for (const rule of rules.filter(r => !r.isDeleted && r.isActive).sort((a, b) => b.priority - a.priority)) {
      const pat = (rule.pattern || '').toUpperCase();
      let matched = false;
      if (rule.matchType === 'CONTAINS' && cleanLabel.includes(pat)) matched = true;
      else if (rule.matchType === 'STARTS_WITH' && cleanLabel.startsWith(pat)) matched = true;
      else if (rule.matchType === 'EXACT' && cleanLabel === pat) matched = true;
      else if (rule.matchType === 'REGEX') {
        if (isSafeRegexPattern(rule.pattern).valid) {
          try {
            if (new RegExp(rule.pattern, 'i').test(cleanLabel)) matched = true;
          } catch {
            // Ignore invalid regex
          }
        }
      }

      if (matched) {
        assignedCategory = categories.find(c => !c.isDeleted && c.id === rule.targetCategoryId) || null;
        assignedBudget = budgets.find(b => !b.isDeleted && b.id === rule.targetBudgetId) || null;
        break;
      }
    }

    const isExpense = rtx.amount < 0;
    const newTx: TransactionEntity = {
      id: Date.now() + Math.floor(Math.random() * 100000),
      remoteId: rtx.id,
      title: rtx.description,
      originalBankLabel: rtx.originalLabel || rtx.description,
      amount: rtx.amount,
      isExpense,
      categoryId: assignedCategory?.id || 0,
      categoryName: assignedCategory?.name || '',
      categoryColor: assignedCategory?.color || 0xff64748b,
      categoryIcon: assignedCategory?.icon || 'HelpCircle',
      budgetId: assignedBudget?.id || 0,
      budgetTitle: assignedBudget?.title || '',
      date: rtxDateMs,
      familyMemberId: 'jean_martin',
      familyMemberName: 'Jean Martin',
      source: 'OPEN_BANKING',
      status: 'VERIFIED',
      paymentMethod: targetLocalAccId,
      accountId: targetAcc?.id || targetLocalAccId,
      accountName: targetAcc?.name || 'Banque',
      notes: `Synchronisé via open-banking.io (${targetAcc?.name || 'Banque'})`,
      settlementCardName: targetAcc?.type === 'DEFERRED_CARD' ? targetAcc.name : null,
      billingCycleClosingDay: targetAcc?.billingCycleClosingDay ?? null,
      creditCardPeriod:
        targetAcc?.type === 'DEFERRED_CARD'
          ? computeDefaultCardPeriod(rtxDateMs, targetAcc.billingCycleClosingDay)
          : null,
      updatedAt: Date.now(),
      isDeleted: false
    };

    newTxList.push(newTx);
    existingRemoteIds.add(rtx.id);
    importedCount++;
  }

  // 3. Update account balances from remote accounts
  const updatedAccounts = currentAccounts.map(acc => {
    // Find remote account mapped to this local account
    const remoteId = Object.keys(config.accountMappings).find(
      rid => config.accountMappings[rid] === acc.id
    );
    if (!remoteId) return acc;

    const rAcc = remoteAccounts.find(r => r.id === remoteId);
    if (!rAcc) return acc;

    return {
      ...acc,
      currentBalance: rAcc.balance,
      openBankingAccountId: rAcc.id,
      openBankingInstitution: rAcc.institution,
      openBankingIban: rAcc.iban,
      lastOpenBankingSync: Date.now(),
      updatedAt: Date.now()
    };
  });

  const allUpdatedTransactions = Array.from(updatedTxMap.values()).concat(newTxList);

  const summaryMessage = importedCount > 0 || reconciledCount > 0
    ? `Synchronisation réussie : ${importedCount} nouvelle(s) opération(s), ${reconciledCount} rapprochée(s), ${duplicateSkippedCount} doublon(s) ignoré(s).`
    : `Comptes à jour : aucun nouveau mouvement bancaire (${duplicateSkippedCount} déjà importé(s)).`;

  return {
    newTransactions: allUpdatedTransactions,
    updatedAccounts,
    remoteAccounts,
    importedCount,
    duplicateSkippedCount,
    reconciledCount,
    summaryMessage
  };
}
