// See rings_wrapper.cpp's top-of-file note: export letters follow this
// file's function DEFINITION order, not build-exciter-wasm.sh's
// EXPORTED_FUNCTIONS array order. Re-derive with a throwaway -O1 build after
// any change here, don't assume.

#include <emscripten/emscripten.h>

#include "exciter_slim.h"

static elements::Exciter exciter;
static float out_buffer[4096]; // headroom; actual calls use whatever block size the caller passes

// Gate state — rising/falling edges are computed once per exciter_process()
// call from the last exciter_set_gate() value, same "set a flag, picked up
// at the next process call" pattern as rings_trigger()/pendingTrigger in the
// other worklets (not sample-accurate mid-block, which is fine here: gate
// on/off is driven by a JS-side millisecond timer, not audio-rate logic).
static bool gate_on = false;
static bool gate_was_on = false;

extern "C" {

EMSCRIPTEN_KEEPALIVE
void exciter_init() {
  exciter.Init();
}

// model: 0=Mallet 1=Plectrum 2=Particles 3=Flow 4=Noise (elements::ExciterModel,
// see exciter_slim.h — the 2 sample-player models are dropped from this fork).
EMSCRIPTEN_KEEPALIVE
void exciter_set_model(int model) {
  if (model < 0) model = 0;
  if (model > 4) model = 4;
  exciter.set_model(static_cast<elements::ExciterModel>(model));
}

// 0-1, filter cutoff for every model (also selects resonance's meaning is
// swapped in for Noise specifically — see Exciter::Process in exciter_slim.cc).
EMSCRIPTEN_KEEPALIVE
void exciter_set_timbre(float value) {
  exciter.set_timbre(value);
}

// 0-1, per-model meaning: Mallet=decay, Plectrum=pick delay, Particles=decay,
// Flow=noise texture amount, Noise=filter resonance.
EMSCRIPTEN_KEEPALIVE
void exciter_set_parameter(float value) {
  exciter.set_parameter(value);
}

EMSCRIPTEN_KEEPALIVE
void exciter_set_gate(int on) {
  gate_on = (on != 0);
}

// out: mono, `num_samples` frames. Runs at whatever rate the caller feeds it
// (this class has no internal fixed-block-size dependency, unlike Clouds'
// GranularProcessor — see AGENTS.md) but its filter LUTs and Particles/Flow's
// per-sample timing constants are baked in for elements::kSampleRate
// (32kHz, see elements/dsp/dsp.h) — the JS side is responsible for treating
// this output as a 32kHz-rate stream and resampling to the AudioContext's
// actual rate before feeding it to Rings, same technique clouds-processor.js
// already uses for the same reason.
EMSCRIPTEN_KEEPALIVE
void exciter_process(float* out, int num_samples) {
  uint8_t flags = 0;
  if (gate_on && !gate_was_on) flags |= elements::EXCITER_FLAG_RISING_EDGE;
  if (!gate_on && gate_was_on) flags |= elements::EXCITER_FLAG_FALLING_EDGE;
  if (gate_on) flags |= elements::EXCITER_FLAG_GATE;
  gate_was_on = gate_on;

  int remaining = num_samples;
  float* dst = out;
  while (remaining > 0) {
    int block = remaining;
    if (block > 4096) block = 4096;
    exciter.Process(flags, out_buffer, block);
    // Only the first sub-block (if any) should see the edge flags —
    // subsequent sub-blocks within the same call are a continuation of the
    // same gate state.
    flags &= elements::EXCITER_FLAG_GATE;
    for (int i = 0; i < block; i++) dst[i] = out_buffer[i];
    dst += block;
    remaining -= block;
  }
}

} // extern "C"
