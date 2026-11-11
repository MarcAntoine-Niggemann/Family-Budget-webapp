# Authentication & Security Architecture

This document provides a detailed technical specification of user authentication, credential handling, dual-backend isolation (**Managed Cloud Subscription** vs. **Self-Hosted BYOB**), multi-environment secrets (`DEV` vs. `PROD`), open-source security hardening, and Role-Based Access Control (RBAC) in **Family Budget Vault**.

---

## 🔐 1. Dual-Backend Architecture Overview

**Family Budget Vault** supports two cloud deployment models powered by 98% shared sync and security code:

1. **Managed Cloud (Subscription Tier — `MODE_MANAGED`)**:
   - Zero-setup turnkey cloud sync hosted on the central Managed Firestore infrastructure.
   - **Authentication**: Native Android Google Credential Manager (`GetGoogleIdOption`) 1-tap sheet matching the official release package name and SHA-1 certificate registered in the maintainer project.
   - Multi-tenant isolation: Each family's data is strictly isolated under `/vaults/{vaultId}/{collection}`.
   - Only the **Family Admin** requires an active Google Play subscription (`MONTHLY` or `ANNUAL`); invited family members (`EDITOR`, `MEMBER`, `VIEWER`) join the vault for free via a QR code containing the `vaultId`.
2. **Self-Hosted ("Bring Your Own Firebase" — `MODE_BYOB`)**:
   - Privacy-focused technical users connect their own private Google Cloud / Firebase project via API keys or QR configuration.
   - **Collision-Proof Authentication**: Uses Firebase Web-based OAuth redirect in a Chrome Custom Tab (`auth.startActivityForSignInWithProvider(OAuthProvider.newBuilder("google.com"))`). Bypasses Google Cloud's restriction prohibiting multiple projects from registering the same Android package name and SHA-1 fingerprint. Zero Android client or SHA-1 registration needed in the user's project!
   - Collections are stored at the root of the user's private database (`/transactions`, `/categories`, `/security_config/roles`, etc.).
   - Unified email claims: In both modes, Firestore Security Rules evaluate `request.auth.token.email.lower()`.

---

## 🌍 2. Multi-Environment Secrets (`DEV` vs. `PROD`)

To prevent development, emulator previews, and automated tests from touching Production data—and to keep credentials out of version control when open-sourcing—Managed Cloud credentials are split by environment in `.env` (or the **AI Studio Secrets Panel**) and exposed via `BuildConfig`:

```properties
# DEV / STAGING ENVIRONMENT (Automatically selected when BuildConfig.DEBUG == true)
MANAGED_DEV_PROJECT_ID=gen-lang-client-0096915776
MANAGED_DEV_API_KEY=AIzaSy...
MANAGED_DEV_APP_ID=1:181331993196:web:...
MANAGED_DEV_WEB_CLIENT_ID=181331993196-...apps.googleusercontent.com

# PRODUCTION ENVIRONMENT (Automatically selected ONLY in signed Release builds)
MANAGED_PROD_PROJECT_ID=your-prod-project-id
MANAGED_PROD_API_KEY=your-prod-api-key
MANAGED_PROD_APP_ID=your-prod-app-id
MANAGED_PROD_WEB_CLIENT_ID=your-prod-web-client-id
```

`ManagedBackendConfig.kt` inspects `BuildConfig.DEBUG` at compile/runtime:
- **Debug / Test Builds (`BuildConfig.DEBUG == true`)**: Exclusively loads `MANAGED_DEV_*` credentials and displays an amber **`DEV / STAGING`** badge in the UI.
- **Release Builds (`BuildConfig.DEBUG == false`)**: Exclusively loads `MANAGED_PROD_*` credentials.

---

## 🛡️ 3. Open-Source Hardening Against Debug/Sandbox Bypass

Because the codebase is designed to be open-source, an attacker could clone the repository, remove `if (BuildConfig.DEBUG)` around the Sandbox Subscription simulator in Kotlin, and compile their own modified APK.

Production Managed Cloud is protected at the **server level** by three independent barriers:

1. **Private Release Keystore SHA-256 Pinning (Blocks Modified APKs from Authenticating)**:
   - Your **Dev/Staging** Firebase project registers your debug keystore SHA-1/SHA-256 so contributors and local builds can test.
   - Your **Production** Firebase project (`MANAGED_PROD_*`) **ONLY** registers the SHA-256 certificate fingerprint of your private Google Play Upload/Release Keystore (which is never committed to git).
   - Any modified open-source build signed with a third-party keystore immediately fails Google OAuth Sign-In (`DEVELOPER_ERROR`) and Firebase App Check Play Integrity against the Production project.
2. **Firestore Security Rules Reject Sandbox Tokens in Production**:
   - In `firestore.rules`, `isValidSubscriptionPayload()` verifies that any write setting `subscriptionStatus == 'ACTIVE'` includes a valid `purchaseToken` (`size() >= 16`) and `subscriptionPurchaseSource in ['GOOGLE_PLAY', 'DEV_SANDBOX']`.
   - When deploying `firestore.rules` to your **Production** Firebase project, remove `'DEV_SANDBOX'` from the allowed `subscriptionPurchaseSource` list so Production Firestore rejects any sandbox entitlement write with `PERMISSION_DENIED`.
3. **Zero Cross-Vault Visibility (Multi-Tenant Isolation)**:
   - In Managed Cloud mode, `firestore.rules` disables collection-level listing on `/vaults` (`allow list: if false;` on `/vaults/{vaultId}`) and enforces `hasVaultRole(vaultId, ...)` on every subcollection document `/vaults/{vaultId}/{collection}/{docId}`. A user authenticated in Vault A can never read, query, or discover Vault B.

---

## 👥 4. Dynamic Role-Based Access Control (Zero Manual Rule Copying)

Neither Managed Cloud nor Self-Hosted (BYOB) users ever need to re-copy or edit `firestore.rules` when adding, removing, or changing family members:

1. **Static `firestore.rules`, Dynamic Firestore Lookup**:
   - `firestore.rules` never hardcodes user email addresses. Instead, it dynamically looks up the authenticated caller's exact lowercase email (`request.auth.token.email.lower()`) using bracket notation inside `security_config/roles` (for BYOB) or `/vaults/{vaultId}/security_config/roles` (for Managed Cloud):
     ```javascript
     function userEmail() {
       return request.auth.token.email.lower();
     }
     function getRootUserRole() {
       return get(/databases/$(database)/documents/security_config/roles).data.userRoles[userEmail()];
     }
     function getVaultUserRole(vaultId) {
       return get(/databases/$(database)/documents/vaults/$(vaultId)/security_config/roles).data.userRoles[userEmail()];
     }
     ```
2. **Automatic Role Synchronization**:
   - Whenever the Admin adds a family member, changes their role (`ADMIN`, `EDITOR`, `MEMBER`, `VIEWER`), or removes a member in **Settings -> Family Members**, `FirebaseSyncService.syncMemberRolesToFirestore()` automatically updates `security_config/roles` in Firestore.
   - Self-Hosted (BYOB) users paste `firestore.rules` into their Firebase Console **only once** during initial project setup.

---

## 🖐️ 5. Device Biometric Security Lock (`BiometricAuthManager.kt`)

To protect sensitive financial information from unauthorized local access, the application includes an optional **Biometric & PIN Lock** (`BIOMETRIC_STRONG`, `BIOMETRIC_WEAK`, or `DEVICE_CREDENTIAL`) enforced on activity entry when `isBiometricLockEnabled` is active.
