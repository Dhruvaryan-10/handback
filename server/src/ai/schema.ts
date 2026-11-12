import { z } from 'zod';

export const DAMAGE_TYPES = ['scratch', 'dent', 'crack', 'missing_part', 'stain', 'other'] as const;
export const SEVERITIES = ['minor', 'moderate', 'severe'] as const;

/** box_2d is [ymin, xmin, ymax, xmax], each normalised to 0-1000, as Gemini returns boxes. */
export const Box = z
  .array(z.number().min(0).max(1000))
  .length(4)
  .refine(([y0, x0, y1, x1]) => y1! > y0! && x1! > x0!, 'box must have positive area');

export const Finding = z.object({
  label: z.string().min(1).max(120),
  type: z.enum(DAMAGE_TYPES),
  severity: z.enum(SEVERITIES),
  box_2d: Box,
  confidence: z.number().min(0).max(1),
});
export type Finding = z.infer<typeof Finding>;

export const PhotoQuality = z.object({
  usable: z.boolean(),
  reason: z.string().max(200).default(''),
});

export const BaselineResult = z.object({
  quality: PhotoQuality,
  marks: z.array(Finding).max(25),
});
export type BaselineResult = z.infer<typeof BaselineResult>;

export const DiffResult = z.object({
  quality: PhotoQuality,
  same_item: z.boolean(),
  new_findings: z.array(Finding).max(25),
  /** labels of baseline marks that are still visible and were correctly ignored */
  matched_preexisting: z.array(z.string()).max(25),
});
export type DiffResult = z.infer<typeof DiffResult>;

/** JSON Schema sent to Gemini (responseJsonSchema). Kept in sync with the zod schemas above. */
const findingJson = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'Short description, e.g. "crack on lens hood rim"' },
    type: { type: 'string', enum: [...DAMAGE_TYPES] },
    severity: { type: 'string', enum: [...SEVERITIES] },
    box_2d: {
      type: 'array',
      items: { type: 'number' },
      minItems: 4,
      maxItems: 4,
      description: '[ymin, xmin, ymax, xmax] normalised 0-1000 on the image being described',
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['label', 'type', 'severity', 'box_2d', 'confidence'],
} as const;

const qualityJson = {
  type: 'object',
  properties: { usable: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['usable', 'reason'],
} as const;

export const baselineJsonSchema = {
  type: 'object',
  properties: { quality: qualityJson, marks: { type: 'array', items: findingJson } },
  required: ['quality', 'marks'],
};

export const diffJsonSchema = {
  type: 'object',
  properties: {
    quality: qualityJson,
    same_item: { type: 'boolean' },
    new_findings: { type: 'array', items: findingJson },
    matched_preexisting: { type: 'array', items: { type: 'string' } },
  },
  required: ['quality', 'same_item', 'new_findings', 'matched_preexisting'],
};
