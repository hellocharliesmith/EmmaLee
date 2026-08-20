
export type RingsTrackId = 'ringsA' | 'ringsB';
export type PlaitsTrackId = 'plaits';
// Drum voices use Plaits' own drum engines (bass_drum/snare_drum/hi_hat — indices
// 21/22/23 in hardware registration order, see voice.cc) via 3 independent worklets
// so they can overlap on the same step, unlike the monophonic melodic tracks.
export type DrumVoiceId = 'drumHihat' | 'drumSnare' | 'drumKick';
export type JunoTrackId = 'juno';
export type TrackId = RingsTrackId | PlaitsTrackId | DrumVoiceId | JunoTrackId;
export const RINGS_TRACK_IDS: RingsTrackId[] = ['ringsA', 'ringsB'];
export const PLAITS_TRACK_ID: PlaitsTrackId = 'plaits';
// Order matches the drum grid's row order (top to bottom) — row index === StepData note value.
export const DRUM_VOICE_IDS: DrumVoiceId[] = ['drumHihat', 'drumSnare', 'drumKick'];
export const JUNO_TRACK_ID: JunoTrackId = 'juno';
export const ALL_TRACK_IDS: TrackId[] = [...RINGS_TRACK_IDS, PLAITS_TRACK_ID, ...DRUM_VOICE_IDS, JUNO_TRACK_ID];

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
let cloudsReverbSend: GainNode | null = null; // clouds output -> reverbBusInput, own amount
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
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    let b6: number; // assigned each iteration before first read
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
    // disconnect() throws if the connection doesn't exist — that's fine here,
    // we only care that it's gone.
    try { toneFilter.disconnect(reverbUnit.input); } catch { /* not connected */ }
    try { reverbUnit.output.disconnect(wetGain!); } catch { /* not connected */ }
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
// wasmBytes is omitted for pure-JS processors (currently just juno-processor.js) — those
// have nothing to load asynchronously, so they post 'ready' synchronously from their own
// constructor instead of waiting for a 'load-wasm' message.
async function createTrackWorklet(ctx: AudioContext, id: TrackId, processorName: string, wasmBytes?: ArrayBuffer): Promise<AudioWorkletNode> {
  const worklet = new AudioWorkletNode(ctx, processorName, {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
  });

  if (wasmBytes) worklet.port.postMessage({ type: 'load-wasm', payload: { wasmBytes } });
  await new Promise<void>((resolve, reject) => {
    worklet.port.onmessage = (e) => {
      if (e.data.type === 'ready') resolve();
      if (e.data.type === 'error') reject(new Error(e.data.message));
    };
  });
  worklet.port.onmessage = (e) => {
    if (e.data.type === 'perf') dspLoadByTrack.set(id, e.data.load);
  };
  // An uncaught exception inside process() permanently unloads the processor
  // — without this handler that failure mode is completely silent (this is
  // exactly how the Clouds µ-law crash went unnoticed; see clouds-processor.js).
  worklet.onprocessorerror = () => {
    console.error(`[engine] ${id} worklet processor crashed — this track is now silent until reload`);
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

async function createRingsTrack(ctx: AudioContext, id: RingsTrackId, wasmBytes: ArrayBuffer, exciterWasmBytes: ArrayBuffer): Promise<void> {
  const worklet = await createTrackWorklet(ctx, id, 'rings-processor', wasmBytes);

  // Defaults — Structure/Brightness/Damping/Position, Strings model
  worklet.port.postMessage({ type: 'set-param', payload: { param: 0, value: 0.11 } });
  worklet.port.postMessage({ type: 'set-param', payload: { param: 1, value: 0.24 } });
  worklet.port.postMessage({ type: 'set-param', payload: { param: 2, value: 0.44 } });
  worklet.port.postMessage({ type: 'set-param', payload: { param: 3, value: 0.25 } });
  worklet.port.postMessage({ type: 'set-model', payload: { model: 1 } });

  // Exciter — a second, independent WASM instance loaded into this same
  // worklet (see rings-processor.js's top-of-file note). Defaults to off
  // (Rings' own internal burst keeps working exactly as before) until
  // setExciterModel is called. Registered via addEventListener rather than
  // overwriting worklet.port.onmessage, so it doesn't disturb
  // createTrackWorklet's own perf-metering handler.
  worklet.port.postMessage({ type: 'load-exciter-wasm', payload: { wasmBytes: exciterWasmBytes } });
  await new Promise<void>((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      if (e.data.type === 'exciter-ready') { worklet.port.removeEventListener('message', handler); resolve(); }
      if (e.data.type === 'exciter-error') { worklet.port.removeEventListener('message', handler); reject(new Error(e.data.message)); }
    };
    worklet.port.addEventListener('message', handler);
  });

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
  // LPG Colour (param 4) — no longer exposed as a control (it read as a toggle
  // in practice, not a useful continuous knob); pinned to 1.0, the full/"darker"
  // lowpass-gate character, rather than the lighter/more-VCA-like end at 0.
  worklet.port.postMessage({ type: 'set-param', payload: { param: 4, value: 1.0 } });
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
  //   param 0 (harmonics) = drive/snappy/noisiness (secondary character, "Character" knob)
  //   param 1 (timbre)    = "tone" — a bandpass/lowpass filter cutoff
  //   param 2 (morph)     = "decay" — the actual envelope decay time
  // patch.decay (param 3) does NOT affect these engines — Voice bypasses its own
  // envelope for "already_enveloped" engines (see voice.cc RegisterInstance calls).
  worklet.port.postMessage({ type: 'set-param', payload: { param: 0, value: 0.5 } });        // harmonics ("Character")
  worklet.port.postMessage({ type: 'set-param', payload: { param: 1, value: 0.5 } });        // timbre ("Tone")
  worklet.port.postMessage({ type: 'set-param', payload: { param: 2, value: cfg.decay } });  // morph ("Decay")
  worklet.port.postMessage({ type: 'set-model', payload: { model: cfg.engine } });
  worklet.port.postMessage({ type: 'set-note', payload: { note: cfg.note } });
  // Analog/synthetic blend (see setDrumBlend below) — default 0 (pure analog,
  // today's sound). Sent explicitly (not just relying on the worklet's own
  // internal default) so `plaits-processor.js`'s "was a blend message ever
  // received" gate flips on for every drum voice at creation time, same as
  // every other drum param above.
  worklet.port.postMessage({ type: 'set-drum-blend', payload: { value: 0 } });
}

// Shape of a Junox patch — matches junox.js's `patch` object exactly (see
// public/juno-processor.js) so `setJunoParam`'s dot-paths and `setJunoPatch`'s
// whole-object replace both go straight through with zero translation layer.
export interface JunoPatch {
  name: string;
  vca: number;
  vcaType: 'env' | 'gate';
  lfo: { autoTrigger: boolean; frequency: number; delay: number };
  dco: { range: number; saw: boolean; pulse: boolean; sub: boolean; subAmount: number; noise: number; pwm: number; pwmMod: 'l' | 'e' | 'm'; lfo: number };
  hpf: number;
  vcf: { frequency: number; resonance: number; modPositive: boolean; envMod: number; lfoMod: number; keyMod: number };
  env: { attack: number; decay: number; sustain: number; release: number };
  chorus: number;
}

// Matches JUNO60_PRESETS[0] ("Strings 1") in presets.ts — see that file's
// comment for why this is duplicated rather than imported (same convention
// as createPlaitsTrack/createDrumTrack's own inline defaults).
const DEFAULT_JUNO_PATCH: JunoPatch = {
  name: 'Strings 1', vca: 0.5, vcaType: 'env',
  lfo: { autoTrigger: true, frequency: 0.6, delay: 0 },
  dco: { range: 1, saw: true, pulse: false, sub: false, subAmount: 0, noise: 0, pwm: 0, pwmMod: 'l', lfo: 0 },
  hpf: 0,
  vcf: { frequency: 0.7, resonance: 0, modPositive: true, envMod: 0, lfoMod: 0, keyMod: 1 },
  env: { attack: 0.4, decay: 0, sustain: 1, release: 0.45 },
  chorus: 1,
};

async function createJunoTrack(ctx: AudioContext, patch: JunoPatch = DEFAULT_JUNO_PATCH): Promise<void> {
  // No WASM — see createTrackWorklet's wasmBytes comment.
  const worklet = await createTrackWorklet(ctx, JUNO_TRACK_ID, 'juno-processor');
  worklet.port.postMessage({ type: 'set-patch', payload: { patch } });
}

// ── initAudio ─────────────────────────────────────────────────────────────
export async function initAudio(ctx: AudioContext): Promise<void> {
  audioCtx = ctx;
  await audioCtx.resume();

  await audioCtx.audioWorklet.addModule('/rings-processor.js');
  await audioCtx.audioWorklet.addModule('/plaits-processor.js');
  await audioCtx.audioWorklet.addModule('/clouds-processor.js');
  await audioCtx.audioWorklet.addModule('/juno-processor.js');

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

  // Raw bytes, compiled inside the worklet — same Chrome workaround as
  // Rings/Plaits (a compiled Module silently hangs WebAssembly.instantiate
  // when passed across the postMessage boundary).
  const cloudsBytes = await fetch('/clouds.wasm').then(r => r.arrayBuffer());

  cloudsNode = new AudioWorkletNode(audioCtx, 'clouds-processor', {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
  });
  cloudsNode.port.postMessage({ type: 'load-wasm', payload: { wasmBytes: cloudsBytes } });
  await new Promise<void>((resolve, reject) => {
    cloudsNode!.port.onmessage = (e) => {
      if (e.data.type === 'ready') resolve();
      if (e.data.type === 'error') reject(new Error(e.data.message));
    };
  });
  // After the ready handshake, keep listening: the worklet reports WASM traps
  // caught inside process() (it degrades to silence rather than letting the
  // exception unload the processor — see clouds-processor.js).
  cloudsNode.port.onmessage = (e) => {
    if (e.data.type === 'process-error') {
      console.error(`[engine] Clouds DSP crashed and is bypassed until reload: ${e.data.message}`);
    }
  };
  cloudsNode.onprocessorerror = () => {
    console.error('[engine] Clouds worklet processor crashed — texture bus is now silent until reload');
  };

  cloudsWetGain = audioCtx.createGain();
  cloudsWetGain.gain.value = 0.5;
  cloudsBusInput.connect(cloudsNode);
  cloudsNode.connect(cloudsWetGain);
  cloudsWetGain.connect(masterGain);

  // Texture -> Reverb: an additional tap off Clouds' own output (not the Mix-
  // scaled cloudsWetGain, so this send works independently of how loud the
  // direct texture return is) feeding into the same reverbBusInput every
  // track's reverbSend already sums into. Off by default (0) — opt-in extra
  // "chain" character, not part of the base signal path.
  cloudsReverbSend = audioCtx.createGain();
  cloudsReverbSend.gain.value = 0.0;
  cloudsNode.connect(cloudsReverbSend);
  cloudsReverbSend.connect(reverbBusInput!);

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
  setCloudsQuality(2);     // manual's 3rd quality option: 16kHz 8-bit mu-law, stereo

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

  // Rings tracks — fetch bytes once, each worklet compiles its own instance.
  // exciterBytes too: the Elements-derived exciter module (Mallet/Plectrum/
  // Particles/Flow/Noise) each Rings track can optionally use instead of its
  // own internal burst — see rings-processor.js / AGENTS.md "Rings exciter".
  const ringsBytes   = await fetch('/rings.wasm').then(r => r.arrayBuffer());
  const exciterBytes = await fetch('/exciter.wasm').then(r => r.arrayBuffer());
  for (const id of RINGS_TRACK_IDS) {
    await createRingsTrack(audioCtx, id, ringsBytes, exciterBytes);
  }

  // Plaits track + drum voices — same bytes reused for all 4 worklets
  const plaitsBytes = await fetch('/plaits.wasm').then(r => r.arrayBuffer());
  await createPlaitsTrack(audioCtx, plaitsBytes);
  for (const id of DRUM_VOICE_IDS) {
    await createDrumTrack(audioCtx, id, plaitsBytes);
  }

  // Juno track — no WASM to fetch, see createJunoTrack.
  await createJunoTrack(audioCtx);

  isReady = true;
}

// ── Voice-trigger events ────────────────────────────────────────────────────
// Fired synchronously from triggerNote(), which is itself always called from
// inside a Tone.getDraw().schedule() callback — so subscribers already get
// audio-visual-synced timing for free, the same mechanism the sequencer grid
// uses to light up the currently-playing step. Consumed by VoiceTabViz for
// the per-tab firefly-scatter activity indicator.
export interface VoiceEvent { trackId: TrackId; pitch: number; velocity: number; }
const voiceListeners = new Set<(e: VoiceEvent) => void>();
export function onVoiceTrigger(cb: (e: VoiceEvent) => void): () => void {
  voiceListeners.add(cb);
  return () => voiceListeners.delete(cb);
}

// ── Generic per-track controls (any track type) ────────────────────────────
// midiNote is omitted for drum voices — each has a fixed note set once at creation.
// velocity (0-1, default 1) scales the worklet's output for this hit — currently
// only sent for drum voices; melodic tracks never pass it, so it's a no-op there.
export function triggerNote(trackId: TrackId, midiNote?: number, velocity?: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'trigger', payload: { note: midiNote, velocity } });

  const pitch = midiNote ?? (DRUM_VOICE_CONFIG as Record<string, { note: number }>)[trackId]?.note ?? 60;
  const event: VoiceEvent = { trackId, pitch, velocity: velocity ?? 1 };
  for (const cb of voiceListeners) cb(event);
}

// ── Juno track controls — real note-on/note-off (unlike triggerNote's
// fire-and-forget one-shot), since Junox is genuinely polyphonic with its
// own gate/envelope release. See useSequencer.ts's Tone.Loop for how the
// sequencer schedules the matching junoNoteOff after a note's gate length.
export function junoNoteOn(midiNote: number, velocity?: number): void {
  const t = tracks.get(JUNO_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'note-on', payload: { note: midiNote, velocity } });

  const event: VoiceEvent = { trackId: JUNO_TRACK_ID, pitch: midiNote, velocity: velocity ?? 1 };
  for (const cb of voiceListeners) cb(event);
}
export function junoNoteOff(midiNote: number): void {
  const t = tracks.get(JUNO_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'note-off', payload: { note: midiNote } });
}
export function junoAllNotesOff(): void {
  const t = tracks.get(JUNO_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'all-notes-off' });
}
export function setJunoPatch(patch: JunoPatch): void {
  const t = tracks.get(JUNO_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-patch', payload: { patch } });
}
// path is one of Junox's own dot-paths into its patch object (e.g.
// 'vcf.frequency', 'env.attack', 'dco.noise', 'hpf', 'chorus') — forwarded
// as-is, see junox.js's setValue().
export function setJunoParam(path: string, value: number): void {
  const t = tracks.get(JUNO_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-param', payload: { path, value } });
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

// ── Rings exciter — feeds Rings' real IN port instead of its own internal
// burst (see rings-processor.js / AGENTS.md "Rings exciter"). 'internal' is
// the default and keeps today's behavior exactly; the other 5 are Elements'
// Mallet/Plectrum/Particles/Flow/Noise, each a WASM module loaded alongside
// Rings in the same worklet.
export type ExciterModel = 'internal' | 'mallet' | 'plectrum' | 'particles' | 'flow' | 'noise';
const EXCITER_MODEL_INDEX: Record<Exclude<ExciterModel, 'internal'>, number> = {
  mallet: 0, plectrum: 1, particles: 2, flow: 3, noise: 4,
};

export function setExciterModel(trackId: RingsTrackId, model: ExciterModel): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  const index = model === 'internal' ? -1 : EXCITER_MODEL_INDEX[model];
  t.worklet.port.postMessage({ type: 'set-exciter-model', payload: { model: index } });
}

// field: 'timbre' = filter cutoff (all models). 'parameter' = per-model
// meaning — Mallet/Particles=decay, Plectrum=pick delay, Flow=noise amount,
// Noise=filter resonance (see exciter_slim.cc).
export function setExciterParam(trackId: RingsTrackId, field: 'timbre' | 'parameter', value: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-exciter-param', payload: { field, value } });
}

// Synthesizes a held-gate window per trigger (Particles/Flow need a gate to
// sustain, Mallet/Plectrum/Noise mostly ignore its length) — the practical
// stand-in for real note-off tracking, which this sequencer doesn't have.
export function setExciterGateMs(trackId: RingsTrackId, ms: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-exciter-gate-ms', payload: { ms } });
}

// 0-2 (0%-200%), default 1.0. Mallet/Plectrum/Particles' sparse impulses read
// much quieter than Flow/Noise's continuous signal at the same flat gain —
// this lets each track push its exciter's level independently instead of
// being stuck at one compromise value tuned for Noise's hot resonance.
export function setExciterLevel(trackId: RingsTrackId, level: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-exciter-level', payload: { level } });
}

// ms, 0-500, default 0 (instant, today's original behavior). Fades the
// excitation signal in linearly on each trigger — a true swell for Flow/
// Noise's continuous output. Mallet/Plectrum are one-sample impulses, so this
// mostly softens/mutes their click rather than "delaying" it.
export function setExciterAttackMs(trackId: RingsTrackId, ms: number): void {
  const t = tracks.get(trackId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-exciter-attack-ms', payload: { ms } });
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

// Plaits LFOs — same 4-slot system as Rings' (index matches param: 0=harmonics
// 1=timbre 2=morph 3=decay), added to plaits-processor.js alongside it.
export function setPlaitsLFOEnabled(i: number, enabled: boolean): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'enabled', value: enabled } });
}
export function setPlaitsLFOWave(i: number, wave: string): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'wave', value: wave } });
}
export function setPlaitsLFORate(i: number, rate: number): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'rate', value: rate } });
}
export function setPlaitsLFODepth(i: number, depth: number): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-lfo', payload: { index: i, field: 'depth', value: depth } });
}

// Envelope (added 2026-07-12, see AGENTS.md "Plaits envelope") — drives
// Plaits' real LEVEL input instead of its fixed pitch-tied "ping" envelope.
// ms, 0-3000, default 0 (instant, today's original behavior).
export function setPlaitsEnvelopeAttackMs(ms: number): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-envelope-attack-ms', payload: { ms } });
}

// 0-1, default 0 (decays fully to silence, today's behavior). At 1, the note
// swells in and holds indefinitely — a sustained drone, until the next trigger.
export function setPlaitsEnvelopeSustain(value: number): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-envelope-sustain', payload: { value } });
}

// Filter (added 2026-08-17, see AGENTS.md "Plaits Filter") — a real
// subtractive lowpass, independent of the LPG's own envelope-driven tone
// shaping (that's what the Attack/Sustain envelope above already controls —
// the "VCA" half of a VCA+Filter ask). Disabled by default; enabling it is
// what makes Cutoff/Resonance actually audible.
export function setPlaitsFilterEnabled(enabled: boolean): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-filter-enabled', payload: { enabled } });
}

// 0-1, exponential ~20Hz-~20kHz mapping (see voice.cc).
export function setPlaitsFilterCutoff(value: number): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-filter-cutoff', payload: { value } });
}

// 0-1, 0 = gentle/no resonance, 1 = near self-oscillating.
export function setPlaitsFilterResonance(value: number): void {
  const t = tracks.get(PLAITS_TRACK_ID);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-filter-resonance', payload: { value } });
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

// Analog/synthetic blend (added 2026-08-17) — Plaits' drum engines compute two
// independent models per Render() call: an "analog" 808-style model (written
// to `out`) and a "synthetic" 909-ish model (written to `aux`), see
// synthetic_bass_drum.h/synthetic_snare_drum.h. plaits-processor.js normally
// just routes out->left/aux->right (a hard-panned stereo pair, unchanged for
// the melodic Plaits track); for drum voices this instead crossfades the two
// into a single centered signal: 0 = pure analog (today's `out`, on both
// channels), 1 = pure synthetic (`aux`, on both channels). Only ever called
// for DrumVoiceId tracks — the melodic track never receives this message, so
// its worklet instance keeps behaving byte-identically to before this existed.
export function setDrumBlend(voiceId: DrumVoiceId, value: number): void {
  const t = tracks.get(voiceId);
  if (!t || !isReady) return;
  t.worklet.port.postMessage({ type: 'set-drum-blend', payload: { value } });
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

// quality: bit0 = mono (vs stereo), bit1 = low-fidelity 8-bit mu-law (vs
// 16-bit) — matches GranularProcessor::set_quality()'s bit layout (see
// clouds_wrapper.cpp). 0=16-bit stereo 1=16-bit mono 2=8-bit stereo 3=8-bit mono.
export function setCloudsQuality(quality: number): void {
  cloudsNode?.port.postMessage({ type: 'set-quality', payload: { quality } });
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

// Amount of Clouds' own output fed into the shared reverb bus, independent of
// the Mix knob above (see cloudsReverbSend's setup comment in initAudio).
export function setCloudsReverbSend(value: number): void {
  if (!cloudsReverbSend) return;
  cloudsReverbSend.gain.value = value;
}

export function isAudioReady(): boolean { return isReady; }
