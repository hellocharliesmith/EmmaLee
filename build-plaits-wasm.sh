#!/bin/bash
set -e

source ~/Developer/emsdk/emsdk_env.sh

echo "Compiling Plaits DSP to WebAssembly..."

emcc rings-dsp/plaits_wrapper.cpp \
  rings-source/plaits/dsp/voice.cc \
  rings-source/plaits/dsp/chords/chord_bank.cc \
  rings-source/plaits/dsp/engine/additive_engine.cc \
  rings-source/plaits/dsp/engine/bass_drum_engine.cc \
  rings-source/plaits/dsp/engine/chord_engine.cc \
  rings-source/plaits/dsp/engine/fm_engine.cc \
  rings-source/plaits/dsp/engine/grain_engine.cc \
  rings-source/plaits/dsp/engine/hi_hat_engine.cc \
  rings-source/plaits/dsp/engine/modal_engine.cc \
  rings-source/plaits/dsp/engine/noise_engine.cc \
  rings-source/plaits/dsp/engine/particle_engine.cc \
  rings-source/plaits/dsp/engine/snare_drum_engine.cc \
  rings-source/plaits/dsp/engine/speech_engine.cc \
  rings-source/plaits/dsp/engine/string_engine.cc \
  rings-source/plaits/dsp/engine/swarm_engine.cc \
  rings-source/plaits/dsp/engine/virtual_analog_engine.cc \
  rings-source/plaits/dsp/engine/waveshaping_engine.cc \
  rings-source/plaits/dsp/engine/wavetable_engine.cc \
  rings-source/plaits/dsp/engine2/chiptune_engine.cc \
  rings-source/plaits/dsp/engine2/phase_distortion_engine.cc \
  rings-source/plaits/dsp/engine2/six_op_engine.cc \
  rings-source/plaits/dsp/engine2/string_machine_engine.cc \
  rings-source/plaits/dsp/engine2/virtual_analog_vcf_engine.cc \
  rings-source/plaits/dsp/engine2/wave_terrain_engine.cc \
  rings-source/plaits/dsp/fm/algorithms.cc \
  rings-source/plaits/dsp/fm/dx_units.cc \
  rings-source/plaits/dsp/physical_modelling/modal_voice.cc \
  rings-source/plaits/dsp/physical_modelling/resonator.cc \
  rings-source/plaits/dsp/physical_modelling/string.cc \
  rings-source/plaits/dsp/physical_modelling/string_voice.cc \
  rings-source/plaits/dsp/speech/lpc_speech_synth.cc \
  rings-source/plaits/dsp/speech/lpc_speech_synth_controller.cc \
  rings-source/plaits/dsp/speech/lpc_speech_synth_phonemes.cc \
  rings-source/plaits/dsp/speech/lpc_speech_synth_words.cc \
  rings-source/plaits/dsp/speech/naive_speech_synth.cc \
  rings-source/plaits/dsp/speech/sam_speech_synth.cc \
  rings-source/plaits/resources.cc \
  rings-source/stmlib/dsp/atan.cc \
  rings-source/stmlib/dsp/units.cc \
  rings-source/stmlib/utils/random.cc \
  rings-dsp/atmosphere_engine.cc \
  -I rings-source/ \
  -I . \
  -DTEST \
  -O3 \
  -s WASM=1 \
  -s EXPORTED_FUNCTIONS='["_plaits_init","_plaits_set_param","_plaits_set_model","_plaits_set_note","_plaits_trigger","_plaits_process","_plaits_set_level","_plaits_set_level_patched","_plaits_set_filter_enabled","_plaits_set_filter_cutoff","_plaits_set_filter_resonance","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='PlaitsDSP' \
  -o public/plaits.js

echo "Done: public/plaits.wasm + public/plaits.js"
