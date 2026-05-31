import { useState } from 'react';
import { setRingsParam, setRingsModel, setLFOEnabled, setLFOWave, setLFORate, setLFODepth } from '../audio/engine';

const MODELS = [
  { id: 0, label: 'Modal',   description: 'Struck metal, glass, wood — 60 resonant modes' },
  { id: 1, label: 'Strings', description: 'Sympathetic strings — sitar-like overtones' },
  { id: 2, label: 'String',  description: 'Karplus-Strong — plucked/bowed string' },
];

interface ParamDef { id: number; label: string; default: number; lfo: number; }

const PARAMS: ParamDef[] = [
  { id: 0, label: 'Structure',  default: 0.30, lfo: -1 },
  { id: 1, label: 'Brightness', default: 0.50, lfo:  0 },
  { id: 2, label: 'Damping',    default: 0.50, lfo:  1 },
  { id: 3, label: 'Position',   default: 0.25, lfo:  2 },
];

function ParamRow({ p }: { p: ParamDef }) {
  const [lfoOn, setLfoOn]     = useState(false);
  const [wave, setWaveState]  = useState<'sine' | 'random'>('sine');
  const [rate, setRateState]  = useState(0.5);
  const [depth, setDepthState] = useState(0.15);

  function toggleWave() {
    const v = wave === 'sine' ? 'random' : 'sine';
    setWaveState(v); setLFOWave(p.lfo, v);
  }
  function toggleLfo() {
    const v = !lfoOn; setLfoOn(v); setLFOEnabled(p.lfo, v);
  }

  return (
    <div>
      <div className="knob-row">
        <label title={p.label}>{p.label}</label>
        <input type="range" min={0} max={1} step={0.01} defaultValue={p.default}
          onChange={e => setRingsParam(p.id, parseFloat(e.target.value))} />
        {p.lfo >= 0 && (
          <div className="lfo-inline">
            <button
              className={`reverb-type-btn lfo-wave-btn${wave === 'random' ? ' active' : ''}`}
              onClick={toggleWave}
              title={wave === 'sine' ? 'Sine' : 'Smooth Random'}
            >{wave === 'sine' ? '∿' : 'rnd'}</button>
            <button
              className={`reverb-type-btn${lfoOn ? ' active' : ''}`}
              onClick={toggleLfo}
            >{lfoOn ? 'On' : 'Off'}</button>
          </div>
        )}
      </div>
      {lfoOn && p.lfo >= 0 && (
        <div className="lfo-sub">
          <div className="knob-row">
            <label>Rate</label>
            <input type="range" min={0.05} max={8} step={0.05} value={rate}
              onChange={e => { const v = parseFloat(e.target.value); setRateState(v); setLFORate(p.lfo, v); }} />
          </div>
          <div className="knob-row">
            <label>Depth</label>
            <input type="range" min={0} max={0.5} step={0.01} value={depth}
              onChange={e => { const v = parseFloat(e.target.value); setDepthState(v); setLFODepth(p.lfo, v); }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function RingsControls() {
  const [activeModel, setActiveModel] = useState(0);

  return (
    <div className="rings-controls">
      <div className="knob-row">
        <label>Model</label>
        <div className="reverb-type-btns">
          {MODELS.map(m => (
            <button key={m.id}
              className={`reverb-type-btn${activeModel === m.id ? ' active' : ''}`}
              onClick={() => { setActiveModel(m.id); setRingsModel(m.id); }}
              title={m.description}
            >{m.label}</button>
          ))}
        </div>
      </div>
      {PARAMS.map(p => <ParamRow key={p.id} p={p} />)}
    </div>
  );
}
