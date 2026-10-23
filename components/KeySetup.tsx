'use client';

import { useEffect, useState, useCallback } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import {
  generateIdentityKeypairJwk,
  loadPrivateKeyLocal,
  savePrivateKeyLocal,
  isKeyPairMatch,
  encryptPrivateKeyWithPassphrase,
  decryptPrivateKeyWithPassphrase,
} from '@/lib/crypto/e2ee';

type KeySyncStatus =
  | 'checking'
  | 'no_keys'
  | 'local_only'
  | 'remote_only_no_backup'
  | 'synced_no_local'
  | 'mismatch'
  | 'ready';

export default function KeySetup() {
  const supabase = createSupabaseBrowser();
  const [syncStatus, setSyncStatus] = useState<KeySyncStatus>('checking');
  const [statusMsg, setStatusMsg] = useState<string>('Checking cryptographic keys...');
  const [hasLocalPriv, setHasLocalPriv] = useState<boolean>(false);
  const [hasRemotePub, setHasRemotePub] = useState<boolean>(false);
  const [hasEncryptedBackup, setHasEncryptedBackup] = useState<boolean>(false);
  const [publicJwkSummary, setPublicJwkSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Generate + Passphrase setup
  const [showGenerate, setShowGenerate] = useState(false);
  const [genPassphrase, setGenPassphrase] = useState('');
  const [genPassphrase2, setGenPassphrase2] = useState('');
  const [genError, setGenError] = useState('');

  // Restore from passphrase (new browser)
  const [showRestore, setShowRestore] = useState(false);
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreError, setRestoreError] = useState('');

  // Manual import (JWK paste)
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  const checkKeys = useCallback(async () => {
    try {
      setSyncStatus('checking');
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        setStatusMsg('Not logged in. Sign in to view and initialize keys.');
        setSyncStatus('no_keys');
        return;
      }

      const uid = data.user.id;
      setUserId(uid);

      const priv = loadPrivateKeyLocal(uid);
      const localOk = !!priv;
      setHasLocalPriv(localOk);

      const { data: keyRow, error } = await supabase
        .from('user_keys')
        .select('public_jwk, encrypted_private_jwk, updated_at')
        .eq('user_id', uid)
        .maybeSingle();

      const remoteOk = !error && !!keyRow?.public_jwk;
      const backupOk = !error && !!keyRow?.encrypted_private_jwk;
      setHasRemotePub(remoteOk);
      setHasEncryptedBackup(backupOk);

      if (keyRow?.public_jwk) {
        const jwk = keyRow.public_jwk;
        setPublicJwkSummary(
          `ECDH ${jwk.crv || 'P-256'} — x: ${jwk.x ? jwk.x.slice(0, 10) + '...' : 'ok'}`
        );
      }

      const mismatch =
        localOk &&
        remoteOk &&
        priv &&
        keyRow?.public_jwk &&
        !isKeyPairMatch(priv, keyRow.public_jwk);

      if (mismatch) {
        setSyncStatus('mismatch');
        setStatusMsg(
          '⚠️ Key mismatch: The private key in this browser does not match the public key in the database. Messages were encrypted with the DB public key. Use "Restore with Passphrase" or re-generate a new keypair (note: this invalidates old messages).'
        );
      } else if (localOk && remoteOk) {
        setSyncStatus('ready');
        setStatusMsg(
          backupOk
            ? 'Ready ✓ — Private key present locally, public key published, encrypted backup in DB (accessible from any browser via passphrase).'
            : 'Partial ✓ — Key is set up but no encrypted backup. Re-generate with passphrase to enable cross-browser access.'
        );
      } else if (!localOk && remoteOk && backupOk) {
        setSyncStatus('synced_no_local');
        setStatusMsg(
          'Private key is missing from this browser but an encrypted backup exists in the DB. Enter your passphrase below to restore.'
        );
      } else if (!localOk && remoteOk && !backupOk) {
        setSyncStatus('remote_only_no_backup');
        setStatusMsg(
          'Public key is registered but the private key is missing from this browser with no encrypted backup. You must generate a new keypair here (old encrypted messages will become unreadable).'
        );
      } else if (localOk && !remoteOk) {
        setSyncStatus('local_only');
        setStatusMsg('Private key found locally but no public key published. Click "Set Up Keys" to publish.');
      } else {
        setSyncStatus('no_keys');
        setStatusMsg('No cryptographic keypair configured. Click "Set Up Keys" to begin.');
      }
    } catch (e: any) {
      setStatusMsg(`Error checking keys: ${e?.message}`);
      setSyncStatus('no_keys');
    }
  }, [supabase]);

  useEffect(() => {
    checkKeys();
    const onKeyUpdated = () => checkKeys();
    window.addEventListener('bsteg_key_updated', onKeyUpdated);
    return () => window.removeEventListener('bsteg_key_updated', onKeyUpdated);
  }, [checkKeys]);

  async function handleGenerate() {
    setGenError('');
    if (!userId) return;
    if (genPassphrase.length < 8) {
      setGenError('Passphrase must be at least 8 characters.');
      return;
    }
    if (genPassphrase !== genPassphrase2) {
      setGenError('Passphrases do not match.');
      return;
    }
    setBusy(true);
    setStatusMsg('Generating ECDH P-256 identity keypair...');
    try {
      const { publicJwk, privateJwk } = await generateIdentityKeypairJwk();
      savePrivateKeyLocal(userId, privateJwk);

      setStatusMsg('Encrypting private key with passphrase (PBKDF2 + AES-256-GCM)...');
      const encryptedBlob = await encryptPrivateKeyWithPassphrase(privateJwk, genPassphrase);

      setStatusMsg('Publishing public key and encrypted backup to registry...');
      const { error } = await supabase.from('user_keys').upsert(
        {
          user_id: userId,
          public_jwk: publicJwk,
          encrypted_private_jwk: encryptedBlob,
        },
        { onConflict: 'user_id' }
      );

      if (error) throw new Error(`Failed to publish keys: ${error.message}`);

      setGenPassphrase('');
      setGenPassphrase2('');
      setShowGenerate(false);
      await checkKeys();
    } catch (err: any) {
      setGenError(err?.message ?? 'Key generation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setRestoreError('');
    if (!userId || !restorePassphrase) return;
    setBusy(true);
    setStatusMsg('Fetching encrypted key backup from database...');
    try {
      const { data: keyRow, error } = await supabase
        .from('user_keys')
        .select('encrypted_private_jwk')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !keyRow?.encrypted_private_jwk) {
        throw new Error('No encrypted key backup found in database. You must generate a new keypair.');
      }

      setStatusMsg('Decrypting private key with passphrase...');
      const privateJwk = await decryptPrivateKeyWithPassphrase(
        keyRow.encrypted_private_jwk,
        restorePassphrase
      );

      savePrivateKeyLocal(userId, privateJwk);
      setRestorePassphrase('');
      setShowRestore(false);
      await checkKeys();
    } catch (err: any) {
      setRestoreError(err?.message ?? 'Restore failed');
    } finally {
      setBusy(false);
    }
  }

  function handleImportKey() {
    setImportError('');
    if (!userId) return;
    try {
      const parsed = JSON.parse(importText.trim()) as JsonWebKey;
      if (!parsed || parsed.kty !== 'EC') {
        throw new Error('Invalid key format. Expected ECDH EC JSON Web Key (JWK).');
      }
      savePrivateKeyLocal(userId, parsed);
      setHasLocalPriv(true);
      setShowImport(false);
      setImportText('');
      checkKeys();
    } catch (e: any) {
      setImportError(e?.message ?? 'Failed to parse JSON Web Key');
    }
  }

  function handleExportKey() {
    if (!userId) return;
    const priv = loadPrivateKeyLocal(userId);
    if (!priv) { alert('No local private key found to export.'); return; }
    navigator.clipboard.writeText(JSON.stringify(priv, null, 2));
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  }

  const statusColors: Record<KeySyncStatus, string> = {
    checking: 'text-slate-500',
    no_keys: 'text-amber-700',
    local_only: 'text-amber-700',
    remote_only_no_backup: 'text-red-700',
    synced_no_local: 'text-blue-700',
    mismatch: 'text-red-700',
    ready: 'text-emerald-700',
  };
  const statusIcon: Record<KeySyncStatus, string> = {
    checking: '⏳', no_keys: '⚠️', local_only: '⚠️',
    remote_only_no_backup: '🚫', synced_no_local: '📱', mismatch: '🔴', ready: '✅',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">E2EE Cryptographic Identity</h3>
            <p className="text-xs text-slate-500">ECDH P-256 + passphrase-encrypted backup for cross-device access</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasLocalPriv && (
            <button
              onClick={handleExportKey}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors border border-slate-200 cursor-pointer flex items-center gap-1.5"
            >
              <span>📋</span>
              <span>{copiedKey ? 'Copied!' : 'Export Key'}</span>
            </button>
          )}
          <button
            onClick={() => { setShowImport(!showImport); setShowGenerate(false); setShowRestore(false); }}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg transition-colors border border-slate-200 cursor-pointer flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Import JWK</span>
          </button>
          {(syncStatus === 'synced_no_local' || syncStatus === 'mismatch' || syncStatus === 'remote_only_no_backup') && hasEncryptedBackup && (
            <button
              onClick={() => { setShowRestore(!showRestore); setShowGenerate(false); setShowImport(false); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>🔑</span>
              <span>Restore with Passphrase</span>
            </button>
          )}
          <button
            onClick={() => { setShowGenerate(!showGenerate); setShowRestore(false); setShowImport(false); }}
            disabled={busy || !userId}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-3.5 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {busy ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 60" />
                </svg>
                Processing...
              </>
            ) : (syncStatus === 'ready' ? '🔄 Rotate Keypair' : '🔐 Set Up Keys')}
          </button>
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-[11px] text-slate-500 block mb-1 font-medium">Local Private Key</span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${hasLocalPriv ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-xs font-mono font-medium text-slate-800">
              {hasLocalPriv ? 'Present' : 'Missing — needs restore'}
            </span>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-[11px] text-slate-500 block mb-1 font-medium">Public Key in Registry</span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${hasRemotePub ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-xs font-mono font-medium text-slate-800">
              {hasRemotePub ? 'Published' : 'Unpublished'}
            </span>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <span className="text-[11px] text-slate-500 block mb-1 font-medium">Encrypted Backup (Cross-Browser)</span>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${hasEncryptedBackup ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-xs font-mono font-medium text-slate-800">
              {hasEncryptedBackup ? 'In DB (passphrase-locked)' : 'None — single-browser only'}
            </span>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      <div className={`bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs flex items-start gap-2 ${statusColors[syncStatus]}`}>
        <span className="mt-0.5 shrink-0">{statusIcon[syncStatus]}</span>
        <span className="leading-relaxed font-medium">{statusMsg}</span>
      </div>

      {/* === Generate Keypair Panel === */}
      {showGenerate && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              {syncStatus === 'ready' ? '🔄 Rotate ECDH Keypair' : '🔐 Generate & Publish Keys'}
            </span>
            <button onClick={() => setShowGenerate(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800 leading-relaxed">
            <strong>Passphrase protects cross-browser access:</strong> Your private key will be encrypted with this passphrase before being stored in the database. The server never sees the raw key. On any new browser or device, enter this passphrase at <strong>/keys</strong> to restore access. <strong>Do not lose this passphrase.</strong>
            {syncStatus === 'ready' && (
              <span className="block mt-1 text-red-700 font-semibold">
                ⚠️ Rotating creates a new keypair — old messages encrypted with your current public key will become unreadable.
              </span>
            )}
          </div>
          <input
            type="password"
            value={genPassphrase}
            onChange={(e) => setGenPassphrase(e.target.value)}
            placeholder="Choose a strong passphrase (min 8 characters)"
            className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-indigo-500"
          />
          <input
            type="password"
            value={genPassphrase2}
            onChange={(e) => setGenPassphrase2(e.target.value)}
            placeholder="Confirm passphrase"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-indigo-500"
          />
          {genError && <p className="text-xs text-red-600 font-medium">⚠️ {genError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowGenerate(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button
              onClick={handleGenerate}
              disabled={busy || genPassphrase.length < 8}
              className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
            >
              {busy ? 'Generating...' : 'Generate & Publish'}
            </button>
          </div>
        </div>
      )}

      {/* === Restore with Passphrase Panel === */}
      {showRestore && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">🔑 Restore Private Key (New Browser / Device)</span>
            <button onClick={() => setShowRestore(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Enter the passphrase you set when you first generated your keypair. Your encrypted private key will be fetched from the database and decrypted locally in this browser — nothing is sent to the server in plaintext.
          </p>
          <input
            type="password"
            value={restorePassphrase}
            onChange={(e) => setRestorePassphrase(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRestore()}
            placeholder="Enter your passphrase"
            className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-blue-500"
            autoFocus
          />
          {restoreError && <p className="text-xs text-red-600 font-medium">⚠️ {restoreError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowRestore(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button
              onClick={handleRestore}
              disabled={busy || !restorePassphrase}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg cursor-pointer"
            >
              {busy ? 'Restoring...' : 'Restore Key'}
            </button>
          </div>
        </div>
      )}

      {/* === Manual JWK Import Panel === */}
      {showImport && (
        <div className="p-4 bg-slate-50 border border-indigo-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">📥 Import Private Key (JWK JSON)</span>
            <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕ Close</button>
          </div>
          <p className="text-[11px] text-slate-500">Paste the exported JSON Web Key from your other browser or device.</p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"kty":"EC","crv":"P-256","d":"...","x":"...","y":"..."}'
            className="w-full text-xs font-mono p-2.5 bg-white border border-slate-200 rounded-lg focus:outline-indigo-500 min-h-[90px]"
          />
          {importError && <p className="text-xs text-red-600 font-medium">⚠️ {importError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowImport(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
            <button
              onClick={handleImportKey}
              disabled={!importText.trim()}
              className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg"
            >
              Save Key to Browser
            </button>
          </div>
        </div>
      )}

      {publicJwkSummary && (
        <div className="text-[11px] font-mono text-slate-400 px-1">{publicJwkSummary}</div>
      )}
    </div>
  );
}