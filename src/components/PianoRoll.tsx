import { useCallback } from 'react';
import { noteName, STEP_COUNT, VISIBLE_ROWS, type ScaleType } from '../hooks/useSequencer';

const ROOT_LABELS = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const SCALE_OPTIONS: { id: ScaleType; label: string }[] = [
  { id: 'major',         label: 'Major' },
  { id: 'melodic-minor', label: 'Mel. Minor' },
  { id: 'chromatic',     label: 'Chromatic' },
];

interface Props {
  steps: Array<number | null>;
  visibleNotes: number[];
  scale: ScaleType;
  rootNote: number;
  scroll: number;
  maxScroll: number;
  currentStep: number;
  onSetStep: (step: number, midi: number | null) => void;
  onSetScale: (s: ScaleType) => void;
  onSetRootNote: (r: number) => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
}

export function PianoRoll({
  steps, visibleNotes, scale, rootNote, scroll, maxScroll,
  currentStep, onSetStep, onSetScale, onSetRootNote, onScrollUp, onScrollDown,
}: Props) {

  const handleCell = useCallback((col: number, midi: number) => {
    onSetStep(col, steps[col] === midi ? null : midi);
  }, [steps, onSetStep]);

  return (
    <div className="piano-roll-wrap">

      {/* Scale + root controls */}
      <div className="pr-controls">
        <div className="pr-control-group">
          <span className="pr-ctrl-label">Root</span>
          <div className="reverb-type-btns pr-root-btns">
            {ROOT_LABELS.map((n, i) => (
              <button key={i}
                className={`reverb-type-btn${rootNote === i ? ' active' : ''}`}
                onClick={() => onSetRootNote(i)}
              >{n}</button>
            ))}
          </div>
        </div>
        <div className="pr-control-group">
          <span className="pr-ctrl-label">Scale</span>
          <div className="reverb-type-btns">
            {SCALE_OPTIONS.map(s => (
              <button key={s.id}
                className={`reverb-type-btn${scale === s.id ? ' active' : ''}`}
                onClick={() => onSetScale(s.id)}
              >{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Labels + grid in a flex row */}
      <div className="pr-row">

        {/* Note labels column */}
        <div className="pr-labels-col">
          <button className="pr-scroll-btn" onClick={onScrollUp} disabled={scroll === 0}>▲</button>
          {visibleNotes.map((midi, row) => (
            <div key={row} className={`pr-label${midi % 12 === rootNote ? ' root' : ''}`}>
              {noteName(midi)}
            </div>
          ))}
          <button className="pr-scroll-btn" onClick={onScrollDown} disabled={scroll >= maxScroll}>▼</button>
        </div>

        {/* Scrollable grid column */}
        <div className="pr-grid-col">
          <div
            className="pr-grid"
            style={{
              gridTemplateColumns: `repeat(${STEP_COUNT}, 26px)`,
              gridTemplateRows: `repeat(${VISIBLE_ROWS}, 30px)`,
            }}
          >
            {Array.from({ length: VISIBLE_ROWS }, (_, row) =>
              Array.from({ length: STEP_COUNT }, (_, col) => {
                const midi = visibleNotes[row];
                const active = steps[col] === midi;
                const playing = col === currentStep;
                const barStart = col % 8 === 0;
                const beatStart = col % 4 === 0 && !barStart;
                return (
                  <div
                    key={`${row}-${col}`}
                    className={[
                      'pr-cell',
                      active   ? 'active'     : '',
                      playing  ? 'playhead'   : '',
                      barStart ? 'bar-start'  : '',
                      beatStart ? 'beat-start' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleCell(col, midi)}
                  />
                );
              })
            )}
          </div>

          {/* Bar numbers */}
          <div className="pr-step-nums">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <div key={i} className={`pr-step-num${i % 8 === 0 ? ' bar' : ''}`}>
                {i % 8 === 0 ? i / 8 + 1 : ''}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
