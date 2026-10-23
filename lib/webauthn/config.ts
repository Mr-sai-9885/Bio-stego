export function getWebAuthnConfig(req?: Request) {
  const rpName = process.env.WEBAUTHN_RP_NAME ?? 'BioSteg';

  let host = '';
  let proto = 'https';
  let originFromReq = '';

  if (req) {
    const forwardedHost = req.headers.get('x-forwarded-host');
    const hostHeader = req.headers.get('host');
    host = (forwardedHost || hostHeader || '').trim();

    const forwardedProto = req.headers.get('x-forwarded-proto');
    if (forwardedProto) {
      proto = forwardedProto;
    } else if (host.includes('localhost') || host.includes('127.0.0.1')) {
      proto = 'http';
    } else {
      proto = 'https';
    }

    const reqOrigin = req.headers.get('origin') || req.headers.get('referer');
    if (reqOrigin) {
      try {
        const parsed = new URL(reqOrigin);
        originFromReq = parsed.origin;
      } catch {}
    }
  }

  // Derive hostname without port for rpID
  let derivedHostname = '';
  if (host) {
    derivedHostname = host.split(':')[0];
  } else if (process.env.WEBAUTHN_ORIGIN) {
    try {
      derivedHostname = new URL(process.env.WEBAUTHN_ORIGIN).hostname;
    } catch {}
  }

  const rpID = process.env.WEBAUTHN_RP_ID || derivedHostname || 'localhost';

  const derivedOrigin = host ? `${proto}://${host}` : (process.env.WEBAUTHN_ORIGIN ?? 'http://localhost:3000');

  const expectedOrigins = Array.from(
    new Set(
      [
        derivedOrigin,
        originFromReq,
        process.env.WEBAUTHN_ORIGIN,
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        derivedHostname ? `https://${derivedHostname}` : '',
        derivedHostname ? `http://${derivedHostname}:3000` : '',
        host ? `https://${host}` : '',
        host ? `http://${host}` : '',
      ].filter(Boolean) as string[]
    )
  );

  return {
    rpName,
    rpID,
    origin: derivedOrigin,
    expectedOrigins,
  };
}

export const webauthnConfig = getWebAuthnConfig();