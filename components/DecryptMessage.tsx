'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { extractPayloadFromPng } from '@/lib/stego/pngLsb';
import { bytesToUtf8 } from '@/lib/utils/encoding';
import { getBiometricStatus, verifyBiometric, registerPasskey } from '@/lib/webauthn/browser';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import {
  decryptForReceiver,
  loadPrivateKeyLocal,
  savePrivateKeyLocal,
  generateIdentityKeypairJwk,
  isKeyPairMatch,
  decryptPrivateKeyWithPassphrase,
} from '@/lib/crypto/e2ee';
import { setDecryptedMessage } from '@/lib/utils/decryptedCache';

type PayloadV2 = {
  v: number;
  alg: string;
  ephPubJwk: JsonWebKey;
  saltB64: string;
  ivB64: string;
  ctB64: string;
};

function b64ToBytes(b64: string): Uint8Array {
  const sanitized = b64.replace(/\s+/g, '');
  const bin = atob(sanitized);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export default function DecryptMessage({
  filePath,
  messageId,
  onDecrypted,
}: {
  filePath: string;
  messageId: string;
  onDecrypted?: (text: string) => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [decryptedText, setDecryptedText] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [stepMsg, setStepMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Inline import modal states
  const [showInlineImport, setShowInlineImport] = useState(false);
  const [inlineKeyText, setInlineKeyText] = useState('');
  const [inlineKeyErr, setInlineKeyErr] = useState('');

  // Inline passphrase restore (for new browser / device)
  const [showPassphraseRestore, setShowPassphraseRestore] = useState(false);
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreErr, setRestoreErr] = useState('');
  const [hasEncryptedBackup, setHasEncryptedBackup] = useState(false);

  async function ensureBiometricVerified() {
    const st = await getBiometricStatus();
    if (st?.verified) return true;

    setStepMsg('Prompting biometric sensor (Touch ID / Windows Hello)...');
    try {
      await verifyBiometric();
    } catch (err: any) {
      const msg = err?.message || '';
      // If user has not yet registered a passkey on this device, prompt to register one
      if (
        msg.includes('No passkey') ||
        msg.includes('not found') ||
        msg.includes('no credentials')
      ) {
        setStepMsg('Registering biometric passkey for this device...');
        await registerPasskey();
      } else {
        throw err;
      }
    }

    const st2 = await getBiometricStatus();
    return st2?.verified ?? false;
  }

  async function onDecrypt() {
    setErrorMsg('');
    setDecryptedText('');
    setBusy(true);
    setStepMsg('Verifying biometrics...');

    try {
      // 1) Verify biometrics (Touch ID / Windows Hello / Passkey)
      const ok = await ensureBiometricVerified();
      if (!ok) {
        throw new Error('Biometric verification required to access encrypted carrier.');
      }

      setStepMsg('Retrieving cryptographic identity...');
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes?.user) {
        throw new Error(userErr?.message ?? 'User session not found.');
      }

      const myUserId = userRes.user.id;
      setCurrentUserId(myUserId);

      let privJwk = loadPrivateKeyLocal(myUserId);
      if (!privJwk) {
        // Check if an encrypted backup is available in the DB
        const { data: kRow } = await supabase
          .from('user_keys')
          .select('encrypted_private_jwk')
          .eq('user_id', myUserId)
          .maybeSingle();
        const hasBackup = !!kRow?.encrypted_private_jwk;
        setHasEncryptedBackup(hasBackup);
        if (hasBackup) {
          setShowPassphraseRestore(true);
          throw new Error(
            'Private key missing on this browser. An encrypted backup is available — enter your passphrase below to restore access.'
          );
        }
        throw new Error(
          'Missing local private key on this browser. Please visit Key Setup (/keys) or paste your key below to unlock.'
        );
      }

      // Check key matching with public key in database
      const { data: keyRow } = await supabase
        .from('user_keys')
        .select('public_jwk')
        .eq('user_id', myUserId)
        .maybeSingle();

      if (keyRow?.public_jwk && !isKeyPairMatch(privJwk, keyRow.public_jwk)) {
        console.warn('[BioSteg] Local private key does not match published public key in DB.');
      }

      // 2) Download gated carrier
      setStepMsg('Downloading carrier image from secure storage...');
      console.log('[BioSteg] Requesting carrier for message:', messageId, filePath);
      const res = await fetch('/api/messages/decrypt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filePath, messageId }),
      });

      if (res.status === 410) {
        throw new Error('Message expired or self-destructed.');
      }

      const json = (await readJsonSafe(res)) as {
        carrierB64?: string;
        mimeType?: string;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json.error || `Server decrypt error (status ${res.status})`);
      }
      if (!json.carrierB64) {
        throw new Error('No carrier payload returned from server.');
      }

      // 3) Extract steganographic bits
      setStepMsg('Extracting PNG LSB steganographic bits...');
      console.log('[BioSteg] Extracting payload from carrier (b64 length:', json.carrierB64.length, ')');
      const carrierBytes = b64ToBytes(json.carrierB64);
      const carrierBlob = new Blob([Uint8Array.from(carrierBytes)], { type: json.mimeType || 'image/png' });

      const payloadBytes = await extractPayloadFromPng(carrierBlob);
      const payloadText = bytesToUtf8(payloadBytes);
      let payload: PayloadV2;
      try {
        payload = JSON.parse(payloadText) as PayloadV2;
      } catch (parseErr) {
        console.error('[BioSteg] Payload JSON parse error:', parseErr, payloadText);
        throw new Error('Steganographic carrier corrupted: Extracted bits did not form a valid JSON payload.');
      }

      if (!payload || payload.v !== 2) {
        throw new Error('Unsupported payload format. Expected v=2 auto E2EE.');
      }

      // 4) Decrypt with ECDH + AES-GCM
      setStepMsg('Deriving HKDF key & decrypting AES-256-GCM...');
      console.log('[BioSteg] Decrypting payload with ECDH private key...');
      const plaintext = await decryptForReceiver(payload, privJwk);
      console.log('[BioSteg] Successfully decrypted plaintext message!');

      setDecryptedText(plaintext);
      setStepMsg('');

      // Cache decrypted text so carrier image is ignored and plain WhatsApp text is displayed permanently
      setDecryptedMessage(myUserId, messageId, plaintext);
      onDecrypted?.(plaintext);

      // 5) Mark as read in database
      await supabase.from('messages').update({ status: 'read' }).eq('id', messageId);
    } catch (e: any) {
      console.error('[BioSteg] Decryption failed:', e);
      const rawMsg =
        (typeof e?.message === 'string' && e.message.trim().length > 0)
          ? e.message.trim()
          : (e?.name ? `${e.name}: Operation failed` : 'Decryption failed (key mismatch or carrier altered)');
      setErrorMsg(rawMsg);
      setStepMsg('');
    } finally {
      setBusy(false);
    }
  }

  function handleSaveInlineKey() {
    if (!currentUserId) return;
    setInlineKeyErr('');
    try {
      const parsed = JSON.parse(inlineKeyText.trim()) as JsonWebKey;
      if (!parsed || parsed.kty !== 'EC') {
        throw new Error('Invalid key format. Expected ECDH EC JSON Web Key.');
      }
      savePrivateKeyLocal(currentUserId, parsed);
      setShowInlineImport(false);
      setInlineKeyText('');
      setErrorMsg('');
      // Retry decryption automatically
      setTimeout(() => onDecrypt(), 100);
    } catch (e: any) {
      setInlineKeyErr(e?.message ?? 'Invalid JSON key format');
    }
  }

  async function handlePassphraseRestore() {
    setRestoreErr('');
    if (!currentUserId || !restorePassphrase) return;
    setBusy(true);
    try {
      const { data: kRow, error } = await supabase
        .from('user_keys')
        .select('encrypted_private_jwk')
        .eq('user_id', currentUserId)
        .maybeSingle();
      if (error || !kRow?.encrypted_private_jwk) {
        throw new Error('No encrypted backup found in database.');
      }
      const privateJwk = await decryptPrivateKeyWithPassphrase(
        kRow.encrypted_private_jwk,
        restorePassphrase
      );
      savePrivateKeyLocal(currentUserId, privateJwk);
      setShowPassphraseRestore(false);
      setRestorePassphrase('');
      setErrorMsg('');
      setTimeout(() => onDecrypt(), 100);
    } catch (e: any) {
      setRestoreErr(e?.message ?? 'Restore failed. Check your passphrase.');
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickGenerateKey() {
    if (!currentUserId) return;
    try {
      setBusy(true);
      setStepMsg('Generating identity keypair...');
      const { publicJwk, privateJwk } = await generateIdentityKeypairJwk();
      savePrivateKeyLocal(currentUserId, privateJwk);
      await supabase.from('user_keys').upsert(
        { user_id: currentUserId, public_jwk: publicJwk },
        { onConflict: 'user_id' }
      );
      setErrorMsg('');
      setTimeout(() => onDecrypt(), 100);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Failed to generate keypair');
    } finally {
      setBusy(false);
    }
  }

  const isKeyIssue =
    errorMsg.includes('Key') ||
    errorMsg.includes('key') ||
    errorMsg.includes('mismatch') ||
    errorMsg.includes('private') ||
    errorMsg.includes('setup');

  return (
    <div className="mt-1">
      {!decryptedText && (
        <button
          onClick={onDecrypt}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-70"
        >
          {busy ? (
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 60" />
            </svg>
          ) : (
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 004 11m0 0a8 8 0 008 8c.7 0 1.385-.06 2.05-.174" />
            </svg>
          )}
          {busy ? (stepMsg || 'Decrypting...') : errorMsg ? 'Retry Decrypt' : 'Touch Biometrics to Unlock'}
        </button>
      )}

      {errorMsg && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 p-3 rounded-xl flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span className="text-base shrink-0">⚠️</span>
            <span className="leading-snug">{errorMsg}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-red-100">
            {hasEncryptedBackup && (
              <button
                type="button"
                onClick={() => { setShowPassphraseRestore(!showPassphraseRestore); setShowInlineImport(false); }}
                className="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg cursor-pointer"
              >
                🔑 Enter Passphrase to Restore
              </button>
            )}
            <Link
              href="/keys"
              className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg"
            >
              Open Key Setup (/keys) &rarr;
            </Link>

            <button
              type="button"
              onClick={() => setShowInlineImport(!showInlineImport)}
              className="text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-lg cursor-pointer"
            >
              📥 Paste Private Key
            </button>

            {isKeyIssue && (
              <button
                type="button"
                onClick={handleQuickGenerateKey}
                className="text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-lg cursor-pointer"
              >
                ⚡ Generate Matching Key
              </button>
            )}
          </div>

          {/* Passphrase restore panel */}
          {showPassphraseRestore && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
              <span className="text-[11px] font-bold text-slate-800 block">🔑 Restore from Passphrase:</span>
              <p className="text-[10px] text-slate-500">Enter the passphrase you used when setting up your keys. Your encrypted private key will be decrypted locally.</p>
              <input
                type="password"
                value={restorePassphrase}
                onChange={(e) => setRestorePassphrase(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePassphraseRestore()}
                placeholder="Enter your passphrase"
                className="w-full text-[10px] p-2 border border-slate-300 rounded-lg focus:outline-blue-500 text-slate-900"
                autoFocus
              />
              {restoreErr && <p className="text-[10px] text-red-600 font-semibold">{restoreErr}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPassphraseRestore(false)}
                  className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePassphraseRestore}
                  disabled={busy || !restorePassphrase}
                  className="px-3.5 py-1 text-[11px] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
                >
                  {busy ? 'Restoring...' : 'Restore & Decrypt'}
                </button>
              </div>
            </div>
          )}

          {showInlineImport && (
            <div className="mt-2 p-3 bg-white border border-indigo-200 rounded-xl space-y-2">
              <span className="text-[11px] font-bold text-slate-800 block">
                Paste JSON Private Key:
              </span>
              <textarea
                value={inlineKeyText}
                onChange={(e) => setInlineKeyText(e.target.value)}
                placeholder='{"kty":"EC","crv":"P-256","d":"...","x":"...","y":"..."}'
                className="w-full text-[10px] font-mono p-2 border border-slate-300 rounded-lg focus:outline-indigo-500 h-18 text-slate-900"
              />
              {inlineKeyErr && (
                <p className="text-[10px] text-red-600 font-semibold">{inlineKeyErr}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowInlineImport(false)}
                  className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveInlineKey}
                  className="px-3.5 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg cursor-pointer"
                >
                  Save & Decrypt
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {decryptedText && (
        <div className="mt-2 p-3 bg-white/90 border border-emerald-200 rounded-xl shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold mb-1">
            <span>🔓</span>
            <span>Decrypted Secret Message</span>
          </div>
          <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed select-text font-normal">
            {decryptedText}
          </p>
        </div>
      )}
    </div>
  );
}