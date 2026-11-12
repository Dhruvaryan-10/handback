/**
 * Premium interaction pieces, built on Motion (motion.dev).
 * Patterns adapted from: Kokonut UI (Slide to Confirm, Metric Card, AI Text Loading, Dot Field, Receipt),
 * Gauge UI (arc gauge with zones and needle), and Swipe Tabs (shared layout indicator).
 * Re-implemented here in plain CSS + Motion because those libraries require Tailwind/shadcn.
 */
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react';
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { IconArrowRight, IconCheck } from './icons';

const ease = [0.2, 0.8, 0.2, 1] as const;

/* ---------- Reveal on scroll ---------- */
export function Reveal({ children, delay = 0, y = 16, className, as = 'div' }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'li' | 'section' }) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease }}
    >
      {children}
    </M>
  );
}

/* ---------- Animated number (Metric Card) ---------- */
export function NumberTicker({ value, format = (n) => String(Math.round(n)), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = format(value);
      prev.current = value;
      return;
    }
    const c = animate(prev.current, value, {
      duration: 0.9,
      ease,
      onUpdate: (v) => (el.textContent = format(v)),
    });
    prev.current = value;
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);
  return (
    <span ref={ref} className={className} aria-label={format(value)}>
      {format(value)}
    </span>
  );
}
export const usdFmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ---------- Shimmer text (AI Text Loading) ---------- */
export function ShimmerText({ children }: { children: ReactNode }) {
  return <span className="shimmer-text">{children}</span>;
}

/* ---------- Spotlight card ---------- */
export function Spotlight({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <div className={`spotlight ${className}`} onMouseMove={onMove} style={style}>
      {children}
    </div>
  );
}

/* ---------- Deposit gauge (Gauge UI style) ---------- */
/** Half-circle arc: the captured share fills red from the left, the released share green; needle at the split. */
export function DepositGauge({ depositCents, capturedCents, label = 'of deposit captured', size = 220 }: { depositCents: number; capturedCents: number; label?: string; size?: number }) {
  const reduce = useReducedMotion();
  const share = depositCents ? Math.min(1, Math.max(0, capturedCents / depositCents)) : 0;
  const r = 80;
  const c = Math.PI * r;
  const p = useMotionValue(reduce ? share : 0);
  useEffect(() => {
    const a = animate(p, share, { duration: reduce ? 0 : 1.1, ease });
    return () => a.stop();
  }, [share, p, reduce]);
  const capDash = useTransform(p, (v) => `${v * c} ${c}`);
  const relDash = useTransform(p, (v) => `${(1 - v) * c} ${c}`);
  const relOffset = useTransform(p, (v) => -v * c);
  const needle = useTransform(p, (v) => `rotate(${-90 + v * 180}deg)`);
  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);
  return (
    <figure className="gauge" style={{ width: size }} aria-label={`${Math.round(share * 100)}% ${label}`}>
      <svg viewBox="0 0 200 116" role="img" aria-hidden="true">
        <path d="M20 100 A80 80 0 0 1 180 100" className="gauge-track" />
        <motion.path d="M20 100 A80 80 0 0 1 180 100" className="gauge-released" style={{ strokeDasharray: relDash, strokeDashoffset: relOffset }} />
        <motion.path d="M20 100 A80 80 0 0 1 180 100" className="gauge-captured" style={{ strokeDasharray: capDash }} />
        {ticks.map((t) => {
          const a = Math.PI * (1 - t);
          const x1 = 100 + Math.cos(a) * 64,
            y1 = 100 - Math.sin(a) * 64,
            x2 = 100 + Math.cos(a) * (t % 0.5 === 0 ? 56 : 60),
            y2 = 100 - Math.sin(a) * (t % 0.5 === 0 ? 56 : 60);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} className="gauge-tick" />;
        })}
        <motion.g style={{ transform: needle, transformOrigin: '100px 100px' }}>
          <line x1="100" y1="100" x2="100" y2="34" className="gauge-needle" />
        </motion.g>
        <circle cx="100" cy="100" r="6" className="gauge-hub" />
      </svg>
      <figcaption>
        <NumberTicker value={share * 100} format={(n) => `${Math.round(n)}%`} className="gauge-value" />
        <span className="gauge-label">{label}</span>
      </figcaption>
    </figure>
  );
}

/* ---------- Slide to confirm (Kokonut BT-14) ---------- */
/** Drag the handle to the end to confirm. Keyboard: focus the handle, press Enter. Never fires twice. */
export function SlideToConfirm({ label, onConfirm, disabled, busy, tone = 'ink' }: { label: string; onConfirm: () => void; disabled?: boolean; busy?: boolean; tone?: 'ink' | 'accent' }) {
  const track = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [max, setMax] = useState(0);
  const [done, setDone] = useState(false);
  const fill = useTransform(x, (v) => v + 52);
  const textOpacity = useTransform(x, [0, Math.max(1, max * 0.6)], [1, 0]);
  const id = useId();

  useEffect(() => {
    const measure = () => track.current && setMax(track.current.offsetWidth - 52 - 8);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  useEffect(() => {
    if (!busy && done) {
      setDone(false);
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 35 });
    }
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = () => {
    if (disabled || busy || done) return;
    setDone(true);
    animate(x, max, { duration: 0.2 });
    onConfirm();
  };
  const onEnd = (_: unknown, info: PanInfo) => {
    if (x.get() > max * 0.86 || info.velocity.x > 900) confirm();
    else animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
  };

  return (
    <div ref={track} className={`slide tone-${tone} ${disabled ? 'is-disabled' : ''} ${done ? 'is-done' : ''}`}>
      <motion.span className="slide-fill" style={{ width: fill }} aria-hidden="true" />
      <motion.span className="slide-label" style={{ opacity: textOpacity }} id={id}>
        {busy ? <ShimmerText>Talking to PayPal…</ShimmerText> : label}
      </motion.span>
      <motion.button
        type="button"
        className="slide-handle"
        drag={disabled || busy || done ? false : 'x'}
        dragConstraints={{ left: 0, right: max }}
        dragElastic={0.04}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={onEnd}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), confirm())}
        aria-labelledby={id}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
      >
        {done ? <IconCheck size={20} /> : <IconArrowRight size={20} />}
      </motion.button>
      <span id={`${id}-hint`} className="sr-only">
        Drag to the right, or press Enter, to confirm.
      </span>
    </div>
  );
}

/* ---------- Shared layout pill for segmented controls (Swipe Tabs) ---------- */
export function SegPill({ group }: { group: string }) {
  return <motion.span layoutId={`seg-${group}`} className="seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} aria-hidden="true" />;
}

/* ---------- Staggered list ---------- */
export const stagger = {
  parent: { hidden: {}, show: { transition: { staggerChildren: 0.06 } } },
  child: { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } },
};
