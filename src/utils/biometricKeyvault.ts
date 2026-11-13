import { BIOMETRIC_CRED_STORAGE_KEY } from './storage';

/**
 * Biometric Hardware Keyvault integration using WebAuthn (FIDO2 / Platform Authenticator).
 * Ties cryptographic verification directly to the device's hardware security module
 * (Apple Secure Enclave on iOS/macOS / Android Hardware Keystore / Windows Hello).
 */

export interface BiometricStatus {
  isSupported: boolean;
  isPlatformAvailable: boolean;
  hasEnrolledCredential: boolean;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function clearBiometricCredential(): void {
  try {
    localStorage.removeItem(BIOMETRIC_CRED_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Checks if the current browser and device support native biometric verification (Touch ID, Face ID, Fingerprint).
 */
export async function checkBiometricSupport(): Promise<BiometricStatus> {
  const isSupported =
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';

  if (!isSupported) {
    return {
      isSupported: false,
      isPlatformAvailable: false,
      hasEnrolledCredential: false
    };
  }

  try {
    const isPlatformAvailable =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    const hasEnrolledCredential = !!localStorage.getItem(BIOMETRIC_CRED_STORAGE_KEY);

    return {
      isSupported: true,
      isPlatformAvailable,
      hasEnrolledCredential
    };
  } catch {
    return {
      isSupported: false,
      isPlatformAvailable: false,
      hasEnrolledCredential: false
    };
  }
}

/**
 * Enrolls the user's biometric credential in the device hardware Secure Enclave.
 */
export async function enrollBiometricCredential(
  userName: string = 'Vault Owner',
  userEmail: string = 'vault@family.local'
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!window.PublicKeyCredential) {
      throw new Error('WebAuthn not supported');
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Budget Family',
          id: window.location.hostname
        },
        user: {
          id: userId,
          name: userEmail,
          displayName: userName
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    })) as PublicKeyCredential | null;

    if (credential) {
      const encodedId = credential.rawId
        ? arrayBufferToBase64Url(credential.rawId)
        : credential.id;
      if (encodedId) {
        localStorage.setItem(BIOMETRIC_CRED_STORAGE_KEY, encodedId);
        return { success: true };
      }
    }

    return { success: false, error: 'Registration cancelled or failed.' };
  } catch (err: any) {
    return {
      success: false,
      error:
        err.name === 'NotAllowedError'
          ? 'Biometric prompt was cancelled or blocked by browser permissions.'
          : err.message || 'Biometric enrollment failed.'
    };
  }
}

/**
 * Prompts the device's hardware biometric scanner (Touch ID, Face ID, Fingerprint).
 * Only succeeds if biometric verification is verified by the device's hardware enclave.
 */
export async function authenticateWithBiometrics(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    if (!window.PublicKeyCredential) {
      throw new Error('WebAuthn not supported on this browser');
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const credId = localStorage.getItem(BIOMETRIC_CRED_STORAGE_KEY);
    const allowCredentials = credId
      ? [
          {
            type: 'public-key' as const,
            id: base64UrlToUint8Array(credId)
          }
        ]
      : undefined;

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials,
        userVerification: 'required',
        timeout: 60000
      }
    });

    if (assertion) {
      return { success: true };
    }

    return { success: false, error: 'Biometric verification failed.' };
  } catch (err: any) {
    return {
      success: false,
      error:
        err.name === 'NotAllowedError'
          ? 'Biometric verification cancelled or not permitted.'
          : err.message || 'Biometric authentication unavailable.'
    };
  }
}

/**
 * Authenticates with existing enrolled biometric credential, or enrolls one first
 * if the user has a platform authenticator but hasn't enrolled on this device yet.
 */
export async function verifyOrEnrollBiometrics(
  userName: string = 'Vault Owner',
  userEmail: string = 'vault@family.local'
): Promise<{ success: boolean; enrolledNow?: boolean; error?: string }> {
  const status = await checkBiometricSupport();
  if (!status.isSupported || !status.isPlatformAvailable) {
    return {
      success: false,
      error: 'Hardware biometric authenticator (Touch ID / Face ID / Fingerprint) is unavailable on this device or browser context.'
    };
  }

  if (status.hasEnrolledCredential) {
    const authRes = await authenticateWithBiometrics();
    if (authRes.success) {
      return { success: true };
    }
    return authRes;
  }

  const enrollRes = await enrollBiometricCredential(userName, userEmail);
  if (enrollRes.success) {
    return { success: true, enrolledNow: true };
  }
  return enrollRes;
}
