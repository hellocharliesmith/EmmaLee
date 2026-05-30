import * as Tone from 'tone';

let audioCtx: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let wetGain: GainNode | null = null;
let dryGain: GainNode | null = null;
let convolver: ConvolverNode | null = null;
let preDelay: DelayNode | null = null;
let toneFilter: BiquadFilterNode | null = null;
let isReady = false;

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

  // Wet chain
  workletNode.connect(preDelay);
  preDelay.connect(toneFilter);
  toneFilter.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(audioCtx.destination);

  // Dry chain
  workletNode.connect(dryGain);
  dryGain.connect(audioCtx.destination);

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

export function isAudioReady(): boolean {
  return isReady;
}
