import { bytesToB64, b64ToBytes, utf8ToBytes, bytesToUtf8 } from '@/lib/utils/encoding';
import {
  deriveAesKeyFromPassphrase,
  randomB64,
  encryptTextAesGcm,
  decryptTextAesGcm,
} from '@/lib/crypto/aesGcm';

const CURVE = 'P-256';

function randomBytes(n: number) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

async function importEcdhPublicJwk(jwk: JsonWebKey) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: CURVE }, true, []);
}

async function importEcdhPrivateJwk(jwk: JsonWebKey) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: CURVE }, true, ['deriveBits']);
}

async function hkdfToAesKey(sharedSecret: ArrayBuffer, salt: Uint8Array) {
  const ikm = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: Uint8Array.from(salt),
      info: Uint8Array.from(utf8ToBytes('biosteg-e2ee-v1')),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function generateIdentityKeypairJwk() {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveBits'],
  );

  const publicJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);

  return { publicJwk, privateJwk };
}

export function savePrivateKeyLocal(userId: string, privateJwk: JsonWebKey) {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(privateJwk);
    localStorage.setItem(`bsteg_priv_${userId}`, raw);
    sessionStorage.setItem(`bsteg_priv_${userId}`, raw);
    window.dispatchEvent(new Event('bsteg_key_updated'));
  } catch (e) {
    console.error('Failed to save private key locally:', e);
  }
}

export function loadPrivateKeyLocal(userId: string): JsonWebKey | null {
  if (typeof window === 'undefined') return null;
  try {
    const direct =
      localStorage.getItem(`bsteg_priv_${userId}`) ||
      sessionStorage.getItem(`bsteg_priv_${userId}`);
    if (direct) {
      return JSON.parse(direct) as JsonWebKey;
    }
  } catch (e) {
    console.error('Failed to load private key locally:', e);
  }
  return null;
}

/**
 * Checks if a private ECDH JWK matches a public ECDH JWK.
 * Since ECDH JWKs share the same public coordinates (x, y),
 * a matching private key will have identical x and y values.
 */
export function isKeyPairMatch(privJwk: JsonWebKey | null, pubJwk: JsonWebKey | null): boolean {
  if (!privJwk || !pubJwk) return false;
  if (!privJwk.x || !privJwk.y || !pubJwk.x || !pubJwk.y) return false;
  return privJwk.x === pubJwk.x && privJwk.y === pubJwk.y;
}

/**
 * Encrypt plaintext for receiver using receiver's public key.
 * Uses ephemeral ECDH keypair per message.
 */
export async function encryptForReceiver(plaintext: string, receiverPublicJwk: JsonWebKey) {
  const eph = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveBits'],
  );

  const receiverPub = await importEcdhPublicJwk(receiverPublicJwk);

  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverPub },
    eph.privateKey,
    256,
  );

  const salt = randomBytes(16);
  const key = await hkdfToAesKey(shared, salt);

  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8ToBytes(plaintext));

  const ephPubJwk = await crypto.subtle.exportKey('jwk', eph.publicKey);

  return {
    v: 2,
    alg: 'ECDH-P256+HKDF-SHA256+AES-256-GCM',
    ephPubJwk,
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    ctB64: bytesToB64(new Uint8Array(ct)),
  };
}

/**
 * Decrypt payload using receiver's private key (stored locally).
 */
export async function decryptForReceiver(payload: any, receiverPrivateJwk: JsonWebKey) {
  try {
    const priv = await importEcdhPrivateJwk(receiverPrivateJwk);
    const ephPub = await importEcdhPublicJwk(payload.ephPubJwk);

    const shared = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: ephPub },
      priv,
      256,
    );

    const salt = b64ToBytes(payload.saltB64);
    const key = await hkdfToAesKey(shared, salt);

    const iv = b64ToBytes(payload.ivB64);
    const ct = b64ToBytes(payload.ctB64);

    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return bytesToUtf8(new Uint8Array(pt));
  } catch (err: any) {
    console.error('[BioSteg E2EE] Decryption operation failed:', err);
    if (err?.name === 'OperationError' || err?.message?.includes('operation-specific')) {
      throw new Error(
        'Decryption key mismatch: The private key in this browser cannot decrypt this payload. ' +
        'This message was encrypted using a different public key registered in the database.'
      );
    }
    throw err;
  }
}

/**
 * Encrypts the private key JWK with a user passphrase using PBKDF2 + AES-256-GCM.
 * The result is safe to store in the database — the server never sees the plaintext key.
 *
 * Returns an opaque object: { saltB64, ivB64, ctB64 }
 */
export async function encryptPrivateKeyWithPassphrase(
  privateJwk: JsonWebKey,
  passphrase: string,
): Promise<{ saltB64: string; ivB64: string; ctB64: string }> {
  const saltB64 = randomB64(16);
  const aesKey = await deriveAesKeyFromPassphrase(passphrase, saltB64);
  const plaintext = JSON.stringify(privateJwk);
  const { ivB64, ctB64 } = await encryptTextAesGcm(plaintext, aesKey);
  return { saltB64, ivB64, ctB64 };
}

/**
 * Decrypts an encrypted private key blob (from the database) using the user's passphrase.
 * Throws if the passphrase is wrong (AES-GCM tag check fails).
 */
export async function decryptPrivateKeyWithPassphrase(
  encryptedBlob: { saltB64: string; ivB64: string; ctB64: string },
  passphrase: string,
): Promise<JsonWebKey> {
  try {
    const aesKey = await deriveAesKeyFromPassphrase(passphrase, encryptedBlob.saltB64);
    const plaintext = await decryptTextAesGcm(encryptedBlob.ivB64, encryptedBlob.ctB64, aesKey);
    return JSON.parse(plaintext) as JsonWebKey;
  } catch {
    throw new Error('Incorrect passphrase — key decryption failed. Please re-enter your passphrase.');
  }
}