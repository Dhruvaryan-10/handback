/**
 * Gemini verification for Handback. Tests the primary and fallback models SEPARATELY.
 *
 *   npm run check:gemini                            -> model probe with a generated test image
 *                                                     (auth, model availability, image input, structured output)
 *   npm run check:gemini -- before.jpg              -> + pick-up baseline on your photo
 *   npm run check:gemini -- before.jpg after.jpg    -> + return-vs-pick-up comparison
 *
 * Use two photos of the same object from about the same angle; add a removable mark
 * (dry-erase line, small sticker) before the second. Nothing secret is printed.
 *
 * Exit code: 0 = primary model fully working · 2 = only the fallback works · 1 = failed.
 */
import 'dotenv/config';
import { readFile, stat } from 'node:fs/promises';
import { VisionInspector, AIUnavailableError, type Attempt, type Photo, type Inspection } from '../server/src/ai/gemini.js';
import { validateImageBytes, ImageValidationError, MAX_PHOTO_BYTES } from '../server/src/ai/image.js';
import { probePng } from './probe-image.js';
import type { BaselineResult, DiffResult, Finding } from '../server/src/ai/schema.js';

const ITEM = process.env.CHECK_ITEM_NAME ?? 'rental item';
const PRIMARY = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FALLBACK = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

const line = (s = '') => console.log(s);
const head = (s: string) => line(`\n=== ${s} ===`);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const fmtFinding = (f: Finding) =>
  `   - ${f.label}  [${f.type}, ${f.severity}, confidence ${pct(f.confidence)}]  box [ymin ${f.box_2d[0]}, xmin ${f.box_2d[1]}, ymax ${f.box_2d[2]}, xmax ${f.box_2d[3]}] (0-1000)`;

function fail(msg: string): never {
  console.error(`\nERROR: ${msg}`);
  process.exit(1);
}

async function loadPhoto(path: string, label: string): Promise<Photo> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    fail(`${label} photo not found: ${path}\n       Give the path to a .jpg, .png or .webp file (put quotes around paths with spaces).`);
  }
  if (size > MAX_PHOTO_BYTES) fail(`${label} photo is ${(size / 1048576).toFixed(1)} MB; the limit is ${MAX_PHOTO_BYTES / 1048576} MB. Resize it to about 1600 px on the long side.`);
  const bytes = await readFile(path);
  try {
    const mimeType = validateImageBytes(bytes, `${label} photo`);
    return { angle: 'front', mimeType, data: bytes.toString('base64') };
  } catch (e) {
    if (e instanceof ImageValidationError) fail(e.message);
    throw e;
  }
}

/** Runs one model only (primary = fallback = this model), so a failure belongs to that model. */
async function run<T>(model: string, fn: (v: VisionInspector) => Promise<Inspection<T>>): Promise<{ ok: true; value: T; ms: number } | { ok: false; attempts: Attempt[]; message: string }> {
  const v = new VisionInspector(process.env.GEMINI_API_KEY, model, model);
  const t = Date.now();
  try {
    const r = await fn(v);
    return { ok: true, value: r.result, ms: Date.now() - t };
  } catch (e) {
    if (e instanceof AIUnavailableError) return { ok: false, attempts: e.attempts, message: e.attempts[0]?.message ?? e.message };
    return { ok: false, attempts: [], message: (e as Error).message };
  }
}

function printBaseline(b: BaselineResult) {
  line(`   Photo usable: ${b.quality.usable ? 'yes' : 'NO'}${b.quality.reason ? ` (${b.quality.reason})` : ''}`);
  line(`   Existing marks: ${b.marks.length}`);
  b.marks.forEach((m) => line(fmtFinding(m)));
}

function printDiff(d: DiffResult) {
  line(`   Photo usable: ${d.quality.usable ? 'yes' : 'NO'}${d.quality.reason ? ` (${d.quality.reason})` : ''}`);
  line(`   Same item: ${d.same_item ? 'yes' : 'NO, looks like a different object'}`);
  line(`   Recognised as pre-existing (ignored): ${d.matched_preexisting.length ? d.matched_preexisting.join('; ') : '(none)'}`);
  line(`   NEW damage: ${d.new_findings.length}`);
  d.new_findings.forEach((f) => line(fmtFinding(f)));
}

const status: Record<string, { probe?: boolean; baseline?: boolean; diff?: boolean }> = { [PRIMARY]: {}, [FALLBACK]: {} };

async function main() {
  if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is empty. Put it in the .env file in the project folder (not .env.example).');
  const [beforePath, afterPath] = process.argv.slice(2);

  line(`Handback Gemini check · primary ${PRIMARY} · fallback ${FALLBACK}`);
  const before = beforePath ? await loadPhoto(beforePath, 'Before') : null;
  const after = afterPath ? await loadPhoto(afterPath, 'After') : null;

  head('1. Model probe (generated test image: grey panel with one dark diagonal line)');
  const probe = probePng();
  for (const model of [PRIMARY, FALLBACK]) {
    const r = await run(model, (v) => v.inspectBaseline(probe, 'test panel'));
    status[model]!.probe = r.ok;
    if (r.ok) {
      line(` VERIFIED  ${model}  (${sec(r.ms)})  key accepted · model available · image accepted · JSON matched the schema`);
      line(`           saw ${r.value.marks.length} mark(s)${r.value.marks[0] ? `, e.g. "${r.value.marks[0].label}"` : ''}`);
    } else {
      line(` FAILED    ${model}  ${r.message}`);
      if (r.attempts[0]?.kind === 'invalid_key') fail('The API key was rejected; fix GEMINI_API_KEY and run again.');
    }
  }

  if (before) {
    head('2. Pick-up baseline on your BEFORE photo');
    let baselineMarks: Finding[] | null = null;
    for (const model of [PRIMARY, FALLBACK]) {
      const r = await run(model, (v) => v.inspectBaseline(before, ITEM));
      status[model]!.baseline = r.ok;
      line(`\n ${model}: ${r.ok ? `OK (${sec(r.ms)})` : `FAILED  ${r.message}`}`);
      if (r.ok) {
        printBaseline(r.value);
        baselineMarks ??= r.value.marks;
      }
    }

    if (after && baselineMarks) {
      head('3. Return vs pick-up on your AFTER photo');
      line(' (each model gets the same baseline: the primary model\'s marks, or the fallback\'s if the primary failed)');
      for (const model of [PRIMARY, FALLBACK]) {
        const r = await run(model, (v) => v.inspectDiff(before, after, baselineMarks!, ITEM));
        status[model]!.diff = r.ok;
        line(`\n ${model}: ${r.ok ? `OK (${sec(r.ms)})` : `FAILED  ${r.message}`}`);
        if (r.ok) printDiff(r.value);
      }
    }
  }

  head('Summary');
  for (const model of [PRIMARY, FALLBACK]) {
    const s = status[model]!;
    const parts = [`probe ${s.probe ? 'ok' : 'FAILED'}`];
    if (before) parts.push(`baseline ${s.baseline ? 'ok' : 'FAILED'}`);
    if (after) parts.push(`comparison ${s.diff ? 'ok' : s.diff === false ? 'FAILED' : 'not run'}`);
    line(` ${model.padEnd(28)} ${parts.join(' · ')}`);
  }
  if (!before) line('\n Next: run with your photos:  npm run check:gemini -- before.jpg after.jpg');
  else if (!after) line('\n Next: add the AFTER photo to test the comparison.');
  else line('\n Judge it yourself: is the new mark under "NEW damage" with a box in the right place, and are old marks under "pre-existing"?');
  line(' Reminder: these are AI observations to support a human decision, not proof. The shop approves every charge.');

  const primaryOk = Object.values(status[PRIMARY]!).every((v) => v !== false) && status[PRIMARY]!.probe;
  const fallbackOk = Object.values(status[FALLBACK]!).every((v) => v !== false) && status[FALLBACK]!.probe;
  process.exitCode = primaryOk ? 0 : fallbackOk ? 2 : 1;
}

main().catch((e) => fail((e as Error).message));
