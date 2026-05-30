import * as Tone from 'tone';

let audioCtx: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let wetGain: GainNode | null = null;
let dryGain: GainNode | null = null;
let convolver: ConvolverNode | null = null;
let isReady = false;

async function loadIR(ctx: AudioContext, name: string): Promise<AudioBuffer> {
  const arrayBuffer = await fetch(`/ir/${name}.wav`).then(r => r.arrayBuffer());
  return new Promise((resolve, reject) => {
    ctx.decodeAudioData(arrayBuffer, resolve, reject);
  });
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

  // Load default IR (plate)
  const irBuffer = await loadIR(audioCtx, 'plate');
  convolver = audioCtx.createConvolver();
  convolver.buffer = irBuffer;

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
}

export async function setReverbType(name: string): Promise<void> {
  if (!audioCtx || !workletNode || !convolver || !wetGain) return;

  const irBuffer = await loadIR(audioCtx, name);
  const newConvolver = audioCtx.createConvolver();
  newConvolver.buffer = irBuffer;

  // Swap convolvers seamlessly
  workletNode.disconnect(convolver);
  convolver.disconnect();
  workletNode.connect(newConvolver);
  newConvolver.connect(wetGain);

  convolver = newConvolver;
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
