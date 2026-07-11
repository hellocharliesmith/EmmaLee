// Trimmed fork of rings-source/elements/dsp/exciter.h — keeps only the 5
// models that don't depend on Elements' baked-in sample ROM (Mallet,
// Plectrum, Particles, Flow, Noise). Dropped: GRANULAR_SAMPLE_PLAYER and
// SAMPLE_PLAYER, which read from smp_sample_data/smp_noise_sample/
// smp_boundaries in elements/resources.cc — ~42,000 of that file's ~44,600
// lines. Since Exciter::Process dispatches through a function-pointer table
// covering every model, the original class keeps those two (and their data)
// linked in regardless of which model the UI ever selects — trimming them
// out of the class itself is the only way to actually drop the ~600KB+ of
// sample data from this WASM. See exciter_svf_luts.cc for the same reasoning
// applied to the (much smaller, always-needed) filter LUTs.
//
// Original copyright 2014 Emilie Gillet (MIT license) — see
// rings-source/elements/dsp/exciter.h for the unmodified original and its
// full license header.

#ifndef RINGS_DSP_EXCITER_SLIM_H_
#define RINGS_DSP_EXCITER_SLIM_H_

#include "stmlib/stmlib.h"
#include "stmlib/dsp/filter.h"
#include "stmlib/utils/random.h"

namespace elements {

enum ExciterModel {
  EXCITER_MODEL_MALLET,
  EXCITER_MODEL_PLECTRUM,
  EXCITER_MODEL_PARTICLES,
  EXCITER_MODEL_FLOW,
  EXCITER_MODEL_NOISE
};

enum ExciterFlags {
  EXCITER_FLAG_RISING_EDGE = 1,
  EXCITER_FLAG_FALLING_EDGE = 2,
  EXCITER_FLAG_GATE = 4
};

class Exciter {
 public:
  typedef void (Exciter::*ProcessFn)(const uint8_t, float*, size_t);

  Exciter() { }
  ~Exciter() { }

  void Init();

  inline void set_signature(float signature) {
    signature_ = signature;
  }

  inline void set_model(ExciterModel model) {
    model_ = model;
  }

  inline void set_parameter(float parameter) {
    parameter_ = parameter;
  }

  inline void set_timbre(float timbre) {
    timbre_ = timbre;
  }

  void Process(const uint8_t flags, float* out, size_t n);
  void ProcessMallet(const uint8_t, float*, size_t);
  void ProcessPlectrum(const uint8_t, float*, size_t);
  void ProcessParticles(const uint8_t, float*, size_t);
  void ProcessFlow(const uint8_t, float*, size_t);
  void ProcessNoise(const uint8_t, float*, size_t);

 private:
  float GetPulseAmplitude(float cutoff);

  inline float RandomSample() const {
    return static_cast<float>(stmlib::Random::GetWord()) / 4294967296.0f;
  }

  ExciterModel model_;
  float parameter_;
  float timbre_;

  stmlib::Svf lp_;
  float damp_state_;
  float particle_state_;
  float particle_range_;
  float damping_;
  float signature_;
  uint32_t delay_;
  uint32_t plectrum_delay_;

  static ProcessFn fn_table_[];

  DISALLOW_COPY_AND_ASSIGN(Exciter);
};

}  // namespace elements

#endif  // RINGS_DSP_EXCITER_SLIM_H_
