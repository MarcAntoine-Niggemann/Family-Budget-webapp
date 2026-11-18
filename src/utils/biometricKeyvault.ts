import { BIOMETRIC_CRED_STORAGE_KEY } from './storage';

/**
 * Biometric Hardware Keyvault integration using WebAuthn (FIDO2 / Platform Authenticator)
 * with WebAuthn PRF extension support for hardware-derived AES-256-GCM vault keys.
 */

export interface BiometricStatus {
  isSupported: boolean;
  isPlatformAvailable: boolean;
  hasEnrolledCredential: boolean;
}

export interface BiometricPrfEnrollResult {
  success: boolean;
  credentialId?: string;
  prfSupported: boolean;
  prfSecret?: ArrayBuffer;
  error?: string;
}

export interface BiometricPrfAuthResult {
  success: boolean;
  prfSecret?: ArrayBuffer;
  error?: string;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
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

export function saveBiometricCredentialId(credentialId: string): void {
  try {
    localStorage.setItem(BIOMETRIC_CRED_STORAGE_KEY, credentialId);
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
 * Enrolls a hardware WebAuthn credential and evaluates WebAuthn PRF extension support
 * so the authenticator can derive cryptographic key material for AES-256-GCM storage encryption.
 */
export async function enrollBiometricWithPrf(
  userName: string = 'Vault Owner',
  userEmail: string = 'vault@family.local',
  prfSalt?: Uint8Array
): Promise<BiometricPrfEnrollResult> {
  try {
    if (!window.PublicKeyCredential) {
      return {
        success: false,
        prfSupported: false,
        error: 'WebAuthn is not supported in this browser.'
      };
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const extensions: Record<string, any> = prfSalt
      ? { prf: { eval: { first: prfSalt as BufferSource } } }
      : { prf: {} };

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
        extensions: extensions as any,
        timeout: 60000,
        attestation: 'none'
      }
    })) as PublicKeyCredential | null;

    if (!credential) {
      return {
        success: false,
        prfSupported: false,
        error: 'Biometric registration was cancelled or failed.'
      };
    }

    const encodedId = credential.rawId
      ? arrayBufferToBase64Url(credential.rawId)
      : credential.id;

    if (!encodedId) {
      return {
        success: false,
        prfSupported: false,
        error: 'Unable to read WebAuthn credential identifier.'
      };
    }

    saveBiometricCredentialId(encodedId);

    const extResults = (credential.getClientExtensionResults?.() || {}) as any;
    const prfResult = extResults?.prf;
    const prfEnabled = Boolean(prfResult?.enabled);
    let prfSecret: ArrayBuffer | undefined = prfResult?.results?.first;

    // Many authenticators report prf.enabled=true on create() and emit results.first on get()
    if (prfEnabled && !prfSecret && prfSalt) {
      const assertionRes = await authenticateWithBiometricPrf(encodedId, prfSalt);
      if (assertionRes.success && assertionRes.prfSecret) {
        prfSecret = assertionRes.prfSecret;
      }
    }

    return {
      success: true,
      credentialId: encodedId,
      prfSupported: Boolean(prfSecret),
      prfSecret
    };
  } catch (err: any) {
    return {
      success: false,
      prfSupported: false,
      error:
        err.name === 'NotAllowedError'
          ? 'Biometric prompt was cancelled or blocked by browser permissions.'
          : err.message || 'Biometric enrollment failed.'
    };
  }
}

/**
 * Prompts the hardware biometric scanner (Touch ID, Face ID, Fingerprint)
 * and evaluates the WebAuthn PRF extension when a salt is provided.
 */
export async function authenticateWithBiometricPrf(
  credentialId?: string,
  prfSalt?: Uint8Array
): Promise<BiometricPrfAuthResult> {
  try {
    if (!window.PublicKeyCredential) {
      throw new Error('WebAuthn not supported on this browser');
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const resolvedCredId = credentialId || localStorage.getItem(BIOMETRIC_CRED_STORAGE_KEY);
    const allowCredentials = resolvedCredId
      ? [
          {
            type: 'public-key' as const,
            id: base64UrlToUint8Array(resolvedCredId) as BufferSource
          }
        ]
      : undefined;

    const publicKeyOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: window.location.hostname,
      allowCredentials,
      userVerification: 'required',
      timeout: 60000
    };

    if (prfSalt) {
      (publicKeyOptions as any).extensions = {
        prf: {
          eval: {
            first: prfSalt as BufferSource
          }
        }
      };
    }

    const assertion = (await navigator.credentials.get({
      publicKey: publicKeyOptions
    })) as PublicKeyCredential | null;

    if (!assertion) {
      return { success: false, error: 'Biometric verification failed.' };
    }

    const extResults = (assertion.getClientExtensionResults?.() || {}) as any;
    const prfSecret: ArrayBuffer | undefined = extResults?.prf?.results?.first;

    return {
      success: true,
      prfSecret
    };
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
