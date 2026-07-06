import { useEffect, useRef } from 'react';
import { registerScope } from './lfoScopeDriver';
import type { LfoState } from '../types';

interface LfoScopeProps {
  lfo: LfoState;
  maxDepth?: number; // normalizes lfo.depth to the box height (Rings' Depth knob runs 0-0.5)
  width?: number;
  height?: number;
  className?: string; // e.g. LfoXYPad positions this as an absolute-filled background layer
}

const WINDOW_SECONDS = 1.6;  // how much time the box width spans, oscilloscope-style

// Deterministic 1D value noise — a continuous, smoothly-wandering function of
// time with no state/history to maintain, so each frame just re-samples it at
// the current instant (same trick as the sine branch below). Stands in for
// Rings' actual "smooth random" LFO (audio-thread, genuinely stateful/random)
// — not sample-accurate, just visually representative of a wandering curve.
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return (s - Math.floor(s)) * 2 - 1;
}
function smoothNoise(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i), b = hash(i + 1);
  return a + (b - a) * u;
}

// Renders the running waveform for one Rings LFO — rate sets how fast it
// animates, depth sets how much vertical room it uses in the box. Updates an
// SVG path's `d` attribute directly via ref on every driver tick instead of
// going through React state/re-render, and reads live rate/depth/wave off a
// ref so dragging those knobs never has to re-subscribe the animation.
export function LfoScope({ lfo, maxDepth = 0.5, width = 48, height = 48, className }: LfoScopeProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const lfoRef = useRef(lfo);
  useEffect(() => { lfoRef.current = lfo; }, [lfo]);

  // Path resolution scales with box width — 32 points was plenty at ~48px,
  // but reads as choppy stretched across a ~160px+ XY pad.
  const points = Math.max(24, Math.round(width / 3));

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;

    if (!lfoRef.current.on) {
      // Flat resting line — and no animation loop subscribed at all while off.
      path.setAttribute('d', `M0,${height / 2} L${width},${height / 2}`);
      return;
    }

    return registerScope(now => {
      const { wave, rate, depth } = lfoRef.current;
      // -strokeWidth/2 so a full-depth peak's stroke reaches the box edge
      // without being clipped by the svg's own bounds, not padding the box.
      const amp = Math.min(1, depth / maxDepth) * (height / 2 - 0.75);
      const midY = height / 2;
      const t0 = now / 1000;
      let d = '';
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const t = t0 - ((points - 1 - i) / (points - 1)) * WINDOW_SECONDS;
        const v = wave === 'sine' ? Math.sin(2 * Math.PI * rate * t) : smoothNoise(t * rate * 1.5);
        const y = midY - v * amp;
        d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      }
      path.setAttribute('d', d);
    });
  }, [lfo.on, width, height, maxDepth, points]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className={`lfo-scope${lfo.on ? ' on' : ''}${className ? ` ${className}` : ''}`}>
      <path ref={pathRef} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
