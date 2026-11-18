# Authentication & Security Architecture

This document specifies user authentication, credential handling, Google OAuth setup, WebAuthn biometric & v3 local vault encryption, cache lifecycle, and Role-Based Access Control (RBAC) in **Budget Family (Family Budget Vault)**.

---

## 🔐 1. Mandatory Authentication Gate & Session Modes

Before rendering the navigation bar or loading any financial state, `App.tsx` gates the entire application on `sessionMode !== null` (`'FIRESTORE' | 'DEMO' | null`) via `LoginScreen.tsx`.

There is **no standalone offline-only local storage mode**. Users must choose one of two explicit session modes:

1. **Private Firestore (BYOB — `sessionMode = 'FIRESTORE'`)**:
   - Users connect their own private Google Cloud / Firebase project (`projectId`, `apiKey`, optional `applicationId`, `familyName`) and authenticate with a **verified Google account** (`email_verified == true`) via Firebase Auth.
   - Collections are stored at the root of the user's private Firestore database (`/accounts`, `/transactions`, `/categories`, `/category_budgets`, `/rules`, `/family_members`, `/security_config/roles`, `/family_meta/vault`, `/shared_settlements`).
   - All BYOB config, Open Banking config, and cached delta collections in `localStorage` (`fbv_vault_lock`, `fbv_sec_*` envelopes) are encrypted at rest with **AES-256-GCM** using a random 256-bit Data Encryption Key (DEK).
2. **Demo Mode (`sessionMode = 'DEMO'`)**:
   - Generates a bilingual (`fr` / `en`) sample household strictly in React memory (`getInitialSeedData`).
   - Never writes to `localStorage` or Cloud Firestore, and resets completely on logout or page reload.

---

## 🌐 2. Google OAuth Flow (`firebaseAuthService.ts`)

1. **Dynamic Firebase Initialization**:
   - `getOrInitFirestore(config)` validates the project ID and Web API key format (`validateFirebaseConfigFields`) and initializes a named Firebase app instance (`byob_<projectId>_<apiKeySuffix>`) with `authDomain: "<projectId>.firebaseapp.com"` and `storageBucket: "<projectId>.firebasestorage.app"`.
2. **Popup Primary + Redirect Fallback**:
   - `signInWithGoogle()` configures `GoogleAuthProvider` with `email` and `profile` scopes and `prompt: 'select_account'`.
   - Attempts `signInWithPopup(auth, provider)` first.
   - If the browser returns `auth/popup-blocked`, the pending BYOB payload is stored temporarily in `sessionStorage` (`fbv_pending_byob_config`) and `signInWithRedirect(auth, provider)` is triggered; on return, `checkRedirectAuthResult()` validates and consumes the `sessionStorage` payload.
3. **Firebase Console & OAuth Requirements**:
   - **Sign-in provider**: Google must be enabled in **Firebase Console ➔ Authentication ➔ Sign-in method**.
   - **Authorized domains**: Every origin hosting the web app (e.g., `localhost`, preview domains, custom domains) must be listed under **Firebase Console ➔ Authentication ➔ Settings ➔ Authorized domains** to avoid `auth/unauthorized-domain`.
   - **OAuth Consent Screen**: In Google Cloud Console, if the OAuth consent screen is set to **Testing**, all invited family members' Google emails must be added under **Test users** (or the app must be published to Production).

---

## 🖐️ 3. Zero-Knowledge Local Vault Keyvault (v3) & WebAuthn (`crypto.ts`, `biometricKeyvault.ts`)

When a user configures a BYOB Firestore vault, `fbv_vault_lock` (`v: 3`) stores a randomly generated AES-256-GCM DEK wrapped by one or both Key Encryption Keys (KEKs):

- **Hardened Vault Passphrase (v3)**:
  - Minimum **8 characters** (`MIN_VAULT_PASSPHRASE_LENGTH = 8`) with strength indicator feedback.
  - Derived via **PBKDF2-HMAC-SHA256** with **600,000 iterations** and a random 16-byte salt (`saltPin`).
  - Failed unlock attempts trigger **exponential cooldown backoff** (`2^(attempts - 3) * 5` seconds).
  - Legacy `v: 2` (120,000-iteration) vaults are flagged on login so users can re-enroll under `v: 3`.
- **WebAuthn PRF Hardware Biometrics**:
  - Uses FIDO2 `prf` extension (`navigator.credentials.create` / `get` with `authenticatorAttachment: 'platform'`, `userVerification: 'required'`) to derive a hardware-backed KEK via HKDF-SHA256 without storing raw key material.
- **Non-Extractable Runtime DEK**:
  - Upon unlock, the session DEK is imported with `extractable: false`, and raw DEK buffers are zeroed immediately. Step-up verification (current passphrase or fresh WebAuthn PRF assertion) is required before rotating passphrases or enrolling biometrics.

---

## 🧹 4. Local Cache Lifecycle & Logout Data Erasure (`storage.ts`)

| Storage Key(s) | Lifetime | Purpose |
| :--- | :--- | :--- |
| `fbv_vault_lock` | Persisted across normal logouts; erased by **Forget Config** | Stores `v: 3` KDF salt, wrapped DEK envelopes (`dekWrappedByPin`, `dekWrappedByBio`), and encrypted `byobConfigEnc`. |
| `fbv_biometric_cred_id` | Persisted across normal logouts; erased by **Remove** or **Forget Config** | Stores the WebAuthn platform credential ID + PRF capability flag for biometric unlock. |
| `fbv_sec_*` (`fbv_sec_accounts`, `fbv_sec_transactions`, etc.) | Written **only** during active unlocked `FIRESTORE` sessions; **erased on Log Out** | AES-256-GCM encrypted local delta cache avoiding full collection reloads on reconnection. |
| `fbv_pending_byob_config` (`sessionStorage`) | Transient OAuth redirect handoff; cleared on consumption or Log Out | Preserves BYOB inputs across `signInWithRedirect`. |

Calling `logout()` or `lockVault()` increments an async persist generation counter to abort any in-flight encrypted cache writes. `logout()` also executes:
1. `signOutGoogle()` — signs out of Firebase Auth.
2. `resetFirebaseInstances()` — tears down in-memory Firebase app/Firestore instances.
3. `purgeLocalData({ preserveByob: true })` — clears `sessionStorage` and removes all `fbv_sec_*` encrypted caches while keeping `fbv_vault_lock` and `fbv_biometric_cred_id`.
4. `eraseAllSessionMemory()` — clears all React state arrays/configs/non-extractable DEK and returns `sessionMode` to `null`.

---

## 👥 5. Zero-Trust Dynamic RBAC & Static-SPA Boundaries (`firestore.rules`)

Users deploy `firestore.rules` **once** to their Firebase project and validate them with `@firebase/eslint-plugin-security-rules`:

1. **Verified Email Requirement**: `isSignedIn()` requires `request.auth.token.email_verified == true` alongside a non-empty `email`.
2. **Atomic Create-Only Bootstrap**: Missing-metadata bypasses (`!vaultMetaExists()`) are disabled. Initial creation of `/security_config/roles` and `/family_meta/vault` must happen atomically in a single batch (`existsAfter` / `getAfter`) when neither exists yet, with `adminEmail.lower() == userEmail()`. Deletion of `security_config`, `family_meta`, and `users` is denied (`allow delete: if false`).
3. **Strict Schema & ID Validation**: Every collection enforces `isValidId()`, `hasAll`, `hasOnly`, type checks, and string length limits (`150` chars max for categorization regex patterns with safe-regex ReDoS checks in the client).
4. **Open Banking Encrypted Storage & Optional Proxy**: Open Banking credentials (`apiKey`, `apiSecret`, optional `proxyUrl`, and account mappings) are persisted inside the vault's AES-256-GCM encrypted local cache (`fbv_sec_open_banking`) and wiped on logout. Live Production defaults to `https://api.open-banking.io` without requiring users to host a backend proxy (while still allowing an optional HTTPS `proxyUrl`), and `SANDBOX` / local CSV import (10 MB / 10,000-row cap) run locally.
5. **Granular Permissions**:
   - `ADMIN`: Full read/write including `security_config/roles`, `family_meta/vault`, `family_members`, and Vault QR sharing.
   - `EDITOR` / `MEMBER`: Read/write on financial collections (`accounts`, `transactions`, `categories`, `category_budgets`, `rules`, `shared_settlements`).
   - `VIEWER` / `CHILD`: Read-only access to vault collections.
   - *(Note: `firestore.rules` also protects `/vaults/{vaultId}/...` multi-tenant rules against missing-doc bypasses and subscription field forgery.)*
