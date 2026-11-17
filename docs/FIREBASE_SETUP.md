# Firebase & Google OAuth Setup Guide (BYOB Firestore)

This guide explains how users configure their own **private Firebase / Cloud Firestore project ("Bring Your Own Backend" / BYOB)** and **Google OAuth** to use **Budget Family (Family Budget Vault)**.

> [!IMPORTANT]
> **No Standalone Local-Only Mode:**
> Before accessing any screen or data, you must either configure & sign in to your own **BYOB Firestore** project with Google OAuth, or launch **Demo Mode** (strictly in-memory with zero persistence). When using BYOB Firestore, a **local delta cache** is maintained while signed in so you don't reload the entire database on every visit, and **all cached local data is erased on Log Out** (keeping only your BYOB connection details and WebAuthn fingerprint credential ID).

---

## 🛠️ Part A: User Setup for Private Firestore (BYOB) & Google OAuth (Web App)

### Step 1: Create a Firebase Project & Firestore Database
1. Open the [Firebase Console](https://console.firebase.google.com/) and click **Create a project** (or select an existing project).
2. In the left sidebar, go to **Build ➔ Firestore Database**.
3. Click **Create database**, choose your preferred Cloud Firestore location, and start in **Production mode**.

### Step 2: Register a Web App & Copy Credentials
1. In the Firebase Console, open **Project Settings** (gear icon) ➔ **General**.
2. Under **Your apps**, click the **Web (`</>`)** icon to register a web app (hosting is optional).
3. Copy the following values from the `firebaseConfig` snippet:
   - **Project ID** (`projectId`, e.g. `my-family-budget-123`)
   - **Web API Key** (`apiKey`, starts with `AIzaSy...`)
   - **Application ID** (`appId`, optional on the login form, e.g. `1:123456789:web:...`)
   - *(Note: The app automatically derives `authDomain` as `<projectId>.firebaseapp.com` and `storageBucket` as `<projectId>.firebasestorage.app`.)*

> [!NOTE]
> **No Android App or SHA-1 Registration Needed for Web OAuth:**
> You do **not** need to register an Android app or SHA-1/SHA-256 fingerprint for web authentication.

### Step 3: Enable Google Authentication & Configure OAuth Consent Screen
1. In Firebase Console, go to **Build ➔ Authentication ➔ Get started**.
2. Open the **Sign-in method** tab, click **Add new provider ➔ Google**, and toggle **Enable**.
3. Select a **Project support email** and click **Save**. Firebase automatically creates the Web OAuth 2.0 Client ID in the linked Google Cloud project.
4. **Inviting Family Members (Google Cloud OAuth Consent Screen):**
   - Open [Google Cloud Console ➔ APIs & Services ➔ OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) for the same project.
   - If **Publishing status** is **Testing**, only emails listed under **Test users** can sign in with Google. Add every family member's Google email to **Test users**, or click **Publish App** (for basic `email` / `profile` scopes, no sensitive app verification is required).

### Step 4: Add Authorized Domains for Web OAuth (Required)
Firebase Authentication blocks OAuth popups and redirects from unrecognized domains (`auth/unauthorized-domain`).

1. On the **Budget Family** Login screen, under **My Firestore (BYOB)**, locate the **Authorized domain for Firebase Auth** box and click **Copy** (for example `localhost` or your deployed/preview hostname such as `*.run.app`).
2. In Firebase Console, go to **Build ➔ Authentication ➔ Settings ➔ Authorized domains**.
3. Click **Add domain**, paste the copied hostname, and save.
4. If you deploy or access the app from multiple URLs (e.g., development preview URL, production URL, and `localhost`), add each hostname to **Authorized domains**.

> [!TIP]
> **Popups vs. Redirect Fallback:**
> The app uses `signInWithPopup` first. If your browser blocks popups (`auth/popup-blocked`), it stores your pending BYOB configuration temporarily in `sessionStorage` and falls back to `signInWithRedirect`. Allowing popups for the app domain provides the smoothest experience and avoids browser third-party cookie restrictions on redirects.

### Step 5: Publish One-Time Firestore Security Rules (`firestore.rules`)
1. Copy the static security rules from any of these places:
   - `/firestore.rules` in this repository, **or**
   - In the app: **Login Screen** (expand **View & copy firestore.rules** if a permission error appears), **or**
   - After connecting: **Vault Config & Cloud Sync ➔ Copy firestore.rules**.
2. In Firebase Console, go to **Build ➔ Firestore Database ➔ Rules**.
3. Replace the default rules with the copied rules and click **Publish**.

#### How Bootstrap & Dynamic RBAC Work
- **Automatic First-User Bootstrap:** When the first authenticated user connects to an empty Firestore database, the app initializes `/security_config/roles` (with the first user as `ADMIN`) and `/family_meta/vault` (with `adminEmail` and `familyName`).
- **One-Time Rule Setup:** Because `firestore.rules` dynamically checks `request.auth.token.email.lower()` against `/security_config/roles`, **you never need to edit or re-publish `firestore.rules`** when adding, editing, or removing family members in the app.

### Step 6: First Sign-In, Local Delta Cache & Fingerprint Unlock
1. Open the app — the Login screen is enforced before any financial UI or data loads.
2. Select **My Firestore (BYOB)** (or **Scan QR Code** if joining an existing family vault).
3. Enter your **Firebase Project ID**, **Firebase Web API Key**, optional **Application ID**, and **Vault Name**.
4. Click **Sign in with Google & Connect Firestore**.
5. Once authenticated, your initial data is pulled from Firestore and cached locally (`localStorage` `fbv_*` keys + `lastPullTimestamp` watermark).

#### Returning Visits & Fingerprint Unlock
- Because your BYOB connection details (`fbv_byob_config`) are saved locally, subsequent visits open directly on the **Fingerprint / Face ID Unlock** screen (powered by WebAuthn / FIDO2).
- On first use, click **Verify Fingerprint & Connect** (or enroll anytime in **Vault Config & Cloud Sync ➔ Direct Fingerprint / Face ID Login**) to register a hardware platform credential (`fbv_biometric_cred_id`).
- When unlocked, the app hydrates from the local cache (if still present) and performs an **incremental delta sync** (`updatedAt > lastPullTimestamp`) rather than re-downloading every collection.

#### What Happens on Log Out
- Clicking **Log Out** signs out of Firebase Auth, wipes React state and `sessionStorage`, and **erases all local cached financial data** (`accounts`, `transactions`, `categories`, `budgets`, `rules`, `members`, `syncState`, `outbox`, preferences).
- **Only** your BYOB connection configuration (`fbv_byob_config`) and WebAuthn credential ID (`fbv_biometric_cred_id`) are retained so you can unlock with fingerprint on your next visit.
- Clicking **Forget Config** erases everything including `fbv_byob_config` and `fbv_biometric_cred_id`.

---

## 🩺 Troubleshooting OAuth & Firestore Connection Errors

| Error / Code | Cause | Fix |
| :--- | :--- | :--- |
| `auth/unauthorized-domain` | Current web app hostname is not allowlisted in Firebase Auth. | Copy the hostname displayed on the Login screen and add it in **Firebase Console ➔ Authentication ➔ Settings ➔ Authorized domains**. |
| `auth/operation-not-allowed` | Google Sign-In provider is disabled in your Firebase project. | Enable **Google** under **Firebase Console ➔ Authentication ➔ Sign-in method**. |
| `auth/invalid-api-key` | Web API Key does not match your Firebase project. | Copy the exact `apiKey` (`AIzaSy...`) from **Project Settings ➔ General ➔ Your apps (Web)**. |
| `auth/popup-blocked` / `auth/popup-closed-by-user` | Browser blocked or user closed the Google OAuth window. | Allow popups for the app hostname and retry Google Sign-In. |
| `Access blocked: This app has not completed Google verification` or `403: access_denied` | Google Cloud OAuth Consent Screen is in **Testing** mode and the user isn't a Test User. | In **Google Cloud Console ➔ OAuth consent screen**, add the family member's email under **Test users** or publish the app. |
| `permission-denied` | Firestore rules were not published or user email is missing from `security_config/roles`. | Publish `firestore.rules` in **Firestore Database ➔ Rules** and ensure the Admin added the member's exact Google email in the vault. |

---

## 📱 Part B: PWA Architecture Notes (No Environment Variables Required)

In this PWA architecture, **no `.env` file or build-time environment variables are required**:
- **BYOB Firestore & Google OAuth**: Users configure their Firebase Project ID, Web API Key, and optional Application ID directly in the app (or via QR code vault sharing) at runtime.
- **Native Android Companion Files**: Legacy Gradle wrapper files (`build.gradle.kts`, `settings.gradle.kts`) simply delegate `assembleDebug`/`build`/`lint` to `npm run build` and `npm run lint`.
