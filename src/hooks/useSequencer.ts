import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import * as Tone from 'tone';
import { triggerNote, setExciterGateMs, setPlaitsEnvelopeAttackMs, setPlaitsEnvelopeSustain,
         DRUM_VOICE_IDS, type RingsTrackId } from '../audio/engine';
import { tickGenerativeVoice, makeGenerativeEngineState, defaultGenerativeVoiceState,
         type GenerativeVoiceState, type GenerativeEngineState } from '../audio/generative';
export type { GenerativeVoiceState, GateModel } from '../audio/generative';

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
  // Plaits-only in practice (Rings/Drums ignore it): this step doesn't fire a
  // new trigger, it extends the previous note's hold by forcing the Plaits
  // envelope's Sustain to 1 (full hold) without retriggering the attack.
  // Releases (decays to silence) at the next non-tied step. See AGENTS.md
  // "Plaits tie".
  tie?: boolean;
  // Note Wander: 0-5, default 0/undefined = today's exact behavior. At
  // trigger time, randomly offsets this step's note(s) by up to this many
  // SCALE-DEGREE steps (not semitones) up or down, independently re-rolled
  // every time this step plays. See AGENTS.md "Note Wander".
  wander?: number;
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
// Key (scale/root) is a global setting, not per-track — these are the tracks it
// actually applies to. Drums keeps its own fixed chromatic/0 (it addresses rows
// by voice, not pitch) and is deliberately left out of the global key changes.
const MELODIC_TRACK_IDS: TrackId[] = ['ringsA', 'ringsB', 'plaits'];

const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  'major':         [0, 2, 4, 5, 7, 9, 11],
  'melodic-minor': [0, 2, 3, 5, 7, 9, 11],
  'chromatic':     [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// Shortest signed distance (in semitones, range -6..6) to go FROM pitch class
// `from` TO pitch class `to`, wrapping around the 12-tone circle in whichever
// direction is shorter (e.g. 11 -> 0 is +1, not -11).
function pitchClassDelta(from: number, to: number): number {
  const raw = ((to - from) % 12 + 12) % 12; // 0..11, steps up from `from` to reach `to`
  return raw > 6 ? raw - 12 : raw;
}

// Snap a MIDI note to the nearest pitch class present in `scale` (relative to
// `root`), preserving octave register — used by setScale/setRootNote below to
// remap existing notes instead of wiping the piano roll when the Key changes.
// Returns the note unchanged if it already fits.
export function snapNoteToScale(midi: number, root: number, scale: ScaleType): number {
  const intervals = SCALE_INTERVALS[scale];
  const pc = ((midi - root) % 12 + 12) % 12;
  if (intervals.includes(pc)) return midi;
  let bestDelta = 0;
  let bestAbs = Infinity;
  for (const iv of intervals) {
    const delta = pitchClassDelta(pc, iv);
    const abs = Math.abs(delta);
    if (abs < bestAbs) { bestAbs = abs; bestDelta = delta; }
  }
  return midi + bestDelta;
}

// Remap every note in every step of every page to fit a (possibly new) root/
// scale, instead of wiping the pages. Preserves every other StepData field
// (strumDown, prob, velocity, any future fields) by spreading the existing
// step and only replacing `notes`; de-dupes + sorts in case two notes in the
// same step snap onto the same pitch (same convention as toggleNote).
function remapPagesToScale(pages: StepValue[][], root: number, scale: ScaleType): StepValue[][] {
  return pages.map(page => page.map(step => {
    if (!step) return step;
    const notes = Array.from(new Set(step.notes.map(n => snapNoteToScale(n, root, scale)))).sort((a, b) => a - b);
    return { ...step, notes };
  }));
}

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

// Note Wander: re-rolls `midi` by up to `wanderRange` SCALE-DEGREE steps
// (not semitones) up or down, using the same note pool the piano roll
// itself is built from. Independent per call — meant to be re-rolled fresh
// every time a wandering step plays, not baked into stored step data.
function applyWander(midi: number, wanderRange: number, root: number, scale: ScaleType): number {
  if (!wanderRange) return midi;
  const pool = buildNotes(root, scale);
  const idx = pool.indexOf(midi);
  if (idx === -1) return midi; // stored note isn't in the current scale -- leave it alone rather than guess
  const offset = Math.floor(Math.random() * (2 * wanderRange + 1)) - wanderRange; // uniform in [-wanderRange, +wanderRange]
  const newIdx = Math.max(0, Math.min(pool.length - 1, idx + offset));
  return pool[newIdx];
}

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
  lastStep: number;        // 0-based index; only the final enabled page is cut here
  scale: ScaleType;
  rootNote: number;
  scrollRow: number;
  // Generative alternate sequencing mode (melodic tracks only, see
  // audio/generative.ts / AGENTS.md "Generative sequencing"). Lives here
  // (not with model/exciter/envelope in App.tsx's trackParams) because the
  // Tone.Loop below needs to read it and has no visibility into that tree.
  generative?: GenerativeVoiceState;
  // Octave transpose (melodic tracks only), -2..+2, default 0. A pure
  // runtime shift applied at trigger time in the Tone.Loop below (both the
  // piano-roll and generative paths) — never rewrites stored step data or
  // the generative note-set, so toggling it is fully reversible.
  octaveShift?: number;
}

function makeDefaultTrackState(id: TrackId): TrackSeqState {
  const pages = makeEmptyPages();
  if (id === 'ringsA') pages[0] = makeDefaultRingsASteps();
  return {
    pages,
    enabledPages: [true, false, false, false],
    currentPage: 0,
    lastStep: STEP_COUNT - 1,
    scale: 'major',
    rootNote: 0,
    scrollRow: 7,
    generative: id === 'drums' ? undefined : defaultGenerativeVoiceState(),
    octaveShift: 0,
  };
}

function initPlayingPages(): Record<TrackId, number> {
  return { ringsA: 0, ringsB: 0, plaits: 0, drums: 0 };
}

function initTrackSteps(): Record<TrackId, number> {
  return { ringsA: 0, ringsB: 0, plaits: 0, drums: 0 };
}

function initCurrentSteps(): Record<TrackId, number> {
  return { ringsA: -1, ringsB: -1, plaits: -1, drums: -1 };
}

function initGenerativeEngineStates(): Record<TrackId, GenerativeEngineState> {
  return {
    ringsA: makeGenerativeEngineState(),
    ringsB: makeGenerativeEngineState(),
    plaits: makeGenerativeEngineState(),
    drums: makeGenerativeEngineState(), // never read (drums has no `generative` config), kept for uniform typing
  };
}

export function useSequencer() {
  const [tracks, setTracksState] = useState<Record<TrackId, TrackSeqState>>(() => {
    const init = {} as Record<TrackId, TrackSeqState>;
    for (const id of TRACK_IDS) init[id] = makeDefaultTrackState(id);
    return init;
  });
  const [activeTrack, setActiveTrackState] = useState<TrackId>('ringsA');

  const [isPlaying, setIsPlaying]         = useState(false);
  const [bpm, setBpm]                     = useState(72);
  const [currentSteps, setCurrentSteps]   = useState<Record<TrackId, number>>(initCurrentSteps);
  const [currentPagePlaying, setCurrentPagePlaying] = useState<Record<TrackId, number>>(initPlayingPages);

  const trackStepsRef = useRef(initTrackSteps());
  const generativeStateRef = useRef(initGenerativeEngineStates());
  const plaitsTieHeldRef = useRef(false); // true while a tie-chain is currently holding the envelope open

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

  // Plaits tie — unlike strum/prob/velocity, this can be set on an EMPTY
  // step (that's the normal case: an otherwise-blank step that just extends
  // the previous note's hold). See StepData.tie / the Tone.Loop above.
  const toggleTie = useCallback((col: number) => {
    updateTrack(activeTrack, prev => {
      const p = prev.currentPage;
      const step = prev.pages[p][col];
      const newPageSteps = [...prev.pages[p]];
      if (!step) {
        newPageSteps[col] = { notes: [], strumDown: false, tie: true };
      } else {
        const tie = !step.tie;
        newPageSteps[col] = (!tie && step.notes.length === 0) ? null : { ...step, tie };
      }
      const newPages = prev.pages.map((pg, i) => i === p ? newPageSteps : pg);
      return { ...prev, pages: newPages };
    });
  }, [activeTrack]);

  // Note Wander — 0-5, only meaningful on a step that already has a note
  // (same "no-op on empty step" behavior as setProbability/setVelocity).
  const setWander = useCallback((col: number, wander: number) => {
    updateTrack(activeTrack, prev => {
      const p = prev.currentPage;
      const step = prev.pages[p][col];
      if (!step) return prev;
      const newPageSteps = [...prev.pages[p]];
      newPageSteps[col] = { ...step, wander };
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

  // ── Generative alternate sequencing mode (melodic tracks only) ───────────
  const setGenerativeConfig = useCallback((updates: Partial<GenerativeVoiceState>) => {
    updateTrack(activeTrack, prev => ({
      ...prev,
      generative: { ...(prev.generative ?? defaultGenerativeVoiceState()), ...updates },
    }));
  }, [activeTrack]);

  // ── Octave transpose (melodic tracks only) ────────────────────────────────
  const setOctaveShift = useCallback((shift: number) => {
    updateTrack(activeTrack, prev => ({ ...prev, octaveShift: Math.max(-2, Math.min(2, shift)) }));
  }, [activeTrack]);

  // ── Scale / root — global, applied to every melodic track at once. Notes
  // are remapped (snapped to the nearest fitting scale tone), not wiped — see
  // snapNoteToScale/remapPagesToScale above — across all three melodic tracks.
  const setScale = useCallback((s: ScaleType) => {
    setTracksState(prev => {
      const next = { ...prev };
      for (const id of MELODIC_TRACK_IDS) {
        const t = prev[id];
        next[id] = { ...t, scale: s, pages: remapPagesToScale(t.pages, t.rootNote, s), scrollRow: 0 };
      }
      tracksRef.current = next;
      return next;
    });
  }, []);

  const setRootNote = useCallback((r: number) => {
    setTracksState(prev => {
      const next = { ...prev };
      for (const id of MELODIC_TRACK_IDS) {
        const t = prev[id];
        next[id] = { ...t, rootNote: r, pages: remapPagesToScale(t.pages, r, t.scale), scrollRow: 0 };
      }
      tracksRef.current = next;
      return next;
    });
  }, []);

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

  const setLastStep = useCallback((step: number) => {
    updateTrack(activeTrack, prev => ({ ...prev, lastStep: step }));
  }, [activeTrack]);

  const clearCurrentPage = useCallback(() => {
    updateTrack(activeTrack, prev => ({
      ...prev,
      pages: makeEmptyPages(),
      enabledPages: [true, false, false, false],
      currentPage: 0,
    }));
  }, [activeTrack]);

  // ── Playback — per-track independent step counters + variable page lengths ──
  const loopRef = useRef<Tone.Loop | null>(null);

  const start = useCallback(() => {
    Tone.getTransport().bpm.value = bpm;
    for (const id of TRACK_IDS) trackStepsRef.current[id] = 0;

    const loop = new Tone.Loop((time) => {
      // Per-track: advance through pages using that track's own step counter and
      // its per-page lastStep values, so each track can have independent lengths.
      const resolvedPage: Record<string, number> = {};
      const resolvedCol:  Record<string, number> = {};

      for (const id of TRACK_IDS) {
        const t  = tracksRef.current[id];
        const ei = [0,1,2,3].filter(i => t.enabledPages[i]);
        if (ei.length === 0) { resolvedPage[id] = -1; resolvedCol[id] = -1; continue; }

        const lastEnabledPage = ei[ei.length - 1];
        const pageLengths = ei.map(p => p === lastEnabledPage ? t.lastStep + 1 : STEP_COUNT);
        const totalCycle  = pageLengths.reduce((a, b) => a + b, 0);
        const stepInCycle = trackStepsRef.current[id] % totalCycle;
        trackStepsRef.current[id]++;

        let cumulative = 0, pageSlot = 0;
        for (let s = 0; s < ei.length; s++) {
          if (stepInCycle < cumulative + pageLengths[s]) { pageSlot = s; break; }
          cumulative += pageLengths[s];
        }
        resolvedPage[id] = ei[pageSlot];
        resolvedCol[id]  = stepInCycle - cumulative;
      }

      Tone.getDraw().schedule(() => {
        const ppNow = {} as Record<TrackId, number>;
        const csNow = {} as Record<TrackId, number>;
        for (const id of TRACK_IDS) {
          ppNow[id] = resolvedPage[id];
          csNow[id] = resolvedCol[id];
        }
        setCurrentPagePlaying(ppNow);
        setCurrentSteps(csNow);
      }, time);

      for (const id of TRACK_IDS) {
        const pageIdx = resolvedPage[id];
        const col     = resolvedCol[id];
        if (pageIdx === -1 || col < 0) continue;

        const t   = tracksRef.current[id];
        const octaveShift = t.octaveShift ?? 0;
        const gen = t.generative;
        if (gen?.enabled) {
          const result = tickGenerativeVoice(gen, t.rootNote, generativeStateRef.current[id]);
          if (result.fire && result.midiNote !== undefined) {
            const midiNote = result.midiNote + octaveShift * 12;
            Tone.getDraw().schedule(() => {
              // Gate-length bias drives the SAME persistent worklet settings the
              // instrument panel's Gate(ms)/Attack+Sustain sliders use — not a
              // separate envelope system. Set BEFORE triggering, in this same
              // scheduled closure: postMessage to a worklet port is FIFO, so this
              // guarantees the gate/attack/sustain update lands before the trigger
              // message that reads it.
              if (id === 'plaits') {
                setPlaitsEnvelopeAttackMs(gen.gateBias * 400);
                setPlaitsEnvelopeSustain(gen.gateBias);
              } else {
                setExciterGateMs(id as RingsTrackId, 20 + gen.gateBias * 780);
              }
              triggerNote(id as 'ringsA' | 'ringsB' | 'plaits', midiNote);
            }, time);
          }
          continue;
        }

        const step = t.pages[pageIdx][col];

        // Plaits tie (see StepData.tie) — checked before the general "no
        // step" bail-out below, since a tied step intentionally carries no
        // note of its own; it extends whatever's already sounding instead.
        if (id === 'plaits' && step?.tie) {
          if (!plaitsTieHeldRef.current) {
            plaitsTieHeldRef.current = true;
            // Force the envelope's Sustain open regardless of the panel's own
            // configured Sustain — tie is meant to give explicit per-step gate
            // control independent of that knob. No trigger() call here, so
            // this doesn't restart the attack ramp, just redirects the
            // existing hold target.
            Tone.getDraw().schedule(() => setPlaitsEnvelopeSustain(1), time);
          }
          continue;
        }
        if (id === 'plaits' && plaitsTieHeldRef.current) {
          // This step isn't tied, so a tie-chain that was open just ended —
          // release it. If this step also carries its own new note below, its
          // trigger() call resets the envelope again immediately after, so
          // this is harmless even then, not just when the chain ends on an
          // empty step.
          plaitsTieHeldRef.current = false;
          Tone.getDraw().schedule(() => setPlaitsEnvelopeSustain(0), time);
        }

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

        const wanderRange = step.wander ?? 0;
        const transform = (n: number) => applyWander(n, wanderRange, t.rootNote, t.scale) + octaveShift * 12;
        const ordered = (step.strumDown ? [...step.notes].reverse() : [...step.notes]).map(transform);
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
    for (const id of TRACK_IDS) trackStepsRef.current[id] = 0;
    setCurrentSteps(initCurrentSteps());
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
    // Global key — always reads off ringsA, which (along with ringsB/plaits)
    // is kept in sync by setScale/setRootNote regardless of activeTrack. Lets
    // the header's key control show/set the right value even while viewing
    // Drums or Master, where `scale`/`rootNote` above reflect that tab instead.
    globalScale: tracks.ringsA.scale, globalRootNote: tracks.ringsA.rootNote,
    scroll, maxScroll, bpm, isPlaying,
    currentStep: currentSteps[activeTrack],
    currentPage: track.currentPage,
    lastStep: track.lastStep,
    enabledPages: track.enabledPages,
    currentPagePlaying,
    generative: track.generative ?? defaultGenerativeVoiceState(),
    setGenerativeConfig,
    octaveShift: track.octaveShift ?? 0,
    setOctaveShift,
    toggleNote, toggleStrumDir, setProbability, setVelocity, setPageSteps, toggleTie, setWander,
    loadTracks, clearCurrentPage,
    setScale, setRootNote, scrollUp, scrollDown, setScrollRowDirect,
    switchToPage, setCurrentPage, togglePageEnabled,
    setLastStep,
    start, stop, updateBpm,

  };
}
