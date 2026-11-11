import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
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
  STORAGE_KEYS,
  getInitialSeedData,
  loadStoredData,
  saveStoredData
} from '../utils/storage';
import { ParsedBankRow } from '../utils/csvParser';
import { executeBidirectionalSync } from '../services/firebaseSyncService';
import {
  DEFAULT_OPEN_BANKING_CONFIG,
  executeOpenBankingSync,
  testOpenBankingConnection
} from '../services/openBankingService';

interface BudgetContextType {
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
  isBiometricLocked: boolean;
  toastMessage: string | null;

  navigateTo: (screen: AppScreen) => void;
  setLanguage: (lang: 'fr' | 'en') => void;
  setCurrency: (cur: string) => void;
  setActiveAccountId: (id: string | null) => void;
  setIsBiometricLocked: (locked: boolean) => void;
  showToast: (msg: string) => void;
  dismissToast: () => void;

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
  syncWithFirebaseNow: () => void;
  resetToMockData: (lang?: 'fr' | 'en') => void;

  updateOpenBankingConfig: (patch: Partial<OpenBankingConfig>) => void;
  syncOpenBankingNow: () => Promise<void>;
  testOpenBankingConn: () => Promise<{ success: boolean; message: string; accounts: OpenBankingAccountDto[] }>;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export const BudgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLangState] = useState<'fr' | 'en'>(() =>
    loadStoredData<'fr' | 'en'>(STORAGE_KEYS.LANGUAGE, 'fr')
  );

  const initialSeed = useMemo(() => getInitialSeedData(language), [language]);

  const [accounts, setAccounts] = useState<AccountEntity[]>(() =>
    loadStoredData<AccountEntity[]>(STORAGE_KEYS.ACCOUNTS, initialSeed.accounts)
  );

  const [transactions, setTransactions] = useState<TransactionEntity[]>(() =>
    loadStoredData<TransactionEntity[]>(STORAGE_KEYS.TRANSACTIONS, initialSeed.transactions)
  );

  const [categories, setCategories] = useState<CategoryEntity[]>(() =>
    loadStoredData<CategoryEntity[]>(STORAGE_KEYS.CATEGORIES, initialSeed.categories)
  );

  const [budgets, setBudgets] = useState<CategoryBudgetEntity[]>(() =>
    loadStoredData<CategoryBudgetEntity[]>(STORAGE_KEYS.BUDGETS, initialSeed.budgets)
  );

  const [rules, setRules] = useState<CategorizationRuleEntity[]>(() =>
    loadStoredData<CategorizationRuleEntity[]>(STORAGE_KEYS.RULES, initialSeed.rules)
  );

  const [members, setMembers] = useState<FamilyMemberEntity[]>(() =>
    loadStoredData<FamilyMemberEntity[]>(STORAGE_KEYS.MEMBERS, initialSeed.members)
  );

  const [config, setConfig] = useState<FirebaseConfigEntity>(() =>
    loadStoredData<FirebaseConfigEntity>(STORAGE_KEYS.CONFIG, initialSeed.config)
  );

  const [syncState, setSyncState] = useState<SyncStateEntity>(() =>
    loadStoredData<SyncStateEntity>(STORAGE_KEYS.SYNC_STATE, initialSeed.syncState)
  );

  const [openBankingConfig, setOpenBankingConfig] = useState<OpenBankingConfig>(() =>
    loadStoredData<OpenBankingConfig>(STORAGE_KEYS.OPEN_BANKING, DEFAULT_OPEN_BANKING_CONFIG)
  );

  const [currency, setCurrencyState] = useState<string>(() =>
    loadStoredData<string>(STORAGE_KEYS.CURRENCY, '€')
  );

  const [currentScreen, setCurrentScreen] = useState<AppScreen>('DASHBOARD');
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isBiometricLocked, setIsBiometricLocked] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.OPEN_BANKING, openBankingConfig);
  }, [openBankingConfig]);

  // Sync to localStorage
  useEffect(() => {
    saveStoredData(STORAGE_KEYS.ACCOUNTS, accounts);
  }, [accounts]);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.TRANSACTIONS, transactions);
  }, [transactions]);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.CATEGORIES, categories);
  }, [categories]);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.BUDGETS, budgets);
  }, [budgets]);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.RULES, rules);
  }, [rules]);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.MEMBERS, members);
  }, [members]);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.CONFIG, config);
  }, [config]);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.SYNC_STATE, syncState);
  }, [syncState]);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.LANGUAGE, language);
  }, [language]);

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.CURRENCY, currency);
  }, [currency]);

  const [outbox, setOutbox] = useState<SyncOutboxEntity[]>(() =>
    loadStoredData<SyncOutboxEntity[]>(STORAGE_KEYS.OUTBOX, [])
  );

  useEffect(() => {
    saveStoredData(STORAGE_KEYS.OUTBOX, outbox);
  }, [outbox]);

  const enqueueOutbox = (entityType: string, entityId: string, operation: 'UPSERT' | 'DELETE') => {
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
  };

  const setCurrency = (cur: string) => {
    setCurrencyState(cur);
  };

  const resetToMockData = (lang: 'fr' | 'en' = language) => {
    const data = getInitialSeedData(lang);
    setAccounts(data.accounts);
    setTransactions(data.transactions);
    setCategories(data.categories);
    setBudgets(data.budgets);
    setRules(data.rules);
    setMembers(data.members);
    setConfig(data.config);
    setSyncState(data.syncState);
    showToast(lang === 'fr' ? 'Données de démonstration réinitialisées' : 'Demo data reset successfully');
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

    // Update account balance
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

    // Adjust balances if amount changed
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

    // Revert account balance impact
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

    // Mark parent as split parent
    const updatedParent: TransactionEntity = {
      ...parent,
      isSplitParent: true,
      updatedAt: now
    };

    // Create child split items
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

    // Outgoing transaction from source
    const outTx: TransactionEntity = {
      id: nextId++,
      title: `${language === 'fr' ? 'Virement vers' : 'Transfer to'} ${targetAcc.name}`,
      originalBankLabel: `INTERNAL TRANSFER TO ${targetAcc.name.toUpperCase()}`,
      amount: -absAmount,
      isExpense: true,
      categoryId: 9,
      categoryName: language === 'fr' ? 'Épargne & Investissement' : 'Savings & Investments',
      categoryColor: 0xff6366f1,
      categoryIcon: 'PiggyBank',
      budgetId: 0,
      budgetTitle: 'Internal Transfer',
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

    // Incoming transaction to target
    const inTx: TransactionEntity = {
      id: nextId++,
      title: `${language === 'fr' ? 'Virement reçu de' : 'Transfer from'} ${sourceAcc.name}`,
      originalBankLabel: `INTERNAL TRANSFER FROM ${sourceAcc.name.toUpperCase()}`,
      amount: absAmount,
      isExpense: false,
      categoryId: 9,
      categoryName: language === 'fr' ? 'Épargne & Investissement' : 'Savings & Investments',
      categoryColor: 0xff6366f1,
      categoryIcon: 'PiggyBank',
      budgetId: 0,
      budgetTitle: 'Internal Transfer',
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

    // Update balances
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

    showToast(
      language === 'fr'
        ? 'Dépense manuelle et relevé bancaire réconciliés avec succès'
        : 'Manual expense and bank statement reconciled successfully'
    );
  };

  // Accounts CRUD
  const addAccount = (acc: Omit<AccountEntity, 'updatedAt' | 'isDeleted'>) => {
    const now = Date.now();
    setAccounts(prev => [...prev, { ...acc, updatedAt: now, isDeleted: false }]);
    enqueueOutbox('ACCOUNT', acc.id, 'UPSERT');
    showToast(language === 'fr' ? 'Compte créé' : 'Account created');
  };

  const updateAccount = (acc: AccountEntity) => {
    const now = Date.now();
    setAccounts(prev => prev.map(a => (a.id === acc.id ? { ...acc, updatedAt: now } : a)));
    enqueueOutbox('ACCOUNT', acc.id, 'UPSERT');
    showToast(language === 'fr' ? 'Compte mis à jour' : 'Account updated');
  };

  const deleteAccount = (id: string) => {
    const now = Date.now();
    setAccounts(prev => prev.map(a => (a.id === id ? { ...a, isDeleted: true, updatedAt: now } : a)));
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
    enqueueOutbox('CATEGORY', `cat_${cat.id}`, 'UPSERT');
    showToast(language === 'fr' ? 'Catégorie mise à jour' : 'Category updated');
  };

  const deleteCategory = (id: number) => {
    const now = Date.now();
    setCategories(prev => prev.map(c => (c.id === id ? { ...c, isDeleted: true, updatedAt: now } : c)));
    enqueueOutbox('CATEGORY', `cat_${id}`, 'DELETE');
    showToast(language === 'fr' ? 'Catégorie supprimée' : 'Category deleted');
  };

  // Budgets CRUD
  const addBudget = (b: Omit<CategoryBudgetEntity, 'id' | 'updatedAt' | 'isDeleted'>) => {
    const nextId = Math.max(0, ...budgets.map(bg => bg.id)) + 1;
    const now = Date.now();
    setBudgets(prev => [...prev, { ...b, id: nextId, updatedAt: now, isDeleted: false }]);
    enqueueOutbox('BUDGET', `budget_${nextId}`, 'UPSERT');
    showToast(language === 'fr' ? 'Ligne de budget créée' : 'Budget line created');
  };

  const updateBudget = (b: CategoryBudgetEntity) => {
    const now = Date.now();
    setBudgets(prev => prev.map(bg => (bg.id === b.id ? { ...b, updatedAt: now } : bg)));
    enqueueOutbox('BUDGET', `budget_${b.id}`, 'UPSERT');
    showToast(language === 'fr' ? 'Budget mis à jour' : 'Budget updated');
  };

  const deleteBudget = (id: number) => {
    const now = Date.now();
    setBudgets(prev => prev.map(bg => (bg.id === id ? { ...bg, isDeleted: true, updatedAt: now } : bg)));
    enqueueOutbox('BUDGET', `budget_${id}`, 'DELETE');
    showToast(language === 'fr' ? 'Ligne de budget supprimée' : 'Budget line deleted');
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

    // Update target account balance
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
    showToast(language === 'fr' ? 'Configuration mise à jour' : 'Configuration updated');
  };

  const syncWithFirebaseNow = async () => {
    setSyncState(prev => ({
      ...prev,
      lastSyncStatus: 'SYNCING',
      lastSyncMessage: language === 'fr' ? 'Synchronisation Cloud Firestore en cours...' : 'Syncing with Cloud Firestore...'
    }));

    try {
      const result = await executeBidirectionalSync({
        accounts,
        transactions,
        categories,
        budgets,
        rules,
        members,
        outbox,
        syncState,
        config
      });

      if (result.incomingTransactions && result.incomingTransactions.length > 0) {
        setTransactions(prev => {
          const map = new Map(prev.map(t => [t.id, t]));
          for (const inc of result.incomingTransactions!) {
            map.set(inc.id, inc);
          }
          return Array.from(map.values());
        });
      }

      setOutbox([]);
      setSyncState(result.updatedSyncState);
      showToast(result.message);
    } catch (err: any) {
      setSyncState(prev => ({
        ...prev,
        lastSyncStatus: 'ERROR',
        lastSyncMessage: err?.message || 'Sync failed'
      }));
      showToast(language === 'fr' ? 'Erreur de synchronisation' : 'Sync error');
    }
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
        isBiometricLocked,
        toastMessage,

        navigateTo,
        setLanguage,
        setCurrency,
        setActiveAccountId,
        setIsBiometricLocked,
        showToast,
        dismissToast,

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
        testOpenBankingConn
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
