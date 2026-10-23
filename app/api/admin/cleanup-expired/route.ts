export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  try {
    const secret = req.headers.get('x-cron-secret');
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1) Find expired messages (you can limit per run)
    const nowIso = new Date().toISOString();
    const { data: expired, error: qErr } = await supabase
      .from('messages')
      .select('id, file_path')
      .not('expires_at', 'is', null)
      .lte('expires_at', nowIso)
      .limit(500);

    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
    if (!expired || expired.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0, removedFiles: 0 });
    }

    const filePaths = expired.map((m) => m.file_path).filter(Boolean);

    // 2) Delete files from Storage (chunk to avoid large requests)
    let removedFiles = 0;
    for (const group of chunk(filePaths, 100)) {
      const { error: rmErr } = await supabase.storage.from('carriers').remove(group);
      if (!rmErr) removedFiles += group.length;
    }

    // 3) Delete DB rows (also chunk)
    let deleted = 0;
    for (const group of chunk(expired.map((m) => m.id), 200)) {
      const { error: delErr } = await supabase.from('messages').delete().in('id', group);
      if (!delErr) deleted += group.length;
    }

    return NextResponse.json({ ok: true, deleted, removedFiles });
  } catch (e: any) {
    console.error('cleanup-expired error:', e);
    return NextResponse.json({ error: e?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}