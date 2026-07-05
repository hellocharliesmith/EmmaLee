import { setCloudsParam, setCloudsFreeze, setCloudsWet, setCloudsReverbSend, setCloudsQuality } from '../audio/engine';
import { Slider } from './Slider';
import { Toggle } from './Toggle';
import { Dropdown } from './Dropdown';
import type { TexturePreset } from '../presets';

// Manual's 4 quality settings, in the order the hardware's Blend/Quality
// button cycles through them (see clouds_wrapper.cpp's clouds_set_quality —
// bit0=mono, bit1=low-fidelity 8-bit mu-law). Buffer times are the printed
// hardware spec; this build's much larger sample memory means actual freeze
// time runs longer than these, but the rate/resolution/channel mapping is
// what "quality" actually selects.
const QUALITY_OPTIONS = [
  { value: '0', label: '32kHz 16-bit stereo (1s)' },
  { value: '1', label: '32kHz 16-bit mono (2s)' },
  { value: '2', label: '16kHz 8-bit µ-law stereo (4s)' },
  { value: '3', label: '16kHz 8-bit µ-law mono (8s)' },
];

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
  quality: number;   // 0-3, see QUALITY_OPTIONS / clouds_wrapper.cpp's clouds_set_quality
}

export interface CloudsControlsProps {
  state: CloudsUiState;
  presets: TexturePreset[];
  onPresetLoad: (p: TexturePreset) => void;
  onChange: (next: Partial<CloudsUiState>) => void;
}

export function CloudsControls({ state, presets, onPresetLoad, onChange }: CloudsControlsProps) {
  // bipolar: Density and Pitch are the two Clouds controls whose 12-o'clock
  // center is a real "zero" point (manual: density=no grains, pitch=original
  // frequency), not just a midpoint of a 0-1 range like Position/Size/Texture.
  function row(label: string, key: keyof CloudsUiState, param: number, bipolar = false, min = 0, max = 1) {
    const value = state[key] as number;
    return (
      <div className="knob-row">
        <label>{label}</label>
        <Slider value={value} min={min} max={max} bipolar={bipolar}
          onChange={v => {
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
      <div className="panel-name">
        Texture
        <Toggle on={state.freeze} label={state.freeze ? 'Frozen' : 'Freeze'}
          onChange={next => { onChange({ freeze: next }); setCloudsFreeze(next); }} />
      </div>
      {presets.length > 0 && (
        <div className="knob-row">
          <label>Preset</label>
          <Dropdown value="" placeholder="— Load preset —"
            options={presets.map((p, i) => ({ value: String(i), label: p.name }))}
            onChange={v => { const p = presets[parseInt(v)]; if (p) onPresetLoad(p); }}
          />
        </div>
      )}
      <div className="knob-row">
        <label>Mix</label>
        <Slider value={state.mix} min={0} max={1}
          onChange={v => { onChange({ mix: v }); setCloudsWet(v); }} />
      </div>
      {row('Position', 'position', 0)}
      {row('Size', 'size', 1)}
      {row('Pitch', 'pitch', 2, true)}
      {row('Density', 'density', 3, true)}
      {row('Texture', 'texture', 4)}
      {row('Feedback', 'feedback', 7)}
      <div className="knob-row">
        <label>&gt; Reverb</label>
        <Slider value={state.reverbSend} min={0} max={1}
          onChange={v => { onChange({ reverbSend: v }); setCloudsReverbSend(v); }} />
      </div>
      <div className="knob-row">
        <label>Quality</label>
        <Dropdown value={String(state.quality)} options={QUALITY_OPTIONS}
          onChange={v => { const q = parseInt(v); onChange({ quality: q }); setCloudsQuality(q); }}
        />
      </div>
    </div>
  );
}
