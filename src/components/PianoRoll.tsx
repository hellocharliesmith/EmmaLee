import { useCallback } from 'react';
import { noteName, isSubStep, STEP_COUNT, VISIBLE_ROWS,
         type ScaleType, type StepValue, type SubStep } from '../hooks/useSequencer';

const ROOT_LABELS = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const SCALE_OPTIONS: { id: ScaleType; label: string }[] = [
  { id: 'major',         label: 'Major' },
  { id: 'melodic-minor', label: 'Mel. Minor' },
  { id: 'chromatic',     label: 'Chromatic' },
];

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]); // C# D# F# G# A#

function PianoKey({ midi, rootNote }: { midi: number; rootNote: number }) {
  const pitch   = midi % 12;
  const isBlack = BLACK_KEYS.has(pitch);
  const isRoot  = pitch === rootNote;
  return (
    <div className={[
      'pk',
      isBlack ? 'pk--black' : 'pk--white',
      isRoot  ? 'pk--root'  : '',
    ].filter(Boolean).join(' ')} />
  );
}

interface Props {
  steps: StepValue[];
  visibleNotes: number[];
  scale: ScaleType;
  rootNote: number;
  scroll: number;
  maxScroll: number;
  currentStep: number;
  drawerStep: number | null;
  onSetStep: (step: number, value: StepValue) => void;
  onSetScale: (s: ScaleType) => void;
  onSetRootNote: (r: number) => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
  onOpenDrawer: (col: number) => void;
}

export function PianoRoll({
  steps, visibleNotes, scale, rootNote, scroll, maxScroll,
  currentStep, drawerStep, onSetStep, onSetScale, onSetRootNote,
  onScrollUp, onScrollDown, onOpenDrawer,
}: Props) {

  const handleCell = useCallback((col: number, midi: number) => {
    const step = steps[col];
    if (isSubStep(step)) {
      // Sub-step column — open drawer
      onOpenDrawer(col);
      return;
    }
    // Normal toggle
    const next = step === midi ? null : midi;
    onSetStep(col, next);
    if (next !== null) onOpenDrawer(col); // open drawer on activate
  }, [steps, onSetStep, onOpenDrawer]);

  const ROW_H = 30;
  const GAP   = 2;
  const gridH = VISIBLE_ROWS * ROW_H + (VISIBLE_ROWS - 1) * GAP;

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

      {/* Scroll up — sits above the grid, aligned to piano+label width */}
      <div className="pr-scroll-row">
        <button className="pr-scroll-btn" onClick={onScrollUp} disabled={scroll === 0}>▲</button>
      </div>

      {/* Piano keys | labels | grid — all aligned to same row height */}
      <div className="pr-row">

        {/* Piano keys column */}
        <div className="pr-piano-col" style={{ height: gridH }}>
          {visibleNotes.map((midi, i) => (
            <PianoKey key={i} midi={midi} rootNote={rootNote} />
          ))}
        </div>

        {/* Note label column — perfectly aligned, no scroll buttons inside */}
        <div className="pr-labels-list" style={{ height: gridH }}>
          {visibleNotes.map((midi, row) => (
            <div key={row} className={`pr-label${midi % 12 === rootNote ? ' root' : ''}`}>
              {noteName(midi)}
            </div>
          ))}
        </div>

        {/* Scrollable grid */}
        <div className="pr-grid-col">
          <div
            className="pr-grid"
            style={{
              gridTemplateColumns: `repeat(${STEP_COUNT}, 26px)`,
              gridTemplateRows: `repeat(${VISIBLE_ROWS}, ${ROW_H}px)`,
            }}
          >
            {Array.from({ length: VISIBLE_ROWS }, (_, row) =>
              Array.from({ length: STEP_COUNT }, (_, col) => {
                const midi = visibleNotes[row];
                const active    = steps[col] === midi;
                const playing   = col === currentStep;
                const barStart   = col % 8 === 0;
                const beatStart  = col % 4 === 0 && !barStart;
                const oddGroup   = Math.floor(col / 4) % 2 === 1;
                const stepData   = steps[col];
                const hasSub     = isSubStep(stepData);
                const subNotes   = hasSub ? (stepData as SubStep).notes : [];
                const isSubActive = hasSub && subNotes.includes(midi);
                const isDrawerCol = col === drawerStep;
                return (
                  <div
                    key={`${row}-${col}`}
                    className={[
                      'pr-cell',
                      active      ? 'active'      : '',
                      isSubActive ? 'sub-active'  : '',
                      playing     ? 'playhead'    : '',
                      barStart    ? 'bar-start'   : '',
                      beatStart   ? 'beat-start'  : '',
                      oddGroup    ? 'group-odd'   : '',
                      hasSub      ? 'has-substep' : '',
                      isDrawerCol ? 'drawer-col'  : '',
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

      {/* Scroll down */}
      <div className="pr-scroll-row">
        <button className="pr-scroll-btn" onClick={onScrollDown} disabled={scroll >= maxScroll}>▼</button>
      </div>

    </div>
  );
}
