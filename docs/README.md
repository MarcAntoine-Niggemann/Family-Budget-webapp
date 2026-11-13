# Family Budget Vault — Repository Technical Documentation

Welcome to the internal technical documentation for **Budget Family (Family Budget Vault)**, a privacy-focused, multi-account family finance application featuring a React/TypeScript Web App (with BYOB Cloud Firestore, Google OAuth, WebAuthn fingerprint unlock, local delta caching, and in-memory Demo Mode) alongside native Android Kotlin/Compose sources in the repository.

This directory contains technical documentation designed for developers, system architects, and users configuring their private Cloud Firestore backend.

---

## 📚 Documentation Index

| Topic | Document File | Description |
| :--- | :--- | :--- |
| **Firebase & OAuth Setup Guide** | [`docs/FIREBASE_SETUP.md`](FIREBASE_SETUP.md) | Step-by-step instructions for creating a Firebase / Cloud Firestore project, enabling Google Sign-In, configuring OAuth Authorized Domains & Consent Screen, publishing `firestore.rules`, and using fingerprint unlock. |
| **Authentication & Security** | [`docs/AUTH_AND_SECURITY.md`](AUTH_AND_SECURITY.md) | Technical specification of the mandatory login gate, Google OAuth popup/redirect flow, WebAuthn FIDO2 biometric unlock, local delta cache & logout erasure, and zero-trust RBAC `firestore.rules`. |
| **Sync Algorithm** | [`docs/SYNC_ALGORITHM.md`](SYNC_ALGORITHM.md) | In-depth breakdown of the **Transactional Outbox Pattern**, bidirectional batch push, high-watermark delta pulls (`updatedAt > lastPullTimestamp`), and conflict resolution logic. |
| **Data Model & Schema** | [`docs/DATA_MODEL.md`](DATA_MODEL.md) | Exhaustive specification of all financial collections/tables, fields, data types, keys, and domain entities. |
| **Bank Import & Reconciliation** | [`docs/BANK_IMPORT_AND_RECONCILIATION.md`](BANK_IMPORT_AND_RECONCILIATION.md) | Technical guide on CSV statement parsing, header auto-discovery, priority-based auto-categorization matching, and candidate confidence scoring for manual vs. bank transaction reconciliation. |
| **Reports & Graphs Specification** | [`docs/REPORTS_AND_GRAPHS.md`](REPORTS_AND_GRAPHS.md) | Functional and mathematical specification of financial reports (Monthly, Yearly) and the Cash Flow Forecasting algorithm. |

---

## 🏗️ Web App Data & Auth Architecture

```
                     ┌────────────────────────────────────┐
                     │        Mandatory Login Gate        │
                     │  (Demo In-Memory OR BYOB Firestore)│
                     └─────────────────┬──────────────────┘
                                       │
          ┌────────────────────────────┴────────────────────────────┐
          ▼                                                         ▼
┌──────────────────────┐                               ┌─────────────────────────┐
│    Demo Mode         │                               │   BYOB Firestore Mode   │
│ (100% In-Memory;     │                               │ 1. Google OAuth /       │
│  0 localStorage)     │                               │    WebAuthn Fingerprint │
└──────────────────────┘                               │ 2. Local Delta Cache    │
                                                       │    (fbv_* keys, erased  │
                                                       │     on Log Out)         │
                                                       │ 3. Outbox Push + Delta  │
                                                       │    Pull <-> Firestore   │
                                                       └─────────────────────────┘
```

### Key Architectural Principles
1. **Strict Auth Gate**: No financial UI, navigation, or cached data is exposed prior to signing into BYOB Firestore or explicitly launching Demo Mode.
2. **Local Delta Cache (BYOB Only)**: While signed in to BYOB Firestore, `localStorage` caches collections and `lastPullTimestamp` so reconnecting only pulls incremental changes. Logging out erases all cached financial data while preserving only `fbv_byob_config` and `fbv_biometric_cred_id`.
3. **Transactional Outbox & Delta Pulls**: Local mutations enqueue outbox operations pushed in batches to Firestore, while remote changes (`updatedAt > lastPullTimestamp`) merge cleanly without overwriting dirty local edits.
