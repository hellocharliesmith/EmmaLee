#include <emscripten/emscripten.h>
#include <cstring>
#include <cmath>
#include <algorithm>

#include "../rings-source/clouds/dsp/granular_processor.h"

using namespace clouds;

static GranularProcessor processor;

// Real Clouds hardware allocates ~116KB (large/SDRAM-ish) + ~64KB (CCM) of
// sample memory (see rings-source/clouds/clouds.cc's block_mem/block_ccm) --
// enough for roughly 1-2s of freeze/loop buffer. We're not RAM-constrained in
// a browser tab, so these are sized much larger for a more usable freeze
// window (several seconds instead of ~1). GranularProcessor::Prepare()
// splits buffer_[0] into "sample memory for channel 0" + "FX workspace" when
// stereo (num_channels_==2, the default) -- see its comment "Large buffer:
// 64k of sample memory + FX workspace" in granular_processor.cc -- so
// kLargeBufferSize must stay bigger than kSmallBufferSize for that split to
// leave a sane amount of FX workspace (reverb + diffuser + correlator all
// carve out of the same regions there).
static const size_t kLargeBufferSize = 1 << 20;  // 1 MB
static const size_t kSmallBufferSize = 1 << 17;  // 128 KB
static uint8_t large_buffer[kLargeBufferSize];
static uint8_t small_buffer[kSmallBufferSize];

// GranularProcessor::Process()'s scratch FloatFrame buffers (in_/out_/fb_
// etc in granular_processor.h) are statically sized to kMaxBlockSize (32
// samples -- see clouds/dsp/frame.h), so callers must chunk larger blocks
// themselves. Exactly the same constraint plaits_wrapper.cpp already handles
// for plaits::kMaxBlockSize -- same pattern here.
static const int kChunk = kMaxBlockSize;

extern "C" {

EMSCRIPTEN_KEEPALIVE
void clouds_init(float sample_rate) {
  // Clouds' own DSP (grain windows, reverb/filter coefficients, resource
  // tables) is hardcoded to assume 32kHz internally (see clouds/clouds.cc's
  // `codec.Init(master, 32000)` and clouds/test/clouds_test.cc's
  // kSampleRate=32000 -- confirmed NOT the same 48kHz Rings/Plaits assume).
  // The `sample_rate` argument here is accepted for API symmetry with
  // rings_init/plaits_init but is otherwise unused: public/clouds-processor.js
  // is responsible for resampling audio to/from 32kHz around calls to
  // clouds_process(), since the AudioContext this runs in is normally 44.1
  // or 48kHz. See AGENTS.md "Clouds granular effect" for the full writeup.
  (void)sample_rate;

  processor.Init(large_buffer, kLargeBufferSize, small_buffer, kSmallBufferSize);

  Parameters* p = processor.mutable_parameters();
  p->position = 0.5f;
  p->size = 0.5f;
  p->pitch = 0.0f;
  p->density = 0.5f;
  p->texture = 0.5f;
  p->dry_wet = 0.5f;
  p->stereo_spread = 0.0f;
  p->feedback = 0.0f;
  p->reverb = 0.3f;
  p->freeze = false;
  p->trigger = false;
  p->gate = false;
  p->granular.overlap = 0.0f;
  p->granular.window_shape = 0.5f;
  p->granular.stereo_spread = 0.0f;
  p->granular.use_deterministic_seed = false;
  p->spectral.quantization = 0.0f;
  p->spectral.refresh_rate = 0.5f;
  p->spectral.phase_randomization = 0.0f;
  p->spectral.warp = 0.5f;

  processor.set_playback_mode(PLAYBACK_MODE_GRANULAR);
  processor.Prepare();
}

// param: 0=position 1=size 2=pitch(semitones, -48..+48 typ.) 3=density
// 4=texture 5=dry_wet 6=stereo_spread 7=feedback 8=reverb
// All except pitch are 0-1 (Clouds' own native range).
EMSCRIPTEN_KEEPALIVE
void clouds_set_param(int param, float value) {
  Parameters* p = processor.mutable_parameters();
  switch (param) {
    case 0: p->position = value; break;
    case 1: p->size = value; break;
    case 2: p->pitch = value; break;
    case 3: p->density = value; break;
    case 4: p->texture = value; break;
    case 5: p->dry_wet = value; break;
    case 6: p->stereo_spread = value; break;
    case 7: p->feedback = value; break;
    case 8: p->reverb = value; break;
  }
}

// mode: 0=granular 1=stretch(time-stretch/pitch-shift) 2=looping delay
// 3=spectral. Spectral mode compiles and links (it's a static member of
// GranularProcessor so pulling in the phase vocoder is unavoidable) but is
// UNTESTED in this build -- see AGENTS.md caveat before exposing it in the UI.
EMSCRIPTEN_KEEPALIVE
void clouds_set_playback_mode(int mode) {
  processor.set_playback_mode(static_cast<PlaybackMode>(mode));
}

EMSCRIPTEN_KEEPALIVE
void clouds_set_freeze(int on) {
  processor.set_freeze(on != 0);
}

// quality: bit0 = mono (vs stereo), bit1 = low-fidelity (8-bit mu-law vs
// 16-bit). Matches GranularProcessor::set_quality()'s own bit layout.
EMSCRIPTEN_KEEPALIVE
void clouds_set_quality(int quality) {
  processor.set_quality(quality);
}

// input/output: interleaved stereo float32, range [-1, 1], num_samples
// frames (so array length = num_samples * 2) -- same convention as
// plaits_process's output buffer. Internally converts to/from Clouds' native
// int16 ShortFrame and chunks into <= kChunk-sample calls to
// GranularProcessor::Process(), calling Prepare() once per call (cheap
// no-op unless a buffer/mode change is pending -- mirrors how the real
// firmware calls it continuously from its idle loop, see clouds.cc's
// `while (1) { ui.DoEvents(); processor.Prepare(); }`).
EMSCRIPTEN_KEEPALIVE
void clouds_process(float* input, float* output, int num_samples) {
  static ShortFrame in_buf[kChunk];
  static ShortFrame out_buf[kChunk];

  processor.Prepare();

  int i = 0;
  while (i < num_samples) {
    int block = kChunk;
    if (i + block > num_samples) block = num_samples - i;

    for (int j = 0; j < block; j++) {
      float l = input[(i + j) * 2];
      float r = input[(i + j) * 2 + 1];
      l = std::max(-1.0f, std::min(1.0f, l));
      r = std::max(-1.0f, std::min(1.0f, r));
      in_buf[j].l = static_cast<short>(l * 32767.0f);
      in_buf[j].r = static_cast<short>(r * 32767.0f);
    }

    processor.Process(in_buf, out_buf, block);

    for (int j = 0; j < block; j++) {
      output[(i + j) * 2]     = out_buf[j].l / 32768.0f;
      output[(i + j) * 2 + 1] = out_buf[j].r / 32768.0f;
    }

    i += block;
  }
}

} // extern "C"
