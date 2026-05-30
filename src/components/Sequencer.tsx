import type { Step } from '../hooks/useSequencer';

interface Props {
  steps: Step[];
  currentStep: number;
  onToggle: (i: number) => void;
  onNoteChange: (i: number, note: number) => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (midi: number) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

// C major scale across 3 octaves (C3 → C6)
const SCALE = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];

export function Sequencer({ steps, currentStep, onToggle, onNoteChange }: Props) {
  const cycleNote = (i: number, note: number, direction: 1 | -1) => {
    const idx = SCALE.indexOf(note);
    const next = idx === -1 ? 0 : (idx + direction + SCALE.length) % SCALE.length;
    onNoteChange(i, SCALE[next]);
  };

  return (
    <div className="sequencer">
      {steps.map((step, i) => (
        <div key={i} className={`step-cell${i === currentStep ? ' current' : ''}`}>
          <button
            className={`step-btn${step.active ? ' active' : ''}`}
            onClick={() => onToggle(i)}
            title={`Step ${i + 1} — ${noteName(step.note)}`}
          />
          <div className="note-ctrl">
            <button className="note-arrow" onClick={() => cycleNote(i, step.note, 1)}>▲</button>
            <span className="note-label">{noteName(step.note)}</span>
            <button className="note-arrow" onClick={() => cycleNote(i, step.note, -1)}>▼</button>
          </div>
        </div>
      ))}
    </div>
  );
}
