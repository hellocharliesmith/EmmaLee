import type { ScaleType, StepValue, TrackId, GenerativeVoiceState } from './hooks/useSequencer';
import type { ExciterModel } from './audio/engine';
export type { StepValue, TrackId };

export interface LfoState {
  on: boolean;
  wave: 'sine' | 'random';
  rate: number;
  depth: number;
}

// Rings' excitation source — 'internal' (default) is Rings' own noise burst/
// pulse, unchanged from before this existed. The other 5 route Elements'
// Mallet/Plectrum/Particles/Flow/Noise into Rings' real IN port instead —
// see engine.ts's setExciterModel / AGENTS.md "Rings exciter".
export interface ExciterState {
  model: ExciterModel;
  timbre: number;
  parameter: number;
  gateMs: number;
  level: number;    // 0-2 (0%-200%), default 1.0 -- added 2026-07-11, see App.tsx's loadSong for the old-save fallback
  attackMs: number; // 0-500, default 0 (instant) -- added 2026-07-11, see App.tsx's loadSong for the old-save fallback
}

interface BaseTrackState {
  pages: StepValue[][];
  enabledPages: boolean[];
  lastStep?: number;
  scale: ScaleType;
  rootNote: number;
  scrollRow: number;
  volume: number;
  delaySend: number;
  reverbSend: number;
  cloudsSend?: number;
}

export interface RingsTrackState extends BaseTrackState {
  model: number;
  structure: number;
  brightness: number;
  damping: number;
  position: number;
  lfo: LfoState[];
  exciter?: ExciterState; // optional -- old saves default to 'internal' (today's behavior), see App.tsx's loadSong
  generative?: GenerativeVoiceState; // optional -- old saves default to disabled (today's piano-roll behavior), see App.tsx's loadSong
}

// Drives Plaits' real LEVEL input instead of its fixed pitch-tied "ping"
// envelope — see engine.ts's setPlaitsEnvelopeAttackMs/Sustain / AGENTS.md
// "Plaits envelope". attackMs=0 && sustain=0 (the defaults) reproduce
// Plaits' original always-decays-to-silence behavior exactly.
export interface PlaitsEnvelopeState {
  attackMs: number; // 0-3000, default 0 (instant)
  sustain: number;  // 0-1, default 0 (decays to silence). 1 = holds forever (drone).
}

export interface PlaitsTrackState extends BaseTrackState {
  engine: number;
  harmonics: number;
  timbre: number;
  morph: number;
  decay: number;
  lpgColour: number; // no longer surfaced in the UI — always sent to the engine as 1.0 (see engine.ts)
  lfo: LfoState[];
  envelope?: PlaitsEnvelopeState; // optional -- old saves default to {0,0} (today's native envelope), see App.tsx's loadSong
  generative?: GenerativeVoiceState; // optional -- old saves default to disabled (today's piano-roll behavior), see App.tsx's loadSong
}

export interface DrumTrackState extends BaseTrackState {
  voices: Record<'drumHihat' | 'drumSnare' | 'drumKick', { tone: number; decay: number; volume: number }>;
}

export interface SongState {
  version: 3;
  bpm: number;
  tracks: {
    ringsA: RingsTrackState;
    ringsB: RingsTrackState;
    plaits: PlaitsTrackState;
    drums: DrumTrackState;
  };
  // Master
  delayDivision: string;
  delayMix: number;
  delayFeedback: number;
  delayFilter: number;
  reverbType: string;
  reverbMix: number;
  reverbDecay: number;
  reverbPreDelay: number;
  reverbTone: number;
}

// ── Legacy formats (kept only so old saves still load) ────────────────────────

interface LegacyBaseTrackV2 {
  steps: StepValue[];
  scale: ScaleType;
  rootNote: number;
  scrollRow: number;
  volume: number;
  delaySend: number;
  reverbSend: number;
}

// Pre-pages save format (Phase 4 multitrack, version 2)
export interface LegacySongStateV2 {
  version: 2;
  bpm: number;
  tracks: {
    ringsA: LegacyBaseTrackV2 & { model: number; structure: number; brightness: number; damping: number; position: number; lfo: LfoState[] };
    ringsB: LegacyBaseTrackV2 & { model: number; structure: number; brightness: number; damping: number; position: number; lfo: LfoState[] };
    plaits: LegacyBaseTrackV2 & { engine: number; harmonics: number; timbre: number; morph: number; decay: number; lpgColour?: number };
    drums:  LegacyBaseTrackV2 & { voices?: Record<string, { tone: number; decay: number }> };
  };
  delayDivision: string;
  delayMix: number;
  delayFeedback: number;
  delayFilter: number;
  reverbType: string;
  reverbMix: number;
  reverbDecay: number;
  reverbPreDelay: number;
  reverbTone: number;
}

// Pre-multitrack save format (version 1)
export interface LegacySongStateV1 {
  steps: StepValue[][] | StepValue[];
  enabledPages?: boolean[];
  scale: ScaleType;
  rootNote: number;
  scrollRow: number;
  bpm: number;
  model: number;
  structure: number;
  brightness: number;
  damping: number;
  position: number;
  lfo: LfoState[];
  delayDivision: string;
  delayMix: number;
  delayFeedback: number;
  delayFilter: number;
  reverbType: string;
  reverbMix: number;
  reverbDecay: number;
  reverbPreDelay: number;
  reverbTone: number;
}

export interface SavedSong {
  id: string;
  name: string;
  savedAt: number;
  state: SongState | LegacySongStateV2 | LegacySongStateV1;
}
