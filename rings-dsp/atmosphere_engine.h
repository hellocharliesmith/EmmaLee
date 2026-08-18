// New instrument ("Cloud Atmosphere", added 2026-08-17) — NOT part of
// Mutable's original Plaits firmware. Forked from
// rings-source/plaits/dsp/engine/additive_engine.h: same harmonic-additive
// core (so Harmonics/Timbre/Morph keep the same expressive, musical roles),
// plus a filtered-noise "air" layer mixed into the output. The airiness is a
// fixed characteristic of this engine, not a 4th knob — Plaits' Engine
// interface only ever exposes 3 params (Render() takes harmonics/timbre/
// morph, nothing else), so there's no slot for a separate "amount of air"
// control; that's what makes this a genuinely distinct instrument rather
// than a re-skin of Additive. See AGENTS.md "Plaits Cloud Atmosphere voice"
// for the full writeup.
//
// Lives in rings-dsp/ (not rings-source/) for the same reason
// exciter_slim.h/.cc do — genuinely new/forked instrument code stays out of
// the pristine vendored firmware tree.

#ifndef RINGS_DSP_ATMOSPHERE_ENGINE_H_
#define RINGS_DSP_ATMOSPHERE_ENGINE_H_

#include "plaits/dsp/engine/engine.h"
#include "plaits/dsp/oscillator/harmonic_oscillator.h"
#include "stmlib/dsp/filter.h"

namespace plaits {

const int kAtmosphereHarmonicBatchSize = 12;
const int kAtmosphereNumHarmonics = 24;
const int kAtmosphereNumHarmonicOscillators =
    kAtmosphereNumHarmonics / kAtmosphereHarmonicBatchSize;

class AtmosphereEngine : public Engine {
 public:
  AtmosphereEngine() { }
  ~AtmosphereEngine() { }

  virtual void Init(stmlib::BufferAllocator* allocator);
  virtual void Reset();
  virtual void LoadUserData(const uint8_t* user_data) { }
  virtual void Render(const EngineParameters& parameters,
      float* out,
      float* aux,
      size_t size,
      bool* already_enveloped);

 private:
  // Same spectral-shaping algorithm as AdditiveEngine::UpdateAmplitudes —
  // see additive_engine.cc for the original and its notes on why the
  // "incorrect" one-pole normalization is intentional. Simplified here to a
  // single 24-harmonic integer set (no separate aux "organ" subset) since
  // this engine's aux output is the dry tone, not a second timbral variant.
  void UpdateAmplitudes(
      float centroid,
      float slope,
      float bumps,
      float* amplitudes);

  HarmonicOscillator<kAtmosphereHarmonicBatchSize>
      harmonic_oscillator_[kAtmosphereNumHarmonicOscillators];
  stmlib::Svf air_filter_;

  float* amplitudes_;

  DISALLOW_COPY_AND_ASSIGN(AtmosphereEngine);
};

}  // namespace plaits

#endif  // RINGS_DSP_ATMOSPHERE_ENGINE_H_
