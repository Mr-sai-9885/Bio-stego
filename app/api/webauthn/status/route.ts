export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { isUvVerifiedForUser } from '@/lib/webauthn/uvSession';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ verified: false }, { status: 200 });

  const verified = await isUvVerifiedForUser(data.user.id);
  return NextResponse.json({ verified });
}