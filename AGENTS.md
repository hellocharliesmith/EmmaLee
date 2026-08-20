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
                       set_model/set_note/trigger/process/set_level/
                       set_level_patched (the last 2 added 2026-07-12 — see
                       "Plaits envelope" below). Compiles Plaits' full
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
noticeably attenuating the other 4 (much calmer) models. This flat value
turned out to be its own problem in practice (2026-07-11): Mallet/Plectrum/
Particles are sparse impulses — energy for a brief moment, silence the rest
of the time — so at the same gain they read as much quieter than Flow/
Noise's continuous signal, and one fixed constant can't serve both well. Added
a per-track **Level** knob (0-2, default 1.0, `exciterLevel` in
`rings-processor.js`) that multiplies `EXCITER_GAIN` — `set-exciter-level`
message, `Engine.setExciterLevel()`. Lets each track push its exciter
independently instead of everyone sharing one compromise value.

**Attack envelope (added 2026-07-11)**: Elements' exciter models react only
to gate edges — there's no ramp/envelope knob in the original hardware DSP,
so every model (even Flow/Noise's continuous output) starts at full level
the instant a trigger fires. Added an **Attack (ms)** knob (0-500, default 0
= instant, today's original behavior) that fades the excitation signal in
linearly on each rising edge — pure JS, no WASM/recompile involved. Lives
entirely in `rings-processor.js`: `envelopeLevel` (0-1, current ramp
position) and `envelopeIncrement` (per-context-sample step, recomputed
whenever `exciterAttackMs` changes: `1 / (attackMs/1000 * sampleRate)`).
`envelopeLevel` resets to 0 at BOTH points a fresh rising edge actually
reaches the exciter WASM — the immediate-open case in `process()` AND the
delayed reopen inside `_fillExcitationQueue`'s retrigger-gap handling (see
"Fast-retrigger gotcha" above) — miss either one and a fast retrigger would
skip the ramp reset. Applied where context-rate samples are popped off
`excitationQueue`, since that's already in real (post-upsample) sample units
matching the ms-based timing exactly; skipped entirely (zero cost, exact
byte-for-byte old behavior) when `exciterAttackMs <= 0`. Most useful on
Flow/Noise's sustained texture (a genuine swell); Mallet/Plectrum are
one-sample impulses, so a slow attack mostly softens/mutes their click
rather than "delaying" it — there's no sustained signal there to ramp.
Verified via a Node harness: rms scales linearly with Level (0.5/1.0/2.0 →
~0.020/0.041/0.081), a 200ms Attack measured >30x quieter than instant in the
first ~10ms, and fast-retrigger-with-attack produces no NaN.

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
saves without it default to `'internal'` via a merge with `DEFAULT_EXCITER`
in `App.tsx`'s `loadSong` — same pattern as `cloudsSend`/`lpgColour`).
`ExciterState`'s `level`/`attackMs` fields (added 2026-07-11, after `model`/
`timbre`/`parameter`/`gateMs` already shipped) are required in the type but
the `loadSong` merge is `{ ...DEFAULT_EXCITER, ...state.tracks.ringsA.exciter }`
rather than a plain `??` fallback — this matters because a save from BEFORE
2026-07-11 can have a real `exciter` object that's simply missing those two
keys, and `??` only helps when the whole field is absent, not when it's
partially there. Two new presets, "Bowed Drone" (Flow, long gate + a 250ms
Attack for a genuine swell) and "Granular Sparkle" (Particles, short gate,
Level 1.5 to combat its natural quietness), show off what this adds that
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

## Plaits envelope (added 2026-07-12)

Plaits' own internal envelope (`plaits/dsp/envelope.h`'s `LPGEnvelope` +
`DecayEnvelope`) is a fixed, hardware-tied shape: attack time is locked to
the triggered note's pitch (`NoteToFrequency(p.note) * kBlockSize * 2.0f` in
`voice.cc`'s `ProcessPing` call — not adjustable), and decay always falls
asymptotically to zero — there's no sustain segment, no user control over
attack at all. This was the actual blocker for "swell in" / "sustained drone
notes" — not a missing knob, a genuinely fixed-shape envelope.

**The real mechanism, already in the DSP**: on real hardware, patching a CV
into Plaits' `LEVEL` input makes the internal lowpass gate stop
auto-triggering its ping and instead just follow that CV directly —
`voice.cc`'s branch: `if (modulations.level_patched) { lpg_envelope_.
ProcessLP(compressed_level, ...) } else { ...ProcessPing(attack, ...) }`.
`modulations.level`/`level_patched` were wired into the wrapper but always
hardcoded (`level = 1.0f`, `level_patched = false`) — this feature finally
drives them for real, from the worklet, rather than adding a parallel
JS-side gain multiply on the output. Two new one-line C++ exports
(`plaits_set_level`, `plaits_set_level_patched` in `plaits_wrapper.cpp`,
appended at the end of the file to keep every existing export letter
stable) are the entire wrapper change — all the actual envelope shaping
logic lives in `plaits-processor.js`, same "thin wrapper, JS does the
control logic" split as the Rings exciter's Gate/Attack.

**Design — Attack + Sustain, `patch.decay` UNCHANGED**: rather than
reinventing decay timing in JS, the envelope only computes the ATTACK ramp
itself (`envLevel` climbing 0→1 over `envAttackMs`, written to
`modulations.level` every block via `plaits_set_level`). Once attack
completes, JS just holds the target at `envSustain` (0-1) constantly from
then on — Plaits' OWN vactrol/`ProcessLP` follower (still driven by
`patch.decay`, meaning UNCHANGED) does the musical fall from ~1 down to that
floor, then simply stays there since the target stopped moving: a genuine,
indefinite sustain once `envSustain > 0` (a real drone at `envSustain = 1`,
since the target never falls at all). This is why "Decay" didn't need to
become a dual-meaning knob — it's literally the same parameter, same wiring,
in both modes.

**Activation rule (backward compatibility)**: custom envelope
(`level_patched = true`) only turns on when `envAttackMs > 0 OR envSustain >
0`. At the defaults (both 0) `level_patched` stays false and Plaits behaves
byte-identical to before this feature — old saves/presets are unaffected
until a track explicitly raises either knob. Mirrors the activation rule
already used for the Rings exciter's Attack ramp.

**Retrigger reset**: on every new trigger, `envState` resets to `'attack'`
and `envLevel` resets to 0 (if the envelope is active) — a monophonic
voice's new note gets its own full swell every time, not a legato blend
with whatever level it was already at. `envAttackMs <= 0` means the ramp
completes in a single block (`envIncrement` computed as 1 in that case), so
Attack=0 + Sustain>0 still works correctly (instant attack, then holds at
Sustain) — it just skips the swell.

**Shared processor, drums unaffected**: `plaits-processor.js` is reused
as-is for the 3 drum voices (see "Plaits AudioWorklet" above). They never
receive `'set-envelope-*'` messages, so their envelope state never leaves
the `envActive = false` default — and even if it somehow did, their engines
are `already_enveloped` (bass_drum/snare_drum/hi_hat), which bypasses the
LPG unconditionally regardless of `level_patched` (same reason `patch.decay`/
LPG Colour already do nothing for drums, see the drum param mapping note
below). No drum-specific guard was needed in the DSP layer.

**WASM export-letter note**: the 2 new functions were appended AFTER
`plaits_process` in the .cpp file specifically to keep every existing
letter (`d`=init through `i`=process) stable — confirmed by grepping
`public/plaits.js`'s own `assignWasmExports` function directly rather than
guessing: `j`=set_level, `k`=set_level_patched, and `malloc`/`free` shifted
from `j`/`k` to `l`/`m` as a result. Same "never assume, always re-derive"
discipline as every other wrapper change in this project.

**Verified**: Node `vm` harness (same technique as the Clouds/Rings-exciter
fixes) running the actual `plaits-processor.js` with the real compiled
`plaits.wasm`: default path (envelope off) is non-silent with no NaN and
still decays (native behavior, unchanged); a 600ms Attack measured ~40x
quieter than instant in the first ~10ms; Sustain=1.0 held level across a
2.7-second window with no decay (genuine indefinite drone, not just a long
decay); 3 rapid retriggers and an active→off mode transition both produced
no NaN. Also spot-checked in a real running browser (Attack/Sustain sliders
render and persist, no console errors) — see "Verification caveat" above
for why deeper audio-output verification still needs the user's ears.

## Generative sequencing (added 2026-07-12, v1 "nerdy" phase)

A new alternate sequencing mode, per melodic track (Rings A/B, Plaits — not
Drums, not Kids Mode), toggleable against the piano roll via a "Piano Roll /
Generative" switch above the step grid. See `BACKLOG.md`'s "Generative
sequencing" entry for the full vision (this is explicitly Phase 1 — every
knob exposed, built for someone who already knows modular generative
patching; a simplified "vibe picker" layer for non-experts is a deliberately
separate, later effort, not designed into this version).

**State-ownership gotcha (the one thing to get right here)**: live track
state is split across two trees — `TrackSeqState` (pages, scale, rootNote,
etc., owned by `useSequencer.ts`, mirrored into `tracksRef` which the shared
`Tone.Loop` closure reads every 16th note) vs. `AnyTrackParams`/
`RingsParamsState`/`PlaitsParamsState` (model, exciter, envelope, sends,
owned by `App.tsx`, invisible to `useSequencer.ts`). Unlike `exciter`/
`envelope` (which correctly live in the `App.tsx` tree, since the instrument
panel that edits them also lives there), **`generative` config lives on
`TrackSeqState`** — the `Tone.Loop` tick that needs to read it has zero
visibility into `App.tsx`'s tree, so it has nowhere else to go. The SAVED
format (`types.ts`'s `RingsTrackState`/`PlaitsTrackState`) still gets a
`generative?: GenerativeVoiceState` field the same way `exciter?`/`envelope?`
do, but `App.tsx`'s `captureState()`/`loadSong()` read/write it from the
`tracks.*` side, not `trackParams.*` — get this backwards and the sequencer
literally can't see the config.

**`src/audio/generative.ts`** — pure TypeScript, no WASM/worklet dependency
(control-rate logic, same reasoning that kept `grids.ts`'s pattern generator
out of WASM). Two independent generators tick every 16th note, matching the
"gate decoupled from notes" requirement — both always advance regardless of
whether the other fires:

- **Gate/rhythm**: a hand-picked subset of Marbles' real `TGeneratorModel`
  models (`rings-source/marbles/random/t_generator.h`) — `bernoulli`
  ("Steady"), `three-states` ("Wandering"), `drums` ("Groove", canned 8-step
  patterns), `markov` ("Evolving", correlates with recent history/streaks).
  Marbles' other 3 models (`Clusters`/`Divider`/the redundant
  Complementary-Bernoulli) need sub-tick `SlaveRamp` scheduling for
  polyrhythmic ratios between master ticks — a genuinely different problem
  this app's single shared `'16n'` clock has no use for, not a corner cut.
  `density` = fire threshold (all models); `complexity` is model-specific
  (Wandering: how often its mode changes; Groove: which canned pattern;
  Evolving: how "sticky"/bursty streaks get) — a first-pass mapping, expected
  to get retuned once heard, per the "v1, fine-tune from there" framing.
- **Notes**: a classic 8-bit shift-register Turing machine, hand-rolled fresh
  (NOT adapted from Marbles' own `RandomSequence`, which is structurally
  similar — a loop buffer blended between fresh-random and replay via a
  `deja_vu` probability — but carries hardware-CV-recording API shape this
  app doesn't need; confirmed with the user as a deliberate choice, not an
  oversight). Each tick: the bit about to shift out either recirculates
  unchanged or gets replaced with a fresh random bit, based on `mutationProb`.
  At `mutationProb=0` this is a plain rotate-right — the whole 8-bit pattern
  repeats exactly every 8 ticks (a locked loop, verified in the Node script).
  At `1` it's pure random every tick (verified: no 8-tick repeat structure
  survives). In between: mostly-repeating with occasional mutation — the
  "slow evolving but recognizable" character this whole feature is for.
- **Quantizer**: an ordered MIDI-note array built from `noteSet` (semitone
  offsets 0-11 FROM ROOT, not absolute pitch classes — stored this way per
  explicit user choice so a track's note set automatically transposes when
  the global Key changes, no separate transpose step needed anywhere) ×
  `[octaveMin, octaveMax]`, re-derived fresh from the current root every
  tick. The register's value indexes into it (wrapping as needed). Marbles'
  own weighted `Scale`/`Degree`/`HysteresisQuantizer` solves analog-CV
  chatter at scale-degree boundaries — irrelevant here since the input is
  already a discrete stepped index, not a continuous voltage; not porting it
  was confirmed as the objectively correct call for a discrete input, not a
  simplification.

**Gate Bias → existing controls, not a new envelope system**: the "short
gate vs. sustained note" control the user asked for reuses the Attack/
Sustain/Gate(ms) work already built for Rings' exciter and Plaits' envelope,
rather than inventing anything new. First-pass linear mapping (retune
later): Rings — `gateMs = 20 + gateBias * 780` (matches the manual Gate
slider's own 20-800ms range); Plaits — `attackMs = gateBias * 400`,
`sustain = gateBias` (bias=0: instant + no sustain; bias=1: 400ms swell +
holds forever, a drone). Both setter calls happen INSIDE the same
`Tone.getDraw().schedule(() => {...}, time)` closure as the `triggerNote`
call for that fired note, not a separately-scheduled call — `postMessage` to
a worklet port is FIFO, so this guarantees the gate/attack/sustain update
lands before the trigger message that reads it.

**Dueling-writer fix**: the instrument panel below (`RingsControls.tsx`'s
Gate(ms), `PlaitsControls.tsx`'s Attack+Sustain) still lets the user drag
those same sliders directly. If a track's generative mode is on, the
generative tick overwrites those worklet values every fired note — so both
components take a `generativeEnabled?: boolean` prop (passed as
`generative.enabled` from `App.tsx`) that disables and relabels
(`"Gate*"`/`"Attack*"`/`"Sustain*"`, tooltip: "Controlled by Generative
mode's Gate Bias knob while it's on") specifically those controls, not the
whole panel — Model/Timbre/Parameter/Level stay live.

**`Tone.Loop` integration** (`useSequencer.ts`): `resolvedPage`/`resolvedCol`/
`trackStepsRef` keep running UNCONDITIONALLY for every track, generative or
not — cheap arithmetic, and it means toggling generative off mid-song resumes
piano-roll playback exactly where the counter already was. Only the final
`t.pages[pageIdx][col]` read gets a `gen?.enabled` branch inserted before it
(for melodic tracks only — `drums` never gets a `generative` field, so the
branch is simply unreachable there). A `generativeStateRef` (keyed by
TrackId, holding the Turing-machine register + gate-model scratch state),
co-located with `tracksRef`/`trackStepsRef`, never touches React state — same
imperative-ref pattern already established for exactly this reason (avoiding
stale closures in the `Tone.Loop` callback).

**UI**: `src/components/GenerativeControls.tsx` — Model dropdown, Density/
Complexity sliders, a "Notes (Turing Machine)" section (Mutation slider, a
12-button pitch-class picker labeled with interval abbreviations — `R ♭2 2
♭3 3 4 ♭5 5 ♭6 6 ♭7 7` — since the note set is root-relative, not absolute
note names, and octave-min/max dropdowns), and a Gate Bias slider. The
"Piano Roll / Generative" toggle in `App.tsx` swaps `<PianoRoll>` + the
page-buttons row for `<GenerativeControls>` — the instrument panel
(`RingsControls`/`PlaitsControls`) stays mounted underneath either way.

**Verified**: standalone Node script (no worklet/vm harness needed — pure
TS, no audio-thread dependency at all) confirmed: fired notes always stay
within the noteSet×octave pool; Bernoulli's fire rate tracks the density
knob to within ±0.03 across 20,000 ticks; mutationProb=0 reproduces the
exact same note sequence every 8 ticks; mutationProb=1 never falls into an
8-tick repeat; all 4 gate models produce distinct, non-degenerate fire rates
at the same density/complexity settings; edge-case configs (single note,
single octave) produce stable non-NaN output. Also verified live in the
browser: toggle swaps the view correctly, all sliders (Density/Complexity/
Mutation/Gate Bias) and the note-set picker persist and update correctly, no
console errors, the Gate/Attack/Sustain dueling-writer fix visibly disables
and relabels the right controls, and a full save→reload→load round-trip
correctly restored a custom Density value and the `enabled` toggle itself —
confirming the `TrackSeqState`-not-`trackParams` save-format wiring works
end-to-end.

## Plaits Filter + Cloud Atmosphere engine + Virtual Analog relabel (added 2026-08-17)

Three related fixes to the Plaits voice, done as one pass since all three
touch `voice.cc`/`voice.h` and share a single WASM recompile.

**Virtual Analog "Cutoff" mislabel**: the 2nd param slider was labeled
"Cutoff" but `virtual_analog_engine.cc` has no filter at all — that param
actually drives oscillator hard-sync amount + pulse width. Relabeled to
"Sync/Width" in `PlaitsControls.tsx`'s `ENGINE_PARAM_LABELS`. No DSP change.

**Filter (the "VCF" half of VCO→VCF→VCA)**: a real `stmlib::Svf` low-pass
(same class already vendored/used by `low_pass_gate.h` and Elements'
`exciter.cc`), added as `out_filter_`/`aux_filter_` members on `Voice`
(`voice.h`), applied to `out_buffer_`/`aux_buffer_` in-place right after the
engine's `Render()` call and before the existing LPG/post-processor stage in
`voice.cc`'s `Render()` — classic subtractive signal-chain order. New
`Patch` fields `filter_enabled`/`filter_cutoff`/`filter_resonance`. New
wrapper exports `plaits_set_filter_enabled/cutoff/resonance` (appended at
the end of `plaits_wrapper.cpp`, after the envelope exports, to keep every
prior export letter stable). Off by default (`enabled=false`) — reproduces
original unfiltered behavior exactly for every existing save/preset. Larger
`resonance` (a "true units" value fed to `set_f_q`) means peakier/more
resonant, not more damped — see `stmlib::Svf`'s own convention. UI: new
"Filter" section in `PlaitsControls.tsx` below the (now explicitly labeled)
"Envelope (VCA)" section.

**Cloud Atmosphere (new engine, id 24)**: an airy/breathy pad voice — the
user wanted something like "a Korg M1 ethereal flute with lots of air
noise." Forked from `AdditiveEngine` (best raw harmonic-partial control of
the existing engines) rather than patched in place, since it's a genuinely
new self-contained instrument, not a modification to a real Plaits engine —
lives in `rings-dsp/atmosphere_engine.h/.cc` (the project's own directory,
keeping vendored `rings-source/` otherwise pristine, same convention as the
earlier Elements Exciter work). Adds a filtered-noise "air" layer blended
with the harmonic tone; params exposed as Texture/Brightness/Focus (see
`PlaitsControls.tsx`'s `ENGINE_PARAM_LABELS[24]`). Registered last in
`voice.cc`'s `RegisterInstance` order (index 24) — **this required bumping
`kMaxEngines` from 24 to 25 in `voice.h`**; `EngineRegistry::RegisterInstance`
silently no-ops past capacity (no error, the engine just never plays), so
always recheck this constant against the actual count of `RegisterInstance`
calls before adding a 25th+ engine in the future. Curated into
`PlaitsControls.tsx`'s `ENGINES` list as "Cloud Atmosphere" — a 7th engine
choice on the existing Plaits track, not a separate track/tab (kept scope
contained, per the plan).

**Random/noise determinism note**: `stmlib::Random`'s LCG is never seeded
anywhere in this codebase, so a fresh WASM instance's noise always starts
from the same state — true for every Random-using engine (Noise/Particle/
Swarm/Chiptune, and now Atmosphere), not a bug introduced here. Doesn't
cause audible repetition in continuous playback since the LCG advances every
sample; only matters if you're diffing two freshly-instantiated renders in a
test harness (see the Node verification script's comment for how this was
worked around).

**Verified**: Node `vm` harness (`public/plaits-processor.js` + real compiled
`plaits.wasm`) — Filter off is byte-unaffected; cutoff sweep on a broadband
engine (Noise) shows low cutoff measurably quieter than high; resonance
sweep 0→1.0 stays bounded (no runaway blowup); Atmosphere engine is
non-silent/no-NaN with a confirmed real per-sample noise contribution
(checked via non-repeating consecutive blocks within one continuous render,
not a fresh-instance diff — see determinism note above); a spot-check of
existing engines (8, 10, 19, 20, 2, 6) confirmed the `kMaxEngines` bump and
new `Patch` fields didn't affect them. Also live-verified in the browser:
engine picker lists "Cloud Atmosphere", Filter section renders and toggles,
playback with Filter+Atmosphere active produces no console errors.

## Octave shift, Note Wander, Plaits Tie (added 2026-08-17)

Three per-track/per-step sequencing features, all implemented as pure
runtime transforms applied at the `triggerNote()` call site inside
`useSequencer.ts`'s shared `Tone.Loop` — stored step data and generative
note-sets are never rewritten, same pattern as the existing Generative
Sequencing overlay. All three live on `TrackSeqState`/`StepData`
(`useSequencer.ts`'s domain), not the `AnyTrackParams` tree owned by
`App.tsx` — matching the state-ownership boundary already established for
`generative`.

**Octave shift** (`TrackSeqState.octaveShift`, -2..+2, default 0): a small
+/- stepper next to the Piano Roll/Generative toggle, melodic tracks only
(Rings A/B, Plaits — not Drums, since drum step `notes` are fixed voice
indices, not pitches). Applied as `midi + octaveShift * 12` at trigger time,
for both the piano-roll and generative-mode paths.

**Note Wander** (`StepData.wander`, 0-5, default 0/undefined = today's exact
behavior): a per-step "how far can this note randomly drift" control. At
trigger time, rolls a random offset in `[-wander, +wander]` **scale-degree
steps** (not semitones) using the same `buildNotes(root, scale)` reference
array the piano roll itself uses for quantization, via a new `applyWander()`
helper. UI: a new "Wander" meta-row in `PianoRoll.tsx` (same click-cycle
pattern as the existing Strum/Prob/Velocity rows), shown for melodic tracks
only. Explicitly a first pass, kept deliberately simple (uniform random
within range, no weighting) — the user wants to hear it in practice before
deciding whether it needs refinement.

**Plaits Tie** (`StepData.tie`, boolean, Plaits-only): the "simplest UX
choice" for a per-step gate — a tied step doesn't fire a new `triggerNote`,
it extends the currently-sounding note by forcing the Plaits envelope's
Sustain open (reusing the *existing* `setPlaitsEnvelopeSustain` setter from
the envelope feature, **no new trigger() call**, no new WASM/wrapper code at
all) through the tied step(s), releasing back to the panel's configured
Sustain value only at the next non-tied step. Tracked with a
`plaitsTieHeldRef` (checked before the general "no step" bail-out in the
loop, since a tied step intentionally carries no note of its own). UI: a new
"Tie" meta-row in `PianoRoll.tsx`, Plaits-track-only, toggle-per-column
(supports toggling on an otherwise-empty step, unlike Strum/Prob/Wander).

**Save format**: `octaveShift` is optional on `RingsTrackState`/
`PlaitsTrackState` (old saves default to 0); `tie`/`wander` need no separate
save-format entry since `StepData` is already part of the saved `pages`
array.

**Verified**: live in the browser — Octave control renders per-track
(confirmed independent state across Rings A vs. Plaits), Wander cycles
0→1→…→5→0 and only appears on melodic tracks, Tie toggles on Plaits only and
correctly ties an empty step, a full save→reload→load round-trip preserved
all three (octave `+1`, wander value, tied step) exactly, and playback with
all three active simultaneously produced no console errors across several
seconds.

## Sequencer/save bug fixes (added 2026-08-17)

Four independent fixes, delegated to a background agent working in an
isolated git worktree (no overlap with the Octave/Wander/Tie work above at
the time, though `App.tsx` and `useSequencer.ts` were later hand-merged
since both streams touched them).

**Page-graying bug**: `lastStep` is a single global value that only
musically applies to whichever enabled page ends up LAST in the playback
cycle (see the `Tone.Loop`'s `ei`/`lastEnabledPage` derivation), but
`PianoRoll.tsx` was graying steps beyond it on whichever page was currently
being *viewed*, regardless of whether that page was actually the last
enabled one. Fixed in `App.tsx`: compute `isCurrentPageLastEnabled` (same
`ei` logic) and only pass `lastStep` through to `<PianoRoll>` when the
viewed page actually is the last enabled one — `PianoRoll`'s existing
`lastStep ?? STEP_COUNT - 1` fallback already treats `undefined` as "nothing
beyond, don't gray anything," so no changes were needed inside
`PianoRoll.tsx` itself.

**Scale-change wiping notes**: `setScale`/`setRootNote` used to
`pages: makeEmptyPages()` — a full wipe — on every Key/Scale change. Now
remaps: `snapNoteToScale()` (in `useSequencer.ts`) snaps each existing MIDI
note to the nearest pitch class actually present in the new scale/root
(shortest signed distance around the 12-tone circle, preserving octave
register; unchanged if it already fits), and `remapPagesToScale()` applies
that across every step of every page, preserving every other `StepData`
field (`strumDown`/`prob`/`velocity`/`tie`/`wander`) by spreading the
existing step and only replacing `notes`.

**Sends not saving/loading on demo songs**: investigated live (not just
re-read statically) — `captureVoice()` console helper confirmed per-track
`delaySend`/`reverbSend`/`cloudsSend` in React state matched `demoSongs.ts`
exactly, both on cold boot and when switching songs mid-playback. **No bug
found** — `syncParamsToEngine` was already correct on paper and in practice.
The Master tab's Delay/Reverb sections are a legitimately separate control
(bus wet mix, not per-track sends), not a duplicate/conflicting UI.

**Save always creating a new song**: `useSavedSongs.ts`'s `save()` had no
update-in-place path. Added `update(id, state)` (same read-modify-write
localStorage pattern as `remove()`); `save()` now also returns the new
song's id. `App.tsx` tracks the loaded song's id (`currentSongId`, `null`
for demo/new songs, or a saved song that somehow isn't actually in the
`songs` list — e.g. a freshly-imported file — since `update()` would
silently no-op on an id it can't find). `SaveLoad.tsx`'s plain "Save" button
now updates in place immediately (no prompt) when the loaded song is a
genuine saved entry; a new "Save As" button next to it keeps the original
name-prompt-then-create flow for making an explicit new copy.

**Verified**: live in the browser for all four — page-graying confirmed
across a multi-page song with different lengths per page; scale-change
confirmed via a full DOM scan across scroll rows (not just a screenshot) —
exactly the notes that no longer fit snapped to the nearest tone, everything
else stayed put; sends confirmed matching via `captureVoice()`; the full
New → Save → edit → Save (updates in place) → Save As (new copy) → edit →
Save (updates that copy in place) flow behaved exactly as specified.

## Drum Character + analog/synthetic Blend (added 2026-08-17)

Two "cheap win" additions to the 3 drum voices (Hi-Hat/Snare/Kick) — the 4th
full percussion voice (clap / a Peaks `fm_drum` port) was deferred to
BACKLOG.md per scope decision, not built this round.

**Character knob** (param 0/harmonics — previously set once at creation and
never exposed): Plaits' drum engines (`analog_bass_drum.h`/
`analog_snare_drum.h`/`hi_hat.h`) all use this param as a real, distinct
secondary character control — drive/self-FM for the kick, noise/body blend
("snappy") for the snare, metallic-noise mix for the hi-hat. One knob,
per-voice label (`CHARACTER_LABELS` in `DrumControls.tsx`: Kick→"Drive",
Snare→"Snappy", Hi-Hat→"Noise") since it means something different per
engine — same spirit as `PlaitsControls.tsx`'s `ENGINE_PARAM_LABELS`. Pure
JS/UI change (`Engine.setDrumParam(vid, 0, v)`), no recompile.

**Analog/synthetic Blend**: every Plaits drum engine's `Render()` already
computes TWO independent models each block — an "analog" 808-style model
(written to `out`) and a completely separate "synthetic" 909-ish model
(written to `aux`), see `synthetic_bass_drum.h`/`synthetic_snare_drum.h`.
`plaits-processor.js` normally just routes `out`→left/`aux`→right (a real
stereo pair for the melodic Plaits track — must stay unchanged there). For
drum voices, a new `drumBlend`/`drumBlendSet` pair of fields on the
processor instead crossfades the two into one centered signal (0 = pure
analog/today's sound, 1 = pure synthetic) — gated on `drumBlendSet` so
melodic Plaits (which never receives the new `'set-drum-blend'` message)
stays byte-identical to before. `engine.ts`'s `createDrumTrack` sends an
explicit `blend: 0` at creation time (not just relying on the worklet's own
default) specifically so this gate flips on for every drum voice, matching
every other drum param already sent at creation. New `Engine.setDrumBlend()`
export.

**Save format**: both fields added to `DrumTrackState.voices`'s per-voice
type in `types.ts`; `App.tsx`'s `loadSong` does a per-field merge (not a
blind `??` on the whole voices object) so an old save that has the voice
object but is missing just these two new keys still gets sane defaults
(0.5/0) — same pattern already used for `volume`. Presets (`DrumVoicePreset`)
still only carry tone/decay/volume, so `loadDrumPreset` and `handleNewSong`
both merge per-voice-per-field onto the existing/default voice rather than
replacing the whole voice object, so a track's Character/Blend survive
loading a preset untouched.

**Verified**: live in the browser — all 3 drum voices render exactly 5 knobs
each with the correct per-voice Character label plus Blend; dragging updates
live with no console errors or worklet crashes during playback; a full
save → switch song → reload round trip exactly preserved custom per-voice
values. `git diff --stat` confirmed scope discipline — no changes to
`voice.cc`, `plaits_wrapper.cpp`, the `ENGINES` array, or `PlaitsControls.tsx`.

## Juno-60 track (added 2026-08-19)

A 5th, genuinely new track (not a mode-swap on an existing one) — polyphonic,
real gate-length control, in the character of the Roland Juno-60/106. Runs
alongside Rings A/B, Plaits, and Drums, sharing the global Key/Scale.

**Engine**: vendored from [JunoX](https://github.com/pendragon-andyh/junox)
(pendragon-andyh, GPL-3.0-or-later) — a from-scratch Web Audio `AudioWorklet`
emulation modeled directly off the Juno-60 service manual (the source code's
own comments cite page/section numbers). Unlike Rings/Plaits/Clouds, **no
WASM at all** — pure JS DSP, no Emscripten build step. `public/juno-processor.js`
is JunoX's ~13 source files (`dco.js`, `chorus.js`, `ladderFilter.js`,
`juno60Envelope.js`, `abstractEnvelope.js`, `lfo.js`, `lfoWithEnvelope.js`,
`noise.js`, `ringBuffer.js`, `simpleSinglePoleFilter.js`, `smoothMoves.js`,
`utils.mjs`, `voice.js`, `junox.js`) flattened into one file (`import`/`export`
stripped, GPL header + per-file section comments kept) — matching how every
other `public/*-processor.js` here is a single self-contained file (no ES
imports between public files; JunoX's own esbuild step does this exact
flattening for its own distribution, so this isn't inventing a new
convention). A thin wrapper at the end (`JunoProcessor`, not part of
upstream) adapts JunoX's native message shape to this app's `{type,
payload}` convention and calls `registerProcessor('juno-processor', ...)`.

**Real polyphony + real gate, unlike everything else in this app**: `Junox`
takes a `polyphony` voice count (8 here — see `JUNO_POLYPHONY` in
`juno-processor.js`) and spins up an internal `Voice` per note, stealing the
oldest when full. It has genuine `noteOn(note, velocity)`/`noteOff(note)` —
not the fire-and-forget trigger+decay every other track uses. `engine.ts`
exposes this directly: `junoNoteOn`/`junoNoteOff`/`junoAllNotesOff`, parallel
to but distinct from the generic `triggerNote`. `createTrackWorklet`'s
`wasmBytes` param is now optional specifically for this — no WASM to load,
so `juno-processor.js` posts `{type:'ready'}` synchronously from its own
constructor instead of waiting on a `'load-wasm'` round trip.

**Gate length — a new sequencer primitive**: `StepData.gateSteps` (1-16,
default `DEFAULT_GATE_STEPS = 4`, options `GATE_OPTIONS =
[1,2,3,4,6,8,12,16]`) — how many 16th-note ticks a step's note(s) stay held
before a real `junoNoteOff` fires. Implemented in `useSequencer.ts`'s
`Tone.Loop` via a `junoActiveNotesRef` (`{note, remaining}[]`): every tick,
existing held notes decrement and release at 0 *before* the current step's
new notes are processed (so this runs even if Juno's own page cycling
lapses); new notes push a fresh countdown entry, replacing any existing
entry for the same pitch so a re-trigger resets rather than duplicates.
`stop()` clears the ref and calls `junoAllNotesOff()` so nothing is left
stuck holding. UI: a new "Gate" meta-row in `PianoRoll.tsx`, Juno-only,
click-cycles `GATE_OPTIONS`, always shows the live value (unlike Wander/Prob,
gate is never really "off" — it's a duration).

**True polyphony, no strum**: a step's whole chord fires as genuinely
simultaneous `junoNoteOn` calls (transformed by the same octave-shift/Wander
logic every melodic track already uses), not Rings/Plaits' one-voice-strums-
the-chord emulation. `noStrum` is now true for both Drums and Juno — but
Wander's own render gate in `PianoRoll.tsx` had to be decoupled from
`noStrum` (it used to piggyback on that flag as a "melodic tracks only"
proxy back when Drums was the only `noStrum` track) since Juno wants
Wander but not Strum; Wander now gates purely on the `onSetWander` prop.

**60/106 switch — two real factory banks, one engine**: Juno-60 and
Juno-106 share the same DCO/VCF/chorus circuit, so there's one DSP engine
and a Bank toggle (`JunoControls.tsx`) that just switches which preset list
the dropdown shows:
- `JUNO60_PRESETS` (56 patches) — ported verbatim from JunoX's own
  `src/patches.js` (`Juno60FactoryPatchesA`), with the unused `vcf.type`
  field stripped (confirmed via grep that nothing in the DSP ever reads it).
- `JUNO106_PRESETS` (128 patches) — converted from `patches/Juno106.xlsx`, a
  file JunoX's own repo ships but never wires into any code path. Unzipped
  (`xlsx` is a zip of XML) and parsed directly this session — it's a real
  hardware SysEx patch-memory dump (raw `Bit0`-`Bit6` columns confirm this),
  not a guess: 166 rows total, 38 of them genuinely blank (trailing
  formatted-but-empty rows), leaving 128 real, distinct, authentically-named
  patches ("Meow Bass", "Forbidden Planet", "Dust Storm", "Owgan", etc.).
  Column mapping: most continuous params (`VCF Freq/Res/Env`, `VCA Level`,
  `ENV A/D/S/R`, `LFO Rate/Delay`, `DCO Noise/PWM`) are raw 0-127 hardware
  values, divided by 127 to match JunoX's 0-1 slider convention (confirmed
  this is how the 60 bank's own patches already store these — no
  curve-table math needed at the JSON level). `HPF` (raw 0-3) divides by 4,
  not 3 — `curveFromHpfSliderToFreq` in `junox.js` has exactly 4 entries and
  `interpolatedLookup(slider * 4, table)`, so `slider = raw/4` is the value
  that lands exactly on `table[raw]` with zero interpolation error (raw/3
  would overshoot/interpolate for the middle two positions). `4'`/`8'`/`16'`
  one-hot columns map to Junox's `dco.range` multiplier (16'→0.5, 8'→1
  (implicit default), 4'→2 — standard footage-to-octave convention). One
  honest simplification: `dco.pwmMod` is defaulted to `'l'` (LFO) for every
  106 patch — a second "DCO PWM" boolean column's exact semantics weren't
  confirmed, and `'l'` is the overwhelmingly common real-hardware default
  seen across the 60 bank, so this doesn't produce obviously-wrong-sounding
  patches even where it's not byte-exact. Conversion script wasn't kept —
  the output is committed as a static array, same as every other preset bank
  here, not a runtime xlsx parse. See BACKLOG.md for the full 38-instrument
  Bristol catalog surveyed alongside this (not used — Bristol has Juno-60
  but not Juno-106 or D-50) and the D-50 research (no usable open-source
  engine exists — see below).

**Curated controls, not everything**: `JunoControls.tsx` exposes a Bank
toggle + Preset dropdown, plus 11 live knobs — Cutoff, Resonance, Attack,
Release, LFO Rate/Delay/DCO Depth/VCF Depth, Chorus (0/1/2/3 cycle button),
**Noise**, and **HPF** (both explicitly requested — key to airy/cloudy
textures, same spirit as Plaits' Cloud Atmosphere engine; LFO controls added
right after shipping, also explicitly requested). Real hardware has ~20
physical controls; this is a curated subset, same scope philosophy as
Plaits (4 knobs) / Rings (4 knobs), just wider since several of the 11 were
specific asks. Each knob updates local patch state AND calls
`Engine.setJunoParam(path, value)` directly, reusing JunoX's own dot-path
convention (`'vcf.frequency'`, `'env.attack'`, `'dco.noise'`, `'hpf'`,
`'chorus'`, `'lfo.frequency'`, `'lfo.delay'`, `'dco.lfo'`, `'vcf.lfoMod'`)
with zero translation layer.

**LFO — one LFO, multiple destinations, not a per-parameter pool**: unlike
Rings/Plaits' 4 independent per-parameter LFOs, Junox has a single hardware-
accurate LFO (`patch.lfo: {autoTrigger, frequency, delay}`) that can modulate
several destinations at once, each at its own depth: DCO pitch (`dco.lfo` —
vibrato) and VCF cutoff (`vcf.lfoMod` — filter wah/sweep). The 4 exposed
controls (Rate, Delay, DCO Depth, VCF Depth) map directly to these fields —
no new architecture, `patch.lfo`/`dco.lfo`/`vcf.lfoMod` already existed in
every preset, this just makes them live-adjustable. `autoTrigger` (whether
the LFO's phase resets on every note-on vs. free-running) is left at
whatever each preset already sets — not surfaced as a control, a smaller
detail than Rate/Delay/Depth.

**Save format — version 4**: `JunoTrackState` (`types.ts`) stores the whole
current `patch` object as one JSON blob (matches how JunoX's own
`setPatch`/`setValue` API naturally works — avoids decomposing a deeply
nested object into a long flat field list) plus `bank: '60'|'106'`
(UI-only, doesn't affect the loaded patch itself). `SongState.version` bumped
3→4; old saves migrate through a new `withDefaultJuno()` step (applied
uniformly across the v1→v3, v2→v3, and genuine-v3 load paths) that adds a
fresh default Juno track — same "missing track gets sane defaults" pattern
already used for Drums' own backward-compatible fallback.

**License note**: JunoX is GPL-3.0-or-later. The vendored code in
`public/juno-processor.js` keeps its GPL header/attribution. Worth knowing
since this app doesn't otherwise ship a LICENSE file — flagged to the user
at build time, not a blocker for a personal instrument that isn't being
redistributed as a package.

**D-50 (deferred, not built)**: the user also wants a D-50/LA-synthesis
character, ideally switchable with Juno. No usable open-source D-50 engine
exists — researched thoroughly (Bristol doesn't have one; DSynkant is a
real but non-functional reverse-engineering scaffold, its own README says
"no GUI, no presets, and no sound"). D-50's PCM attack-transient layer is
actual copyrighted Roland ROM data (not legally redistributable); its
synthesized layer is itself Juno-shaped subtractive synthesis. If picked up
later: don't keep searching for a pre-built engine, reuse this same
DCO/VCF/VCA as the synthesized layer and add a short *synthesized* (not
sampled) transient on top — same layering trick as Cloud Atmosphere. See
BACKLOG.md.

**Verified**: Node `vm` harness (same technique as every other worklet here,
adapted for a no-WASM processor) confirmed: `ready` posts synchronously, a
single note is non-silent with no NaN through its full release tail, a
3-note chord measurably louder than one note (genuine simultaneous
polyphony, not a coincidence — same instance, same params), note-off +
release tail genuinely decays toward silence (not just a ratio threshold —
verified against a ~1s window comfortably past the longest release-curve
entry), `set-patch` preset loading changes the sound, `hpf`/`dco.noise` are
live-reachable via `set-param`, and `all-notes-off` genuinely silences a
3-note chord (verified past the chorus ring-buffer's ~6ms natural decay
tail). Also live in the browser: new Juno tab renders with its own amber
accent; Bank toggle correctly swaps the Preset dropdown's content (56 vs.
128, confirmed by actual patch names including 106-bank-only "Brass Swell",
"Meow Bass," etc.); loading a 106 preset audibly moves the Cutoff/Resonance/
Attack/Release sliders to that patch's real values; a 3-note chord plays as
true simultaneous polyphony with the Gate row showing/cycling correctly;
Noise/HPF sliders are draggable live during playback with no errors; an
extended Play session (chord + manual Noise/HPF drags) produced zero
console errors; a full save → reload → load round-trip preserved the loaded
patch (including manual Noise/HPF tweaks on top of a loaded preset), the
Bank selection, and the Gate value exactly. LFO section (added same day,
right after shipping) re-verified the same way: all 4 controls render with
correct labels, and dragging DCO Depth + VCF Depth live during an active
Play session (note held via the Gate mechanism) produced zero console
errors.

## Key decisions worth knowing before you change things

- **Color system (added 2026-06-21, corrected 2026-08-19)**: CSS custom properties
  in `:root` (App.css) define the raw palette — rose/teal/sage/slate/neutral-dark,
  plus amber (added with the Juno track). Correction: an earlier version of this
  note claimed "Butter and Neutral Sand exist in the source palette but are
  intentionally not wired in" — checked directly while picking Juno's color and
  that's not accurate; `DESIGN_BRIEF.md`'s own "exact tokens already in use" table
  lists only the 5 original hues, no unused spares. Every hue was already claimed
  by an existing track, so amber is a genuinely new 6th family, not a rediscovered
  one. Per-track accent is `--accent`/`--accent-dark`/`--accent-light`, switched
  via a `.app.track-rings-b` / `.track-plaits` / `.track-drums` / `.track-juno` /
  `.track-master` modifier class set in App.tsx based on `activeTrack`/
  `viewSection` — default (no class) is Rose for Rings A. **If you add a new track
  type, add its accent override here and a corresponding class branch in
  App.tsx**, following the same pattern. Two places can't read CSS vars directly
  and need special handling:
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
