// AudioWorklet processor — runs on the audio thread.
// LFO runs here alongside Rings DSP: zero IPC overhead, sample-block accurate.
//
// Exciter (added 2026-07-10, see AGENTS.md "Rings exciter"): Rings' own
// internal noise burst/pulse is the only excitation source this file used
// until now. It can now instead be fed by a second, independent WASM module
// (Elements' Mallet/Plectrum/Particles/Flow/Noise, exciter.wasm) loaded and
// run right here in the same worklet — no extra AudioWorkletNode/routing
// needed, same reasoning as running the LFOs audio-thread-side above. That
// module's DSP is hardcoded to a 32kHz internal rate (elements::kSampleRate,
// same situation as Clouds — see clouds-processor.js), so its output is
// generated at a virtual 32kHz and resampled up to this context's real rate
// before being fed into rings_process as the excitation buffer.

// Continuous linear resampler — identical to clouds-processor.js's class of
// the same name (kept as its own copy here since worklet files in this app
// are standalone scripts, no shared-module mechanism between them). `ratio`
// = input samples advanced per output sample (<1 grows/upsamples, which is
// the only direction needed here — the exciter has no real input to
// downsample, it's a pure generator).
class LinearResampler {
  constructor(ratio) {
    this.ratio = ratio;
    this.phase = 0;
    this.prev = 0;
  }
  // inArr: plain array/typed array, length n (mono). Returns a plain array
  // of resampled length (varies call to call by design).
  process(inArr, n) {
    const out = [];
    while (this.phase < n) {
      const i0 = Math.floor(this.phase);
      const frac = this.phase - i0;
      const a = i0 === 0 ? this.prev : inArr[i0 - 1];
      const b = inArr[i0];
      out.push(a + (b - a) * frac);
      this.phase += this.ratio;
    }
    this.phase -= n;
    if (n > 0) this.prev = inArr[n - 1];
    return out;
  }
}

const EXCITER_RATE = 32000;
const EXCITER_CHUNK = 64; // ~2ms at 32kHz -- granularity for gate on/off timing
// Tames the exciter's raw output to something comparable in scale to Rings'
// own internal burst (roughly 0.1-0.3 peak) -- Noise in particular can swing
// past +/-8 at high resonance (a real property of a resonant SVF pushed hard,
// not a bug, see AGENTS.md), so this also gets a hard clamp after gain.
const EXCITER_GAIN = 0.15;

class RingsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // WASM state (Rings)
    this.instance   = null;
    this.outputPtr  = null;
    this.heapF32    = null; // cached — valid after init (no memory growth post-init)
    this.base       = 0;    // outputPtr >> 2, pre-computed
    this.excitationPtr  = null; // mono, malloc'd in Rings' own wasm memory
    this.excitationBase = 0;

    // Cached WASM exports (avoids property-chain lookups in process())
    this._setParam          = null;
    this._setModel          = null;
    this._setNote           = null;
    this._trigger           = null;
    this._setInternalExciter = null;
    this._reverbEnable      = null;
    this._reverbSet         = null;
    this._process           = null;

    this.pendingTrigger = false;

    // DSP load metering — no guard, performance.now() is always available in modern AudioWorklet
    this._perfSum    = 0;
    this._perfCount  = 0;
    this._budget     = 0; // ms per block, set after init
    this._windowStart = 0; // wall time at start of current measurement window

    // Base param values (set by sliders, used as LFO centre)
    // Indices: 0=structure, 1=brightness, 2=damping, 3=position
    this.baseParams = [0.3, 0.5, 0.5, 0.25];

    // Four LFOs: index 0→structure(0), 1→brightness(1), 2→damping(2), 3→position(3)
    this.lfos = [0, 1, 2, 3].map(paramIdx => ({
      enabled: false, wave: 'sine', rate: 0.5, depth: 0.15,
      paramIdx,
      phase: 0,                              // sine accumulator
      cur: 0, tgt: Math.random() * 2 - 1, prog: 0, // smooth random state
    }));

    // ── Exciter (second, independent WASM instance) ──────────────────────
    this.exciterInstance = null;
    this.exciterHeapF32  = null;
    this.exciterPtr      = null;
    this.exciterBase     = 0;
    this._exciterSetModel     = null;
    this._exciterSetTimbre    = null;
    this._exciterSetParameter = null;
    this._exciterSetGate      = null;
    this._exciterProcess      = null;

    this.exciterEnabled  = false; // false = Rings' own internal exciter (default, unchanged behavior)
    this.exciterGateMs   = 80;
    this.gateSamplesRemaining = 0; // in EXCITER-native (32kHz) samples
    this.pendingExciterGateOn = false;
    this.pendingExciterRetriggerGap = false; // see _fillExcitationQueue
    this.exciterUpsample = new LinearResampler(EXCITER_RATE / sampleRate);
    this.excitationQueue = []; // upsampled (context-rate) mono samples, ready to feed Rings

    this.port.onmessage = async (e) => {
      const { type, payload } = e.data;
      switch (type) {

        case 'load-wasm':
          await this._init(payload.wasmBytes);
          break;

        case 'load-exciter-wasm':
          await this._initExciter(payload.wasmBytes);
          break;

        case 'trigger':
          if (payload.note !== undefined && this._setNote)
            this._setNote(payload.note);
          this.pendingTrigger = true;
          if (this.exciterEnabled) this.pendingExciterGateOn = true;
          break;

        case 'set-param': {
          const { param, value } = payload;
          this.baseParams[param] = value;
          // Only pass to Rings if no LFO is currently modulating this param
          const lfo = this.lfos.find(l => l.paramIdx === param);
          if (!lfo?.enabled) this._setParam?.(param, value);
          break;
        }

        case 'set-model':
          this._setModel?.(payload.model);
          break;

        case 'rings-reverb-enable':
          this._reverbEnable?.(payload.enabled ? 1 : 0);
          break;

        case 'rings-reverb-set':
          this._reverbSet?.(payload.amount, payload.time, payload.lp);
          break;

        case 'set-lfo': {
          const { index, field, value } = payload;
          const lfo = this.lfos[index];
          if (!lfo) break;
          lfo[field] = value;
          // Restore base value when disabling
          if (field === 'enabled' && !value)
            this._setParam?.(lfo.paramIdx, this.baseParams[lfo.paramIdx]);
          break;
        }

        // model: -1/'internal' = Rings' own burst (default). 0-4 = Elements'
        // Mallet/Plectrum/Particles/Flow/Noise (see exciter_slim.h).
        case 'set-exciter-model': {
          const m = payload.model;
          this.exciterEnabled = m !== -1 && m !== null && m !== undefined;
          this._setInternalExciter?.(this.exciterEnabled ? 0 : 1);
          if (this.exciterEnabled) this._exciterSetModel?.(m);
          break;
        }

        case 'set-exciter-param': {
          const { field, value } = payload;
          if (field === 'timbre') this._exciterSetTimbre?.(value);
          else if (field === 'parameter') this._exciterSetParameter?.(value);
          break;
        }

        case 'set-exciter-gate-ms':
          this.exciterGateMs = payload.ms;
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

      const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
      this.instance = instance;
      memRef = instance.exports.b; // WebAssembly.Memory

      // d=init e=set_param f=set_model g=set_note h=trigger
      // i=set_internal_exciter j=reverb_enable k=reverb_set l=process m=malloc n=free
      // (export letters follow declaration order in rings_wrapper.cpp, NOT
      // build-wasm.sh's EXPORTED_FUNCTIONS array order — re-derive with a
      // throwaway -O1 build after any wrapper change, see that file's note.)
      this._setParam           = instance.exports.e;
      this._setModel           = instance.exports.f;
      this._setNote            = instance.exports.g;
      this._trigger            = instance.exports.h;
      this._setInternalExciter = instance.exports.i;
      this._reverbEnable       = instance.exports.j;
      this._reverbSet          = instance.exports.k;
      this._process            = instance.exports.l;

      instance.exports.d(sampleRate); // rings_init

      this.outputPtr     = instance.exports.m(128 * 2 * 4); // malloc, stereo output
      this.excitationPtr = instance.exports.m(128 * 4);      // malloc, mono excitation input
      this.base          = this.outputPtr >> 2;
      this.excitationBase = this.excitationPtr >> 2;

      // Cache heap view — safe to hold since memory doesn't grow after init
      this.heapF32 = new Float32Array(instance.exports.b.buffer);

      this._budget = (128 / sampleRate) * 1000; // ms of audio time per block
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  async _initExciter(wasmBytes) {
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

      const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
      this.exciterInstance = instance;
      memRef = instance.exports.b;

      // d=init e=set_model f=set_timbre g=set_parameter h=set_gate i=process
      // j=malloc k=free (see exciter_wrapper.cpp's note — same declaration-
      // order caveat as rings_wrapper.cpp above).
      this._exciterSetModel     = instance.exports.e;
      this._exciterSetTimbre    = instance.exports.f;
      this._exciterSetParameter = instance.exports.g;
      this._exciterSetGate      = instance.exports.h;
      this._exciterProcess      = instance.exports.i;

      instance.exports.d(); // exciter_init

      this.exciterPtr  = instance.exports.j(EXCITER_CHUNK * 4);
      this.exciterBase = this.exciterPtr >> 2;
      this.exciterHeapF32 = new Float32Array(instance.exports.b.buffer);

      this.port.postMessage({ type: 'exciter-ready' });
    } catch (err) {
      this.port.postMessage({ type: 'exciter-error', message: err.message });
    }
  }

  // Tops up excitationQueue (context-rate, mono) to at least `need` samples
  // by generating EXCITER_CHUNK-sized bursts at the virtual 32kHz rate and
  // upsampling each burst as it's produced (so the gate can flip mid-stream
  // at ~EXCITER_CHUNK granularity without waiting for a huge single call).
  _fillExcitationQueue(need) {
    const heap = this.exciterHeapF32;
    const base = this.exciterBase;
    while (this.excitationQueue.length < need) {
      this._exciterProcess(this.exciterPtr, EXCITER_CHUNK);
      const raw = new Array(EXCITER_CHUNK);
      for (let i = 0; i < EXCITER_CHUNK; i++) {
        const v = Math.max(-1, Math.min(1, heap[base + i] * EXCITER_GAIN));
        raw[i] = v;
      }
      const up = this.exciterUpsample.process(raw, EXCITER_CHUNK);
      for (let i = 0; i < up.length; i++) this.excitationQueue.push(up[i]);

      // A fast retrigger (next step's gate-on arriving before this one
      // closed) forces one silent chunk with the gate held low, so the
      // chunk right after registers a genuinely fresh rising edge instead
      // of a no-op (gate was already "on" as far as the exciter WASM's own
      // edge-tracking is concerned) — see rings-processor.js's trigger
      // handling below. Mallet/Plectrum only emit on that edge, so without
      // this, fast repeated triggers would silently drop every note after
      // the first whenever gate-ms outlasts the step interval.
      if (this.pendingExciterRetriggerGap) {
        this._exciterSetGate(1);
        this.pendingExciterRetriggerGap = false;
      } else if (this.gateSamplesRemaining > 0) {
        this.gateSamplesRemaining -= EXCITER_CHUNK;
        if (this.gateSamplesRemaining <= 0) {
          this.gateSamplesRemaining = 0;
          this._exciterSetGate(0);
        }
      }
    }
  }

  process(inputs, outputs) {
    if (!this.instance || this.outputPtr === null) return true;

    // Timing — wrapped in try/catch so a failure here can never silence audio
    let t0 = 0;
    try {
      t0 = performance.now();
      if (this._perfCount === 0) this._windowStart = t0;
    } catch {}

    const output = outputs[0];
    const left  = output[0];
    const right = output[1] || output[0];

    if (this.pendingTrigger) {
      this._trigger();
      this.pendingTrigger = false;
    }
    if (this.pendingExciterGateOn && this.exciterInstance) {
      if (this.gateSamplesRemaining > 0) {
        // Still mid-gate from a previous trigger — force a clean close/reopen
        // cycle (see _fillExcitationQueue) instead of just re-asserting an
        // already-"on" gate, which the exciter WASM would see as no edge at all.
        this._exciterSetGate(0);
        this.pendingExciterRetriggerGap = true;
      } else {
        this._exciterSetGate(1);
      }
      this.gateSamplesRemaining = Math.round(this.exciterGateMs / 1000 * EXCITER_RATE);
      this.pendingExciterGateOn = false;
    }

    // ── LFO — runs on audio thread, zero IPC, block-rate accurate ──────────
    const dt = 128 / sampleRate; // seconds per block (constant, computed once in theory)
    for (const lfo of this.lfos) {
      if (!lfo.enabled) continue;
      let sig;
      if (lfo.wave === 'sine') {
        lfo.phase = (lfo.phase + lfo.rate * dt) % 1;
        sig = Math.sin(lfo.phase * 6.283185307179586);
      } else {
        // Smooth random: cosine-interpolated targets
        lfo.prog += lfo.rate * dt;
        if (lfo.prog >= 1) {
          lfo.cur = lfo.tgt;
          lfo.tgt = Math.random() * 2 - 1;
          lfo.prog = 0;
        }
        const t = (1 - Math.cos(lfo.prog * 3.141592653589793)) * 0.5;
        sig = lfo.cur + (lfo.tgt - lfo.cur) * t;
      }
      const val = Math.max(0, Math.min(1, this.baseParams[lfo.paramIdx] + lfo.depth * sig));
      this._setParam(lfo.paramIdx, val);
    }

    // ── Excitation — external exciter if enabled, else silence (Rings' own
    // internal_exciter, if on, needs no help from this buffer at all) ──────
    const excHeap = this.heapF32;
    const excBase = this.excitationBase;
    if (this.exciterEnabled && this.exciterInstance) {
      this._fillExcitationQueue(left.length);
      for (let i = 0; i < left.length; i++) {
        excHeap[excBase + i] = this.excitationQueue.shift();
      }
    } else {
      for (let i = 0; i < left.length; i++) excHeap[excBase + i] = 0;
    }

    // ── Rings DSP ───────────────────────────────────────────────────────────
    this._process(this.excitationPtr, this.outputPtr, left.length);

    // Read output — cached heap view + pre-computed base offset
    const heap = this.heapF32;
    const base = this.base;
    for (let i = 0; i < left.length; i++) {
      left[i]  = heap[base + i * 2];
      right[i] = heap[base + i * 2 + 1];
    }

    // DSP metering — wrapped in try/catch so it can never silence audio
    try {
      const elapsed = performance.now() - t0;
      this._perfSum += elapsed;
      this._perfCount++;

      if (this._perfCount >= 500) {
        const windowWall  = performance.now() - this._windowStart;
        const audioBudget = 500 * this._budget;
        if (audioBudget > 0) {
          const dspLoad  = this._perfSum / audioBudget;
          const wallLoad = windowWall / audioBudget;
          const load = Math.max(dspLoad, Math.min(wallLoad, 1));
          this.port.postMessage({ type: 'perf', load });
        }
        this._perfSum   = 0;
        this._perfCount = 0;
      }
    } catch {}

    return true;
  }
}

registerProcessor('rings-processor', RingsProcessor);
