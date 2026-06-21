// AudioWorklet processor for the Plaits melodic track — runs on the audio thread.
// Slimmed down: no LFOs, no internal reverb (those live on the master bus / Rings only).

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

    this.port.onmessage = async (e) => {
      const { type, payload } = e.data;
      switch (type) {

        case 'load-wasm':
          await this._init(payload.wasmModule);
          break;

        case 'trigger':
          if (payload.note !== undefined) this.pendingNote = payload.note;
          this.pendingTrigger = true;
          break;

        case 'set-note':
          this._setNote?.(payload.note);
          break;

        case 'set-param':
          this._setParam?.(payload.param, payload.value);
          break;

        case 'set-model':
          this._setModel?.(payload.model);
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

    this._process(this.outputPtr, left.length);

    const heap = this.heapF32;
    const base = this.base;
    for (let i = 0; i < left.length; i++) {
      left[i]  = heap[base + i * 2];
      right[i] = heap[base + i * 2 + 1];
    }

    return true;
  }
}

registerProcessor('plaits-processor', PlaitsProcessor);
