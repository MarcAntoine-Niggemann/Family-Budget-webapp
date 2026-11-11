# Firebase Project Setup & Configuration Guide

This guide explains how to configure **Family Budget Vault** in both **Managed Cloud (Subscription Tier)** and **Self-Hosted ("Bring Your Own Firebase" / BYOB)** modes, as well as how to configure multi-environment keys (`DEV` vs. `PROD`) as the repository maintainer.

---

## 🏢 Part A: Maintainer Setup for Managed Cloud (`DEV` & `PROD` Environments)

If you are the app maintainer hosting the **Managed Cloud** service:

### 1. Create Two Separate Firebase Projects
1. **`family-budget-dev` (Dev / Staging)**: Used by debug builds, emulator previews, and open-source contributors.
   - Register your **Debug Keystore** SHA-1 and SHA-256 fingerprints.
2. **`family-budget-prod` (Production)**: Used strictly by signed Google Play Store release builds.
   - Register **ONLY** your private **Release / Upload Keystore** SHA-1 and SHA-256 fingerprints. Never register a debug key on the Production project.

### 2. Configure Multi-Environment Keys in `.env` or AI Studio Secrets Panel
Copy `.env.example` to `.env` (which is gitignored) or set the following keys in the **AI Studio Secrets Panel**:

```properties
# MANAGED CLOUD — DEV / STAGING (Used automatically when BuildConfig.DEBUG == true)
MANAGED_DEV_PROJECT_ID=your-dev-project-id
MANAGED_DEV_API_KEY=AIzaSy...
MANAGED_DEV_APP_ID=1:123456789:android:...
MANAGED_DEV_WEB_CLIENT_ID=123456789-...apps.googleusercontent.com

# MANAGED CLOUD — PRODUCTION (Used automatically when BuildConfig.DEBUG == false)
MANAGED_PROD_PROJECT_ID=your-prod-project-id
MANAGED_PROD_API_KEY=AIzaSy...
MANAGED_PROD_APP_ID=1:987654321:android:...
MANAGED_PROD_WEB_CLIENT_ID=987654321-...apps.googleusercontent.com
```

### 3. Deploy `firestore.rules`
Deploy the repository's `firestore.rules` file to both projects. In your **Production** project, remove `'DEV_SANDBOX'` from `isValidSubscriptionPayload()` so only real Google Play Billing tokens (`'GOOGLE_PLAY'`) are accepted.

---

## 🛠️ Part B: Self-Hosted (BYOB) User Setup Guide

If you prefer 100% private ownership of your family database using your own Firebase project:

### Step 1: Create a Firebase Project & Firestore Database
1. Open the [Firebase Console](https://console.firebase.google.com/) and click **Create a project**.
2. Go to **Build ➔ Firestore Database** and click **Create database** (start in production mode).

### Step 2: Enable Google Authentication
1. Go to **Build ➔ Authentication ➔ Sign-in method**.
2. Click **Add new provider ➔ Google** and toggle **Enable**.
3. Set your project support email and click **Save**. That's it!

### Step 3: Zero SHA-1 Registration Required (No Android App Setup Needed)
> [!NOTE]
> **No Android App or SHA-1 Registration Needed!**
> Google Cloud restricts a combination of `(Package Name, SHA-1 Fingerprint)` to a single project globally. Because Family Budget Vault uses **Web-based OAuth in a Chrome Custom Tab** for private BYOB vaults, you do **NOT** need to add an Android app or paste any SHA-1 fingerprint into your Firebase project! The sign-in flow connects directly to your project's secure web handler (`https://<projectId>.firebaseapp.com/__/auth/handler`).

### Step 4: One-Time Security Rules Setup (Never Needs Re-Copying!)
1. In **Family Budget Vault**, open **Settings ➔ Storage-Level Security Rules** and tap **Copy Rules** (or copy `firestore.rules` from this repository).
2. Paste the rules into **Firestore Database ➔ Rules** in the Firebase Console and click **Publish**.
3. **One-Time Setup**: Because these rules dynamically look up member emails and roles in the `security_config/roles` document, **you never need to re-copy or edit `firestore.rules` when adding, removing, or changing family members in the app.**

### Step 5: Connect in Self-Hosted Mode
1. In Firebase Console ➔ **Project Settings**, copy your **Project ID** and **Web API Key**.
2. On the app Login screen (or in Settings), select **Self-Hosted (BYOB)**.
3. Enter your `Project ID` and `API Key` (or scan a Family QR code from another device) and tap **Sign in with Google (Web OAuth)**.
4. A secure Custom Tab will prompt you to select your Google Account, and you'll be connected directly to your private vault!

---

## 💻 Part C: Dev & Emulator Environment Defaults for Self-Hosted Vaults

To speed up development and emulator testing without entering credentials manually and **without risking exposing secrets in code**, you can configure development environment variables in your `.env` file or in the **AI Studio Secrets panel**:

```properties
# SELF-HOSTED (BYOB) VAULT — DEV / EMULATOR ENVIRONMENT DEFAULTS
SELF_HOSTED_DEV_PROJECT_ID=your-dev-project-id
SELF_HOSTED_DEV_API_KEY=AIzaSy...
SELF_HOSTED_DEV_APP_ID=1:123456789:android:...
SELF_HOSTED_DEV_WEB_CLIENT_ID=123456789-...apps.googleusercontent.com

# (Aliases BYOB_DEV_* are also supported)
```

### Behavior:
- **No Secrets in Code**: Credentials remain 100% externalized in `.env` / Secrets Panel and are accessed safely through `BuildConfig` during debug builds.
- **Auto-Preset on Login Form**: When running in development/emulator (`BuildConfig.DEBUG == true`) and nothing has been saved yet in app local storage (Room database or EncryptedSharedPreferences), the login form fields are automatically preset with these values.
- **Local Storage Precedence**: If the user has already entered and saved credentials (or scans a QR code), the saved local storage values always take precedence over the dev environment defaults.

