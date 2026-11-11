# Synchronization Algorithm & Architecture

This document details the bidirectional synchronization engine implemented in `FirebaseSyncService.kt` and `BudgetRepository.kt`.

---

## 🎯 Architectural Goals
1. **Zero-Latency Offline Writes**: Users can create, edit, or delete transactions, categories, and budgets instantly without network calls.
2. **Transactional Integrity**: All local mutations enqueue a persistent outbox entry in Room inside the same database transaction.
3. **Optimistic Outbox Push**: Local updates are pushed in chunks to Cloud Firestore using atomic write batches.
4. **Server-Authority Delta Pulls**: Remote changes are pulled using high-watermark timestamps (`updatedAt > lastPullTimestamp`).
5. **Conflict Avoidance**: Local pending outbox edits take precedence over incoming remote changes for the same entity ID.

---

## 🔄 Bidirectional Sync Flow Diagram

```
 [ Local App Mutation ]
           │
           ▼
┌──────────────────────────────────────┐
│  Room DB Transaction:               │
│  1. Insert/Update entity in Room    │
│  2. Insert entry into 'sync_outbox'  │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│               FirebaseSyncService.executeOutboxSync()  │
└──────────┬─────────────────────────────────┬───────────┘
           │                                 │
           ▼                                 ▼
 ┌──────────────────────┐         ┌──────────────────────┐
 │ STEP 1: PUSH OUTBOX  │         │ STEP 2: PULL DELTAS  │
 │ (Device ➔ Firestore) │         │ (Firestore ➔ Device) │
 └─────────┬────────────┘         └──────────┬───────────┘
           │                                 │
           │ 1. Read pending outbox rows     │ 1. Get pending outbox entity IDs
           │ 2. Construct Firestore batch    │ 2. Query Firestore where
           │    (Limit: 400 docs per batch)  │    updatedAt > lastPullTimestamp
           │ 3. db.batch().commit()          │ 3. Skip any doc whose ID is
           │ 4. Delete processed outbox IDs  │    currently dirty in local outbox
           │                                 │ 4. Upsert remote doc to Room DB
           ▼                                 ▼
 ┌──────────────────────┐         ┌──────────────────────┐
 │  Cloud Firestore DB  │         │ Advance Watermark    │
 └──────────────────────┘         │ lastPullTimestamp =  │
                                  │ syncStartTime        │
                                  └──────────────────────┘
```

---

## 🧩 Step-by-Step Sync Algorithm

### Phase 1: Local Enqueue (Write Time)
Whenever a user mutates data in `BudgetRepository`:
1. The entity's `updatedAt` field is set to `System.currentTimeMillis()`.
2. For expenses, the `amount` is converted to negative (`-abs(amount)`).
3. The entity is written to Room.
4. An entry is created in `sync_outbox`:
   * `entityType`: `"TRANSACTION"`, `"CATEGORY"`, `"BUDGET"`, `"RULE"`, `"SPEND"`, or `"BALANCE"`.
   * `entityId`: String key formatted as `"tx_<id>"`, `"cat_<id>"`, `"budget_<id>"`, etc.
   * `operation`: `"UPSERT"` or `"DELETE"`.

---

### Phase 2: Outbox Push Pipeline (Device ➔ Cloud)
When `executeOutboxSync` runs:
1. `SyncOutboxDao.getPendingEntries(limit = 400)` retrieves uncommitted outbox rows ordered by `createdAt`.
2. A `WriteBatch` (`db.batch()`) is initialized.
3. For each outbox entry:
   * If `operation == "DELETE"`: A soft-delete marker `mapOf("isDeleted" to true, "updatedAt" to createdAt)` is staged on the target document reference with `SetOptions.merge()`.
   * If `operation == "UPSERT"`: The latest entity is loaded from Room by ID. If found, all fields are converted to a Firestore map and staged in the batch with `SetOptions.merge()`.
4. `batch.commit().await()` sends the batch to Firestore atomically.
5. Upon success:
   * Processed `outboxId`s are purged from `sync_outbox` via `SyncOutboxDao.deleteByIds()`.
   * `totalPushed` counter increments.
6. Loop continues until `getPendingEntries` returns empty.

---

### Phase 3: Metadata & RBAC Synchronization
After pushing data:
1. The Admin's local member list (`family_members`) is synced to `security_config/roles` document:
   ```json
   {
     "userRoles": {
       "user_example_com": "ADMIN",
       "editor_example_com": "EDITOR"
     },
     "updatedAt": 1759186300000
   }
   ```
2. Vault metadata is updated in `family_meta/vault` (`accountBalance`, `lastUpdated`, `adminEmail`).

---

### Phase 4: Delta Pull Pipeline (Cloud ➔ Device)
1. Read `lastPullTimestamp` from `sync_state`.
2. Fetch current dirty entity IDs from `sync_outbox` for each entity type (`pendingTxIds`, `pendingCatIds`, etc.).
3. **Query Collections**:
   * For each collection (`categories`, `category_budgets`, `rules`, `expected_spends`, `transactions`, `account_balance`):
   * If `lastPullTimestamp > 0`, construct query: `.whereGreaterThan("updatedAt", lastPullTimestamp)`
   * Otherwise query the full collection.
4. **Conflict Resolution Rule**:
   ```kotlin
   if (doc.id in pendingLocalOutboxIds) {
       // Local uncommitted user edits exist for this entity.
       // Skip remote update to avoid overwriting pending local user changes.
       continue 
   }
   ```
5. Parse Firestore document snapshot and upsert into Room database using Room DAOs.

---

### Phase 5: Watermark Advance
1. `lastPullTimestamp` is set to `syncStartTime`.
2. `lastPushTimestamp` is set to `syncStartTime`.
3. `sync_state` record updated with status `"SUCCESS"` and message: `"Synced: Pushed X changes, Pulled Y changes."`

---

## 🔒 Security & RBAC Rules Generator
`FirebaseSyncService.generateFirestoreSecurityRules()` dynamically constructs Production Firestore Security Rules based on configured family members:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    function isAuthenticated() {
      return request.auth != null && request.auth.token.email != null;
    }
    
    function isFamilyViewer() {
      return isAuthenticated() && (request.auth.token.email.lower() in ["admin@family.com", "member@family.com"]);
    }
    
    function isFamilyEditor() {
      return isAuthenticated() && (request.auth.token.email.lower() in ["admin@family.com", "editor@family.com"]);
    }
    
    function isFamilyAdmin() {
      return isAuthenticated() && (request.auth.token.email.lower() in ["admin@family.com"]);
    }

    match /family_meta/{metaDoc} {
      allow read: if isFamilyViewer();
      allow write: if isFamilyAdmin();
    }

    match /transactions/{transactionDoc} {
      allow read: if isFamilyViewer();
      allow write: if isFamilyEditor();
    }
    
    // ... Additional collection matchers
  }
}
```
