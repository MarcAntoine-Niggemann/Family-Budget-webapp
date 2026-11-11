/**
 * Web Crypto API client-side encryption module.
 * Provides AES-GCM 256-bit encryption with PBKDF2 key derivation from a user PIN or Master Key.
 * Protects financial records stored in browser storage against physical/unauthorized device access.
 */

const SALT_SIZE = 16;
const IV_SIZE = 12;
const ITERATIONS = 100_000;

export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(plainText: string, pin: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));
  const key = await deriveKey(pin, salt);

  const encryptedContent = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  );

  const combined = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encryptedContent), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptData(cipherBase64: string, pin: string): Promise<string> {
  const dec = new TextDecoder();
  const binaryString = atob(cipherBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const salt = bytes.slice(0, SALT_SIZE);
  const iv = bytes.slice(SALT_SIZE, SALT_SIZE + IV_SIZE);
  const data = bytes.slice(SALT_SIZE + IV_SIZE);

  const key = await deriveKey(pin, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return dec.decode(decrypted);
}
