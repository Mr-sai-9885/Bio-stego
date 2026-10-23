'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await supabase.auth.signOut();
          router.push('/login');
          router.refresh();
        } catch (e) {
          console.error('Logout error:', e);
        } finally {
          setBusy(false);
        }
      }}
      className="w-full text-left flex items-center justify-between text-xs px-3 py-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition-colors border border-transparent hover:border-slate-700/50"
      style={{ cursor: busy ? 'not-allowed' : 'pointer' }}
    >
      <span className="flex items-center gap-2">
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        {busy ? 'Signing out...' : 'Sign Out'}
      </span>
    </button>
  );
}