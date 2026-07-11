// IMPORTANT if you add/reorder exported functions: emcc's minified export
// letters (the single-letter names public/rings-processor.js actually calls,
// e.g. e.g(69)) are assigned in the ORDER FUNCTIONS ARE DEFINED IN THIS FILE
// — NOT the order they're listed in build-wasm.sh's EXPORTED_FUNCTIONS array.
// Confirmed the expensive way while adding rings_set_internal_exciter: it was
// listed 8th in EXPORTED_FUNCTIONS (after reverb_set) but is defined 6th in
// this file (right after rings_trigger), and its real export letter matched
// the file position, not the array position. After ANY wrapper change,
// re-derive the mapping with a throwaway -O1 build (keeps real names) rather
// than assuming — see the Node harness used for this in the exciter work.

#include <emscripten/emscripten.h>
#include <cstring>
#include <cmath>

#include "../rings-source/rings/dsp/part.h"
#include "../rings-source/rings/dsp/fx/reverb.h"

static rings::Part part;
static rings::PerformanceState performance;
static rings::Patch patch;
static uint16_t reverb_buffer[32768];

// Standalone reverb — works with any model, applied after Part::Process
static rings::Reverb standalone_reverb;
static uint16_t standalone_reverb_buf[32768];
static bool standalone_reverb_enabled = false;

static float in_buffer[rings::kMaxBlockSize];
static float out_buffer[rings::kMaxBlockSize];
static float aux_buffer[rings::kMaxBlockSize];

extern "C" {

EMSCRIPTEN_KEEPALIVE
void rings_init(float sample_rate) {
  part.Init(reverb_buffer);
  part.set_polyphony(4);
  part.set_model(rings::RESONATOR_MODEL_MODAL);

  patch.structure = 0.5f;
  patch.brightness = 0.5f;
  patch.damping = 0.5f;
  patch.position = 0.25f;

  performance.note = 48;
  performance.strum = false;
  performance.internal_exciter = true;
  performance.internal_strum = false;
  performance.internal_note = false;

  // Init standalone reverb
  memset(standalone_reverb_buf, 0, sizeof(standalone_reverb_buf));
  standalone_reverb.Init(standalone_reverb_buf);
  standalone_reverb.set_amount(0.5f);
  standalone_reverb.set_diffusion(0.625f);
  standalone_reverb.set_input_gain(0.2f);
  standalone_reverb.set_time(0.5f);
  standalone_reverb.set_lp(0.7f);
}

EMSCRIPTEN_KEEPALIVE
void rings_set_param(int param, float value) {
  switch (param) {
    case 0: patch.structure = value; break;
    case 1: patch.brightness = value; break;
    case 2: patch.damping = value; break;
    case 3: patch.position = value; break;
  }
}

EMSCRIPTEN_KEEPALIVE
void rings_set_model(int model) {
  part.set_model(static_cast<rings::ResonatorModel>(model));
}

EMSCRIPTEN_KEEPALIVE
void rings_set_note(float midi_note) {
  performance.note = midi_note;
}

EMSCRIPTEN_KEEPALIVE
void rings_trigger() {
  performance.strum = true;
}

// on=1: Rings synthesizes its own excitation (a filtered pulse or noise burst
// depending on resonator model, see part.cc's Render*Voice — this has been
// the only mode this build used until now). on=0: Rings' own burst is
// disabled and it resonates whatever's in the `input` buffer passed to
// rings_process instead (see part.cc's Part::Process, which copies `in`
// straight into resonator_input_ for the active voice) — this is the real
// hardware's IN jack behavior, used by the exciter_wrapper.cpp module.
EMSCRIPTEN_KEEPALIVE
void rings_set_internal_exciter(int on) {
  performance.internal_exciter = (on != 0);
}

// Enable/disable standalone reverb
EMSCRIPTEN_KEEPALIVE
void rings_reverb_enable(int enabled) {
  standalone_reverb_enabled = (enabled != 0);
}

// Set standalone reverb parameters — all values clamped to [0,1] for safety
EMSCRIPTEN_KEEPALIVE
void rings_reverb_set(float amount, float time, float lp) {
  if (amount < 0.0f) amount = 0.0f; if (amount > 1.0f) amount = 1.0f;
  if (time   < 0.0f) time   = 0.0f; if (time   > 1.0f) time   = 1.0f;
  if (lp     < 0.0f) lp     = 0.0f; if (lp     > 1.0f) lp     = 1.0f;
  standalone_reverb.set_amount(amount);
  standalone_reverb.set_time(0.35f + 0.63f * time);
  standalone_reverb.set_lp(0.3f + 0.6f * lp);
}

// input: mono excitation signal, one sample per frame (unlike output, which
// is interleaved stereo). Silence reproduces today's behavior exactly —
// internal_exciter's own burst, if enabled, doesn't need this buffer at all;
// with internal_exciter off, this buffer IS the excitation (see part.cc).
EMSCRIPTEN_KEEPALIVE
void rings_process(float* input, float* output, int num_samples) {
  int i = 0;
  while (i < num_samples) {
    int block = rings::kMaxBlockSize;
    if (i + block > num_samples) block = num_samples - i;

    memcpy(in_buffer, &input[i], sizeof(float) * block);
    part.Process(performance, patch, in_buffer, out_buffer, aux_buffer, block);

    // Apply standalone reverb in-place on out_buffer/aux_buffer before output copy
    if (standalone_reverb_enabled) {
      standalone_reverb.Process(out_buffer, aux_buffer, block);
    }

    for (int j = 0; j < block; j++) {
      output[(i + j) * 2]     = out_buffer[j];
      output[(i + j) * 2 + 1] = aux_buffer[j];
    }

    performance.strum = false;
    i += block;
  }
}

} // extern "C"
