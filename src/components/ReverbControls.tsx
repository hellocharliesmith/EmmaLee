import { useRef } from 'react';
import { setReverbType, setReverbWet, setReverbDecay, setReverbPreDelay, setReverbTone } from '../audio/engine';
import { Slider } from './Slider';

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
      <div className="panel-name">Reverb</div>
      <div className="knob-row">
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
        <Slider value={wet} min={0} max={1}
          onChange={v => { onWetChange(v); setReverbWet(v); }} />
      </div>
      <div className="knob-row">
        <label>Decay</label>
        <Slider value={decay} min={0.05} max={1}
          onChange={v => handleDecayChange(v)} />
      </div>
      <div className="knob-row">
        <label>Pre-delay</label>
        <Slider value={preDelay} min={0} max={0.12} step={0.001}
          onChange={v => { onPreDelayChange(v); setReverbPreDelay(v); }} />
      </div>
      <div className="knob-row">
        <label>Tone</label>
        <Slider value={tone / 20000} min={0} max={1}
          onChange={v => {
            const hz = v * 20000;
            onToneChange(hz); setReverbTone(hz);
          }} />
      </div>
    </div>
  );
}
