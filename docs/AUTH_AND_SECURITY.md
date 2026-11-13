# Authentication & Security Architecture

This document specifies user authentication, credential handling, Google OAuth setup, WebAuthn biometric unlock, local cache lifecycle, and Role-Based Access Control (RBAC) in **Budget Family (Family Budget Vault)**.

---

## 🔐 1. Mandatory Authentication Gate & Session Modes

Before rendering the navigation bar or loading any financial state, `App.tsx` gates the entire application on `sessionMode !== null` (`'FIRESTORE' | 'DEMO' | null`) via `LoginScreen.tsx`.

There is **no standalone offline-only local storage mode**. Users must choose one of two explicit session modes:

1. **Private Firestore (BYOB — `sessionMode = 'FIRESTORE'`)**:
   - Users connect their own private Google Cloud / Firebase project (`projectId`, `apiKey`, optional `applicationId`, `familyName`) and authenticate with a real Google account via Firebase Auth.
   - Collections are stored at the root of the user's private Firestore database (`/accounts`, `/transactions`, `/categories`, `/category_budgets`, `/rules`, `/family_members`, `/security_config/roles`, `/family_meta/vault`).
   - A local cache in `localStorage` (`fbv_*` keys + `lastPullTimestamp`) is maintained **while logged in** so returning connections perform incremental delta pulls (`updatedAt > lastPullTimestamp`) instead of reloading every document.
2. **Demo Mode (`sessionMode = 'DEMO'`)**:
   - Generates a bilingual (`fr` / `en`) sample household strictly in React memory (`getInitialSeedData`).
   - Never writes to `localStorage` or Cloud Firestore, and resets completely on logout or page reload.

---

## 🌐 2. Google OAuth Flow (`firebaseAuthService.ts`)

1. **Dynamic Firebase Initialization**:
   - `getOrInitFirestore(config)` initializes a named Firebase app instance (`byob_<projectId>_<apiKeySuffix>`) with `authDomain: "<projectId>.firebaseapp.com"` and `storageBucket: "<projectId>.firebasestorage.app"`.
2. **Popup Primary + Redirect Fallback**:
   - `signInWithGoogle()` configures `GoogleAuthProvider` with `email` and `profile` scopes and `prompt: 'select_account'`.
   - Attempts `signInWithPopup(auth, provider)` first.
   - If the browser returns `auth/popup-blocked`, the pending BYOB payload is stored temporarily in `sessionStorage` (`fbv_pending_byob_config`) and `signInWithRedirect(auth, provider)` is triggered; on return, `checkRedirectAuthResult()` consumes the `sessionStorage` payload and completes Firestore sync.
3. **Firebase Console & OAuth Requirements**:
   - **Sign-in provider**: Google must be enabled in **Firebase Console ➔ Authentication ➔ Sign-in method**.
   - **Authorized domains**: Every origin hosting the web app (e.g., `localhost`, preview domains, custom domains) must be listed under **Firebase Console ➔ Authentication ➔ Settings ➔ Authorized domains** to avoid `auth/unauthorized-domain`.
   - **OAuth Consent Screen**: In Google Cloud Console, if the OAuth consent screen is set to **Testing**, all invited family members' Google emails must be added under **Test users** (or the app must be published to Production).

---

## 🖐️ 3. Direct WebAuthn Fingerprint / Face ID Unlock (`biometricKeyvault.ts`)

When a user has already configured a BYOB Firestore vault (`fbv_byob_config` exists in `localStorage`), `LoginScreen` opens directly on the **Fingerprint Unlock** view:

- **Hardware-Backed Platform Authenticator**: Uses the WebAuthn FIDO2 API (`navigator.credentials.create` / `navigator.credentials.get` with `authenticatorAttachment: 'platform'`, `userVerification: 'required'`), tying unlock to Touch ID, Face ID, Windows Hello, or Android Biometrics.
- **Base64url Credential Storage**: Encodes `credential.rawId` in URL-safe base64 (`fbv_biometric_cred_id`) and decodes safely via `base64UrlToUint8Array` during assertion.
- **Auto-Prompt & Firebase Session Handoff**:
  - If an enrolled credential and platform authenticator are available, `LoginScreen` prompts fingerprint verification automatically on load.
  - Once verified: if Firebase Auth already holds an active user session, Firestore delta sync runs immediately; if the user previously logged out (`auth.currentUser === null`), the app triggers Google Sign-In (or presents a 1-tap **Continue with Google & Firestore** button if the browser blocks a popup after an asynchronous WebAuthn call).

---

## 🧹 4. Local Cache Lifecycle & Logout Data Erasure (`storage.ts`)

| Storage Key(s) | Lifetime | Purpose |
| :--- | :--- | :--- |
| `fbv_byob_config` | Persisted across normal logouts; erased by **Forget Config** | Stores `{ projectId, apiKey, applicationId, familyName }` so returning users can unlock directly with fingerprint. |
| `fbv_biometric_cred_id` | Persisted across normal logouts; erased by **Remove** or **Forget Config** | Stores the WebAuthn platform credential ID for fingerprint verification. |
| `fbv_cache_project_id`, `fbv_accounts`, `fbv_transactions`, `fbv_categories`, `fbv_budgets`, `fbv_rules`, `fbv_members`, `fbv_sync_state`, `fbv_outbox`, `fbv_open_banking`, `fbv_currency`, `fbv_language`, `fbv_family_name` | Written **only** during active `FIRESTORE` sessions; **erased on Log Out** | Avoids full collection reloads on reconnection via delta sync (`lastPullTimestamp`). |
| `fbv_pending_byob_config` (`sessionStorage`) | Transient OAuth redirect handoff; cleared on consumption or Log Out | Preserves BYOB inputs across `signInWithRedirect`. |

Calling `logout()` executes:
1. `signOutGoogle()` — signs out of Firebase Auth.
2. `resetFirebaseInstances()` — tears down in-memory Firebase app/Firestore instances.
3. `purgeLocalData({ preserveByob: true })` — clears `sessionStorage` and removes all `fbv_*` `localStorage` keys except `fbv_byob_config` and `fbv_biometric_cred_id`.
4. `eraseAllSessionMemory()` — clears all React state arrays/configs and returns `sessionMode` to `null` (rendering `LoginScreen`).

---

## 👥 5. Dynamic Role-Based Access Control (`firestore.rules`)

Users deploy `firestore.rules` **once** to their Firebase project and never need to edit rules when adding or removing family members:

1. **Email-Claim Lookup**: `firestore.rules` evaluates `request.auth.token.email.lower()` against `/security_config/roles` (`userRoles` map) and `/family_meta/vault` (`adminEmail`).
2. **Automatic First-Run Bootstrap**: When `security_config/roles` or `family_meta/vault` does not exist yet, `firestore.rules` permits the first signed-in user to write them, bootstrapping themselves as `ADMIN`.
3. **Granular Permissions**:
   - `ADMIN`: Full read/write including `security_config/roles` and `family_meta/vault`.
   - `EDITOR` / `MEMBER`: Read/write on financial collections (`accounts`, `transactions`, `categories`, `category_budgets`, `rules`, `family_members`).
   - `VIEWER`: Read-only access to vault collections.
   - *(Note: `firestore.rules` also contains `/vaults/{vaultId}/...` multi-tenant rules for the repository's native Android Managed Cloud tier.)*
