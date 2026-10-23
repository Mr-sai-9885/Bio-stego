export function utf8ToBytes(s: string) {
  return new TextEncoder().encode(s);
}

export function bytesToUtf8(b: Uint8Array) {
  return new TextDecoder().decode(b);
}

export function bytesToB64(b: Uint8Array) {
  let bin = '';
  b.forEach((x) => (bin += String.fromCharCode(x)));
  return btoa(bin);
}

export function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}