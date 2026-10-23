import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Please sign in to view message contacts.' }, { status: 401 });
    }

    let body: { peerIds?: unknown };
    try {
      body = await request.json() as { peerIds?: unknown };
    } catch {
      return NextResponse.json({ error: 'Invalid peer email lookup request.' }, { status: 400 });
    }

    if (
      !Array.isArray(body.peerIds) ||
      body.peerIds.length > 100 ||
      !body.peerIds.every((id): id is string => typeof id === 'string' && uuidPattern.test(id))
    ) {
      return NextResponse.json({ error: 'Peer IDs must be a list of up to 100 valid user IDs.' }, { status: 400 });
    }

    const requestedPeerIds = [...new Set(body.peerIds)].filter((id) => id !== user.id);
    if (requestedPeerIds.length === 0) {
      return NextResponse.json({ emails: {} });
    }

    const [sentResult, receivedResult, contactsResult] = await Promise.all([
      supabase
        .from('messages')
        .select('receiver_id')
        .eq('sender_id', user.id)
        .in('receiver_id', requestedPeerIds),
      supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .in('sender_id', requestedPeerIds),
      supabase
        .from('contacts')
        .select('contact_user_id')
        .eq('user_id', user.id)
        .eq('verified', true)
        .in('contact_user_id', requestedPeerIds),
    ]);

    if (sentResult.error || receivedResult.error || contactsResult.error) {
      console.error(
        'Could not authorize message peer email lookup:',
        sentResult.error?.message ?? receivedResult.error?.message ?? contactsResult.error?.message
      );
      return NextResponse.json({ error: 'Could not load message contact emails.' }, { status: 500 });
    }

    const authorizedIds = new Set([
      ...(sentResult.data ?? []).map((row) => row.receiver_id),
      ...(receivedResult.data ?? []).map((row) => row.sender_id),
      ...(contactsResult.data ?? []).map((row) => row.contact_user_id),
    ]);

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRoleKey || !supabaseUrl) {
      console.error('Peer email lookup requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.');
      return NextResponse.json({ error: 'Message contact email lookup is not configured.' }, { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authorizedPeerIds = requestedPeerIds.filter((id) => authorizedIds.has(id));
    const userResults = await Promise.all(
      authorizedPeerIds.map((id) => admin.auth.admin.getUserById(id))
    );
    const failedLookup = userResults.find((result) => result.error);
    if (failedLookup?.error) {
      console.error('Could not load a message peer email:', failedLookup.error.message);
      return NextResponse.json({ error: 'Could not load message contact emails.' }, { status: 500 });
    }

    const emails: Record<string, string> = {};
    for (const result of userResults) {
      const peer = result.data?.user;
      if (peer?.email) emails[peer.id] = peer.email;
    }

    return NextResponse.json({ emails });
  } catch (error) {
    console.error('Message peer email lookup failed:', error);
    return NextResponse.json({ error: 'Could not load message contact emails.' }, { status: 500 });
  }
}
