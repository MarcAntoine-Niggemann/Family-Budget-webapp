# Family Budget Vault — Repository Technical Documentation

Welcome to the internal technical documentation for **Family Budget Vault**, a privacy-focused, multi-user Android personal finance application built with Kotlin, Jetpack Compose, Room SQLite, and Firebase Firestore.

This directory contains technical documentation designed for developers, system architects, and users who want a deep understanding of the application's underlying mechanics.

---

## 📚 Documentation Index

| Topic | Document File | Description |
| :--- | :--- | :--- |
| **Data Model & Schema** | [`docs/DATA_MODEL.md`](DATA_MODEL.md) | Exhaustive specification of all 10 local Room SQLite tables, fields, data types, primary keys, indices, and domain entities. |
| **Sync Algorithm** | [`docs/SYNC_ALGORITHM.md`](SYNC_ALGORITHM.md) | In-depth breakdown of the **Offline-First Transactional Outbox Pattern**, bidirectional sync pipeline, conflict resolution logic, and watermark tracking. |
| **Authentication & Security** | [`docs/AUTH_AND_SECURITY.md`](AUTH_AND_SECURITY.md) | Technical guide on Jetpack Credential Manager Google Sign-In, dynamic multi-tenant Firebase credentials, app SHA-1 fingerprint verification, biometric screen lock, and zero-trust RBAC Firestore Security Rules. |
| **Bank Import & Reconciliation** | [`docs/BANK_IMPORT_AND_RECONCILIATION.md`](BANK_IMPORT_AND_RECONCILIATION.md) | Technical guide on CSV statement parsing, header auto-discovery, priority-based auto-categorization matching, and candidate confidence scoring for manual vs bank transaction reconciliation. |
| **Firebase Setup Guide** | [`docs/FIREBASE_SETUP.md`](FIREBASE_SETUP.md) | Step-by-step instructions for provisioning a Google Cloud / Firebase project, configuring Google Authentication, registering the app, and deploying Role-Based Access Control (RBAC) Firestore Security Rules. |
| **Reports & Graphs Specification** | [`docs/REPORTS_AND_GRAPHS.md`](REPORTS_AND_GRAPHS.md) | Functional and mathematical specification of all financial reports (Monthly, Yearly) and the Cash Flow Forecasting algorithm & interactive Compose Canvas chart. |

---

## 🏗️ Architecture Overview

```
                          ┌──────────────────────────────────────────────┐
                          │         Jetpack Compose UI Layer             │
                          │ (Dashboard, Reports, Budget Planner, etc.)   │
                          └──────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
                          ┌──────────────────────────────────────────────┐
                          │             BudgetViewModel                  │
                          │     (Exposes Flow / StateFlow to UI)         │
                          └──────────────────────┬───────────────────────┘
                                                 │
                                                 ▼
                          ┌──────────────────────────────────────────────┐
                          │            BudgetRepository                  │
                          │   (Business Logic, Outbox Mutations, Calc)   │
                          └──────────────┬────────────────┬──────────────┘
                                         │                │
                   ┌─────────────────────┘                └─────────────────────┐
                   ▼                                                            ▼
┌─────────────────────────────────────┐                      ┌─────────────────────────────────────┐
│          AppDatabase (Room)         │                      │        FirebaseSyncService          │
│ - transactions    - expected_spends │                      │  (Transactional Outbox Sync Client) │
│ - categories      - account_balance │                      └──────────────────┬──────────────────┘
│ - category_budgets- family_members  │                                         │ (Batch Commit &
│ - rules           - sync_outbox     │                                         │  Delta Pulls)
│ - firebase_config - sync_state      │                                         ▼
└─────────────────────────────────────┘                      ┌─────────────────────────────────────┐
                                                             │     Firebase Firestore Cloud DB     │
                                                             └─────────────────────────────────────┘
```

### Key Architectural Principles
1. **Offline-First Persistence**: Room database is the single source of truth for the UI. The app remains 100% operational without an internet connection.
2. **Transactional Outbox**: All local mutations enqueue a payload in `sync_outbox`. Background sync pushes these entries in batches to Firestore.
3. **Server-Authority Delta Pulls**: Remote changes with `updatedAt > lastPullTimestamp` are pulled into Room, skipping any locally "dirty" entities to prevent overwriting pending user edits.
4. **Declarative M3 UI**: UI is built strictly with Jetpack Compose using Material Design 3 guidelines and responsive custom Canvas graphics.
