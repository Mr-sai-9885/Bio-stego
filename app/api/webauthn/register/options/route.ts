export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getWebAuthnConfig } from '@/lib/webauthn/config';
import { setChallenge } from '@/lib/webauthn/challengeCookie';
import { createSupabaseServer } from '@/lib/supabase/server';
import { uuidToUint8Array } from '@/lib/webauthn/userId';

export async function POST(req: Request) {
  const config = getWebAuthnConfig(req);
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: creds } = await supabase
    .from('webauthn_credentials')
    .select('credential_id, transports')
    .eq('user_id', data.user.id);

  // Exclude existing credentials so this device won't register duplicate credentials,
  // but allowing the user to register passkeys on their other devices (phone, laptop, tablet).
  const excludeCredentials = (creds ?? []).map((c) => ({
    id: c.credential_id, // string
    type: 'public-key' as const,
  }));

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID: uuidToUint8Array(data.user.id),
    userName: data.user.email ?? data.user.id,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });

  await setChallenge('reg', options.challenge);
  return NextResponse.json(options);
}