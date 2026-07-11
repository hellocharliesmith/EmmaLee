# Emma Lee — Agent Handoff Guide

Read this first if you're picking up this project cold — whether you're Claude Code,
Codex, Cursor, or any other AI coding tool. It's written to be tool-agnostic.

## What this is

A public-facing, no-install browser synthesizer built for a non-technical lead
(AI-assisted development throughout — explain things in plain terms, not jargon).
Multitrack step sequencer, 5 tabs: 2 tracks of Mutable Instruments Rings, 1 track
of Mutable Instruments Plaits (melodic), a 3-voice drum kit (also Plaits, different
engines), and Master — see "Multitrack architecture" below and BACKLOG.md. Master
bus owns shared delay + reverb; each track sends into them independently.

- **Live:** https://emma-lee.hellocharliesmith.workers.dev
- **GitHub:** https://github.com/hellocharliesmith/EmmaLee
- **Local path:** `/Users/charliesmith/Claude Code Things/rings-synth/`
- **Feature backlog:** [BACKLOG.md](BACKLOG.md) — check this for queued ideas before
  starting new work. Remove items from it once shipped (don't let it drift from reality).

## Stack

- Vite + React 19 + TypeScript
- Tone.js — **only** used for the Transport clock (`Tone.Loop`). The actual audio
  graph is 100% native Web Audio API, not Tone.js nodes.
- Mutable Instruments Rings + Plaits — real eurorack module source (`rings-source/`,
  a clone of the actual hardware firmware repos) compiled to WASM via Emscripten,
  each running inside its own AudioWorklet.
- Native `ConvolverNode` for reverb (generated IRs, not pre-recorded samples by default).
- Cloudflare Workers with Assets for hosting (not Pages — equivalent, deploys via wrangler).

## Running it

```bash
npm run dev      # vite dev server, localhost:5173
npm run build    # tsc -b && vite build -> dist/
```

## Deploying — ALWAYS do all three steps, in this order

```bash
npm run build
npx wrangler deploy
git add <files> && git commit -m "..." && git push
```

Wrangler deploys whatever is in `dist/`, so build must happen first. The user expects
code on GitHub AND live after any session that touches source — never skip the push,
never skip the deploy. Cloudflare does not auto-deploy from GitHub pushes here (despite
what the wrangler.jsonc might suggest) — the explicit `wrangler deploy` is what ships it.

## Architecture map

```
src/
  audio/
    engine.ts       — the native Web Audio graph: per-track instances (ringsA,
                       ringsB, plaits, drumHihat, drumSnare, drumKick — each its
                       own AudioWorkletNode, 6 total) + a shared master bus owning
                       delay, reverb, and Clouds (see "Clouds granular effect"
                       below). initAudio() builds it once on first user
                       gesture (browser autoplay rules). A generic `tracks` Map
                       (TrackId -> {worklet, dryGain, delaySend, reverbSend,
                       cloudsSend}) backs triggerNote/setTrackSend/setTrackVolume
                       for ANY track type. Instrument-specific setters stay separate:
                       setRingsParam/setRingsModel(trackId,...) vs
                       setPlaitsParam/setPlaitsModel(...) (Plaits melodic has only
                       one track, so no trackId needed there). Drum voices reuse
                       createTrackWorklet + the 'plaits-processor' processor, just
                       locked to a fixed engine/note via createDrumTrack(). Master
                       setters (setReverbWet, setDelayTime, setCloudsParam, etc.)
                       are global, untouched.
    grids.ts         — hand-ported TS port of Mutable Instruments Grids'
                       pattern_generator.cc (drum output mode only). Pure
                       control-rate logic (32-step pattern by interpolating 4
                       corner patterns in an X/Y space) — no WASM, runs once per
                       "Generate" click on the Drums tab. See "Grids pattern
                       generator" below.
    gridsNodeTables.ts — the 25 lookup tables grids.ts interpolates between,
                       auto-extracted from rings-source/grids/resources.cc — do
                       not hand-edit, regenerate from resources.cc if it changes.
    utils.ts         — small helpers (e.g. divisionSeconds for BPM-synced delay times)
  hooks/
    useSequencer.ts  — multitrack sequencer state: Record<TrackId, TrackSeqState>,
                       one 32-step page per track (v1 simplification — no multi-page
                       song sections yet, see BACKLOG.md). One shared Tone.Loop reads
                       LIVE refs (tracksRef) every tick and dispatches a trigger per
                       track — NOT closures — so editing a track while playing takes
                       effect immediately. Editing functions (toggleNote etc.) always
                       target whichever track is `activeTrack`. Plaits melodic track
                       reuses the exact same step-grid model as Rings (monophonic
                       melodic, same piano roll) — only the instrument panel differs.
                       IMPORTANT: this hook's `TrackId` (4 values: ringsA/ringsB/
                       plaits/drums — the UI tabs) is a DIFFERENT, independent type
                       from engine.ts's `TrackId` (6 values — the actual worklets).
                       The Drums tab is one grid here but dispatches to 3 separate
                       engine.ts tracks — see the playback loop's `if (id === 'drums')`
                       branch, which fires all active rows simultaneously (no strum
                       stagger, unlike melodic multi-note steps).
    useSavedSongs.ts — localStorage-backed save/load list
  components/
    PianoRoll.tsx    — the step grid, shared across all tracks and Kids Mode.
                       `rowLabels`/`noStrum` props (added for Drums) swap chromatic
                       note names for fixed text rows and hide piano keys/root-
                       highlighting/strum row/scroll buttons when not needed.
    RingsControls.tsx  — takes a `trackId` prop, calls engine functions itself
                       (App.tsx callbacks are pure state setters).
    PlaitsControls.tsx — Engine picker (6 curated engines) + Harmonics/Timbre/
                       Morph/Decay sliders, each with the same 4-slot LFO block
                       as RingsControls (shared shape-cycle icon/logic lives in
                       lfoCycle.tsx). LPG Colour is NO LONGER exposed
                       (2026-07-09): it read like a toggle rather than a useful
                       continuous knob, so it's pinned to 1.0 (the full/"darker"
                       LPG character) at every point params reach the engine —
                       the field survives in the save format for compatibility
                       but the UI never shows it. No trackId prop — only one
                       Plaits melodic track.
    DrumControls.tsx  — per-voice Tone/Decay knobs (Hi-Hat/Snare/Kick).
    GridsControls.tsx — the Grids "Generate Pattern" panel on the Drums tab:
                       X/Y sliders, density knob per voice, randomness knob.
                       Renders below DrumControls when activeTrack==='drums'.
                       Calls src/audio/grids.ts directly (no engine.ts
                       involvement — this only writes sequencer step data, no
                       audio graph changes) then useSequencer's setPageSteps()
                       to bulk-write the current page's 32 steps in one shot.
    DelayControls.tsx, ReverbControls.tsx — master-only, no per-track concept
    CloudsControls.tsx — master-only Clouds granular effect panel (Freeze,
                       Mix, Position/Size/Pitch/Density/Texture/Feedback/
                       Reverb). See "Clouds granular effect" below.
    Knob.tsx, SaveLoad.tsx, WaveformMeter.tsx
  App.tsx            — track tabs (Rings A / Rings B / Plaits / Drums / Master) +
                       viewSection toggle. `trackParams` is a discriminated union
                       (RingsParamsState | PlaitsParamsState | DrumParamsState)
                       since each instrument's control surface is a different shape
                       — narrow on `.kind` before rendering the per-track panel.
                       Drums' Sends knobs broadcast to all 3 engine.ts drum tracks
                       at once (setVolumeFor/setSendFor helpers) since there's no
                       per-voice mixing UI. kids-mode branch pinned to ringsA only.
public/
  rings-processor.js  — Rings AudioWorklet (one registered class, instantiated
                       twice — once per Rings track). Also loads a SECOND WASM
                       instance (`exciter.wasm`) in the same worklet and feeds its
                       output into `rings_process`'s real `input` buffer when a
                       track's exciter is set to anything but 'internal' — see
                       "Rings exciters" below.
  plaits-processor.js — Plaits AudioWorklet, modeled on rings-processor.js
                       (as of 2026-07-09 it has the same 4-slot audio-thread
                       LFO system too, targeting params 0-3; still no internal
                       reverb toggle). Instantiated 4 times: melodic Plaits +
                       3 drum voices, all from the SAME compiled binary, each
                       just locked to a different engine index — the drum
                       voices never receive 'set-lfo', so LFOs stay dormant
                       there. Has a 'set-note' message type (distinct from
                       'trigger') that sets pitch WITHOUT firing — used once at
                       drum-voice creation so they don't sound on page load.
  clouds-processor.js — Clouds granular effect worklet. UNLIKE the other three,
                       this one has a real audio INPUT (numberOfInputs: 1) — it's
                       an insert effect on the master bus, not a self-contained
                       voice. Also does its own sample-rate conversion (a
                       continuous-phase LinearResampler class defined in this
                       file) since Clouds' DSP is hardcoded to 32kHz internally
                       but the AudioContext runs at 44.1/48kHz — see "Clouds
                       granular effect" below for why that matters.
  Both/all load WASM via WebAssembly.instantiate directly (importScripts is NOT
  available inside AudioWorklet global scope). Each WASM module is compiled ONCE
  in engine.ts; the same compiled Module is posted to every instance that needs it
  (2x for Rings, 4x for Plaits, 1x for Clouds) — saves re-compiling per instance.
  rings.wasm/rings.js, plaits.wasm/plaits.js, clouds.wasm/clouds.js — compiled
                       output, see "Recompiling the WASM" below. NOTE: the
                       worklets only ever fetch/instantiate the .wasm file
                       directly — the Emscripten-generated .js glue (MODULARIZE
                       output) is NOT used at runtime by any worklet (can't run
                       Emscripten's JS runtime inside AudioWorkletGlobalScope
                       cleanly); each worklet reimplements the tiny bit of glue
                       it needs by hand (memory-grow import, direct exports["x"]
                       calls) — see "Discovering WASM export names" below.
rings-dsp/
  rings_wrapper.cpp  — thin C wrapper exposing rings_init/set_param/trigger/etc.
                       `rings_process` takes a real `input` buffer (copied into
                       Rings' `in_buffer` each block) plus `rings_set_internal_exciter`
                       toggling `performance.internal_exciter` — see "Rings exciters"
                       below for the full feature this enables.
  exciter_wrapper.cpp — wraps a trimmed fork of Elements' `Exciter` class
                       (`exciter_slim.h/.cc`, NOT the original `elements/dsp/exciter.*`
                       — see "Rings exciters" below for why). Exposes exciter_init/
                       set_model/set_timbre/set_parameter/set_gate/process.
                       `build-exciter-wasm.sh` compiles it to `public/exciter.wasm`.
  plaits_wrapper.cpp — same pattern for Plaits, exposing plaits_init/set_param/
                       set_model/set_note/trigger/process. Compiles Plaits' full
                       Voice class (all 22 engines — can't selectively compile,
                       Voice statically includes them all as members); the engine
                       picker in PlaitsControls.tsx (and the fixed engines used by
                       the 3 drum voices) just limit which indices get used, not
                       what's in the binary — this is also why drums needed no new
                       WASM compile, just more JS-side worklet instances.
  clouds_wrapper.cpp — same pattern for Clouds, wrapping clouds::GranularProcessor.
                       Exposes clouds_init/set_param/set_playback_mode/set_freeze/
                       set_quality/process. Uses static byte-array buffers sized
                       WAY beyond real hardware (1MB + 128KB vs ~116KB + ~64KB)
                       since a browser tab isn't RAM-constrained — gives several
                       seconds of freeze/loop buffer instead of ~1s. See "Clouds
                       granular effect" below for the full writeup, including the
                       sample-rate caveat and what's NOT wired up yet (spectral
                       playback mode, per-track Clouds Send knob).
rings-source/        — full clone of Mutable Instruments' actual firmware source
                       (Rings, Plaits, Grids, Clouds all present — NOT Beads, see
                       BACKLOG.md's Beads entry for why).
build-wasm.sh        — the emcc compile command for Rings
build-plaits-wasm.sh — same for Plaits (longer file list — speech synth, FM,
                       physical modelling, chords all need compiling in since
                       Voice references all engines)
build-clouds-wasm.sh — same for Clouds (granular_processor.cc + correlator +
                       mu_law + resources + the pvoc/ phase-vocoder files, which
                       are unavoidable even though the spectral playback mode
                       itself isn't exposed in the UI — PhaseVocoder is a plain
                       member of GranularProcessor, not conditionally compiled).
build-exciter-wasm.sh — compiles `exciter_wrapper.cpp` + `exciter_slim.cc` +
                       `exciter_svf_luts.cc` (NOT `elements/resources.cc` — see
                       "Rings exciters" below) to `public/exciter.wasm`, 13.6KB.
```

## Multitrack architecture (added 2026-06-21, completed same day)

6 AudioWorkletNode instances back 5 UI tabs today: `ringsA`, `ringsB`, `plaits`,
the 3-voice drum kit (`drumHihat`/`drumSnare`/`drumKick`, one UI tab/grid but 3
separate engine.ts tracks), and Master (not a track, just the shared bus controls).
All 4 originally-planned phases shipped 2026-06-21 — see BACKLOG.md's "Recently
shipped" log for the day-by-day breakdown.

**Signal flow per track:** `worklet → dryGain → masterGain` (always, fixed ~0.85 level,
no per-track volume fader yet) AND `worklet → delaySend → delayBusInput` AND
`worklet → reverbSend → reverbBusInput`, where `delaySend`/`reverbSend` gain values are
the per-track Sends knobs (0–1, default 0.5 each). `delayBusInput`/`reverbBusInput` feed
the (single, shared) delay and reverb chains, whose wet return level is controlled by
the Master tab's existing Mix knobs — same role as before, just now fed by multiple
tracks instead of one.

**Bug (introduced in the original Phase 1 refactor, found and fixed 2026-06-21
during drum-tone debugging): `wetGain` — the final node in the reverb chain
(`reverbBusInput → preDelay → toneFilter → reverbUnit → wetGain`) — was never
connected onward to `masterGain`.** The delay chain had the equivalent connection
(`delayMixGain.connect(masterGain)`); the matching line for `wetGain` was missing.
This meant reverb was completely silent for ALL tracks (not just drums) for the
entire multitrack era — the reverb Mix knob, per-track reverb sends, and reverb
type selector all visibly worked but produced zero audible reverb, since the whole
wet signal path dead-ended before reaching the speakers. **If you ever rebuild or
significantly restructure the master bus again, explicitly verify every terminal
node in a chain actually connects to `masterGain`** — this class of bug (a complete,
silent dead-end at the very last node) is easy to miss in code review since
everything UPSTREAM looks correct.

**Removed**: the "Rings" reverb-type option (toggled one worklet's own internal FDN
reverb directly, bypassing the master chain) doesn't generalize to a shared master
effect across multiple Rings tracks — it was tied 1:1 to a single worklet. Dropped
`setRingsReverbEnabled`/`setRingsReverbParams`/`restoreGains` from engine.ts. Worth
revisiting later as a per-Rings-track toggle instead of a master reverb type, if wanted.

**Song structure simplified for v1**: dropped the old 4-page-per-track "song section"
system (each track is just one 32-step page now) to keep the first multitrack release's
state/UI surface small. Old single-track saves still load (migrated into `ringsA`,
`ringsB`/`plaits` default to empty) — see `migrateLegacy()` in App.tsx.

**Plaits engine indices follow hardware registration order, NOT header declaration
order.** `voice.h` declares engine member variables in one order, but `voice.cc`'s
`Voice::Init()` calls `engines_.RegisterInstance(...)` in a *different* order, and
THAT call order is what assigns the actual index used by `patch.engine`. The real
mapping (confirmed independently via hardcoded `engine_index == 15`/`== 7` checks
inside `Voice::Render` itself, which match Speech=15 and Chiptune=7 respectively):

```
0 Virtual Analog VCF   6  String Machine     12 Additive   18 Particle
1 Phase Distortion     7  Chiptune           13 Wavetable   19 String
2-4 Six-Op (3 banks)   8  Virtual Analog     14 Chord       20 Modal
5 Wave Terrain         9  Waveshaping        15 Speech      21 Bass Drum
                       10 FM                 16 Swarm       22 Snare Drum
                       11 Grain              17 Noise       23 Hi-Hat
```

If you add more engines to the picker later, verify against this table (or re-derive
from `rings-source/plaits/dsp/voice.cc`'s `RegisterInstance` call order) — don't
guess from `voice.h`'s member order, that was the mistake made (and caught) while
building Phase 3.

**Discovering WASM export names**: binaryen's `-O3` minifies WASM export names to
single letters (e.g. `plaits_init` becomes `d`), and the mapping isn't predictable
in advance — it depends on compile order/internals. To find it after compiling:
`node -e "WebAssembly.compile(require('fs').readFileSync('public/X.wasm')).then(m
=> console.log(WebAssembly.Module.exports(m)))"` shows the letters, but not which
function each maps to. Better: grep the generated glue JS (`public/X.js`, built
alongside the `.wasm` since `-s MODULARIZE=1` produces it) for
`wasmExports\["x"\]` assignments next to the real function names — that reveals the
mapping directly. Already done for Plaits: d=init, e=set_param, f=set_model,
g=set_note, h=trigger, i=process, j=malloc, k=free, b=memory.

**Verification caveat**: the AudioWorklet message-port handshake (`load-wasm` →
`ready`) could not be runtime-verified in the Claude Code preview/headless-browser
tool during this work — synthetic clicks there don't carry real `navigator.userActivation`
(`isActive: false`), which can affect Chrome's audio-thread scheduling for worklets.
Every phase (1: 2 Rings, 3: +Plaits, 4: +3 drum voices) was deployed to the live site
and reviewed carefully by static inspection instead, with the user confirming actual
audio playback in a real browser after each phase. If you're picking up further work
on this (e.g. a new track type), the same constraint applies — you likely can't
verify real audio in an automated preview tool either; deploy and ask the user to confirm.

**Drum engine param mapping is DIFFERENT from melodic Plaits — `patch.decay`
(param 3) does nothing for drums.** Plaits' bass_drum/snare_drum/hi_hat engines are
registered in `voice.cc` as `already_enveloped = true`, so `Voice` bypasses its own
decay envelope/LPG for them entirely. Confirmed directly in their DSP source
(`analog_bass_drum.h`, `analog_snare_drum.h`, `hi_hat.h` — all three `Render()`
signatures use identical param names): for these 3 engines specifically,
**param 1 (timbre) = "tone"** (filter cutoff) and **param 2 (morph) = "decay"**
(envelope time); param 0 (harmonics) is a secondary character control (drive/
snappy/noisiness depending on engine, not currently exposed in the UI). This bit a
real session — Decay was originally wired to `patch.decay` (silently did nothing)
and Tone was wired to harmonics instead of timbre (caused the Hi-Hat to sound
clangy/FM-ish, since harmonics there is actually a noise-mixing amount, not a tone
filter). If you add more drum controls or new drum-capable engines later, check the
engine's actual `Render()` signature in `rings-source/plaits/dsp/drums/` before
assuming the melodic harmonics/timbre/morph/decay mapping applies — it doesn't,
for any engine registered `already_enveloped` in `voice.cc`.

**Drum velocity (added 2026-06-21)**: per-step (per-column, not per-voice),
100/75/50/25%, applied to every active voice in that step. Implemented entirely in
`plaits-processor.js` as a sticky output-sample multiplier (`this.velocity`, default
1.0, updated whenever a 'trigger' message includes one) — deliberately NOT routed
through the WASM/C++ `accent` parameter, to avoid any risk to the already-confirmed
melodic Plaits sound (which never sends a velocity, so its multiplier never moves).
If you need true accent/dynamics response from the Plaits engines themselves later
(richer than a flat volume scale), that would mean setting `modulations.level_patched
= true` and wiring level through the wrapper — but only for drum-voice instances,
since each track is a separate WASM instance with independent statics.

**React Fast Refresh can produce a false-positive "Rules of Hooks" console error**
after many rapid edits to a hook file (e.g. `useSequencer.ts`) without a full reload —
the error compares hook call order across HMR-patched renders, not real renders. If
you see this, do a full dev-server restart (not just `location.reload()`) before
concluding there's a real bug — confirmed during this session's work.

## Grids pattern generator (added 2026-07-01)

`src/audio/grids.ts` is a hand-ported TS port of Mutable Instruments Grids'
`pattern_generator.cc` (drum output mode only — Euclidean mode isn't ported,
no UI equivalent). This is pure control-rate logic (a 32-step pattern per
voice, built by interpolating between 4 corner patterns in a 2D X/Y space
using the original's 8-bit fixed-point `U8Mix`/`U8U8MulShift8` arithmetic,
reproduced exactly, not approximated with floats) — no oscillators, no
sample-rate concerns, so it runs as plain TypeScript rather than WASM. It
only executes once per "Generate Pattern" click, not per audio sample, so a
WASM/AudioWorklet round trip would be pure overhead.

`src/audio/gridsNodeTables.ts` holds the 25 lookup tables (`node_0`..`node_24`
from `rings-source/grids/resources.cc`, 96 bytes each = 3 instruments × 32
steps) the interpolation reads from — auto-extracted with a small Node
script, not hand-transcribed. Regenerate it the same way if the upstream
source ever changes; don't hand-edit.

**Integration**: `src/components/GridsControls.tsx` renders below the
per-voice Tone/Decay knobs on the Drums tab. X/Y sliders + a density knob per
voice (Hi-Hat/Snare/Kick) + a randomness knob. "Generate Pattern" calls
`generateGridsPattern()` then remaps Grids' own instrument order (bd/sd/hh,
matching the hardware's bit layout) to the app's drum row order (Hi-Hat/
Snare/Kick, top to bottom — see `GRIDS_INSTRUMENT_BD/SD/HH` constants and the
remap comment in `App.tsx`'s `handleGenerateDrums`), then calls the new
`setPageSteps()` on `useSequencer.ts` to bulk-write all 32 steps of the
current page in one shot (added specifically for this — every other step
editor there mutates one column at a time). Per-step accent (Grids' own
"level > 192" concept) maps to the existing per-column velocity system: 100%
if any active voice that step was accented, 75% otherwise.

**Verified**: logged several X/Y/density combinations via a standalone `tsx`
script and eyeballed the 32-step patterns — kick on downbeats, density knobs
visibly changing fill, X=0/Y=0/density=0 producing an empty pattern, no
crashes across the parameter range. Did NOT verify the "Generate" button
click in an actual running browser (see "Verification caveat" in the
Multitrack architecture section above — the same headless-preview
limitation applies here); traced the data flow through
`GridsControls.tsx` → `App.tsx`'s `handleGenerateDrums` → `setPageSteps` →
`useSequencer.ts`'s `updateTrack` → re-render instead. `npm run build`
passes with no TS errors.

**Not persisted**: the Generate panel's X/Y/density/randomness values live in
local `App.tsx` state (`gridsUi`), not the save format — regenerating just
overwrites the current page's steps like any manual edit would, so there was
no strong need to save the generator inputs themselves. See BACKLOG.md if
that's wanted later.

## Clouds granular effect (added 2026-07-01)

Clouds is wired in as a **master-bus send effect**, architecturally the same
pattern as the existing delay/reverb sends (`engine.ts`): each track worklet
gets a `cloudsSend` gain (currently a fixed default level, no per-track UI
knob — see BACKLOG.md), summed into a new `cloudsBusInput`, which feeds a new
`clouds-processor` AudioWorkletNode. Unlike Rings/Plaits/drum worklets (which
are self-contained voices, `numberOfInputs: 0`), the Clouds worklet has a
REAL audio input (`numberOfInputs: 1`) — it granulates whatever's actually
playing on the master bus, then returns through `cloudsWetGain` ("Mix") back
into `masterGain`. That return is deliberately one-way, NOT tapped from
`masterGain`'s own output — doing that would create an audio feedback loop
back into the granulator (the master bus doesn't wrap around into effect
inputs anywhere else in this app either, for the same reason).

**DSP**: `rings-dsp/clouds_wrapper.cpp` wraps `clouds::GranularProcessor`
(`rings-source/clouds/dsp/granular_processor.{cc,h}`) with the same
`extern "C"` shim pattern as the Rings/Plaits wrappers:
`clouds_init/set_param/set_playback_mode/set_freeze/set_quality/process`.
Buffer sizes (1MB + 128KB) are much larger than real hardware (~116KB +
~64KB, see `rings-source/clouds/clouds.cc`'s `block_mem`/`block_ccm`) since a
browser tab isn't RAM-constrained — gives several seconds of freeze/loop
buffer instead of ~1s. `build-clouds-wasm.sh` compiles it; needed to link the
`pvoc/` phase-vocoder files too even though the spectral playback mode isn't
exposed in the UI, since `PhaseVocoder` is an unconditional member of
`GranularProcessor`, not compiled in only when spectral mode is selected.

**Sample-rate mismatch (important if you touch this again)**: Clouds' DSP is
hardcoded to assume 32kHz internally — confirmed via the real firmware's
`clouds.cc` (`codec.Init(master, 32000)`) and `clouds/test/clouds_test.cc`
(`kSampleRate = 32000`). This is NOT the same as Rings/Plaits, which both
assume 48kHz (matching this app's AudioContext natively, see
`rings-source/plaits/dsp/dsp.h`'s `kSampleRate`). Feeding Clouds audio
unchanged at 48kHz would make grain duration, the pitch shifter, and the
built-in reverb all run ~1.5x too fast. `public/clouds-processor.js` handles
this itself with a small continuous-phase `LinearResampler` class — downsamples
each block to 32kHz before `clouds_process()`, upsamples the result back to
context rate before writing to output, carrying fractional phase AND the
previous block's last sample across calls so there's no click at block
boundaries. If you ever touch the resampling code, know that it was verified
(see below) at both 44.1kHz and 48kHz context rates — retest both if you
change it.

**HARD CONTRACT (learned the expensive way, 2026-07-10)**:
`GranularProcessor::Process()` must be called with **exactly 32-frame blocks**
(`kMaxBlockSize`, clouds/dsp/frame.h — the firmware only ever calls it with
32). The 16-bit quality modes happen to tolerate other sizes; the 8-bit µ-law
modes run audio through a fixed 2:1 `SampleRateConverter` (that's the "16kHz"
in their labels) that TRAPS ("memory access out of bounds") on any non-32
block. The original wrapper chunked arbitrary sizes (a 128-frame 48kHz block
downsamples to ~85 = 32+32+21), so the moment `setCloudsQuality(2)` became
the boot default, the first-ever audio block killed the worklet — and an
uncaught exception in an AudioWorklet's `process()` permanently unloads the
processor WITH NO CONSOLE ERROR unless someone listens for it. Result: Clouds
was totally silent in production for days while every dry/delay/reverb path
worked. Fixes (all in `clouds-processor.js` + `engine.ts`, no recompile):
an input FIFO feeds the WASM exact 32-frame blocks; `process()` wraps the
WASM call in try/catch and degrades to silence + posts 'process-error' to the
main thread; `engine.ts` installs `onprocessorerror` handlers on every
worklet node so this failure class can never be silent again.

**Quality-mode buffer warm-up (expected behavior, not a bug)**: with this
build's enlarged buffers, effective sample memory is q0 ≈ 2s, q2 ≈ 8s,
q1 ≈ 16s, q3 ≈ 32s. Grains read seconds "back" from the write head, so after
a quality switch (which resets buffers) the texture fades in over roughly
half the buffer length — the mono modes especially can seem dead for 8-16s
before blooming. Verified by feeding 40s of sine through quality 1 in Node.

**Verified**: three layers. (1) Raw WASM: instantiated `public/clouds.wasm`
directly in Node the same way the worklet does (manual `WebAssembly.instantiate`
with a minimal import object, NOT the Emscripten glue .js — see "Discovering
WASM export names" below for why), fed it a synthesized sine wave, granulated
it live, froze the buffer, granulated the frozen buffer — got sensible
RMS/peak in both cases, no NaN, no runaway clipping. Note: `density=0.5` is a
genuine "dead zone" in Clouds' own algorithm (zero grains scheduled between
0.47–0.53) — if you test this again and get silence, check density first,
it's not necessarily a bug. (2) Resampling logic: stubbed
`AudioWorkletProcessor`/`registerProcessor`/`sampleRate` in a Node `vm`
context and ran `clouds-processor.js`'s actual unmodified `process()` loop
at both 48kHz and 44.1kHz, toggling freeze mid-stream — non-silent, no
NaN/Inf, FIFOs stayed bounded. (3) 2026-07-10, same vm harness after the
32-frame-block fix: all four quality modes at both context rates, µ-law
freeze/unfreeze included — audible steady-state RMS, zero NaN, max combined
FIFO depth ≤ 44 samples (~1ms). IMPORTANT: layers 1-2 were originally run
ONLY at the default 16-bit quality, which is exactly how the µ-law crash
shipped — if you touch this code, rerun the harness across ALL FOUR quality
modes, not just the default. Still not verified in an actual running browser —
same headless-preview limitation as the rest of this app's AudioWorklet work
(see "Verification caveat" in the Multitrack architecture section above).

**What's NOT done / known gaps** (see BACKLOG.md for the actionable version):
- No per-track Clouds Send knob yet — every track feeds the bus at the same
  fixed level (`cloudsSend.gain.value = 0.4` in `createTrackWorklet`).
  Architecturally ready (mirrors `delaySend`/`reverbSend` exactly, and
  `setTrackSend`'s `kind` union already includes `'clouds'`) — just needs a
  3rd knob added to every track panel + a save-format field, deliberately
  deferred to keep this session's UI/save-format surface smaller.
- Clouds' parameters (`cloudsUi` in `App.tsx`) are NOT persisted in the save
  format, same scope decision as the Grids generator UI state above.
- Spectral playback mode (`clouds_set_playback_mode(3)`) compiles and links
  but is untested and not exposed in `CloudsControls.tsx` — only Granular
  mode (0) is used. Stretch/Looping-delay modes (1/2) are wired in the
  wrapper but also not exposed in the UI yet.
- The resampler is linear interpolation, not a proper windowed-sinc
  resampler — adequate for a granular texture effect, introduces some
  aliasing that a "transparent" resampler wouldn't. Not expected to matter
  much for this use case but worth knowing if the wet signal sounds slightly
  gritty even at low density/texture settings.

## Rings exciters (added 2026-07-10)

Rings only ever excited itself with its own internal noise burst/pulse
(`performance.internal_exciter = true`, unconditional). The actual audio-rate
excitation input Rings' DSP reads from (`in_buffer` in `rings_wrapper.cpp`,
copied into `resonator_input_` by `rings::Part::Process` for the active voice)
was architecturally supported but always fed silence. This feature wires that
port up to Elements' `Exciter` class — Mutable's OTHER module, whose entire
job on real hardware is generating excitation signals for exactly this kind
of resonator — compiled to a second, small WASM module running inside the
same `rings-processor.js` worklet.

**5 of Elements' 7 exciter models are exposed**: Mallet, Plectrum, Particles,
Flow, Noise (plus `'internal'` = today's original behavior, selectable per
Rings track). **`SAMPLE_PLAYER`/`GRANULAR_SAMPLE_PLAYER` are deliberately
excluded** — both depend on Elements' baked-in sample ROM
(`smp_sample_data`/`smp_noise_sample`/`smp_boundaries` in
`rings-source/elements/resources.cc`), which is **~42,000 of that file's
~44,600 lines (94%)**. Worse, `Exciter`'s `fn_table_` (a function-pointer
dispatch table) keeps ALL 7 `Process*` methods linked regardless of which
model is selected at runtime — "just not selecting" those 2 models in the UI
would NOT have avoided linking in the sample data. The only way to actually
drop it was forking the class: `exciter_slim.h/.cc` is a trimmed copy of
`elements/dsp/exciter.{h,cc}` with the 2 sample-player models, `set_meta`,
`damping()`/`filter()` getters, and `phase_` removed. `exciter_svf_luts.h/.cc`
carries just the 4 small SVF filter LUTs (`lut_approx_svf_gain/g/r/h`, ~450
lines) the remaining 5 models need, hand-extracted from `resources.cc` — do
NOT link the original `elements/resources.cc` into this build, that's the
94%-dead-weight file this whole fork exists to avoid. Result: 13.6KB compiled
(vs. Clouds' 99KB, Plaits' 198KB, Rings' 56KB), confirming the strategy worked.

**Every model shares 2 knobs**: `timbre` (filter cutoff, same meaning for all
5 models) and `parameter` (per-model meaning — decay/pick-delay/particle-decay/
texture/resonance, see `EXCITER_PARAMETER_LABEL` in `RingsControls.tsx`). One
Model dropdown + these 2 sliders covers every model — no per-model control sets.

**Gate length, not real note-off**: Elements' exciter reacts to rising/falling
edges and a held gate (`ExciterFlags`). The sequencer only fires one-shot
triggers (`StepData` has no note-off/duration concept), so a synthesized
**Gate (ms)** parameter (20–800ms, default 80) fakes a held-gate window per
trigger — long enough for Flow/Particles to have something to work with,
short enough to stay "one step = one hit."

**Fast-retrigger gotcha**: if a new trigger arrives while the previous gate
hasn't closed yet, naively re-asserting `gate=1` produces NO edge (the WASM's
internal `gate_was_on` is already true) — Mallet/Particles silently drop the
onset. Fixed in `rings-processor.js` with a one-chunk "force gate low, then
high again" retrigger-gap (`pendingExciterRetriggerGap`): a mid-gate trigger
closes the gate for one ~2ms chunk (clean falling edge), then reopens it next
chunk (clean fresh rising edge). Verified via a 5x-rapid-retrigger harness —
every trigger produces its own onset.

**Sample rate**: like Clouds, Elements' DSP is hardcoded to 32kHz internally
(`elements::kSampleRate`, `elements/dsp/dsp.h`) — unlike Rings' own DSP, which
IS sample-rate-agnostic (`rings_init(sample_rate)`). `rings-processor.js`
reuses the same `LinearResampler` technique as `clouds-processor.js` (mono
variant) to upsample the exciter's 32kHz output to the real AudioContext rate
before feeding it into `rings_process`.

**Gain staging**: the Noise model's resonant filter can peak ~8.7x at extreme
timbre/parameter settings (observed in isolated testing) — `EXCITER_GAIN =
0.15` plus a hard `[-1, 1]` clamp in `_fillExcitationQueue` tames this without
noticeably attenuating the other 4 (much calmer) models.

**WASM export-letter gotcha (easy to get wrong, bit this session)**:
Emscripten's minified export letters (`exports.d`, `.e`, etc.) are assigned
in **source declaration order within the .cpp file**, NOT the order functions
appear in `build-*-wasm.sh`'s `EXPORTED_FUNCTIONS` array (that array only
controls what gets exported, not the letter each one gets). A Node
regression test using the wrong letter for `rings_set_internal_exciter`
silently called the wrong function (looked like the toggle had no effect).
After ANY wrapper change, re-verify the real mapping via an `-O1` debug build
(preserves real names) or by grepping the generated glue `.js`'s
`wasmExports["x"]` assignments (see "Discovering WASM export names" above) —
never assume letters stayed stable just because the array order didn't change.
Current mappings: rings.wasm — `d`=init, `e`=set_param, `f`=set_model,
`g`=set_note, `h`=trigger, `i`=set_internal_exciter, `j`=reverb_enable,
`k`=reverb_set, `l`=process(new 3-arg signature), `m`=malloc, `n`=free.
exciter.wasm — `d`=init, `e`=set_model, `f`=set_timbre, `g`=set_parameter,
`h`=set_gate, `i`=process, `j`=malloc, `k`=free.

**C++ linkage gotcha**: `const` globals at namespace scope default to
INTERNAL linkage in C++ (unlike C), so `exciter_svf_luts.cc` originally threw
`undefined symbol` linker errors defining the LUT arrays without a prior
`extern` declaration in the same translation unit. Fixed by giving them their
own header (`exciter_svf_luts.h`, `extern const float ...[];`) and
`#include`-ing it at the top of the `.cc` file before the definitions —
mirrors how the original `resources.cc`/its header do it.

**Save format**: `RingsTrackState.exciter?: ExciterState` (optional, so old
saves without it default to `'internal'` via `?? DEFAULT_EXCITER` in
`App.tsx`'s `loadSong` — same pattern as `cloudsSend`/`lpgColour`). Two new
presets, "Bowed Drone" (Flow, long gate, sustained bowed character) and
"Granular Sparkle" (Particles, short gate), show off what this adds that
Rings' internal exciter alone can't do — `RingsPreset.exciter` is likewise
optional; presets that omit it leave whatever exciter the track already had
untouched (`loadRingsPreset` in `App.tsx`).

**Verified**: Node `vm` harness (same technique as the Clouds fix) running
the actual `rings-processor.js` with both real compiled `.wasm` files,
covering: default internal-exciter path stays byte-identical to pre-feature
behavior, all 5 external models produce non-silent/no-NaN output, switching
from an external model back to `'internal'` mid-session cleanly reverts, and
the 5x fast-retrigger stress case. Also spot-checked in a real running
browser (UI dropdown + sliders, model switching, preset loading) — see
"Verification caveat" above for why deeper audio-output verification still
needs the user's ears.

## Key decisions worth knowing before you change things

- **Color system (added 2026-06-21)**: CSS custom properties in `:root` (App.css)
  define the raw palette (rose/teal/sage/slate/neutral-dark — Butter and Neutral
  Sand exist in the source palette but are intentionally not wired in). Per-track
  accent is `--accent`/`--accent-dark`/`--accent-light`, switched via a
  `.app.track-rings-b` / `.track-plaits` / `.track-drums` / `.track-master`
  modifier class set in App.tsx based on `activeTrack`/`viewSection` — default
  (no class) is Rose for Rings A. **If you add a new track type, add its accent
  override here and a corresponding class branch in App.tsx**, following the same
  pattern. Two places can't read CSS vars directly and need special handling:
  `Knob.tsx`'s SVG (`style={{ stroke: 'var(--accent)' }}` works; the bare SVG
  `stroke="..."` attribute form does NOT reliably read custom properties) and
  `WaveformMeter.tsx`'s canvas drawing (resolves `--accent` via `getComputedStyle`
  once per frame, converts to RGB, builds `rgba()` strings manually — canvas
  fillStyle/strokeStyle can never read `var()`). Kids Mode's own muted "bedtime"
  per-row palette (`KIDS_COLORS` in PianoRoll.tsx) and the drum velocity row's
  fixed amber accent are both deliberately NOT part of this system — don't fold
  them in without asking, they're separate, intentional design choices.
- **WASM loading**: bytes are fetched on the main thread, then transferred to the
  worklet via a transferable `postMessage` (`WebAssembly.compile` + the worklet calls
  `WebAssembly.instantiate`). Don't try `importScripts` inside the worklet — it's not
  available in that global scope.
- **LFOs live inside the AudioWorklet**, not the main thread — the main thread only
  sends config (`set-lfo` messages). This keeps LFO modulation sample-accurate.
- **Tone.js is transport-only.** If you're adding a new audio feature, build it as a
  native Web Audio node and wire it into the graph in `engine.ts` — don't reach for
  Tone.js synths/effects.
- **No COOP/COEP headers** — intentional. We don't use SharedArrayBuffer or WASM
  threads, so the extra header complexity (and the embedding restrictions it brings)
  isn't worth it. Don't add them without a real need.
- **Backward-compatible save format**: `StepData` fields (`strumDown`, `prob`) are
  optional so old saved songs (missing those fields) still load correctly with sane
  defaults. Keep new step-level fields optional for the same reason.
- **Kids Mode** (`src/components/PianoRoll.tsx`, `kidsMode` prop) shares the same grid
  component as normal mode but: shows only 8 rows (sliced in `App.tsx`, not in the
  hook), uses `minmax(0, 1fr)` grid columns + `aspect-ratio: 1` cells so it never
  needs horizontal scroll, and uses a muted "bedtime" color palette (`KIDS_COLORS` in
  PianoRoll.tsx) instead of bright rainbow colors. If you change row counts again,
  make sure the grid renders exactly `visibleNotes.length` rows, not a hardcoded
  constant — a past bug rendered invisible extra rows that were still clickable.
- **Step probability** (added 2026-06-20): `StepData.prob` (0–1, default 1). UI is a
  small button row below the strum-direction row; click cycles through
  `PROB_OPTIONS = [1, 0.75, 0.66, 0.5, 0.33, 0.25]`. The actual gate is a
  `Math.random() > prob` check in the `Tone.Loop` callback in `useSequencer.ts`,
  immediately before deciding whether to trigger notes.

## Recompiling the WASM (rarely needed)

Only required if you change a wrapper `.cpp` file or need to expose new params from
the C++ DSP (e.g. exposing Rings' internal FDN reverb, or adding more Plaits engines
to the picker — see BACKLOG.md).

```bash
./build-wasm.sh          # Rings
./build-plaits-wasm.sh   # Plaits
./build-clouds-wasm.sh   # Clouds
./build-exciter-wasm.sh  # Rings' external exciter models (Mallet/Plectrum/Particles/Flow/Noise)
```

All three require Emscripten SDK installed locally (`~/Developer/emsdk`, sourced via
`emsdk_env.sh` at the top of each script) — confirmed present and working as of
2026-06-21, and reconfirmed 2026-07-01 for the Clouds build (note: `emcc --version`
can spuriously fail with a Python-version assertion if `emsdk_env.sh` hasn't fully
taken effect in that shell yet — re-run the actual build command before concluding
the toolchain is broken, it resolved itself the same session). This is a real local
dependency — if you're an agent running in a sandboxed/remote environment without
that toolchain, you cannot recompile the WASM.
Flag this limitation to the user rather than guessing. After recompiling, re-check
the export-letter mapping (see "Discovering WASM export names" above) before editing
the corresponding `*-processor.js` — the letters can shift if the file list or
optimization level changes.

## If you're switching AI tools / agents

- This file is named `AGENTS.md`, a convention several tools (Codex CLI, Cursor, etc.)
  auto-discover — keep it updated and it'll travel with you across tools.
- The Emscripten/WASM recompile step is the one piece of this stack that needs a real
  local dev environment, not just code-editing ability — confirm any new tool/agent
  has shell + emsdk access before promising WASM changes.
- Cloudflare deploy requires `wrangler` to be authenticated in whatever shell the
  agent runs in (`npx wrangler whoami` to check). This is tied to the user's Cloudflare
  account, not portable to a different machine without re-auth.
- Preview/browser-testing tooling differs across agents (e.g. Claude Code's preview
  tools vs. Cursor's). The verification habit — start dev server, exercise the
  feature, confirm via DOM state/screenshot before calling it done — should carry over
  regardless of which specific tool is available.

## Notes for whoever picks this up

- Check [BACKLOG.md](BACKLOG.md) first for queued feature ideas, ordered by priority
  within each section.
- Add new ideas to BACKLOG.md rather than implementing immediately when scope is unclear.
- Remove backlog items once shipped — keep it reflecting reality, not history.
