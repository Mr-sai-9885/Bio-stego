import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) throw new Error(`Empty response (status ${res.status})`);
  return JSON.parse(text);
}

function checkSecureContext() {
  if (typeof window !== 'undefined') {
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      throw new Error(
        'WebAuthn biometrics requires an HTTPS connection or localhost. ' +
        'When testing across devices over the local network, please use HTTPS (or deploy to Vercel) so your browser enables hardware biometric sensors.'
      );
    }
  }
}

export async function registerPasskey() {
  checkSecureContext();
  const optRes = await fetch('/api/webauthn/register/options', { method: 'POST', cache: 'no-store' });
  const optionsJSON = await readJson(optRes);
  if (!optRes.ok) throw new Error(optionsJSON.error || 'Failed to get registration options');

  // IMPORTANT: new call shape
  const attResp = await startRegistration({ optionsJSON });

  const verifyRes = await fetch('/api/webauthn/register/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(attResp),
  });
  const verifyJSON = await readJson(verifyRes);
  if (!verifyRes.ok) throw new Error(verifyJSON.error || 'Passkey registration failed');

  return true;
}

export async function verifyBiometric() {
  checkSecureContext();
  const optRes = await fetch('/api/webauthn/login/options', { method: 'POST', cache: 'no-store' });
  const optionsJSON = await readJson(optRes);
  if (!optRes.ok) throw new Error(optionsJSON.error || 'Failed to get auth options');

  // IMPORTANT (new API)
  const asseResp = await startAuthentication({ optionsJSON });

  const verifyRes = await fetch('/api/webauthn/login/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(asseResp),
  });
  const verifyJSON = await readJson(verifyRes);
  if (!verifyRes.ok) throw new Error(verifyJSON.error || 'Biometric verify failed');

  return true;
}

export async function getBiometricStatus() {
  const res = await fetch('/api/webauthn/status', { cache: 'no-store' });
  return (await readJson(res)) as { verified: boolean };
}