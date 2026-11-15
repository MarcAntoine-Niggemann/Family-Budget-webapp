/**
 * Web Crypto API client-side encryption module.
 * Provides AES-GCM 256-bit authenticated encryption with:
 * - Random 256-bit Data Encryption Keys (DEK) for local vault & financial cache
 * - Key Encryption Keys (KEK) derived from WebAuthn PRF hardware secrets (HKDF-SHA256)
 *   and/or a user Vault PIN (PBKDF2-SHA256).
 */

const SALT_SIZE = 16;
const IV_SIZE = 12;
const PBKDF2_ITERATIONS = 120_000;

export interface EncryptedEnvelope {
  v: 2;
  alg: 'AES-GCM';
  iv: string; // base64
  ct: string; // base64
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateRandomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

export function generateRawDek(): Uint8Array {
  return generateRandomBytes(32);
}

export async function importDekFromRaw(
  rawDek: Uint8Array,
  extractable: boolean = true
): Promise<CryptoKey> {
  if (rawDek.byteLength !== 32) {
    throw new Error('Invalid vault key length.');
  }
  return crypto.subtle.importKey(
    'raw',
    rawDek as BufferSource,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

export async function exportDekRaw(dek: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', dek);
  return new Uint8Array(raw);
}

/**
 * Derives a 256-bit AES-GCM Key Encryption Key (KEK) from a WebAuthn PRF output via HKDF-SHA256.
 */
export async function deriveKekFromPrfSecret(
  prfOutput: ArrayBuffer,
  hkdfSalt: Uint8Array
): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  const info = new TextEncoder().encode('fbv-local-vault-kek-v2');
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: hkdfSalt as BufferSource,
      info
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives a 256-bit AES-GCM Key Encryption Key (KEK) from a user Vault PIN via PBKDF2-SHA256.
 */
export async function deriveKekFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
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
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapDekWithKek(
  rawDek: Uint8Array,
  kek: CryptoKey
): Promise<EncryptedEnvelope> {
  const iv = generateRandomBytes(IV_SIZE);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    kek,
    rawDek as BufferSource
  );
  return {
    v: 2,
    alg: 'AES-GCM',
    iv: uint8ToBase64(iv),
    ct: uint8ToBase64(new Uint8Array(ctBuf))
  };
}

export async function unwrapDekWithKek(
  envelope: EncryptedEnvelope,
  kek: CryptoKey
): Promise<Uint8Array> {
  if (!envelope || envelope.v !== 2 || envelope.alg !== 'AES-GCM') {
    throw new Error('Invalid encrypted key envelope.');
  }
  const iv = base64ToUint8(envelope.iv);
  const ct = base64ToUint8(envelope.ct);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    kek,
    ct as BufferSource
  );
  return new Uint8Array(plainBuf);
}

export async function encryptJsonWithKey<T>(data: T, dek: CryptoKey): Promise<string> {
  const iv = generateRandomBytes(IV_SIZE);
  const plainBytes = new TextEncoder().encode(JSON.stringify(data));
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    plainBytes
  );
  const envelope: EncryptedEnvelope = {
    v: 2,
    alg: 'AES-GCM',
    iv: uint8ToBase64(iv),
    ct: uint8ToBase64(new Uint8Array(ctBuf))
  };
  return JSON.stringify(envelope);
}

export async function decryptJsonWithKey<T>(
  serializedEnvelope: string,
  dek: CryptoKey
): Promise<T> {
  const envelope = JSON.parse(serializedEnvelope) as EncryptedEnvelope;
  if (!envelope || envelope.v !== 2 || envelope.alg !== 'AES-GCM' || !envelope.iv || !envelope.ct) {
    throw new Error('Corrupted or unencrypted storage payload.');
  }
  const iv = base64ToUint8(envelope.iv);
  const ct = base64ToUint8(envelope.ct);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    ct as BufferSource
  );
  const jsonText = new TextDecoder().decode(plainBuf);
  return JSON.parse(jsonText) as T;
}

export function isEncryptedEnvelopeString(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return (
      !!parsed &&
      parsed.v === 2 &&
      parsed.alg === 'AES-GCM' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.ct === 'string'
    );
  } catch {
    return false;
  }
}

export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKekFromPin(pin, salt);
}

export async function encryptData(plainText: string, pin: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = generateRandomBytes(SALT_SIZE);
  const iv = generateRandomBytes(IV_SIZE);
  const key = await deriveKey(pin, salt);

  const encryptedContent = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(plainText)
  );

  const combined = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encryptedContent), salt.length + iv.length);

  return uint8ToBase64(combined);
}

export async function decryptData(cipherBase64: string, pin: string): Promise<string> {
  const dec = new TextDecoder();
  const bytes = base64ToUint8(cipherBase64);

  const salt = bytes.slice(0, SALT_SIZE);
  const iv = bytes.slice(SALT_SIZE, SALT_SIZE + IV_SIZE);
  const data = bytes.slice(SALT_SIZE + IV_SIZE);

  const key = await deriveKey(pin, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource
  );

  return dec.decode(decrypted);
}
