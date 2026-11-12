import { useId, useState } from 'react';
import type { Finding } from '../api';
import { Badge } from './ui';
import { motion } from 'motion/react';
import { SegPill } from './fx';

export interface Marked {
  f: Finding;
  /** short tag drawn on the box */
  tag: string;
  kind: 'existing' | 'new' | 'review';
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const sevTone = (s: string) => (s === 'severe' ? 'bad' : s === 'moderate' ? 'warn' : 'neutral');

/** Photo with boxes. box_2d is [ymin, xmin, ymax, xmax] on Gemini's 0-1000 grid. */
export function BoxedPhoto({
  src,
  alt,
  marks,
  active,
  onHover,
}: {
  src: string;
  alt: string;
  marks: Marked[];
  active?: number | null;
  onHover?: (i: number | null) => void;
}) {
  return (
    <div className="photo">
      <img src={src} alt={alt} loading="lazy" />
      {marks.map((m, i) => {
        const [y0, x0, y1, x1] = m.f.box_2d as [number, number, number, number];
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 1.35 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.25 + i * 0.12, ease: [0.2, 0.8, 0.2, 1] }}
            className={`mark mark-${m.kind} ${active === i ? 'is-active' : ''}`}
            style={{ top: `${y0 / 10}%`, left: `${x0 / 10}%`, height: `${(y1 - y0) / 10}%`, width: `${(x1 - x0) / 10}%` }}
            onMouseEnter={() => onHover?.(i)}
            onMouseLeave={() => onHover?.(null)}
          >
            <span className="mark-tag">{m.tag}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Side-by-side or slider comparison of one angle, with a findings list linked to the boxes. */
export function ComparePanel({
  angle,
  beforeSrc,
  afterSrc,
  existing,
  found,
  ignored,
}: {
  angle: string;
  beforeSrc: string;
  afterSrc: string;
  existing: Finding[];
  found: (Finding & { needsReview?: boolean; amountCents?: number })[];
  ignored: string[];
}) {
  const [mode, setMode] = useState<'side' | 'slide'>('side');
  const [split, setSplit] = useState(50);
  const [active, setActive] = useState<number | null>(null);
  const sliderId = useId();

  const before: Marked[] = existing.map((f, i) => ({ f, tag: `E${i + 1}`, kind: 'existing' }));
  const after: Marked[] = found.map((f, i) => ({ f, tag: `N${i + 1}`, kind: f.needsReview ? 'review' : 'new' }));

  return (
    <section className="compare" aria-label={`${angle} angle comparison`}>
      <header className="compare-head">
        <div className="compare-title">
          <h3>{angle}</h3>
          {found.length ? <Badge tone="bad">{found.length} new</Badge> : <Badge tone="good">No new damage</Badge>}
          {ignored.length > 0 && <Badge tone="neutral">{ignored.length} pre-existing ignored</Badge>}
        </div>
        <div className="seg" role="group" aria-label="Comparison view">
          <button aria-pressed={mode === 'side'} onClick={() => setMode('side')}>
            {mode === 'side' && <SegPill group={`cmp-${sliderId}`} />}
            <span className="seg-txt">Side by side</span>
          </button>
          <button aria-pressed={mode === 'slide'} onClick={() => setMode('slide')}>
            {mode === 'slide' && <SegPill group={`cmp-${sliderId}`} />}
            <span className="seg-txt">Slider</span>
          </button>
        </div>
      </header>

      {mode === 'side' ? (
        <div className="compare-grid">
          <figure>
            <figcaption>
              <span className="cap-dot cap-before" /> Pick-up
            </figcaption>
            <BoxedPhoto src={beforeSrc} alt={`${angle} at pick-up`} marks={before} />
          </figure>
          <figure>
            <figcaption>
              <span className="cap-dot cap-after" /> Return
            </figcaption>
            <BoxedPhoto src={afterSrc} alt={`${angle} at return`} marks={after} active={active} onHover={setActive} />
          </figure>
        </div>
      ) : (
        <div className="slider-wrap">
          <div className="slider-stage">
            <BoxedPhoto src={beforeSrc} alt={`${angle} at pick-up`} marks={before} />
            <div className="slider-top" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <BoxedPhoto src={afterSrc} alt={`${angle} at return`} marks={after} active={active} onHover={setActive} />
            </div>
            <div className="slider-line" style={{ left: `${split}%` }} aria-hidden="true" />
            <span className="slider-label left">Pick-up</span>
            <span className="slider-label right">Return</span>
          </div>
          <label className="sr-only" htmlFor={sliderId}>
            Reveal return photo
          </label>
          <input id={sliderId} type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="range" />
        </div>
      )}

      <ul className="findings">
        {found.map((f, i) => (
          <li
            key={`n${i}`}
            className={active === i ? 'is-active' : ''}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            tabIndex={0}
          >
            <span className={`f-tag ${f.needsReview ? 'f-review' : 'f-new'}`}>N{i + 1}</span>
            <span className="f-label">{f.label}</span>
            <Badge tone={sevTone(f.severity)} dot={false}>
              {f.severity}
            </Badge>
            <Confidence value={f.confidence} />
            {f.needsReview && <Badge tone="warn">Manual review</Badge>}
          </li>
        ))}
        {existing.map((f, i) => (
          <li key={`e${i}`} className="is-existing">
            <span className="f-tag f-existing">E{i + 1}</span>
            <span className="f-label">{f.label}</span>
            <span className="muted small">pre-existing · signed at pick-up</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Confidence({ value }: { value: number }) {
  const tone = value >= 0.8 ? 'good' : value >= 0.6 ? 'info' : 'warn';
  return (
    <span className="conf" title="Model's own confidence estimate, not a measured accuracy">
      <span className="conf-bar" aria-hidden="true">
        <span className={`conf-fill tone-${tone}`} style={{ width: pct(value) }} />
      </span>
      <span className="conf-num">{pct(value)}</span>
    </span>
  );
}
