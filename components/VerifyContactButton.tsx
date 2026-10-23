'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function VerifyContactButton({
  contactUserId,
  onVerified,
}: {
  contactUserId: string;
  onVerified?: (contactUserId: string) => void;
}) {
  const supabase = createSupabaseBrowser();
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error('Not logged in');

      const { error } = await supabase
        .from('contacts')
        .upsert(
          { user_id: u.user.id, contact_user_id: contactUserId, verified: true },
          { onConflict: 'user_id,contact_user_id' }
        );

      if (error) throw new Error(error.message);
      onVerified?.(contactUserId);
    } catch (e: any) {
      alert(e?.message ?? 'Verify failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={verify}
      disabled={busy}
      className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
    >
      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {busy ? 'Verifying…' : 'Trust & Verify Sender'}
    </button>
  );
}