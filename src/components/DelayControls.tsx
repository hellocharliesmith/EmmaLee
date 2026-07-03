import { useEffect } from 'react';
import { setDelayTime, setDelayFeedback, setDelayMix, setDelayFilter } from '../audio/engine';
import { divisionSeconds } from '../audio/utils';
import { Slider } from './Slider';

const DIVISIONS = [
  { id: '1/16', label: '1/16' },
  { id: '1/8',  label: '1/8'  },
  { id: 'd1/8', label: 'd1/8' },
  { id: '1/4',  label: '1/4'  },
];

export interface DelayControlsProps {
  bpm: number;
  division: string;
  mix: number;
  feedback: number;
  filter: number;
  onDivisionChange: (d: string) => void;
  onMixChange: (v: number) => void;
  onFeedbackChange: (v: number) => void;
  onFilterChange: (v: number) => void;
}

export function DelayControls({ bpm, division, mix, feedback, filter,
  onDivisionChange, onMixChange, onFeedbackChange, onFilterChange }: DelayControlsProps) {

  useEffect(() => {
    setDelayTime(divisionSeconds(division, bpm));
  }, [division, bpm]);

  return (
    <div className="rings-controls">
      <div className="section-divider" />
      <div className="panel-name">Delay</div>
      <div className="knob-row">
        <div className="reverb-type-btns">
          {DIVISIONS.map(d => (
            <button key={d.id}
              className={`reverb-type-btn${division === d.id ? ' active' : ''}`}
              onClick={() => onDivisionChange(d.id)}
            >{d.label}</button>
          ))}
        </div>
      </div>
      <div className="knob-row">
        <label>Mix</label>
        <Slider value={mix} min={0} max={0.8}
          onChange={v => { onMixChange(v); setDelayMix(v); }} />
      </div>
      <div className="knob-row">
        <label>Feedback</label>
        <Slider value={feedback} min={0} max={0.92}
          onChange={v => { onFeedbackChange(v); setDelayFeedback(v); }} />
      </div>
      <div className="knob-row">
        <label>Filter</label>
        <Slider value={filter} min={500} max={12000} step={100}
          onChange={v => { onFilterChange(v); setDelayFilter(v); }} />
      </div>
    </div>
  );
}
