import { setCloudsParam, setCloudsFreeze, setCloudsWet, setCloudsReverbSend } from '../audio/engine';
import type { TexturePreset } from '../presets';

// Master-bus granular texture effect (Mutable Instruments Clouds' granular
// mode only — Stretch/Looping-Delay/Spectral modes exist in the underlying
// DSP but aren't exposed here, kept simple on purpose). Each track sends into
// this bus via its own "Texture" send knob (App.tsx's per-track Sends row,
// same pattern as Delay/Reverb) — this panel controls the shared granular
// engine itself plus its overall return level ("Mix"), and sits between Delay
// and Reverb in the Master tab layout (not the signal path — Delay/Texture/
// Reverb are still independent parallel sends, see engine.ts).
//
// Position/Size/Density/Texture/Feedback are Clouds' own 0-1 native range.
// Pitch is in semitones (-48..+48), scaled from a 0-1 slider here for UI
// consistency with everything else. Clouds' own internal reverb knob is
// intentionally left out — Master already has a dedicated Reverb section and
// a second overlapping "reverb" control would just be confusing. ReverbSend
// below is different: it's an extra tap feeding Clouds' own output into that
// same shared Reverb, off by default (0), not the internal Clouds reverb.

export interface CloudsUiState {
  position: number;
  size: number;
  pitch: number;    // 0-1 UI value, maps to -48..+48 semitones
  density: number;
  texture: number;
  feedback: number;
  mix: number;       // return level into the master bus
  reverbSend: number; // amount fed into the shared Reverb, independent of Mix
  freeze: boolean;
}

export interface CloudsControlsProps {
  state: CloudsUiState;
  presets: TexturePreset[];
  onPresetLoad: (p: TexturePreset) => void;
  onChange: (next: Partial<CloudsUiState>) => void;
}

export function CloudsControls({ state, presets, onPresetLoad, onChange }: CloudsControlsProps) {
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
      {presets.length > 0 && (
        <div className="knob-row">
          <label>Preset</label>
          <select className="preset-select" defaultValue=""
            onChange={e => {
              const p = presets[parseInt(e.target.value)];
              if (p) onPresetLoad(p);
              e.target.value = '';
            }}>
            <option value="" disabled>— Load preset —</option>
            {presets.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div className="knob-row">
        <label>Texture</label>
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
      <div className="knob-row">
        <label>&gt; Reverb</label>
        <input type="range" min={0} max={1} step={0.01} value={state.reverbSend}
          onChange={e => { const v = parseFloat(e.target.value); onChange({ reverbSend: v }); setCloudsReverbSend(v); }} />
      </div>
    </div>
  );
}
