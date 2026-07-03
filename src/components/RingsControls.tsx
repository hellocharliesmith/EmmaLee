import { setRingsParam, setRingsModel, setLFOEnabled, setLFOWave, setLFORate, setLFODepth,
         type RingsTrackId } from '../audio/engine';
import { Knob } from './Knob';
import { Slider } from './Slider';
import type { LfoState } from '../types';
import type { RingsPreset } from '../presets';

const MODELS = [
  { id: 0, label: 'Modal',   description: 'Struck metal, glass, wood — 60 resonant modes' },
  { id: 1, label: 'Strings', description: 'Sympathetic strings — sitar-like overtones' },
  { id: 2, label: 'String',  description: 'Karplus-Strong — plucked/bowed string' },
  // Secret modes (bonus models from MI firmware)
  { id: 3, label: 'FM',      description: 'FM voice — stiff string + frequency modulation' },
  { id: 4, label: 'Sym.Q',   description: 'Sympathetic strings, pitch-quantized to semitones' },
  { id: 5, label: 'S+Rev',   description: 'String synth with Rings\' built-in plate reverb (Damping controls depth)' },
];

const PARAM_LABELS = ['Structure', 'Brightness', 'Damping', 'Position'];
const PARAM_DESCS  = [
  'Resonator coupling & mode density',
  'Tone of the resonator',
  'Decay time',
  'Excitation position along the string/plate',
];

// LFO index matches param index: 0=Structure, 1=Brightness, 2=Damping, 3=Position
const PARAM_LFO_INDEX = [0, 1, 2, 3];

// Off -> Sine -> Random -> Off, single button, icon reflects state.
function lfoIcon(lfo: LfoState) {
  if (!lfo.on) return <span className="lfo-icon-dash" />;
  if (lfo.wave === 'sine') {
    return (
      <svg width="16" height="10" viewBox="0 0 20 12">
        <path d="M1,6 C4,0 6,12 9,6 C12,0 14,12 17,6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 20 20">
      <circle cx="5" cy="5" r="1.4" fill="currentColor" /><circle cx="15" cy="5" r="1.4" fill="currentColor" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" /><circle cx="5" cy="15" r="1.4" fill="currentColor" />
      <circle cx="15" cy="15" r="1.4" fill="currentColor" />
    </svg>
  );
}

function nextLfoState(lfo: LfoState): Partial<LfoState> {
  if (!lfo.on) return { on: true, wave: 'sine' };
  if (lfo.wave === 'sine') return { on: true, wave: 'random' };
  return { on: false };
}

export interface RingsControlsProps {
  trackId: RingsTrackId;
  model: number;
  params: [number, number, number, number];
  lfo: LfoState[];
  presets: RingsPreset[];
  onPresetLoad: (p: RingsPreset) => void;
  onModelChange: (m: number) => void;
  onParamChange: (i: number, v: number) => void;
  onLfoChange: (i: number, updates: Partial<LfoState>) => void;
}

export function RingsControls({ trackId, model, params, lfo, presets, onPresetLoad, onModelChange, onParamChange, onLfoChange }: RingsControlsProps) {
  return (
    <div className="rings-controls">
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
        <label>Model</label>
        <select className="preset-select model-select" value={model}
          onChange={e => { const m = parseInt(e.target.value); onModelChange(m); setRingsModel(trackId, m); }}
          title={MODELS.find(m => m.id === model)?.description}
        >
          {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      {params.map((val, i) => {
        const lfoIdx = PARAM_LFO_INDEX[i];
        const lfoState = lfoIdx >= 0 ? lfo[lfoIdx] : null;
        return (
          <div key={i}>
            <div className="knob-row param-row">
              <label title={PARAM_DESCS[i]}>{PARAM_LABELS[i]}</label>
              <Slider
                value={val} min={0} max={1}
                onChange={v => { onParamChange(i, v); setRingsParam(trackId, i, v); }}
              />
              {lfoState && (
                <div className="lfo-inline">
                  <div className="lfo-cycle-wrap">
                    <button
                      className={`lfo-cycle-btn${lfoState.on ? ' on' : ''}`}
                      onClick={() => {
                        const next = nextLfoState(lfoState);
                        onLfoChange(lfoIdx, next);
                        if ('wave' in next && next.wave) setLFOWave(trackId, lfoIdx, next.wave);
                        if ('on' in next && next.on !== undefined) setLFOEnabled(trackId, lfoIdx, next.on);
                      }}
                    >{lfoIcon(lfoState)}</button>
                    <div className="cap">shape</div>
                  </div>
                  <Knob
                    value={lfoState.rate} min={0.05} max={8} label="Rate" size={48}
                    disabled={!lfoState.on}
                    onChange={v => { onLfoChange(lfoIdx, { rate: v }); setLFORate(trackId, lfoIdx, v); }}
                  />
                  <Knob
                    value={lfoState.depth} min={0} max={0.5} label="Depth" size={48}
                    disabled={!lfoState.on}
                    onChange={v => { onLfoChange(lfoIdx, { depth: v }); setLFODepth(trackId, lfoIdx, v); }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
