# Emma Lee — Feature Backlog

Ideas and improvements to work through. Roughly ordered by priority within each section.

See [AGENTS.md](AGENTS.md) for architecture, deploy steps, and key decisions — read that
first if you're new to the codebase. This file is just queued ideas.

## Recently shipped (remove from here once stale)

- **2026-07-01** — Grids drum pattern generator: hand-ported `pattern_generator.cc`
  to plain TS (`src/audio/grids.ts`), no WASM needed (pure control logic, runs once
  per click). "Generate Pattern" panel on the Drums tab (X/Y + per-voice density +
  randomness) fills the current page's 32 steps for all 3 drum voices at once. See
  AGENTS.md "Grids pattern generator" for the full writeup.
- **2026-07-01** — Clouds granular effect: compiled `clouds::GranularProcessor` to
  WASM (`rings-dsp/clouds_wrapper.cpp`, `build-clouds-wasm.sh`) and wired it in as a
  new master-bus send (alongside delay/reverb), with its own AudioWorklet
  (`public/clouds-processor.js`) that resamples around the DSP's hardcoded 32kHz
  internal rate. New Master-tab panel (`CloudsControls.tsx`): Freeze, Mix, Position/
  Size/Pitch/Density/Texture/Feedback/Reverb. See AGENTS.md "Clouds granular effect"
  for the full writeup, including what's NOT done yet (per-track Send knob, params
  not saved, spectral mode untested) — those are broken out as separate entries below.
- **2026-06-20/21** — Kids Mode cleanup: muted "bedtime" color palette, fluid grid
  (no horizontal scroll, fits any screen width), fixed a bug where invisible extra
  grid rows were clickable and triggered phantom notes.
- **2026-06-20/21** — Step probability: each step cycles through 100/75/66/50/33/25%
  via a small button row under the grid. Backward-compatible with old saves.
- **2026-06-21** — Multitrack Phase 1: 2 Rings tracks (ringsA/ringsB), each its own
  AudioWorkletNode. Master bus owns shared delay+reverb, fed by per-track Sends knobs.
  Track tabs in UI (Rings A / Rings B / Master). See AGENTS.md "Multitrack architecture"
  for the full signal-flow writeup and what got dropped (Rings-internal reverb type,
  multi-page song sections — both noted there with reasoning).
- **2026-06-21** — Fixed track-tab click glitch (inline-defined component was
  remounting on every render, eating clicks). Added per-track Volume knob + a Mixer
  row on the Master page (one volume knob per track).
- **2026-06-21** — Multitrack Phase 3: Plaits melodic track, 4th track tab. 6 curated
  engines (Virtual Analog, FM, String, Modal, Six-Op, String Machine) — see AGENTS.md
  "Multitrack architecture" for the engine-index correction (hardware registration
  order, not header declaration order) and the WASM export-letter discovery process.
- **2026-06-21** — Added LPG Colour to Plaits (the hardware's hold-button-A +
  Timbre secondary function, exposed as a regular 5th slider instead of a gesture).
- **2026-06-21** — Multitrack Phase 4 (final phase): Drum track, 5th tab. 3 voices
  (Hi-Hat/Snare/Kick), each a tiny Plaits instance reusing the already-compiled
  binary, locked to Plaits' bass_drum(21)/snare_drum(22)/hi_hat(23) engines. Unlike
  the melodic tracks, the 3 drum voices are independent so they can overlap on the
  same step.
- **2026-06-21** — Per-voice drum tone controls (Tone + Decay knob per voice) and
  per-step velocity (100/75/50/25%, drums only) — both same-day follow-ups to Phase 4.
  Velocity is applied in plaits-processor.js as an output-sample multiplier, not via
  WASM — zero recompile, zero risk to the already-confirmed melodic Plaits sound.
- (Already in place before this round, in case it looks unimplemented) — Save/load
  patterns to localStorage with named slots (`useSavedSongs.ts` + `SaveLoad.tsx`).

---

## Multitrack expansion — COMPLETE (2026-06-21)

All 4 phases plus same-day follow-ups (volume knobs, per-voice drum tone, step
velocity) shipped in one day: 2x Rings + 1x Plaits melodic + 1x Drums (3 voices),
master bus with shared delay/reverb fed by per-track sends, track tabs, Master mixer.
Full architecture writeup lives in AGENTS.md "Multitrack architecture" — read that
before changing any of this, especially the Plaits engine-index table (hardware
registration order, not header declaration order — easy to get wrong, already was
once this session) and the WASM export-letter discovery process for wrapper changes.

---

## Visual & Performance

### Scrolling waveform display
- **What:** Stylish master output visualization — scrolling waveform history à la FabFilter Pro-C3.
- **How:** `AnalyserNode` taps the final output (zero audio impact). On every `requestAnimationFrame`, read `getFloatTimeDomainData()`, compute peak, push to circular buffer of ~500 values, draw scrolling history to `<canvas>`. Pink/white glow on waveform, dark background, subtle dB grid lines.
- **Performance:** Very low. Canvas is GPU-accelerated. AnalyserNode is read-only.
- **Effort:** ~2–3 hours. Good next visual feature.

### CPU / performance monitor (needs rethinking)
- **Current state:** Basic meter is implemented and deployed — shows "< 1%" on Apple Silicon because the DSP is genuinely that efficient. Will show meaningful values on mobile/slower hardware.
- **Problem:** `performance.now()` in AudioWorklet without COEP headers has limited precision (~100µs), and Rings DSP on fast hardware runs in < 50µs per block — below measurable threshold.
- **Better approach options:**
  - Re-enable COEP headers on Cloudflare (restores high-res timing, but may break embedding)
  - Switch to measuring something else: active node count, audio graph complexity score
  - Only show the meter on mobile where values are meaningful
  - Show a stylized "complexity" indicator (what's enabled) rather than measured CPU

---

## Reverb

### Rings' built-in reverb (per-track toggle, not master)
- Previously a master reverb-type option ("Rings"), removed in the 2026-06-21
  multitrack refactor — see AGENTS.md "Multitrack architecture" for why it doesn't fit
  a shared master effect. The wrapper functions (`rings_reverb_enable`/`rings_reverb_set`)
  already exist and work — would need re-exposing as a per-track toggle on each Rings
  track's own controls instead of in the Master reverb-type selector.

### Real IR options / improvements
- The current Algo reverb is functional but the comb filter network could be improved. Consider implementing Freeverb properly (8 combs + 4 allpass per channel) for better diffusion.
- OR: try the Beads/Clouds reverb from eurorack repo (`clouds/dsp/fx/reverb.h`) — same algorithm as the hardware module, already in our cloned repo. Would require compiling as WASM.

### Tape delay (revisit)
- The tape effect was removed due to a feedback loop bug. Root cause: the WaveShaperNode in the delay feedback path was incorrectly wired. Worth revisiting with a cleaner implementation: saturation → noise → wow/flutter as separate toggles rather than a single "Tape" button.

---

## Sequencer

### Randomise button
- Generate a random pattern in the current scale. Hold for variations.

### Swing/groove
- Push every other step slightly late. Classic groove control.

### Sub-steps / strumming (V2.5)
- Divide each step into sub-steps (64th notes). Rapid sequential triggers create a strumming/plucking texture — natural fit for Rings' resonant character.

### Decouple rhythm from pitch (V3)
- Separate rhythm lane (on/off) from pitch lane (what note). Different lane lengths = polyrhythm. Like a real modular patch.

---

## New audio modules

### Noise source for Rings IN port
- Currently Rings uses `internal_exciter = true` (its own noise burst on each trigger).
- Feeding external audio into the IN port gives much richer excitation textures.
- Requires WASM recompile: set `internal_exciter = false`, expose `in_buffer` API.
- Design options: white noise burst (percussive), bowed noise (sustained), mic input.
- Needs a simple ADSR envelope. Lots of sound design to work out — plan before building.

### Clouds Send knob per track
- Clouds (shipped 2026-07-01, see AGENTS.md "Clouds granular effect") currently takes
  every track's signal at one fixed level (`cloudsSend.gain.value = 0.4` in
  `createTrackWorklet`) — there's no per-track knob to control how much of each track
  feeds the granulator, unlike Delay/Reverb Sends which already have one.
- Architecturally ready: `TrackNodes.cloudsSend` and `setTrackSend(id, 'clouds', v)`
  already exist, mirroring `delaySend`/`reverbSend` exactly. Just needs a 3rd knob
  added to each track panel's Sends row + a `cloudsSend` field added to the
  per-track save-format types (`RingsParamsState`/`PlaitsParamsState`/
  `DrumParamsState` in App.tsx) with a version bump + migration, same pattern as
  the existing `delaySend`/`reverbSend` fields.

### Clouds params not saved
- `cloudsUi` (Freeze/Mix/Position/Size/Pitch/Density/Texture/Feedback/Reverb) lives
  in local `App.tsx` state only, not the save format — same for the Grids
  generator's X/Y/density/randomness inputs (`gridsUi`). Deliberately deferred to
  keep the save-format surface smaller for this round; add both if wanted, same
  version-bump + migration pattern as other save fields.

### Clouds spectral / stretch / looping-delay playback modes
- `clouds_set_playback_mode()` supports all 4 of Clouds' modes (0=granular,
  1=stretch, 2=looping delay, 3=spectral) and all compile/link fine, but only mode
  0 (granular) is used by `CloudsControls.tsx` today. Modes 1/2 are plausible
  same-session follow-ups; mode 3 (spectral) is UNTESTED — verify it produces sane
  audio (same RMS/peak/NaN check as in AGENTS.md) before exposing it in the UI.

### Clouds resampler quality
- `public/clouds-processor.js`'s `LinearResampler` (added 2026-07-01, needed because
  Clouds' DSP is hardcoded to 32kHz internally but the AudioContext runs at
  44.1/48kHz — see AGENTS.md) is linear interpolation, not a windowed-sinc
  resampler. Adequate for a granular texture effect but introduces some aliasing.
  Worth revisiting with a proper resampler if the wet signal sounds gritty even at
  low density/texture.

### Beads (Mutable Instruments' newer granular/resonator module) — needs firmware source
- Checked 2026-07-01: `rings-source/` (the `pichenettes/eurorack` clone in this repo)
  does NOT contain Beads. `git -C rings-source log --oneline -5` shows the clone's
  HEAD predates Beads' existence as a module; `git -C rings-source ls-tree -r HEAD
  --name-only | grep -i beads` and `find rings-source -iname '*beads*'` both come up
  empty, and there's no other branch/tag in the clone with different content
  (`git -C rings-source branch -a` shows only `master`). Real Beads firmware source
  needs to be added to `rings-source/` (a newer clone/fetch of `pichenettes/eurorack`,
  or Beads' own repo if it's separate) before this is attemptable — do NOT
  reimplement it from scratch without real source, that produces something that
  "sounds kind of similar" but isn't actually Beads.

---

## UI

### Full design pass — Klevgrand-inspired
- Move away from the dark Eurorack aesthetic toward something lighter, warmer, more consumer-friendly.
- Reference: Klevgrand (Daw Cassette, Drumlane, Plonk) — minimal, modern, uncluttered, hardware-inspired without being skeuomorphic.
- Do this before adding major new UI features — sets the design system everything else builds on.

---

## Notes

- When starting a new session, read [AGENTS.md](AGENTS.md) first, then this file
- Add new ideas here rather than implementing immediately
- Remove items from here once shipped — log them under "Recently shipped" above,
  then prune that section once it's no longer useful context
- Deploy = `npm run build` → `npx wrangler deploy` → `git commit` + `git push`,
  every time, all three steps (see AGENTS.md for why)
