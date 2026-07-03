// Pill-track + circular-thumb switch — the one rounded exception in an
// otherwise hard-cornered (radius 0) control system, since this is a
// mechanism (a physical switch) rather than a container. Off = dark track,
// dim thumb. On = accent-filled track, dark thumb pinned right.
export interface ToggleProps {
  on: boolean;
  onChange: (on: boolean) => void;
  label?: string;
}

export function Toggle({ on, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      className={`dv-toggle${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
      title={label}
      aria-pressed={on}
    >
      <span className="dv-toggle-thumb" />
    </button>
  );
}
