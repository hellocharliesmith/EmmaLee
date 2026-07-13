// Pure, audio-thread-free generative sequencing engine — control-rate logic
// only (like grids.ts), no WASM/worklet dependency. Ticked once per 16th
// note from useSequencer.ts's shared Tone.Loop for any melodic track with
// generative.enabled === true, fully decoupled from that track's own piano-
// roll page data.
//
// Two independent generators run every tick, matching the "gate decoupled
// from notes" requirement: a gate/rhythm decision (one of 4 models below)
// and a note decision (a hand-rolled Turing-machine shift register). Both
// advance every tick regardless of whether the other fires — a note is only
// actually returned when the gate decides to fire that tick.
//
// See AGENTS.md "Generative sequencing" for the full design writeup,
// including why this hand-ports only a subset of Marbles' real T-generator
// models (rings-source/marbles/random/t_generator.h) rather than the whole
// class (the other 3 need sub-tick ramp scheduling this app's single shared
// clock doesn't have a use for), and why the Turing machine is a fresh
// implementation rather than an adaptation of Marbles' own RandomSequence
// (a structurally similar but hardware-CV-recording-oriented class) — both
// deliberate choices for v1, not omissions.

export type GateModel = 'bernoulli' | 'three-states' | 'drums' | 'markov';

export interface GenerativeVoiceState {
  enabled: boolean;
  gateModel: GateModel;
  density: number;       // 0-1, gate probability / model threshold
  complexity: number;    // 0-1, model-specific character — see tickGate()
  mutationProb: number;  // 0-1, Turing-machine shift-register mutation probability
  noteSet: number[];     // semitone offsets from root (0-11), 1-12 entries, e.g. [0,4,7].
                          // Relative to root (not absolute pitch class) so it
                          // automatically transposes when the global Key changes.
  octaveMin: number;     // inclusive, MIDI octave numbering (matches noteName() in useSequencer.ts)
  octaveMax: number;     // inclusive
  gateBias: number;      // 0-1, 0=short/percussive, 1=long/sustained — drives the
                          // EXISTING exciter Gate(ms) (Rings) / envelope Attack+
                          // Sustain (Plaits) controls, not a new envelope system
}

export function defaultGenerativeVoiceState(): GenerativeVoiceState {
  return {
    enabled: false,
    gateModel: 'bernoulli',
    density: 0.5,
    complexity: 0.5,
    mutationProb: 0.15,
    noteSet: [0, 4, 7], // major triad
    octaveMin: 3,
    octaveMax: 5,
    gateBias: 0.5,
  };
}

interface GateScratch {
  phase: 0 | 1 | 2;      // three-states
  step: number;          // drums (0-7)
  lastFired?: boolean;   // markov
}

export interface GenerativeEngineState {
  shiftRegister: number;   // 8-bit Turing-machine register, 0-255
  gate: GateScratch;
  rng: () => number;       // injectable, defaults to Math.random — same pattern as grids.ts, keeps this testable
}

export function makeGenerativeEngineState(rng: () => number = Math.random): GenerativeEngineState {
  return {
    shiftRegister: Math.floor(rng() * 256),
    gate: { phase: 1, step: 0 },
    rng,
  };
}

// 4 canned 8-step patterns, increasing in density/syncopation — adapted in
// spirit (not byte-ported) from Marbles' drum-pattern-table concept: a small
// set of canned rhythmic shapes selected by one knob instead of a per-tick
// probabilistic decision.
const DRUM_PATTERNS: boolean[][] = [
  [true, false, false, false, true, false, false, false], // sparse, four-on-the-floor-ish
  [true, false, true, false, true, false, true, false],    // steady eighths
  [true, false, true, true, false, true, false, true],     // syncopated
  [true, true, false, true, true, false, true, true],      // busy
];

function tickGate(config: GenerativeVoiceState, state: GenerativeEngineState): boolean {
  const { rng } = state;
  const { density, complexity, gateModel } = config;

  switch (gateModel) {
    case 'bernoulli':
      return rng() < density;

    case 'three-states': {
      const st = state.gate;
      // Occasionally re-roll which "mode" we're in — complexity controls how
      // often the mode itself changes (a stable groove vs. a restless one).
      if (rng() < 0.08 + complexity * 0.35) {
        const r = rng();
        st.phase = r < 0.35 ? 0 : r < 0.7 ? 1 : 2;
      }
      const fireProbByPhase = [0.05, 0.4, 0.85];
      return rng() < fireProbByPhase[st.phase] * (0.4 + density * 0.6);
    }

    case 'drums': {
      const st = state.gate;
      const patternIdx = Math.min(DRUM_PATTERNS.length - 1, Math.floor(complexity * DRUM_PATTERNS.length));
      const pattern = DRUM_PATTERNS[patternIdx];
      const stepIsOn = pattern[st.step % 8];
      st.step = (st.step + 1) % 8;
      // density thins out an otherwise-mechanical canned pattern
      return stepIsOn && rng() < (0.5 + density * 0.5);
    }

    case 'markov': {
      const st = state.gate;
      if (st.lastFired === undefined || rng() >= complexity) {
        st.lastFired = rng() < density;
      }
      // else: repeat the previous outcome — complexity is the "stickiness"
      // that produces streaks/bursts instead of independent coin flips.
      return st.lastFired;
    }
  }
}

// Classic 8-bit shift-register "Turing machine": each tick, the bit about to
// shift out either recirculates unchanged (mutation roll fails) or gets
// replaced with a fresh random bit. mutationProb=0 is a plain rotate-right —
// the whole 8-bit pattern repeats exactly every 8 ticks (a locked loop).
// mutationProb=1 is pure random every tick, no repeat structure. In between
// is mostly-repeating with occasional mutation — the "slow evolving but
// recognizable" character this whole feature is for.
function tickShiftRegister(mutationProb: number, state: GenerativeEngineState): number {
  const outgoingBit = state.shiftRegister & 1;
  const newBit = state.rng() < mutationProb ? (state.rng() < 0.5 ? 0 : 1) : outgoingBit;
  state.shiftRegister = ((state.shiftRegister >> 1) | (newBit << 7)) & 0xff;
  return state.shiftRegister;
}

// Ordered pool of allowed MIDI notes from noteSet (semitone offsets from
// root) x [octaveMin, octaveMax], re-derived fresh from the CURRENT root
// every call so it stays in sync with global Key changes with no separate
// transpose step anywhere.
function buildNotePool(config: GenerativeVoiceState, rootNote: number): number[] {
  const pool: number[] = [];
  for (let oct = config.octaveMin; oct <= config.octaveMax; oct++) {
    for (const offset of config.noteSet) {
      const midi = 12 * (oct + 1) + rootNote + offset;
      if (midi >= 0 && midi <= 127) pool.push(midi);
    }
  }
  return pool.sort((a, b) => a - b);
}

export interface GenerativeTickResult {
  fire: boolean;
  midiNote?: number;
}

// Called once per 16th-note tick for a track with generative.enabled===true.
export function tickGenerativeVoice(
  config: GenerativeVoiceState,
  rootNote: number,
  state: GenerativeEngineState,
): GenerativeTickResult {
  const fire = tickGate(config, state);
  const registerValue = tickShiftRegister(config.mutationProb, state);
  if (!fire) return { fire: false };

  const pool = buildNotePool(config, rootNote);
  if (pool.length === 0) return { fire: false };

  return { fire: true, midiNote: pool[registerValue % pool.length] };
}
