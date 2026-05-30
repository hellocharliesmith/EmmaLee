#include <emscripten/emscripten.h>
#include <cstring>
#include <cmath>

#include "../rings-source/rings/dsp/part.h"

static rings::Part part;
static rings::PerformanceState performance;
static rings::Patch patch;
static uint16_t reverb_buffer[32768];

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

EMSCRIPTEN_KEEPALIVE
void rings_process(float* output, int num_samples) {
  int i = 0;
  while (i < num_samples) {
    int block = rings::kMaxBlockSize;
    if (i + block > num_samples) block = num_samples - i;

    memset(in_buffer, 0, sizeof(float) * block);
    part.Process(performance, patch, in_buffer, out_buffer, aux_buffer, block);

    for (int j = 0; j < block; j++) {
      output[(i + j) * 2]     = out_buffer[j];
      output[(i + j) * 2 + 1] = aux_buffer[j];
    }

    performance.strum = false;
    i += block;
  }
}

} // extern "C"
