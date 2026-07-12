# Emma Lee — Feature Backlog

Ideas and improvements to work through. Roughly ordered by priority within each section.

See [AGENTS.md](AGENTS.md) for architecture, deploy steps, and key decisions — read that
first if you're new to the codebase. This file is just queued ideas.

## Generative sequencing (long-term vision, raised 2026-07-12)

**Vision**: an interface for people who don't know anything about synths but
want to make a soundscape and have some control over it. Not a preset picker —
real generative control, just with guardrails a non-expert can turn without
getting lost. This is a big, multi-session initiative — plan it properly
before starting, don't wedge it into an unrelated session.

**Confirmed feasible**: unlike Beads (see that entry below), Marbles' actual
firmware DSP IS present in this repo's clone: `rings-source/marbles/random/
t_generator.cc/h` (the rhythm/gate "T" section), `x_y_generator.cc/h` (the
CV/note "X"/"Y" section), `quantizer.cc/h` + `discrete_distribution_quantizer.
cc/h` (a real weighted-scale quantizer, `Degree { voltage, weight }`, up to 16
degrees). `TGenerator` already exposes `bias`, `jitter`, `deja_vu` (pattern
memory/repeat), `length`, and — notably — `pulse_width_mean`/`pulse_width_std`,
which lines up directly with the short-gate-vs-sustained-note ask below. This
is a real reusable foundation, not a from-scratch reimplementation — though
whether to compile Marbles' C++ to WASM vs. hand-port the relevant algorithms
to plain TypeScript (like Grids' pattern generator was, see AGENTS.md) is an
open decision — Marbles' full class also carries CV-jack-reading/hardware
driver code this app has no use for, similar to how Elements' Exciter needed
trimming before Rings' exciter feature could use it cleanly.

**The core idea**: a new alternate sequencing mode per voice, toggleable
alongside the existing piano roll (not replacing it) — a Turing-machine-style
core generating notes, slow and evolving rather than bubbling arpeggios.
Requirements as specified:
- **Gate/trigger generation fully decoupled from note generation** — two
  independent generative streams, not one lockstep sequence.
- **Density** (how many triggers) and **Complexity** (pattern character)
  controls for the gate stream.
- **Short gate vs. long sustained note** needs its own variable — this can
  plug directly into the Attack/Sustain/Gate controls already built this
  session (Rings exciter Level/Attack/Gate, Plaits envelope Attack/Sustain)
  rather than needing a whole new envelope system of its own.
- **A quantizer**, per voice.
- **Note limiting per voice**: pick a set of 1 to 12 notes (not a whole
  scale) to constrain the generative output to.
- **A range window independent of the note selection**: e.g. select C/E/G,
  then separately choose which octave(s) those play in — octaves 1-3, or a
  narrower 0-1 window. Two orthogonal controls: which pitch classes, and
  which octave range they're allowed to occupy.

**Brainstormed additions** (not yet requested, ideas to evaluate later):
- **Euclidean gate option** alongside Marbles' own rhythm models, as a second,
  more "tamed"/predictable density+complexity control (fill count + rotation)
  — may suit total beginners better than Marbles' probabilistic chaos.
- **Random-walk pitch mode** (small step size + a "gravity" pulling back
  toward a center note) as a second note-generation flavor alongside the
  Turing-machine/shift-register core — genuinely slow drift, not stepped jumps.
- **Weighted note probability** — Marbles' quantizer already supports
  per-degree weights; within the user's selected note set, some notes could
  appear more often than others, not uniform-random.
- **"Evolve" macro knob** — one knob morphing density+complexity+drift
  together, for users who don't want five separate controls to reason about.
- **Freeze-to-piano-roll capture** — snapshot a generated pattern into fixed
  steps so it becomes hand-editable afterward, bridging the two sequencing
  modes instead of leaving them totally separate.
- **Cross-voice generative linking** (a la Marbles' X/Y correlation) — one
  voice's density/pattern subtly influencing another's. Stretch idea, later.

## Recently shipped (remove from here once stale)

- **2026-07-12** — Plaits envelope: Attack (0-3000ms, swell in instead of
  Plaits' fixed pitch-tied instant attack) + Sustain (0-1, holds indefinitely
  at max instead of always decaying to silence — a real drone). Uses Plaits'
  own real LEVEL-CV mechanism (`modulations.level_patched`, previously wired
  in the wrapper but hardcoded off) rather than a bolted-on JS gain multiply
  — `patch.decay`/"Decay" keeps its exact original meaning and wiring. Small
  WASM recompile (2 one-line C++ setters); all the envelope shaping logic is
  JS in `plaits-processor.js`. At the defaults (0, 0) sounds byte-identical
  to before — old saves/presets unaffected. See AGENTS.md "Plaits envelope".
- **2026-07-11** — Rings exciter Level + Attack: Mallet/Plectrum/Particles
  read much quieter than Flow/Noise at the same fixed gain (impulses vs a
  continuous signal), so added a per-track **Level** knob (0-200%) replacing
  the old flat gain constant. Also added an **Attack (ms)** knob (0-500ms,
  default 0/instant) — Elements' exciter models have no built-in envelope, so
  this fades the excitation signal in linearly on each trigger, a real swell
  for Flow/Noise's sustained texture. Both are pure JS in
  `rings-processor.js`, no WASM recompile. See AGENTS.md "Rings exciters" for
  the full writeup.
- **2026-07-10** — Rings exciters: Elements' Mallet/Plectrum/Particles/Flow/Noise
  models (compiled from a trimmed fork of `elements::Exciter`, avoiding the 94%
  of `resources.cc` that's baked-in sample-player data) now feed Rings' real IN
  port instead of always leaving it silent. Per-track Model dropdown +
  Timbre/Parameter sliders + a synthesized Gate-length control (the sequencer
  has no note-off concept, so gate length simulates a held excitation window
  per trigger). Two new presets ("Bowed Drone", "Granular Sparkle") show off
  the sustained/granular textures Rings' own internal exciter can't produce.
  See AGENTS.md "Rings exciters" for the full writeup, including the export-letter
  and C++ linkage gotchas hit along the way.
- **2026-07-10** — FIXED: Clouds was completely silent — `clouds_process()` was being
  fed ragged block sizes, and the 8-bit µ-law quality modes (the boot default since
  the quality-control feature) trap on any non-32-frame block, permanently killing
  the worklet on its first audio block with no console error. `clouds-processor.js`
  now feeds the WASM exact 32-frame blocks via an input FIFO, catches WASM traps
  (degrades to silence + reports to main thread), and every worklet now logs
  `onprocessorerror` so this class of failure can never be silent again. See
  AGENTS.md "Clouds granular effect" for the full post-mortem.
- **2026-07-10** — Session-wide cleanup: removed ~6KB of dead CSS (old substep
  drawer, pre-rework page selector, legacy note controls), fixed an invalid CSS
  property, typed the window globals, zero eslint/tsc errors across src/.
- **2026-07-09/10** — Plaits LFOs (same 4-slot audio-thread system as Rings, added
  to `plaits-processor.js`; UI mirrors RingsControls). LPG Colour control removed —
  pinned to 1.0 ("darker" full-LPG character) at every engine sync. Second demo
  song "Phased and Bent". Per-voice activity dots in the track tabs (firefly
  scatter: x=pitch, size=velocity, driven by an `onVoiceTrigger` pub/sub in
  engine.ts). LFO Rate knobs: log taper + floor lowered to a 30s cycle.
- **2026-07-09** — UI cleanup round: Save/Export/Import folded into a full Songs
  menu (shows what's loaded, Examples vs Your songs sections), Key (root+scale)
  moved to the header and made global across melodic tracks, track tabs span the
  piano roll width with per-track icons, bigger strum/probability/end-of-sequence
  touch targets.
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

## Modulation

### Assignable LFO pool instead of one-per-parameter (raised 2026-07-11)
- Today: 4 fixed LFOs per Rings/Plaits track, one hardwired per parameter
  (Structure/Brightness/Damping/Position, or the Plaits equivalents) — 3
  tracks (Rings A/B + Plaits) × 4 = 12 always-visible LFO widgets. Confirmed
  this is a UI-density complaint, not a performance one: LFOs update once per
  audio block (~2.7ms), just a sin/cos plus one WASM `set_param` call each,
  and the existing CPU meter already shows <1% load with all of them running
  (see AGENTS.md's CPU monitor note / `rings-processor.js`'s LFO loop).
- Idea: a smaller pool of assignable LFOs per voice (e.g. 2-3), each with a
  Target dropdown for which param it modulates — closer to how a real
  modular patch works (a handful of LFOs you route wherever you want, not
  one glued to every destination).
- Real rework, not a small tweak: needs a new target-selector control per
  LFO slot, and a save-format migration since `LfoState[]` is currently
  indexed by parameter position, not by independent slot. Plan properly
  before starting — don't just wedge a dropdown into the existing array.

---

## New audio modules

### Clouds mono quality modes have very long buffer warm-up
- With this build's enlarged buffers, the mono quality options give the whole 1MB
  large buffer to one channel: quality 1 (16-bit mono) is a ~16s buffer, quality 3
  (8-bit mono) ~32s. Grains read several seconds "back", so after switching to a
  mono mode you hear nothing until the buffer has filled that far — verified real
  behavior, not a bug (see AGENTS.md "Clouds granular effect"). Options if it
  bothers anyone: shrink the buffers in `clouds_wrapper.cpp` (recompile), or note
  the warm-up in the Quality dropdown labels.

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
