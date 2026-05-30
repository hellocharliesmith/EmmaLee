#!/bin/bash
set -e

source ~/Developer/emsdk/emsdk_env.sh

echo "Compiling Rings DSP to WebAssembly..."

emcc rings-dsp/rings_wrapper.cpp \
  rings-source/rings/dsp/part.cc \
  rings-source/rings/dsp/fm_voice.cc \
  rings-source/rings/dsp/resonator.cc \
  rings-source/rings/dsp/string.cc \
  rings-source/rings/dsp/string_synth_part.cc \
  rings-source/rings/resources.cc \
  rings-source/stmlib/dsp/atan.cc \
  rings-source/stmlib/dsp/units.cc \
  rings-source/stmlib/utils/random.cc \
  -I rings-source/ \
  -DTEST \
  -O3 \
  -s WASM=1 \
  -s EXPORTED_FUNCTIONS='["_rings_init","_rings_set_param","_rings_set_note","_rings_trigger","_rings_process","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='RingsDSP' \
  -o public/rings.js

echo "Done: public/rings.wasm + public/rings.js"
