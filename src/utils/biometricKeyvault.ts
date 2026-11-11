/**
 * Biometric Hardware Keyvault integration using WebAuthn (FIDO2 / Platform Authenticator).
 * Ties cryptographic key access directly to the phone's hardware security module
 * (Apple Secure Enclave on iOS / Android Hardware Keystore & Titan M).
 */

export interface BiometricStatus {
  isSupported: boolean;
  isPlatformAvailable: boolean;
  hasEnrolledCredential: boolean;
}

const CREDENTIAL_STORAGE_KEY = 'fbv_biometric_cred_id';

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
    const hasEnrolledCredential = !!localStorage.getItem(CREDENTIAL_STORAGE_KEY);

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
          name: 'Family Budget Vault',
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
          authenticatorAttachment: 'platform', // Enforce device hardware: Touch ID / Face ID / Android Keystore
          userVerification: 'required', // Enforce biometric / fingerprint verification
          residentKey: 'preferred'
        },
        timeout: 60000,
        attestation: 'none'
      }
    })) as PublicKeyCredential;

    if (credential && credential.id) {
      localStorage.setItem(CREDENTIAL_STORAGE_KEY, credential.id);
      return { success: true };
    }

    return { success: false, error: 'Registration cancelled or failed.' };
  } catch (err: any) {
    return {
      success: false,
      error: err.name === 'NotAllowedError'
        ? 'Accès biométrique refusé ou annulé par l’utilisateur.'
        : err.message || 'Erreur lors de l’enrôlement biométrique.'
    };
  }
}

/**
 * Prompts the phone's hardware biometric scanner (Touch ID, Face ID, Android Fingerprint).
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

    const credId = localStorage.getItem(CREDENTIAL_STORAGE_KEY);
    const allowCredentials = credId
      ? [
          {
            type: 'public-key' as const,
            id: Uint8Array.from(atob(credId), c => c.charCodeAt(0))
          }
        ]
      : undefined;

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials,
        userVerification: 'required', // Guarantees fingerprint or Face ID match
        timeout: 60000
      }
    });

    if (assertion) {
      return { success: true };
    }

    return { success: false, error: 'Biometric verification failed.' };
  } catch (err: any) {
    // If no credential is saved yet, try enrolling first or return helpful error
    return {
      success: false,
      error:
        err.name === 'NotAllowedError'
          ? 'Empreinte ou visage non reconnu / annulé.'
          : err.message || 'Authentification biométrique non disponible.'
    };
  }
}
