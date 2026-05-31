import { useState } from 'react';
import { setLFOEnabled, setLFOWave, setLFORate, setLFODepth } from '../audio/engine';

const TARGETS = ['Brightness', 'Damping', 'Position'];

function LFORow({ label, index }: { label: string; index: number }) {
  const [enabled, setEnabled] = useState(false);
  const [wave, setWave] = useState<'sine' | 'random'>('sine');
  const [rate, setRate] = useState(0.5);
  const [depth, setDepth] = useState(0.15);

  function toggleEnabled() {
    const v = !enabled; setEnabled(v); setLFOEnabled(index, v);
  }
  function toggleWave() {
    const v = wave === 'sine' ? 'random' : 'sine';
    setWave(v); setLFOWave(index, v);
  }

  return (
    <div>
      <div className="knob-row">
        <label>{label}</label>
        <div className="reverb-type-btns">
          <button
            className={`reverb-type-btn${wave === 'random' ? ' active' : ''}`}
            onClick={toggleWave}
            title={wave === 'sine' ? 'Sine — click for Smooth Random' : 'Smooth Random — click for Sine'}
          >
            {wave === 'sine' ? '∿' : 'rnd'}
          </button>
          <button
            className={`reverb-type-btn${enabled ? ' active' : ''}`}
            onClick={toggleEnabled}
          >
            {enabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {enabled && (<>
        <div className="knob-row">
          <label>Rate</label>
          <input type="range" min={0.05} max={8} step={0.05} value={rate}
            onChange={e => { const v = parseFloat(e.target.value); setRate(v); setLFORate(index, v); }} />
        </div>
        <div className="knob-row">
          <label>Depth</label>
          <input type="range" min={0} max={0.5} step={0.01} value={depth}
            onChange={e => { const v = parseFloat(e.target.value); setDepth(v); setLFODepth(index, v); }} />
        </div>
      </>)}
    </div>
  );
}

export function LFOControls() {
  return (
    <div className="rings-controls">
      <div className="section-divider" />
      {TARGETS.map((label, i) => (
        <LFORow key={i} label={label} index={i} />
      ))}
    </div>
  );
}
