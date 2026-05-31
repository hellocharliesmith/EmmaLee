import * as Tone from 'tone';

let audioCtx: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let wetGain: GainNode | null = null;
let dryGain: GainNode | null = null;
let convolver: ConvolverNode | null = null;
let preDelay: DelayNode | null = null;
let toneFilter: BiquadFilterNode | null = null;
let delayNode: DelayNode | null = null;
let delayFeedbackGain: GainNode | null = null;
let delayFeedbackFilter: BiquadFilterNode | null = null;
let delayMixGain: GainNode | null = null;
// Tape effect nodes
let tapeSaturation: WaveShaperNode | null = null;
let wowGain: GainNode | null = null;
let flutterGain: GainNode | null = null;
let tapeNoiseGain: GainNode | null = null;
let isReady = false;

// ── Tape helper functions ──────────────────────────────────────────────────

function makePinkNoise(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
    b6 = w * 0.115926;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
  }
  return buf;
}

function makeSoftClipCurve(): Float32Array<ArrayBuffer> {
  const n = 512;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = Math.tanh(3);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * 3) / k;
  }
  return curve;
}

function makeLinearCurve(): Float32Array<ArrayBuffer> {
  const n = 512;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) curve[i] = (i * 2) / n - 1;
  return curve;
}

// Cache original full-length IR buffers so decay can re-trim without re-fetching
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

// Trim an IR buffer to a fraction of its length with a smooth fade at the tail
function applyDecay(buffer: AudioBuffer, ctx: AudioContext, decay: number): AudioBuffer {
  const targetLength = Math.max(256, Math.floor(buffer.length * decay));
  const result = ctx.createBuffer(buffer.numberOfChannels, targetLength, buffer.sampleRate);
  const fadeStart = Math.floor(targetLength * 0.8);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = result.getChannelData(c);
    for (let i = 0; i < targetLength; i++) {
      const fade = i >= fadeStart
        ? 1 - (i - fadeStart) / (targetLength - fadeStart)
        : 1;
      dst[i] = (src[i] ?? 0) * fade;
    }
  }
  return result;
}

export async function initAudio(ctx: AudioContext): Promise<void> {
  audioCtx = ctx;
  await audioCtx.resume();

  Tone.setContext(audioCtx);
  await Tone.start();

  await audioCtx.audioWorklet.addModule('/rings-processor.js');

  workletNode = new AudioWorkletNode(audioCtx, 'rings-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });

  const wasmBytes = await fetch('/rings.wasm').then(r => r.arrayBuffer());
  const wasmModule = await WebAssembly.compile(wasmBytes);
  workletNode.port.postMessage({ type: 'load-wasm', payload: { wasmModule } });

  await new Promise<void>((resolve, reject) => {
    workletNode!.port.onmessage = (e) => {
      if (e.data.type === 'ready') resolve();
      if (e.data.type === 'error') reject(new Error(e.data.message));
    };
  });

  // Build reverb graph:
  // workletNode → preDelay → toneFilter → convolver → wetGain → destination
  // workletNode → dryGain → destination

  const irBuffer = await loadIR(audioCtx, 'plate');

  convolver = audioCtx.createConvolver();
  convolver.buffer = irBuffer;

  preDelay = audioCtx.createDelay(0.15);
  preDelay.delayTime.value = 0.02; // 20ms default

  toneFilter = audioCtx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 6000; // neutral-ish default

  wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.45;

  dryGain = audioCtx.createGain();
  dryGain.gain.value = 0.7;

  // Reverb chain: workletNode → preDelay → toneFilter → convolver → wetGain → destination
  workletNode.connect(preDelay);
  preDelay.connect(toneFilter);
  toneFilter.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(audioCtx.destination);

  // Dry chain
  workletNode.connect(dryGain);
  dryGain.connect(audioCtx.destination);

  // Delay chain (parallel to reverb):
  // workletNode → delayNode → delayMixGain → destination
  //               delayNode → feedbackGain → feedbackFilter → delayNode (loop)
  delayNode = audioCtx.createDelay(2.0);
  delayNode.delayTime.value = 60 / 72 / 2; // 1/8 note at 72 BPM default

  delayFeedbackGain = audioCtx.createGain();
  delayFeedbackGain.gain.value = 0.35;

  delayFeedbackFilter = audioCtx.createBiquadFilter();
  delayFeedbackFilter.type = 'lowpass';
  delayFeedbackFilter.frequency.value = 3500; // tape warmth

  delayMixGain = audioCtx.createGain();
  delayMixGain.gain.value = 0.0; // off by default

  // Tape saturation — always in feedback path, linear curve = bypass
  tapeSaturation = audioCtx.createWaveShaper();
  tapeSaturation.curve = makeLinearCurve();
  tapeSaturation.oversample = '2x';

  // Feedback loop: delay → gain → filter → saturation → delay
  delayNode.connect(delayFeedbackGain);
  delayFeedbackGain.connect(delayFeedbackFilter);
  delayFeedbackFilter.connect(tapeSaturation);
  tapeSaturation.connect(delayNode);

  // Delay output → mix → destination
  delayNode.connect(delayMixGain);
  delayMixGain.connect(audioCtx.destination);

  // Worklet → delay input
  workletNode.connect(delayNode);

  // ── Wow & flutter — LFOs modulating delay time (depth = 0 until tape on) ──
  const wowOsc = audioCtx.createOscillator();
  wowOsc.type = 'sine';
  wowOsc.frequency.value = 0.4;
  wowGain = audioCtx.createGain();
  wowGain.gain.value = 0;
  wowOsc.connect(wowGain);
  wowGain.connect(delayNode.delayTime);
  wowOsc.start();

  const flutterOsc = audioCtx.createOscillator();
  flutterOsc.type = 'sine';
  flutterOsc.frequency.value = 9;
  flutterGain = audioCtx.createGain();
  flutterGain.gain.value = 0;
  flutterOsc.connect(flutterGain);
  flutterGain.connect(delayNode.delayTime);
  flutterOsc.start();

  // ── Tape noise — pink noise, bandpass filtered, off until tape on ──
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = makePinkNoise(audioCtx);
  noiseSource.loop = true;
  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 2800;
  noiseFilter.Q.value = 0.7;
  tapeNoiseGain = audioCtx.createGain();
  tapeNoiseGain.gain.value = 0;
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(tapeNoiseGain);
  tapeNoiseGain.connect(audioCtx.destination);
  noiseSource.start();

  isReady = true;
}

let currentIRName = 'plate';
let currentDecay = 1.0;

export async function setReverbType(name: string): Promise<void> {
  if (!audioCtx || !workletNode || !convolver || !wetGain || !preDelay || !toneFilter) return;
  currentIRName = name;
  const fullBuffer = await loadIR(audioCtx, name);
  const trimmed = applyDecay(fullBuffer, audioCtx, currentDecay);
  const newConvolver = audioCtx.createConvolver();
  newConvolver.buffer = trimmed;

  toneFilter.disconnect(convolver);
  convolver.disconnect();
  toneFilter.connect(newConvolver);
  newConvolver.connect(wetGain);
  convolver = newConvolver;
}

export async function setReverbDecay(value: number): Promise<void> {
  // value: 0.05–1.0
  if (!audioCtx || !convolver || !wetGain || !toneFilter) return;
  currentDecay = value;
  const fullBuffer = irCache.get(currentIRName);
  if (!fullBuffer) return;
  const trimmed = applyDecay(fullBuffer, audioCtx, value);
  const newConvolver = audioCtx.createConvolver();
  newConvolver.buffer = trimmed;
  toneFilter.disconnect(convolver);
  convolver.disconnect();
  toneFilter.connect(newConvolver);
  newConvolver.connect(wetGain);
  convolver = newConvolver;
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
  if (!wetGain || !dryGain) return;
  wetGain.gain.value = value;
  dryGain.gain.value = Math.max(0, 1 - value * 0.5);
}

export function triggerNote(midiNote: number): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'trigger', payload: { note: midiNote } });
}

export function setRingsParam(param: number, value: number): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-param', payload: { param, value } });
}

export function setRingsModel(model: number): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-model', payload: { model } });
}

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

export function setTapeMode(enabled: boolean): void {
  if (!tapeSaturation || !wowGain || !flutterGain || !tapeNoiseGain) return;
  if (enabled) {
    wowGain.gain.value = 0.0018;      // 1.8ms wow depth — subtle pitch drift
    flutterGain.gain.value = 0.0003;  // 0.3ms flutter depth — faster, lighter
    tapeNoiseGain.gain.value = 0.007; // soft hiss
    tapeSaturation.curve = makeSoftClipCurve();
  } else {
    wowGain.gain.value = 0;
    flutterGain.gain.value = 0;
    tapeNoiseGain.gain.value = 0;
    tapeSaturation.curve = makeLinearCurve();
  }
}

export function setDelayFilter(hz: number): void {
  if (!delayFeedbackFilter) return;
  delayFeedbackFilter.frequency.value = hz;
}

export function isAudioReady(): boolean {
  return isReady;
}
