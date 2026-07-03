import type { LfoState } from './types';

export interface RingsPreset {
  name: string;
  model: number;
  params: [number, number, number, number]; // structure, brightness, damping, position
  lfo: LfoState[];
}

export interface PlaitsPreset {
  name: string;
  engine: number;
  params: [number, number, number, number, number]; // harmonics, timbre, morph, decay, lpgColour
}

export const NO_LFO: LfoState[] = [
  { on: false, wave: 'sine',   rate: 0.5, depth: 0.15 },
  { on: false, wave: 'sine',   rate: 0.5, depth: 0.15 },
  { on: false, wave: 'sine',   rate: 0.5, depth: 0.15 },
  { on: false, wave: 'sine',   rate: 0.5, depth: 0.15 },
];

export const RINGS_PRESETS: RingsPreset[] = [
  {
    name: 'Clean Long Pluck',
    model: 1,
    params: [0.11, 0.24, 0.44, 0.25],
    lfo: [
      { on: false, wave: 'sine',   rate: 0.5,    depth: 0.15 },
      { on: true,  wave: 'random', rate: 1.6,    depth: 0.0708 },
      { on: true,  wave: 'random', rate: 0.8975, depth: 0.075 },
      { on: false, wave: 'sine',   rate: 0.5,    depth: 0.15 },
    ],
  },
  {
    name: 'Softer Pluck',
    model: 0,
    params: [0.2, 0.3, 0.59, 0.25],
    lfo: [
      { on: false, wave: 'sine',   rate: 0.5, depth: 0.15 },
      { on: false, wave: 'sine',   rate: 1.6, depth: 0.1 },
      { on: false, wave: 'sine',   rate: 0.5, depth: 0.15 },
      { on: true,  wave: 'random', rate: 0.5, depth: 0.0917 },
    ],
  },
  {
    name: 'Almost Marimba',
    model: 0,
    params: [0.35, 0.25, 0.29, 0.28],
    lfo: [
      { on: false, wave: 'sine',   rate: 0.5,    depth: 0.15 },
      { on: false, wave: 'sine',   rate: 1.6,    depth: 0.0708 },
      { on: false, wave: 'sine',   rate: 0.8975, depth: 0.075 },
      { on: false, wave: 'sine',   rate: 0.5,    depth: 0.15 },
    ],
  },
  {
    name: 'Wobble Kalimba',
    model: 2,
    params: [0.27, 0.34, 0.44, 0.73],
    lfo: [
      { on: true,  wave: 'sine',   rate: 2.15625, depth: 0.0458 },
      { on: true,  wave: 'random', rate: 1.9975,  depth: 0.0542 },
      { on: true,  wave: 'random', rate: 4.74,    depth: 0.1625 },
      { on: true,  wave: 'sine',   rate: 1.56,    depth: 0.0458 },
    ],
  },
];

export const PLAITS_PRESETS: PlaitsPreset[] = [
  {
    name: 'Round Bass',
    engine: 10,
    params: [0, 0.5, 0.21, 0.9, 0],
  },
  {
    name: 'Analog Pluck',
    engine: 8,
    params: [0.48, 0, 0, 0.15, 0],
  },
];

export interface DrumVoicePreset { tone: number; decay: number; volume: number; }
export interface DrumPreset {
  name: string;
  voices: { drumHihat: DrumVoicePreset; drumSnare: DrumVoicePreset; drumKick: DrumVoicePreset; };
}

export const DRUM_PRESETS: DrumPreset[] = [
  {
    name: 'Flat Kit',
    voices: {
      drumHihat: { tone: 0.508, decay: 0.1,   volume: 0.15  },
      drumSnare:  { tone: 0.65,  decay: 0.2,   volume: 0.342 },
      drumKick:   { tone: 0.358, decay: 0.325, volume: 0.683 },
    },
  },
];
