import { Slider } from './Slider';
import { Dropdown } from './Dropdown';
import type { GenerativeVoiceState, GateModel } from '../hooks/useSequencer';

const GATE_MODELS: { id: GateModel; label: string; description: string }[] = [
  { id: 'bernoulli',    label: 'Steady',   description: 'Independent coin-flip per tick — Density is the only thing that matters here' },
  { id: 'three-states', label: 'Wandering', description: 'Drifts between silent/sparse/dense modes — Complexity controls how often the mode itself changes' },
  { id: 'drums',        label: 'Groove',   description: 'Picks from a small set of canned 8-step rhythmic shapes — Complexity selects which one' },
  { id: 'markov',       label: 'Evolving', description: 'Correlates with its own recent history — Complexity controls how "sticky"/bursty it gets' },
];

// Semitone offsets 0-11 from the current root, labeled as interval
// abbreviations (not absolute note names) since the note set is stored and
// displayed relative to root — see audio/generative.ts's noteSet field.
const INTERVAL_LABELS = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];

const OCTAVE_OPTIONS = Array.from({ length: 9 }, (_, i) => ({ value: String(i), label: String(i) }));

export interface GenerativeControlsProps {
  config: GenerativeVoiceState;
  onChange: (updates: Partial<GenerativeVoiceState>) => void;
}

export function GenerativeControls({ config, onChange }: GenerativeControlsProps) {
  function toggleOffset(offset: number) {
    const has = config.noteSet.includes(offset);
    if (has) {
      if (config.noteSet.length === 1) return; // keep at least 1 note selected
      onChange({ noteSet: config.noteSet.filter(o => o !== offset) });
    } else {
      onChange({ noteSet: [...config.noteSet, offset].sort((a, b) => a - b) });
    }
  }

  return (
    <div className="rings-controls generative-controls">
      <div className="knob-row">
        <label title="Which rhythmic algorithm generates the gate/trigger stream — fully independent of the note stream below">Model</label>
        <Dropdown value={config.gateModel}
          options={GATE_MODELS.map(m => ({ value: m.id, label: m.label }))}
          onChange={v => onChange({ gateModel: v as GateModel })}
        />
      </div>
      <div className="knob-row">
        <label title="How often a trigger fires — the base probability/threshold for the selected Model">Density</label>
        <Slider value={config.density} min={0} max={1} onChange={v => onChange({ density: v })} />
      </div>
      <div className="knob-row">
        <label title={GATE_MODELS.find(m => m.id === config.gateModel)?.description}>Complexity</label>
        <Slider value={config.complexity} min={0} max={1} onChange={v => onChange({ complexity: v })} />
      </div>

      <div className="section-divider" />
      <div className="panel-name">Notes (Turing Machine)</div>
      <div className="knob-row">
        <label title="0 = perfectly repeats the same 8-step loop forever. 1 = fully random every step, no repetition. In between = mostly repeats with occasional mutation">Mutation</label>
        <Slider value={config.mutationProb} min={0} max={1} onChange={v => onChange({ mutationProb: v })} />
      </div>
      <div className="knob-row">
        <label title="Which scale degrees (relative to the current root/Key) the generator is allowed to play — pick 1 to 12">Note Set</label>
        <div className="gen-note-picker">
          {INTERVAL_LABELS.map((lbl, offset) => (
            <button
              key={offset}
              className={`pr-prob-btn${config.noteSet.includes(offset) ? ' active' : ''}`}
              onClick={() => toggleOffset(offset)}
              title={`${lbl} — semitone offset ${offset} from root`}
            >{lbl}</button>
          ))}
        </div>
      </div>
      <div className="knob-row">
        <label title="Which octave(s) the selected notes are allowed to play in — independent of which notes are selected above">Octaves</label>
        <div className="gen-octave-range">
          <Dropdown value={String(config.octaveMin)}
            options={OCTAVE_OPTIONS}
            onChange={v => onChange({ octaveMin: Math.min(Number(v), config.octaveMax) })}
          />
          <span className="gen-octave-sep">–</span>
          <Dropdown value={String(config.octaveMax)}
            options={OCTAVE_OPTIONS}
            onChange={v => onChange({ octaveMax: Math.max(Number(v), config.octaveMin) })}
          />
        </div>
      </div>

      <div className="section-divider" />
      <div className="knob-row">
        <label title="0 = short/percussive hits. 1 = long, swelling, sustained notes (a drone). Drives the same Gate(ms)/Attack+Sustain controls in the panel below — those are disabled while Generative mode is on">Gate Bias</label>
        <Slider value={config.gateBias} min={0} max={1} onChange={v => onChange({ gateBias: v })} />
      </div>
    </div>
  );
}
