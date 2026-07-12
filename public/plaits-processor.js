// AudioWorklet processor for the Plaits melodic track — runs on the audio thread.
// Slimmed down: no internal reverb (that lives on the master bus / Rings only).
// LFOs (added later, mirrors rings-processor.js) only ever target params 0-3
// (Harmonics/Timbre/Morph/Decay) — param 4 (LPG Colour) is a fixed hardware
// global set once from the main thread and never modulated.
// Reused as-is for the 3 drum voices too (see engine.ts's DRUM_VOICE_CONFIG) —
// they simply never receive a 'set-lfo' message, so this stays dormant there.
// Same is true of the envelope below: drum voices never receive
// 'set-envelope-*' messages, and their engines bypass the LPG entirely
// regardless (already_enveloped, see AGENTS.md), so it's a no-op for them.
//
// Envelope (added 2026-07-12, see AGENTS.md "Plaits envelope"): Plaits' own
// internal envelope is a fixed pitch-tied "ping" attack + a decay that always
// falls to silence — no user-adjustable attack, no sustain. Real hardware has
// a second mode though: patching a CV into the LEVEL input makes the internal
// lowpass gate follow that CV directly instead of auto-triggering the ping
// (voice.cc's ProcessLP vs ProcessPing). This drives that input with a real
// Attack + Sustain envelope computed here, block-rate, same as the LFOs.

class PlaitsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // WASM state
    this.instance   = null;
    this.outputPtr  = null;
    this.heapF32    = null; // cached — valid after init (no memory growth post-init)
    this.base       = 0;    // outputPtr >> 2, pre-computed

    // Cached WASM exports
    this._setParam        = null;
    this._setModel        = null;
    this._setNote         = null;
    this._trigger         = null;
    this._process         = null;
    this._setLevel        = null;
    this._setLevelPatched = null;

    this.pendingTrigger = false;
    this.pendingNote    = undefined;
    this.velocity       = 1.0; // scales output; updated on trigger, sticky until next one

    // Base param values (set by sliders, used as LFO centre) — indices
    // 0=harmonics, 1=timbre, 2=morph, 3=decay.
    this.baseParams = [0.5, 0.5, 0.5, 0.5];

    // ── Envelope (drives Plaits' real LEVEL input, see file header) ────────
    this.envAttackMs = 0; // 0 = feature off (together with envSustain===0)
    this.envSustain  = 0; // 0-1 -- floor the level settles at instead of 0
    this.envActive   = false;   // cached: envAttackMs>0 || envSustain>0
    this.envWasActive = false;  // tracks mode transitions so we only call
                                // _setLevelPatched when it actually changes
    this.envState    = 'idle';  // 'idle' | 'attack' | 'hold'
    this.envLevel    = 0;       // current ramp position during 'attack', 0-1
    this.envIncrement = 0;      // per-block attack step, recomputed when envAttackMs changes

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

        case 'set-envelope-attack-ms':
          this.envAttackMs = payload.ms;
          this.envActive = this.envAttackMs > 0 || this.envSustain > 0;
          this._recomputeEnvIncrement();
          break;

        case 'set-envelope-sustain':
          this.envSustain = payload.value;
          this.envActive = this.envAttackMs > 0 || this.envSustain > 0;
          break;
      }
    };
  }

  _recomputeEnvIncrement() {
    const dt = 128 / sampleRate; // seconds per block, same granularity as the LFOs
    this.envIncrement = this.envAttackMs > 0 ? dt / (this.envAttackMs / 1000) : 1;
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

      // d=init e=set_param f=set_model g=set_note h=trigger i=process
      // j=set_level k=set_level_patched l=malloc m=free (letters follow
      // declaration order in plaits_wrapper.cpp, NOT build-plaits-wasm.sh's
      // EXPORTED_FUNCTIONS array order — re-derive with a throwaway -O1 build
      // or by grepping public/plaits.js's assignWasmExports after any wrapper
      // change, see that file's top-of-file note. Confirmed via plaits.js's
      // own assignWasmExports function directly, 2026-07-12.)
      this._setParam = instance.exports.e;
      this._setModel = instance.exports.f;
      this._setNote  = instance.exports.g;
      this._trigger  = instance.exports.h;
      this._process  = instance.exports.i;
      this._setLevel        = instance.exports.j;
      this._setLevelPatched = instance.exports.k;

      instance.exports.d(sampleRate); // plaits_init

      this.outputPtr = instance.exports.l(128 * 2 * 4); // malloc
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
      if (this.envActive) {
        this.envState = 'attack';
        this.envLevel = 0;
      }
    }

    // ── Envelope — drives Plaits' real LEVEL input (see file header). Only
    // touches the WASM when active/just-deactivated, same "skip when unused"
    // discipline as the LFO loop below (enabled/disabled per-LFO). ──────────
    if (this.envActive) {
      if (this.envState === 'attack') {
        this.envLevel = Math.min(1, this.envLevel + this.envIncrement);
        if (this.envLevel >= 1) this.envState = 'hold';
      }
      // During 'attack' we ramp 0->1 ourselves. Once we reach 'hold' we just
      // hold the target at envSustain forever -- Plaits' OWN vactrol/decay
      // follower (patch.decay-driven, unchanged meaning) does the musical
      // fall from ~1 down to that floor, then simply stays there: a real,
      // indefinite sustain/drone once envSustain > 0.
      const level = this.envState === 'hold' ? this.envSustain : this.envLevel;
      this._setLevel?.(level);
      if (!this.envWasActive) this._setLevelPatched?.(1);
      this.envWasActive = true;
    } else if (this.envWasActive) {
      this._setLevelPatched?.(0); // back to Plaits' native ping-decay envelope
      this.envWasActive = false;
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
