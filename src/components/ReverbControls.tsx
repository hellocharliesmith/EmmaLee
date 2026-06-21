import { useRef } from 'react';
import { setReverbType, setReverbWet, setReverbDecay, setReverbPreDelay, setReverbTone } from '../audio/engine';

const TYPES = [
  { id: 'plate',   label: 'Plate' },
  { id: 'hall',    label: 'Hall' },
  { id: 'digital', label: 'Digital' },
  { id: 'algo',    label: 'Algo'  },
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
  const decayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTypeChange(id: string) {
    if (id === activeType) return;
    onTypeChange(id);
    void setReverbType(id);
  }

  function handleDecayChange(value: number) {
    onDecayChange(value);
    if (decayTimer.current) clearTimeout(decayTimer.current);
    decayTimer.current = setTimeout(() => setReverbDecay(value), 200);
  }

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
            >{t.label}</button>
          ))}
        </div>
      </div>
      <div className="knob-row">
        <label>Mix</label>
        <input type="range" min={0} max={1} step={0.01} value={wet}
          onChange={e => { const v = parseFloat(e.target.value); onWetChange(v); setReverbWet(v); }} />
      </div>
      <div className="knob-row">
        <label>Decay</label>
        <input type="range" min={0.05} max={1} step={0.01} value={decay}
          onChange={e => handleDecayChange(parseFloat(e.target.value))} />
      </div>
      <div className="knob-row">
        <label>Pre-delay</label>
        <input type="range" min={0} max={0.12} step={0.001} value={preDelay}
          onChange={e => { const v = parseFloat(e.target.value); onPreDelayChange(v); setReverbPreDelay(v); }} />
      </div>
      <div className="knob-row">
        <label>Tone</label>
        <input type="range" min={0} max={1} step={0.01} value={tone / 20000}
          onChange={e => {
            const hz = parseFloat(e.target.value) * 20000;
            onToneChange(hz); setReverbTone(hz);
          }} />
      </div>
    </div>
  );
}
