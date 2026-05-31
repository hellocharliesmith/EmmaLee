# Emma Lee — Feature Backlog

Ideas and improvements to work through. Roughly ordered by priority within each section.

---

## Visual & Performance

### Scrolling waveform display
- **What:** Stylish master output visualization — scrolling waveform history à la FabFilter Pro-C3.
- **How:** `AnalyserNode` taps the final output (zero audio impact). On every `requestAnimationFrame`, read `getFloatTimeDomainData()`, compute peak, push to circular buffer of ~500 values, draw scrolling history to `<canvas>`. Pink/white glow on waveform, dark background, subtle dB grid lines.
- **Performance:** Very low. Canvas is GPU-accelerated. AnalyserNode is read-only.
- **Effort:** ~2–3 hours. Good next visual feature.

### CPU / performance monitor
- **What:** Real-time DSP CPU meter — shows what % of the audio thread budget `process()` is using. Useful during development, potentially user-facing as effects accumulate.
- **How:** `performance.now()` at start/end of AudioWorklet `process()`. Each 128-sample block has ~2.9ms of budget. Average over ~100 blocks, send to main thread every 100ms via postMessage. Small badge in the UI (e.g. "CPU 34%") that goes amber/red under load.
- **Dev mode:** Initially behind a URL param (`?perf=1`) or always visible — TBD.
- **Effort:** ~1 hour.

---

## Reverb

### Rings' built-in reverb
- Expose Rings' internal FDN reverb parameters directly from the WASM wrapper. Already running inside `Part::Process`, just needs to be surfaced. Best tonal fit — designed specifically for Rings' sound.
- Requires WASM recompile + new wrapper functions.

### Real IR options / improvements
- The current Algo reverb is functional but the comb filter network could be improved. Consider implementing Freeverb properly (8 combs + 4 allpass per channel) for better diffusion.
- OR: try the Beads/Clouds reverb from eurorack repo (`clouds/dsp/fx/reverb.h`) — same algorithm as the hardware module, already in our cloned repo. Would require compiling as WASM.

### Tape delay (revisit)
- The tape effect was removed due to a feedback loop bug. Root cause: the WaveShaperNode in the delay feedback path was incorrectly wired. Worth revisiting with a cleaner implementation: saturation → noise → wow/flutter as separate toggles rather than a single "Tape" button.

---

## Sequencer

### Randomise button
- Generate a random pattern in the current scale. Hold for variations.

### Save/load patterns
- Serialize grid state to URL hash or localStorage. Share a pattern via link.

### Step probability
- Each cell has a % chance of firing. Creates generative variation.

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

### Clouds granular processor
- MI Clouds/Beads compiled to WASM as a second AudioWorklet — feeds into or alongside Rings.
- Very complex. Source in eurorack repo (`clouds/` directory).
- Long-term project. Do noise source first.

---

## UI

### Full design pass — Klevgrand-inspired
- Move away from the dark Eurorack aesthetic toward something lighter, warmer, more consumer-friendly.
- Reference: Klevgrand (Daw Cassette, Drumlane, Plonk) — minimal, modern, uncluttered, hardware-inspired without being skeuomorphic.
- Do this before adding major new UI features — sets the design system everything else builds on.

---

## Notes

- When starting a new session, read this file first
- Add new ideas here rather than implementing immediately  
- `npx wrangler deploy` to push to live after `npm run build`
- Git push after every deploy — GitHub keeps history
