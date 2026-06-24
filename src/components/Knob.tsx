import { useRef, useCallback } from 'react';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (v: number) => void;
}

const MIN_ANG = -135;
const MAX_ANG =  135;
const CX = 27, CY = 27, R = 19;

function polar(angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function arc(a1: number, a2: number) {
  const s = polar(a1), e = polar(a2);
  const large = (a2 - a1) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export function Knob({ value, min, max, label, onChange }: KnobProps) {
  const norm  = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = MIN_ANG + norm * (MAX_ANG - MIN_ANG);
  const dot   = polar(angle);
  const drag  = useRef<{ y: number; val: number } | null>(null);

  const startDrag = useCallback((clientY: number) => {
    drag.current = { y: clientY, val: value };
    const move = (y: number) => {
      if (!drag.current) return;
      const delta = (drag.current.y - y) / 120;
      onChange(Math.max(min, Math.min(max, drag.current.val + delta * (max - min))));
    };
    const mouseMove = (e: MouseEvent) => move(e.clientY);
    const touchMove = (e: TouchEvent) => { e.preventDefault(); move(e.touches[0].clientY); };
    const end = () => {
      drag.current = null;
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', touchMove);
      window.removeEventListener('touchend', end);
    };
    window.addEventListener('mousemove', mouseMove);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('touchend', end);
  }, [value, min, max, onChange]);

  return (
    <div
      className="knob"
      onMouseDown={e => { e.preventDefault(); startDrag(e.clientY); }}
      onTouchStart={e => { e.preventDefault(); startDrag(e.touches[0].clientY); }}
      title={`${label}: ${value.toFixed(2)}`}
    >
      <svg width="54" height="54" viewBox="0 0 54 54">
        {/* Track */}
        <path d={arc(MIN_ANG, MAX_ANG)} fill="none" style={{ stroke: 'var(--border)' }} strokeWidth="3.5" strokeLinecap="round" />
        {/* Value */}
        {norm > 0.005 && (
          <path d={arc(MIN_ANG, angle)} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="3.5" strokeLinecap="round" />
        )}
        {/* Dot */}
        <circle cx={dot.x.toFixed(2)} cy={dot.y.toFixed(2)} r="3.5" style={{ fill: 'var(--accent-light)' }} />
        {/* Hub */}
        <circle cx={CX} cy={CY} r="7" style={{ fill: 'var(--bg-input)', stroke: 'var(--border-disabled)' }} strokeWidth="1.5" />
      </svg>
      <div className="knob-label">{label}</div>
    </div>
  );
}
