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

function mapFirebaseAuthError(err: any): string {
  const code = err?.code || '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  switch (code) {
    case 'auth/unauthorized-domain':
      return `Domaine non autorisé (${hostname}). Ajoutez « ${hostname} » dans Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/operation-not-allowed':
      return `Le fournisseur Google Sign-In n'est pas activé dans votre projet Firebase. Activez-le dans Firebase Console → Authentication → Sign-in method → Google.`;
    case 'auth/invalid-api-key':
      return `Clé Web API Firebase invalide (auth/invalid-api-key). Vérifiez la clé saisie.`;
    case 'auth/network-request-failed':
      return `Erreur réseau lors de la connexion à Firebase Auth. Vérifiez votre Project ID et votre connexion internet.`;
    case 'auth/popup-closed-by-user':
      return `Connexion Google annulée (fenêtre fermée avant la fin).`;
    case 'auth/cancelled-popup-request':
      return `Demande de connexion Google interrompue. Veuillez réessayer.`;
    default:
      return err?.message || `Erreur Google OAuth (${code || 'inconnue'}).`;
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
  const auth = getOrInitAuth(config);
  if (!auth) {
    return {
      success: false,
      error: 'Configuration Firebase incomplète : veuillez saisir votre Project ID et votre Web API Key (BYOB).'
    };
  }

  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({
    prompt: 'select_account'
  });

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

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

    if (err?.code === 'auth/popup-blocked') {
      try {
        if (pendingByob) {
          savePendingByobConfig(pendingByob);
        }
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
  }
}

/**
 * Handles redirect result on page reload (if redirect flow was triggered).
 */
export async function checkRedirectAuthResult(
  config?: Partial<FirebaseConfigEntity>
): Promise<AuthUserInfo | null> {
  const auth = getOrInitAuth(config);
  if (!auth) return null;

  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      return {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
        emailVerified: result.user.emailVerified
      };
    }
  } catch (err) {
    console.warn('Error checking redirect auth result:', err);
  }
  return null;
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
