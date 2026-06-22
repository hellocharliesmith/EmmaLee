import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import * as Tone from 'tone';
import { triggerNote, DRUM_VOICE_IDS } from '../audio/engine';

export type ScaleType = 'major' | 'melodic-minor' | 'chromatic';
// UI/tab-level track id — distinct from engine.ts's TrackId (which addresses 6
// individual worklets). The Drums tab is ONE tab/grid here but maps to 3 separate
// engine.ts tracks (drumHihat/drumSnare/drumKick) — see the playback loop below.
export type TrackId = 'ringsA' | 'ringsB' | 'plaits' | 'drums';
export const DRUM_ROW_LABELS = ['Hi-Hat', 'Snare', 'Kick']; // top to bottom, matches DRUM_VOICE_IDS order

export interface StepData {
  notes: number[];
  strumDown: boolean;
  prob?: number;     // 0–1, default 1 (100%)
  velocity?: number; // 0–1, default 1 (100%) — currently only applied for drums
}
export type StepValue = StepData | null;
export const MAX_NOTES_PER_STEP = 4;
export const STEP_COUNT   = 32;
export const VISIBLE_ROWS = 12;
export const PROB_OPTIONS     = [1, 0.75, 0.66, 0.5, 0.33, 0.25] as const;
export const VELOCITY_OPTIONS = [1, 0.75, 0.5, 0.25] as const;

export const TRACK_IDS: TrackId[] = ['ringsA', 'ringsB', 'plaits', 'drums'];
export const TRACK_LABELS: Record<TrackId, string> = { ringsA: 'Rings A', ringsB: 'Rings B', plaits: 'Plaits', drums: 'Drums' };

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
  for (let oct = 3; oct <= 6; oct++) {   // 4 octaves: C3–B6
    for (const iv of intervals) {
      const midi = 12 * (oct + 1) + root + iv;
      if (midi >= 0 && midi <= 127) notes.push(midi);
    }
  }
  return notes;
}

function note(midi: number): StepData { return { notes: [midi], strumDown: false }; }

function makeEmptySteps(): StepValue[] { return Array(STEP_COUNT).fill(null); }

function makeDefaultRingsASteps(): StepValue[] {
  const s = makeEmptySteps();
  s[0]  = note(64); // E4
  s[8]  = note(71); // B4
  s[14] = note(69); // A4
  s[23] = note(81); // A5
  s[24] = note(79); // G5
  return s;
}

export interface TrackSeqState {
  steps: StepValue[];
  scale: ScaleType;
  rootNote: number;
  scrollRow: number;
}

function makeDefaultTrackState(id: TrackId): TrackSeqState {
  return {
    steps: id === 'ringsA' ? makeDefaultRingsASteps() : makeEmptySteps(),
    scale: 'major',
    rootNote: 0,
    scrollRow: 7, // B5–E4 default view
  };
}

export function useSequencer() {
  const [tracks, setTracksState] = useState<Record<TrackId, TrackSeqState>>(() => {
    const init = {} as Record<TrackId, TrackSeqState>;
    for (const id of TRACK_IDS) init[id] = makeDefaultTrackState(id);
    return init;
  });
  const [activeTrack, setActiveTrackState] = useState<TrackId>('ringsA');

  const [isPlaying, setIsPlaying]     = useState(false);
  const [bpm, setBpm]                 = useState(72);
  const [currentStep, setCurrentStep] = useState(-1);

  const tracksRef = useRef(tracks);
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const updateTrack = (id: TrackId, fn: (prev: TrackSeqState) => TrackSeqState) => {
    setTracksState(prev => {
      const next = { ...prev, [id]: fn(prev[id]) };
      tracksRef.current = next;
      return next;
    });
  };

  const setActiveTrack = useCallback((id: TrackId) => setActiveTrackState(id), []);

  // ── Derived: active track's visible steps ────────────────────────────
  const track = tracks[activeTrack];
  const steps = track.steps;
  const isDrums = activeTrack === 'drums';

  // Drums: fixed 3 rows (Hi-Hat/Snare/Kick), no scale/scroll — the "note" value
  // stored in StepData is a row index (0/1/2), not a MIDI pitch.
  const allNotes     = isDrums ? DRUM_VOICE_IDS.map((_, i) => i) : buildNotes(track.rootNote, track.scale);
  const reversed     = useMemo(() => isDrums ? allNotes : [...allNotes].reverse(), [allNotes, isDrums]);
  const maxScroll    = isDrums ? 0 : Math.max(0, reversed.length - VISIBLE_ROWS);
  const scroll       = isDrums ? 0 : Math.min(track.scrollRow, maxScroll);
  const visibleNotes = isDrums ? reversed : reversed.slice(scroll, scroll + VISIBLE_ROWS);

  // ── Step editing (always targets activeTrack) ────────────────────────
  const toggleNote = useCallback((col: number, midi: number) => {
    updateTrack(activeTrack, prev => {
      const step = prev.steps[col];
      const cur  = step?.notes ?? [];
      let newNotes: number[];

      if (cur.includes(midi)) {
        newNotes = cur.filter(n => n !== midi);
      } else {
        if (cur.length >= MAX_NOTES_PER_STEP) return prev;
        newNotes = [...cur, midi].sort((a, b) => a - b);
      }

      const newSteps = [...prev.steps];
      newSteps[col]  = newNotes.length === 0
        ? null : { notes: newNotes, strumDown: step?.strumDown ?? false, prob: step?.prob };
      return { ...prev, steps: newSteps };
    });
  }, [activeTrack]);

  const toggleStrumDir = useCallback((col: number) => {
    updateTrack(activeTrack, prev => {
      const step = prev.steps[col];
      if (!step) return prev;
      const newSteps = [...prev.steps];
      newSteps[col] = { ...step, strumDown: !step.strumDown };
      return { ...prev, steps: newSteps };
    });
  }, [activeTrack]);

  const setProbability = useCallback((col: number, prob: number) => {
    updateTrack(activeTrack, prev => {
      const step = prev.steps[col];
      if (!step) return prev;
      const newSteps = [...prev.steps];
      newSteps[col] = { ...step, prob };
      return { ...prev, steps: newSteps };
    });
  }, [activeTrack]);

  const setVelocity = useCallback((col: number, velocity: number) => {
    updateTrack(activeTrack, prev => {
      const step = prev.steps[col];
      if (!step) return prev;
      const newSteps = [...prev.steps];
      newSteps[col] = { ...step, velocity };
      return { ...prev, steps: newSteps };
    });
  }, [activeTrack]);

  // ── Scale / root (per active track) ──────────────────────────────────
  const setScale = useCallback((s: ScaleType) => {
    updateTrack(activeTrack, prev => ({ ...prev, scale: s, steps: makeEmptySteps(), scrollRow: 0 }));
  }, [activeTrack]);

  const setRootNote = useCallback((r: number) => {
    updateTrack(activeTrack, prev => ({ ...prev, rootNote: r, steps: makeEmptySteps(), scrollRow: 0 }));
  }, [activeTrack]);

  const scrollUp = useCallback(() => {
    updateTrack(activeTrack, prev => ({ ...prev, scrollRow: Math.max(0, prev.scrollRow - 1) }));
  }, [activeTrack]);

  const scrollDown = useCallback(() => {
    updateTrack(activeTrack, prev => {
      const max = Math.max(0, buildNotes(prev.rootNote, prev.scale).length - VISIBLE_ROWS);
      return { ...prev, scrollRow: Math.min(max, prev.scrollRow + 1) };
    });
  }, [activeTrack]);

  const setScrollRowDirect = useCallback((r: number) => {
    updateTrack(activeTrack, prev => ({ ...prev, scrollRow: r }));
  }, [activeTrack]);

  // ── Load (for save/load system) ───────────────────────────────────────
  const loadTracks = useCallback((next: Record<TrackId, TrackSeqState>) => {
    setTracksState(next); tracksRef.current = next;
    setActiveTrackState('ringsA');
  }, []);

  // ── Playback — single shared transport, dispatches per-track ─────────
  const loopRef = useRef<Tone.Loop | null>(null);
  const stepIdxRef = useRef(0);

  const start = useCallback(() => {
    Tone.getTransport().bpm.value = bpm;
    stepIdxRef.current = 0;

    const loop = new Tone.Loop((time) => {
      const curStep = stepIdxRef.current % STEP_COUNT;
      stepIdxRef.current++;

      Tone.getDraw().schedule(() => setCurrentStep(curStep), time);

      for (const id of TRACK_IDS) {
        const step = tracksRef.current[id].steps[curStep];
        if (!step) continue;

        const prob = step.prob ?? 1;
        if (prob < 1 && Math.random() > prob) continue;

        if (id === 'drums') {
          // Each active row is an independent voice — fire together, no strum/stagger.
          // Velocity is per-step (this column), applied to every active voice in it.
          const velocity = step.velocity ?? 1;
          for (const voiceIdx of step.notes) {
            const voiceId = DRUM_VOICE_IDS[voiceIdx];
            if (voiceId) Tone.getDraw().schedule(() => triggerNote(voiceId, undefined, velocity), time);
          }
          continue;
        }

        const ordered = step.strumDown ? [...step.notes].reverse() : [...step.notes];
        if (ordered.length === 1) {
          Tone.getDraw().schedule(() => triggerNote(id, ordered[0]), time);
        } else {
          const stepSecs = Tone.Time('16n').toSeconds();
          ordered.forEach((n, i) => {
            Tone.getDraw().schedule(() => triggerNote(id, n), time + (i / ordered.length) * stepSecs);
          });
        }
      }
    }, '16n');

    loopRef.current = loop;
    loop.start(0);
    Tone.getTransport().start();
    setIsPlaying(true);
  }, [bpm]);

  const stop = useCallback(() => {
    Tone.getTransport().stop();
    loopRef.current?.dispose();
    loopRef.current = null;
    stepIdxRef.current = 0;
    setCurrentStep(-1);
    setIsPlaying(false);
  }, []);

  const updateBpm = useCallback((value: number) => {
    setBpm(value);
    Tone.getTransport().bpm.value = value;
  }, []);

  return {
    tracks, activeTrack, setActiveTrack,
    steps, visibleNotes, allNotes,
    scale: track.scale, rootNote: track.rootNote,
    scroll, maxScroll, bpm, isPlaying, currentStep,
    toggleNote, toggleStrumDir, setProbability, setVelocity,
    loadTracks,
    setScale, setRootNote, scrollUp, scrollDown, setScrollRowDirect,
    start, stop, updateBpm,
  };
}
