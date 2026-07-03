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
    this.maxChunk  = 512; // frames headroom for the downsampled per-block chunk

    this.ctxRate    = sampleRate; // AudioWorkletGlobalScope global
    this.downSample = new LinearResampler(this.ctxRate / CLOUDS_RATE); // ctx -> 32k
    this.upSample   = new LinearResampler(CLOUDS_RATE / this.ctxRate); // 32k -> ctx

    // Output FIFO (context-rate samples) — the upsampler doesn't produce
    // exactly `renderQuantum` samples every block, so we queue its output and
    // pop exactly what's needed each process() call.
    this.outQueueL = [];
    this.outQueueR = [];

    this._setParam  = null;
    this._setMode   = null;
    this._setFreeze = null;
    this._setQuality = null;
    this._process   = null;

    this.port.onmessage = async (e) => {
      const { type, payload } = e.data;
      switch (type) {
        case 'load-wasm':
          await this._init(payload.wasmModule);
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

  async _init(wasmModule) {
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

      const instance = await WebAssembly.instantiate(wasmModule, imports);
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

    if (!this.instance) {
      left.fill(0);
      right.fill(0);
      return true;
    }

    const input = inputs[0];
    const inL = (input && input[0]) ? input[0] : new Float32Array(n);
    const inR = (input && input[1]) ? input[1] : inL;

    // 1) Downsample this block to 32kHz.
    const down = this.downSample.process(inL, inR, n);
    const chunk = Math.min(down.L.length, this.maxChunk);

    // 2) Run through the WASM granular engine.
    if (chunk > 0) {
      const heap = this.heapF32;
      const inBase = this.inPtr / 4;
      for (let i = 0; i < chunk; i++) {
        heap[inBase + i * 2]     = down.L[i];
        heap[inBase + i * 2 + 1] = down.R[i];
      }
      this._process(this.inPtr, this.outPtr, chunk);

      // 3) Upsample the result back to context rate and queue it.
      const outBase = this.outPtr / 4;
      const wasmOutL = new Array(chunk);
      const wasmOutR = new Array(chunk);
      for (let i = 0; i < chunk; i++) {
        wasmOutL[i] = heap[outBase + i * 2];
        wasmOutR[i] = heap[outBase + i * 2 + 1];
      }
      const up = this.upSample.process(wasmOutL, wasmOutR, chunk);
      for (let i = 0; i < up.L.length; i++) {
        this.outQueueL.push(up.L[i]);
        this.outQueueR.push(up.R[i]);
      }
    }

    // 4) Pop exactly n samples for this block (pad with silence if the queue
    // hasn't caught up yet, e.g. right after load).
    for (let i = 0; i < n; i++) {
      left[i]  = this.outQueueL.length ? this.outQueueL.shift() : 0;
      right[i] = this.outQueueR.length ? this.outQueueR.shift() : 0;
    }

    return true;
  }
}

registerProcessor('clouds-processor', CloudsProcessor);
