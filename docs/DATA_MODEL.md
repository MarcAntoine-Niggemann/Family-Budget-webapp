# Data Model Specification

This document provides a comprehensive technical reference for the local SQLite database schema managed via **Room ORM** in `com.example.data.local.AppDatabase`.

---

## 🗄️ Database Schema & Entities

The database version is **`15`** and contains **10 entities** (with `expected_spends` unified into `category_budgets`). Categories serve as generic domain envelopes (e.g. Real Estate, Vehicles, Freelance), while the cash flow direction (Expense vs Income) is configured on specific `category_budgets` lines and `transactions`. Below is the detailed breakdown of each table.

---

### 1. `transactions`
Stores all bank imports and manually declared expense/income entries.

* **Table Name**: `transactions`
* **Indices**:
  * `[isDeleted, date]` — Fast queries for active transactions within date ranges.
  * `[isDeleted, categoryId, date]` — Fast category-based spending aggregation.
  * `[updatedAt]` — Incremental sync delta querying.

| Column Name | Kotlin Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `Long` | Primary Key, Auto-Gen | Unique local transaction ID. |
| `remoteId` | `String?` | Nullable | Firestore document ID if synced. |
| `title` | `String` | Required | Transaction description/merchant name. |
| `originalBankLabel` | `String?` | Nullable | Raw label from imported CSV bank statement. |
| `amount` | `Double` | Required | Transaction amount (**stored as negative for expenses**, positive for income). |
| `isExpense` | `Boolean` | Default: `true` | `true` if expense, `false` if income. |
| `categoryId` | `Long` | Required | Foreign key to `categories.id`. |
| `categoryName` | `String` | Required | Denormalized category name for fast rendering. |
| `categoryColor` | `Long` | Required | ARGB Long color code. |
| `categoryIcon` | `String` | Required | Material icon key string. |
| `budgetId` | `Long` | Required | Denormalized target budget (sub-category) ID. |
| `budgetTitle` | `String` | Default: `"General"` | Denormalized budget (sub-category) name. |
| `date` | `Long` | Default: `System.currentTimeMillis()` | Transaction timestamp in milliseconds. |
| `familyMemberId` | `String` | Default: `"primary"` | ID of the family member who made the transaction. |
| `familyMemberName` | `String` | Default: `"Primary User"` | Display name of the family member. |
| `source` | `String` | Default: `"MANUAL"` | Origin: `"MANUAL"` or `"BANK_IMPORT"`. |
| `status` | `String` | Default: `"PENDING"` | Lifecycle status: `"PENDING"`, `"RECONCILED"`, or `"VERIFIED"`. |
| `reconciledWithId` | `Long?` | Nullable | Local ID of matching manual or bank transaction. |
| `paymentMethod` | `String` | Default: `"CARD"` | `"CARD"`, `"TRANSFER"`, `"CASH"`, `"DIRECT_DEBIT"`. |
| `notes` | `String` | Default: `""` | User annotations or memo. |
| `updatedAt` | `Long` | Timestamp | Timestamp of last modification. |
| `isDeleted` | `Boolean` | Default: `false` | Soft-delete flag for sync tombstones. |

---

### 2. `categories`
Defines generic spending/income domain envelopes (e.g., "Housing & Property", "Vehicles", "Employment & Career", "Investments", "Health"). Categories are intentionally generic and can contain both Expense budget lines and Income target lines.

* **Table Name**: `categories`
* **Indices**:
  * `[isDeleted]`
  * `[updatedAt]`

| Column Name | Kotlin Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `Long` | Primary Key, Auto-Gen | Unique category ID. |
| `name` | `String` | Required | Category display name (e.g., "Housing & Property"). |
| `icon` | `String` | Default: `"category"` | Icon name string. |
| `color` | `Long` | Default: `0xFF6366F1` | ARGB Long color code. |
| `updatedAt` | `Long` | Timestamp | Timestamp of last modification. |
| `isDeleted` | `Boolean` | Default: `false` | Soft-delete flag. |

---

### 3. `category_budgets`
Configures envelope budget lines and recurring scheduled debits/income targets per category with frequency, specific execution day, active date range windows, and cash flow direction (`isExpense`).

* **Table Name**: `category_budgets`
* **Indices**:
  * `[isDeleted, categoryId]`
  * `[isDeleted, year, month]`
  * `[updatedAt]`

| Column Name | Kotlin Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `Long` | Primary Key, Auto-Gen | Unique budget line ID. |
| `categoryId` | `Long` | Required | Target category ID. |
| `categoryName` | `String` | Required | Category display name. |
| `amount` | `Double` | Required | Budgeted or expected debit/credit amount (€). |
| `frequency` | `String` | Default: `"MONTHLY"` | Recurrence frequency: `"MONTHLY"`, `"YEARLY"`, or `"ONCE"`. |
| `year` | `Int` | Default: `2026` | Fallback / target year. |
| `month` | `Int?` | Nullable (`1..12`) | Target month (`1..12`), or `null` if applies to full year. |
| `day` | `Int?` | Nullable (`1..31`) | Specific execution day (`1..31`). If set, treated as scheduled debit/credit in forecast; if `null`, remaining budget is spread evenly across month. |
| `startYear` | `Int` | Default: `2026` | Effective start year. |
| `startMonth` | `Int?` | Nullable (`1..12`) | Effective start month (`1..12`). |
| `endYear` | `Int?` | Nullable | Optional expiry year. |
| `endMonth` | `Int?` | Nullable (`1..12`) | Optional expiry month. |
| `title` | `String` | Default: `""` | Budget description / bill label (e.g., "Rent", "Salary Jean", "Netflix"). |
| `notes` | `String?` | Nullable | Additional user notes. |
| `isExpense` | `Boolean` | Default: `true` | `true` for expense budget/debit, `false` for income target/credit. |
| `isActive` | `Boolean` | Default: `true` | Active status toggle. |
| `updatedAt` | `Long` | Timestamp | Timestamp of last modification. |
| `isDeleted` | `Boolean` | Default: `false` | Soft-delete flag. |

---

### 4. `expected_spends` (Unified into `category_budgets`)
*Note: All scheduled recurring debits, subscriptions, and expected spends are now managed through `category_budgets` with `frequency` and `day` fields. This table is preserved for legacy migration compatibility.*

---

### 5. `account_balance`
Stores current bank balance state.

* **Table Name**: `account_balance`

| Column Name | Kotlin Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | Primary Key (`"primary_account"`) | Account singleton key. |
| `accountName` | `String` | Default: `"Main Family Account"` | Checking account label. |
| `currentBalance` | `Double` | Default: `3200.0` | Real-time liquid bank balance (€). |
| `lastManualSyncTimestamp` | `Long` | Timestamp | Timestamp of last bank balance update. |
| `updatedAt` | `Long` | Timestamp | Timestamp of last balance modification. |

---

### 6. `family_members`
Stores family members and their assigned RBAC permissions.

* **Table Name**: `family_members`

| Column Name | Kotlin Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | Primary Key | Member ID (email prefix or user slug). |
| `name` | `String` | Required | Full display name. |
| `email` | `String` | Required | Email address (used for Auth & Security Rules). |
| `role` | `String` | Default: `"MEMBER"` | `"ADMIN"`, `"EDITOR"`, `"VIEWER"`, `"CHILD"`, `"MEMBER"`. |
| `avatarColor` | `Long` | Default: `0xFF0F766E` | Color used for member UI avatars. |
| `firestoreSynced` | `Boolean` | Default: `true` | Role synchronization status. |
| `customPermissions` | `String?` | Nullable | Optional custom permissions JSON string. |

---

### 7. `categorization_rules`
Automated auto-categorization engine rules applied to imported CSV bank transactions.

* **Table Name**: `categorization_rules`
* **Indices**:
  * `[isDeleted, isActive]`
  * `[updatedAt]`

| Column Name | Kotlin Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `Long` | Primary Key, Auto-Gen | Rule ID. |
| `pattern` | `String` | Required | Text keyword or regex pattern to match against bank label. |
| `matchType` | `String` | Default: `"CONTAINS"` | `"CONTAINS"`, `"STARTS_WITH"`, `"EXACT"`, `"REGEX"`. |
| `targetCategoryId` | `Long` | Required | Assigned category ID. |
| `targetCategoryName` | `String` | Required | Assigned category display name. |
| `targetBudgetId` | `Long` | Required | Target budget (sub-category) ID to match. |
| `targetBudgetTitle` | `String` | Default: `"General"` | Target budget (sub-category) display name. |
| `priority` | `Int` | Default: `10` | Rule evaluation order (higher priority rules evaluated first). |
| `isActive` | `Boolean` | Default: `true` | Enable/disable rule. |
| `updatedAt` | `Long` | Timestamp | Last update timestamp. |
| `isDeleted` | `Boolean` | Default: `false` | Soft-delete flag. |

---

### 8. `sync_outbox`
The core **Transactional Outbox Queue** tracking uncommitted local changes awaiting cloud push.

* **Table Name**: `sync_outbox`
* **Indices**:
  * `[entityType, entityId]`
  * `[createdAt]`

| Column Name | Kotlin Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `outboxId` | `Long` | Primary Key, Auto-Gen | Outbox entry sequence ID. |
| `entityType` | `String` | Required | `"TRANSACTION"`, `"CATEGORY"`, `"BUDGET"`, `"RULE"`, `"SPEND"`, `"BALANCE"`. |
| `entityId` | `String` | Required | Entity string key (e.g. `"tx_42"`, `"cat_3"`, `"budget_10"`). |
| `operation` | `String` | Required | `"UPSERT"` or `"DELETE"`. |
| `payloadJson` | `String` | Default: `""` | Optional serialized JSON string for debugging. |
| `createdAt` | `Long` | Timestamp | Enqueue timestamp. |

---

### 9. `sync_state`
Tracks sync watermarks, status messages, and outbox depth.

* **Table Name**: `sync_state`

| Column Name | Kotlin Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `syncKey` | `String` | Primary Key (`"primary_sync"`) | State singleton key. |
| `lastPullTimestamp` | `Long` | Default: `0L` | High-watermark timestamp for incremental remote pulls. |
| `lastPushTimestamp` | `Long` | Default: `0L` | Timestamp of last successful outbox push. |
| `lastSyncStatus` | `String` | Default: `"IDLE"` | `"IDLE"`, `"SYNCING"`, `"SUCCESS"`, `"ERROR"`. |
| `lastSyncMessage` | `String?` | Nullable | Detailed human-readable sync status log message. |
| `pendingOutboxCount` | `Int` | Default: `0` | Number of uncommitted outbox entries. |

---

### 10. `firebase_config`
Stores runtime Firebase SDK credentials, Google Authentication tokens, and Security Lock configuration.

* **Table Name**: `firebase_config`

| Column Name | Kotlin Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | Primary Key (`"active_config"`) | Config singleton key. |
| `apiKey` | `String` | Default: `""` | Firebase Web/Android API Key. |
| `applicationId` | `String` | Default: `""` | Firebase Application ID (`1:xxxx:android:xxxx`). |
| `projectId` | `String` | Default: `""` | GCP/Firebase Project ID. |
| `projectNumber` | `String` | Default: `""` | Cloud Project Number. |
| `webClientId` | `String` | Default: `""` | Google Auth Web Client ID. |
| `familyName` | `String` | Default: `"Family Budget Vault"` | Family Vault display title. |
| `firebaseInstanceUrl` | `String` | Default: `""` | Custom Firebase database endpoint URL. |
| `authToken` | `String` | Default: `""` | ID Token / OAuth Token. |
| `currentUserEmail` | `String` | Default: `""` | Email of logged in Google user. |
| `currentUserName` | `String` | Default: `""` | Display name of logged in Google user. |
| `currentUserRole` | `String` | Default: `"ADMIN"` | Active RBAC role (`"ADMIN"`, `"EDITOR"`, `"VIEWER"`). |
| `isGoogleAuthenticated` | `Boolean` | Default: `false` | Google Auth state. |
| `isFamilyCreated` | `Boolean` | Default: `false` | Whether Vault is created in cloud. |
| `isConfigured` | `Boolean` | Default: `false` | Firebase credentials state. |
| `isEnabled` | `Boolean` | Default: `false` | Firebase sync state. |
| `storageSecurityRulesConfigured` | `Boolean` | Default: `false` | Whether custom security rules are active. |
| `isBiometricLockEnabled` | `Boolean` | Default: `false` | Biometric fingerprint / PIN security lock toggle. |
| `lastSyncTimestamp` | `Long` | Default: `0L` | Timestamp of last sync. |
| `syncStatusMessage` | `String` | Default: `"..."` | Detailed status message. |
| `lastTestStatus` | `String` | Default: `""` | Diagnostics output. |
| `lastTestSuccess` | `Boolean` | Default: `false` | Result of last test. |
