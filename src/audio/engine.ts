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
let isReady = false;

// ── LFO ───────────────────────────────────────────────────────────────────

// Base param values (set by sliders, used as LFO centre)
// Indices: 0=structure, 1=brightness, 2=damping, 3=position
const baseParams = [0.3, 0.5, 0.5, 0.25];

type LFOWave = 'sine' | 'random';
interface LFO {
  enabled: boolean; wave: LFOWave; rate: number; depth: number;
  phase: number;                        // sine: 0–1
  cur: number; tgt: number; prog: number; // smooth random
}

// Three LFOs: index 0→brightness(1), 1→damping(2), 2→position(3)
const LFO_PARAM = [1, 2, 3] as const;
const lfos: LFO[] = [0, 1, 2].map(() => ({
  enabled: false, wave: 'sine', rate: 0.5, depth: 0.15,
  phase: 0, cur: 0, tgt: Math.random() * 2 - 1, prog: 0,
}));

let rafId: number | null = null;
let rafLast: number | null = null;

function lfoTick(ts: number) {
  if (rafLast === null) rafLast = ts;
  const dt = Math.min((ts - rafLast) / 1000, 0.1); // cap at 100ms
  rafLast = ts;

  for (let i = 0; i < 3; i++) {
    const lfo = lfos[i];
    if (!lfo.enabled) continue;

    let sig: number;
    if (lfo.wave === 'sine') {
      lfo.phase = (lfo.phase + lfo.rate * dt) % 1;
      sig = Math.sin(lfo.phase * Math.PI * 2);
    } else {
      lfo.prog += lfo.rate * dt;
      if (lfo.prog >= 1) {
        lfo.cur = lfo.tgt;
        lfo.tgt = Math.random() * 2 - 1;
        lfo.prog = 0;
      }
      const t = (1 - Math.cos(lfo.prog * Math.PI)) / 2;
      sig = lfo.cur + (lfo.tgt - lfo.cur) * t;
    }

    const param = LFO_PARAM[i];
    const val = Math.max(0, Math.min(1, baseParams[param] + lfo.depth * sig));
    sendParam(param, val);
  }

  rafId = requestAnimationFrame(lfoTick);
}

function startRAF() {
  if (rafId !== null) return;
  rafLast = null;
  rafId = requestAnimationFrame(lfoTick);
}

function stopRAF() {
  if (lfos.some(l => l.enabled)) return;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

// Internal raw sender
function sendParam(param: number, value: number) {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-param', payload: { param, value } });
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

  // Feedback loop: delay → gain → filter → delay
  delayNode.connect(delayFeedbackGain);
  delayFeedbackGain.connect(delayFeedbackFilter);
  delayFeedbackFilter.connect(delayNode);

  // Delay output → mix → destination
  delayNode.connect(delayMixGain);
  delayMixGain.connect(audioCtx.destination);

  // Worklet → delay input
  workletNode.connect(delayNode);

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
  baseParams[param] = value;
  // Only send directly if no LFO is modulating this param
  const lfoIdx = LFO_PARAM.indexOf(param as typeof LFO_PARAM[number]);
  if (lfoIdx === -1 || !lfos[lfoIdx].enabled) sendParam(param, value);
}

export function setLFOEnabled(i: number, enabled: boolean): void {
  lfos[i].enabled = enabled;
  if (enabled) { startRAF(); }
  else { sendParam(LFO_PARAM[i], baseParams[LFO_PARAM[i]]); stopRAF(); }
}
export function setLFOWave(i: number, wave: LFOWave): void { lfos[i].wave = wave; }
export function setLFORate(i: number, rate: number): void  { lfos[i].rate = rate; }
export function setLFODepth(i: number, depth: number): void { lfos[i].depth = depth; }

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

export function setDelayFilter(hz: number): void {
  if (!delayFeedbackFilter) return;
  delayFeedbackFilter.frequency.value = hz;
}

export function isAudioReady(): boolean {
  return isReady;
}
