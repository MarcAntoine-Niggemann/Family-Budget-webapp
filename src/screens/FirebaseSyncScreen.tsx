import React, { useEffect, useState } from 'react';
import {
  Shield,
  CloudCheck,
  CloudSync,
  CloudOff,
  Users,
  RefreshCw,
  Globe,
  Sparkles,
  QrCode,
  AlertCircle,
  Copy,
  Check,
  LogOut,
  DownloadCloud,
  Wallet,
  Plus,
  Pencil,
  Fingerprint,
  Trash2,
  Lock,
  KeyRound,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { ShareVaultQrModal } from '../components/ShareVaultQrModal';
import { AccountModal } from '../components/AccountModal';
import { MemberManagementModal } from '../components/MemberManagementModal';
import { CategoryIcon } from '../components/CategoryIcon';
import { AccountEntity, AccountType, FamilyMemberEntity, ThemePreference } from '../types';
import {
  BiometricStatus,
  checkBiometricSupport
} from '../utils/biometricKeyvault';
import { MIN_VAULT_PASSPHRASE_LENGTH, evaluatePassphraseStrength } from '../utils/crypto';

export const BYOB_FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function incoming() {
      return request.resource.data;
    }
    function existing() {
      return resource.data;
    }
    function isSignedIn() {
      return request.auth != null
        && request.auth.uid != null
        && request.auth.token.email != null
        && request.auth.token.email.size() > 0
        && request.auth.token.email_verified == true;
    }
    function userEmail() {
      return request.auth.token.email.lower();
    }
    function isValidId(id) {
      return id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$');
    }
    function isValidTimestamp(val) {
      return val is int || val is timestamp;
    }
    function isValidString(val, maxLen) {
      return val is string && val.size() <= maxLen;
    }
    function isOptionalString(data, field, maxLen) {
      return !(field in data) || data[field] == null || (data[field] is string && data[field].size() <= maxLen);
    }
    function isOptionalNumber(data, field) {
      return !(field in data) || data[field] == null || (data[field] is int || data[field] is float);
    }
    function isOptionalBool(data, field) {
      return !(field in data) || data[field] == null || (data[field] is bool);
    }

    function rolesDocPath() {
      return /databases/$(database)/documents/security_config/roles;
    }
    function vaultMetaPath() {
      return /databases/$(database)/documents/family_meta/vault;
    }
    function rolesDocExists() {
      return exists(rolesDocPath());
    }
    function vaultMetaExists() {
      return exists(vaultMetaPath());
    }
    function hasUserRole() {
      return rolesDocExists()
        && ('userRoles' in get(rolesDocPath()).data)
        && get(rolesDocPath()).data.userRoles is map
        && (userEmail() in get(rolesDocPath()).data.userRoles);
    }
    function isUserAdmin() {
      return hasUserRole()
        && get(rolesDocPath()).data.userRoles[userEmail()] == 'ADMIN';
    }
    function isUserEditorOrMember() {
      return hasUserRole()
        && (get(rolesDocPath()).data.userRoles[userEmail()] in ['ADMIN', 'EDITOR', 'MEMBER']);
    }
    function isFamilyMember() {
      return isSignedIn() && hasUserRole();
    }
    function isAdmin() {
      return isSignedIn() && isUserAdmin();
    }
    function canEdit() {
      return isSignedIn() && isUserEditorOrMember();
    }

    function isValidRolesDoc(data) {
      return data.keys().hasAll(['userRoles', 'updatedAt'])
        && data.keys().hasOnly(['userRoles', 'updatedAt'])
        && data.userRoles is map
        && data.userRoles.size() >= 1
        && data.userRoles.size() <= 50
        && isValidTimestamp(data.updatedAt);
    }
    function isValidByobVaultMeta(data) {
      return data.keys().hasAll(['familyName', 'adminEmail', 'updatedAt'])
        && data.keys().hasOnly(['familyName', 'adminEmail', 'updatedAt'])
        && isValidString(data.familyName, 120)
        && data.familyName.size() >= 1
        && isValidString(data.adminEmail, 254)
        && isValidTimestamp(data.updatedAt);
    }
    function isValidMember(data) {
      return data.keys().hasAll(['id', 'name', 'role', 'updatedAt', 'isDeleted'])
        && data.keys().hasOnly([
          'id', 'name', 'email', 'role', 'avatarColor',
          'firestoreSynced', 'customPermissions', 'monthlyIncome',
          'updatedAt', 'isDeleted'
        ])
        && isValidString(data.id, 128)
        && isValidString(data.name, 120)
        && data.name.size() >= 1
        && data.role in ['ADMIN', 'EDITOR', 'MEMBER', 'VIEWER', 'CHILD']
        && isOptionalString(data, 'email', 254)
        && isOptionalNumber(data, 'avatarColor')
        && isOptionalBool(data, 'firestoreSynced')
        && isOptionalString(data, 'customPermissions', 500)
        && isOptionalNumber(data, 'monthlyIncome')
        && isValidTimestamp(data.updatedAt)
        && data.isDeleted is bool;
    }
    function isValidAccount(data) {
      return data.keys().hasAll(['id', 'name', 'type', 'currentBalance', 'updatedAt', 'isDeleted'])
        && data.keys().hasOnly([
          'id', 'name', 'type', 'currentBalance', 'currency',
          'billingCycleClosingDay', 'settlementDay', 'linkedCheckingAccountId',
          'includeInLiquidForecast', 'targetSavingsGoal', 'monthlyClosingOverrides',
          'color', 'icon', 'isDefault', 'lastManualSyncTimestamp',
          'openBankingAccountId', 'openBankingInstitution', 'openBankingIban',
          'lastOpenBankingSync', 'updatedAt', 'isDeleted'
        ])
        && isValidString(data.id, 128)
        && isValidString(data.name, 120)
        && data.type in ['CHECKING', 'DEFERRED_CARD', 'SAVINGS', 'CASH', 'INVESTMENT', 'OTHER']
        && (data.currentBalance is int || data.currentBalance is float)
        && isOptionalString(data, 'currency', 12)
        && isOptionalNumber(data, 'billingCycleClosingDay')
        && isOptionalNumber(data, 'settlementDay')
        && isOptionalString(data, 'linkedCheckingAccountId', 128)
        && isOptionalBool(data, 'includeInLiquidForecast')
        && isOptionalNumber(data, 'targetSavingsGoal')
        && isOptionalString(data, 'monthlyClosingOverrides', 2000)
        && isOptionalNumber(data, 'color')
        && isOptionalString(data, 'icon', 64)
        && isOptionalBool(data, 'isDefault')
        && isOptionalNumber(data, 'lastManualSyncTimestamp')
        && isOptionalString(data, 'openBankingAccountId', 128)
        && isOptionalString(data, 'openBankingInstitution', 120)
        && isOptionalString(data, 'openBankingIban', 64)
        && isOptionalNumber(data, 'lastOpenBankingSync')
        && isValidTimestamp(data.updatedAt)
        && data.isDeleted is bool;
    }
    function isValidCategory(data) {
      return data.keys().hasAll(['id', 'name', 'updatedAt', 'isDeleted'])
        && data.keys().hasOnly(['id', 'name', 'icon', 'color', 'updatedAt', 'isDeleted'])
        && data.id is int
        && isValidString(data.name, 120)
        && isOptionalString(data, 'icon', 64)
        && isOptionalNumber(data, 'color')
        && isValidTimestamp(data.updatedAt)
        && data.isDeleted is bool;
    }
    function isValidBudget(data) {
      return data.keys().hasAll(['id', 'categoryId', 'title', 'amount', 'frequency', 'updatedAt', 'isDeleted'])
        && data.keys().hasOnly([
          'id', 'categoryId', 'categoryName', 'amount', 'frequency',
          'year', 'month', 'day', 'startYear', 'startMonth', 'endYear', 'endMonth',
          'title', 'notes', 'isExpense', 'isActive', 'updatedAt', 'isDeleted'
        ])
        && data.id is int
        && data.categoryId is int
        && isOptionalString(data, 'categoryName', 120)
        && (data.amount is int || data.amount is float)
        && data.frequency in ['MONTHLY', 'YEARLY', 'ONCE']
        && isValidString(data.title, 160)
        && isOptionalString(data, 'notes', 1000)
        && isOptionalNumber(data, 'year')
        && isOptionalNumber(data, 'month')
        && isOptionalNumber(data, 'day')
        && isOptionalNumber(data, 'startYear')
        && isOptionalNumber(data, 'startMonth')
        && isOptionalNumber(data, 'endYear')
        && isOptionalNumber(data, 'endMonth')
        && isOptionalBool(data, 'isExpense')
        && isOptionalBool(data, 'isActive')
        && isValidTimestamp(data.updatedAt)
        && data.isDeleted is bool;
    }
    function isValidRule(data) {
      return data.keys().hasAll(['id', 'pattern', 'matchType', 'targetCategoryId', 'updatedAt', 'isDeleted'])
        && data.keys().hasOnly([
          'id', 'pattern', 'matchType', 'targetCategoryId', 'targetCategoryName',
          'targetBudgetId', 'targetBudgetTitle', 'priority', 'isActive', 'updatedAt', 'isDeleted'
        ])
        && data.id is int
        && isValidString(data.pattern, 150)
        && data.matchType in ['CONTAINS', 'STARTS_WITH', 'EXACT', 'REGEX']
        && data.targetCategoryId is int
        && isOptionalString(data, 'targetCategoryName', 120)
        && isOptionalNumber(data, 'targetBudgetId')
        && isOptionalString(data, 'targetBudgetTitle', 160)
        && isOptionalNumber(data, 'priority')
        && isOptionalBool(data, 'isActive')
        && isValidTimestamp(data.updatedAt)
        && data.isDeleted is bool;
    }
    function isValidTransaction(data) {
      return data.keys().hasAll(['id', 'title', 'amount', 'date', 'accountId', 'updatedAt', 'isDeleted'])
        && data.keys().hasOnly([
          'id', 'remoteId', 'title', 'originalBankLabel', 'amount', 'isExpense',
          'categoryId', 'categoryName', 'categoryColor', 'categoryIcon',
          'budgetId', 'budgetTitle', 'date', 'familyMemberId', 'familyMemberName',
          'source', 'status', 'reconciledWithId', 'paymentMethod', 'notes',
          'parentId', 'isSplitParent', 'isSplit', 'isExcluded', 'isExcludedFromTotals',
          'settlementCardName', 'billingCycleClosingDay', 'billingCycleEndDate', 'billingCycleStartDate',
          'accountId', 'accountName', 'targetAccountId', 'targetAccountName',
          'isInternalTransfer', 'transferType', 'creditCardPeriod', 'sharedSplit',
          'updatedAt', 'isDeleted'
        ])
        && data.id is int
        && isValidString(data.title, 200)
        && (data.amount is int || data.amount is float)
        && isValidTimestamp(data.date)
        && isValidString(data.accountId, 128)
        && isOptionalString(data, 'remoteId', 128)
        && isOptionalString(data, 'originalBankLabel', 300)
        && isOptionalBool(data, 'isExpense')
        && isOptionalNumber(data, 'categoryId')
        && isOptionalString(data, 'categoryName', 120)
        && isOptionalNumber(data, 'categoryColor')
        && isOptionalString(data, 'categoryIcon', 64)
        && isOptionalNumber(data, 'budgetId')
        && isOptionalString(data, 'budgetTitle', 160)
        && isOptionalString(data, 'familyMemberId', 128)
        && isOptionalString(data, 'familyMemberName', 120)
        && isOptionalString(data, 'source', 32)
        && isOptionalString(data, 'status', 32)
        && isOptionalNumber(data, 'reconciledWithId')
        && isOptionalString(data, 'paymentMethod', 120)
        && isOptionalString(data, 'notes', 1000)
        && isOptionalNumber(data, 'parentId')
        && isOptionalBool(data, 'isSplitParent')
        && isOptionalBool(data, 'isSplit')
        && isOptionalBool(data, 'isExcluded')
        && isOptionalBool(data, 'isExcludedFromTotals')
        && isOptionalString(data, 'settlementCardName', 120)
        && isOptionalNumber(data, 'billingCycleClosingDay')
        && isOptionalNumber(data, 'billingCycleEndDate')
        && isOptionalNumber(data, 'billingCycleStartDate')
        && isOptionalString(data, 'accountName', 120)
        && isOptionalString(data, 'targetAccountId', 128)
        && isOptionalString(data, 'targetAccountName', 120)
        && isOptionalBool(data, 'isInternalTransfer')
        && isOptionalString(data, 'transferType', 32)
        && isOptionalString(data, 'creditCardPeriod', 16)
        && (!('sharedSplit' in data) || data.sharedSplit == null || data.sharedSplit is map)
        && isValidTimestamp(data.updatedAt)
        && data.isDeleted is bool;
    }
    function isValidSettlement(data) {
      return data.keys().hasAll(['id', 'fromMemberId', 'toMemberId', 'amount', 'date', 'updatedAt', 'isDeleted'])
        && data.keys().hasOnly([
          'id', 'fromMemberId', 'fromMemberName', 'toMemberId', 'toMemberName',
          'amount', 'date', 'notes', 'linkedTransactionId', 'updatedAt', 'isDeleted'
        ])
        && isValidString(data.id, 128)
        && isValidString(data.fromMemberId, 128)
        && isOptionalString(data, 'fromMemberName', 120)
        && isValidString(data.toMemberId, 128)
        && isOptionalString(data, 'toMemberName', 120)
        && (data.amount is int || data.amount is float)
        && data.amount >= 0
        && isValidTimestamp(data.date)
        && isOptionalString(data, 'notes', 500)
        && isOptionalNumber(data, 'linkedTransactionId')
        && isValidTimestamp(data.updatedAt)
        && data.isDeleted is bool;
    }
    function isValidLegacyAccountBalance(data) {
      return data.keys().hasAll(['currentBalance', 'updatedAt'])
        && data.keys().hasOnly(['id', 'accountName', 'currentBalance', 'lastManualSyncTimestamp', 'updatedAt', 'isDeleted'])
        && isOptionalString(data, 'id', 128)
        && isOptionalString(data, 'accountName', 120)
        && (data.currentBalance is int || data.currentBalance is float)
        && isOptionalNumber(data, 'lastManualSyncTimestamp')
        && isValidTimestamp(data.updatedAt)
        && isOptionalBool(data, 'isDeleted');
    }
    function isValidLegacyExpectedSpend(data) {
      return data.keys().hasAll(['updatedAt'])
        && data.keys().hasOnly(['id', 'title', 'amount', 'categoryId', 'date', 'notes', 'isDeleted', 'updatedAt'])
        && isOptionalNumber(data, 'id')
        && isOptionalString(data, 'title', 160)
        && isOptionalNumber(data, 'amount')
        && isOptionalNumber(data, 'categoryId')
        && isOptionalNumber(data, 'date')
        && isOptionalString(data, 'notes', 1000)
        && isOptionalBool(data, 'isDeleted')
        && isValidTimestamp(data.updatedAt);
    }
    function isValidLegacyPaymentMethod(data) {
      return data.keys().hasAll(['name', 'updatedAt'])
        && data.keys().hasOnly(['id', 'name', 'type', 'isDeleted', 'updatedAt'])
        && isOptionalString(data, 'id', 128)
        && isValidString(data.name, 120)
        && isOptionalString(data, 'type', 32)
        && isOptionalBool(data, 'isDeleted')
        && isValidTimestamp(data.updatedAt);
    }
    function isValidUserProfile(data, userId) {
      return data.keys().hasOnly(['uid', 'email', 'displayName', 'updatedAt'])
        && (!('uid' in data) || data.uid == userId)
        && isOptionalString(data, 'email', 254)
        && isOptionalString(data, 'displayName', 120)
        && isOptionalNumber(data, 'updatedAt');
    }

    match /users/{userId} {
      allow get: if isSignedIn() && isValidId(userId) && request.auth.uid == userId;
      allow list: if false;
      allow create, update: if isSignedIn() && isValidId(userId) && request.auth.uid == userId && isValidUserProfile(incoming(), userId);
      allow delete: if false;
    }
    match /security_config/{configDoc} {
      allow get: if isValidId(configDoc) && isFamilyMember();
      allow list: if false;
      allow create: if isSignedIn()
        && configDoc == 'roles'
        && isValidRolesDoc(incoming())
        && ((!rolesDocExists() && !vaultMetaExists() && (userEmail() in incoming().userRoles) && incoming().userRoles[userEmail()] == 'ADMIN' && existsAfter(vaultMetaPath())) || isAdmin());
      allow update: if isAdmin() && configDoc == 'roles' && isValidRolesDoc(incoming()) && (userEmail() in incoming().userRoles) && incoming().userRoles[userEmail()] == 'ADMIN';
      allow delete: if false;
    }
    match /family_meta/{docId} {
      allow get: if isValidId(docId) && isFamilyMember();
      allow list: if false;
      allow create: if isSignedIn()
        && docId == 'vault'
        && isValidByobVaultMeta(incoming())
        && ((!rolesDocExists() && !vaultMetaExists() && incoming().adminEmail.lower() == userEmail() && getAfter(rolesDocPath()).data.userRoles[userEmail()] == 'ADMIN') || isAdmin());
      allow update: if isAdmin() && docId == 'vault' && isValidByobVaultMeta(incoming()) && incoming().diff(existing()).affectedKeys().hasOnly(['familyName', 'updatedAt']);
      allow delete: if false;
    }
    match /family_members/{memberId} {
      allow get: if isValidId(memberId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if isAdmin() && isValidId(memberId) && isValidMember(incoming());
      allow delete: if isAdmin() && isValidId(memberId);
    }
    match /categories/{catId} {
      allow get: if isValidId(catId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if canEdit() && isValidId(catId) && isValidCategory(incoming());
      allow delete: if isAdmin() && isValidId(catId);
    }
    match /transactions/{txId} {
      allow get: if isValidId(txId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if canEdit() && isValidId(txId) && isValidTransaction(incoming());
      allow delete: if isAdmin() && isValidId(txId);
    }
    match /category_budgets/{budgetId} {
      allow get: if isValidId(budgetId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if canEdit() && isValidId(budgetId) && isValidBudget(incoming());
      allow delete: if isAdmin() && isValidId(budgetId);
    }
    match /rules/{ruleId} {
      allow get: if isValidId(ruleId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if canEdit() && isValidId(ruleId) && isValidRule(incoming());
      allow delete: if isAdmin() && isValidId(ruleId);
    }
    match /expected_spends/{spendId} {
      allow get: if isValidId(spendId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if canEdit() && isValidId(spendId) && isValidLegacyExpectedSpend(incoming());
      allow delete: if isAdmin() && isValidId(spendId);
    }
    match /account_balance/{docId} {
      allow get: if isValidId(docId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if canEdit() && isValidId(docId) && isValidLegacyAccountBalance(incoming());
      allow delete: if isAdmin() && isValidId(docId);
    }
    match /accounts/{accountId} {
      allow get: if isValidId(accountId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if canEdit() && isValidId(accountId) && isValidAccount(incoming());
      allow delete: if isAdmin() && isValidId(accountId);
    }
    match /payment_methods/{pmId} {
      allow get: if isValidId(pmId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if canEdit() && isValidId(pmId) && isValidLegacyPaymentMethod(incoming());
      allow delete: if isAdmin() && isValidId(pmId);
    }
    match /shared_settlements/{settlementId} {
      allow get: if isValidId(settlementId) && isFamilyMember();
      allow list: if isFamilyMember();
      allow create, update: if canEdit() && isValidId(settlementId) && isValidSettlement(incoming());
      allow delete: if isAdmin() && isValidId(settlementId);
    }
  }
}`;

export const FirebaseSyncScreen: React.FC = () => {
  const {
    sessionMode,
    config,
    vaultLockMeta,
    updateConfig,
    accounts,
    currency,
    members,
    syncState,
    syncWithFirebaseNow,
    resetToMockData,
    language,
    setLanguage,
    themePreference,
    resolvedTheme,
    setThemePreference,
    firebaseUser,
    loginWithGoogle,
    lockVault,
    logout,
    forgetByobConfig,
    enrollOrUpdateBiometrics,
    updateVaultPin,
    removeVaultPin,
    removeBiometrics,
    showToast
  } = useBudget();

  const isFr = language === 'fr';
  const isFirestoreMode = sessionMode === 'FIRESTORE';
  const isByobConfigured = !!(config.projectId?.trim() && config.apiKey?.trim());
  const isActuallyAuthenticated = isFirestoreMode && isByobConfigured && !!firebaseUser;
  const isAdmin = !isFirestoreMode || config.currentUserRole === 'ADMIN';

  const [familyName, setFamilyName] = useState(config.familyName || 'Family Vault');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountEntity | null>(null);
  const [memberModalState, setMemberModalState] = useState<{
    isOpen: boolean;
    member: FamilyMemberEntity | null;
  }>({ isOpen: false, member: null });
  const [copiedRules, setCopiedRules] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>({
    isSupported: false,
    isPlatformAvailable: false,
    hasEnrolledCredential: false
  });
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [currentVaultPin, setCurrentVaultPin] = useState('');
  const [newVaultPin, setNewVaultPin] = useState('');
  const [confirmVaultPin, setConfirmVaultPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const pinStrength = evaluatePassphraseStrength(newVaultPin);

  useEffect(() => {
    checkBiometricSupport().then(setBiometricStatus);
  }, []);

  const getAccountTypeLabel = (type: AccountType) => {
    switch (type) {
      case 'CHECKING':
        return isFr ? 'Compte Courant' : 'Checking';
      case 'DEFERRED_CARD':
        return isFr ? 'Carte Différée' : 'Deferred Card';
      case 'SAVINGS':
        return isFr ? 'Épargne' : 'Savings';
      case 'CASH':
        return isFr ? 'Espèces' : 'Cash';
      case 'INVESTMENT':
        return isFr ? 'Investissement' : 'Investment';
      default:
        return isFr ? 'Autre' : 'Other';
    }
  };

  const handleSaveVault = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    updateConfig({
      familyName: familyName.trim()
    });
  };

  const handleCopyRules = () => {
    navigator.clipboard.writeText(BYOB_FIRESTORE_RULES);
    setCopiedRules(true);
    showToast(isFr ? 'Règles Firestore copiées dans le presse-papiers' : 'Firestore rules copied to clipboard');
    setTimeout(() => setCopiedRules(false), 2000);
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const res = await loginWithGoogle();
      if (!res.success && res.error) {
        setAuthError(res.error);
      }
    } catch (err: any) {
      setAuthError(err?.message || (isFr ? 'Erreur lors de la connexion Google / Firestore.' : 'Google / Firestore sign-in error.'));
    }
  };

  const handleEnrollFingerprint = async () => {
    setBiometricLoading(true);
    try {
      const res = await enrollOrUpdateBiometrics(currentVaultPin.trim() || undefined);
      const updated = await checkBiometricSupport();
      setBiometricStatus(updated);
      if (res.success) {
        setCurrentVaultPin('');
        showToast(
          res.prfSupported
            ? isFr
              ? 'Empreinte WebAuthn PRF enregistrée (clé matérielle active) !'
              : 'WebAuthn PRF fingerprint enrolled (hardware key active)!'
            : isFr
            ? 'Empreinte enregistrée (associée à votre mot de passe) !'
            : 'Fingerprint enrolled (paired with your Vault Passphrase)!'
        );
      } else if (res.error) {
        showToast(res.error);
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  const handleRemoveFingerprint = async () => {
    const res = await removeBiometrics();
    const updated = await checkBiometricSupport();
    setBiometricStatus(updated);
    if (res.success) {
      showToast(isFr ? 'Empreinte supprimée de cet appareil' : 'Fingerprint credential removed from this device');
    } else if (res.error) {
      showToast(res.error);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newVaultPin.trim().length < MIN_VAULT_PASSPHRASE_LENGTH) {
      showToast(
        isFr
          ? `Le mot de passe du coffre doit contenir ${MIN_VAULT_PASSPHRASE_LENGTH} caractères minimum.`
          : `Vault Passphrase must be at least ${MIN_VAULT_PASSPHRASE_LENGTH} characters.`
      );
      return;
    }
    if (newVaultPin.trim() !== confirmVaultPin.trim()) {
      showToast(
        isFr
          ? 'Les deux mots de passe / codes PIN ne correspondent pas.'
          : 'Vault Passphrase entries do not match.'
      );
      return;
    }
    setPinSaving(true);
    try {
      const res = await updateVaultPin(
        newVaultPin.trim(),
        currentVaultPin.trim() || undefined
      );
      if (res.success) {
        setCurrentVaultPin('');
        setNewVaultPin('');
        setConfirmVaultPin('');
        showToast(isFr ? 'Mot de passe du coffre mis à jour' : 'Vault Passphrase updated');
      } else if (res.error) {
        showToast(res.error);
      }
    } finally {
      setPinSaving(false);
    }
  };

  const handleRemovePin = async () => {
    const res = await removeVaultPin();
    if (res.success) {
      showToast(isFr ? 'Code PIN retiré — clé biométrique stricte active' : 'Vault PIN removed — strict biometric key active');
    } else if (res.error) {
      showToast(res.error);
    }
  };

  const lastSyncDateStr = syncState.lastPushTimestamp
    ? new Date(syncState.lastPushTimestamp).toLocaleString(isFr ? 'fr-FR' : 'en-US')
    : isFr
    ? 'Jamais'
    : 'Never';

  const handleSelectTheme = (nextTheme: ThemePreference) => {
    setThemePreference(nextTheme);
    const label =
      nextTheme === 'system'
        ? isFr
          ? 'Thème : Automatique (système)'
          : 'Theme: System (Auto)'
        : nextTheme === 'light'
        ? isFr
          ? 'Thème : Clair'
          : 'Theme: Light'
        : isFr
        ? 'Thème : Sombre'
        : 'Theme: Dark';
    showToast(label);
  };

  const themeOptions: {
    value: ThemePreference;
    label: string;
    description: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: 'system',
      label: isFr ? 'Système (Auto)' : 'System (Auto)',
      description: isFr
        ? `Suit l’appareil (actuel : ${resolvedTheme === 'dark' ? 'Sombre' : 'Clair'})`
        : `Matches browser/OS (currently ${resolvedTheme === 'dark' ? 'Dark' : 'Light'})`,
      icon: <Monitor className="w-4 h-4" />
    },
    {
      value: 'light',
      label: isFr ? 'Clair' : 'Light',
      description: isFr ? 'Surfaces blanches et ardoise claire' : 'Crisp cool slate & white surfaces',
      icon: <Sun className="w-4 h-4" />
    },
    {
      value: 'dark',
      label: isFr ? 'Sombre' : 'Dark',
      description: isFr ? 'Thème nocturne ardoise profonde' : 'Deep slate low-light workspace',
      icon: <Moon className="w-4 h-4" />
    }
  ];

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {isFr ? 'Configuration du Coffre & Synchronisation' : 'Vault Config & Cloud Sync'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isFr
              ? 'Chiffrement local AES-256-GCM, membres RBAC, biométrie, apparence et synchronisation Firestore'
              : 'AES-256-GCM local encryption, family RBAC, biometrics, appearance, and Cloud Firestore sync'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {isFirestoreMode && (
            <button
              type="button"
              onClick={() => lockVault()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition whitespace-nowrap cursor-pointer shadow-sm dark:shadow-none"
            >
              <Lock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{isFr ? 'Verrouiller le coffre' : 'Lock Vault'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-200 font-semibold text-xs transition whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>
              {isFr ? 'Déconnexion (effacer données & Open Banking)' : 'Log Out (Erase Data & Open Banking)'}
            </span>
          </button>
        </div>
      </div>

      {/* Appearance & Theme Selector Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-500/15 border border-teal-200 dark:border-teal-500/30 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              {resolvedTheme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">
                {isFr ? 'Apparence & Thème' : 'Appearance & Theme'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isFr
                  ? 'Préférence enregistrée localement sur cet appareil (par défaut selon votre navigateur)'
                  : 'Saved locally on this device (automatically follows your browser/OS by default)'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label={isFr ? 'Choix du thème' : 'Theme preference'}>
          {themeOptions.map(opt => {
            const isSelected = themePreference === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleSelectTheme(opt.value)}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                  isSelected
                    ? 'bg-teal-50/90 dark:bg-teal-500/15 border-teal-500 dark:border-teal-500/60 ring-1 ring-teal-500/30'
                    : 'bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-950/70 dark:hover:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'bg-teal-600 dark:bg-teal-500 text-white dark:text-slate-950'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {opt.icon}
                </div>
                <div className="min-w-0">
                  <span
                    className={`block text-xs font-bold ${
                      isSelected ? 'text-teal-800 dark:text-teal-200' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {opt.label}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {opt.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cloud & Outbox Sync Status Card */}
      <div
        className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border shadow-sm dark:shadow-xl space-y-4 ${
          syncState.lastSyncStatus === 'ERROR'
            ? 'border-rose-300 dark:border-rose-500/50'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                syncState.lastSyncStatus === 'ERROR'
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400'
                  : 'bg-teal-50 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300'
              }`}
            >
              {syncState.lastSyncStatus === 'SYNCING' ? (
                <CloudSync className="w-5 h-5 animate-spin" />
              ) : syncState.lastSyncStatus === 'ERROR' || !isFirestoreMode ? (
                <CloudOff className="w-5 h-5" />
              ) : (
                <CloudCheck className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                {isFr ? 'Statut de Synchronisation du Coffre' : 'Vault Synchronization Status'}
              </h2>
              {syncState.lastSyncStatus !== 'ERROR' && (
                <p className="text-xs mt-0.5 text-slate-500 dark:text-slate-400">
                  {syncState.lastSyncMessage || (isFr ? 'Prêt.' : 'Ready.')}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isFirestoreMode && isByobConfigured && isAdmin && (
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition whitespace-nowrap cursor-pointer"
                title={isFr ? 'Partager le QR Code du Coffre' : 'Share Vault QR Code'}
              >
                <QrCode className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>{isFr ? 'Partager QR' : 'Share QR'}</span>
              </button>
            )}

            {isFirestoreMode && (
              <button
                onClick={() => syncWithFirebaseNow()}
                disabled={syncState.lastSyncStatus === 'SYNCING'}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw
                  className={`w-4 h-4 ${syncState.lastSyncStatus === 'SYNCING' ? 'animate-spin' : ''}`}
                />
                <span>{isFr ? 'Synchroniser' : 'Sync Now'}</span>
              </button>
            )}
          </div>
        </div>

        {syncState.lastSyncStatus === 'ERROR' && syncState.lastSyncMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs space-y-2 leading-relaxed">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span className="whitespace-pre-line break-words flex-1 font-medium">
                {syncState.lastSyncMessage}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pl-6">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(syncState.lastSyncMessage || '');
                  showToast(isFr ? 'Erreur de synchronisation copiée' : 'Sync error copied');
                }}
                className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-200 hover:underline font-semibold cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{isFr ? 'Copier le diagnostic' : 'Copy diagnostic'}</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <span className="text-slate-500 block">{isFr ? 'Dernière synchro :' : 'Last Sync:'}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">{lastSyncDateStr}</span>
          </div>
          <div>
            <span className="text-slate-500 block">
              {isFr ? 'Modifications en attente :' : 'Outbox Queue:'}
            </span>
            <span className="font-semibold text-teal-600 dark:text-teal-400 mt-0.5 block tabular-nums">
              {syncState.pendingOutboxCount} {isFr ? 'opérations' : 'items'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">{isFr ? 'Mode actif :' : 'Active Mode:'}</span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-300 mt-0.5 block">
              {isFirestoreMode && isByobConfigured
                ? isActuallyAuthenticated
                  ? `Firestore BYOB (${config.projectId})`
                  : isFr
                  ? `BYOB (${config.projectId}) — Non authentifié`
                  : `BYOB (${config.projectId}) — Sign-in required`
                : isFr
                ? 'Mode Démo (en mémoire uniquement)'
                : 'Demo Mode (In-memory only)'}
            </span>
          </div>
        </div>
      </div>

      {/* Private Cloud BYOB & Fingerprint Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-500/15 border border-teal-200 dark:border-teal-500/30 text-teal-600 dark:text-teal-400 flex items-center justify-center p-2 shadow-sm shrink-0 overflow-hidden">
              {firebaseUser?.photoURL ? (
                <img src={firebaseUser.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-xl" />
              ) : (
                <Shield className="w-6 h-6" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                {isFirestoreMode && isByobConfigured
                  ? (isFr ? 'Firebase Privé (BYOB) & Google OAuth' : 'Private Firebase (BYOB) & Google OAuth')
                  : (isFr ? 'Session Démo en Mémoire' : 'In-Memory Demo Session')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isFirestoreMode && isByobConfigured
                  ? isActuallyAuthenticated
                    ? `${isFr ? 'Projet' : 'Project'}: ${config.projectId} · ${firebaseUser.email}`
                    : `${isFr ? 'Projet configuré' : 'Configured project'}: ${config.projectId} · ${
                        isFr ? 'Aucune session Google active' : 'No active Google session'
                      }`
                  : isFr
                  ? 'Aucun stockage local. Déconnectez-vous pour configurer votre projet Firestore.'
                  : 'Zero local storage. Log out to configure and sign in with your own Firestore project.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isFirestoreMode && isByobConfigured ? (
              <>
                {!isActuallyAuthenticated && (
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <span>{isFr ? 'Se connecter avec Google' : 'Sign in with Google'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => forgetByobConfig()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-rose-600 dark:text-rose-300 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isFr ? 'Oublier config BYOB & Déconnexion' : 'Forget BYOB Config & Log Out'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => logout()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isFr ? 'Quitter Démo & Connecter Firestore' : 'Exit Demo & Connect Firestore'}</span>
              </button>
            )}
          </div>
        </div>

        {authError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs space-y-2 leading-relaxed">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span className="whitespace-pre-line break-words flex-1">{authError}</span>
            </div>
            <div className="pl-6">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(authError);
                  showToast(isFr ? 'Erreur copiée' : 'Error copied');
                }}
                className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-200 hover:underline font-semibold cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{isFr ? 'Copier le détail' : 'Copy error'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Encrypted Vault Security: Biometrics + Vault PIN */}
        {isFirestoreMode && isByobConfigured && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                  <Fingerprint className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-semibold text-xs text-slate-900 dark:text-white block">
                    {isFr ? 'Chiffrement Local & Verrouillage du Coffre' : 'Local AES-256-GCM Encryption & Vault Lock'}
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block">
                    {vaultLockMeta?.encryptionMode === 'WEBAUTHN_PRF'
                      ? isFr
                        ? 'Clé matérielle WebAuthn PRF stricte — aucune donnée en clair dans le navigateur.'
                        : 'Strict WebAuthn PRF hardware key — zero plaintext in browser storage.'
                      : vaultLockMeta?.encryptionMode === 'HYBRID'
                      ? isFr
                        ? 'Mode Hybride : Clé matérielle WebAuthn PRF + Code PIN de secours.'
                        : 'Hybrid Mode: WebAuthn PRF hardware key + backup Vault PIN.'
                      : isFr
                      ? 'Clé chiffrée par Code PIN (PBKDF2-SHA256) — vérifiée avant connexion Google.'
                      : 'PIN-wrapped encryption key (PBKDF2-SHA256) — enforced before Google Sign-In.'}
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    {isFr
                      ? 'Les données financières et clés Open Banking restent chiffrées à la fermeture et sont effacées uniquement lors de la déconnexion.'
                      : 'Financial cache and Open Banking keys/mappings stay encrypted on app close and are wiped only on explicit Log Out.'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={biometricLoading || !biometricStatus.isPlatformAvailable}
                  onClick={handleEnrollFingerprint}
                  className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/15 dark:hover:bg-teal-500/25 border border-teal-200 dark:border-teal-500/30 text-teal-700 dark:text-teal-300 font-semibold text-xs transition disabled:opacity-40 whitespace-nowrap cursor-pointer"
                >
                  {vaultLockMeta?.credentialId
                    ? isFr
                      ? 'Ré-enregistrer Empreinte'
                      : 'Re-enroll Fingerprint'
                    : isFr
                    ? 'Activer l’Empreinte'
                    : 'Enroll Fingerprint'}
                </button>

                {vaultLockMeta?.credentialId && vaultLockMeta?.wrappedDekPin && (
                  <button
                    type="button"
                    onClick={handleRemoveFingerprint}
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition whitespace-nowrap cursor-pointer"
                  >
                    {isFr ? 'Retirer' : 'Remove'}
                  </button>
                )}
              </div>
            </div>

            <form
              onSubmit={handleSavePin}
              className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3"
            >
              {vaultLockMeta?.wrappedDekPin && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {vaultLockMeta?.wrappedDekPrf
                      ? isFr
                        ? 'Mot de passe / PIN actuel (requis si PRF non utilisé pour modifier les clés)'
                        : 'Current Vault Passphrase (fallback confirmation if hardware PRF unavailable)'
                      : isFr
                      ? 'Mot de passe / PIN actuel (requis pour modifier le PIN ou activer l’empreinte)'
                      : 'Current Vault Passphrase (required to change PIN or enroll fingerprint)'}
                  </label>
                  <input
                    type="password"
                    required={!vaultLockMeta?.wrappedDekPrf}
                    value={currentVaultPin}
                    onChange={e => setCurrentVaultPin(e.target.value)}
                    placeholder="••••••••"
                    className="w-full sm:max-w-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {vaultLockMeta?.wrappedDekPin
                      ? isFr
                        ? `Nouveau mot de passe (${MIN_VAULT_PASSPHRASE_LENGTH}+ car.)`
                        : `New Vault Passphrase (${MIN_VAULT_PASSPHRASE_LENGTH}+ chars)`
                      : isFr
                      ? `Ajouter un mot de passe de secours (${MIN_VAULT_PASSPHRASE_LENGTH}+ car.)`
                      : `Add Backup Passphrase (${MIN_VAULT_PASSPHRASE_LENGTH}+ chars)`}
                  </label>
                  <input
                    type="password"
                    minLength={MIN_VAULT_PASSPHRASE_LENGTH}
                    value={newVaultPin}
                    onChange={e => setNewVaultPin(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {isFr ? 'Confirmer le mot de passe' : 'Confirm Vault Passphrase'}
                  </label>
                  <input
                    type="password"
                    minLength={MIN_VAULT_PASSPHRASE_LENGTH}
                    value={confirmVaultPin}
                    onChange={e => setConfirmVaultPin(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="submit"
                    disabled={pinSaving || newVaultPin.trim().length < MIN_VAULT_PASSPHRASE_LENGTH}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition disabled:opacity-40 whitespace-nowrap cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>{isFr ? 'Enregistrer' : 'Save Passphrase'}</span>
                  </button>

                  {vaultLockMeta?.wrappedDekPin && vaultLockMeta?.wrappedDekPrf && (
                    <button
                      type="button"
                      onClick={handleRemovePin}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-rose-50 dark:bg-slate-900 dark:hover:bg-rose-500/15 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-500/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 font-semibold text-xs transition whitespace-nowrap cursor-pointer"
                    >
                      {isFr ? 'Retirer' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>

              {newVaultPin.length > 0 && (
                <div className="space-y-1 max-w-md">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">
                      {isFr ? 'Robustesse (PBKDF2 600k) :' : 'Strength (PBKDF2 600k):'}
                    </span>
                    <span
                      className={`font-semibold ${
                        pinStrength.score >= 4
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : pinStrength.score === 3
                          ? 'text-teal-600 dark:text-teal-400'
                          : pinStrength.score === 2
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {pinStrength.label === 'strong'
                        ? isFr
                          ? 'Forte'
                          : 'Strong'
                        : pinStrength.label === 'good'
                        ? isFr
                          ? 'Bonne'
                          : 'Good'
                        : pinStrength.label === 'fair'
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
                          pinStrength.score >= level
                            ? pinStrength.score >= 4
                              ? 'bg-emerald-500'
                              : pinStrength.score === 3
                              ? 'bg-teal-500'
                              : pinStrength.score === 2
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                            : 'bg-slate-200 dark:bg-slate-800'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </form>
          </div>
        )}

        {isFirestoreMode && isByobConfigured && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            <div className="space-y-1 max-w-xl">
              <p className="text-slate-800 dark:text-slate-300 font-medium">
                {isFr
                  ? 'Actions de synchronisation & règles de sécurité Firestore :'
                  : 'Firestore synchronization actions & security rules:'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isFr
                  ? 'Si vous obtenez une erreur « permission-denied », copiez ces règles dans Firebase Console → Firestore Database → Rules puis rechargez le coffre.'
                  : 'If you see a "permission-denied" error, copy these rules to Firebase Console → Firestore Database → Rules and resync.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyRules}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
              >
                {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                <span>{copiedRules ? (isFr ? 'Règles copiées !' : 'Rules Copied!') : (isFr ? 'Copier firestore.rules' : 'Copy firestore.rules')}</span>
              </button>

              <button
                type="button"
                disabled={!isActuallyAuthenticated || syncState.lastSyncStatus === 'SYNCING'}
                onClick={() => syncWithFirebaseNow({ forceFullPull: true, resetCacheBeforePull: true })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 border border-indigo-200 dark:border-indigo-500/40 text-xs font-semibold text-indigo-700 dark:text-indigo-200 transition disabled:opacity-40 cursor-pointer"
              >
                <DownloadCloud className="w-3.5 h-3.5" />
                <span>{isFr ? 'Tout recharger depuis Firestore' : 'Reset Cache & Pull Firestore'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Family Vault Identity Settings */}
      <form
        onSubmit={handleSaveVault}
        className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-4"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h2 className="font-bold text-slate-900 dark:text-white text-base">
            {isFr ? 'Identité du Coffre Familial' : 'Vault Identity'}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isFr ? 'Nom du Coffre Familial' : 'Family Vault Name'}
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              value={familyName}
              onChange={e => setFamilyName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isFr ? 'Utilisateur Actif' : 'Active User'}
            </label>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-800 dark:text-slate-200">
              <span className="font-semibold">{firebaseUser?.displayName || config.currentUserName}</span>
              <span className="font-mono text-teal-600 dark:text-teal-300 font-bold text-[11px]">
                {config.currentUserRole}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end">
          {isAdmin ? (
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition whitespace-nowrap cursor-pointer"
            >
              {isFr ? 'Mettre à jour le coffre' : 'Save Vault Settings'}
            </button>
          ) : (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {isFr ? 'Modification réservée au rôle ADMIN' : 'Editable by Vault ADMIN only'}
            </span>
          )}
        </div>
      </form>

      {/* Bank Accounts & Cards Configuration */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Wallet className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">
                {isFr ? 'Comptes Bancaires & Cartes' : 'Bank Accounts & Cards'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isFr
                  ? 'Ajoutez, modifiez les soldes ou configurez vos comptes courants, cartes différées et livrets d’épargne'
                  : 'Add, edit balances, or configure checking accounts, deferred cards, and savings accounts'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedAccount(null);
              setIsAccountModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition active:scale-95 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isFr ? 'Ajouter un compte' : 'Add Account'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map(acc => {
            const linkedChecking = acc.linkedCheckingAccountId
              ? accounts.find(a => a.id === acc.linkedCheckingAccountId)
              : null;

            return (
              <div
                key={acc.id}
                onClick={() => {
                  setSelectedAccount(acc);
                  setIsAccountModalOpen(true);
                }}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-950/70 dark:hover:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-500/40 cursor-pointer transition flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: `#${(acc.color || 0xff0f766e).toString(16).slice(-6)}` }}
                  >
                    <CategoryIcon name={acc.icon || acc.type} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate group-hover:text-teal-700 dark:group-hover:text-teal-300 transition">
                        {acc.name}
                      </span>
                      {acc.isDefault && (
                        <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-300">
                          · {isFr ? 'Défaut' : 'Default'}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{getAccountTypeLabel(acc.type)}</span>
                      {acc.type === 'DEFERRED_CARD' && (
                        <span>
                          ·{' '}
                          {isFr
                            ? `Arrêté le ${acc.billingCycleClosingDay || 25}`
                            : `Closes day ${acc.billingCycleClosingDay || 25}`}
                          {linkedChecking ? ` (${linkedChecking.name})` : ''}
                        </span>
                      )}
                      {(acc.type === 'SAVINGS' || acc.type === 'INVESTMENT') && acc.targetSavingsGoal ? (
                        <span>
                          · {isFr ? 'Objectif :' : 'Goal:'} {acc.targetSavingsGoal.toLocaleString()} {acc.currency || currency}
                        </span>
                      ) : null}
                      {acc.includeInLiquidForecast && (
                        <span className="text-emerald-600 dark:text-emerald-400/90">
                          · {isFr ? 'Trésorerie' : 'Liquid forecast'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span
                      className={`text-xs font-extrabold tabular-nums block ${
                        acc.currentBalance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {acc.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {acc.currency || currency}
                    </span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-transparent group-hover:bg-teal-50 dark:group-hover:bg-teal-500/20 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-300 transition">
                    <Pencil className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Family Members & RBAC Roles */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">
                {isFr ? 'Membres de la Famille & Rôles RBAC' : 'Family Members & RBAC Roles'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isFr
                  ? 'Configurez les membres, rôles et revenus mensuels pour le partage de frais'
                  : 'Configure members, roles, and monthly incomes for shared expense splitting'}
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setMemberModalState({ isOpen: true, member: null })}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-slate-950 font-bold text-xs shadow-sm transition active:scale-95 self-start sm:self-auto whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isFr ? 'Ajouter un membre' : 'Add Member'}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {members.filter(m => !m.isDeleted).map(m => (
            <div
              key={m.id}
              onClick={() => {
                if (isAdmin) setMemberModalState({ isOpen: true, member: m });
              }}
              className={`p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 transition flex items-center justify-between text-xs ${
                isAdmin
                  ? 'hover:bg-slate-100/80 dark:hover:bg-slate-950 hover:border-teal-400 dark:hover:border-teal-500/40 cursor-pointer group'
                  : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0"
                  style={{ backgroundColor: `#${m.avatarColor.toString(16).slice(-6)}` }}
                >
                  {m.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 dark:text-white block truncate group-hover:text-teal-700 dark:group-hover:text-teal-300 transition">
                    {m.name}
                  </span>
                  <span className="text-[11px] text-slate-500 block truncate">
                    {m.email || (isFr ? 'Membre local' : 'Local member')}
                    {(Number(m.monthlyIncome) || 0) > 0 && (
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {' '}· {(Number(m.monthlyIncome) || 0).toLocaleString()} {currency}/{isFr ? 'mois' : 'mo'}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[11px] font-bold text-teal-600 dark:text-teal-300">
                  {m.role}
                </span>
                {isAdmin && (
                  <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-transparent group-hover:bg-teal-50 dark:group-hover:bg-teal-500/20 text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-300 transition">
                    <Pencil className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Demo Mode Reset (Only visible in Demo Mode) */}
      {sessionMode === 'DEMO' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-xl space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            <h2 className="font-bold text-slate-900 dark:text-white text-base">
              {isFr ? 'Démonstration & Langue' : 'Demo Mode Presets'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isFr
              ? 'Réinitialisez les données en mémoire vive en français ou en anglais. Aucune donnée n’est conservée localement après déconnexion.'
              : 'Reset the in-memory dataset in French or English. No data is kept locally after logging out.'}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => {
                setLanguage('fr');
                resetToMockData('fr');
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Charger Démo Famille Martin (Français)</span>
            </button>

            <button
              onClick={() => {
                setLanguage('en');
                resetToMockData('en');
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>Load Smith Family Demo (English)</span>
            </button>
          </div>
        </div>
      )}

      {/* Share QR Code Modal */}
      <ShareVaultQrModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />

      {/* Add / Edit Account Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        account={selectedAccount}
        onClose={() => {
          setIsAccountModalOpen(false);
          setSelectedAccount(null);
        }}
      />

      {/* Add / Edit Member Modal */}
      <MemberManagementModal
        isOpen={memberModalState.isOpen}
        member={memberModalState.member}
        onClose={() => setMemberModalState({ isOpen: false, member: null })}
      />
    </div>
  );
};
