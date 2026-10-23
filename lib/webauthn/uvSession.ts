import { createHmac } from 'crypto';
import { cookies } from 'next/headers';

const UV_COOKIE = 'bsteg_uv';

function base64url(input: Buffer) {
  return input.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function fromBase64url(input: string) {
  input = input.replaceAll('-', '+').replaceAll('_', '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64');
}

function sign(dataB64u: string) {
  const secret = process.env.WEBSESSION_SECRET!;
  return base64url(createHmac('sha256', secret).update(dataB64u).digest());
}

export async function setUvVerified(userId: string, ttlSeconds = 10 * 60) {
  const store = await cookies();
  const payload = { userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = sign(data);

  store.set(UV_COOKIE, `${data}.${sig}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ttlSeconds,
  });
}

export async function clearUvVerified() {
  const store = await cookies();
  store.set(UV_COOKIE, '', { path: '/', maxAge: 0 });
}

export async function isUvVerifiedForUser(userId: string) {
  const store = await cookies();
  const token = store.get(UV_COOKIE)?.value;
  if (!token) return false;

  const [data, sig] = token.split('.');
  if (!data || !sig) return false;

  const expected = sign(data);
  if (expected !== sig) return false;

  const payload = JSON.parse(fromBase64url(data).toString('utf8')) as { userId: string; exp: number };
  if (payload.userId !== userId) return false;
  if (payload.exp < Math.floor(Date.now() / 1000)) return false;

  return true;
}