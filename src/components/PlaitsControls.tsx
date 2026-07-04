import { setPlaitsParam, setPlaitsModel } from '../audio/engine';
import { Slider } from './Slider';
import { Dropdown } from './Dropdown';
import type { PlaitsPreset } from '../presets';

// Engine indices match Plaits' actual hardware registration order (see voice.cc
// RegisterInstance calls) — NOT member-declaration order in voice.h. Confirmed
// independently via hardcoded engine_index checks inside Voice::Render (15=Speech,
// 7=Chiptune). Only a curated subset is exposed here; the WASM binary has all 22
// engines compiled in (Voice statically includes all of them), this just limits
// the picker.
const ENGINES = [
  { id: 8,  label: 'Virtual Analog', description: 'Classic analog-style waveforms (saw/pulse/sync)' },
  { id: 10, label: 'FM',             description: '2-op FM — bells, metallic tones' },
  { id: 19, label: 'String',         description: 'Karplus-Strong string — plucky, different character than Rings' },
  { id: 20, label: 'Modal',          description: 'Modal resonator — bell/mallet-like' },
  { id: 2,  label: 'Six-Op',         description: '6-operator FM (DX7-style) — complex FM textures' },
  { id: 6,  label: 'String Machine', description: 'String-machine/organ pads — lush, sustained' },
];

// Params 3-4 (Decay / LPG Colour) are engine-independent hardware globals.
// Params 0-2 have engine-specific meanings mapped below.
type ParamLabelRow = [string, string, string]; // [harmonics, timbre, morph]
const ENGINE_PARAM_LABELS: Record<number, ParamLabelRow> = {
  8:  ['Overtones',  'Cutoff',      'Shape'],      // Virtual Analog
  10: ['FM Ratio',   'Mod Depth',   'Feedback'],   // FM (2-op)
  19: ['Brightness', 'Damping',     'Structure'],  // String (Karplus-Strong)
  20: ['Material',   'Brightness',  'Damping'],    // Modal resonator
  2:  ['Algorithm',  'Mod Depth',   'Feedback'],   // Six-Op FM
  6:  ['Register',   'Tone',        'Ensemble'],   // String Machine
};
const FALLBACK_LABELS: ParamLabelRow = ['Harmonics', 'Timbre', 'Morph'];
const FIXED_LABELS = ['Decay', 'LPG Colour'] as const;

export interface PlaitsControlsProps {
  engine: number;
  params: [number, number, number, number, number];
  presets: PlaitsPreset[];
  onPresetLoad: (p: PlaitsPreset) => void;
  onEngineChange: (e: number) => void;
  onParamChange: (i: number, v: number) => void;
}

export function PlaitsControls({ engine, params, presets, onPresetLoad, onEngineChange, onParamChange }: PlaitsControlsProps) {
  const engineLabels = ENGINE_PARAM_LABELS[engine] ?? FALLBACK_LABELS;

  function labelFor(i: number): string {
    if (i < 3) return engineLabels[i];
    return FIXED_LABELS[i - 3];
  }

  return (
    <div className="rings-controls">
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
        <label>Engine</label>
        <Dropdown className="model-select" value={String(engine)}
          options={ENGINES.map(m => ({ value: String(m.id), label: m.label }))}
          onChange={v => { const eg = parseInt(v); onEngineChange(eg); setPlaitsModel(eg); }}
        />
      </div>

      {params.map((val, i) => (
        <div key={i} className="knob-row param-row">
          <label>{labelFor(i)}</label>
          <Slider
            value={val} min={0} max={1}
            onChange={v => { onParamChange(i, v); setPlaitsParam(i, v); }}
          />
        </div>
      ))}
    </div>
  );
}
