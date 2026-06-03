import { setRingsParam, setRingsModel, setLFOEnabled, setLFOWave, setLFORate, setLFODepth } from '../audio/engine';
import { Knob } from './Knob';
import type { LfoState } from '../types';

const MODELS = [
  { id: 0, label: 'Modal',   description: 'Struck metal, glass, wood — 60 resonant modes' },
  { id: 1, label: 'Strings', description: 'Sympathetic strings — sitar-like overtones' },
  { id: 2, label: 'String',  description: 'Karplus-Strong — plucked/bowed string' },
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

export interface RingsControlsProps {
  model: number;
  params: [number, number, number, number];
  lfo: LfoState[];
  onModelChange: (m: number) => void;
  onParamChange: (i: number, v: number) => void;
  onLfoChange: (i: number, updates: Partial<LfoState>) => void;
}

export function RingsControls({ model, params, lfo, onModelChange, onParamChange, onLfoChange }: RingsControlsProps) {
  return (
    <div className="rings-controls">
      <div className="knob-row">
        <label>Model</label>
        <div className="reverb-type-btns">
          {MODELS.map(m => (
            <button key={m.id}
              className={`reverb-type-btn${model === m.id ? ' active' : ''}`}
              onClick={() => { onModelChange(m.id); setRingsModel(m.id); }}
              title={m.description}
            >{m.label}</button>
          ))}
        </div>
      </div>

      {params.map((val, i) => {
        const lfoIdx = PARAM_LFO_INDEX[i];
        const lfoState = lfoIdx >= 0 ? lfo[lfoIdx] : null;
        return (
          <div key={i}>
            <div className="knob-row param-row">
              <label title={PARAM_DESCS[i]}>{PARAM_LABELS[i]}</label>
              <input
                type="range" min={0} max={1} step={0.01} value={val}
                onChange={e => { const v = parseFloat(e.target.value); onParamChange(i, v); setRingsParam(i, v); }}
              />
              {lfoState && (
                <div className="lfo-inline">
                  <button
                    className={`reverb-type-btn${lfoState.wave === 'random' ? ' active' : ''}`}
                    onClick={() => {
                      const w = lfoState.wave === 'sine' ? 'random' : 'sine';
                      onLfoChange(lfoIdx, { wave: w });
                      setLFOWave(lfoIdx, w);
                    }}
                  >{lfoState.wave === 'sine' ? 'Sine' : 'Rnd'}</button>
                  <button
                    className={`reverb-type-btn${lfoState.on ? ' active' : ''}`}
                    onClick={() => {
                      const on = !lfoState.on;
                      onLfoChange(lfoIdx, { on });
                      setLFOEnabled(lfoIdx, on);
                    }}
                  >{lfoState.on ? 'On' : 'Off'}</button>
                  <div style={{ visibility: lfoState.on ? 'visible' : 'hidden', display: 'flex', gap: 4 }}>
                    <Knob
                      value={lfoState.rate} min={0.05} max={8} label="Rate"
                      onChange={v => { onLfoChange(lfoIdx, { rate: v }); setLFORate(lfoIdx, v); }}
                    />
                    <Knob
                      value={lfoState.depth} min={0} max={0.5} label="Depth"
                      onChange={v => { onLfoChange(lfoIdx, { depth: v }); setLFODepth(lfoIdx, v); }}
                    />
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
