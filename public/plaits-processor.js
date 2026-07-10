// AudioWorklet processor for the Plaits melodic track — runs on the audio thread.
// Slimmed down: no internal reverb (that lives on the master bus / Rings only).
// LFOs (added later, mirrors rings-processor.js) only ever target params 0-3
// (Harmonics/Timbre/Morph/Decay) — param 4 (LPG Colour) is a fixed hardware
// global set once from the main thread and never modulated.
// Reused as-is for the 3 drum voices too (see engine.ts's DRUM_VOICE_CONFIG) —
// they simply never receive a 'set-lfo' message, so this stays dormant there.

class PlaitsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // WASM state
    this.instance   = null;
    this.outputPtr  = null;
    this.heapF32    = null; // cached — valid after init (no memory growth post-init)
    this.base       = 0;    // outputPtr >> 2, pre-computed

    // Cached WASM exports
    this._setParam = null;
    this._setModel = null;
    this._setNote  = null;
    this._trigger  = null;
    this._process  = null;

    this.pendingTrigger = false;
    this.pendingNote    = undefined;
    this.velocity       = 1.0; // scales output; updated on trigger, sticky until next one

    // Base param values (set by sliders, used as LFO centre) — indices
    // 0=harmonics, 1=timbre, 2=morph, 3=decay.
    this.baseParams = [0.5, 0.5, 0.5, 0.5];

    // Four LFOs, one per modulatable param (same shape as rings-processor.js).
    this.lfos = [0, 1, 2, 3].map(paramIdx => ({
      enabled: false, wave: 'sine', rate: 0.5, depth: 0.15,
      paramIdx,
      phase: 0,
      cur: 0, tgt: Math.random() * 2 - 1, prog: 0,
    }));

    this.port.onmessage = async (e) => {
      const { type, payload } = e.data;
      switch (type) {

        case 'load-wasm':
          await this._init(payload.wasmBytes);
          break;

        case 'trigger':
          if (payload.note !== undefined) this.pendingNote = payload.note;
          if (payload.velocity !== undefined) this.velocity = payload.velocity;
          this.pendingTrigger = true;
          break;

        case 'set-note':
          this._setNote?.(payload.note);
          break;

        case 'set-param': {
          const { param, value } = payload;
          this.baseParams[param] = value;
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
          if (field === 'enabled' && !value)
            this._setParam?.(lfo.paramIdx, this.baseParams[lfo.paramIdx]);
          break;
        }
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

      // d=init e=set_param f=set_model g=set_note h=trigger i=process j=malloc k=free
      this._setParam = instance.exports.e;
      this._setModel = instance.exports.f;
      this._setNote  = instance.exports.g;
      this._trigger  = instance.exports.h;
      this._process  = instance.exports.i;

      instance.exports.d(sampleRate); // plaits_init

      this.outputPtr = instance.exports.j(128 * 2 * 4); // malloc
      this.base      = this.outputPtr >> 2;

      this.heapF32 = new Float32Array(instance.exports.b.buffer);

      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  process(inputs, outputs) {
    if (!this.instance || this.outputPtr === null) return true;

    const output = outputs[0];
    const left  = output[0];
    const right = output[1] || output[0];

    if (this.pendingTrigger) {
      if (this.pendingNote !== undefined) this._setNote(this.pendingNote);
      this._trigger();
      this.pendingTrigger = false;
    }

    // ── LFO — runs on audio thread, zero IPC, block-rate accurate ──────────
    const dt = 128 / sampleRate;
    for (const lfo of this.lfos) {
      if (!lfo.enabled) continue;
      let sig;
      if (lfo.wave === 'sine') {
        lfo.phase = (lfo.phase + lfo.rate * dt) % 1;
        sig = Math.sin(lfo.phase * 6.283185307179586);
      } else {
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

    this._process(this.outputPtr, left.length);

    const heap = this.heapF32;
    const base = this.base;
    const vel  = this.velocity;
    for (let i = 0; i < left.length; i++) {
      left[i]  = heap[base + i * 2] * vel;
      right[i] = heap[base + i * 2 + 1] * vel;
    }

    return true;
  }
}

registerProcessor('plaits-processor', PlaitsProcessor);
