'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function RemoveContactButton({
  contactUserId,
  onRemoved,
}: {
  contactUserId: string;
  onRemoved?: () => void;
}) {
  const supabase = createSupabaseBrowser();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error('Not logged in');

      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('user_id', u.user.id)
        .eq('contact_user_id', contactUserId);

      if (error) throw new Error(error.message);
      onRemoved?.();
    } catch (e: any) {
      alert(e?.message ?? 'Remove failed');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <span className="text-[11px] text-red-600 font-medium">Remove?</span>
        <button
          onClick={remove}
          disabled={busy}
          className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold px-2 py-1 rounded transition-colors cursor-pointer"
        >
          {busy ? '...' : 'Yes'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] px-2 py-1 rounded transition-colors cursor-pointer border border-slate-300"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={busy}
      className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
      title="Remove contact"
    >
      <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  );
}