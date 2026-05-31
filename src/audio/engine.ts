import * as Tone from 'tone';

let audioCtx: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let wetGain: GainNode | null = null;
let dryGain: GainNode | null = null;
let preDelay: DelayNode | null = null;
let toneFilter: BiquadFilterNode | null = null;
let delayNode: DelayNode | null = null;
let delayFeedbackGain: GainNode | null = null;
let delayFeedbackFilter: BiquadFilterNode | null = null;
let delayMixGain: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let dspLoad = 0;
let isReady = false;

export function getAnalyser(): AnalyserNode | null { return analyser; }
export function getDSPLoad(): number { return dspLoad; }

// ── Reverb unit abstraction ───────────────────────────────────────────────
interface ReverbUnit { input: AudioNode; output: AudioNode; }
let reverbUnit: ReverbUnit | null = null;
let currentIRName = 'plate';
let currentDecay  = 1.0;
let synthPlateFeedbacks: GainNode[] = []; // for live decay control on algo

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
// Schroeder comb filter network, plate-tuned delay times.
// No IR file — very low CPU vs ConvolverNode.
function buildSynthPlate(ctx: AudioContext): ReverbUnit {
  synthPlateFeedbacks = [];
  const input  = ctx.createGain();
  const output = ctx.createGain();

  // Plate delay times (seconds) — short, dense, characteristic metallic plate
  const delays = [0.0253, 0.0269, 0.0290, 0.0307, 0.0322, 0.0347, 0.0366, 0.0386];
  const fbAmt  = 0.80;
  const dampHz = 3500;

  delays.forEach((t, i) => {
    const delay = ctx.createDelay(t + 0.005);
    delay.delayTime.value = t + (i % 2 === 0 ? 0 : 0.00052); // slight stereo spread

    const fb = ctx.createGain();
    fb.gain.value = fbAmt;
    synthPlateFeedbacks.push(fb);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = dampHz;

    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay); // feedback loop

    input.connect(delay);
    delay.connect(output);
  });

  return { input, output };
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

// ── LFO — now lives in AudioWorklet, main thread just sends config ────────
// baseParams kept here so initAudio can set defaults before worklet is ready
const baseParams = [0.3, 0.5, 0.5, 0.25];

// ── initAudio ─────────────────────────────────────────────────────────────
export async function initAudio(ctx: AudioContext): Promise<void> {
  audioCtx = ctx;
  await audioCtx.resume();
  Tone.setContext(audioCtx);
  await Tone.start();

  await audioCtx.audioWorklet.addModule('/rings-processor.js');

  workletNode = new AudioWorkletNode(audioCtx, 'rings-processor', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
  });

  const wasmBytes  = await fetch('/rings.wasm').then(r => r.arrayBuffer());
  const wasmModule = await WebAssembly.compile(wasmBytes);
  workletNode.port.postMessage({ type: 'load-wasm', payload: { wasmModule } });

  await new Promise<void>((resolve, reject) => {
    workletNode!.port.onmessage = (e) => {
      if (e.data.type === 'ready') resolve();
      if (e.data.type === 'error') reject(new Error(e.data.message));
    };
  });

  // Persistent handler for ongoing messages (perf reports, etc.)
  workletNode.port.onmessage = (e) => {
    if (e.data.type === 'perf') dspLoad = e.data.load;
  };

  // Reverb chain: workletNode → preDelay → toneFilter → [reverb unit] → wetGain → destination
  preDelay = audioCtx.createDelay(0.15);
  preDelay.delayTime.value = 0.02;

  toneFilter = audioCtx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 6000;

  wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.45;

  dryGain = audioCtx.createGain();
  dryGain.gain.value = 0.7;

  workletNode.connect(preDelay);
  preDelay.connect(toneFilter);
  workletNode.connect(dryGain);
  dryGain.connect(audioCtx.destination);
  wetGain.connect(audioCtx.destination);

  // Default reverb — plate IR
  const irBuffer = await loadIR(audioCtx, 'plate');
  swapReverb(makeConvolverUnit(audioCtx, irBuffer));

  // Delay chain
  delayNode = audioCtx.createDelay(2.0);
  delayNode.delayTime.value = 60 / 72 / 2;

  delayFeedbackGain = audioCtx.createGain();
  delayFeedbackGain.gain.value = 0.35;

  delayFeedbackFilter = audioCtx.createBiquadFilter();
  delayFeedbackFilter.type = 'lowpass';
  delayFeedbackFilter.frequency.value = 3500;

  delayMixGain = audioCtx.createGain();
  delayMixGain.gain.value = 0.0;

  delayNode.connect(delayFeedbackGain);
  delayFeedbackGain.connect(delayFeedbackFilter);
  delayFeedbackFilter.connect(delayNode);
  delayNode.connect(delayMixGain);
  delayMixGain.connect(audioCtx.destination);
  workletNode.connect(delayNode);

  // Metering — AnalyserNode taps all output buses (zero audio impact)
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0; // raw per-frame data for scrolling history
  wetGain.connect(analyser);
  dryGain.connect(analyser);
  delayMixGain.connect(analyser);

  isReady = true;
}

// ── Rings params — forward to worklet, worklet manages LFO centre values ──
export function setRingsParam(param: number, value: number): void {
  baseParams[param] = value;
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-param', payload: { param, value } });
}

export function setRingsModel(model: number): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-model', payload: { model } });
}

export function triggerNote(midiNote: number): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'trigger', payload: { note: midiNote } });
}

// ── LFO — config forwarded to AudioWorklet ────────────────────────────────
export function setLFOEnabled(i: number, enabled: boolean): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'enabled', value: enabled } });
}
export function setLFOWave(i: number, wave: string): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'wave', value: wave } });
}
export function setLFORate(i: number, rate: number): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'rate', value: rate } });
}
export function setLFODepth(i: number, depth: number): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'depth', value: depth } });
}

// ── Reverb ────────────────────────────────────────────────────────────────
export async function setReverbType(name: string): Promise<void> {
  if (!audioCtx) return;
  currentIRName = name;
  let newUnit: ReverbUnit;
  if (name === 'algo') {
    newUnit = buildSynthPlate(audioCtx);
  } else {
    const full    = await loadIR(audioCtx, name);
    const trimmed = applyDecay(full, audioCtx, currentDecay);
    newUnit = makeConvolverUnit(audioCtx, trimmed);
  }
  swapReverb(newUnit);
}

export async function setReverbDecay(value: number): Promise<void> {
  currentDecay = value;
  if (currentIRName === 'algo') {
    // Map decay (0.05–1) → plate feedback (0.55–0.91)
    const fb = 0.55 + value * 0.36;
    synthPlateFeedbacks.forEach(g => { g.gain.value = fb; });
    return;
  }
  if (!audioCtx) return;
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
  if (!wetGain || !dryGain) return;
  wetGain.gain.value = value;
  dryGain.gain.value = Math.max(0, 1 - value * 0.5);
}

// ── Delay ─────────────────────────────────────────────────────────────────
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
