export type AccountType = 'CHECKING' | 'DEFERRED_CARD' | 'SAVINGS' | 'CASH' | 'INVESTMENT' | 'OTHER';

export interface AccountEntity {
  id: string;
  name: string;
  type: AccountType;
  currentBalance: number;
  currency: string;
  billingCycleClosingDay?: number | null;
  settlementDay?: number | null;
  linkedCheckingAccountId?: string | null;
  includeInLiquidForecast: boolean;
  targetSavingsGoal?: number | null;
  monthlyClosingOverrides?: string | null;
  color: number;
  icon: string;
  isDefault?: boolean;
  lastManualSyncTimestamp: number;
  openBankingAccountId?: string | null;
  openBankingInstitution?: string | null;
  openBankingIban?: string | null;
  lastOpenBankingSync?: number | null;
  updatedAt: number;
  isDeleted: boolean;
}

export type TransactionSource = 'MANUAL' | 'BANK_IMPORT' | 'OPEN_BANKING';
export type TransactionStatus = 'PENDING' | 'RECONCILED' | 'VERIFIED';
export type TransferType = 'TO_SAVINGS' | 'FROM_SAVINGS' | 'CARD_SETTLEMENT' | 'GENERAL_TRANSFER';

export interface TransactionEntity {
  id: number;
  remoteId?: string | null;
  title: string;
  originalBankLabel?: string | null;
  amount: number; // Stored as negative for expenses, positive for income
  isExpense: boolean;
  categoryId: number;
  categoryName: string;
  categoryColor: number;
  categoryIcon: string;
  budgetId: number;
  budgetTitle: string;
  date: number; // Milliseconds timestamp
  familyMemberId: string;
  familyMemberName: string;
  source: TransactionSource;
  status: TransactionStatus;
  reconciledWithId?: number | null;
  paymentMethod: string;
  notes: string;
  parentId?: number | null;
  isSplitParent?: boolean;
  isSplit?: boolean;
  isExcluded?: boolean;
  isExcludedFromTotals?: boolean;
  settlementCardName?: string | null;
  billingCycleClosingDay?: number | null;
  billingCycleEndDate?: number | null;
  billingCycleStartDate?: number | null;
  accountId: string;
  accountName: string;
  targetAccountId?: string | null;
  targetAccountName?: string | null;
  isInternalTransfer?: boolean;
  transferType?: TransferType | null;
  creditCardPeriod?: string | null; // e.g. "2026-10"
  updatedAt: number;
  isDeleted: boolean;
}

export interface CategoryEntity {
  id: number;
  name: string;
  icon: string;
  color: number; // ARGB hex integer
  updatedAt: number;
  isDeleted: boolean;
}

export type BudgetFrequency = 'MONTHLY' | 'YEARLY' | 'ONCE';

export interface CategoryBudgetEntity {
  id: number;
  categoryId: number;
  categoryName: string;
  amount: number;
  frequency: BudgetFrequency;
  year?: number;
  month?: number | null; // 1..12
  day?: number | null; // 1..31 execution day for scheduled debits
  startYear?: number;
  startMonth?: number | null;
  endYear?: number | null;
  endMonth?: number | null;
  title: string;
  notes?: string | null;
  isExpense: boolean;
  isActive: boolean;
  updatedAt: number;
  isDeleted: boolean;
}

export type RuleMatchType = 'CONTAINS' | 'STARTS_WITH' | 'EXACT' | 'REGEX';

export interface CategorizationRuleEntity {
  id: number;
  pattern: string;
  matchType: RuleMatchType;
  targetCategoryId: number;
  targetCategoryName: string;
  targetBudgetId: number;
  targetBudgetTitle: string;
  priority: number;
  isActive: boolean;
  updatedAt: number;
  isDeleted: boolean;
}

export type MemberRole = 'ADMIN' | 'EDITOR' | 'MEMBER' | 'VIEWER' | 'CHILD';

export interface FamilyMemberEntity {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  avatarColor: number;
  firestoreSynced: boolean;
  customPermissions?: string | null;
}

export interface FirebaseConfigEntity {
  id: string;
  apiKey: string;
  applicationId: string;
  projectId: string;
  projectNumber: string;
  webClientId: string;
  familyName: string;
  firebaseInstanceUrl?: string;
  authToken?: string;
  currentUserEmail: string;
  currentUserName: string;
  currentUserRole: MemberRole;
  isGoogleAuthenticated: boolean;
  isFamilyCreated: boolean;
  isConfigured: boolean;
  isEnabled: boolean;
  storageSecurityRulesConfigured?: boolean;
  isBiometricLockEnabled: boolean;
  isAnonymous: boolean;
  lastSyncTimestamp: number;
  syncStatusMessage: string;
  lastTestStatus?: string;
  lastTestSuccess?: boolean;
}

export interface SyncStateEntity {
  syncKey: string;
  lastPullTimestamp: number;
  lastPushTimestamp: number;
  lastSyncStatus: 'IDLE' | 'SYNCING' | 'SUCCESS' | 'ERROR';
  lastSyncMessage?: string | null;
  pendingOutboxCount: number;
}

export interface SyncOutboxEntity {
  outboxId: number;
  entityType: string;
  entityId: string;
  operation: 'UPSERT' | 'DELETE';
  payloadJson: string;
  createdAt: number;
}

export interface ReconciliationCandidate {
  manualTx: TransactionEntity;
  bankTx: TransactionEntity;
  confidenceScore: number;
  reasons: string[];
}

export type AppScreen =
  | 'DASHBOARD'
  | 'TRANSACTIONS'
  | 'BUDGET_PLANNER'
  | 'ADD_EXPENSE'
  | 'CSV_IMPORT'
  | 'RECONCILIATION'
  | 'REPORTS'
  | 'RULES'
  | 'FIRESTORE_CONFIG'
  | 'CUSTOM_FORECAST'
  | 'LOGIN';

export interface OpenBankingConfig {
  apiKey: string;
  apiSecret: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  autoSyncOnLaunch: boolean;
  isConnected: boolean;
  lastSyncTimestamp: number | null;
  status: 'DISCONNECTED' | 'CONNECTED' | 'SYNCING' | 'ERROR';
  statusMessage?: string;
  accountMappings: Record<string, string>; // remoteAccountId -> localAccountId
}

export interface OpenBankingAccountDto {
  id: string;
  name: string;
  institution: string;
  iban: string;
  currency: string;
  balance: number;
  type: 'CHECKING' | 'DEFERRED_CARD' | 'SAVINGS' | 'OTHER';
}

export interface OpenBankingTransactionDto {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  bookingDate?: string;
  description: string;
  originalLabel?: string;
  amount: number;
  currency: string;
}

export interface TransactionFilters {
  dateFrom: string; // YYYY-MM-DD or ''
  dateTo: string; // YYYY-MM-DD or ''
  categoryId: number | 'ALL' | 'UNASSIGNED';
  budgetId: number | 'ALL';
  searchTerm: string;
  filterType: 'ALL' | 'EXPENSE' | 'INCOME' | 'TRANSFER';
  filterStatus: 'ALL' | 'PENDING' | 'RECONCILED' | 'VERIFIED';
}

