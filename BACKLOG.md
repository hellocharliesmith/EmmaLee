# Emma Lee — Feature Backlog

Ideas and improvements to work through. Roughly ordered by priority within each section.

---

## Immediate / Next session

### Mobile-friendly sequencer — DONE (4x4 grid, bigger touch points)

### Better reverb
- **Option A — Rings' built-in reverb:** Expose Rings' internal FDN reverb parameters directly from the WASM wrapper. Already running inside `Part::Process`, just needs to be surfaced. Best tonal fit.
- **Option B — Real IR file:** Swap the generated white noise IR with a free professionally-recorded IR (plate, chamber, etc). Low effort, instant improvement.
- **Option C — Beads reverb algo:** Research the reverb algorithm in MI Beads source (successor to Clouds). Beads likely has an improved version of the reverb in `clouds/dsp/fx/reverb.h`. Check if Beads is in our cloned eurorack repo. May require a separate clone from `github.com/pichenettes/eurorack` (beads/ directory).

### Simple delay
- BPM-synced (1/4, 1/8, dotted 1/8, etc — tied to Tone.js Transport)
- Tape-style: filtered feedback (BiquadFilterNode low-pass in feedback loop to simulate tape rolloff)
- Stereo/ping-pong option nice-to-have
- Native Web Audio only — no new WASM compilation needed
- Controls: time (note division), feedback amount, filter cutoff, wet/dry

### LFO modulation
- Simple JS LFO (sine wave, runs on main thread, sends setRingsParam messages at ~30fps)
- Targets: brightness, damping, position (not structure — too dramatic)
- Controls per LFO: rate (Hz or BPM-sync), depth, target selector
- Defaults should be subtle — small depth, slow rate
- Start with one LFO, can add more later

---

## UI

### Style guide — Klevgrand-inspired
- Reference: Klevgrand (Daw Cassette, Drumlane, Plonk) — minimal, modern, warm, uncluttered
- Hardware-inspired but not skeuomorphic — no fake wood or screws
- Direction: move away from dark/Eurorack aesthetic toward lighter, warmer palette
- Clean readable sans-serif typography
- Good use of white space
- Keep current dusty pink as accent? Or revisit whole palette
- **This should be a full design pass before doing major new UI features**

---

## Sequencer improvements

### V2 — Piano roll style
- Rows = pitches (C major scale), columns = steps
- Visual grid with filled cells = active
- Much more intuitive for non-musicians
- Key labels on left edge

### V2.5 — Sub-steps (strumming)
- Each step can contain multiple sub-steps (e.g. 4 sub-steps per step = 64th notes)
- Enables strumming Rings — rapid sequential triggers across different pitches
- Natural fit for Rings' resonant character

### V3 — Decouple rhythm and note sequencers
- Separate rhythm lane (on/off per step) from pitch lane (note per step)
- Different lengths possible per lane (polyrhythm)
- Like a real modular — clock goes to both, they run independently
- Scale lock: constrain all notes to a selected key/mode — helpful for beginners

### Other sequencer ideas
- Randomise button (generate new pattern)
- Save/load patterns (localStorage or URL hash)
- Step probability (each step has % chance of firing)
- Swing/groove control

---

## New audio modules

### Noise source for Rings IN port
- Currently: Rings uses internal_exciter = true (its own internal noise burst on strum)
- Goal: feed external audio into the IN port for richer excitation textures
- Requires WASM recompile: set internal_exciter = false, expose in_buffer API
- **White noise burst** — sharp attack, percussive. Good for modal/struck sounds.
- **Bowed noise** — continuous filtered noise with envelope. Good for sustained/bowed sounds.
- Simple ADSR envelope on the noise source
- Lots of sound design to figure out — plan carefully before implementing

### Clouds granular processor (longer term)
- MI Clouds/Beads compiled to WASM as a second AudioWorklet
- Very complex — 6 parameters, 4 modes, grain cloud processing
- Source in eurorack repo (clouds/ directory)
- Post-MVP — do delay and LFO first

---

## Notes

- When starting a new session, read this file first
- Add new ideas here rather than implementing immediately
- Git push after every feature — Cloudflare auto-deploys
