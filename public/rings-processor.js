// AudioWorklet processor — runs on the audio thread.
// importScripts() is NOT available here. We instantiate WASM directly.

class RingsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.instance = null;
    this.outputPtr = null;
    this.pendingTrigger = false;

    this.port.onmessage = async (e) => {
      const { type, payload } = e.data;
      if (type === 'load-wasm') {
        await this._init(payload.wasmModule);
      } else if (type === 'trigger') {
        if (payload.note !== undefined && this.instance) {
          this.instance.exports.f(payload.note); // rings_set_note
        }
        this.pendingTrigger = true;
      } else if (type === 'set-param') {
        if (this.instance) {
          this.instance.exports.e(payload.param, payload.value); // rings_set_param
        }
      }
    };
  }

  async _init(wasmModule) {
    try {
      let memRef = null;

      const imports = {
        a: {
          // emscripten_resize_heap — grows the WASM memory when needed
          a: (requestedSize) => {
            if (!memRef) return 0;
            const needed = Math.ceil(
              (requestedSize - memRef.buffer.byteLength) / 65536
            );
            if (needed > 0) {
              try { memRef.grow(needed); return 1; } catch { return 0; }
            }
            return 1;
          },
        },
      };

      // wasmModule is already compiled — instantiate only (no compile step in worklet)
      const instance = await WebAssembly.instantiate(wasmModule, imports);
      this.instance = instance;
      memRef = instance.exports.b; // WebAssembly.Memory exported by the WASM

      // Export names from Emscripten compilation:
      // d = rings_init, e = rings_set_param, f = rings_set_note,
      // g = rings_trigger, h = rings_process, i = malloc, j = free

      instance.exports.d(sampleRate); // rings_init(float sample_rate)

      // Allocate output buffer: 128 samples × 2 channels × 4 bytes/float
      this.outputPtr = instance.exports.i(128 * 2 * 4); // malloc

      this.port.postMessage({ type: 'ready' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  process(inputs, outputs) {
    if (!this.instance || this.outputPtr === null) return true;

    const output = outputs[0];
    const left = output[0];
    const right = output[1] || output[0];

    if (this.pendingTrigger) {
      this.instance.exports.g(); // rings_trigger
      this.pendingTrigger = false;
    }

    this.instance.exports.h(this.outputPtr, left.length); // rings_process

    const heap = new Float32Array(this.instance.exports.b.buffer);
    const base = this.outputPtr >> 2; // byte offset → float32 index

    for (let i = 0; i < left.length; i++) {
      left[i] = heap[base + i * 2];
      right[i] = heap[base + i * 2 + 1];
    }

    return true;
  }
}

registerProcessor('rings-processor', RingsProcessor);
