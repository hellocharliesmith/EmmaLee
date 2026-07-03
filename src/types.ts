import type { ScaleType, StepValue, TrackId } from './hooks/useSequencer';
export type { StepValue, TrackId };

export interface LfoState {
  on: boolean;
  wave: 'sine' | 'random';
  rate: number;
  depth: number;
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
}

export interface PlaitsTrackState extends BaseTrackState {
  engine: number;
  harmonics: number;
  timbre: number;
  morph: number;
  decay: number;
  lpgColour: number;
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
