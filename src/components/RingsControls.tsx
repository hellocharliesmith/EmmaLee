import { setRingsParam } from '../audio/engine';

const PARAMS = [
  { id: 0, label: 'Structure', description: 'Resonator coupling & mode density' },
  { id: 1, label: 'Brightness', description: 'Damping and filter brightness' },
  { id: 2, label: 'Damping', description: 'Decay time of the resonator' },
  { id: 3, label: 'Position', description: 'Excitation position along the string/plate' },
];

export function RingsControls() {
  return (
    <div className="rings-controls">
      {PARAMS.map(p => (
        <div key={p.id} className="knob-row">
          <label title={p.description}>{p.label}</label>
          <input
            type="range"
            min={0} max={1} step={0.01}
            defaultValue={0.5}
            onChange={e => setRingsParam(p.id, parseFloat(e.target.value))}
          />
        </div>
      ))}
    </div>
  );
}
