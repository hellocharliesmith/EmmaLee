import { useRef, useCallback, useState } from 'react';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (v: number) => void;
  size?: number;      // outer SVG size in px — 44 default, 48 for Rate/Depth, 68 for Sends
  disabled?: boolean; // inert: dim ring, no arc
  log?: boolean;      // logarithmic taper — e.g. LFO Rate, where the musically
                      // useful slow end would otherwise be squeezed into a
                      // sliver of the knob's travel under a linear taper
}

const MIN_ANG = -135;
const MAX_ANG =  135;

// r19/stroke5 @ 48px (Rate/Depth), r27/stroke7 @ 68px (Sends) — from the
// design_handoff CSS spec, kept exact rather than approximated.
const STROKE_BY_SIZE: Record<number, number> = { 48: 5, 68: 7 };

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, a1: number, a2: number) {
  const s = polar(cx, cy, r, a1), e = polar(cx, cy, r, a2);
  const large = (a2 - a1) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export function Knob({ value, min, max, label, onChange, size = 44, disabled = false, log = false }: KnobProps) {
  const [dragging, setDragging] = useState(false);

  const normFromValue = useCallback((v: number) => {
    const n = log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
    return Math.max(0, Math.min(1, n));
  }, [min, max, log]);
  const valueFromNorm = useCallback((n: number) => {
    const v = log ? min * Math.pow(max / min, n) : min + n * (max - min);
    return Math.max(min, Math.min(max, v));
  }, [min, max, log]);

  const norm  = normFromValue(value);
  const angle = MIN_ANG + norm * (MAX_ANG - MIN_ANG);
  const drag  = useRef<{ y: number; norm: number } | null>(null);

  const cx = size / 2, cy = size / 2;
  // Exact stroke widths for the two spec'd sizes (48 -> r19/stroke5, 68 ->
  // r27/stroke7, per design_handoff's CSS spec); anything else falls back to
  // the same rate of change so an unlisted size still scales sensibly.
  const strokeW = STROKE_BY_SIZE[size] ?? Math.max(3, 0.2 + size * 0.1);
  const r = size / 2 - strokeW;

  const startDrag = useCallback((clientY: number) => {
    if (disabled) return;
    drag.current = { y: clientY, norm: normFromValue(value) };
    setDragging(true);
    const move = (y: number) => {
      if (!drag.current) return;
      const delta = (drag.current.y - y) / 120;
      onChange(valueFromNorm(Math.max(0, Math.min(1, drag.current.norm + delta))));
    };
    const mouseMove = (e: MouseEvent) => move(e.clientY);
    const touchMove = (e: TouchEvent) => { e.preventDefault(); move(e.touches[0].clientY); };
    const end = () => {
      drag.current = null;
      setDragging(false);
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', end);
    };
    window.addEventListener('mousemove', mouseMove);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', end);
  }, [value, normFromValue, valueFromNorm, disabled, onChange]);

  return (
    <div
      className={`knob${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
      onMouseDown={e => { e.preventDefault(); startDrag(e.clientY); }}
      onTouchStart={e => { e.preventDefault(); startDrag(e.touches[0].clientY); }}
      title={disabled ? label : `${label}: ${value.toFixed(2)}`}
      style={{ width: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <path d={arc(cx, cy, r, MIN_ANG, MAX_ANG)} fill="none" className="knob-track" strokeWidth={strokeW} strokeLinecap="butt" />
        {/* Value */}
        {!disabled && norm > 0.005 && (
          <path d={arc(cx, cy, r, MIN_ANG, angle)} fill="none" className="knob-arc" strokeWidth={strokeW} strokeLinecap="butt" />
        )}
      </svg>
      <div className="knob-label">{label}</div>
    </div>
  );
}
