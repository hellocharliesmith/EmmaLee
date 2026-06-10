import { useCallback } from 'react';
import { noteName, STEP_COUNT,
         type StepValue } from '../hooks/useSequencer';

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

function PianoKey({ midi, rootNote }: { midi: number; rootNote: number }) {
  const pitch   = midi % 12;
  const isBlack = BLACK_KEYS.has(pitch);
  const isRoot  = pitch === rootNote;
  return (
    <div className={['pk', isBlack ? 'pk--black' : 'pk--white', isRoot ? 'pk--root' : ''].filter(Boolean).join(' ')} />
  );
}

// Muted bedtime palette — low-saturation, distinct hues
const KIDS_COLORS = [
  '#7a5568',  // dusty rose
  '#3d6b5e',  // sage teal
  '#445878',  // slate blue
  '#6e5535',  // warm amber
  '#5c4a78',  // muted purple
  '#2f6068',  // midnight teal
  '#685e35',  // dusty gold
  '#5e3558',  // deep mauve
];

interface Props {
  steps: StepValue[];
  visibleNotes: number[];
  rootNote: number;
  scroll: number;
  maxScroll: number;
  currentStep: number;
  kidsMode?: boolean;
  onToggleNote: (col: number, midi: number) => void;
  onToggleStrumDir: (col: number) => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
}

export function PianoRoll({
  steps, visibleNotes, rootNote, scroll, maxScroll,
  currentStep, kidsMode, onToggleNote, onToggleStrumDir, onScrollUp, onScrollDown,
}: Props) {

  const handleCell = useCallback((col: number, midi: number) => {
    onToggleNote(col, midi);
  }, [onToggleNote]);

  const rows  = visibleNotes.length;
  const ROW_H = kidsMode ? 56 : 30;
  const GAP   = kidsMode ? 6  : 2;
  const gridH = rows * ROW_H + (rows - 1) * GAP;

  return (
    <div className={`piano-roll-wrap${kidsMode ? ' kids-piano-roll' : ''}`}>

      {/* Scroll up */}
      <div className="pr-scroll-row">
        <button className={`pr-scroll-btn${kidsMode ? ' kids-scroll-btn' : ''}`}
          onClick={onScrollUp} disabled={scroll === 0}>▲</button>
      </div>

      {/* Piano keys | labels | grid */}
      <div className="pr-row">

        {!kidsMode && (
          <div className="pr-piano-col" style={{ height: gridH }}>
            {visibleNotes.map((midi, i) => (
              <PianoKey key={i} midi={midi} rootNote={rootNote} />
            ))}
          </div>
        )}

        {!kidsMode && (
          <div className="pr-labels-list" style={{ height: gridH }}>
            {visibleNotes.map((midi, row) => (
              <div key={row} className={`pr-label${midi % 12 === rootNote ? ' root' : ''}`}>
                {noteName(midi)}
              </div>
            ))}
          </div>
        )}

        <div className="pr-grid-col">
          <div
            className="pr-grid"
            style={kidsMode ? {
              gridTemplateColumns: `repeat(${STEP_COUNT}, minmax(0, 1fr))`,
            } : {
              gridTemplateColumns: `repeat(${STEP_COUNT}, 26px)`,
              gridTemplateRows: `repeat(${rows}, ${ROW_H}px)`,
            }}
          >
            {Array.from({ length: rows }, (_, row) =>
              Array.from({ length: STEP_COUNT }, (_, col) => {
                const midi      = visibleNotes[row];
                const step      = steps[col];
                const isActive  = !!step?.notes.includes(midi);
                const noteCount = step?.notes.length ?? 0;
                const noteIdx   = isActive ? step!.notes.indexOf(midi) : -1;
                const isFirst   = noteIdx === 0;
                const isLast    = noteIdx === noteCount - 1;
                const playing   = col === currentStep;
                const barStart  = col % 8 === 0;
                const beatStart = col % 4 === 0 && !barStart;
                const oddGroup  = Math.floor(col / 4) % 2 === 1;
                const isMulti   = noteCount > 1;
                const rowColor  = kidsMode ? KIDS_COLORS[row % KIDS_COLORS.length] : undefined;
                const cellStyle = kidsMode ? {
                  background: (isActive || isFirst)
                    ? rowColor
                    : playing ? `${rowColor}28` : undefined,
                  boxShadow: (isActive || isFirst)
                    ? `0 0 16px ${rowColor}aa` : undefined,
                } : undefined;
                return (
                  <div
                    key={`${row}-${col}`}
                    className={[
                      'pr-cell',
                      kidsMode  ? 'kids-cell'  : '',
                      isActive  ? 'active'     : '',
                      isMulti && isActive && isFirst ? 'strum-first' : '',
                      isMulti && isActive && isLast  ? 'strum-last'  : '',
                      playing   ? 'playhead'   : '',
                      barStart  ? 'bar-start'  : '',
                      beatStart ? 'beat-start' : '',
                      oddGroup  ? 'group-odd'  : '',
                    ].filter(Boolean).join(' ')}
                    style={cellStyle}
                    onClick={() => handleCell(col, midi)}
                  />
                );
              })
            )}
          </div>

          {/* Step numbers */}
          <div className="pr-step-nums">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <div key={i} className={`pr-step-num${i % 8 === 0 ? ' bar' : ''}`}>
                {i % 8 === 0 ? i / 8 + 1 : ''}
              </div>
            ))}
          </div>

          {/* Strum direction row */}
          <div className="pr-strum-row">
            {Array.from({ length: STEP_COUNT }, (_, i) => {
              const step = steps[i];
              const multi = step && step.notes.length > 1;
              return (
                <div key={i} className="pr-strum-cell">
                  {multi && (
                    <button
                      className={`pr-strum-btn${step.strumDown ? ' down' : ''}`}
                      onClick={() => onToggleStrumDir(i)}
                      title={step.strumDown ? 'Strum down — click to flip' : 'Strum up — click to flip'}
                    >
                      {step.strumDown ? '↓' : '↑'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Scroll down */}
      <div className="pr-scroll-row">
        <button className={`pr-scroll-btn${kidsMode ? ' kids-scroll-btn' : ''}`}
          onClick={onScrollDown} disabled={scroll >= maxScroll}>▼</button>
      </div>

    </div>
  );
}
