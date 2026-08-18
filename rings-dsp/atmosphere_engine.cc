// See atmosphere_engine.h for what this is and why it exists.

#include "atmosphere_engine.h"

#include <algorithm>
#include <cmath>

#include "stmlib/utils/random.h"
#include "plaits/dsp/oscillator/sine_oscillator.h"

namespace plaits {

using namespace std;
using namespace stmlib;

void AtmosphereEngine::Init(BufferAllocator* allocator) {
  amplitudes_ = allocator->Allocate<float>(kAtmosphereNumHarmonics);
  for (int i = 0; i < kAtmosphereNumHarmonicOscillators; ++i) {
    harmonic_oscillator_[i].Init();
  }
  air_filter_.Init();
}

void AtmosphereEngine::Reset() {
  fill(&amplitudes_[0], &amplitudes_[kAtmosphereNumHarmonics], 0.0f);
}

void AtmosphereEngine::UpdateAmplitudes(
    float centroid,
    float slope,
    float bumps,
    float* amplitudes) {
  const size_t num_harmonics = kAtmosphereNumHarmonics;
  const float n = (static_cast<float>(num_harmonics) - 1.0f);
  const float margin = (1.0f / slope - 1.0f) / (1.0f + bumps);
  const float center = centroid * (n + margin) - 0.5f * margin;

  float sum = 0.001f;
  for (size_t i = 0; i < num_harmonics; ++i) {
    float order = fabsf(static_cast<float>(i) - center) * slope;
    float gain = 1.0f - order;
    gain += fabsf(gain);
    gain *= gain;

    float b = 0.25f + order * bumps;
    float bump_factor = 1.0f + Sine(b);

    gain *= bump_factor;
    gain *= gain;
    gain *= gain;

    ONE_POLE(amplitudes[i], gain, 0.001f);
    sum += amplitudes[i];
  }

  sum = 1.0f / sum;
  for (size_t i = 0; i < num_harmonics; ++i) {
    amplitudes[i] *= sum;
  }
}

void AtmosphereEngine::Render(
    const EngineParameters& parameters,
    float* out,
    float* aux,
    size_t size,
    bool* already_enveloped) {
  const float f0 = NoteToFrequency(parameters.note);

  // Same 3-param mapping as AdditiveEngine (centroid/slope/bumps) so
  // Harmonics/Timbre/Morph keep a familiar, musically expressive role.
  const float centroid = parameters.timbre;
  const float raw_bumps = parameters.harmonics;
  const float raw_slope = (1.0f - 0.6f * raw_bumps) * parameters.morph;
  const float slope = 0.01f + 1.99f * raw_slope * raw_slope * raw_slope;
  const float bumps = 16.0f * raw_bumps * raw_bumps;

  UpdateAmplitudes(centroid, slope, bumps, &amplitudes_[0]);

  // aux = dry harmonic tone only ("earthy") -- rendered first so `out` can
  // be built from it below.
  harmonic_oscillator_[0].Render<1>(f0, &amplitudes_[0], aux, size);
  harmonic_oscillator_[1].Render<13>(f0, &amplitudes_[12], aux, size);

  // Breath-noise layer ("cloudy"), lowpass-filtered with a cutoff that
  // tracks the fundamental -- real breath/air noise sits in a band above
  // the pitch, not at a fixed frequency, and this pitch-tracking is what
  // keeps the air layer sounding coherent with the note instead of a flat
  // hiss laid on top. This -- not a 4th knob -- is what makes this engine
  // read as airy/flute-like rather than a plain additive tone.
  float noise_cutoff_hz = f0 * 10.0f;
  float f = noise_cutoff_hz / kSampleRate;
  CONSTRAIN(f, 0.0f, 0.45f);
  air_filter_.set_f_q<FREQUENCY_FAST>(f, 1.0f);
  for (size_t i = 0; i < size; ++i) {
    float noise = Random::GetFloat() - 0.5f;
    float air = air_filter_.Process<FILTER_MODE_LOW_PASS>(noise);
    out[i] = aux[i] + air * 0.6f;
  }
}

}  // namespace plaits
