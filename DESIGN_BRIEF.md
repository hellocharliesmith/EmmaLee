# Emma Lee — Design Brief for Control Component Library

## What this is

Emma Lee is a browser-based synthesizer built for a non-technical, first-time
user (not a musician/producer audience, not a commercial product — a
personal instrument). Vite + React 19 + TypeScript, plain CSS (no Tailwind,
no CSS-in-JS, no component library) using CSS custom properties for theming.
Dark theme only. Must work well with both mouse (desktop) and touch (iPad) —
this is used on an iPad as much as a laptop.

## What we're asking for

A cohesive component library for **every interactive control across all 5
pages/tabs** (Rings A, Rings B, Plaits, Drums, Master), plus help with
overall page layout/spacing. Screenshots of the current state of all 5 tabs
are attached separately — this doc is the text half of the brief.

The current UI works but was built incrementally, control-by-control, over
many sessions — it's functional but not designed as a system. We want a
real component library: consistent sizing, consistent states, consistent
spacing rules, that we then apply everywhere.

## Current visual language (extract, don't reinvent from scratch)

### Color — exact tokens already in use

```css
/* Raw palette — 5 hue families, 11 steps each (50-950) */
--rose-400: #a07d83;   --rose-500: #76565b;   /* Rings A track accent */
--teal-400: #7da09e;   --teal-500: #567674;   /* Rings B track accent */
--sage-400: #92a07d;   --sage-500: #697656;   /* Plaits track accent */
--slate-400: #7d89a0;  --slate-500: #566176;  /* Drums track accent */
--neutral-dark-300: #b3ada8; --neutral-dark-400: #978f87; /* Master accent */

/* Semantic roles, all mapped onto the neutral-dark ramp */
--bg-body: var(--neutral-dark-950);   /* #131211 */
--bg-panel: var(--neutral-dark-900);  /* #1c1a18 */
--bg-input: var(--neutral-dark-900);
--bg-hover: var(--neutral-dark-800);  /* #312e2b */
--border: var(--neutral-dark-800);
--border-hover: var(--neutral-dark-600);
--border-disabled: var(--neutral-dark-700);
--text-bright: var(--neutral-dark-100);
--text-primary: var(--neutral-dark-200);
--text-tertiary: var(--neutral-dark-300);
--text-secondary: var(--neutral-dark-500);
```

**Important mechanic**: `--accent` / `--accent-dark` / `--accent-light` are
NOT fixed — they get overridden per active track (a class on the root `.app`
element switches the whole accent triplet: rose for Rings A, teal for Rings
B, sage for Plaits, slate for Drums, neutral for Master). Any new component
that uses `--accent` for its "active/filled" state will automatically
re-color itself when the user switches tabs — this is core to how the app
signals "which track am I looking at" and must be preserved.

### Typography

No custom font loaded — system font stack (`font-family: inherit` cascades
from the body default). Small sizes throughout: control labels run
0.62rem–0.9rem, mostly uppercase with letter-spacing 0.03em–0.1em for a
technical/hardware-module feel. The app title uses 1.1rem with a much wider
0.45em letter-spacing for a distinct wordmark moment.

### Spacing

Controls are grouped in horizontal "rows" (label left, one or more controls
right), rows are stacked with a `.section-divider` between logical groups.
Common gap between controls in a row: 16px.

## Current component inventory

Everything below already exists and is functional — the ask is to redesign
these as a consistent system, not to invent new interaction models unless
you think of something better.

1. **Knob** (`Knob.tsx`) — circular rotary control, drag vertically
   (up = increase, down = decrease) with both mouse and touch support. SVG
   arc showing value as a filled portion of a ~270° track, small dot marker
   at the current position, label below. Used for anything with a "hardware
   synth" feel: volume, sends, tone/decay, density, etc.

2. **Horizontal slider** (`<input type="range">`) — used for wider-range or
   more frequently-adjusted params: Structure/Brightness/Damping/Position on
   Rings, Harmonics/Timbre/Morph on Plaits, everything on the Master tab
   (Delay/Texture/Reverb sections), the X/Y pad on the Drums pattern
   generator. No custom thumb/track styling currently — this is a strong
   candidate for redesign.

3. **Segmented button group** — a row of buttons where one is "active"
   (filled with `--accent`), rest are outlined. Used for: synth model/engine
   picker, reverb type picker (Plate/Hall/Digital/Algo), delay division
   (1/16, 1/8, d1/8, 1/4), page selector (1/2/3/4).

4. **Toggle button** (single, on/off) — Freeze (Texture panel), LFO
   enable/random-wave buttons, per-step strum direction. Same visual
   language as segmented buttons but standalone.

5. **Dropdown / select** — preset loader (per-voice and now per-effect),
   scale/root-note pickers, saved-songs list. Currently a native
   `<select>`, styled minimally.

6. **Step grid / piano roll** — the core sequencer UI. A grid of clickable
   cells (note × step), color-coded per track's accent, with a live
   playhead highlight during playback, an "End" row above it for setting
   loop length, and secondary rows below for per-step probability/velocity/
   strum-direction. This is the most complex and most important component —
   worth real attention, but changes here need to preserve the exact
   interaction model (click to toggle a note on/off at a grid position).

7. **XY pad** — currently just two stacked horizontal sliders labeled X/Y
   (Drums pattern generator). A real 2D drag-pad would be a nice upgrade if
   in scope.

8. **Track tabs** — top-level navigation between the 5 pages, each tab
   text-colored/highlighted in that track's accent when active.

9. **Vertical mixer faders** — Master tab only, one per track plus a master
   fader, taller than the horizontal sliders elsewhere.

10. **Level/waveform meter** — canvas-based live audio visualization, top of
    the Master tab.

## Constraints for whatever comes back

- **Touch-first is not optional.** A lot of generic "nice knob" design
  references assume precise mouse drag. Every control needs a real,
  comfortably-sized touch target and needs to work with touch drag, not
  just click.
- **Keep the per-track accent-color mechanic.** Don't design components that
  hardcode a single accent color — they need to inherit `--accent` (or
  equivalent) so the existing "whole UI re-tints per track" behavior keeps
  working.
- **Don't scope-creep into a different visual identity.** We like the
  dark, quiet, "hardware module" character already established — this is a
  refinement/systemization pass, not a rebrand.
- **Small footprint.** This runs on a phone-sized-to-iPad-sized viewport as
  the primary target, not a huge desktop canvas — keep components compact.

## Output format — what's actually usable here

Ranked by how directly I can implement it:

1. **Best: React components, code.** `.tsx` files with typed props
   following the existing pattern (see `Knob.tsx` — `value`, `min`, `max`,
   `label`, `onChange`), styled with plain CSS classes (not inline styles,
   not a CSS-in-JS library, not Tailwind — this project uses none of those)
   referencing the existing CSS custom properties for color. If it can
   output actual code in this shape, I can drop it in with minimal
   translation.

2. **Good: a structured component spec + static mockups.** Per component:
   name, purpose, all states (default / hover / active / dragging /
   disabled), exact sizing (px or rem), colors as references to the tokens
   above (not new hardcoded hex values unless it's proposing new tokens),
   and a plain-language description of the interaction. Static images
   (SVG preferred, since `Knob.tsx` is already SVG-based) showing each
   state. I can implement this myself in the existing style.

3. **Also useful, even bundled with either of the above: new design
   tokens.** If it wants to introduce new spacing/sizing/color values
   beyond what's in `:root` today, list them explicitly (as CSS custom
   properties or a simple table) rather than only showing them baked into a
   mockup — that way I merge them into the token system cleanly instead of
   reverse-engineering pixel values from an image.

**Not very usable on its own:** a single flat mockup image with no spec,
no states, and no dimensions — static images can't show drag/hover
behavior, which matters a lot here since almost every control is a
drag-based input, and I'd be guessing at exact values instead of
implementing them precisely.

## Screenshots

Five screenshots (Rings A, Rings B, Plaits, Drums, Master tabs, current
state) were captured alongside this brief — attach them together when
handing this off.
