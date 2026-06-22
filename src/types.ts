import type { ScaleType, StepValue, TrackId } from './hooks/useSequencer';
export type { StepValue, TrackId };

export interface LfoState {
  on: boolean;
  wave: 'sine' | 'random';
  rate: number;
  depth: number;
}

interface BaseTrackState {
  steps: StepValue[];
  scale: ScaleType;
  rootNote: number;
  scrollRow: number;
  volume: number;
  delaySend: number;
  reverbSend: number;
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

// Drums: scale/rootNote are unused (fixed 3 rows, not a chromatic grid) but kept
// for shape uniformity with BaseTrackState. volume/delaySend/reverbSend apply to
// all 3 drum voices uniformly (broadcast) — see App.tsx. `voices` holds independent
// tone/decay per drum (each is its own Plaits instance under the hood).
export interface DrumTrackState extends BaseTrackState {
  voices: Record<'drumHihat' | 'drumSnare' | 'drumKick', { tone: number; decay: number }>;
}

export interface SongState {
  version: 2;
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

// Pre-multitrack save format — kept only so old saves still load.
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
  state: SongState | LegacySongStateV1;
}
