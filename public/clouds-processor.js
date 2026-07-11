// AudioWorklet processor for the Clouds granular master-bus effect — runs on
// the audio thread. Unlike rings-processor.js/plaits-processor.js, this node
// has a real audio INPUT (numberOfInputs: 1) — it's an insert effect fed by
// the master bus's pre-mix send (see engine.ts's cloudsBusInput), not a
// self-contained voice.
//
// Sample-rate mismatch: Clouds' own DSP (rings-dsp/clouds_wrapper.cpp,
// wrapping rings-source/clouds/dsp/granular_processor.cc) is hardcoded to
// assume 32kHz internally — confirmed via the original firmware's
// clouds.cc/clouds_test.cc. This AudioContext normally runs at 44.1 or 48kHz.
// Feeding samples through unchanged would make grain durations, the pitch
// shifter, and the built-in reverb all run at the wrong speed (off by
// ctxRate/32000, e.g. 1.5x too fast at 48kHz). CLOUDS_RATE below plus the
// LinearResampler class handle this: every block is downsampled to 32kHz
// before clouds_process(), and the result upsampled back to the context rate
// before being written to output. Linear interpolation only (not a proper
// windowed-sinc resampler) — adequate for a texture/granular effect, not
// meant to be transparent.

const CLOUDS_RATE = 32000;

// GranularProcessor::Process() MUST be called with exactly-32-frame blocks
// (clouds/dsp/frame.h kMaxBlockSize — the firmware only ever calls it with
// 32). The 16-bit modes happen to tolerate ragged sizes, but the 8-bit µ-law
// modes run the audio through a fixed 2:1 SampleRateConverter that traps
// ("memory access out of bounds") on any other size — which permanently
// killed this worklet on its first block whenever a µ-law quality was
// active. The input FIFO below exists to honor that contract: downsampled
// audio is queued and only ever handed to the WASM in whole 32-frame blocks.
const WASM_BLOCK = 32;

// Continuous linear resampler: `ratio` = input samples advanced per output
// sample (>1 shrinks/downsamples, <1 grows/upsamples). Keeps fractional phase
// AND the last sample of the previous call across process() invocations so
// there's no click/discontinuity at block boundaries.
class LinearResampler {
  constructor(ratio) {
    this.ratio = ratio;
    this.phase = 0;
    this.prevL = 0;
    this.prevR = 0;
  }
  // inL/inR: plain arrays or typed arrays, length n. Returns { L, R } plain
  // arrays of resampled length (varies call to call by design).
  process(inL, inR, n) {
    const outL = [];
    const outR = [];
    while (this.phase < n) {
      const i0 = Math.floor(this.phase);
      const frac = this.phase - i0;
      const l0 = i0 === 0 ? this.prevL : inL[i0 - 1];
      const r0 = i0 === 0 ? this.prevR : inR[i0 - 1];
      const l1 = inL[i0];
      const r1 = inR[i0];
      outL.push(l0 + (l1 - l0) * frac);
      outR.push(r0 + (r1 - r0) * frac);
      this.phase += this.ratio;
    }
    this.phase -= n;
    if (n > 0) {
      this.prevL = inL[n - 1];
      this.prevR = inR[n - 1];
    }
    return { L: outL, R: outR };
  }
}

class CloudsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.instance  = null;
    this.inPtr     = null;
    this.outPtr    = null;
    this.heapF32   = null;
    this.maxChunk  = 512; // malloc headroom; actual WASM calls are always WASM_BLOCK frames

    this.ctxRate    = sampleRate; // AudioWorkletGlobalScope global
    this.downSample = new LinearResampler(this.ctxRate / CLOUDS_RATE); // ctx -> 32k
    this.upSample   = new LinearResampler(CLOUDS_RATE / this.ctxRate); // 32k -> ctx

    // Input FIFO (32kHz samples) — feeds the WASM in exact WASM_BLOCK-frame
    // blocks, see the comment on WASM_BLOCK above.
    this.inQueueL = [];
    this.inQueueR = [];

    // Output FIFO (context-rate samples) — the resamplers don't produce
    // exactly `renderQuantum` samples every block, so we queue their output
    // and pop exactly what's needed each process() call.
    this.outQueueL = [];
    this.outQueueR = [];

    // Set when the WASM traps — we bypass to silence instead of throwing,
    // which would make the browser permanently unload this processor.
    this.dead = false;

    this._setParam  = null;
    this._setMode   = null;
    this._setFreeze = null;
    this._setQuality = null;
    this._process   = null;

    this.port.onmessage = async (e) => {
      const { type, payload } = e.data;
      switch (type) {
        case 'load-wasm':
          await this._init(payload.wasmBytes);
          break;
        case 'set-param':
          this._setParam?.(payload.param, payload.value);
          break;
        case 'set-freeze':
          this._setFreeze?.(payload.on ? 1 : 0);
          break;
        case 'set-playback-mode':
          this._setMode?.(payload.mode);
          break;
        case 'set-quality':
          this._setQuality?.(payload.quality);
          break;
      }
    };
  }

  async _init(wasmBytes) {
    try {
      let memRef = null;
      const imports = {
        a: {
          a: (requestedSize) => {
            if (!memRef) return 0;
            const needed = Math.ceil((requestedSize - memRef.buffer.byteLength) / 65536);
            if (needed > 0) {
              try { memRef.grow(needed); return 1; } catch { return 0; }
            }
            return 1;
          },
        },
      };

      // Compile from raw bytes INSIDE the worklet, not a Module passed in via
      // postMessage — Chrome silently hangs instantiating a Module across that
      // boundary (see rings-processor.js/plaits-processor.js for the same fix).
      const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
      this.instance = instance;
      memRef = instance.exports.b;

      // Clouds' global GranularProcessor (and its Reverb/Diffuser/PitchShifter
      // members) needs C++ static initializers run before use, unlike the
      // Rings/Plaits builds — see AGENTS.md "Clouds granular effect".
      instance.exports.c();

      // d=init e=set_param f=set_playback_mode g=set_freeze h=set_quality
      // i=process j=malloc k=free b=memory (see build-clouds-wasm.sh output)
      this._setParam   = instance.exports.e;
      this._setMode    = instance.exports.f;
      this._setFreeze  = instance.exports.g;
      this._setQuality = instance.exports.h;
      this._process    = instance.exports.i;

      instance.exports.d(CLOUDS_RATE); // clouds_init -- arg is vestigial, see clouds_wrapper.cpp

      this.inPtr  = instance.exports.j(this.maxChunk * 2 * 4);
      this.outPtr = instance.exports.j(this.maxChunk * 2 * 4);
      this.heapF32 = new Float32Array(instance.exports.b.buffer);

      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const left  = output[0];
    const right = output[1] || output[0];
    const n = left.length;

    if (!this.instance || this.dead) {
      left.fill(0);
      right.fill(0);
      return true;
    }

    const input = inputs[0];
    const inL = (input && input[0]) ? input[0] : new Float32Array(n);
    const inR = (input && input[1]) ? input[1] : inL;

    try {
      // 1) Downsample this block to 32kHz and queue it.
      const down = this.downSample.process(inL, inR, n);
      for (let i = 0; i < down.L.length; i++) {
        this.inQueueL.push(down.L[i]);
        this.inQueueR.push(down.R[i]);
      }

      // 2) Feed the WASM granular engine in exact WASM_BLOCK-frame blocks
      // (its hard contract — see WASM_BLOCK's comment), upsampling each
      // block's result back to context rate as it's produced (the upsampler
      // carries phase across calls, so per-block calls don't click).
      const heap = this.heapF32;
      const inBase = this.inPtr / 4;
      const outBase = this.outPtr / 4;
      const wasmOutL = new Array(WASM_BLOCK);
      const wasmOutR = new Array(WASM_BLOCK);
      while (this.inQueueL.length >= WASM_BLOCK) {
        for (let i = 0; i < WASM_BLOCK; i++) {
          heap[inBase + i * 2]     = this.inQueueL.shift();
          heap[inBase + i * 2 + 1] = this.inQueueR.shift();
        }
        this._process(this.inPtr, this.outPtr, WASM_BLOCK);
        for (let i = 0; i < WASM_BLOCK; i++) {
          wasmOutL[i] = heap[outBase + i * 2];
          wasmOutR[i] = heap[outBase + i * 2 + 1];
        }
        const up = this.upSample.process(wasmOutL, wasmOutR, WASM_BLOCK);
        for (let i = 0; i < up.L.length; i++) {
          this.outQueueL.push(up.L[i]);
          this.outQueueR.push(up.R[i]);
        }
      }
    } catch (err) {
      // A WASM trap here would otherwise propagate out of process() and make
      // the browser permanently unload the processor — silently, since
      // nothing on the main thread was watching. Report it and degrade to
      // outputting silence instead.
      this.dead = true;
      this.port.postMessage({ type: 'process-error', message: String(err) });
    }

    // 3) Pop exactly n samples for this block (pad with silence if the queue
    // hasn't caught up yet, e.g. right after load).
    for (let i = 0; i < n; i++) {
      left[i]  = this.outQueueL.length ? this.outQueueL.shift() : 0;
      right[i] = this.outQueueR.length ? this.outQueueR.shift() : 0;
    }

    return true;
  }
}

registerProcessor('clouds-processor', CloudsProcessor);
