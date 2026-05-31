import { useState, useEffect } from 'react';
import { setDelayTime, setDelayFeedback, setDelayMix, setDelayFilter, setTapeMode } from '../audio/engine';

const DIVISIONS = [
  { id: '1/16', label: '1/16' },
  { id: '1/8',  label: '1/8'  },
  { id: 'd1/8', label: 'd1/8' },
  { id: '1/4',  label: '1/4'  },
];

function divisionSeconds(div: string, bpm: number): number {
  const beat = 60 / bpm;
  switch (div) {
    case '1/16': return beat / 4;
    case '1/8':  return beat / 2;
    case 'd1/8': return beat * 0.75;
    case '1/4':  return beat;
    default:     return beat / 2;
  }
}

interface Props { bpm: number; }

export function DelayControls({ bpm }: Props) {
  const [division, setDivision] = useState('1/8');
  const [feedback, setFeedback] = useState(0.35);
  const [mix, setMix] = useState(0.0);
  const [filter, setFilter] = useState(3500);
  const [tape, setTape] = useState(false);

  // Re-sync delay time whenever BPM or division changes
  useEffect(() => {
    setDelayTime(divisionSeconds(division, bpm));
  }, [division, bpm]);

  function handleDivision(div: string) {
    setDivision(div);
    setDelayTime(divisionSeconds(div, bpm));
  }

  return (
    <div className="rings-controls">
      <div className="section-divider" />

      <div className="knob-row">
        <label>Delay</label>
        <div className="reverb-type-btns">
          {DIVISIONS.map(d => (
            <button
              key={d.id}
              className={`reverb-type-btn${division === d.id ? ' active' : ''}`}
              onClick={() => handleDivision(d.id)}
            >
              {d.label}
            </button>
          ))}
          <button
            className={`reverb-type-btn tape-btn${tape ? ' active' : ''}`}
            onClick={() => { const v = !tape; setTape(v); setTapeMode(v); }}
          >
            Tape
          </button>
        </div>
      </div>

      <div className="knob-row">
        <label>Mix</label>
        <input type="range" min={0} max={0.8} step={0.01} value={mix}
          onChange={e => { const v = parseFloat(e.target.value); setMix(v); setDelayMix(v); }} />
      </div>

      <div className="knob-row">
        <label>Feedback</label>
        <input type="range" min={0} max={0.92} step={0.01} value={feedback}
          onChange={e => { const v = parseFloat(e.target.value); setFeedback(v); setDelayFeedback(v); }} />
      </div>

      <div className="knob-row">
        <label>Filter</label>
        <input type="range" min={500} max={12000} step={100} value={filter}
          onChange={e => { const v = parseFloat(e.target.value); setFilter(v); setDelayFilter(v); }} />
      </div>
    </div>
  );
}
