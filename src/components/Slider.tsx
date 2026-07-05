// Flat two-tone horizontal slider — no thumb, muted resting fill, full-accent
// fill + a thin tick on hover/focus/drag. Wraps a real <input type="range">
// (opacity 0, stretched over the whole track) so drag/touch/keyboard all keep
// working natively; the visible bar is two decorative divs driven by the
// computed value percentage. See DESIGN_BRIEF.md / design_handoff for the
// source spec this replaced the old native-styled range inputs with.
export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  vertical?: boolean; // Master tab mixer faders — fills bottom-up instead of left-right
  bipolar?: boolean; // 12-o'clock-centered knobs (Clouds' Density/Pitch — see manual: "at 12
                      // o'clock, no grains"/"original frequency"). Fill grows from the midpoint
                      // instead of the left edge, and a permanent center detent mark is shown.
  className?: string;
  accent?: string; // override --accent locally, e.g. per-track mixer fader tint
}

export function Slider({ value, min, max, step = 0.01, onChange, disabled, vertical, bipolar, className, accent }: SliderProps) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const centerPct = ((min + max) / 2 - min) / (max - min) * 100;
  const fillStyle = bipolar
    ? (vertical
      ? { bottom: `${Math.min(pct, centerPct)}%`, height: `${Math.abs(pct - centerPct)}%` }
      : { left: `${Math.min(pct, centerPct)}%`, width: `${Math.abs(pct - centerPct)}%` })
    : (vertical ? { height: `${pct}%` } : { width: `${pct}%` });
  const tickStyle = vertical ? { bottom: `${pct}%` } : { left: `${pct}%` };
  const centerStyle = vertical ? { bottom: `${centerPct}%` } : { left: `${centerPct}%` };
  const wrapStyle = accent ? ({ '--accent': accent } as React.CSSProperties) : undefined;
  return (
    <div className={`dv-slider${vertical ? ' vertical' : ''}${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`} style={wrapStyle}>
      <div className="dv-slider-fill" style={fillStyle} />
      {bipolar && <div className="dv-slider-center" style={centerStyle} />}
      <div className="dv-slider-tick" style={tickStyle} />
      <input
        type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
