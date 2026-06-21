import type { ScaleType, StepValue, TrackId } from './hooks/useSequencer';
export type { StepValue, TrackId };

export interface LfoState {
  on: boolean;
  wave: 'sine' | 'random';
  rate: number;
  depth: number;
}

export interface RingsTrackState {
  steps: StepValue[];
  scale: ScaleType;
  rootNote: number;
  scrollRow: number;
  model: number;
  structure: number;
  brightness: number;
  damping: number;
  position: number;
  lfo: LfoState[];
  volume: number;
  delaySend: number;
  reverbSend: number;
}

export interface SongState {
  version: 2;
  bpm: number;
  tracks: Record<TrackId, RingsTrackState>;
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
