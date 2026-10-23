export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isUvVerifiedForUser } from '@/lib/webauthn/uvSession';

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const verified = await isUvVerifiedForUser(userRes.user.id);
    if (!verified) {
      return NextResponse.json({ error: 'Biometric verification required' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      filePath?: string;
      messageId?: string;
    };
    const { filePath, messageId } = body;

    if (!filePath && !messageId) {
      return NextResponse.json({ error: 'Missing filePath or messageId' }, { status: 400 });
    }

    // Verify in database that this message belongs to the current user (as receiver or sender)
    let query = supabase
      .from('messages')
      .select('id, sender_id, receiver_id, file_path, expires_at');

    if (messageId) {
      query = query.eq('id', messageId);
    } else if (filePath) {
      query = query.eq('file_path', filePath);
    }

    const { data: msgRow, error: msgErr } = await query.maybeSingle();
    if (msgErr || !msgRow) {
      return NextResponse.json(
        { error: 'Message record not found or inaccessible' },
        { status: 404 }
      );
    }

    // Gated check: user MUST be either receiver or sender of this message
    if (msgRow.receiver_id !== userRes.user.id && msgRow.sender_id !== userRes.user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You are not authorized to view this message carrier' },
        { status: 403 }
      );
    }

    // Check expiration / self-destruction
    if (msgRow.expires_at && new Date(msgRow.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Message expired or self-destructed' }, { status: 410 });
    }

    const actualFilePath = msgRow.file_path || filePath!;

    // Download carrier from Storage
    // Use service role key to bypass storage folder RLS (which isolates sender from receiver)
    // Server has already cryptographically authenticated the user & verified biometric UV session above
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const storageClient = adminKey
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, adminKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : supabase;

    const dl = await storageClient.storage.from('carriers').download(actualFilePath);
    if (dl.error) {
      console.error('Storage download error:', dl.error);
      return NextResponse.json(
        { error: `Carrier retrieval failed: ${dl.error.message}` },
        { status: 400 }
      );
    }

    const mimeType = (dl.data as any).type || 'image/png';
    const ab = await dl.data.arrayBuffer();
    const carrierB64 = Buffer.from(ab).toString('base64');

    return NextResponse.json({ carrierB64, mimeType });
  } catch (e: any) {
    console.error('messages/decrypt route error:', e);
    return NextResponse.json({ error: e?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}