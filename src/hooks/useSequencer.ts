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
export const PAGE_COUNT   = 4;
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

function makeEmptyPages(): StepValue[][] {
  return Array.from({ length: PAGE_COUNT }, () => makeEmptySteps());
}

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
  pages: StepValue[][];    // PAGE_COUNT pages × STEP_COUNT steps each
  enabledPages: boolean[]; // length PAGE_COUNT — which pages participate in playback
  currentPage: number;     // 0-indexed, which page is shown in the editor
  scale: ScaleType;
  rootNote: number;
  scrollRow: number;
}

function makeDefaultTrackState(id: TrackId): TrackSeqState {
  const pages = makeEmptyPages();
  if (id === 'ringsA') pages[0] = makeDefaultRingsASteps();
  return {
    pages,
    enabledPages: [true, false, false, false],
    currentPage: 0,
    scale: 'major',
    rootNote: 0,
    scrollRow: 7,
  };
}

function initPlayingPages(): Record<TrackId, number> {
  return { ringsA: 0, ringsB: 0, plaits: 0, drums: 0 };
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
  const [currentPagePlaying, setCurrentPagePlaying] = useState<Record<TrackId, number>>(initPlayingPages);

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
  const steps = track.pages[track.currentPage];
  const isDrums = activeTrack === 'drums';

  // Drums: fixed 3 rows (Hi-Hat/Snare/Kick), no scale/scroll — the "note" value
  // stored in StepData is a row index (0/1/2), not a MIDI pitch.
  const allNotes     = isDrums ? DRUM_VOICE_IDS.map((_, i) => i) : buildNotes(track.rootNote, track.scale);
  const reversed     = useMemo(() => isDrums ? allNotes : [...allNotes].reverse(), [allNotes, isDrums]);
  const maxScroll    = isDrums ? 0 : Math.max(0, reversed.length - VISIBLE_ROWS);
  const scroll       = isDrums ? 0 : Math.min(track.scrollRow, maxScroll);
  const visibleNotes = isDrums ? reversed : reversed.slice(scroll, scroll + VISIBLE_ROWS);

  // ── Page navigation ────────────────────────────────────────────────

  // Switch to a page and auto-enable it for playback in one atomic update.
  const switchToPage = useCallback((pageIdx: number) => {
    updateTrack(activeTrack, prev => {
      const enabled = [...prev.enabledPages];
      enabled[pageIdx] = true;
      return { ...prev, currentPage: pageIdx, enabledPages: enabled };
    });
  }, [activeTrack]);

  const setCurrentPage = useCallback((pageIdx: number) => {
    updateTrack(activeTrack, prev => ({ ...prev, currentPage: pageIdx }));
  }, [activeTrack]);

  // Toggle whether a page is in the playback loop. At least one page must always be enabled.
  const togglePageEnabled = useCallback((pageIdx: number) => {
    updateTrack(activeTrack, prev => {
      const enabled = [...prev.enabledPages];
      if (enabled[pageIdx] && enabled.filter(Boolean).length === 1) return prev;
      enabled[pageIdx] = !enabled[pageIdx];
      return { ...prev, enabledPages: enabled };
    });
  }, [activeTrack]);

  // ── Step editing (targets the active track's currentPage) ────────────
  const toggleNote = useCallback((col: number, midi: number) => {
    updateTrack(activeTrack, prev => {
      const p = prev.currentPage;
      const step = prev.pages[p][col];
      const cur  = step?.notes ?? [];
      let newNotes: number[];

      if (cur.includes(midi)) {
        newNotes = cur.filter(n => n !== midi);
      } else {
        if (cur.length >= MAX_NOTES_PER_STEP) return prev;
        newNotes = [...cur, midi].sort((a, b) => a - b);
      }

      const newPageSteps = [...prev.pages[p]];
      newPageSteps[col] = newNotes.length === 0
        ? null : { notes: newNotes, strumDown: step?.strumDown ?? false, prob: step?.prob };
      const newPages = prev.pages.map((pg, i) => i === p ? newPageSteps : pg);
      return { ...prev, pages: newPages };
    });
  }, [activeTrack]);

  const toggleStrumDir = useCallback((col: number) => {
    updateTrack(activeTrack, prev => {
      const p = prev.currentPage;
      const step = prev.pages[p][col];
      if (!step) return prev;
      const newPageSteps = [...prev.pages[p]];
      newPageSteps[col] = { ...step, strumDown: !step.strumDown };
      const newPages = prev.pages.map((pg, i) => i === p ? newPageSteps : pg);
      return { ...prev, pages: newPages };
    });
  }, [activeTrack]);

  const setProbability = useCallback((col: number, prob: number) => {
    updateTrack(activeTrack, prev => {
      const p = prev.currentPage;
      const step = prev.pages[p][col];
      if (!step) return prev;
      const newPageSteps = [...prev.pages[p]];
      newPageSteps[col] = { ...step, prob };
      const newPages = prev.pages.map((pg, i) => i === p ? newPageSteps : pg);
      return { ...prev, pages: newPages };
    });
  }, [activeTrack]);

  const setVelocity = useCallback((col: number, velocity: number) => {
    updateTrack(activeTrack, prev => {
      const p = prev.currentPage;
      const step = prev.pages[p][col];
      if (!step) return prev;
      const newPageSteps = [...prev.pages[p]];
      newPageSteps[col] = { ...step, velocity };
      const newPages = prev.pages.map((pg, i) => i === p ? newPageSteps : pg);
      return { ...prev, pages: newPages };
    });
  }, [activeTrack]);

  // Bulk-write the active track's currentPage in one shot (32 StepValues) — used
  // by the Grids pattern generator (App.tsx) to fill a whole drum page from a
  // single "Generate" click, instead of 32 individual toggleNote calls.
  const setPageSteps = useCallback((newSteps: StepValue[]) => {
    updateTrack(activeTrack, prev => {
      const p = prev.currentPage;
      const newPages = prev.pages.map((pg, i) => i === p ? newSteps : pg);
      return { ...prev, pages: newPages };
    });
  }, [activeTrack]);

  // ── Scale / root (per active track) — clears all pages ────────────────
  const setScale = useCallback((s: ScaleType) => {
    updateTrack(activeTrack, prev => ({ ...prev, scale: s, pages: makeEmptyPages(), scrollRow: 0 }));
  }, [activeTrack]);

  const setRootNote = useCallback((r: number) => {
    updateTrack(activeTrack, prev => ({ ...prev, rootNote: r, pages: makeEmptyPages(), scrollRow: 0 }));
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

  // ── Playback — single shared transport, per-track page advancing ──────
  const loopRef    = useRef<Tone.Loop | null>(null);
  const stepIdxRef = useRef(0);

  const start = useCallback(() => {
    Tone.getTransport().bpm.value = bpm;
    stepIdxRef.current = 0;

    const loop = new Tone.Loop((time) => {
      const globalStep = stepIdxRef.current;
      stepIdxRef.current++;
      const colInPage = globalStep % STEP_COUNT;

      // Compute which page each track is on for this global step tick.
      // Each track independently advances through its enabled pages.
      const computePlayingPage = (id: TrackId): number => {
        const t = tracksRef.current[id];
        const ei = [0,1,2,3].filter(i => t.enabledPages[i]);
        if (ei.length === 0) return -1;
        const slot = Math.floor((globalStep % (ei.length * STEP_COUNT)) / STEP_COUNT);
        return ei[slot];
      };

      Tone.getDraw().schedule(() => {
        const ppNow = {} as Record<TrackId, number>;
        for (const id of TRACK_IDS) ppNow[id] = computePlayingPage(id);
        setCurrentPagePlaying(ppNow);
        setCurrentStep(colInPage);
      }, time);

      for (const id of TRACK_IDS) {
        const t = tracksRef.current[id];
        const pageIdx = computePlayingPage(id);
        if (pageIdx === -1) continue;
        const step = t.pages[pageIdx][colInPage];
        if (!step) continue;

        const prob = step.prob ?? 1;
        if (prob < 1 && Math.random() > prob) continue;

        if (id === 'drums') {
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
    setCurrentPagePlaying(initPlayingPages());
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
    currentPage: track.currentPage,
    enabledPages: track.enabledPages,
    currentPagePlaying,
    toggleNote, toggleStrumDir, setProbability, setVelocity, setPageSteps,
    loadTracks,
    setScale, setRootNote, scrollUp, scrollDown, setScrollRowDirect,
    switchToPage, setCurrentPage, togglePageEnabled,
    start, stop, updateBpm,
  };
}
