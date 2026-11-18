import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  User,
  Auth
} from 'firebase/auth';
import { getOrInitFirestore, validateFirebaseConfigFields } from './firebaseSyncService';
import { FirebaseConfigEntity } from '../types';
import {
  formatCspSummary,
  recordAuthTrace,
  subscribeAuthDiagnostics
} from '../utils/authDiagnostics';

const PENDING_BYOB_STORAGE_KEY = 'fbv_pending_byob_config';

export interface AuthUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified?: boolean;
}

export interface PendingByobPayload {
  projectId: string;
  apiKey: string;
  applicationId: string;
  familyName: string;
  resetLocalData: boolean;
}

export function savePendingByobConfig(payload: PendingByobPayload): void {
  try {
    sessionStorage.setItem(PENDING_BYOB_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function consumePendingByobConfig(): PendingByobPayload | null {
  try {
    const raw = sessionStorage.getItem(PENDING_BYOB_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_BYOB_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingByobPayload>;
    if (
      !parsed ||
      typeof parsed.projectId !== 'string' ||
      typeof parsed.apiKey !== 'string'
    ) {
      return null;
    }
    const validation = validateFirebaseConfigFields({
      projectId: parsed.projectId,
      apiKey: parsed.apiKey,
      applicationId: typeof parsed.applicationId === 'string' ? parsed.applicationId : ''
    });
    if (!validation.valid) {
      return null;
    }
    return {
      projectId: parsed.projectId.trim(),
      apiKey: parsed.apiKey.trim(),
      applicationId: typeof parsed.applicationId === 'string' ? parsed.applicationId.trim() : '',
      familyName: typeof parsed.familyName === 'string' && parsed.familyName.trim()
        ? parsed.familyName.trim().slice(0, 120)
        : 'Private Family Vault',
      resetLocalData: Boolean(parsed.resetLocalData)
    };
  } catch {
    clearPendingByobConfig();
    return null;
  }
}

export function clearPendingByobConfig(): void {
  try {
    sessionStorage.removeItem(PENDING_BYOB_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function getOrInitAuth(config?: Partial<FirebaseConfigEntity>): Auth | null {
  const { app } = getOrInitFirestore(config);
  if (!app) return null;

  try {
    return getAuth(app);
  } catch (err) {
    console.warn('Failed to initialize Firebase Auth:', err);
    return null;
  }
}

function withCspContext(message: string): string {
  const csp = formatCspSummary();
  return csp ? `${message}\n\n${csp}` : message;
}

function mapFirebaseAuthError(err: any): string {
  const code = err?.code || '';
  const rawMsg = err?.message ? ` (${err.message})` : '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  switch (code) {
    case 'auth/unauthorized-domain':
      return withCspContext(
        `Domaine non autorisé (${hostname}). Ajoutez « ${hostname} » dans Firebase Console → Authentication → Settings → Authorized domains.`
      );
    case 'auth/operation-not-allowed':
      return withCspContext(
        `Le fournisseur Google Sign-In n'est pas activé dans votre projet Firebase. Activez-le dans Firebase Console → Authentication → Sign-in method → Google.`
      );
    case 'auth/invalid-api-key':
      return withCspContext(`Clé Web API Firebase invalide (auth/invalid-api-key). Vérifiez la clé saisie.`);
    case 'auth/network-request-failed':
      return withCspContext(
        `Erreur réseau lors de l’initialisation de Google OAuth (${code}). Vérifiez votre Project ID (${hostname}), votre connexion internet, et qu’aucun bloqueur/CSP ne bloque apis.google.com ou *.firebaseapp.com/__/auth/iframe.`
      );
    case 'auth/popup-closed-by-user':
      return `Connexion Google annulée (fenêtre fermée avant la fin).`;
    case 'auth/cancelled-popup-request':
      return `Demande de connexion Google interrompue. Veuillez réessayer.`;
    case 'auth/popup-blocked':
      return `Popup Google bloquée par le navigateur. Autorisez les popups pour ce site puis réessayez.`;
    case 'auth/internal-error':
      return withCspContext(
        `Erreur interne Firebase Auth (auth/internal-error)${rawMsg}. Vérifiez que le domaine « ${hostname} » est autorisé, que la Web API Key correspond au Project ID et que apis.google.com / *.firebaseapp.com ne sont pas bloqués.`
      );
    case 'auth/user-disabled':
      return `Ce compte Google a été désactivé dans Firebase Authentication (auth/user-disabled).`;
    case 'auth/invalid-credential':
    case 'auth/account-exists-with-different-credential':
      return withCspContext(`Identifiants OAuth invalides ou en conflit (${code})${rawMsg}.`);
    case 'auth/web-storage-unsupported':
      return `Le stockage navigateur requis par Firebase Auth est bloqué (cookies tiers ou mode privé strict).`;
    default:
      return withCspContext(err?.message || `Erreur Google OAuth (${code || 'inconnue'}).`);
  }
}

/**
 * Signs in with Google using Firebase Auth OAuth Popup (with redirect fallback if popup is blocked).
 */
export async function signInWithGoogle(
  config?: Partial<FirebaseConfigEntity>,
  pendingByob?: PendingByobPayload
): Promise<{
  success: boolean;
  user?: AuthUserInfo;
  redirecting?: boolean;
  error?: string;
}> {
  recordAuthTrace('Initialisation SDK Firebase / Firestore...');
  const initResult = getOrInitFirestore(config);
  if (!initResult.app) {
    recordAuthTrace(`Échec init Firestore/Firebase: ${initResult.error || 'missing config'}`);
    return {
      success: false,
      error:
        initResult.error ||
        'Configuration Firebase incomplète : veuillez saisir votre Project ID et votre Web API Key (BYOB).'
    };
  }

  recordAuthTrace(`Initialisation Firebase Auth (${config?.projectId?.trim()}.firebaseapp.com)...`);
  const auth = getOrInitAuth(config);
  if (!auth) {
    recordAuthTrace('Échec getAuth(app)');
    return {
      success: false,
      error: withCspContext('Impossible d’initialiser Firebase Authentication pour ce projet.')
    };
  }

  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({
    prompt: 'select_account'
  });

  const inIframe = typeof window !== 'undefined' && window.self !== window.top;
  recordAuthTrace(
    `Lancement signInWithPopup (chargement apis.google.com & relais /__/auth/iframe, iframe=${inIframe})...`
  );

  const cleanups: Array<() => void> = [];

  try {
    const popupPromise = signInWithPopup(auth, provider);
    const earlyFailurePromise = new Promise<never>((_, reject) => {
      const unsub = subscribeAuthDiagnostics(() => {
        const csp = formatCspSummary();
        if (csp) {
          recordAuthTrace('Interruption suite au blocage CSP détecté');
          reject(new Error(csp));
        }
      });
      cleanups.push(unsub);

      const timer = setTimeout(() => {
        const gapiLoaded = typeof window !== 'undefined' && Boolean((window as any).gapi?.iframes);
        if (!gapiLoaded) {
          recordAuthTrace('Délai dépassé (>20s) lors du chargement de apis.google.com / gapi.iframes');
          reject(
            new Error(
              withCspContext(
                `Délai dépassé (20s) avant l’ouverture de la fenêtre Google : le script Google OAuth (apis.google.com / gapi.iframes) n’a pas pu se charger. Vérifiez les bloqueurs réseau/extensions ou la CSP.`
              )
            )
          );
        }
      }, 20_000);
      cleanups.push(() => clearTimeout(timer));
    });

    const result = await Promise.race([popupPromise, earlyFailurePromise]);
    const user = result.user;
    recordAuthTrace(`Authentification Google réussie (${user.email || user.uid})`);

    if (!user.email) {
      return {
        success: false,
        error: 'Le compte Google authentifié n’a pas fourni d’adresse e-mail.'
      };
    }

    if (!user.emailVerified) {
      return {
        success: false,
        error: `L’adresse e-mail ${user.email} n’est pas vérifiée par Google (email_verified = false). Veuillez utiliser un compte Google vérifié.`
      };
    }

    const userInfo: AuthUserInfo = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split('@')[0] || 'Utilisateur Google',
      photoURL: user.photoURL,
      emailVerified: user.emailVerified
    };

    return { success: true, user: userInfo };
  } catch (err: any) {
    console.warn('Google Popup sign-in error:', err);
    recordAuthTrace(`Erreur Google OAuth (${err?.code || 'error'}): ${err?.message || String(err)}`);

    if (err?.code === 'auth/popup-blocked') {
      if (inIframe) {
        return {
          success: false,
          error: withCspContext(
            'La fenêtre Google OAuth a été bloquée par le navigateur (auth/popup-blocked). Autorisez les popups pour ce site ou ouvrez l’application dans un nouvel onglet (en dehors de l’aperçu intégré).'
          )
        };
      }
      try {
        if (pendingByob) {
          savePendingByobConfig(pendingByob);
        }
        recordAuthTrace('Bascule vers signInWithRedirect...');
        await signInWithRedirect(auth, provider);
        return {
          success: false,
          redirecting: true,
          error: 'Popup bloquée par le navigateur : redirection vers Google en cours...'
        };
      } catch (redirErr: any) {
        clearPendingByobConfig();
        return {
          success: false,
          error: mapFirebaseAuthError(redirErr)
        };
      }
    }

    return {
      success: false,
      error: mapFirebaseAuthError(err)
    };
  } finally {
    cleanups.forEach(fn => fn());
  }
}

/**
 * Handles redirect result on page reload (if redirect flow was triggered).
 */
export async function checkRedirectAuthResult(
  config?: Partial<FirebaseConfigEntity>
): Promise<{ user: AuthUserInfo | null; error?: string }> {
  const auth = getOrInitAuth(config);
  if (!auth) return { user: null };

  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      return {
        user: {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
          emailVerified: result.user.emailVerified
        }
      };
    }
  } catch (err: any) {
    console.warn('Error checking redirect auth result:', err);
    return { user: null, error: mapFirebaseAuthError(err) };
  }
  return { user: null };
}

/**
 * Signs out the current Firebase user.
 */
export async function signOutGoogle(config?: Partial<FirebaseConfigEntity>): Promise<void> {
  const auth = getOrInitAuth(config);
  if (!auth) return;

  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Error signing out:', err);
  }
}

/**
 * Subscribes to Firebase Auth state changes for the active BYOB project.
 */
export function subscribeToAuth(
  config: Partial<FirebaseConfigEntity> | undefined,
  callback: (user: AuthUserInfo | null) => void
): () => void {
  const auth = getOrInitAuth(config);
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (firebaseUser: User | null) => {
    if (firebaseUser) {
      callback({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        emailVerified: firebaseUser.emailVerified
      });
    } else {
      callback(null);
    }
  });
}
