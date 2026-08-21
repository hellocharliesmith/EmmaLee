import { useCallback } from 'react';
import { noteName, STEP_COUNT, PROB_OPTIONS, VELOCITY_OPTIONS, GATE_OPTIONS, DEFAULT_GATE_STEPS,
         type StepValue } from '../hooks/useSequencer';

const PROB_LABELS: Record<number, string> = {
  1: '', 0.75: '75', 0.66: '66', 0.5: '50', 0.33: '33', 0.25: '25',
};
const VELOCITY_LABELS: Record<number, string> = {
  1: '', 0.75: '75', 0.5: '50', 0.25: '25',
};
const WANDER_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

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
  lastStep?: number;
  onSetLastStep?: (step: number) => void; // sets the one global lastStep for this track
  kidsMode?: boolean;
  rowLabels?: string[];
  noStrum?: boolean;
  showVelocity?: boolean;
  onToggleNote: (col: number, midi: number) => void;
  onToggleStrumDir: (col: number) => void;
  onSetProbability: (col: number, prob: number) => void;
  onSetVelocity?: (col: number, velocity: number) => void;
  onSetWander?: (col: number, wander: number) => void;
  onToggleTie?: (col: number) => void;
  onSetGate?: (col: number, gateSteps: number) => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
}

export function PianoRoll({
  steps, visibleNotes, rootNote, scroll, maxScroll,
  currentStep, lastStep, onSetLastStep,
  kidsMode, rowLabels, noStrum, showVelocity,
  onToggleNote, onToggleStrumDir, onSetProbability, onSetVelocity, onSetWander, onToggleTie, onSetGate,
  onScrollUp, onScrollDown,
}: Props) {
  const effectiveLastStep = lastStep ?? STEP_COUNT - 1;

  const handleCell = useCallback((col: number, midi: number) => {
    onToggleNote(col, midi);
  }, [onToggleNote]);

  const rows  = visibleNotes.length;
  const ROW_H = kidsMode ? 56 : 30;
  const GAP   = kidsMode ? 6  : 2;
  const gridH = rows * ROW_H + (rows - 1) * GAP;

  // Width of the left-side label area in meta rows — must match the left offset of
  // pr-grid-col inside pr-row. Normal: piano(22)+gap(4)+labels(36)+gap(4)=66.
  // Drums: no piano col → labels(36)+gap(4)=40.
  const metaLblWidth = rowLabels ? 40 : 66;

  return (
    <div className={`piano-roll-wrap${kidsMode ? ' kids-piano-roll' : ''}`}>

      {/* Scroll up — narrow, aligned with piano+label area only */}
      {!rowLabels && (
        <div className="pr-scroll-row">
          <button className={`pr-scroll-btn${kidsMode ? ' kids-scroll-btn' : ''}`}
            onClick={onScrollUp} disabled={scroll === 0}>▲</button>
        </div>
      )}

      {/* Scrollable content — all rows share one horizontal scroll */}
      <div className="piano-roll-scroll">

        {/* Last-step indicator row */}
        {!kidsMode && onSetLastStep && (
          <div className="pr-meta-row pr-last-step-row">
            <div className="pr-meta-lbl" style={{ width: metaLblWidth }}>End</div>
            <div className="pr-last-step-track">
              {Array.from({ length: STEP_COUNT }, (_, i) => {
                const isLast   = i === effectiveLastStep;
                const isBeyond = i > effectiveLastStep;
                return (
                  <div
                    key={i}
                    className={['pr-last-step-cell', isLast ? 'is-last' : '', isBeyond ? 'beyond' : ''].filter(Boolean).join(' ')}
                    onClick={() => onSetLastStep(i)}
                    title={`Set last step to ${i + 1}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Piano keys | labels | grid */}
        <div className="pr-row">

          {!kidsMode && !rowLabels && (
            <div className="pr-piano-col" style={{ height: gridH }}>
              {visibleNotes.map((midi, i) => (
                <PianoKey key={i} midi={midi} rootNote={rootNote} />
              ))}
            </div>
          )}

          {!kidsMode && (
            <div className="pr-labels-list" style={{ height: gridH }}>
              {visibleNotes.map((midi, row) => (
                <div key={row} className={`pr-label${!rowLabels && midi % 12 === rootNote ? ' root' : ''}`}>
                  {rowLabels ? rowLabels[row] : noteName(midi)}
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
                  const stepProb  = step?.prob ?? 1;
                  const probReduced = isActive && stepProb < 1;
                  const rowColor  = kidsMode ? KIDS_COLORS[row % KIDS_COLORS.length] : undefined;
                  const cellStyle = kidsMode ? {
                    background: (isActive || isFirst)
                      ? rowColor
                      : playing ? `${rowColor}28` : undefined,
                    boxShadow: (isActive || isFirst)
                      ? `0 0 16px ${rowColor}aa` : undefined,
                    opacity: probReduced ? 0.55 : undefined,
                  } : undefined;
                  const beyondEnd = col > effectiveLastStep;
                  return (
                    <div
                      key={`${row}-${col}`}
                      className={[
                        'pr-cell',
                        kidsMode    ? 'kids-cell'    : '',
                        isActive    ? 'active'       : '',
                        probReduced ? 'prob-reduced' : '',
                        isMulti && isActive && isFirst ? 'strum-first' : '',
                        isMulti && isActive && isLast  ? 'strum-last'  : '',
                        playing    ? 'playhead'    : '',
                        beyondEnd  ? 'beyond-end'  : '',
                        barStart   ? 'bar-start'   : '',
                        beatStart  ? 'beat-start'  : '',
                        oddGroup   ? 'group-odd'   : '',
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
          </div>

        </div>{/* end pr-row */}

        {/* Scroll down — sits right below the grid instead of after the extra
            parameter rows. Sticky-pinned to the scroll viewport's left edge so
            it stays put during horizontal scroll (mobile), matching how it
            behaved as a sibling outside piano-roll-scroll before this moved. */}
        {!rowLabels && (
          <div className="pr-scroll-row pr-scroll-row--bottom">
            <button className={`pr-scroll-btn${kidsMode ? ' kids-scroll-btn' : ''}`}
              onClick={onScrollDown} disabled={scroll >= maxScroll}>▼</button>
          </div>
        )}

        {/* Strum direction row with label */}
        {!kidsMode && !noStrum && (
          <div className="pr-meta-row">
            <div className="pr-meta-lbl" style={{ width: metaLblWidth }}>Strum</div>
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
        )}

        {/* Probability row with label */}
        {!kidsMode && (
          <div className="pr-meta-row">
            <div className="pr-meta-lbl" style={{ width: metaLblWidth }}>Prob</div>
            <div className="pr-prob-row">
              {Array.from({ length: STEP_COUNT }, (_, i) => {
                const step = steps[i];
                if (!step) return <div key={i} className="pr-prob-cell" />;
                const prob  = step.prob ?? 1;
                const label = PROB_LABELS[prob] ?? String(Math.round(prob * 100));
                const idx   = PROB_OPTIONS.indexOf(prob as typeof PROB_OPTIONS[number]);
                const next  = PROB_OPTIONS[(idx === -1 ? 0 : (idx + 1) % PROB_OPTIONS.length)];
                return (
                  <div key={i} className="pr-prob-cell">
                    <button
                      className={`pr-prob-btn${prob < 1 ? ' active' : ''}`}
                      onClick={() => onSetProbability(i, next)}
                      title={`Probability: ${Math.round(prob * 100)}% — click to change`}
                    >
                      {prob < 1 ? label : '·'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Wander row with label (melodic tracks only — first pass, see AGENTS.md "Note Wander").
            Gated purely on onSetWander (not noStrum) -- noStrum is also true for Juno now
            (real polyphony needs no strum), but Juno still wants Wander. */}
        {!kidsMode && onSetWander && (
          <div className="pr-meta-row">
            <div className="pr-meta-lbl" style={{ width: metaLblWidth }}>Wander</div>
            <div className="pr-wander-row">
              {Array.from({ length: STEP_COUNT }, (_, i) => {
                const step = steps[i];
                if (!step || step.notes.length === 0) return <div key={i} className="pr-wander-cell" />;
                const wander = step.wander ?? 0;
                const idx  = WANDER_OPTIONS.indexOf(wander as typeof WANDER_OPTIONS[number]);
                const next = WANDER_OPTIONS[(idx === -1 ? 0 : (idx + 1) % WANDER_OPTIONS.length)];
                return (
                  <div key={i} className="pr-wander-cell">
                    <button
                      className={`pr-wander-btn${wander > 0 ? ' active' : ''}`}
                      onClick={() => onSetWander(i, next)}
                      title={wander > 0
                        ? `Wander: up to ${wander} scale step${wander > 1 ? 's' : ''} up or down each time — click to change`
                        : 'Wander: off — click to randomize this note within nearby scale steps'}
                    >
                      {wander > 0 ? wander : '·'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tie row with label (Plaits only — extends the held note instead of retriggering) */}
        {!kidsMode && onToggleTie && (
          <div className="pr-meta-row">
            <div className="pr-meta-lbl" style={{ width: metaLblWidth }}>Tie</div>
            <div className="pr-tie-row">
              {Array.from({ length: STEP_COUNT }, (_, i) => {
                const step = steps[i];
                const tied = !!step?.tie;
                return (
                  <div key={i} className="pr-tie-cell">
                    <button
                      className={`pr-tie-btn${tied ? ' active' : ''}`}
                      onClick={() => onToggleTie(i)}
                      title={tied
                        ? 'Tied — holds the previous note through this step instead of retriggering. Click to un-tie'
                        : 'Click to tie — holds the previous note through this step instead of retriggering'}
                    >
                      {tied ? '—' : '·'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Gate row with label (Juno only — real note-off after this many steps, see AGENTS.md "Juno-60 track") */}
        {!kidsMode && onSetGate && (
          <div className="pr-meta-row">
            <div className="pr-meta-lbl" style={{ width: metaLblWidth }}>Gate</div>
            <div className="pr-gate-row">
              {Array.from({ length: STEP_COUNT }, (_, i) => {
                const step = steps[i];
                if (!step || step.notes.length === 0) return <div key={i} className="pr-gate-cell" />;
                const gateSteps = step.gateSteps ?? DEFAULT_GATE_STEPS;
                const idx  = GATE_OPTIONS.indexOf(gateSteps as typeof GATE_OPTIONS[number]);
                const next = GATE_OPTIONS[(idx === -1 ? 0 : (idx + 1) % GATE_OPTIONS.length)];
                return (
                  <div key={i} className="pr-gate-cell">
                    <button
                      className={`pr-gate-btn${gateSteps !== DEFAULT_GATE_STEPS ? ' active' : ''}`}
                      onClick={() => onSetGate(i, next)}
                      title={`Held for ${gateSteps} step${gateSteps > 1 ? 's' : ''} before releasing — click to change`}
                    >
                      {gateSteps}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Velocity row with label (drums only) */}
        {!kidsMode && showVelocity && (
          <div className="pr-meta-row">
            <div className="pr-meta-lbl" style={{ width: metaLblWidth }}>Vel</div>
            <div className="pr-velocity-row">
              {Array.from({ length: STEP_COUNT }, (_, i) => {
                const step = steps[i];
                if (!step) return <div key={i} className="pr-velocity-cell" />;
                const vel   = step.velocity ?? 1;
                const label = VELOCITY_LABELS[vel] ?? String(Math.round(vel * 100));
                const idx   = VELOCITY_OPTIONS.indexOf(vel as typeof VELOCITY_OPTIONS[number]);
                const next  = VELOCITY_OPTIONS[(idx === -1 ? 0 : (idx + 1) % VELOCITY_OPTIONS.length)];
                return (
                  <div key={i} className="pr-velocity-cell">
                    <button
                      className={`pr-velocity-btn${vel < 1 ? ' active' : ''}`}
                      onClick={() => onSetVelocity?.(i, next)}
                      title={`Velocity: ${Math.round(vel * 100)}% — click to change`}
                    >
                      {vel < 1 ? label : '·'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>{/* end piano-roll-scroll */}

    </div>
  );
}
