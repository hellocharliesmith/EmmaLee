import { useState, useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { triggerNote } from '../audio/engine';

export type ScaleType = 'major' | 'melodic-minor' | 'chromatic';

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

export const STEP_COUNT = 32;
export const VISIBLE_ROWS = 8;

export function useSequencer() {
  const [steps, setSteps] = useState<Array<number | null>>(Array(STEP_COUNT).fill(null));
  const [scale, setScaleState] = useState<ScaleType>('major');
  const [rootNote, setRootNoteState] = useState(0); // C
  const [scrollRow, setScrollRow] = useState(0);
  const [bpm, setBpm] = useState(72);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const sequenceRef = useRef<Tone.Sequence | null>(null);
  const stepsRef = useRef(steps);
  useEffect(() => { stepsRef.current = steps; }, [steps]);

  // Derived note list — highest at index 0 (for top-to-bottom display)
  const allNotes = buildNotes(rootNote, scale);
  const reversed = [...allNotes].reverse();
  const maxScroll = Math.max(0, reversed.length - VISIBLE_ROWS);
  const scroll = Math.min(scrollRow, maxScroll);
  const visibleNotes = reversed.slice(scroll, scroll + VISIBLE_ROWS);

  const setStep = useCallback((step: number, midi: number | null) => {
    setSteps(prev => { const n = [...prev]; n[step] = midi; return n; });
  }, []);

  const setScale = useCallback((s: ScaleType) => {
    setScaleState(s);
    setSteps(Array(STEP_COUNT).fill(null));
    setScrollRow(0);
  }, []);

  const setRootNote = useCallback((r: number) => {
    setRootNoteState(r);
    setSteps(Array(STEP_COUNT).fill(null));
    setScrollRow(0);
  }, []);

  const scrollUp = useCallback(() => setScrollRow(p => Math.max(0, p - 1)), []);
  const scrollDown = useCallback(() => {
    setScrollRow(p => {
      const max = Math.max(0, buildNotes(rootNote, scale).length - VISIBLE_ROWS);
      return Math.min(max, p + 1);
    });
  }, [rootNote, scale]);

  const start = useCallback(() => {
    Tone.getTransport().bpm.value = bpm;
    sequenceRef.current = new Tone.Sequence(
      (time, stepIdx) => {
        const midi = stepsRef.current[stepIdx as number];
        Tone.getDraw().schedule(() => {
          setCurrentStep(stepIdx as number);
          if (midi !== null) triggerNote(midi);
        }, time);
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
    setStep, setScale, setRootNote, scrollUp, scrollDown,
    start, stop, updateBpm,
  };
}
