'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

async function wipeBrowserStorage() {
  // Clear Web storage
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}

  // Clear Cache Storage
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}

  // Clear IndexedDB (best-effort)
  try {
    const anyIDB: any = indexedDB as any;
    if (typeof anyIDB.databases === 'function') {
      const dbs = await anyIDB.databases();
      await Promise.all(
        (dbs ?? [])
          .map((db: any) => db?.name)
          .filter(Boolean)
          .map((name: string) => new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          })),
      );
    }
  } catch {}
}

export default function PanicButton() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleConfirmedPanic() {
    setErrorMsg('');
    setBusy(true);
    try {
      // 1) Ask server to clear httpOnly cookies (bsteg_uv, challenges) + sign out SSR cookies
      const res = await fetch('/api/security/panic', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server panic route failed: ${text || res.statusText}`);
      }

      // 2) Sign out on client side too (clears any client-held session state)
      await supabase.auth.signOut();

      // 3) Wipe local cryptographic artifacts and storage
      await wipeBrowserStorage();

      // 4) Navigate away + hard refresh
      setIsOpen(false);
      router.push('/login');
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Emergency wipe encountered an error.');
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="biosteg-btn-danger w-full text-left flex items-center justify-between text-xs px-3 py-2"
        style={{
          background: 'rgba(239, 68, 68, 0.1)',
          color: '#f87171',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        <span className="flex items-center gap-2">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Emergency Wipe
        </span>
        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-red-950/60 text-red-300 border border-red-800/40">
          PANIC
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              backgroundColor: '#111827',
              border: '1px solid #dc2626',
              borderRadius: 12,
              maxWidth: 480,
              width: '100%',
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(220, 38, 38, 0.25)',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(220, 38, 38, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                }}
              >
                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f87171' }}>
                  Emergency Security Wipe
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                  Irreversible client-side cryptographic wipe
                </p>
              </div>
            </div>

            <div style={{ fontSize: 13, lineHeight: '1.6', color: '#cbd5e1', marginBottom: 20 }}>
              <p style={{ margin: '0 0 10px 0' }}>
                Executing an Emergency Wipe will:
              </p>
              <ul style={{ paddingLeft: 20, margin: '0 0 12px 0', listStyleType: 'disc' }}>
                <li>Revoke all biometric UV (User Verification) security cookies.</li>
                <li>Terminate active Supabase SSR authentication tokens.</li>
                <li>Permanently erase local ECDH private keys (<code style={{ color: '#fca5a5' }}>bsteg_priv_*</code>) from this browser.</li>
                <li>Purge local storage, session storage, service worker caches, and IndexedDB.</li>
              </ul>
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontSize: 11,
                  color: '#94a3b8',
                }}
              >
                <strong>Security Notice:</strong> This operation sanitizes data on this machine. It cannot revoke external copies, downloaded carrier images, or messages already decrypted and archived by recipients.
              </div>
            </div>

            {errorMsg && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid #ef4444',
                  color: '#fca5a5',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  marginBottom: 16,
                }}
              >
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  if (!busy) setIsOpen(false);
                }}
                disabled={busy}
                style={{
                  background: '#1f293d',
                  color: '#cbd5e1',
                  border: '1px solid #334155',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedPanic}
                disabled={busy}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {busy ? (
                  <>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 60" />
                    </svg>
                    Wiping Device...
                  </>
                ) : (
                  'Confirm & Wipe Device'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}