import { setPlaitsParam, setPlaitsModel } from '../audio/engine';

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

// Decay and LPG Colour are the hardware's "hold button A, turn Morph/Timbre"
// secondary functions — exposed here as regular sliders instead of a hold gesture.
const PARAM_LABELS = ['Harmonics', 'Timbre', 'Morph', 'Decay', 'LPG Colour'];
const PARAM_DESCS  = [
  'Harmonic content — meaning depends on engine',
  'Timbral character — meaning depends on engine',
  'Waveform morph — meaning depends on engine',
  'Envelope decay time (hold-A + Morph on real hardware)',
  'Low-pass gate tone: filtered/dark vs open/bright decay (hold-A + Timbre on real hardware)',
];

export interface PlaitsControlsProps {
  engine: number;
  params: [number, number, number, number, number];
  onEngineChange: (e: number) => void;
  onParamChange: (i: number, v: number) => void;
}

export function PlaitsControls({ engine, params, onEngineChange, onParamChange }: PlaitsControlsProps) {
  return (
    <div className="rings-controls">
      <div className="knob-row">
        <label>Engine</label>
        <div className="reverb-type-btns" style={{ flexWrap: 'wrap' }}>
          {ENGINES.map(m => (
            <button key={m.id}
              className={`reverb-type-btn${engine === m.id ? ' active' : ''}`}
              onClick={() => { onEngineChange(m.id); setPlaitsModel(m.id); }}
              title={m.description}
            >{m.label}</button>
          ))}
        </div>
      </div>

      {params.map((val, i) => (
        <div key={i} className="knob-row param-row">
          <label title={PARAM_DESCS[i]}>{PARAM_LABELS[i]}</label>
          <input
            type="range" min={0} max={1} step={0.01} value={val}
            onChange={e => { const v = parseFloat(e.target.value); onParamChange(i, v); setPlaitsParam(i, v); }}
          />
        </div>
      ))}
    </div>
  );
}
