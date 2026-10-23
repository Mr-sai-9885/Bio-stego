const MAGIC = new TextEncoder().encode('BIOSTEG1'); // 8 bytes marker

function u32ToBytesLE(n: number) {
  const b = new Uint8Array(4);
  b[0] = n & 255;
  b[1] = (n >>> 8) & 255;
  b[2] = (n >>> 16) & 255;
  b[3] = (n >>> 24) & 255;
  return b;
}

function bytesToU32LE(b: Uint8Array) {
  return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
}

function concat(...arrs: Uint8Array[]) {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function bytesToBits(data: Uint8Array) {
  const bits: number[] = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);
  }
  return bits;
}

function bitsToBytes(bits: number[]) {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) {
      v = (v << 1) | (bits[i * 8 + j] ?? 0);
    }
    out[i] = v;
  }
  return out;
}

async function blobToImageData(blob: Blob) {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
      imageOrientation: 'none',
    } as any);
  } catch {
    bmp = await createImageBitmap(blob);
  }
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, ctx, img };
}

export async function embedPayloadInPng(coverFile: File, payload: Uint8Array): Promise<Blob> {
  const { canvas, ctx, img } = await blobToImageData(coverFile);
  const data = img.data; // RGBA

  // Header = MAGIC(8) + length(4) + payload
  const header = concat(MAGIC, u32ToBytesLE(payload.length), payload);
  const bits = bytesToBits(header);

  // capacity = number of RGB channels available (exclude alpha)
  const rgbSlots = (data.length / 4) * 3;
  if (bits.length > rgbSlots) {
    throw new Error(`Payload too large. Need ${bits.length} bits, capacity ${rgbSlots} bits.`);
  }

  let bitIndex = 0;
  for (let i = 0; i < data.length && bitIndex < bits.length; i += 4) {
    // R, G, B
    for (let c = 0; c < 3 && bitIndex < bits.length; c++) {
      const idx = i + c;
      data[idx] = (data[idx] & 0xfe) | bits[bitIndex++];
    }
    // Set Alpha = 255 for any pixel containing payload bits to prevent lossy premultiplication
    data[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);

  const outBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
  });

  return outBlob;
}

export async function extractPayloadFromPng(stegoBlob: Blob): Promise<Uint8Array> {
  const { img } = await blobToImageData(stegoBlob);
  const data = img.data;

  // We need at least 12 bytes = 96 bits for MAGIC (8) + LENGTH (4)
  const headerBitsCount = (8 + 4) * 8;
  const headerBits: number[] = [];
  let pixelIndex = 0;

  for (; pixelIndex < data.length && headerBits.length < headerBitsCount; pixelIndex += 4) {
    headerBits.push(data[pixelIndex] & 1); // R
    if (headerBits.length < headerBitsCount) headerBits.push(data[pixelIndex + 1] & 1); // G
    if (headerBits.length < headerBitsCount) headerBits.push(data[pixelIndex + 2] & 1); // B
  }

  if (headerBits.length < headerBitsCount) {
    throw new Error('Carrier image too small to contain BioSteg header.');
  }

  // Read MAGIC (8 bytes) + LEN (4 bytes)
  const headerBytes = bitsToBytes(headerBits);
  const magic = headerBytes.slice(0, 8);
  const lenBytes = headerBytes.slice(8, 12);

  for (let i = 0; i < 8; i++) {
    if (magic[i] !== MAGIC[i]) {
      throw new Error('No BioSteg payload found (bad magic marker). The carrier bits may have been altered or not contain steganography.');
    }
  }

  const payloadLen = bytesToU32LE(lenBytes);
  const maxCapacity = Math.floor(((data.length / 4) * 3) / 8);
  if (payloadLen <= 0 || payloadLen > maxCapacity) {
    throw new Error(`Corrupted payload length in carrier (${payloadLen} bytes, capacity is ${maxCapacity} bytes).`);
  }

  // Extract exactly payloadLen * 8 bits
  const payloadBitsCount = payloadLen * 8;
  const payloadBits: number[] = [];

  for (; pixelIndex < data.length && payloadBits.length < payloadBitsCount; pixelIndex += 4) {
    payloadBits.push(data[pixelIndex] & 1);
    if (payloadBits.length < payloadBitsCount) payloadBits.push(data[pixelIndex + 1] & 1);
    if (payloadBits.length < payloadBitsCount) payloadBits.push(data[pixelIndex + 2] & 1);
  }

  if (payloadBits.length < payloadBitsCount) {
    throw new Error(`Carrier truncated: expected ${payloadLen} bytes, but reached end of image.`);
  }

  return bitsToBytes(payloadBits).slice(0, payloadLen);
}

/**
 * Creates an aesthetic gradient PNG carrier image on the fly.
 * Useful when users want to send a secret message directly without uploading an external photo.
 */
export function createDefaultCarrierFile(name = 'secure-carrier.png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d')!;

  // High-contrast clean dark/cyan gradient
  const grad = ctx.createLinearGradient(0, 0, 400, 400);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#0e7490');
  grad.addColorStop(1, '#0284c7');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 400);

  // Geometric watermarking texture
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 400; i += 25) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(400, 400 - i);
    ctx.stroke();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(new File([blob], name, { type: 'image/png' }));
      } else {
        reject(new Error('Failed to create default carrier image'));
      }
    }, 'image/png');
  });
}