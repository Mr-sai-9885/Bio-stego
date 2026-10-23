'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { setContactAlias } from '@/lib/utils/contactAliases';

export default function AddContactForm({ onAdded }: { onAdded?: () => void }) {
  const supabase = createSupabaseBrowser();
  const [contactUserId, setContactUserId] = useState('');
  const [aliasName, setAliasName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function add() {
    setMsg(null);
    const id = contactUserId.trim();
    if (!id) {
      return setMsg({ type: 'error', text: 'Please enter a contact UUID.' });
    }

    // Basic UUID validation regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return setMsg({ type: 'error', text: 'Invalid UUID format. Example: 123e4567-e89b-12d3-a456-426614174000' });
    }

    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) throw new Error('Not authenticated. Please log in.');
      if (u.user.id === id) throw new Error('You cannot add your own ID as a contact.');

      const { error } = await supabase.from('contacts').upsert(
        {
          user_id: u.user.id,
          contact_user_id: id,
          verified: true,
        },
        { onConflict: 'user_id,contact_user_id' }
      );

      if (error) throw new Error(error.message);

      // Save custom contact alias if provided
      if (aliasName.trim()) {
        setContactAlias(u.user.id, id, aliasName.trim());
      }

      setContactUserId('');
      setAliasName('');
      setMsg({ type: 'success', text: 'Contact successfully verified and added to whitelist.' });
      onAdded?.();
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message ?? 'Failed to add contact.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-slate-900">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Add & Whitelist Contact</h3>
          <p className="text-xs text-slate-500">
            Authorize recipient to exchange encrypted stego payloads
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Display Name / Alias (Optional)
          </label>
          <input
            type="text"
            value={aliasName}
            onChange={(e) => setAliasName(e.target.value)}
            placeholder="e.g. Alice (Agent Smith)"
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:bg-white"
            disabled={busy}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Contact User ID (UUID) *
          </label>
          <input
            type="text"
            value={contactUserId}
            onChange={(e) => setContactUserId(e.target.value)}
            placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 font-mono focus:outline-none focus:border-cyan-600 focus:bg-white"
            disabled={busy}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={add}
          disabled={busy}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
        >
          {busy ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 60" />
              </svg>
              Saving Contact...
            </>
          ) : (
            'Verify & Save to Whitelist'
          )}
        </button>
      </div>

      {msg && (
        <div
          className={`mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
            msg.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          }`}
        >
          <span>{msg.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}