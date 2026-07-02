// TypeScript port of Mutable Instruments Grids' pattern generator
// (rings-source/grids/pattern_generator.cc + resources.cc: drum output mode only —
// the Euclidean mode isn't ported since this app's Drums tab has no equivalent UI).
//
// This is pure control-rate logic (produces a 32-step on/off pattern per voice by
// interpolating between 4 corner patterns in a 2D X/Y space), not audio DSP — no
// oscillators, no sample-rate concerns. It's hand-ported to plain TS rather than
// compiled to WASM because it only runs once per "Generate" button click, not per
// audio sample; a WASM/AudioWorklet round trip would be pure overhead here. See
// AGENTS.md "Grids pattern generator" for the integration this feeds.
//
// The original AVR firmware uses 8-bit fixed-point arithmetic throughout
// (U8Mix/U8U8MulShift8 below reproduce that integer math exactly, not a floating
// point approximation) so a given X/Y/density combination produces the same
// pattern as real Grids hardware.

import { GRIDS_NODE_TABLES } from './gridsNodeTables';

export const GRIDS_STEPS = 32;

// Grids' own instrument order (matches the hardware's bit layout: bit0=BD,
// bit1=SD, bit2=HH — see pattern_generator.h's header comment table). This is
// DIFFERENT from the app's drum row order (Hi-Hat/Snare/Kick, top to bottom) —
// callers must remap, see src/App.tsx's use of this module.
export const GRIDS_INSTRUMENT_BD = 0;
export const GRIDS_INSTRUMENT_SD = 1;
export const GRIDS_INSTRUMENT_HH = 2;

// drum_map[i][j] from pattern_generator.cc, given as node_N indices (0-24) into
// GRIDS_NODE_TABLES instead of raw pointers.
const DRUM_MAP: readonly (readonly number[])[] = [
  [10, 8, 0, 9, 11],
  [15, 7, 13, 12, 6],
  [18, 14, 4, 5, 3],
  [23, 16, 21, 1, 2],
  [24, 19, 17, 20, 22],
];

// U8Mix(a, b, balance): weighted blend of two bytes by balance/255, matching the
// original's 16-bit-sum-then-high-byte AVR asm exactly.
function u8Mix(a: number, b: number, balance: number): number {
  const sum = b * balance + a * (255 - balance);
  return (sum >> 8) & 0xff;
}

// U8U8MulShift8(a, b) = (a * b) >> 8
function u8u8MulShift8(a: number, b: number): number {
  return (a * b) >> 8;
}

// x8(v): reproduces the original's `x << 2` on a uint8 (wraps mod 256) — the
// low 6 bits of x/y (the position within a grid cell) scaled up to a 0-252
// interpolation weight; the top 2 bits (already consumed by cell selection)
// fall off the top of the byte, same as the AVR code.
function shift2Wrap8(v: number): number {
  return (v << 2) & 0xff;
}

function readDrumMap(step: number, instrument: number, x: number, y: number): number {
  const i = x >> 6; // 0-3
  const j = y >> 6; // 0-3
  const aTable = GRIDS_NODE_TABLES[DRUM_MAP[i][j]];
  const bTable = GRIDS_NODE_TABLES[DRUM_MAP[i + 1][j]];
  const cTable = GRIDS_NODE_TABLES[DRUM_MAP[i][j + 1]];
  const dTable = GRIDS_NODE_TABLES[DRUM_MAP[i + 1][j + 1]];
  const offset = instrument * GRIDS_STEPS + step;
  const a = aTable[offset];
  const b = bTable[offset];
  const c = cTable[offset];
  const d = dTable[offset];
  const xBal = shift2Wrap8(x);
  const yBal = shift2Wrap8(y);
  return u8Mix(u8Mix(a, b, xBal), u8Mix(c, d, yBal), yBal);
}

export interface GridsPattern {
  /** Per-instrument 32-step on/off pattern, Grids' own bd/sd/hh order. */
  active: [boolean[], boolean[], boolean[]];
  /** Per-instrument 32-step accent flag (level > 192 — the hardware's "strong hit"). */
  accent: [boolean[], boolean[], boolean[]];
}

export interface GridsParams {
  /** X position in the 2D pattern space, 0-255 (hardware pot range). */
  x: number;
  /** Y position in the 2D pattern space, 0-255. */
  y: number;
  /** Per-instrument density/fill amount, 0-255, Grids bd/sd/hh order. */
  density: [number, number, number];
  /** Random perturbation amount, 0-255. 0 = fully deterministic for a given X/Y/density. */
  randomness?: number;
  /** Injectable RNG (0-255 byte generator) for the one-time-per-pattern perturbation
   *  seed, so tests/repeatable generation can supply a seeded generator. Defaults to
   *  Math.random(). */
  randomByte?: () => number;
}

function defaultRandomByte(): number {
  return Math.floor(Math.random() * 256);
}

/**
 * Generates a full 32-step, 3-voice drum pattern by evaluating Grids' drum
 * output mode at every step. Mirrors PatternGenerator::EvaluateDrums(), called
 * once per step in the original (driven by the master clock); here we just loop
 * step 0..31 directly since we want the whole pattern at once, not a live tick.
 */
export function generateGridsPattern(params: GridsParams): GridsPattern {
  const { x, y, density, randomness = 0, randomByte = defaultRandomByte } = params;

  // Perturbation is decided once per pattern in the original (at step_ === 0),
  // then held for the whole pattern (part_perturbation_). We reproduce that:
  // one random draw per instrument, applied uniformly across all 32 steps.
  const perturbation = [0, 1, 2].map(() => u8u8MulShift8(randomByte(), randomness >> 2));

  const active: [boolean[], boolean[], boolean[]] = [
    new Array(GRIDS_STEPS).fill(false),
    new Array(GRIDS_STEPS).fill(false),
    new Array(GRIDS_STEPS).fill(false),
  ];
  const accent: [boolean[], boolean[], boolean[]] = [
    new Array(GRIDS_STEPS).fill(false),
    new Array(GRIDS_STEPS).fill(false),
    new Array(GRIDS_STEPS).fill(false),
  ];

  for (let step = 0; step < GRIDS_STEPS; step++) {
    for (let instrument = 0; instrument < 3; instrument++) {
      let level = readDrumMap(step, instrument, x, y);
      const p = perturbation[instrument];
      if (level < 255 - p) {
        level += p;
      } else {
        level = 255; // matches the Anushri-derived clipping rule kept in the original
      }
      const threshold = 255 - density[instrument]; // ~settings_.density[i]
      const isActive = level > threshold;
      active[instrument][step] = isActive;
      accent[instrument][step] = isActive && level > 192;
    }
  }

  return { active, accent };
}
