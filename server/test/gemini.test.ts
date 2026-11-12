import { describe, expect, it } from 'vitest';
import { ApiError } from '@google/genai';
import { classifyGeminiError, VisionInspector, AIUnavailableError } from '../src/ai/gemini.js';
import { sniffImageMime, validateBase64Image, validateImageBytes, MAX_PHOTO_BYTES } from '../src/ai/image.js';
import { createRental, createHoldOrder, authorizeHold, recordPickup, type Deps } from '../src/domain/rentals.js';
import { MemoryStore } from '../src/store/memory.js';
import { seed } from '../src/seed.js';
import { FakeInspector, FakePayPal, photo } from './fakes.js';

const pad = (head: number[], n = 2048) => Buffer.concat([Buffer.from(head), Buffer.alloc(n)]);
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe('image validation', () => {
  it('detects JPEG, PNG and WebP by their bytes', () => {
    expect(sniffImageMime(pad([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(sniffImageMime(pad(PNG))).toBe('image/png');
    expect(sniffImageMime(pad(WEBP))).toBe('image/webp');
    expect(sniffImageMime(Buffer.from('%PDF-1.7 hello'))).toBeNull();
  });

  it('rejects non-images, tiny files, oversized files and mismatched types', () => {
    expect(() => validateImageBytes(pad([0x25, 0x50, 0x44, 0x46]), 'x')).toThrow(/not a JPEG/);
    expect(() => validateImageBytes(Buffer.from([0xff, 0xd8, 0xff]), 'x')).toThrow(/too small/);
    expect(() => validateImageBytes(pad([0xff, 0xd8, 0xff], MAX_PHOTO_BYTES), 'x')).toThrow(/limit/);
    expect(() => validateImageBytes(pad(PNG), 'x', 'image/jpeg')).toThrow(/declared/);
    expect(() => validateBase64Image('not base64!!', 'x')).toThrow(/base64/);
  });

  it('the API refuses a renamed non-image before calling the AI', async () => {
    const pp = new FakePayPal();
    const inspector = new FakeInspector();
    const store = new MemoryStore();
    await seed(store);
    const deps: Deps = { store, paypal: pp.asClient, inspector: inspector.asInspector };
    const r = await createRental(deps, { itemId: 'cam-a7iv', renterName: 'T', startsAt: '2026-11-14T10:00:00Z', endsAt: '2026-11-15T10:00:00Z' });
    const { orderId } = await createHoldOrder(deps, r.id);
    pp.approve(orderId);
    await authorizeHold(deps, r.id);
    const photos = ['front', 'back', 'top', 'lens'].map(photo);
    photos[1] = { ...photos[1]!, data: pad([0x25, 0x50, 0x44, 0x46]).toString('base64') };
    await expect(recordPickup(deps, r.id, photos)).rejects.toThrow(/Photo "back": not a JPEG/);
  });
});

describe('Gemini error classification', () => {
  const api = (status: number, message: string) => new ApiError({ status, message });
  it('names the failure and how to fix it', () => {
    expect(classifyGeminiError(api(400, 'API key not valid. Please pass a valid API key.'), false, 45000).kind).toBe('invalid_key');
    expect(classifyGeminiError(api(404, 'models/gemini-x is not found'), false, 45000).kind).toBe('model_not_found');
    expect(classifyGeminiError(api(429, 'RESOURCE_EXHAUSTED'), false, 45000).kind).toBe('rate_limited');
    expect(classifyGeminiError(api(503, 'overloaded'), false, 45000).kind).toBe('server_error');
    expect(classifyGeminiError(api(400, 'Unable to process input image'), false, 45000).kind).toBe('bad_request');
    expect(classifyGeminiError(new Error('This operation was aborted'), true, 45000).message).toMatch(/timed out after 45 s/);
    expect(classifyGeminiError(new TypeError('fetch failed'), false, 45000).kind).toBe('network');
  });

  it('never repeats an API key in the message', () => {
    const m = classifyGeminiError(new Error('bad key AIzaSyA1234567890abcdefghijklmnop'), false, 45000).message;
    expect(m).not.toMatch(/AIza/);
  });

  it('fails clearly when no key is configured', async () => {
    const v = new VisionInspector('', 'a', 'b');
    await expect(v.baseline(photo('front'), 'x')).rejects.toBeInstanceOf(AIUnavailableError);
  });
});
