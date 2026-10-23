import { cookies } from 'next/headers';

const REG_COOKIE = 'bsteg_reg_chal';
const AUTH_COOKIE = 'bsteg_auth_chal';

export async function setChallenge(kind: 'reg' | 'auth', challenge: string) {
  const store = await cookies();
  store.set(kind === 'reg' ? REG_COOKIE : AUTH_COOKIE, challenge, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 5, // 5 minutes
  });
}

export async function getChallenge(kind: 'reg' | 'auth') {
  const store = await cookies();
  return store.get(kind === 'reg' ? REG_COOKIE : AUTH_COOKIE)?.value ?? null;
}

export async function clearChallenge(kind: 'reg' | 'auth') {
  const store = await cookies();
  store.set(kind === 'reg' ? REG_COOKIE : AUTH_COOKIE, '', { path: '/', maxAge: 0 });
}