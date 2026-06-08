import { useState, useRef, useCallback } from 'react';
import * as Tone from 'tone';
import { triggerNote } from '../audio/engine';

export type ScaleType = 'major' | 'melodic-minor' | 'chromatic';

// ── Step data ─────────────────────────────────────────────────────────────
export interface StepData {
  notes: number[];        // 1–4 sorted (ascending) MIDI notes
  strumDown: boolean;     // false = low→high (up), true = high→low (down)
}

export type StepValue = StepData | null;

export const MAX_NOTES_PER_STEP = 4;

// ── Scale / note helpers ──────────────────────────────────────────────────
const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  'major':         [0, 2, 4, 5, 7, 9, 11],
  'melodic-minor': [0, 2, 3, 5, 7, 9, 11],
  'chromatic':     [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const NOTE_NAMES = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];

export function noteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function buildNotes(root: number, scale: ScaleType): number[] {
  const intervals = SCALE_INTERVALS[scale];
  const notes: number[] = [];
  for (let oct = 3; oct <= 5; oct++) {
    for (const iv of intervals) {
      const midi = 12 * (oct + 1) + root + iv;
      if (midi >= 0 && midi <= 127) notes.push(midi);
    }
  }
  return notes;
}

export const STEP_COUNT    = 32;
export const VISIBLE_ROWS  = 12;

function note(midi: number): StepData {
  return { notes: [midi], strumDown: false };
}

function makeDefaultSteps(): StepValue[] {
  const s: StepValue[] = Array(STEP_COUNT).fill(null);
  s[0]  = note(64); // E4
  s[8]  = note(71); // B4
  s[14] = note(69); // A4
  s[23] = note(81); // A5
  s[24] = note(79); // G5
  return s;
}

export function useSequencer() {
  const [steps, setSteps]         = useState<StepValue[]>(makeDefaultSteps);
  const [scale, setScaleState]    = useState<ScaleType>('major');
  const [rootNote, setRootNoteState] = useState(0);
  const [scrollRow, setScrollRow] = useState(0);   // 12 rows: start at top
  const [bpm, setBpm]             = useState(72);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const sequenceRef = useRef<Tone.Sequence | null>(null);

  const stepsRef = useRef(steps);
  // keep ref in sync synchronously to avoid closure issues
  const updateSteps = (fn: (prev: StepValue[]) => StepValue[]) => {
    setSteps(prev => {
      const next = fn(prev);
      stepsRef.current = next;
      return next;
    });
  };

  const allNotes     = buildNotes(rootNote, scale);
  const reversed     = [...allNotes].reverse();
  const maxScroll    = Math.max(0, reversed.length - VISIBLE_ROWS);
  const scroll       = Math.min(scrollRow, maxScroll);
  const visibleNotes = reversed.slice(scroll, scroll + VISIBLE_ROWS);

  // Toggle a note in a step (multi-select, max 4)
  const toggleNote = useCallback((col: number, midi: number) => {
    updateSteps(prev => {
      const step = prev[col];
      const currentNotes = step?.notes ?? [];
      let newNotes: number[];

      if (currentNotes.includes(midi)) {
        newNotes = currentNotes.filter(n => n !== midi);
      } else {
        if (currentNotes.length >= MAX_NOTES_PER_STEP) return prev; // at limit
        newNotes = [...currentNotes, midi].sort((a, b) => a - b);
      }

      const next = [...prev];
      next[col] = newNotes.length === 0
        ? null
        : { notes: newNotes, strumDown: step?.strumDown ?? false };
      return next;
    });
  }, []);

  const toggleStrumDir = useCallback((col: number) => {
    updateSteps(prev => {
      const step = prev[col];
      if (!step) return prev;
      const next = [...prev];
      next[col] = { ...step, strumDown: !step.strumDown };
      return next;
    });
  }, []);

  const loadSteps = useCallback((newSteps: StepValue[]) => {
    setSteps(newSteps);
    stepsRef.current = newSteps;
  }, []);

  const setScale = useCallback((s: ScaleType) => {
    setScaleState(s);
    const cleared = Array(STEP_COUNT).fill(null) as StepValue[];
    setSteps(cleared); stepsRef.current = cleared;
    setScrollRow(0);
  }, []);

  const setRootNote = useCallback((r: number) => {
    setRootNoteState(r);
    const cleared = Array(STEP_COUNT).fill(null) as StepValue[];
    setSteps(cleared); stepsRef.current = cleared;
    setScrollRow(0);
  }, []);

  const scrollUp   = useCallback(() => setScrollRow(p => Math.max(0, p - 1)), []);
  const scrollDown = useCallback(() => {
    setScrollRow(p => {
      const max = Math.max(0, buildNotes(rootNote, scale).length - VISIBLE_ROWS);
      return Math.min(max, p + 1);
    });
  }, [rootNote, scale]);

  const setScrollRowDirect = useCallback((r: number) => setScrollRow(r), []);

  const start = useCallback(() => {
    Tone.getTransport().bpm.value = bpm;

    sequenceRef.current = new Tone.Sequence(
      (time, stepIdx) => {
        const step = stepsRef.current[stepIdx as number];

        Tone.getDraw().schedule(() => setCurrentStep(stepIdx as number), time);

        if (!step) return;

        const ordered = step.strumDown
          ? [...step.notes].reverse()
          : [...step.notes];

        if (ordered.length === 1) {
          Tone.getDraw().schedule(() => triggerNote(ordered[0]), time);
        } else {
          const stepSecs = Tone.Time('16n').toSeconds();
          ordered.forEach((note, i) => {
            const offset = (i / ordered.length) * stepSecs;
            Tone.getDraw().schedule(() => triggerNote(note), time + offset);
          });
        }
      },
      Array.from({ length: STEP_COUNT }, (_, i) => i),
      '16n'
    );

    sequenceRef.current.start(0);
    Tone.getTransport().start();
    setIsPlaying(true);
  }, [bpm]);

  const stop = useCallback(() => {
    Tone.getTransport().stop();
    sequenceRef.current?.dispose();
    sequenceRef.current = null;
    setCurrentStep(-1);
    setIsPlaying(false);
  }, []);

  const updateBpm = useCallback((value: number) => {
    setBpm(value);
    Tone.getTransport().bpm.value = value;
  }, []);

  return {
    steps, visibleNotes, allNotes, scale, rootNote,
    scroll, maxScroll, bpm, isPlaying, currentStep,
    toggleNote, toggleStrumDir, loadSteps,
    setScale, setRootNote, scrollUp, scrollDown, setScrollRowDirect,
    start, stop, updateBpm,
  };
}
