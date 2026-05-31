// AudioWorklet processor — runs on the audio thread.
// LFO runs here alongside Rings DSP: zero IPC overhead, sample-block accurate.

class RingsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // WASM state
    this.instance   = null;
    this.outputPtr  = null;
    this.heapF32    = null; // cached — valid after init (no memory growth post-init)
    this.base       = 0;    // outputPtr >> 2, pre-computed

    // Cached WASM exports (avoids property-chain lookups in process())
    this._setParam = null;
    this._setModel = null;
    this._setNote  = null;
    this._trigger  = null;
    this._process  = null;

    this.pendingTrigger = false;

    // DSP load metering — no guard, performance.now() is always available in modern AudioWorklet
    this._perfSum    = 0;
    this._perfCount  = 0;
    this._budget     = 0; // ms per block, set after init
    this._windowStart = 0; // wall time at start of current measurement window

    // Base param values (set by sliders, used as LFO centre)
    // Indices: 0=structure, 1=brightness, 2=damping, 3=position
    this.baseParams = [0.3, 0.5, 0.5, 0.25];

    // Three LFOs: index 0→brightness(1), 1→damping(2), 2→position(3)
    this.lfos = [1, 2, 3].map(paramIdx => ({
      enabled: false, wave: 'sine', rate: 0.5, depth: 0.15,
      paramIdx,
      phase: 0,                              // sine accumulator
      cur: 0, tgt: Math.random() * 2 - 1, prog: 0, // smooth random state
    }));

    this.port.onmessage = async (e) => {
      const { type, payload } = e.data;
      switch (type) {

        case 'load-wasm':
          await this._init(payload.wasmModule);
          break;

        case 'trigger':
          if (payload.note !== undefined && this._setNote)
            this._setNote(payload.note);
          this.pendingTrigger = true;
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
      memRef = instance.exports.b; // WebAssembly.Memory

      // Cache exports — d=init e=set_param f=set_model g=set_note h=trigger i=process j=malloc
      this._setParam = instance.exports.e;
      this._setModel = instance.exports.f;
      this._setNote  = instance.exports.g;
      this._trigger  = instance.exports.h;
      this._process  = instance.exports.i;

      instance.exports.d(sampleRate); // rings_init

      this.outputPtr = instance.exports.j(128 * 2 * 4); // malloc
      this.base      = this.outputPtr >> 2;              // pre-computed float offset

      // Cache heap view — safe to hold since memory doesn't grow after init
      this.heapF32 = new Float32Array(instance.exports.b.buffer);

      this._budget = (128 / sampleRate) * 1000; // ms of audio time per block
      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message });
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

    // ── Rings DSP ───────────────────────────────────────────────────────────
    this._process(this.outputPtr, left.length);

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
