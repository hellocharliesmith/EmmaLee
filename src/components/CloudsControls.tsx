import { setCloudsParam, setCloudsFreeze, setCloudsWet } from '../audio/engine';

// Master-bus Clouds granular texture effect. Session-only state (App.tsx owns
// it, not persisted in the save format yet — see BACKLOG.md "Clouds params
// not saved"). Every track feeds this bus at a fixed level (cloudsSend in
// engine.ts, no per-track knob yet either) — this panel controls the shared
// granular engine itself plus its overall return level ("Mix").
//
// Position/Size/Density/Texture/Feedback/Reverb are Clouds' own 0-1 native
// range. Pitch is in semitones (-48..+48), scaled from a 0-1 slider here for
// UI consistency with everything else.

export interface CloudsUiState {
  position: number;
  size: number;
  pitch: number;    // 0-1 UI value, maps to -48..+48 semitones
  density: number;
  texture: number;
  feedback: number;
  reverb: number;
  mix: number;       // return level into the master bus
  freeze: boolean;
}

export interface CloudsControlsProps {
  state: CloudsUiState;
  onChange: (next: Partial<CloudsUiState>) => void;
}

export function CloudsControls({ state, onChange }: CloudsControlsProps) {
  function row(label: string, key: keyof CloudsUiState, param: number, min = 0, max = 1) {
    const value = state[key] as number;
    return (
      <div className="knob-row">
        <label>{label}</label>
        <input type="range" min={min} max={max} step={0.01} value={value}
          onChange={e => {
            const v = parseFloat(e.target.value);
            onChange({ [key]: v } as Partial<CloudsUiState>);
            if (key === 'pitch') {
              setCloudsParam(param, (v - 0.5) * 96); // 0-1 -> -48..+48 semitones
            } else {
              setCloudsParam(param, v);
            }
          }} />
      </div>
    );
  }

  return (
    <div className="rings-controls">
      <div className="section-divider" />
      <div className="knob-row">
        <label>Clouds</label>
        <button
          className={`reverb-type-btn${state.freeze ? ' active' : ''}`}
          onClick={() => { const next = !state.freeze; onChange({ freeze: next }); setCloudsFreeze(next); }}
        >{state.freeze ? 'Frozen' : 'Freeze'}</button>
      </div>
      <div className="knob-row">
        <label>Mix</label>
        <input type="range" min={0} max={1} step={0.01} value={state.mix}
          onChange={e => { const v = parseFloat(e.target.value); onChange({ mix: v }); setCloudsWet(v); }} />
      </div>
      {row('Position', 'position', 0)}
      {row('Size', 'size', 1)}
      {row('Pitch', 'pitch', 2)}
      {row('Density', 'density', 3)}
      {row('Texture', 'texture', 4)}
      {row('Feedback', 'feedback', 7)}
      {row('Reverb', 'reverb', 8)}
    </div>
  );
}
