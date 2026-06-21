# Emma Lee — Agent Handoff Guide

Read this first if you're picking up this project cold — whether you're Claude Code,
Codex, Cursor, or any other AI coding tool. It's written to be tool-agnostic.

## What this is

A public-facing, no-install browser synthesizer built for a non-technical lead
(AI-assisted development throughout — explain things in plain terms, not jargon).
Multitrack step sequencer: 2 tracks of Mutable Instruments Rings (real hardware
module DSP, compiled from its actual C++ source to WebAssembly), with more tracks
(Plaits, drums) planned — see "Multitrack architecture" below and BACKLOG.md.
Master bus owns shared delay + reverb; each track sends into them independently.

- **Live:** https://emma-lee.hellocharliesmith.workers.dev
- **GitHub:** https://github.com/hellocharliesmith/EmmaLee
- **Local path:** `/Users/charliesmith/Claude Code Things/rings-synth/`
- **Feature backlog:** [BACKLOG.md](BACKLOG.md) — check this for queued ideas before
  starting new work. Remove items from it once shipped (don't let it drift from reality).

## Stack

- Vite + React 19 + TypeScript
- Tone.js — **only** used for the Transport clock (`Tone.Loop`). The actual audio
  graph is 100% native Web Audio API, not Tone.js nodes.
- Mutable Instruments Rings — real eurorack module source (`rings-source/`, a clone
  of the actual hardware firmware repo) compiled to WASM via Emscripten, running
  inside an AudioWorklet.
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
    engine.ts       — the native Web Audio graph: per-track Rings instances
                       (ringsA/ringsB, each its own AudioWorkletNode) + a shared
                       master bus owning delay and reverb. initAudio() builds it
                       once on first user gesture (browser autoplay rules). Per-track
                       setters take a trackId first arg (setRingsParam(id, ...) etc);
                       master setters (setReverbWet, setDelayTime, etc.) are global.
    utils.ts         — small helpers (e.g. divisionSeconds for BPM-synced delay times)
  hooks/
    useSequencer.ts  — multitrack sequencer state: Record<TrackId, TrackSeqState>,
                       one 32-step page per track (v1 simplification — no multi-page
                       song sections yet, see BACKLOG.md). One shared Tone.Loop reads
                       LIVE refs (tracksRef) every tick and dispatches a trigger per
                       track — NOT closures — so editing a track while playing takes
                       effect immediately. Editing functions (toggleNote etc.) always
                       target whichever track is `activeTrack`.
    useSavedSongs.ts — localStorage-backed save/load list
  components/
    PianoRoll.tsx    — the step grid, shared across tracks and Kids Mode (kidsMode
                       prop changes cell count/styling/hides some rows).
    RingsControls.tsx (now takes a `trackId` prop and calls engine functions itself,
                       same pattern as before — App.tsx callbacks are pure state setters)
    DelayControls.tsx, ReverbControls.tsx — now master-only, no per-track concept
    Knob.tsx, SaveLoad.tsx, WaveformMeter.tsx
  App.tsx            — track tabs (Rings A / Rings B / Master) + viewSection toggle,
                       per-track instrument state (trackParams) + sends, kids-mode
                       branch pinned to ringsA only
public/
  rings-processor.js — the AudioWorklet (one registered processor class, instantiated
                       twice — once per Rings track). Loads WASM via
                       WebAssembly.instantiate directly (importScripts is NOT
                       available inside AudioWorklet global scope). WASM is compiled
                       ONCE in engine.ts and the same compiled Module is posted to
                       each track's worklet instance (saves re-compiling per track).
  rings.wasm/rings.js — compiled output, see "Recompiling the WASM" below
rings-dsp/rings_wrapper.cpp — thin C wrapper exposing rings_init/set_param/trigger/etc
rings-source/        — full clone of Mutable Instruments' actual firmware source
                       (also contains plaits/ and peaks/drums/ for the planned
                       Plaits + drum tracks — see BACKLOG.md)
build-wasm.sh        — the emcc compile command for Rings (see below)
```

## Multitrack architecture (added 2026-06-21)

Two tracks of Rings exist today (`ringsA`, `ringsB`), each its own AudioWorkletNode
instance. Plaits (melodic) and a 3-voice drum track (kick/snare/hi-hat, also from
Plaits' built-in drum engines) are planned next — see BACKLOG.md for the phased plan.

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
`ringsB` defaults to empty) — see `migrateLegacy()` in App.tsx.

**Verification caveat**: the AudioWorklet message-port handshake (`load-wasm` →
`ready`) could not be runtime-verified in the Claude Code preview/headless-browser
tool during this work — synthetic clicks there don't carry real `navigator.userActivation`
(`isActive: false`), which can affect Chrome's audio-thread scheduling for worklets.
The code was deployed to the live site and reviewed carefully by static inspection, but
**actual audio playback with 2 simultaneous Rings tracks should be confirmed in a real
browser** before building Phase 3 (Plaits) on top of it.

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

## Recompiling the Rings WASM (rarely needed)

Only required if you change `rings-dsp/rings_wrapper.cpp` or need to expose new
params from the Rings C++ DSP (e.g. exposing the internal FDN reverb — see BACKLOG.md).

```bash
./build-wasm.sh
```

Requires Emscripten SDK installed locally (`~/Developer/emsdk`, sourced via
`emsdk_env.sh` at the top of the script). This is a real local dependency — if you're
an agent running in a sandboxed/remote environment without that toolchain, you cannot
recompile the WASM. Flag this limitation to the user rather than guessing.

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
