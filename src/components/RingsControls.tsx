import { useState } from 'react';
import { setRingsParam, setRingsModel, setLFOEnabled, setLFOWave, setLFORate, setLFODepth } from '../audio/engine';
import { Knob } from './Knob';

const MODELS = [
  { id: 0, label: 'Modal',   description: 'Struck metal, glass, wood — 60 resonant modes' },
  { id: 1, label: 'Strings', description: 'Sympathetic strings — sitar-like overtones' },
  { id: 2, label: 'String',  description: 'Karplus-Strong — plucked/bowed string' },
];

interface LFODefault { on: boolean; wave: 'sine' | 'random'; rate: number; depth: number; }
interface ParamDef { id: number; label: string; default: number; lfo: number; lfoDefault?: LFODefault; }

const PARAMS: ParamDef[] = [
  { id: 0, label: 'Structure',  default: 0.30, lfo: -1 },
  { id: 1, label: 'Brightness', default: 0.50, lfo:  0,
    lfoDefault: { on: true, wave: 'random', rate: 1.6, depth: 0.1 } },
  { id: 2, label: 'Damping',    default: 0.50, lfo:  1 },
  { id: 3, label: 'Position',   default: 0.25, lfo:  2 },
];

function ParamRow({ p }: { p: ParamDef }) {
  const [lfoOn,  setLfoOn]  = useState(p.lfoDefault?.on    ?? false);
  const [wave,   setWaveSt] = useState<'sine'|'random'>(p.lfoDefault?.wave  ?? 'sine');
  const [rate,   setRateSt] = useState(p.lfoDefault?.rate  ?? 0.5);
  const [depth,  setDepthSt]= useState(p.lfoDefault?.depth ?? 0.15);

  function toggleWave() {
    const v = wave === 'sine' ? 'random' : 'sine';
    setWaveSt(v); setLFOWave(p.lfo, v);
  }
  function toggleLfo() {
    const v = !lfoOn; setLfoOn(v); setLFOEnabled(p.lfo, v);
  }

  return (
    <div className="knob-row param-row">
      <label>{p.label}</label>
      <input
        type="range" min={0} max={1} step={0.01} defaultValue={p.default}
        onChange={e => setRingsParam(p.id, parseFloat(e.target.value))}
      />
      {p.lfo >= 0 && (
        <div className="lfo-inline">
          <button
            className={`reverb-type-btn${wave === 'random' ? ' active' : ''}`}
            onClick={toggleWave}
            title={wave === 'sine' ? 'Sine — click for Smooth Random' : 'Smooth Random — click for Sine'}
          >
            {wave === 'sine' ? 'Sine' : 'Rnd'}
          </button>
          <button
            className={`reverb-type-btn${lfoOn ? ' active' : ''}`}
            onClick={toggleLfo}
          >
            {lfoOn ? 'On' : 'Off'}
          </button>
          {/* Always rendered — visibility preserves fixed row height */}
          <div style={{ visibility: lfoOn ? 'visible' : 'hidden', display: 'flex', gap: 4 }}>
            <Knob
              value={rate} min={0.05} max={8} label="Rate"
              onChange={v => { setRateSt(v); setLFORate(p.lfo, v); }}
            />
            <Knob
              value={depth} min={0} max={0.5} label="Depth"
              onChange={v => { setDepthSt(v); setLFODepth(p.lfo, v); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function RingsControls() {
  const [activeModel, setActiveModel] = useState(1); // Default: Strings

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
