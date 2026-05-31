import { useState } from 'react';
import { setRingsParam, setRingsModel } from '../audio/engine';

const MODELS = [
  { id: 0, label: 'Modal', description: 'Struck metal, glass, wood — 60 resonant modes' },
  { id: 1, label: 'Strings', description: 'Sympathetic strings — sitar-like overtones' },
  { id: 2, label: 'String', description: 'Karplus-Strong — plucked/bowed string' },
];

const PARAMS = [
  { id: 0, label: 'Structure', description: 'Resonator coupling & mode density' },
  { id: 1, label: 'Brightness', description: 'Tone of the resonator' },
  { id: 2, label: 'Damping', description: 'Decay time' },
  { id: 3, label: 'Position', description: 'Excitation position along the string/plate' },
];

export function RingsControls() {
  const [activeModel, setActiveModel] = useState(0);

  function handleModelChange(id: number) {
    setActiveModel(id);
    setRingsModel(id);
  }

  return (
    <div className="rings-controls">
      <div className="knob-row">
        <label>Model</label>
        <div className="reverb-type-btns">
          {MODELS.map(m => (
            <button
              key={m.id}
              className={`reverb-type-btn${activeModel === m.id ? ' active' : ''}`}
              onClick={() => handleModelChange(m.id)}
              title={m.description}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {PARAMS.map(p => (
        <div key={p.id} className="knob-row">
          <label title={p.description}>{p.label}</label>
          <input
            type="range"
            min={0} max={1} step={0.01}
            defaultValue={p.id === 0 ? 0.3 : p.id === 3 ? 0.25 : 0.5}
            onChange={e => setRingsParam(p.id, parseFloat(e.target.value))}
          />
        </div>
      ))}
    </div>
  );
}
