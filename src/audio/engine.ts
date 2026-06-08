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
let masterGain: GainNode | null = null;
let analyserL: AnalyserNode | null = null;
let analyserR: AnalyserNode | null = null;
let dspLoad = 0;
let isReady = false;

export function getAnalysers(): [AnalyserNode | null, AnalyserNode | null] { return [analyserL, analyserR]; }
export function getDSPLoad(): number { return dspLoad; }

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
// Algorithmic reverb: ConvolverNode with a generated pink noise IR.
// ConvolverNode is inherently stable — no feedback possible.
// Pink noise spectrum is more natural than white noise for reverb.
function buildAlgoIR(ctx: AudioContext, decayRate = 2.5): AudioBuffer {
  const duration = 2.0; // seconds
  const len = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  const predelaySamples = Math.floor(ctx.sampleRate * 0.01); // 10ms pre-delay

  for (let c = 0; c < 2; c++) {
    const d = buffer.getChannelData(c);
    // Pink noise generator (Voss-McCartney algorithm)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    // Slightly different coefficients per channel for stereo width
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
  // Flip so slider right = longer tail (matches other reverb types)
  // decay 0 → rate 4 (tight), decay 1 → rate 1 (lush 4s tail)
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

// ── LFO — now lives in AudioWorklet, main thread just sends config ────────
// baseParams kept here so initAudio can set defaults before worklet is ready
const baseParams = [0.11, 0.24, 0.44, 0.25];

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
  wetGain.gain.value = 0.5;

  dryGain = audioCtx.createGain();
  dryGain.gain.value = 0.75;

  // Master bus — all audio flows through here
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1.0;
  masterGain.connect(audioCtx.destination);

  workletNode.connect(preDelay);
  preDelay.connect(toneFilter);
  workletNode.connect(dryGain);
  dryGain.connect(masterGain);
  wetGain.connect(masterGain);

  // Default reverb — algo (no IR loading on init, faster startup)
  swapReverb(getAlgoUnit(audioCtx, currentDecay));

  // Delay chain
  delayNode = audioCtx.createDelay(2.0);
  delayNode.delayTime.value = (60 / 72) / 2; // 1/8 at 72 BPM

  delayFeedbackGain = audioCtx.createGain();
  delayFeedbackGain.gain.value = 0.16;

  delayFeedbackFilter = audioCtx.createBiquadFilter();
  delayFeedbackFilter.type = 'lowpass';
  delayFeedbackFilter.frequency.value = 2800;

  delayMixGain = audioCtx.createGain();
  delayMixGain.gain.value = 0.2;

  delayNode.connect(delayFeedbackGain);
  delayFeedbackGain.connect(delayFeedbackFilter);
  delayFeedbackFilter.connect(delayNode);
  delayNode.connect(delayMixGain);
  delayMixGain.connect(masterGain);
  workletNode.connect(delayNode);

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

  isReady = true;

  // Default Rings params
  workletNode!.port.postMessage({ type: 'set-param', payload: { param: 0, value: 0.11 } }); // Structure
  workletNode!.port.postMessage({ type: 'set-param', payload: { param: 1, value: 0.24 } }); // Brightness
  workletNode!.port.postMessage({ type: 'set-param', payload: { param: 2, value: 0.44 } }); // Damping
  workletNode!.port.postMessage({ type: 'set-param', payload: { param: 3, value: 0.25 } }); // Position
  workletNode!.port.postMessage({ type: 'set-model', payload: { model: 1 } });               // Strings

  // Default LFO: Brightness (index 1) — smooth random, on
  workletNode!.port.postMessage({ type: 'set-lfo', payload: { index: 1, field: 'wave',    value: 'random' } });
  workletNode!.port.postMessage({ type: 'set-lfo', payload: { index: 1, field: 'rate',    value: 1.6 } });
  workletNode!.port.postMessage({ type: 'set-lfo', payload: { index: 1, field: 'depth',   value: 0.1 } });
  workletNode!.port.postMessage({ type: 'set-lfo', payload: { index: 1, field: 'enabled', value: true } });
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
export function setRingsReverbEnabled(enabled: boolean, restoreWet = 0.5): void {
  if (!workletNode) return;
  workletNode.port.postMessage({ type: 'rings-reverb-enable', payload: { enabled } });

  // setTargetAtTime is more reliable than ramp — no cancel/hold edge cases
  const tau = 0.025; // 25ms time constant, smooth but fast
  if (wetGain) {
    const ctx = wetGain.context as AudioContext;
    const t = ctx.currentTime;
    wetGain.gain.cancelScheduledValues(t);
    wetGain.gain.setValueAtTime(wetGain.gain.value, t); // anchor current value
    wetGain.gain.setTargetAtTime(enabled ? 0 : restoreWet, t, tau);
  }
  if (dryGain) {
    const ctx = dryGain.context as AudioContext;
    const t = ctx.currentTime;
    const dryTarget = enabled ? 1 : Math.max(0, 1 - restoreWet * 0.5);
    dryGain.gain.cancelScheduledValues(t);
    dryGain.gain.setValueAtTime(dryGain.gain.value, t);
    dryGain.gain.setTargetAtTime(dryTarget, t, tau);
  }
}

// Emergency restore — call if audio disappears unexpectedly
export function restoreGains(wet = 0.5): void {
  if (wetGain) wetGain.gain.value = wet;
  if (dryGain) dryGain.gain.value = Math.max(0, 1 - wet * 0.5);
  if (masterGain) masterGain.gain.value = 1;
  if (workletNode) workletNode.port.postMessage({ type: 'rings-reverb-enable', payload: { enabled: false } });
}

export function setRingsReverbParams(amount: number, time: number, lp: number): void {
  if (!workletNode) return;
  workletNode.port.postMessage({ type: 'rings-reverb-set', payload: { amount, time, lp } });
}

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
    // Regenerate the algo IR with new decay — swap in smoothly
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
