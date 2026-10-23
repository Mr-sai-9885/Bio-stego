export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

import { getWebAuthnConfig } from '@/lib/webauthn/config';
import { clearChallenge, getChallenge } from '@/lib/webauthn/challengeCookie';
import { setUvVerified } from '@/lib/webauthn/uvSession';
import { createSupabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const config = getWebAuthnConfig(req);
    const supabase = await createSupabaseServer();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const expectedChallenge = await getChallenge('auth');
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'Missing challenge cookie' }, { status: 400 });
    }

    const body = await req.json();
    const credential_id = body?.id as string | undefined;

    if (!credential_id) {
      return NextResponse.json({ error: 'Missing credential ID' }, { status: 400 });
    }

    const { data: credRow, error } = await supabase
      .from('webauthn_credentials')
      .select('id, credential_id, public_key, counter, transports')
      .eq('user_id', userRes.user.id)
      .eq('credential_id', credential_id)
      .maybeSingle();

    if (error || !credRow) {
      return NextResponse.json({ error: 'Credential not found in database' }, { status: 400 });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
      credential: {
        id: credRow.credential_id,
        publicKey: isoBase64URL.toBuffer(credRow.public_key),
        counter: Number(credRow.counter),
        transports: (credRow.transports as any) ?? undefined,
      },
    });

    await clearChallenge('auth');

    if (!verification.verified) {
      return NextResponse.json({ error: 'Authentication verification failed' }, { status: 400 });
    }

    // Update counter to protect against replay attacks
    const newCounter = verification.authenticationInfo.newCounter;
    await supabase
      .from('webauthn_credentials')
      .update({ counter: newCounter })
      .eq('id', credRow.id);

    // Issue verified biometric session cookie (valid for 10 minutes)
    await setUvVerified(userRes.user.id, 10 * 60);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('login/verify error:', e);
    return NextResponse.json(
      { error: e?.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}