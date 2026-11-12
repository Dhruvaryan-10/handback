# Gemini verification report

Last updated: Thu 12 Nov 2026, 00:25 IST. Status words: **VERIFIED**, **PARTIALLY VERIFIED**, **NOT VERIFIED**, **FAILED**.

**Summary.** Everything that can be tested without a live key is built and passes: 22 tests, typecheck and production build. **No live Gemini call has been made yet.** The development environment cannot reach Google's API and has no key. Every live item stays **NOT VERIFIED** until `npm run check:gemini` is run on the laptop that holds `.env`.

## 1. Implementation summary

| Part | How it works |
| --- | --- |
| `VisionInspector` | Built from `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` (`server/src/config.ts`). No key → `AIUnavailableError`, never a crash. |
| Baseline (pick-up) | One call per photo angle. Returns photo quality and existing marks: `{label, type, severity, box_2d, confidence}`. |
| Return check | One call per angle with **pick-up photo + return photo + the renter-acknowledged baseline**. Returns `quality`, `same_item`, `new_findings` (boxes on the return photo), `matched_preexisting`. |
| Parsing | `responseMimeType: application/json` + `responseJsonSchema`, then a second check with zod. Output that fails to parse never reaches pricing. |
| Bounding boxes | `[ymin, xmin, ymax, xmax]` normalised 0–1000, Gemini's documented format ([image understanding docs](https://ai.google.dev/gemini-api/docs/image-understanding)). Zod rejects boxes with zero area or values outside 0–1000. |
| Confidence | **Self-reported by the model (0–1), not calibrated.** Findings below `AI_CONFIDENCE_THRESHOLD` (0.6) are never charged automatically; they are flagged for the owner to review. |
| Fallback | Primary, then fallback, each with a 45 s timeout. A rejected API key stops at once. Each attempt is recorded with model, time and failure type. |
| Money boundary | The AI has no payment access. Prices come from the shop's list in code, the total is capped at the hold, and capture needs owner approval (`x-shop-token`). |

## 2. Files created or modified

| File | Change |
| --- | --- |
| `scripts/gemini-check.ts` | **New.** Verification script (below). |
| `scripts/probe-image.ts` | **New.** Generates a 320×240 PNG test image in code (grey panel, one dark line) so models can be checked without your photos. |
| `server/src/ai/image.ts` | **New.** Checks the file's first bytes for JPEG / PNG / WebP (the claimed type isn't trusted). Size limits: 1 KB minimum, 6 MB maximum per photo (two photos stay under Gemini's 20 MB request cap after encoding). |
| `server/src/ai/gemini.ts` | Added the timeout, error types with fix-it hints, redaction of anything key-shaped in messages, empty / invalid-JSON handling, and `inspectBaseline` / `inspectDiff`, which report which model answered. The existing `baseline()` / `diff()` behave as before. |
| `server/src/domain/rentals.ts` | Uploaded photos are checked by their actual bytes before any AI call. |
| `server/src/routes/api.ts` | A failed photo check is logged by failure type, and a rate limit gets its own user message. |
| `server/test/gemini.test.ts` | **New.** 6 tests: file-type detection, rejects (non-image, too small, too large, wrong claimed type, bad base64), the API refusing a renamed PDF, error types, key redaction, missing key. |
| `server/test/fakes.ts` | Test photo is now a valid JPEG header. |
| `package.json` | `check:gemini` script (no dependency changes). |
| PayPal code, frontend | **Not touched.** |

## 3–7. Verification status

| Check | Status | Evidence |
| --- | --- | --- |
| Primary model `gemini-3.8-flash` exists | PARTIALLY VERIFIED | Listed as stable on [Google's model page](https://ai.google.dev/gemini-api/docs/models) (read 12 Nov 2026). Not yet called. |
| Fallback model `gemini-3.5-flash-lite` exists | PARTIALLY VERIFIED | Listed as stable on the same page. Not yet called. |
| Old default `gemini-3.5-flash` | FAILED (replaced) | Not on Google's list; it was the shipped default until this update. |
| API key accepted | NOT VERIFIED | Needs a run with the real key. |
| Image input | NOT VERIFIED | Probe sends a real PNG; needs a run. |
| Structured JSON output matches schema | NOT VERIFIED | Schema and validation are tested offline; live compatibility needs a run. |
| Works with `VisionInspector` | PARTIALLY VERIFIED | The script calls the same `VisionInspector` code as the app; 22 tests pass using fakes. |
| Error handling | VERIFIED (offline) | Missing key, missing file, renamed PDF and no network each give a clear message and exit code 1 (run here); error types are unit-tested. |
| Real-photo damage detection | NOT VERIFIED | No photos supplied yet. |

## 8. How to run the real test

1. In `.env`: `GEMINI_API_KEY=…`, `GEMINI_MODEL=gemini-3.8-flash`, `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite`.
2. Run `npm run check:gemini` (no photos). Each model should show **VERIFIED**: key accepted, model available, image accepted, JSON matched the schema.
3. Take two photos of one object from about the same angle, in good light, JPEG/PNG/WebP under 6 MB. For the second, add a removable mark (dry-erase line or small sticker).
4. Run `npm run check:gemini -- before.jpg after.jpg` (quote paths with spaces). Optionally set `CHECK_ITEM_NAME="camera"` for a more specific prompt.
5. It **passes** if: both photos are usable, same item = yes, the new mark is under NEW damage with a box in roughly the right place, and old marks are listed as pre-existing rather than new.
6. Exit code: 0 = the primary model fully works · 2 = only the fallback works · 1 = failed.

Paste the output into section 11 of this file.

## 9. Known limitations

- Findings are **AI observations, not proof** that damage happened during the rental. Lighting, angle and reflections can create false positives. The owner approves every charge and the renter can appeal.
- Confidence values are the model's own estimate, not a measured accuracy.
- Boxes are approximate; Gemini states coordinates on a 0–1000 grid.
- The browser re-encodes every photo as JPEG (max 1600 px). Phone HEIC photos therefore work only where the browser can decode HEIC; the script needs JPEG/PNG/WebP.
- One pick-up runs 4 photo calls in parallel (one per angle), and a return runs 4 more. Free-tier rate limits may trigger; the app reports this as a rate limit and the user can retry.

## 10. Risks to watch for on the first live run

No known bugs. Untested risks:
- If Gemini rejects `minItems` / `maxItems` in the JSON schema, both models will fail with `bad_request`. Fix: remove those two keys from `box_2d` in `server/src/ai/schema.ts` (zod still enforces 4 numbers).
- If `same_item` comes back false on genuinely identical objects shot at slightly different angles, loosen that prompt line.

## 11. Live results

_Not yet run. Paste the output of both commands here._

## Next steps

1. Run steps 2 and 4 above. Send the output.
2. Adjust the prompt or schema based on what the real photos show (≤ 1 hour).
3. Then the PayPal sandbox check: `npm run spike:paypal`.
