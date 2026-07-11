#!/bin/bash
set -e

source ~/Developer/emsdk/emsdk_env.sh

echo "Compiling Rings exciter (Elements' Mallet/Plectrum/Particles/Flow/Noise) to WebAssembly..."

emcc rings-dsp/exciter_wrapper.cpp \
  rings-dsp/exciter_slim.cc \
  rings-dsp/exciter_svf_luts.cc \
  rings-source/stmlib/utils/random.cc \
  -I rings-source/ \
  -I rings-dsp/ \
  -DTEST \
  -O3 \
  -s WASM=1 \
  -s EXPORTED_FUNCTIONS='["_exciter_init","_exciter_set_model","_exciter_set_timbre","_exciter_set_parameter","_exciter_set_gate","_exciter_process","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='ExciterDSP' \
  -o public/exciter.js

echo "Done: public/exciter.wasm + public/exciter.js"
