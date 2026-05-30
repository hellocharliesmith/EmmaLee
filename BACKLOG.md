# Emma Lee — Feature Backlog

Ideas and improvements to work through after MVP.

---

## Reverb

- **Option 1 — Rings' built-in reverb:** Expose Rings' internal FDN reverb parameters (amount, time) directly from the WASM wrapper and remove the current ConvolverNode. The reverb is already running inside `Part::Process` — just needs to be surfaced. Best fit for the sound.
- **Option 2 — Real IR file:** Replace the algorithmically-generated white noise impulse response with a free professionally-recorded IR (plate, chamber, etc.) loaded into the existing ConvolverNode. Low effort, immediate improvement.

---

