export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { clearUvVerified } from '@/lib/webauthn/uvSession';
import { clearChallenge } from '@/lib/webauthn/challengeCookie';

export async function POST() {
  try {
    // 1) Supabase sign out (clears auth cookies in SSR flow)
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();

    // 2) Clear BioSteg security cookies
    await clearUvVerified();
    await clearChallenge('reg');
    await clearChallenge('auth');

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('panic route error:', e);
    // even on error, return JSON so client can continue wiping
    return NextResponse.json({ ok: false, error: e?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}