// Single shared requestAnimationFrame loop driving every mounted LfoScope.
// At most 4 scopes exist at once (one per Rings param, one track visible at a
// time), but this scales to zero cost regardless: the loop only runs while at
// least one scope is registered, and stops itself the instant the last one
// unregisters (LFO switched off, or the panel unmounts) — no idle timers.
// Throttled to ~30fps: plenty smooth for a small decorative sparkline, half
// the redraw work of tracking the display's native rate.
type Tick = (now: number) => void;

const callbacks = new Set<Tick>();
let rafId: number | null = null;
let lastRun = 0;
const FRAME_INTERVAL = 1000 / 30;

function loop(now: number) {
  if (now - lastRun >= FRAME_INTERVAL) {
    lastRun = now;
    callbacks.forEach(cb => cb(now));
  }
  rafId = requestAnimationFrame(loop);
}

export function registerScope(cb: Tick): () => void {
  callbacks.add(cb);
  if (rafId === null) rafId = requestAnimationFrame(loop);
  return () => {
    callbacks.delete(cb);
    if (callbacks.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
