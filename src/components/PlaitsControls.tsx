import { setPlaitsParam, setPlaitsModel, setPlaitsLFOEnabled, setPlaitsLFOWave, setPlaitsLFORate, setPlaitsLFODepth } from '../audio/engine';
import { Knob } from './Knob';
import { Slider } from './Slider';
import { Dropdown } from './Dropdown';
import { LfoScope } from './LfoScope';
import { lfoIcon, nextLfoState } from './lfoCycle';
import type { LfoState } from '../types';
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

// Param 3 (Decay) is an engine-independent hardware global. Params 0-2 have
// engine-specific meanings mapped below. Param 4 (LPG Colour) used to be a
// 5th slider here — it read as a toggle rather than a useful continuous
// control, so it's no longer exposed at all and is pinned to its "darker"
// full-lowpass-gate value in engine.ts instead.
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
const FIXED_LABEL = 'Decay';

// LFO index matches param index: 0=Harmonics, 1=Timbre, 2=Morph, 3=Decay
const PARAM_LFO_INDEX = [0, 1, 2, 3];

export interface PlaitsControlsProps {
  engine: number;
  params: [number, number, number, number, number];
  lfo: LfoState[];
  presets: PlaitsPreset[];
  onPresetLoad: (p: PlaitsPreset) => void;
  onEngineChange: (e: number) => void;
  onParamChange: (i: number, v: number) => void;
  onLfoChange: (i: number, updates: Partial<LfoState>) => void;
}

export function PlaitsControls({ engine, params, lfo, presets, onPresetLoad, onEngineChange, onParamChange, onLfoChange }: PlaitsControlsProps) {
  const engineLabels = ENGINE_PARAM_LABELS[engine] ?? FALLBACK_LABELS;

  function labelFor(i: number): string {
    return i < 3 ? engineLabels[i] : FIXED_LABEL;
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

      {PARAM_LFO_INDEX.map(i => {
        const val = params[i];
        const lfoState = lfo[i];
        return (
          <div key={i}>
            <div className="knob-row param-row">
              <label>{labelFor(i)}</label>
              <Slider
                value={val} min={0} max={1}
                onChange={v => { onParamChange(i, v); setPlaitsParam(i, v); }}
              />
              {lfoState && (
                <div className="lfo-inline">
                  <div className="lfo-cycle-wrap">
                    <button
                      className={`lfo-cycle-btn${lfoState.on ? ' on' : ''}`}
                      onClick={() => {
                        const next = nextLfoState(lfoState);
                        onLfoChange(i, next);
                        if ('wave' in next && next.wave) setPlaitsLFOWave(i, next.wave);
                        if ('on' in next && next.on !== undefined) setPlaitsLFOEnabled(i, next.on);
                      }}
                    >{lfoIcon(lfoState)}</button>
                    <div className="cap">shape</div>
                  </div>
                  <Knob
                    value={lfoState.rate} min={1 / 30} max={8} label="Rate" size={48} log
                    disabled={!lfoState.on}
                    onChange={v => { onLfoChange(i, { rate: v }); setPlaitsLFORate(i, v); }}
                  />
                  <Knob
                    value={lfoState.depth} min={0} max={0.5} label="Depth" size={48}
                    disabled={!lfoState.on}
                    onChange={v => { onLfoChange(i, { depth: v }); setPlaitsLFODepth(i, v); }}
                  />
                  <div className="lfo-cycle-wrap">
                    <LfoScope lfo={lfoState} maxDepth={0.5} />
                    <div className="cap">wave</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
