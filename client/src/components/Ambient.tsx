/**
 * Slow-moving gradient behind every page: four soft colour fields drifting on long loops,
 * plus a fine grain so the gradient never bands. Pure CSS transforms (GPU), paused for reduced motion.
 */
export function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
      <span className="blob b4" />
      <span className="grain" />
    </div>
  );
}
