// Trimmed fork of rings-source/elements/dsp/exciter.cc — see exciter_slim.h
// for why (drops the 2 sample-player models and their ROM data dependency).
// ProcessMallet/Plectrum/Particles/Flow/Noise and GetPulseAmplitude below are
// byte-for-byte the original implementations, just with the sample-player
// entries removed from fn_table_ and Process()'s now-unconditional filter
// (every remaining model wants it — only the 2 dropped ones skipped it).
//
// Original copyright 2014 Emilie Gillet (MIT license) — see
// rings-source/elements/dsp/exciter.cc for the unmodified original.

#include "exciter_slim.h"

#include <algorithm>

#include "elements/dsp/dsp.h"
#include "exciter_svf_luts.h"

namespace elements {

using namespace std;
using namespace stmlib;

void Exciter::Init() {
  set_model(EXCITER_MODEL_MALLET);
  set_parameter(0.0f);
  set_timbre(0.99f);

  lp_.Init();
  damp_state_ = 0.0f;
  delay_ = 0;
  plectrum_delay_ = 0;
  particle_state_ = 0.5f;
  damping_ = 0.0f;
  signature_ = 0.0f;
}

float Exciter::GetPulseAmplitude(float cutoff) {
  uint32_t cutoff_index = static_cast<uint32_t>(cutoff * 256.0f);
  return lut_approx_svf_gain[cutoff_index];
}

void Exciter::Process(const uint8_t flags, float* out, size_t size) {
  damping_ = 0.0f;
  (this->*fn_table_[model_])(flags, out, size);
  // Apply filter -- unconditional here (the original skipped this for its 2
  // sample-player models only, both dropped in this fork).
  uint32_t cutoff_index = static_cast<uint32_t>(timbre_ * 256.0f);
  if (model_ == EXCITER_MODEL_NOISE) {
    uint32_t resonance_index = static_cast<uint32_t>(parameter_ * 256.0f);
    lp_.set_g_r(
        lut_approx_svf_g[cutoff_index],
        lut_approx_svf_r[resonance_index]);
  } else {
    lp_.set_g_r_h(
        lut_approx_svf_g[cutoff_index],
        2.0f,
        lut_approx_svf_h[cutoff_index]);
  }
  lp_.Process<FILTER_MODE_LOW_PASS>(out, out, size);
}

void Exciter::ProcessMallet(const uint8_t flags, float* out, size_t size) {
  fill(&out[0], &out[size], 0.0f);
  if (flags & EXCITER_FLAG_RISING_EDGE) {
    damp_state_ = 0.0f;
    out[0] = GetPulseAmplitude(timbre_);
  }
  if (!(flags & EXCITER_FLAG_GATE)) {
    damp_state_ = 1.0f - 0.95f * (1.0f - damp_state_);
  }
  damping_ = damp_state_ * (1.0f - parameter_);
}

void Exciter::ProcessPlectrum(
    const uint8_t flags,
    float* out,
    size_t size) {
  float amplitude = GetPulseAmplitude(timbre_);
  float damp = damp_state_;
  float impulse = 0.0f;
  if (flags & EXCITER_FLAG_RISING_EDGE) {
    impulse = -amplitude * (0.05f + signature_ * 0.2f);
    plectrum_delay_ = static_cast<uint32_t>(
        4096.0f * parameter_ * parameter_) + 64;
  }
  while (size--) {
    if (plectrum_delay_) {
      --plectrum_delay_;
      if (plectrum_delay_ == 0) {
        impulse = amplitude;
      }
      damp = 1.0f - 0.997f * (1.0f - damp);
    } else {
      damp = 0.9f * damp;
    }
    *out++ = impulse;
    impulse = 0.0f;
  }
  damping_ = damp * 0.5f;
  damp_state_ = damp;
}

void Exciter::ProcessParticles(
    const uint8_t flags,
    float* out,
    size_t size) {
  if (flags & EXCITER_FLAG_RISING_EDGE) {
    particle_state_ = RandomSample();
    particle_state_ = 1.0f - 0.6f * particle_state_ * particle_state_;
    delay_ = 0;
    particle_range_ = 1.0f;
  }
  fill(&out[0], &out[size], 0.0f);
  if (flags & EXCITER_FLAG_GATE) {
    const uint32_t up_probability = uint32_t(0.7f * 4294967296.0f);
    const uint32_t down_probability = uint32_t(0.3f * 4294967296.0f);
    const float amplitude = GetPulseAmplitude(timbre_);
    while (size--) {
      if (delay_ == 0) {
        float amount = RandomSample();
        amount = 1.05f + 0.5f * amount * amount;
        if (Random::GetWord() > up_probability) {
          particle_state_ *= amount;
          if (particle_state_ >= (particle_range_ + 0.25f)) {
            particle_state_ = particle_range_ + 0.25f;
          }
        } else if (Random::GetWord() < down_probability) {
          particle_state_ /= amount;
          if (particle_state_ <= 0.02f) {
            particle_state_ = 0.02f;
          }
        }
        delay_ = static_cast<uint32_t>(particle_state_ * 0.15f * kSampleRate);
        float gain = 1.0f - particle_range_;
        gain *= gain;
        *out = particle_state_ * amplitude * (1.0f - gain);

        float decay_factor = 1.0f - parameter_;
        particle_range_ *= 1.0f - decay_factor * decay_factor * 0.5f;
      } else {
        --delay_;
      }
      ++out;
    }
  }
}

void Exciter::ProcessFlow(
    const uint8_t flags,
    float* out,
    size_t size) {
  float scale = parameter_ * parameter_ * parameter_ * parameter_;
  float threshold = 0.0001f + scale * 0.125f;
  if (flags & EXCITER_FLAG_RISING_EDGE) {
    particle_state_ = 0.5f;
  }
  while (size--) {
    float sample = RandomSample();
    if (sample < threshold) {
      particle_state_ = -particle_state_;
    }
    *out++ = particle_state_ + (sample - 0.5f - particle_state_) * scale;
  }
}

void Exciter::ProcessNoise(const uint8_t flags, float* out, size_t size) {
  while (size--) {
    *out++ = RandomSample() - 0.5f;
  }
}

/* static */
Exciter::ProcessFn Exciter::fn_table_[] = {
  &Exciter::ProcessMallet,
  &Exciter::ProcessPlectrum,
  &Exciter::ProcessParticles,
  &Exciter::ProcessFlow,
  &Exciter::ProcessNoise
};

}  // namespace elements
