import { useState, useRef } from 'react';
import { setReverbType, setReverbDecay, setReverbPreDelay, setReverbTone, setReverbWet } from '../audio/engine';

const TYPES = [
  { id: 'plate',   label: 'Plate' },
  { id: 'hall',    label: 'Hall' },
  { id: 'digital', label: 'Digital' },
  { id: 'algo',    label: 'Algo' },  // algorithmic plate — no IR, low CPU
];

export function ReverbControls() {
  const [activeType, setActiveType] = useState('algo');
  const [wet, setWet] = useState(0.5);
  const [decay, setDecay] = useState(0.72);
  const [preDelay, setPreDelay] = useState(0.02);
  const [tone, setTone] = useState(6000);
  const [loading, setLoading] = useState(false);
  const decayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleTypeChange(id: string) {
    if (id === activeType || loading) return;
    setLoading(true);
    await setReverbType(id);
    setActiveType(id);
    setLoading(false);
  }

  // Debounce decay so we don't re-process IR on every frame
  function handleDecayChange(value: number) {
    setDecay(value);
    if (decayTimer.current) clearTimeout(decayTimer.current);
    decayTimer.current = setTimeout(() => setReverbDecay(value), 200);
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
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="knob-row">
        <label>Mix</label>
        <input type="range" min={0} max={1} step={0.01} value={wet}
          onChange={e => { const v = parseFloat(e.target.value); setWet(v); setReverbWet(v); }} />
      </div>

      <div className="knob-row">
        <label>Decay</label>
        <input type="range" min={0.05} max={1} step={0.01} value={decay}
          onChange={e => handleDecayChange(parseFloat(e.target.value))} />
      </div>

      <div className="knob-row">
        <label>Pre-delay</label>
        <input type="range" min={0} max={0.12} step={0.001} value={preDelay}
          onChange={e => { const v = parseFloat(e.target.value); setPreDelay(v); setReverbPreDelay(v); }} />
      </div>

      <div className="knob-row">
        <label>Tone</label>
        <input type="range" min={500} max={20000} step={100} value={tone}
          onChange={e => { const v = parseFloat(e.target.value); setTone(v); setReverbTone(v); }} />
      </div>
    </div>
  );
}
