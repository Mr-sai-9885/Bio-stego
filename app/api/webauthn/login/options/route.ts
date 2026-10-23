export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';

import { getWebAuthnConfig } from '@/lib/webauthn/config';
import { setChallenge } from '@/lib/webauthn/challengeCookie';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const config = getWebAuthnConfig(req);
    const supabase = await createSupabaseServer();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: creds, error } = await supabase
      .from('webauthn_credentials')
      .select('credential_id, transports')
      .eq('user_id', userRes.user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!creds || creds.length === 0) {
      return NextResponse.json({ error: 'No passkey registered yet' }, { status: 400 });
    }

    // IMPORTANT: pass id as base64url STRING (do NOT convert to Buffer here)
    const allowCredentials = (creds ?? []).map((c) => ({
      id: c.credential_id,
      type: 'public-key' as const,
      transports: (c.transports ?? undefined) as any,
    }));

    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 60000,
    });

    await setChallenge('auth', options.challenge);
    return NextResponse.json(options);
  } catch (e: any) {
    console.error('login/options error:', e);
    return NextResponse.json({ error: e?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}