import { Knob } from './Knob';

// UI for the Grids drum-pattern generator (src/audio/grids.ts — a hand-ported
// ~490-line TS port of Mutable Instruments Grids' pattern_generator.cc). Lives
// on the Drums tab, below the per-voice Tone/Decay knobs. "Generate" fills the
// current page's 32 steps for all 3 drum voices at once by evaluating Grids'
// drum output mode across an X/Y pad position + per-voice density.
//
// All values here are 0-1 (UI-friendly, like every other knob in the app) —
// App.tsx scales them to Grids' native 0-255 byte range right before calling
// generateGridsPattern().

export interface GridsUiState {
  x: number;          // 0-1
  y: number;          // 0-1
  densityHH: number;  // 0-1
  densitySD: number;  // 0-1
  densityBD: number;  // 0-1
  randomness: number; // 0-1
}

export interface GridsControlsProps {
  state: GridsUiState;
  onChange: (next: Partial<GridsUiState>) => void;
  onGenerate: () => void;
}

export function GridsControls({ state, onChange, onGenerate }: GridsControlsProps) {
  return (
    <div className="rings-controls grids-controls">
      <div className="knob-row">
        <label>Pattern Generator</label>
      </div>
      <div className="xy-pad-row">
        <div className="xy-pad-field">
          <span className="xy-pad-label">X</span>
          <input type="range" min={0} max={1} step={0.01} value={state.x}
            onChange={e => onChange({ x: parseFloat(e.target.value) })} />
        </div>
        <div className="xy-pad-field">
          <span className="xy-pad-label">Y</span>
          <input type="range" min={0} max={1} step={0.01} value={state.y}
            onChange={e => onChange({ y: parseFloat(e.target.value) })} />
        </div>
      </div>
      <div className="knob-row">
        <label>Density</label>
        <Knob value={state.densityHH} min={0} max={1} label="Hi-Hat"
          onChange={v => onChange({ densityHH: v })} />
        <Knob value={state.densitySD} min={0} max={1} label="Snare"
          onChange={v => onChange({ densitySD: v })} />
        <Knob value={state.densityBD} min={0} max={1} label="Kick"
          onChange={v => onChange({ densityBD: v })} />
        <Knob value={state.randomness} min={0} max={1} label="Random"
          onChange={v => onChange({ randomness: v })} />
      </div>
      <button className="grids-generate-btn" onClick={onGenerate}>
        Generate Pattern
      </button>
    </div>
  );
}
