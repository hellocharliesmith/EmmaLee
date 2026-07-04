import { useState } from 'react';

// Fully custom-styled dropdown — native <select> can't be dark-themed
// cross-browser (the closed control can be styled, but the open popup menu
// always falls back to the OS's stock appearance). This renders both the
// closed button and the open menu ourselves, matching the rest of the UI.
export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string; // shown when value doesn't match any option, e.g. preset pickers that always reset
  className?: string;
}

export function Dropdown({ value, options, onChange, placeholder, className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);

  return (
    <div className={`dv-dropdown${className ? ` ${className}` : ''}`}>
      <button type="button" className="dv-dropdown-btn" onClick={() => setOpen(v => !v)}>
        <span className="dv-dropdown-label">{current ? current.label : (placeholder ?? '')}</span>
        <span className="dv-dropdown-caret">▾</span>
      </button>
      {open && (
        <>
          <div className="dv-dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="dv-dropdown-menu">
            {placeholder && !current && (
              <div className="dv-dropdown-item dv-dropdown-placeholder">{placeholder}</div>
            )}
            {options.map(o => (
              <div key={o.value}
                className={`dv-dropdown-item${o.value === value ? ' selected' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
