import { useState, useRef } from 'react';
import { setReverbType, setReverbWet, setReverbDecay, setReverbPreDelay, setReverbTone,
         setRingsReverbEnabled, setRingsReverbParams } from '../audio/engine';

const TYPES = [
  { id: 'plate',   label: 'Plate' },
  { id: 'hall',    label: 'Hall' },
  { id: 'digital', label: 'Digital' },
  { id: 'algo',    label: 'Algo'  },
  { id: 'rings',   label: 'Rings' }, // built-in FDN reverb from Rings DSP
];

export interface ReverbControlsProps {
  activeType: string;
  wet: number;
  decay: number;
  preDelay: number;
  tone: number;
  onTypeChange: (t: string) => void;
  onWetChange: (v: number) => void;
  onDecayChange: (v: number) => void;
  onPreDelayChange: (v: number) => void;
  onToneChange: (v: number) => void;
}

export function ReverbControls({ activeType, wet, decay, preDelay, tone,
  onTypeChange, onWetChange, onDecayChange, onPreDelayChange, onToneChange }: ReverbControlsProps) {
  const [loading, setLoading] = useState(false);
  const decayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleTypeChange(id: string) {
    if (id === activeType || loading) return;
    setLoading(true);
    if (id === 'rings') {
      // Enable Rings DSP reverb, bypass external chain
      setRingsReverbEnabled(true);
      setRingsReverbParams(wet, decay, tone);
    } else {
      // Switching away from Rings reverb — disable it
      if (activeType === 'rings') setRingsReverbEnabled(false);
      await setReverbType(id);
    }
    onTypeChange(id);
    setLoading(false);
  }

  function handleDecayChange(value: number) {
    onDecayChange(value);
    if (decayTimer.current) clearTimeout(decayTimer.current);
    decayTimer.current = setTimeout(() => setReverbDecay(value), 200);
  }

  const isRings = activeType === 'rings';

  return (
    <div className="rings-controls">
      <div className="section-divider" />
      <div className="knob-row">
        <label>Reverb</label>
        <div className="reverb-type-btns" style={{ flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <button key={t.id}
              className={`reverb-type-btn${activeType === t.id ? ' active' : ''}`}
              onClick={() => handleTypeChange(t.id)}
              disabled={loading}
            >{t.label}</button>
          ))}
        </div>
      </div>
      <div className="knob-row">
        <label>Mix</label>
        <input type="range" min={0} max={1} step={0.01} value={wet}
          onChange={e => {
            const v = parseFloat(e.target.value);
            onWetChange(v);
            if (isRings) setRingsReverbParams(v, decay, tone);
            else setReverbWet(v);
          }} />
      </div>
      <div className="knob-row">
        <label>Decay</label>
        <input type="range" min={0.05} max={1} step={0.01} value={decay}
          onChange={e => {
            const v = parseFloat(e.target.value);
            onDecayChange(v);
            if (isRings) setRingsReverbParams(wet, v, tone);
            else handleDecayChange(v);
          }} />
      </div>
      {!isRings && (
        <div className="knob-row">
          <label>Pre-delay</label>
          <input type="range" min={0} max={0.12} step={0.001} value={preDelay}
            onChange={e => { const v = parseFloat(e.target.value); onPreDelayChange(v); setReverbPreDelay(v); }} />
        </div>
      )}
      <div className="knob-row">
        <label>Tone</label>
        <input type="range" min={0} max={1} step={0.01}
          value={isRings ? tone : tone / 20000}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (isRings) { onToneChange(v); setRingsReverbParams(wet, decay, v); }
            else { const hz = v * 20000; onToneChange(hz); setReverbTone(hz); }
          }} />
      </div>
    </div>
  );
}
