'use client';

import { useEffect, useState, useCallback } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import AddContactForm from '@/components/AddContactForm';
import RemoveContactButton from '@/components/RemoveContactButton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAllContactAliases, setContactAlias } from '@/lib/utils/contactAliases';

type Contact = {
  id: string;
  contact_user_id: string;
  verified: boolean;
  created_at: string;
};

export default function ContactsPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowser();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing state for alias
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes?.user) {
        router.push('/login');
        return;
      }

      const uid = userRes.user.id;
      setCurrentUserId(uid);
      setAliases(getAllContactAliases(uid));

      const { data, error: fetchErr } = await supabase
        .from('contacts')
        .select('id, contact_user_id, verified, created_at')
        .eq('user_id', uid)
        .eq('verified', true)
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setContacts((data as Contact[]) || []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    loadContacts();

    function onAliasChange() {
      if (currentUserId) {
        setAliases(getAllContactAliases(currentUserId));
      }
    }
    window.addEventListener('contact_alias_updated', onAliasChange);
    return () => window.removeEventListener('contact_alias_updated', onAliasChange);
  }, [loadContacts, currentUserId]);

  function startRename(contactUserId: string) {
    setEditingId(contactUserId);
    setEditingName(aliases[contactUserId] || '');
  }

  function saveRename(contactUserId: string) {
    if (!currentUserId) return;
    setContactAlias(currentUserId, contactUserId, editingName);
    setAliases(getAllContactAliases(currentUserId));
    setEditingId(null);
  }

  const filteredContacts = contacts.filter((c) => {
    const alias = aliases[c.contact_user_id] || '';
    const q = searchTerm.toLowerCase().trim();
    return c.contact_user_id.toLowerCase().includes(q) || alias.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 bg-white text-slate-900">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            Security Contacts & Whitelist Directory
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage cryptographically verified peers, assign custom names, and configure recipient identities
          </p>
        </div>
        <div className="bg-cyan-50 border border-cyan-200 rounded-lg px-3 py-1.5 self-start sm:self-auto text-xs font-mono text-cyan-800 font-semibold shadow-sm">
          {contacts.length} Verified Peer{contacts.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Add Contact Form Card */}
      <AddContactForm onAdded={loadContacts} />

      {/* Contacts List Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Verified Peer Whitelist</h2>
            <p className="text-xs text-slate-500">Click the pencil icon to rename any peer to a friendly name</p>
          </div>
          
          {/* Search Contacts Input */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or UUID..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:bg-white"
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg mb-4 text-xs bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 60" />
            </svg>
            Loading verified contacts...
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-slate-400 mb-3">
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700">
              {searchTerm ? 'No contacts match your query.' : 'No verified contacts yet.'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Add recipient UUIDs using the form above to enable secure stego messaging.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredContacts.map((c) => {
              const alias = aliases[c.contact_user_id];
              const isEditing = editingId === c.contact_user_id;

              return (
                <div
                  key={c.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-800 font-bold text-xs shrink-0 shadow-xs">
                      {alias ? alias.slice(0, 2).toUpperCase() : c.contact_user_id.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2 max-w-sm mb-1">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            placeholder="Enter contact name..."
                            className="bg-white border border-cyan-500 rounded px-2.5 py-1 text-xs text-slate-900 focus:outline-none flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(c.contact_user_id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            onClick={() => saveRename(c.contact_user_id)}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs px-2.5 py-1 rounded font-medium cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-slate-500 hover:text-slate-700 text-xs px-1 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 truncate">
                            {alias || c.contact_user_id}
                          </span>
                          <button
                            onClick={() => startRename(c.contact_user_id)}
                            className="text-slate-400 hover:text-cyan-700 p-0.5 rounded cursor-pointer transition-colors"
                            title="Edit sender name / alias"
                          >
                            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-800 font-semibold bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                            ✓ Verified
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 font-mono">
                        <span className="truncate">UUID: {c.contact_user_id}</span>
                        <span>•</span>
                        <span suppressHydrationWarning className="shrink-0 font-sans">
                          Added: {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Link
                      href={`/messages?to=${c.contact_user_id}`}
                      className="inline-flex items-center gap-1.5 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-800 text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold shadow-xs"
                    >
                      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      Send Stego
                    </Link>
                    <RemoveContactButton contactUserId={c.contact_user_id} onRemoved={loadContacts} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}