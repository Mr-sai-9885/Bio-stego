import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import KeySetup from '@/components/KeySetup';
import DownloadCarrier from '@/components/DownloadCarrier';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createSupabaseServer();
  
  // Guard against unresolvable Supabase URL hanging server render
  let user = null;
  try {
    const userPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise<{ data: { user: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null } }), 1500)
    );
    const { data } = await Promise.race([userPromise, timeoutPromise]);
    user = data?.user;
  } catch {
    user = null;
  }

  if (!user) {
    redirect('/login');
  }

  // 1) Fetch real messages metrics & recent messages
  let allMessages: any[] = [];
  try {
    const { data: messages } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, file_path, status, created_at, expires_at, size_bytes')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(10);
    allMessages = messages ?? [];
  } catch {
    allMessages = [];
  }

  const receivedCount = allMessages.filter((m) => m.receiver_id === user.id).length;
  const sentCount = allMessages.filter((m) => m.sender_id === user.id).length;

  // 2) Fetch verified contacts count
  let contactsCount = 0;
  try {
    const { count } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('verified', true);
    contactsCount = count ?? 0;
  } catch {
    contactsCount = 0;
  }

  // 3) Fetch user's registered public key
  let hasPublicKey = false;
  try {
    const { data: userKeyRow } = await supabase
      .from('user_keys')
      .select('public_jwk, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    hasPublicKey = !!userKeyRow?.public_jwk;
  } catch {
    hasPublicKey = false;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto bg-white text-slate-900">
      {/* Top Welcome & Identity Card */}
      <div className="bg-gradient-to-r from-sky-50 via-slate-50 to-indigo-50 border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">
              Authenticated Security Session
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Security Operations Dashboard
          </h1>
          <p className="text-xs text-slate-600 font-mono mt-1">
            User ID: <span className="text-slate-800">{user.id}</span>
          </p>
          <p className="text-xs text-slate-600 font-mono">
            Email: <span className="text-cyan-700 font-medium">{user.email}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/messages"
            className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm flex items-center gap-2 transition-all"
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Open Chat & Inbox
          </Link>

          <Link
            href="/webauthn"
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium px-3.5 py-2.5 rounded-xl shadow-sm transition-colors flex items-center gap-2"
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 004 11m0 0a8 8 0 008 8c.7 0 1.385-.06 2.05-.174" />
            </svg>
            Biometrics
          </Link>
        </div>
      </div>

      {/* Real-time Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Received Messages */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Received Messages</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">📥</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{receivedCount}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">In direct inbox</span>
        </div>

        {/* Metric 2: Sent Messages */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Dispatched Stego</span>
            <span className="p-1.5 rounded-lg bg-cyan-50 text-cyan-600">📤</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{sentCount}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Active outbound payloads</span>
        </div>

        {/* Metric 3: Verified Contacts */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Verified Whitelist</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">👥</span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{contactsCount}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Trusted peers</span>
        </div>

        {/* Metric 4: Public Key Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Identity Key Status</span>
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">🔑</span>
          </div>
          <div className="text-sm font-bold font-mono text-emerald-700 flex items-center gap-1.5 pt-1">
            <span className={`w-2 h-2 rounded-full ${hasPublicKey ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {hasPublicKey ? 'P-256 Registered' : 'Setup Required'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1.5 block">
            {hasPublicKey ? 'Ready for auto E2EE' : 'Run KeySetup below'}
          </span>
        </div>
      </div>

      {/* Cryptographic Key Setup Module */}
      <KeySetup />

      {/* Recent Messages / Inbox Preview */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recent Steganographic Payloads</h2>
            <p className="text-xs text-slate-500">
              Live encrypted stego carriers stored in your private bucket
            </p>
          </div>
          <Link
            href="/messages"
            className="text-xs text-cyan-600 hover:text-cyan-700 font-medium flex items-center gap-1"
          >
            View All in Chat →
          </Link>
        </div>

        {allMessages.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs">
            <p>No recent messages found in database.</p>
            <Link href="/messages" className="text-cyan-600 hover:underline mt-1 inline-block">
              Send your first steganographic image
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[11px] uppercase tracking-wider font-mono">
                  <th className="pb-3 font-medium">Direction</th>
                  <th className="pb-3 font-medium">Peer UUID</th>
                  <th className="pb-3 font-medium">Carrier</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Timestamp</th>
                  <th className="pb-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {allMessages.map((m) => {
                  const isMine = m.sender_id === user.id;
                  const peer = isMine ? m.receiver_id : m.sender_id;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 font-mono">
                        {isMine ? (
                          <span className="inline-flex items-center gap-1 text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded text-[10px] font-medium border border-cyan-200">
                            OUT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[10px] font-medium border border-blue-200">
                            IN
                          </span>
                        )}
                      </td>
                      <td className="py-3 font-mono text-slate-700 truncate max-w-[140px]" title={peer}>
                        {peer}
                      </td>
                      <td className="py-3 text-slate-600 font-mono text-[11px]">
                        {m.file_path.split('/').pop()}
                      </td>
                      <td className="py-3">
                        <span className="capitalize text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {m.status}
                        </span>
                      </td>
                      <td className="py-3 text-slate-500 text-[11px]" suppressHydrationWarning>
                        {new Date(m.created_at).toLocaleDateString()} {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <DownloadCarrier filePath={m.file_path} />
                          <Link
                            href={`/messages?to=${peer}`}
                            className="bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-700 text-xs px-2.5 py-1 rounded-lg transition-colors font-medium"
                          >
                            Open Chat
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}