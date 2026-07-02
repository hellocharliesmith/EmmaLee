#!/bin/bash
set -e

source ~/Developer/emsdk/emsdk_env.sh

echo "Compiling Clouds DSP to WebAssembly..."

emcc rings-dsp/clouds_wrapper.cpp \
  rings-source/clouds/dsp/granular_processor.cc \
  rings-source/clouds/dsp/correlator.cc \
  rings-source/clouds/dsp/mu_law.cc \
  rings-source/clouds/dsp/pvoc/stft.cc \
  rings-source/clouds/dsp/pvoc/phase_vocoder.cc \
  rings-source/clouds/dsp/pvoc/frame_transformation.cc \
  rings-source/clouds/resources.cc \
  rings-source/stmlib/dsp/atan.cc \
  rings-source/stmlib/dsp/units.cc \
  rings-source/stmlib/utils/random.cc \
  -I rings-source/ \
  -DTEST \
  -O3 \
  -s WASM=1 \
  -s EXPORTED_FUNCTIONS='["_clouds_init","_clouds_set_param","_clouds_set_playback_mode","_clouds_set_freeze","_clouds_set_quality","_clouds_process","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='CloudsDSP' \
  -o public/clouds.js

echo "Done: public/clouds.wasm + public/clouds.js"
