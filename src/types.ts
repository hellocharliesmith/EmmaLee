import type { ScaleType, StepValue } from './hooks/useSequencer';
export type { StepValue };

export interface LfoState {
  on: boolean;
  wave: 'sine' | 'random';
  rate: number;
  depth: number;
}

export interface SongState {
  steps: StepValue[];
  scale: ScaleType;
  rootNote: number;
  scrollRow: number;
  bpm: number;
  // Rings
  model: number;
  structure: number;
  brightness: number;
  damping: number;
  position: number;
  lfo: LfoState[];
  // Delay
  delayDivision: string;
  delayMix: number;
  delayFeedback: number;
  delayFilter: number;
  // Reverb
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
  state: SongState;
}
