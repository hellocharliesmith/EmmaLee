import * as Tone from 'tone';

let audioCtx: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let wetGain: GainNode | null = null;
let dryGain: GainNode | null = null;
let isReady = false;

function buildReverbIR(ctx: AudioContext, decaySeconds = 3): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * decaySeconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
  }
  return ir;
}

export async function initAudio(ctx: AudioContext): Promise<void> {
  console.log('[emma] initAudio start, ctx.state:', ctx.state);
  audioCtx = ctx;
  await audioCtx.resume();
  console.log('[emma] ctx resumed, state:', audioCtx.state);

  Tone.setContext(audioCtx);
  await Tone.start();
  console.log('[emma] Tone.start done');

  await audioCtx.audioWorklet.addModule('/rings-processor.js');
  console.log('[emma] worklet module loaded');

  workletNode = new AudioWorkletNode(audioCtx, 'rings-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  console.log('[emma] worklet node created');

  const wasmBytes = await fetch('/rings.wasm').then(r => r.arrayBuffer());
  console.log('[emma] wasm fetched, bytes:', wasmBytes.byteLength);
  const wasmModule = await WebAssembly.compile(wasmBytes);
  console.log('[emma] wasm compiled');

  workletNode.port.postMessage({ type: 'load-wasm', payload: { wasmModule } });
  console.log('[emma] wasm sent to worklet');

  await new Promise<void>((resolve, reject) => {
    workletNode!.port.onmessage = (e) => {
      console.log('[emma] worklet message:', e.data.type, e.data.message || '');
      if (e.data.type === 'ready') resolve();
      if (e.data.type === 'error') reject(new Error(e.data.message));
    };
  });
  console.log('[emma] worklet ready');

  const convolver = audioCtx.createConvolver();
  convolver.buffer = buildReverbIR(audioCtx, 3);

  wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.45;

  dryGain = audioCtx.createGain();
  dryGain.gain.value = 0.7;

  workletNode.connect(dryGain);
  workletNode.connect(convolver);
  convolver.connect(wetGain);
  dryGain.connect(audioCtx.destination);
  wetGain.connect(audioCtx.destination);

  isReady = true;
  console.log('[emma] audio graph connected, ready');
}

export function triggerNote(midiNote: number): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'trigger', payload: { note: midiNote } });
}

export function setRingsParam(param: number, value: number): void {
  if (!workletNode || !isReady) return;
  workletNode.port.postMessage({ type: 'set-param', payload: { param, value } });
}

export function setReverbWet(value: number): void {
  if (!wetGain || !dryGain) return;
  wetGain.gain.value = value;
  dryGain.gain.value = Math.max(0, 1 - value * 0.5);
}

export function isAudioReady(): boolean {
  return isReady;
}
