import { useCallback, useRef } from 'react';
import { LfoScope } from './LfoScope';
import type { LfoState } from '../types';

export interface LfoXYPadProps {
  lfo: LfoState;
  rateMin?: number;
  rateMax?: number;
  depthMin?: number;
  depthMax?: number;
  onRateChange: (v: number) => void;
  onDepthChange: (v: number) => void;
  size?: number;
}

// Combines Rate (x) and Depth (y) into one draggable pad instead of two
// separate knobs — LfoScope renders the running waveform as a full-bleed
// background layer behind the handle, so the pad doubles as a live preview.
export function LfoXYPad({
  lfo, rateMin = 0.05, rateMax = 8, depthMin = 0, depthMax = 0.5,
  onRateChange, onDepthChange, size = 160,
}: LfoXYPadProps) {
  const padRef = useRef<HTMLDivElement>(null);

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onRateChange(rateMin + x * (rateMax - rateMin));
    onDepthChange(depthMin + (1 - y) * (depthMax - depthMin));
  }, [rateMin, rateMax, depthMin, depthMax, onRateChange, onDepthChange]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lfo.on) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lfo.on || e.buttons !== 1) return;
    updateFromPointer(e.clientX, e.clientY);
  };

  const xPct = Math.max(0, Math.min(1, (lfo.rate  - rateMin)  / (rateMax  - rateMin)))  * 100;
  const yPct = (1 - Math.max(0, Math.min(1, (lfo.depth - depthMin) / (depthMax - depthMin)))) * 100;

  return (
    <div className="lfo-xy-frame">
      <div className="lfo-xy-axis-y">Depth</div>
      <div
        ref={padRef}
        className={`lfo-xy-pad${lfo.on ? '' : ' disabled'}`}
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <LfoScope lfo={lfo} maxDepth={depthMax} width={size} height={size} className="lfo-xy-bg" />
        <div className="lfo-xy-handle" style={{ left: `${xPct}%`, top: `${yPct}%` }} />
      </div>
      <div className="lfo-xy-axis-x">Rate</div>
    </div>
  );
}
