import { noteName, isSubStep, type StepValue, type SubStep } from '../hooks/useSequencer';

interface Props {
  stepIndex: number;
  step: StepValue;
  allNotes: number[];
  onClose: () => void;
  onUpdate: (value: StepValue) => void;
}

const DIVS: { n: 1 | 2 | 3 | 4; label: string; desc: string }[] = [
  { n: 1, label: 'Single', desc: 'One note' },
  { n: 2, label: '×2',     desc: '2 eighth notes' },
  { n: 3, label: '×3',     desc: '3 triplets' },
  { n: 4, label: '×4',     desc: '4 sixteenth notes' },
];

function cycleNote(note: number | null, dir: 1 | -1, allNotes: number[]): number | null {
  if (!allNotes.length) return null;
  if (note === null) return allNotes[dir === 1 ? 0 : allNotes.length - 1];
  const idx = allNotes.indexOf(note);
  if (idx < 0) return allNotes[0];
  return allNotes[(idx + dir + allNotes.length) % allNotes.length] ?? null;
}

function buildSubStep(currentStep: StepValue, newDiv: 1 | 2 | 3 | 4, allNotes: number[]): StepValue {
  if (newDiv === 1) {
    // Collapse to single note
    if (isSubStep(currentStep)) return currentStep.notes[0] ?? null;
    return currentStep as number | null;
  }

  // Get existing notes to preserve edits
  const existing: Array<number | null> = isSubStep(currentStep)
    ? [...(currentStep as SubStep).notes]
    : [typeof currentStep === 'number' ? currentStep : (allNotes[0] ?? null)];

  const notes: Array<number | null> = [];
  for (let i = 0; i < newDiv; i++) {
    if (i < existing.length) {
      notes.push(existing[i]);
    } else {
      // Auto-fill: step up the scale from the first note
      const base = notes[0] ?? allNotes[0] ?? null;
      const baseIdx = base !== null ? allNotes.indexOf(base) : 0;
      notes.push(allNotes[(baseIdx + i) % allNotes.length] ?? null);
    }
  }

  return { div: newDiv, notes } as SubStep;
}

export function SubStepDrawer({ stepIndex, step, allNotes, onClose, onUpdate }: Props) {
  const currentDiv: 1 | 2 | 3 | 4 = isSubStep(step) ? (step as SubStep).div : 1;
  const notes: Array<number | null> = isSubStep(step)
    ? (step as SubStep).notes
    : [typeof step === 'number' ? step : null];

  function handleDivChange(n: 1 | 2 | 3 | 4) {
    onUpdate(buildSubStep(step, n, allNotes));
  }

  function handleNoteChange(subIdx: number, dir: 1 | -1) {
    const current = notes[subIdx] ?? null;
    const next = cycleNote(current, dir, allNotes);
    if (currentDiv === 1) {
      onUpdate(next);
    } else {
      const newNotes = [...notes];
      newNotes[subIdx] = next;
      onUpdate({ div: currentDiv, notes: newNotes } as SubStep);
    }
  }

  function handleClear() {
    onUpdate(null);
    onClose();
  }

  return (
    <div className="substep-drawer">
      <div className="substep-header">
        <span className="substep-title">Step {stepIndex + 1}</span>
        <div className="substep-divs">
          {DIVS.map(d => (
            <button
              key={d.n}
              className={`reverb-type-btn${currentDiv === d.n ? ' active' : ''}`}
              onClick={() => handleDivChange(d.n)}
              title={d.desc}
            >{d.label}</button>
          ))}
        </div>
        <div className="substep-header-actions">
          <button className="substep-clear" onClick={handleClear} title="Remove this step">
            Clear
          </button>
          <button className="substep-close" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="substep-notes">
        {notes.map((note, i) => (
          <div key={i} className="substep-note-col">
            <div className="substep-label">
              {currentDiv > 1 ? `${i + 1}` : ''}
            </div>
            <button className="substep-arrow" onClick={() => handleNoteChange(i, 1)}>▲</button>
            <div className="substep-note-name">
              {note !== null ? noteName(note) : '—'}
            </div>
            <button className="substep-arrow" onClick={() => handleNoteChange(i, -1)}>▼</button>
          </div>
        ))}
      </div>
    </div>
  );
}
