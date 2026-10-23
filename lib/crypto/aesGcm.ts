import { b64ToBytes, bytesToB64, utf8ToBytes, bytesToUtf8 } from '@/lib/utils/encoding';

export async function deriveAesKeyFromPassphrase(passphrase: string, saltB64: string) {
  const salt = b64ToBytes(saltB64);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    utf8ToBytes(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function randomB64(bytes: number) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return bytesToB64(arr);
}

export async function encryptTextAesGcm(plaintext: string, key: CryptoKey) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    utf8ToBytes(plaintext)
  );

  return { ivB64: bytesToB64(iv), ctB64: bytesToB64(new Uint8Array(ctBuf)) };
}

export async function decryptTextAesGcm(ivB64: string, ctB64: string, key: CryptoKey) {
  const iv = b64ToBytes(ivB64);
  const ct = b64ToBytes(ctB64);

  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return bytesToUtf8(new Uint8Array(ptBuf));
}