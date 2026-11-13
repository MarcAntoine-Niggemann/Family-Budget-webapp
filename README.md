# Budget Family (Family Budget Vault) — Web Application

Welcome to **Family Budget Vault**, a privacy-focused, multi-account family personal finance web application built with React 18, TypeScript, Tailwind CSS, and offline-first persistence.

Originally ported from the Android native Kotlin/Compose application `Budgetappandroid`, this web version preserves all the core architectural features, data schemas, mathematical models, and workflows.

---

## 🌟 Core Features Ported

1. **Multi-Account & Multi-Card Management**:
   - Compte Courant (Liquid Checking Account)
   - Carte à Débit Différé (Deferred Credit Card with closing cutoff day, billing cycle periods, and lump-sum settlements)
   - Livret A / Épargne (High-yield savings accounts with target savings goals)
   - Real-time Net Worth & Liquid Balance calculation

2. **Cash Flow Forecasting Engine**:
   - Day-by-day cash flow simulation across 30, 60, or 90 days
   - Scheduled recurring debits (Rent on 1st, Bills on 5th, etc.) and paydays (Salaries on 28th)
   - Prorated daily discretionary spend
   - **Safe to Spend Now** real-time calculation
   - Automatic overdraft risk warnings & low buffer alert banners

3. **Budget Planner & Envelopes**:
   - Monthly and annual envelope budgets by category
   - Sub-budget lines with specific execution days and recurrence frequency
   - Visual progress bars, percentage indicators, and difference remaining

4. **Financial Reports & Analytics**:
   - Monthly Overview: Total budget, actual spent, income, net savings, and savings rate
   - Budget Burn-Down Curve: Daily comparison between theoretical linear burn and actual cumulative spend
   - Category spend distribution
   - Spending breakdown by Family Member with percentage share
   - 12-Month annual trend matrix

5. **Bank Statement Import & Smart Categorization**:
   - CSV bank statement parser with automatic delimiter detection (`;`, `,`, `\t`)
   - Header column auto-discovery (`Date`, `Libellé/Description`, `Montant/Débit/Crédit`)
   - Rule-based priority auto-categorization engine (`CONTAINS`, `STARTS_WITH`, `EXACT`, `REGEX`)
   - Real-time rule testing simulator

6. **Automated Bank Reconciliation**:
   - Matches candidate pairs between on-the-go manual mobile declarations and official bank statements
   - Confidence scoring based on exact amount match, date proximity (within 5 days), and merchant label similarity
   - 1-click reconcile and merge to prevent double-counting in budget reports

7. **Transaction Operations**:
   - Quick expense / income declaration
   - Internal transfers between accounts (checking to savings, card settlements)
   - Transaction splitting (splitting 1 bulk purchase into multiple budget categories)
   - Exclude from totals toggle

8. **Family Vault, BYOB Firestore & Security**:
   - Mandatory login gate before displaying any data: choose **My Firestore (BYOB)** with Google OAuth or **Demo Mode** (100% in-memory)
   - Direct **Fingerprint / Face ID (WebAuthn)** unlock when BYOB Firestore is already configured
   - Local delta cache (`lastPullTimestamp`) for BYOB sessions to avoid full Firestore reloads on reconnect, with full local data erasure on Log Out (retaining only the BYOB config and biometric credential ID)
   - Family members list with dynamic RBAC roles (`ADMIN`, `EDITOR`, `MEMBER`, `VIEWER`) via static `firestore.rules`
   - Bilingual support: French (Français) & English

See [`docs/FIREBASE_SETUP.md`](docs/FIREBASE_SETUP.md) for full BYOB Firestore and Google OAuth setup instructions.

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```
