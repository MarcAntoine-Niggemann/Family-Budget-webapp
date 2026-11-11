# Open Banking (open-banking.io) Integration & Hybrid Bank Sync

Deliver automated bank account synchronization via [open-banking.io](https://open-banking.io/en) while keeping the existing manual CSV/bank statement import workflow fully intact. Users can choose manual import, automated live bank sync, or a hybrid combination with intelligent deduplication and rule-based categorization.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed by the user and shape the architecture and user experience:

- **Confirmed Decision 1 (Connection & Credentials)**:
  - Users enter their personal `open-banking.io` API credentials (API Key and Secret / Client Token) in a dedicated **Open Banking** configuration section within Settings.
  - Includes a built-in Connection Tester and Sandbox/Production environment toggle.
- **Confirmed Decision 2 (Sync Frequency & Triggers)**:
  - **On-Demand Sync**: A prominent "Sync Now" button in both the Import Screen and Accounts Dashboard.
  - **Optional Background Auto-Sync**: A configurable toggle in Settings allowing automatic background/launch refresh so balances and transactions stay up to date without manual action.
- **Confirmed Decision 3 (Data Merging & Deduplication)**:
  - **Automatic Account Matching**: Matches bank accounts by IBAN, account number, or name to existing local accounts, with the option to link or create new accounts.
  - **Deduplication Engine**: Uses the provider's `remoteId` (bank transaction ID) to prevent re-importing transactions, and applies fuzzy matching (matching date ±3 days, exact amount, and account) to match against existing manual entries.
  - **Automatic Categorization**: All incoming synced bank transactions are processed through the existing `CategorizationEngine` rules to immediately assign categories, budgets, and clean titles.
- **Confirmed Decision 4 (Preservation of Manual Imports)**:
  - The existing CSV, TSV, and bank statement parser is retained 100% without alteration, giving users complete freedom to use manual files, live sync, or both.

---

### 1. Overview & Core Concept

- **What It Does**:
  Provides a unified bank import experience where users can either drag/upload CSV files manually or connect their financial institutions through `open-banking.io` for automatic one-tap or background synchronization of accounts, balances, and transactions.
- **Target Audience / Persona**:
  - Users who want real-time financial tracking without the friction of logging into bank portals to download monthly CSV statements.
  - Privacy-minded users who still want to use offline/manual CSV import or choose which specific accounts are connected.
- **Key Value**:
  Eliminates repetitive manual statement downloading while maintaining privacy and control. Users get fresh balances and transactions with zero duplicate records and instant rule-based categorization.

---

### 2. User Experience & Visual Design

#### Navigation & Screen Integration

1. **Import Screen Tabs (`CsvImportScreen.kt`)**:
   - Tab 1: **Manual File Import** (Existing complete CSV/statement parser, file picker, and column mapping).
   - Tab 2: **Live Bank Sync (open-banking.io)**:
     - Bank connection card showing linked institutions, authorized accounts, and last sync timestamp.
     - Single-tap **"Sync All Accounts Now"** button with a progress spinner.
     - List of connected accounts with live balances and quick status badges (`Connected`, `Syncing`, `Needs Re-auth`).
     - Option to **"Connect New Bank"** or configure credentials.

2. **Open Banking Settings Dialog / Screen**:
   - Secure input fields for `API Key` and `API Secret`.
   - Environment Selector: `Sandbox (Test Bank / Mock Feed)` vs `Live Production (api.open-banking.io)`.
   - "Test Connection & Fetch Institutions" action button with instant status feedback.
   - Background Auto-Sync switch: "Refresh bank feeds on app launch".
   - Account Mapping table: Maps each remote bank account (e.g. `FR76... - BNP Paribas Checking`) to an internal app account (`Compte Courant`).

3. **Dashboard Quick Sync & Feedback**:
   - Accounts summary card displays an indicator showing last bank sync time (e.g., `Live sync: 12 min ago`).
   - Pull-to-refresh or sync action triggers both local recalculation and bank sync, displaying a snackbar summary (e.g., `Synced 2 accounts: 8 new transactions categorized`).

#### Visual Layout & State Representation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🏦 Import & Bank Sync                                                      │
├──────────────────────────────────────┬──────────────────────────────────────┤
│        [📁 Manual CSV Import]        │       [⚡ Live Bank Sync (Active)]    │
├──────────────────────────────────────┴──────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 🔗 open-banking.io Connected                         ● Live Status: OK │ │
│ │ Last updated: Today at 09:42                      [ ↻ Sync All Accounts]│ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Connected Accounts (2)                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 🏦 BNP Paribas — Checking (FR76 ... 8921)                    3,420.50 € │ │
│ │    Mapped to: Compte Courant                       [12 new transactions]│ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │ 💳 Visa Premier Card (Deferred)                                -540.20 € │ │
│ │    Mapped to: Carte Visa (Débit Différé)            [4 new transactions]│ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ [ + Connect Another Bank Account ]              [ ⚙ Open Banking Settings ] │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct open-banking.io API Client with Fallback Sandbox Engine**:
  - *Chosen Approach*: Implement an HTTP client targeting the open-banking.io REST specification, coupled with a built-in Sandbox Simulator mode when sandbox keys or demo mode are selected.
  - *Why*: Allows immediate end-to-end testing and verification even when developers or users are configuring initial API keys or working in sandbox environments without live European bank credentials.
- **Decision 2: Deduplication via `remoteId` + Composite Hash Matching**:
  - *Chosen Approach*: Each synced transaction stores its provider `transactionId` in `TransactionEntity.remoteId`. When matching against manual entries, a composite key `(accountId, date ± 3 days, abs(amount))` detects duplicates and prompts or auto-reconciles without duplicating spend.
  - *Why*: Prevents double-counting when a user has manually entered a cash/card receipt that later appears on the bank feed.
- **Decision 3: Non-Intrusive Integration**:
  - *Chosen Approach*: Open Banking is an opt-in enhancement. If no API key is provided, the manual CSV import remains the prominent default, and zero external network calls are made.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### System Architecture & Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             UI Layer (Compose)                              │
│                                                                             │
│  CsvImportScreen (Tabs)  │  OpenBankingConfigDialog  │  Dashboard Sync Bar  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BudgetViewModel & State                             │
│                                                                             │
│  syncOpenBankingAccounts()  │  testOpenBankingConnection()  │  saveConfig() │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│     OpenBankingSyncManager & Client  │  │        CsvBankStatementParser     │
│                                      │  │                                   │
│ • GET /connections                   │  │ (Existing 100% manual parser      │
│ • GET /accounts                      │  │  retained for CSV, TSV, OFX)      │
│ • GET /accounts/{id}/transactions    │  │                                   │
└──────────────────┬───────────────────┘  └─────────────────┬─────────────────┘
                   │                                        │
                   ▼                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              Deduplication & Categorization Pipeline                        │
│                                                                             │
│ 1. Filter out existing remoteId transactions                                │
│ 2. Fuzzy-match against pending manual entries (date ±3d, amount, account)   │
│ 3. Run CategorizationEngine to assign category, budget, and clean title     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Room Database (Local Persistent Store)                    │
│                                                                             │
│ • AccountEntity (updated balance & openBankingAccountId link)               │
│ • TransactionEntity (source = SOURCE_OPEN_BANKING, remoteId, status)        │
│ • OpenBankingConfig (encrypted SharedPreferences / SecureConfigManager)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Data Model & Storage Additions

1. **`AccountEntity` Additions**:
   - `openBankingAccountId: String?`: Remote account ID from open-banking.io.
   - `openBankingInstitution: String?`: Bank name (e.g., "BNP Paribas", "Crédit Agricole").
   - `openBankingIban: String?`: Masked IBAN for easy account matching.
   - `lastOpenBankingSync: Long?`: Timestamp of the last successful sync.

2. **`TransactionEntity` Support**:
   - `SOURCE_OPEN_BANKING = "OPEN_BANKING"` constant.
   - `remoteId`: Stores the unique open-banking.io transaction identifier for idempotent deduplication.

3. **Secure Config Storage (`OpenBankingConfigManager`)**:
   - Securely stores `apiKey`, `apiSecret`, `environment` (`SANDBOX` vs `PRODUCTION`), `autoSyncOnLaunch`, and account mappings in encrypted app preferences.

4. **Network & Service Layer**:
   - `OpenBankingApiClient`: Handles HTTPS authentication and requests to `https://api.open-banking.io` or `https://api.sandbox.open-banking.io`.
   - `OpenBankingSyncManager`: Coordinates fetching accounts, balances, paging through transactions, deduplicating, running `CategorizationEngine`, and committing changes in a single atomic Room transaction.

---

### Implementation Phases

1. **Phase 1: Config & Network Layer**:
   - Implement `OpenBankingConfigManager` to securely store API keys and settings.
   - Implement `OpenBankingApiClient` and data models (`OpenBankingAccountDto`, `OpenBankingTransactionDto`).
   - Add sandbox mock simulator for test credentials and demo mode.
2. **Phase 2: Sync & Deduplication Engine**:
   - Implement `OpenBankingSyncManager` integrating account matching, transaction deduplication, and `CategorizationEngine` rule execution.
   - Update `BudgetRepository` and `AccountEntity` to support Open Banking metadata and balance updates.
3. **Phase 3: UI Implementation**:
   - Add the "Live Bank Sync" tab and status cards in `CsvImportScreen.kt`.
   - Create `OpenBankingConfigDialog.kt` for entering API keys, testing connection, and configuring auto-sync.
   - Add sync action and status indicators in the Dashboard and Accounts view.
4. **Phase 4: Verification & Polish**:
   - Verify compilation with `compile_applet`.
   - Test manual CSV import and Open Banking sync side-by-side to ensure seamless interoperability.
