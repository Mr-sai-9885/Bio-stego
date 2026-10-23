export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

import { getWebAuthnConfig } from '@/lib/webauthn/config';
import { clearChallenge, getChallenge } from '@/lib/webauthn/challengeCookie';
import { setUvVerified } from '@/lib/webauthn/uvSession';
import { createSupabaseServer } from '@/lib/supabase/server';

function toBase64Url(input: unknown): string {
  if (typeof input === 'string' && input.length > 0) return input;
  if (input instanceof Uint8Array) return isoBase64URL.fromBuffer(Uint8Array.from(input));
  throw new Error('Invalid WebAuthn credential bytes');
}

export async function POST(req: Request) {
  try {
    const config = getWebAuthnConfig(req);
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const expectedChallenge = await getChallenge('reg');
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'Missing challenge cookie' }, { status: 400 });
    }

    const body = await req.json();

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
    });

    await clearChallenge('reg');

    const regInfo = verification.registrationInfo as any;
    if (!verification.verified || !regInfo) {
      return NextResponse.json({ error: 'Registration not verified' }, { status: 400 });
    }

    // Supports both old and new SimpleWebAuthn shapes
    const cred = regInfo.credential ?? {};
    const rawId = cred.id ?? regInfo.credentialID;
    const rawPublicKey = cred.publicKey ?? regInfo.credentialPublicKey;
    const counter = Number(cred.counter ?? regInfo.counter ?? 0);
    const transports =
      cred.transports ??
      (body?.response?.transports as string[] | undefined) ??
      null;

    const credential_id = toBase64Url(rawId);
    const public_key = toBase64Url(rawPublicKey);

    if (!credential_id || credential_id.length < 8) {
      return NextResponse.json({ error: 'Invalid credential_id generated' }, { status: 500 });
    }
    if (!public_key || public_key.length < 8) {
      return NextResponse.json({ error: 'Invalid public_key generated' }, { status: 500 });
    }

    const { error } = await supabase.from('webauthn_credentials').insert({
      user_id: data.user.id,
      credential_id,
      public_key,
      counter,
      transports,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Set biometric verified session immediately so user can decrypt right away
    await setUvVerified(data.user.id, 10 * 60);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('register/verify error:', e);
    return NextResponse.json(
      { error: e?.message ?? 'Internal Server Error' },
      { status: 500 },
    );
  }
}