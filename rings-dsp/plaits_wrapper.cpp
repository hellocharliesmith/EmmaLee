#include <emscripten/emscripten.h>
#include <cstring>
#include <cmath>

#include "../rings-source/plaits/dsp/voice.h"

static plaits::Voice voice;
static plaits::Patch patch;
static plaits::Modulations modulations;
static uint8_t ram_block[16384];
static stmlib::BufferAllocator allocator(ram_block, sizeof(ram_block));

extern "C" {

EMSCRIPTEN_KEEPALIVE
void plaits_init(float sample_rate) {
  voice.Init(&allocator);

  patch.engine = 8; // Virtual Analog
  patch.note = 48.0f;
  patch.harmonics = 0.5f;
  patch.timbre = 0.5f;
  patch.morph = 0.5f;
  patch.frequency_modulation_amount = 0.0f;
  patch.timbre_modulation_amount = 0.0f;
  patch.morph_modulation_amount = 0.0f;
  patch.decay = 0.5f;
  patch.lpg_colour = 0.5f;

  modulations.engine = 0.0f;
  modulations.note = 0.0f;
  modulations.frequency = 0.0f;
  modulations.harmonics = 0.0f;
  modulations.timbre = 0.0f;
  modulations.morph = 0.0f;
  modulations.trigger = 0.0f;
  modulations.level = 1.0f;
  modulations.frequency_patched = false;
  modulations.timbre_patched = false;
  modulations.morph_patched = false;
  modulations.trigger_patched = true; // we always drive note-on via trigger, like a sequencer gate
  modulations.level_patched = false;
}

// param: 0=harmonics 1=timbre 2=morph 3=decay
EMSCRIPTEN_KEEPALIVE
void plaits_set_param(int param, float value) {
  switch (param) {
    case 0: patch.harmonics = value; break;
    case 1: patch.timbre = value; break;
    case 2: patch.morph = value; break;
    case 3: patch.decay = value; break;
  }
}

EMSCRIPTEN_KEEPALIVE
void plaits_set_model(int engine) {
  patch.engine = engine;
}

EMSCRIPTEN_KEEPALIVE
void plaits_set_note(float midi_note) {
  patch.note = midi_note;
}

EMSCRIPTEN_KEEPALIVE
void plaits_trigger() {
  modulations.trigger = 1.0f;
}

EMSCRIPTEN_KEEPALIVE
void plaits_process(float* output, int num_samples) {
  int i = 0;
  while (i < num_samples) {
    int block = plaits::kMaxBlockSize;
    if (i + block > num_samples) block = num_samples - i;

    plaits::Voice::Frame frames[plaits::kMaxBlockSize];
    voice.Render(patch, modulations, frames, block);

    for (int j = 0; j < block; j++) {
      output[(i + j) * 2]     = frames[j].out / 32768.0f;
      output[(i + j) * 2 + 1] = frames[j].aux / 32768.0f;
    }

    modulations.trigger = 0.0f; // pulse for one render call, like rings' performance.strum
    i += block;
  }
}

} // extern "C"
