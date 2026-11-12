import { deflateSync } from 'node:zlib';
import type { Photo } from '../server/src/ai/gemini.js';

/** A 320x240 PNG drawn in code: a grey panel with one dark diagonal "scratch". Used only for the model probe. */
export function probePng(): Photo {
  const w = 320, h = 240;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let seed = 7;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noise = (seed >> 16) % 12;
      const onPanel = x > 40 && x < 280 && y > 30 && y < 210;
      const scratch = onPanel && Math.abs(y - (60 + (x - 80) * 0.45)) < 2 && x > 80 && x < 260;
      const v = scratch ? 35 : onPanel ? 170 + noise : 235 + (noise >> 1);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = v; raw[o + 1] = v; raw[o + 2] = scratch ? 30 : v;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { angle: 'front', mimeType: 'image/png', data: png.toString('base64') };
}

