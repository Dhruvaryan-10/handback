/**
 * Image validation before anything is sent to Gemini.
 * The declared MIME type is never trusted: the first bytes must match it.
 */
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** Gemini caps the whole inline request (prompt + all images) at 20 MB. A diff sends two photos. */
export const GEMINI_INLINE_REQUEST_LIMIT_BYTES = 20 * 1024 * 1024;
/** Per-photo limit in raw bytes. Two photos at this size stay well under the 20 MB request cap after base64 (+33%). */
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
export const MIN_PHOTO_BYTES = 1024;

export function sniffImageMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) {
    return 'image/webp';
  }
  return null;
}

export class ImageValidationError extends Error {}

/** Validates raw bytes; returns the real MIME type. */
export function validateImageBytes(bytes: Uint8Array, label: string, declared?: string): ImageMime {
  if (bytes.length < MIN_PHOTO_BYTES) throw new ImageValidationError(`${label}: file is too small to be a photo (${bytes.length} bytes)`);
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new ImageValidationError(`${label}: ${(bytes.length / 1048576).toFixed(1)} MB is over the ${MAX_PHOTO_BYTES / 1048576} MB limit; resize to about 1600 px on the long side`);
  }
  const real = sniffImageMime(bytes);
  if (!real) throw new ImageValidationError(`${label}: not a JPEG, PNG or WebP image (HEIC from iPhone: export as JPEG first)`);
  if (declared && declared !== real) throw new ImageValidationError(`${label}: declared ${declared} but the file is ${real}`);
  return real;
}

/** Same check for base64 photos arriving from the browser. */
export function validateBase64Image(data: string, label: string, declared?: string): ImageMime {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new ImageValidationError(`${label}: image data is not valid base64`);
  return validateImageBytes(Buffer.from(data, 'base64'), label, declared);
}
