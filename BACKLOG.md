# Emma Lee — Feature Backlog

Ideas and improvements to work through. Roughly ordered by priority within each section.

See [AGENTS.md](AGENTS.md) for architecture, deploy steps, and key decisions — read that
first if you're new to the codebase. This file is just queued ideas.

## Generative sequencing (Phase 1 "nerdy" version SHIPPED 2026-07-12)

**Vision, two phases — build nerdy first, simplify later**: end goal is an
interface for people who know nothing about synths, who'd pick a "vibe" that
auto-sets speed/complexity/quantizer/etc. and get a soundscape they can mold
with a few controls. **Phase 1 — the full nerdy version, every knob
exposed — is done**: a "Piano Roll / Generative" toggle per melodic track
(Rings A/B, Plaits), a hand-rolled Turing-machine note generator decoupled
from a choice of 4 gate/rhythm models, a per-voice note-set + octave-range
window, and a Gate Bias knob reusing the Rings exciter/Plaits envelope
Attack/Sustain/Gate controls already built. Full architecture writeup,
including the state-ownership gotcha and what got hand-ported from Marbles'
real source vs. built fresh, lives in AGENTS.md's "Generative sequencing"
section — read that before touching this code.

**Phase 2 (later, once Phase 1 has been played with enough to know what
actually matters)**: a "vibe" preset/mapping layer on top that hides the
knobs behind a few macro controls for the non-expert. Don't design this into
Phase 1's architecture prematurely.

**Not yet built, still open** (from the original brainstorm — evaluate
against actual experience playing with Phase 1 before building any of these):
- **Euclidean gate option** — a second, more "tamed"/predictable density+
  complexity control (fill count + rotation) alongside the 4 shipped
  Marbles-derived models. Probably more a Phase 2 fit than Phase 1.
- **Random-walk pitch mode** — small step size + a "gravity" pulling back
  toward a center note, as a second note-generation flavor alongside the
  shipped Turing-machine core. Genuinely slow drift instead of stepped jumps.
- **Weighted note probability** within the selected note set (some notes
  appear more often than others) — Marbles' quantizer supports this natively;
  the shipped v1 quantizer is uniform-random-by-index, deliberately simpler.
- **"Evolve" macro knob** morphing density+complexity+mutation together —
  explicitly Phase 2 (collapses knobs Phase 1 wants exposed individually).
- **Freeze-to-piano-roll capture** — snapshot a generated pattern into fixed
  steps so it becomes hand-editable afterward, bridging the two sequencing
  modes instead of leaving them totally separate.
- **Cross-voice generative linking** (a la Marbles' X/Y correlation) — one
  voice's density/pattern subtly influencing another's, so Rings A/B/Plaits
  feel like one soundscape rather than 3 independent random sources. Stretch.
- **Seeded RNG you can lock** — a "hold this seed" toggle to A/B two knob
  settings against the exact same underlying random draw. Real hardware
  can't do this; software can. Not built in v1.
- **Generate slow timbre drift, not just notes/gates** — plug a generative
  source into Structure/Brightness/Timbre the way Marbles' X/Y drives CV
  targets. Blocked on the separately-backlogged assignable-LFO-pool rework
  (today's LFOs are hardwired per-parameter, no target-selection hook to
  drive from a generative source yet) — see "Modulation" section below.
- **A/B snapshot compare** for generative parameter sets specifically,
  lighter-weight than a full song save.
- **Richer activity visualization** — a scrolling trail of recent gate hits/
  note choices. Partially free already: `VoiceTabViz`'s per-tab activity glow
  already reflects generative firing (it just subscribes to the same
  `onVoiceTrigger` pub/sub every trigger source uses) — a dedicated
  visualization would go further than that incidental side effect.
- **Per-note gate-length jitter** (Marbles' `pulse_width_std` equivalent) —
  v1's Gate Bias applies one fixed value per current setting to every fired
  note; per-note variation is a clean, low-risk later addition.

## Recently shipped (remove from here once stale)

- **2026-08-19** — Juno-60 track: a genuinely new 5th track (not a mode-swap),
  polyphonic, real gate-length control (a new `StepData.gateSteps`
  sequencer primitive — Junox has actual note-on/note-off, unlike every
  other track here). Vendored from JunoX (GPL-3.0), pure JS/AudioWorklet, no
  WASM. A Bank toggle switches between two real factory patch banks — 56
  Juno-60 presets ported from JunoX's own source, and 128 Juno-106 presets
  converted from an xlsx JunoX ships but never wires in (a real hardware
  patch dump, unzipped and parsed this session). 11 curated knobs including
  Noise + HPF (key to airy/cloudy textures) and a real LFO section (Rate/
  Delay/DCO Depth/VCF Depth — one LFO with multiple destinations, matching
  real hardware, not a per-parameter LFO pool like Rings/Plaits) — all
  explicitly requested. D-50
  character remains deferred — see the "no usable open-source engine" entry
  below. See AGENTS.md "Juno-60 track" for the full writeup.
- **2026-08-17** — Octave shift (-2..+2, all melodic tracks), Note Wander
  (0-5 scale-degree drift per step, first pass — simple uniform random, meant
  to be tried and revisited), and Plaits Tie (per-step gate extension reusing
  the existing envelope Sustain mechanism, no new WASM). All pure runtime
  transforms in `useSequencer.ts`'s `Tone.Loop` — stored step data untouched.
  See AGENTS.md "Octave shift, Note Wander, Plaits Tie".
- **2026-08-17** — Plaits Filter (real low-pass, cutoff+resonance, off by
  default) and a new "Cloud Atmosphere" engine (airy/breathy pad — forked
  from `AdditiveEngine` + a filtered-noise air layer, id 24 in the curated
  engine picker). Also fixed the Virtual Analog "Cutoff" mislabel (it's
  actually Sync/Width). One combined WASM recompile. See AGENTS.md "Plaits
  Filter + Cloud Atmosphere engine + Virtual Analog relabel".
- **2026-08-17** — 4 sequencer/save bug fixes: page-graying no longer leaks
  across pages, changing Key/Scale now remaps existing notes to the nearest
  fitting tone instead of wiping the piano roll, sends were investigated and
  confirmed NOT actually broken (no bug found), and Save now updates the
  currently-loaded song in place (a new "Save As" button makes an explicit
  copy). See AGENTS.md "Sequencer/save bug fixes".
- **2026-08-17** — Drum Character knob (param 0/harmonics, per-voice labeled
  Drive/Snappy/Noise) and an analog/synthetic Blend knob (crossfades Plaits'
  two independent drum models, `out`/`aux`) on all 3 drum voices. Pure JS +
  one worklet change, no C++ recompile. See AGENTS.md "Drum Character +
  analog/synthetic Blend".
- **2026-07-12** — Generative sequencing, Phase 1: a "Piano Roll / Generative"
  toggle per melodic track (Rings A/B, Plaits). A hand-rolled 8-bit
  shift-register Turing machine generates notes (Mutation knob: 0 = locked
  8-step loop, 1 = fully random, in between = slow evolving character),
  fully decoupled from a choice of 4 gate/rhythm models hand-ported from
  Marbles' real `TGeneratorModel` (Steady/Wandering/Groove/Evolving —
  Density + Complexity controls). Per-voice note-set picker (1-12 scale
  degrees, root-relative so it transposes with the global Key) + independent
  octave-range window. A Gate Bias knob drives the existing Rings exciter
  Gate(ms) / Plaits envelope Attack+Sustain controls per fired note (no new
  envelope system) — the instrument panel's own Gate/Attack/Sustain sliders
  disable and relabel while generative mode is on to avoid fighting that
  write. Pure TypeScript, no WASM. See AGENTS.md "Generative sequencing" for
  the full writeup and what's still open (Phase 2 + the ideas above).
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

### New sequencer type (raised 2026-08-16)
- User wants to explore a genuinely different sequencer type once the current
  laundry list (octave/wander/tie, Plaits Filter/Atmosphere, drum
  Character/Blend, the save/scale/sends bug fixes) settles. No concrete shape
  yet — just a placeholder so the idea doesn't get lost. Worth a real
  brainstorming/planning pass (not a quick add) once picked up, given how
  central `useSequencer.ts`'s `Tone.Loop`/`TrackSeqState` model is to
  everything else in this codebase.

---

## Drums

### 4th percussion voice — clap / Peaks `fm_drum` port (deferred 2026-08-17)
- The user wants a 4th full percussion voice (clap) alongside the existing
  Hi-Hat/Snare/Kick. Scoped out of the 2026-08-17 drum round on purpose — that
  round only did the "cheap wins" (Character + Blend knobs on the existing 3
  voices, see AGENTS.md), not a new voice. Two real approaches: (a) a genuine
  clap DSP algorithm (noise burst + comb-filtered pseudo-random pulse train),
  or (b) port Peaks' `fm_drum` model (Mutable Instruments' eurorack module,
  a 2-op FM drum/clap generator) similar to how the Rings exciters were
  ported from Elements. Either is a real, separately-sized effort — new
  engine registration + a new drum voice slot in `App.tsx`/`DrumControls.tsx`
  (today's drum voices are hardcoded to exactly 3), not a small addition.
  Check `rings-source/` actually contains Peaks' source before committing to
  option (b) — same caveat as the Beads entry below, don't reimplement from
  scratch without real source.

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

### Bristol — catalog of open-source vintage synth emulations for future track ideas (researched 2026-08-19)
- While researching an engine for the new Juno track (see "Juno-60/106 polyphonic
  track" below), surveyed [Bristol](https://sourceforge.net/projects/bristol/), a
  mature 20+ year old GPL Linux synth emulator (engine + a GUI called "brighton").
  It emulates 38 instruments total — full list, by family:
  - **Moog**: Mini, Voyager, Voyager Electric Blue, Memorymoog, Sonic Six, MG-1
    Concertmate
  - **Sequential Circuits**: Prophet-5, Prophet-5/FX, Prophet-10, Pro-One
  - **Oberheim**: OB-X, OB-Xa
  - **ARP**: Axxe, Odyssey, 2600, Solina String Ensemble
  - **Korg**: Polysix, Poly-800, Mono/Poly, MS-20 (unfinished)
  - **Roland**: Juno-60, Jupiter-8 (no D-50, no Juno-106 — confirmed, see below)
  - **Yamaha**: DX-7, CS-80 (unfinished)
  - **Fender/Crumar**: Rhodes Mark-I Stage 73, Rhodes Bass Piano, Roadrunner,
    Bit-01, Bit-99, Bit+Mods, Stratus, Trilogy
  - **Hammond**: B3 (default engine)
  - **Other**: Vox Continental, Vox Continental Super/300/II, Baumann BME-700,
    Commodore 64 SID chip synth ("Sidney"), SID polysynth ("Melbourne",
    unfinished), EMS Synthi-A ("aks", unfinished), a granular synth (unfinished),
    a 16-track mixer (test-only), its own "Bassmaker" step sequencer
  - Source: [Bristol manpage](https://manpages.ubuntu.com/manpages/bionic/man1/bristol.1.html)
- **Important caveat before picking any of these for a future track**: Bristol is
  architected as a standalone JACK/ALSA app — its own C engine process talks to the
  "brighton" GUI over a custom socket/IPC protocol. Extracting just the per-voice
  DSP from any one of these would be a real, nontrivial port (unlike JunoX below,
  which is already a clean, drop-in-shaped Web Audio library). Don't assume "it's
  on the list" means "it's easy to add" — budget real porting time.
- Logged here purely as a reference list for when the next track/engine idea comes
  up — not scoped or prioritized, just don't lose track of what's out there.

### Roland D-50 / LA synthesis — no usable open-source engine exists (researched 2026-08-19)
- Looked for an engine to pair with the new Juno track (user wanted D-50 and/or
  Juno character, switchable). Bristol doesn't have D-50 (see above).
  [DSynkant](https://github.com/ngeiswei/dsynkant) is the one real attempt — GPL,
  has recent commits (Jan 2026, adding CPU/service-manual reverse-engineering
  notes) — but its own README says plainly: "no GUI, no presets, and no sound."
  It's a reverse-engineering scaffold, not a working synth. Nothing to port.
- Why this niche is empty: D-50's sound is a short PCM "attack transient" sample
  (bell/pluck/breath — actual copyrighted Roland ROM data, not legally
  redistributable) layered onto a synthesized "LA" tone that's itself just
  subtractive synthesis (DCO + resonant low-pass filter) — structurally close to
  a Juno voice. That's likely why Juno clones exist and D-50 clones don't: half of
  D-50 is Juno-shaped and buildable, the other half depends on samples nobody can
  legally ship.
- If D-50 character is wanted later: don't keep searching for a pre-built engine —
  there isn't one. Instead, reuse the Juno track's own DCO/VCF/VCA as the
  synthesized layer and add a short *synthesized* (not sampled) transient on top —
  same layering trick already used for Plaits' Cloud Atmosphere engine (harmonic
  tone + filtered noise layer). That's a build, not a find.

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
