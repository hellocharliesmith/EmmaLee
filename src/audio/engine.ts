import * as Tone from 'tone';

export type RingsTrackId = 'ringsA' | 'ringsB';
export const RINGS_TRACK_IDS: RingsTrackId[] = ['ringsA', 'ringsB'];

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
let masterGain: GainNode | null = null;
let analyserL: AnalyserNode | null = null;
let analyserR: AnalyserNode | null = null;

const dspLoadByTrack = new Map<RingsTrackId, number>();

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

// ── Rings track ──────────────────────────────────────────────────────────
interface RingsTrackNodes {
  worklet: AudioWorkletNode;
  dryGain: GainNode;
  delaySend: GainNode;
  reverbSend: GainNode;
}
const ringsTracks = new Map<RingsTrackId, RingsTrackNodes>();

async function createRingsTrack(ctx: AudioContext, id: RingsTrackId, wasmModule: WebAssembly.Module): Promise<void> {
  const worklet = new AudioWorkletNode(ctx, 'rings-processor', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
  });

  worklet.port.postMessage({ type: 'load-wasm', payload: { wasmModule } });
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

  worklet.connect(dryGain);     dryGain.connect(masterGain!);
  worklet.connect(delaySend);   delaySend.connect(delayBusInput!);
  worklet.connect(reverbSend);  reverbSend.connect(reverbBusInput!);

  ringsTracks.set(id, { worklet, dryGain, delaySend, reverbSend });

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

// ── initAudio ─────────────────────────────────────────────────────────────
export async function initAudio(ctx: AudioContext): Promise<void> {
  audioCtx = ctx;
  await audioCtx.resume();
  Tone.setContext(audioCtx);
  await Tone.start();

  await audioCtx.audioWorklet.addModule('/rings-processor.js');

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

  // Rings tracks — compile WASM once, instantiate per track
  const wasmBytes  = await fetch('/rings.wasm').then(r => r.arrayBuffer());
  const wasmModule = await WebAssembly.compile(wasmBytes);
  for (const id of RINGS_TRACK_IDS) {
    await createRingsTrack(audioCtx, id, wasmModule);
  }

  isReady = true;
}

// ── Per-track controls ────────────────────────────────────────────────────
export function setRingsParam(trackId: RingsTrackId, param: number, value: number): void {
  const t = ringsTracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-param', payload: { param, value } });
}

export function setRingsModel(trackId: RingsTrackId, model: number): void {
  const t = ringsTracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-model', payload: { model } });
}

export function triggerNote(trackId: RingsTrackId, midiNote: number): void {
  const t = ringsTracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'trigger', payload: { note: midiNote } });
}

export function setLFOEnabled(trackId: RingsTrackId, i: number, enabled: boolean): void {
  const t = ringsTracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'enabled', value: enabled } });
}
export function setLFOWave(trackId: RingsTrackId, i: number, wave: string): void {
  const t = ringsTracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'wave', value: wave } });
}
export function setLFORate(trackId: RingsTrackId, i: number, rate: number): void {
  const t = ringsTracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'rate', value: rate } });
}
export function setLFODepth(trackId: RingsTrackId, i: number, depth: number): void {
  const t = ringsTracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'depth', value: depth } });
}

export function setTrackSend(trackId: RingsTrackId, kind: 'delay' | 'reverb', value: number): void {
  const t = ringsTracks.get(trackId);
  if (!t) return;
  (kind === 'delay' ? t.delaySend : t.reverbSend).gain.value = value;
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

export function isAudioReady(): boolean { return isReady; }
