import { useState, useRef, useCallback, useMemo } from 'react';
import * as Tone from 'tone';
import { triggerNote } from '../audio/engine';

export type ScaleType = 'major' | 'melodic-minor' | 'chromatic';

export interface StepData {
  notes: number[];
  strumDown: boolean;
}
export type StepValue = StepData | null;
export const MAX_NOTES_PER_STEP = 4;
export const STEP_COUNT   = 32;
export const VISIBLE_ROWS = 12;
export const NUM_PAGES    = 4;

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
  for (let oct = 3; oct <= 6; oct++) {   // ← now 4 octaves: C3–B6
    for (const iv of intervals) {
      const midi = 12 * (oct + 1) + root + iv;
      if (midi >= 0 && midi <= 127) notes.push(midi);
    }
  }
  return notes;
}

function note(midi: number): StepData { return { notes: [midi], strumDown: false }; }

function makeDefaultSteps(): StepValue[] {
  const s: StepValue[] = Array(STEP_COUNT).fill(null);
  s[0]  = note(64); // E4
  s[8]  = note(71); // B4
  s[14] = note(69); // A4
  s[23] = note(81); // A5
  s[24] = note(79); // G5
  return s;
}

function makeEmptyPage(): StepValue[] { return Array(STEP_COUNT).fill(null); }

export function useSequencer() {
  // ── Per-page step data ────────────────────────────────────────────────
  const [pageSteps, setPageSteps] = useState<StepValue[][]>(() => [
    makeDefaultSteps(),
    makeEmptyPage(),
    makeEmptyPage(),
    makeEmptyPage(),
  ]);
  const [enabledPages, setEnabledPages] = useState<boolean[]>([true, false, false, false]);
  const [viewPage, setViewPage] = useState(0);

  // ── Playback state ─────────────────────────────────────────────────────
  const [scale, setScaleState]       = useState<ScaleType>('major');
  const [rootNote, setRootNoteState] = useState(0);
  const [scrollRow, setScrollRow]    = useState(7); // B5–E4 default view
  const [bpm, setBpm]                = useState(72);
  const [isPlaying, setIsPlaying]    = useState(false);
  const [currentStep, setCurrentStep]  = useState(-1);
  const [playingPage, setPlayingPage]  = useState(-1); // absolute page 0–3 during playback

  const sequenceRef    = useRef<Tone.Sequence | null>(null);
  const pageStepsRef   = useRef(pageSteps);
  const enabledRef     = useRef(enabledPages);

  // Keep refs in sync
  const updatePageSteps = (fn: (prev: StepValue[][]) => StepValue[][]) => {
    setPageSteps(prev => {
      const next = fn(prev);
      pageStepsRef.current = next;
      return next;
    });
  };

  // ── Derived: current page's visible steps ────────────────────────────
  const steps = pageSteps[viewPage];

  const allNotes     = buildNotes(rootNote, scale);
  const reversed     = useMemo(() => [...allNotes].reverse(), [allNotes]);
  const maxScroll    = Math.max(0, reversed.length - VISIBLE_ROWS);
  const scroll       = Math.min(scrollRow, maxScroll);
  const visibleNotes = reversed.slice(scroll, scroll + VISIBLE_ROWS);

  // ── Step editing ──────────────────────────────────────────────────────
  const toggleNote = useCallback((col: number, midi: number) => {
    updatePageSteps(prev => {
      const page  = prev[viewPage];
      const step  = page[col];
      const cur   = step?.notes ?? [];
      let newNotes: number[];

      if (cur.includes(midi)) {
        newNotes = cur.filter(n => n !== midi);
      } else {
        if (cur.length >= MAX_NOTES_PER_STEP) return prev;
        newNotes = [...cur, midi].sort((a, b) => a - b);
      }

      const newPage = [...page];
      newPage[col]  = newNotes.length === 0
        ? null : { notes: newNotes, strumDown: step?.strumDown ?? false };
      const next = [...prev];
      next[viewPage] = newPage;
      return next;
    });
  }, [viewPage]);

  const toggleStrumDir = useCallback((col: number) => {
    updatePageSteps(prev => {
      const page = prev[viewPage];
      const step = page[col];
      if (!step) return prev;
      const newPage = [...page];
      newPage[col] = { ...step, strumDown: !step.strumDown };
      const next = [...prev];
      next[viewPage] = newPage;
      return next;
    });
  }, [viewPage]);

  // ── Page management ───────────────────────────────────────────────────
  const toggleEnablePage = useCallback((p: number) => {
    if (p === 0) return; // page 1 always enabled
    setEnabledPages(prev => {
      const next = [...prev];
      next[p] = !next[p];
      enabledRef.current = next;
      return next;
    });
  }, []);

  const switchViewPage = useCallback((p: number) => {
    setViewPage(p);
  }, []);

  // ── Scale / root ──────────────────────────────────────────────────────
  const setScale = useCallback((s: ScaleType) => {
    setScaleState(s);
    const blank: StepValue[][] = Array(NUM_PAGES).fill(null).map(makeEmptyPage);
    setPageSteps(blank); pageStepsRef.current = blank;
    setScrollRow(0);
  }, []);

  const setRootNote = useCallback((r: number) => {
    setRootNoteState(r);
    const blank: StepValue[][] = Array(NUM_PAGES).fill(null).map(makeEmptyPage);
    setPageSteps(blank); pageStepsRef.current = blank;
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

  // ── Load (for save/load system) ───────────────────────────────────────
  const loadAllPages = useCallback((pages: StepValue[][], enabled: boolean[]) => {
    setPageSteps(pages); pageStepsRef.current = pages;
    setEnabledPages(enabled); enabledRef.current = enabled;
    setViewPage(0);
  }, []);

  // ── Playback ──────────────────────────────────────────────────────────
  const start = useCallback(() => {
    Tone.getTransport().bpm.value = bpm;

    // Build the flat sequence across enabled pages (in page order)
    const enabledIndices  = enabledRef.current.map((e, i) => e ? i : -1).filter(i => i >= 0);
    const flatSteps       = enabledIndices.flatMap(pi => pageStepsRef.current[pi]);
    const totalSteps      = flatSteps.length;

    // Ref so the callback always sees the latest steps
    const seqRef = { current: flatSteps };

    sequenceRef.current = new Tone.Sequence(
      (time, rawIdx) => {
        const idx       = rawIdx as number;
        const step      = seqRef.current[idx];
        const pageSlot  = Math.floor(idx / STEP_COUNT);           // 0-based enabled-page slot
        const stepInPg  = idx % STEP_COUNT;
        const absPage   = enabledIndices[pageSlot] ?? 0;

        Tone.getDraw().schedule(() => {
          setCurrentStep(stepInPg);
          setPlayingPage(absPage);
        }, time);

        if (!step) return;

        const ordered = step.strumDown
          ? [...step.notes].reverse()
          : [...step.notes];

        if (ordered.length === 1) {
          Tone.getDraw().schedule(() => triggerNote(ordered[0]), time);
        } else {
          const stepSecs = Tone.Time('16n').toSeconds();
          ordered.forEach((note, i) => {
            Tone.getDraw().schedule(() => triggerNote(note), time + (i / ordered.length) * stepSecs);
          });
        }
      },
      Array.from({ length: totalSteps }, (_, i) => i),
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
    setPlayingPage(-1);
    setIsPlaying(false);
  }, []);

  const updateBpm = useCallback((value: number) => {
    setBpm(value);
    Tone.getTransport().bpm.value = value;
  }, []);

  return {
    steps, pageSteps, enabledPages, viewPage, playingPage,
    visibleNotes, allNotes, scale, rootNote,
    scroll, maxScroll, bpm, isPlaying, currentStep,
    toggleNote, toggleStrumDir,
    toggleEnablePage, switchViewPage,
    loadAllPages,
    setScale, setRootNote, scrollUp, scrollDown, setScrollRowDirect,
    start, stop, updateBpm,
  };
}
