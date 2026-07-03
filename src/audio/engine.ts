
export type RingsTrackId = 'ringsA' | 'ringsB';
export type PlaitsTrackId = 'plaits';
// Drum voices use Plaits' own drum engines (bass_drum/snare_drum/hi_hat — indices
// 21/22/23 in hardware registration order, see voice.cc) via 3 independent worklets
// so they can overlap on the same step, unlike the monophonic melodic tracks.
export type DrumVoiceId = 'drumHihat' | 'drumSnare' | 'drumKick';
export type TrackId = RingsTrackId | PlaitsTrackId | DrumVoiceId;
export const RINGS_TRACK_IDS: RingsTrackId[] = ['ringsA', 'ringsB'];
export const PLAITS_TRACK_ID: PlaitsTrackId = 'plaits';
// Order matches the drum grid's row order (top to bottom) — row index === StepData note value.
export const DRUM_VOICE_IDS: DrumVoiceId[] = ['drumHihat', 'drumSnare', 'drumKick'];
export const ALL_TRACK_IDS: TrackId[] = [...RINGS_TRACK_IDS, PLAITS_TRACK_ID, ...DRUM_VOICE_IDS];

let audioCtx: AudioContext | null = null;
let isReady = false;

// ── Master bus ──────────────────────────────────────────────────────────
let preDelay: DelayNode | null = null;
let toneFilter: BiquadFilterNode | null = null;
let delayBusInput: GainNode | null = null;    // sums all tracks' delay sends
let reverbBusInput: GainNode | null = null;   // sums all tracks' reverb sends
let wetGain: GainNode | null = null;          // reverb return level
let delayNode: DelayNode | null = null;
let delayFeedbackGain: GainNode | null = null;
let delayFeedbackFilter: BiquadFilterNode | null = null;
let delayMixGain: GainNode | null = null;     // delay return level
let cloudsBusInput: GainNode | null = null;   // sums all tracks' clouds sends
let cloudsNode: AudioWorkletNode | null = null;
let cloudsWetGain: GainNode | null = null;    // clouds return level ("Mix")
let masterGain: GainNode | null = null;
let analyserL: AnalyserNode | null = null;
let analyserR: AnalyserNode | null = null;

const dspLoadByTrack = new Map<TrackId, number>();

export function getAnalysers(): [AnalyserNode | null, AnalyserNode | null] { return [analyserL, analyserR]; }
export function getDSPLoad(): number {
  let sum = 0;
  for (const v of dspLoadByTrack.values()) sum += v;
  return sum;
}

export function setMasterVolume(v: number): void {
  if (!masterGain) return;
  masterGain.gain.value = Math.max(0, Math.min(2, v));
}

// ── Reverb unit abstraction ───────────────────────────────────────────────
interface ReverbUnit { input: AudioNode; output: AudioNode; }
let reverbUnit: ReverbUnit | null = null;
let currentIRName = 'algo';
let currentDecay  = 0.72;

const irCache = new Map<string, AudioBuffer>();

async function loadIR(ctx: AudioContext, name: string): Promise<AudioBuffer> {
  if (irCache.has(name)) return irCache.get(name)!;
  const arrayBuffer = await fetch(`/ir/${name}.wav`).then(r => r.arrayBuffer());
  const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
    ctx.decodeAudioData(arrayBuffer, resolve, reject);
  });
  irCache.set(name, buffer);
  return buffer;
}

function applyDecay(buffer: AudioBuffer, ctx: AudioContext, decay: number): AudioBuffer {
  const targetLength = Math.max(256, Math.floor(buffer.length * decay));
  const result = ctx.createBuffer(buffer.numberOfChannels, targetLength, buffer.sampleRate);
  const fadeStart = Math.floor(targetLength * 0.8);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = result.getChannelData(c);
    for (let i = 0; i < targetLength; i++) {
      const fade = i >= fadeStart ? 1 - (i - fadeStart) / (targetLength - fadeStart) : 1;
      dst[i] = (src[i] ?? 0) * fade;
    }
  }
  return result;
}

// ── Algorithmic plate reverb ──────────────────────────────────────────────
// ConvolverNode with a generated pink-noise IR. Inherently stable — no feedback possible.
function buildAlgoIR(ctx: AudioContext, decayRate = 2.5): AudioBuffer {
  const duration = 2.0; // seconds
  const len = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  const predelaySamples = Math.floor(ctx.sampleRate * 0.01); // 10ms pre-delay

  for (let c = 0; c < 2; c++) {
    const d = buffer.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    const spread = c === 0 ? 1.0 : 0.97;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      b6 = w * 0.115926;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11 * spread;
      const n = Math.max(0, i - predelaySamples);
      d[i] = pink * Math.exp(-decayRate * n / len);
    }
  }
  return buffer;
}

function getAlgoUnit(ctx: AudioContext, decay: number): ReverbUnit {
  const ir = buildAlgoIR(ctx, 4.0 - decay * 3.0);
  return makeConvolverUnit(ctx, ir);
}

function makeConvolverUnit(ctx: AudioContext, buffer: AudioBuffer): ReverbUnit {
  const conv = ctx.createConvolver();
  conv.buffer = buffer;
  return { input: conv, output: conv };
}

function swapReverb(newUnit: ReverbUnit) {
  if (!toneFilter || !wetGain) return;
  if (reverbUnit) {
    try { toneFilter.disconnect(reverbUnit.input); } catch {}
    try { reverbUnit.output.disconnect(wetGain!); } catch {}
  }
  toneFilter.connect(newUnit.input);
  newUnit.output.connect(wetGain!);
  reverbUnit = newUnit;
}

// ── Tracks (shared by Rings and Plaits) ────────────────────────────────────
interface TrackNodes {
  worklet: AudioWorkletNode;
  dryGain: GainNode;
  delaySend: GainNode;
  reverbSend: GainNode;
  cloudsSend: GainNode;
}
const tracks = new Map<TrackId, TrackNodes>();

// Builds the worklet, awaits its 'ready' handshake, and wires dry/delaySend/reverbSend/
// cloudsSend into the shared master bus. Caller is responsible for instrument-specific
// defaults. Takes raw WASM bytes (not a compiled Module) and compiles inside the worklet —
// Chrome silently hangs instantiating a Module across the postMessage boundary.
async function createTrackWorklet(ctx: AudioContext, id: TrackId, processorName: string, wasmBytes: ArrayBuffer): Promise<AudioWorkletNode> {
  const worklet = new AudioWorkletNode(ctx, processorName, {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
  });

  worklet.port.postMessage({ type: 'load-wasm', payload: { wasmBytes } });
  await new Promise<void>((resolve, reject) => {
    worklet.port.onmessage = (e) => {
      if (e.data.type === 'ready') resolve();
      if (e.data.type === 'error') reject(new Error(e.data.message));
    };
  });
  worklet.port.onmessage = (e) => {
    if (e.data.type === 'perf') dspLoadByTrack.set(id, e.data.load);
  };

  const dryGain    = ctx.createGain(); dryGain.gain.value = 0.85;
  const delaySend  = ctx.createGain(); delaySend.gain.value = 0.5;
  const reverbSend = ctx.createGain(); reverbSend.gain.value = 0.5;
  const cloudsSend = ctx.createGain(); cloudsSend.gain.value = 0.4;

  worklet.connect(dryGain);     dryGain.connect(masterGain!);
  worklet.connect(delaySend);   delaySend.connect(delayBusInput!);
  worklet.connect(reverbSend);  reverbSend.connect(reverbBusInput!);
  worklet.connect(cloudsSend);  cloudsSend.connect(cloudsBusInput!);

  tracks.set(id, { worklet, dryGain, delaySend, reverbSend, cloudsSend });
  return worklet;
}

async function createRingsTrack(ctx: AudioContext, id: RingsTrackId, wasmBytes: ArrayBuffer): Promise<void> {
  const worklet = await createTrackWorklet(ctx, id, 'rings-processor', wasmBytes);

  // Defaults — Structure/Brightness/Damping/Position, Strings model
  worklet.port.postMessage({ type: 'set-param', payload: { param: 0, value: 0.11 } });
  worklet.port.postMessage({ type: 'set-param', payload: { param: 1, value: 0.24 } });
  worklet.port.postMessage({ type: 'set-param', payload: { param: 2, value: 0.44 } });
  worklet.port.postMessage({ type: 'set-param', payload: { param: 3, value: 0.25 } });
  worklet.port.postMessage({ type: 'set-model', payload: { model: 1 } });

  // Default LFO: Brightness (index 1) — smooth random, on
  worklet.port.postMessage({ type: 'set-lfo', payload: { index: 1, field: 'wave',    value: 'random' } });
  worklet.port.postMessage({ type: 'set-lfo', payload: { index: 1, field: 'rate',    value: 1.6 } });
  worklet.port.postMessage({ type: 'set-lfo', payload: { index: 1, field: 'depth',   value: 0.1 } });
  worklet.port.postMessage({ type: 'set-lfo', payload: { index: 1, field: 'enabled', value: true } });
}

async function createPlaitsTrack(ctx: AudioContext, wasmBytes: ArrayBuffer): Promise<void> {
  const worklet = await createTrackWorklet(ctx, PLAITS_TRACK_ID, 'plaits-processor', wasmBytes);

  // Defaults — Harmonics/Timbre/Morph/Decay, Virtual Analog engine (index 8)
  worklet.port.postMessage({ type: 'set-param', payload: { param: 0, value: 0.5 } });
  worklet.port.postMessage({ type: 'set-param', payload: { param: 1, value: 0.5 } });
  worklet.port.postMessage({ type: 'set-param', payload: { param: 2, value: 0.5 } });
  worklet.port.postMessage({ type: 'set-param', payload: { param: 3, value: 0.5 } });
  worklet.port.postMessage({ type: 'set-model', payload: { model: 8 } });
}

// Fixed engine + sensible defaults per drum voice. Each is its own tiny Plaits
// instance (same WASM binary, reused from the melodic track's already-compiled
// module) locked to one drum engine — no model/tone picker exposed in v1, this
// is meant to be a simple kit, not a 3rd full synth voice.
const DRUM_VOICE_CONFIG: Record<DrumVoiceId, { engine: number; note: number; decay: number }> = {
  drumKick:  { engine: 21, note: 36, decay: 0.5 },
  drumSnare: { engine: 22, note: 51, decay: 0.45 },
  drumHihat: { engine: 23, note: 60, decay: 0.25 },
};

async function createDrumTrack(ctx: AudioContext, id: DrumVoiceId, wasmBytes: ArrayBuffer): Promise<void> {
  const worklet = await createTrackWorklet(ctx, id, 'plaits-processor', wasmBytes);
  const cfg = DRUM_VOICE_CONFIG[id];

  // For Plaits' drum engines specifically (bass_drum/snare_drum/hi_hat), the
  // underlying DSP (analog_bass_drum.h, analog_snare_drum.h, hi_hat.h) all share
  // the same param mapping, confirmed directly in their Render() signatures:
  //   param 0 (harmonics) = drive/snappy/noisiness (secondary character, not exposed)
  //   param 1 (timbre)    = "tone" — a bandpass/lowpass filter cutoff
  //   param 2 (morph)     = "decay" — the actual envelope decay time
  // patch.decay (param 3) does NOT affect these engines — Voice bypasses its own
  // envelope for "already_enveloped" engines (see voice.cc RegisterInstance calls).
  worklet.port.postMessage({ type: 'set-param', payload: { param: 0, value: 0.5 } });        // harmonics (unexposed)
  worklet.port.postMessage({ type: 'set-param', payload: { param: 1, value: 0.5 } });        // timbre ("Tone")
  worklet.port.postMessage({ type: 'set-param', payload: { param: 2, value: cfg.decay } });  // morph ("Decay")
  worklet.port.postMessage({ type: 'set-model', payload: { model: cfg.engine } });
  worklet.port.postMessage({ type: 'set-note', payload: { note: cfg.note } });
}

// ── initAudio ─────────────────────────────────────────────────────────────
export async function initAudio(ctx: AudioContext): Promise<void> {
  audioCtx = ctx;
  await audioCtx.resume();

  await audioCtx.audioWorklet.addModule('/rings-processor.js');
  await audioCtx.audioWorklet.addModule('/plaits-processor.js');
  await audioCtx.audioWorklet.addModule('/clouds-processor.js');

  // Master bus
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1.0;
  masterGain.connect(audioCtx.destination);

  preDelay = audioCtx.createDelay(0.15);
  preDelay.delayTime.value = 0.02;

  toneFilter = audioCtx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 6000;

  wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.5;
  wetGain.connect(masterGain);

  reverbBusInput = audioCtx.createGain();
  reverbBusInput.gain.value = 1.0;
  reverbBusInput.connect(preDelay);
  preDelay.connect(toneFilter);
  swapReverb(getAlgoUnit(audioCtx, currentDecay));

  delayNode = audioCtx.createDelay(2.0);
  delayNode.delayTime.value = (60 / 72) / 2; // 1/8 at 72 BPM

  delayFeedbackGain = audioCtx.createGain();
  delayFeedbackGain.gain.value = 0.16;

  delayFeedbackFilter = audioCtx.createBiquadFilter();
  delayFeedbackFilter.type = 'lowpass';
  delayFeedbackFilter.frequency.value = 2800;

  delayMixGain = audioCtx.createGain();
  delayMixGain.gain.value = 0.2;

  delayBusInput = audioCtx.createGain();
  delayBusInput.gain.value = 1.0;
  delayBusInput.connect(delayNode);
  delayNode.connect(delayFeedbackGain);
  delayFeedbackGain.connect(delayFeedbackFilter);
  delayFeedbackFilter.connect(delayNode);
  delayNode.connect(delayMixGain);
  delayMixGain.connect(masterGain);

  // Clouds granular effect — an insert on its own send bus (like delay/reverb,
  // NOT tapped from masterGain's output, which would create an audio feedback
  // loop). cloudsBusInput sums each track's cloudsSend (a fixed-level tap,
  // wired in createTrackWorklet); cloudsNode is a real audio-input worklet
  // (unlike Rings/Plaits/drums, which are self-contained voices with no
  // input) that granulates whatever's fed into it; cloudsWetGain is its
  // return level ("Mix"), same role as wetGain/delayMixGain above.
  cloudsBusInput = audioCtx.createGain();
  cloudsBusInput.gain.value = 1.0;

  const cloudsBytes  = await fetch('/clouds.wasm').then(r => r.arrayBuffer());
  const cloudsModule = await WebAssembly.compile(cloudsBytes);

  cloudsNode = new AudioWorkletNode(audioCtx, 'clouds-processor', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
  });
  cloudsNode.port.postMessage({ type: 'load-wasm', payload: { wasmModule: cloudsModule } });
  await new Promise<void>((resolve, reject) => {
    cloudsNode!.port.onmessage = (e) => {
      if (e.data.type === 'ready') resolve();
      if (e.data.type === 'error') reject(new Error(e.data.message));
    };
  });

  cloudsWetGain = audioCtx.createGain();
  cloudsWetGain.gain.value = 0.5;
  cloudsBusInput.connect(cloudsNode);
  cloudsNode.connect(cloudsWetGain);
  cloudsWetGain.connect(masterGain);

  // Defaults — position/size/pitch/density/texture/dry_wet/stereo_spread/
  // feedback/reverb (see clouds_wrapper.cpp's clouds_set_param comment for
  // the param index mapping). dry_wet=1 (fully wet) since the dry path
  // already reaches masterGain via each track's own dryGain — this send is
  // purely the granulated texture layered on top, not a dry/wet blend within
  // itself (the "Mix" knob below controls how much of that layer is audible).
  setCloudsParam(0, 0.5);  // position
  setCloudsParam(1, 0.5);  // size
  setCloudsParam(2, 0.0);  // pitch (semitones)
  setCloudsParam(3, 0.65); // density (away from the 0.47-0.53 dead zone)
  setCloudsParam(4, 0.5);  // texture
  setCloudsParam(5, 1.0);  // dry_wet
  setCloudsParam(6, 0.0);  // stereo_spread
  setCloudsParam(7, 0.0);  // feedback
  setCloudsParam(8, 0.25); // reverb

  // Stereo metering — split master bus into L/R analysers
  const splitter = audioCtx.createChannelSplitter(2);
  masterGain.connect(splitter);
  analyserL = audioCtx.createAnalyser();
  analyserR = audioCtx.createAnalyser();
  analyserL.fftSize = 1024;
  analyserR.fftSize = 1024;
  analyserL.smoothingTimeConstant = 0;
  analyserR.smoothingTimeConstant = 0;
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);

  // Rings tracks — fetch bytes once, each worklet compiles its own instance
  const ringsBytes = await fetch('/rings.wasm').then(r => r.arrayBuffer());
  for (const id of RINGS_TRACK_IDS) {
    await createRingsTrack(audioCtx, id, ringsBytes);
  }

  // Plaits track + drum voices — same bytes reused for all 4 worklets
  const plaitsBytes = await fetch('/plaits.wasm').then(r => r.arrayBuffer());
  await createPlaitsTrack(audioCtx, plaitsBytes);
  for (const id of DRUM_VOICE_IDS) {
    await createDrumTrack(audioCtx, id, plaitsBytes);
  }

  isReady = true;
}

// ── Generic per-track controls (any track type) ────────────────────────────
// midiNote is omitted for drum voices — each has a fixed note set once at creation.
// velocity (0-1, default 1) scales the worklet's output for this hit — currently
// only sent for drum voices; melodic tracks never pass it, so it's a no-op there.
export function triggerNote(trackId: TrackId, midiNote?: number, velocity?: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'trigger', payload: { note: midiNote, velocity } });
}

export function setTrackSend(trackId: TrackId, kind: 'delay' | 'reverb' | 'clouds', value: number): void {
  const t = tracks.get(trackId);
  if (!t) return;
  const node = kind === 'delay' ? t.delaySend : kind === 'reverb' ? t.reverbSend : t.cloudsSend;
  node.gain.value = value;
}

export function setTrackVolume(trackId: TrackId, value: number): void {
  const t = tracks.get(trackId);
  if (!t) return;
  t.dryGain.gain.value = Math.max(0, Math.min(1.5, value));
}

// ── Rings-specific controls ─────────────────────────────────────────────────
export function setRingsParam(trackId: RingsTrackId, param: number, value: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-param', payload: { param, value } });
}

export function setRingsModel(trackId: RingsTrackId, model: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-model', payload: { model } });
}

export function setLFOEnabled(trackId: RingsTrackId, i: number, enabled: boolean): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'enabled', value: enabled } });
}
export function setLFOWave(trackId: RingsTrackId, i: number, wave: string): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'wave', value: wave } });
}
export function setLFORate(trackId: RingsTrackId, i: number, rate: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'rate', value: rate } });
}
export function setLFODepth(trackId: RingsTrackId, i: number, depth: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'depth', value: depth } });
}

// ── Plaits-specific controls (single track, no trackId needed) ────────────
// param: 0=harmonics 1=timbre 2=morph 3=decay
export function setPlaitsParam(param: number, value: number): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-param', payload: { param, value } });
}

export function setPlaitsModel(engine: number): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-model', payload: { model: engine } });
}

// ── Drum voice controls ────────────────────────────────────────────────────
// IMPORTANT: the param mapping here is DIFFERENT from melodic Plaits. For the
// drum engines (bass_drum/snare_drum/hi_hat), patch.decay (param 3) is unused —
// Voice bypasses its own envelope for them. Their actual decay is param 2 (morph),
// and "tone" is param 1 (timbre) — confirmed in their DSP source (see
// createDrumTrack's comment above). Each drum voice is its own Plaits instance
// with independent patch state.
export function setDrumParam(voiceId: DrumVoiceId, param: number, value: number): void {
  const t = tracks.get(voiceId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-param', payload: { param, value } });
}

// ── Master reverb ────────────────────────────────────────────────────────
export async function setReverbType(name: string): Promise<void> {
  if (!audioCtx) return;
  currentIRName = name;
  let newUnit: ReverbUnit;
  if (name === 'algo') {
    newUnit = getAlgoUnit(audioCtx, currentDecay);
  } else {
    const full    = await loadIR(audioCtx, name);
    const trimmed = applyDecay(full, audioCtx, currentDecay);
    newUnit = makeConvolverUnit(audioCtx, trimmed);
  }
  swapReverb(newUnit);
}

export async function setReverbDecay(value: number): Promise<void> {
  currentDecay = value;
  if (!audioCtx) return;
  if (currentIRName === 'algo') {
    swapReverb(getAlgoUnit(audioCtx, value));
    return;
  }
  const full = irCache.get(currentIRName);
  if (!full) return;
  swapReverb(makeConvolverUnit(audioCtx, applyDecay(full, audioCtx, value)));
}

export function setReverbPreDelay(seconds: number): void {
  if (!preDelay) return;
  preDelay.delayTime.value = seconds;
}

export function setReverbTone(hz: number): void {
  if (!toneFilter) return;
  toneFilter.frequency.value = hz;
}

export function setReverbWet(value: number): void {
  if (!wetGain) return;
  wetGain.gain.value = value;
}

// ── Master delay ──────────────────────────────────────────────────────────
export function setDelayTime(seconds: number): void {
  if (!delayNode) return;
  delayNode.delayTime.value = Math.min(Math.max(seconds, 0.01), 2.0);
}
export function setDelayFeedback(value: number): void {
  if (!delayFeedbackGain) return;
  delayFeedbackGain.gain.value = Math.min(value, 0.92);
}
export function setDelayMix(value: number): void {
  if (!delayMixGain) return;
  delayMixGain.gain.value = value;
}
export function setDelayFilter(hz: number): void {
  if (!delayFeedbackFilter) return;
  delayFeedbackFilter.frequency.value = hz;
}

// ── Master Clouds granular effect ──────────────────────────────────────────
// param: 0=position 1=size 2=pitch(semitones) 3=density 4=texture 5=dry_wet
// 6=stereo_spread 7=feedback 8=reverb — see clouds_wrapper.cpp for details.
// dry_wet is fixed at 1.0 (see initAudio) — use setCloudsWet for the
// master-bus-facing "how much of this layer is audible" control instead.
export function setCloudsParam(param: number, value: number): void {
  cloudsNode?.port.postMessage({ type: 'set-param', payload: { param, value } });
}

export function setCloudsFreeze(on: boolean): void {
  cloudsNode?.port.postMessage({ type: 'set-freeze', payload: { on } });
}

// mode: 0=granular 1=stretch 2=looping delay 3=spectral (spectral is
// compiled in but UNTESTED — see AGENTS.md caveat before wiring it into the UI).
export function setCloudsPlaybackMode(mode: number): void {
  cloudsNode?.port.postMessage({ type: 'set-playback-mode', payload: { mode } });
}

export function setCloudsWet(value: number): void {
  if (!cloudsWetGain) return;
  cloudsWetGain.gain.value = value;
}

export function isAudioReady(): boolean { return isReady; }
