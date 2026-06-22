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
                       delay and reverb. initAudio() builds it once on first user
                       gesture (browser autoplay rules). A generic `tracks` Map
                       (TrackId -> {worklet, dryGain, delaySend, reverbSend}) backs
                       triggerNote/setTrackSend/setTrackVolume for ANY track type.
                       Instrument-specific setters stay separate:
                       setRingsParam/setRingsModel(trackId,...) vs
                       setPlaitsParam/setPlaitsModel(...) (Plaits melodic has only
                       one track, so no trackId needed there). Drum voices reuse
                       createTrackWorklet + the 'plaits-processor' processor, just
                       locked to a fixed engine/note via createDrumTrack(). Master
                       setters (setReverbWet, setDelayTime, etc.) are global, untouched.
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
                       Morph/Decay/LPG Colour sliders. No trackId prop — only one
                       Plaits melodic track.
    (No DrumControls.tsx in v1 — the Drums tab has no instrument panel, just the
                       grid + a shared Sends row. See BACKLOG.md "Per-voice drum
                       tone shaping" if that's wanted later.)
    DelayControls.tsx, ReverbControls.tsx — master-only, no per-track concept
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
                       twice — once per Rings track).
  plaits-processor.js — Plaits AudioWorklet, modeled on rings-processor.js but
                       slimmed (no LFO, no internal reverb toggle). Instantiated
                       4 times: melodic Plaits + 3 drum voices, all from the SAME
                       compiled binary, each just locked to a different engine
                       index. Has a 'set-note' message type (distinct from
                       'trigger') that sets pitch WITHOUT firing — used once at
                       drum-voice creation so they don't sound on page load.
  Both load WASM via WebAssembly.instantiate directly (importScripts is NOT
  available inside AudioWorklet global scope). Each WASM module is compiled ONCE
  in engine.ts; the same compiled Module is posted to every instance that needs it
  (2x for Rings, 4x for Plaits) — saves re-compiling per instance.
  rings.wasm/rings.js, plaits.wasm/plaits.js — compiled output, see "Recompiling
                       the WASM" below
rings-dsp/
  rings_wrapper.cpp  — thin C wrapper exposing rings_init/set_param/trigger/etc
  plaits_wrapper.cpp — same pattern for Plaits, exposing plaits_init/set_param/
                       set_model/set_note/trigger/process. Compiles Plaits' full
                       Voice class (all 22 engines — can't selectively compile,
                       Voice statically includes them all as members); the engine
                       picker in PlaitsControls.tsx (and the fixed engines used by
                       the 3 drum voices) just limit which indices get used, not
                       what's in the binary — this is also why drums needed no new
                       WASM compile, just more JS-side worklet instances.
rings-source/        — full clone of Mutable Instruments' actual firmware source for
                       both Rings and Plaits
build-wasm.sh        — the emcc compile command for Rings
build-plaits-wasm.sh — same for Plaits (longer file list — speech synth, FM,
                       physical modelling, chords all need compiling in since
                       Voice references all engines)
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

## Key decisions worth knowing before you change things

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
```

Both require Emscripten SDK installed locally (`~/Developer/emsdk`, sourced via
`emsdk_env.sh` at the top of each script) — confirmed present and working as of
2026-06-21. This is a real local dependency — if you're an agent running in a
sandboxed/remote environment without that toolchain, you cannot recompile the WASM.
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
