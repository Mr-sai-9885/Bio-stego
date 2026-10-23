import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase/server';
import RealtimeMessages, { MessageRow } from '@/components/RealtimeMessages';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
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

  if (!user) redirect('/login');

  const { to } = await searchParams;

  let messages: MessageRow[] = [];
  let contacts: any[] = [];
  let errorMsg: string | null = null;

  try {
    const { data: msgs, error } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, file_path, status, created_at, expires_at, carrier_type, mime_type, size_bytes')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) errorMsg = error.message;
    messages = (msgs as MessageRow[]) ?? [];

    const { data: cts, error: cErr } = await supabase
      .from('contacts')
      .select('contact_user_id')
      .eq('user_id', user.id)
      .eq('verified', true);

    if (cErr) errorMsg = errorMsg ? `${errorMsg}; ${cErr.message}` : cErr.message;
    contacts = cts ?? [];
  } catch (e: any) {
    errorMsg = e?.message ?? 'Failed to load initial messages';
  }

  const verifiedContactIds = contacts.map((c) => c.contact_user_id);
  const { data: keyRow, error: keyError } = await supabase
    .from('user_keys')
    .select('public_jwk')
    .eq('user_id', user.id)
    .maybeSingle();
  if (keyError) {
    errorMsg = errorMsg ? `${errorMsg}; ${keyError.message}` : keyError.message;
  }

  return (
    <div className="space-y-4 bg-white text-slate-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            Encrypted Steganography Inbox & Chat
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Peer-to-peer hidden messaging using PNG Least Significant Bit (LSB) steganography
          </p>
        </div>
      </div>

      <div
        className={`p-3 rounded-lg text-xs border ${
          keyRow?.public_jwk
            ? 'bg-cyan-50 border-cyan-200 text-cyan-900'
            : 'bg-amber-50 border-amber-300 text-amber-900'
        }`}
      >
        {keyRow?.public_jwk ? (
          <>
            <strong>Key Setup is complete for your account.</strong>{' '}
            On a new device, restore your private key from Key Setup on the{' '}
            <Link href="/dashboard" className="font-semibold underline underline-offset-2">
              Dashboard
            </Link>{' '}
            with your recovery passphrase. Do not generate a replacement key, or existing messages will not
            decrypt.
          </>
        ) : (
          <>
            <strong>Run Key Setup to receive and decrypt messages.</strong>{' '}
            Open the{' '}
            <Link href="/dashboard" className="font-semibold underline underline-offset-2">
              Dashboard
            </Link>
            , complete Key Setup, and save your recovery passphrase. Messages may arrive in your inbox before
            setup, but you cannot decrypt or read them until your identity key is ready.
          </>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg text-xs bg-red-50 border border-red-200 text-red-700">
          {errorMsg}
        </div>
      )}

      <RealtimeMessages
        userId={user.id}
        initialMessages={messages}
        initialVerifiedContactIds={verifiedContactIds}
        defaultSelectedPeer={to || ''}
      />
    </div>
  );
}