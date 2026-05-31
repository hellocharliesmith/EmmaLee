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
const CX = 18, CY = 18, R = 13;

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
      <svg width="36" height="36" viewBox="0 0 36 36">
        {/* Track */}
        <path d={arc(MIN_ANG, MAX_ANG)} fill="none" stroke="#2e3040" strokeWidth="2.5" strokeLinecap="round" />
        {/* Value */}
        {norm > 0.005 && (
          <path d={arc(MIN_ANG, angle)} fill="none" stroke="#c4849a" strokeWidth="2.5" strokeLinecap="round" />
        )}
        {/* Dot */}
        <circle cx={dot.x.toFixed(2)} cy={dot.y.toFixed(2)} r="2.5" fill="#e8cad2" />
        {/* Hub */}
        <circle cx={CX} cy={CY} r="5" fill="#1e2028" stroke="#3a3d4a" strokeWidth="1" />
      </svg>
      <div className="knob-label">{label}</div>
    </div>
  );
}
