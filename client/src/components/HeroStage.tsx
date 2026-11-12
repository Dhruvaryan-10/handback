import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { demoAfter, demoBefore } from '../lib/demoArt';

/**
 * Apple-style product stage: one large before/after of the illustrated camera.
 * Drag (or use arrow keys) to compare; on load it sweeps once to hint the interaction.
 */
export function HeroStage() {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const split = useMotionValue(reduce ? 52 : 100);
  const clip = useTransform(split, (v) => `inset(0 0 0 ${v}%)`);
  const left = useTransform(split, (v) => `${v}%`);
  const [pct, setPct] = useState(52);
  useMotionValueEvent(split, 'change', (v) => setPct(Math.round(v)));
  const dragging = useRef(false);

  useEffect(() => {
    if (reduce) return;
    const a = animate(split, [100, 30, 52], { duration: 2.4, delay: 0.9, ease: [0.45, 0, 0.2, 1], times: [0, 0.6, 1] });
    return () => a.stop();
  }, [reduce, split]);

  const setFrom = (clientX: number) => {
    const r = stage.current!.getBoundingClientRect();
    split.set(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFrom(e.clientX);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => dragging.current && setFrom(e.clientX);
  const onUp = () => (dragging.current = false);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 4;
    if (e.key === 'ArrowLeft') split.set(Math.max(0, split.get() - step));
    if (e.key === 'ArrowRight') split.set(Math.min(100, split.get() + step));
  };

  const showNew = pct < 80;
  return (
    <motion.figure
      className="stage"
      initial={reduce ? false : { opacity: 0, y: 40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1, delay: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div
        ref={stage}
        className="stage-media"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="slider"
        tabIndex={0}
        aria-label="Compare pick-up and return photos"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% pick-up photo shown`}
        onKeyDown={onKey}
      >
        <img src={demoBefore} alt="Camera at pick-up, with one existing scuff on the left grip" draggable={false} />
        <motion.div className="stage-after" style={{ clipPath: clip }}>
          <img src={demoAfter} alt="Camera at return, with a new crack on the lens ring" draggable={false} />
          <span className="stage-box stage-box-new" style={{ top: '50.5%', left: '67%', height: '16%', width: '9.5%' }} />
        </motion.div>
        <span className="stage-box stage-box-old" style={{ top: '47%', left: '24.5%', height: '10%', width: '8.5%' }} />

        <motion.div className="stage-handle" style={{ left }} aria-hidden="true">
          <span className="stage-knob">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" />
            </svg>
          </span>
        </motion.div>

        <span className="stage-tag stage-tag-l">Pick-up</span>
        <span className="stage-tag stage-tag-r">Return</span>

        <div className="glass stage-chip chip-old">
          <span className="chip-dot old" />
          <div>
            <strong>Scuff on grip</strong>
            <span>Pre-existing · signed at pick-up</span>
          </div>
        </div>
        <motion.div className="glass stage-chip chip-new" animate={{ opacity: showNew ? 1 : 0, y: showNew ? 0 : 8 }} transition={{ duration: 0.3 }}>
          <span className="chip-dot new" />
          <div>
            <strong>Crack on lens ring</strong>
            <span>New · 91% confidence · $45.00</span>
          </div>
        </motion.div>
      </div>

      <figcaption className="glass stage-bar">
        <div>
          <span>Deposit held</span>
          <strong>$300.00</strong>
        </div>
        <div>
          <span>Captured</span>
          <strong className="bad-text">$45.00</strong>
        </div>
        <div>
          <span>Released</span>
          <strong className="good-text">$255.00</strong>
        </div>
        <em>Illustration · drag to compare</em>
      </figcaption>
    </motion.figure>
  );
}
