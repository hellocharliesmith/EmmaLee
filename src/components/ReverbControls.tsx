import { useState } from 'react';
import { setReverbType, setReverbWet } from '../audio/engine';

const TYPES = [
  { id: 'plate', label: 'Plate' },
  { id: 'hall', label: 'Hall' },
  { id: 'digital', label: 'Digital' },
];

export function ReverbControls() {
  const [activeType, setActiveType] = useState('plate');
  const [wet, setWet] = useState(0.45);
  const [loading, setLoading] = useState(false);

  async function handleTypeChange(id: string) {
    if (id === activeType || loading) return;
    setLoading(true);
    await setReverbType(id);
    setActiveType(id);
    setLoading(false);
  }

  function handleWetChange(value: number) {
    setWet(value);
    setReverbWet(value);
  }

  return (
    <div className="rings-controls">
      <div className="section-divider" />
      <div className="knob-row">
        <label>Reverb</label>
        <div className="reverb-type-btns">
          {TYPES.map(t => (
            <button
              key={t.id}
              className={`reverb-type-btn${activeType === t.id ? ' active' : ''}`}
              onClick={() => handleTypeChange(t.id)}
              disabled={loading}
            >
              {loading && activeType !== t.id && t.id === activeType ? '…' : t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="knob-row">
        <label>Mix</label>
        <input
          type="range" min={0} max={1} step={0.01} value={wet}
          onChange={e => handleWetChange(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}
