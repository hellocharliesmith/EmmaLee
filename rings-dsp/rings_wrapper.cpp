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

EMSCRIPTEN_KEEPALIVE
void rings_process(float* output, int num_samples) {
  int i = 0;
  while (i < num_samples) {
    int block = rings::kMaxBlockSize;
    if (i + block > num_samples) block = num_samples - i;

    memset(in_buffer, 0, sizeof(float) * block);
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
