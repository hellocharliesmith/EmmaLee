import type { LfoState } from '../types';

// Off -> Sine -> Random -> Off, single button, icon reflects state. Shared by
// RingsControls and PlaitsControls — both drive the same 4-slot LFO system.
export function lfoIcon(lfo: LfoState) {
  if (!lfo.on) return <span className="lfo-icon-dash" />;
  if (lfo.wave === 'sine') {
    return (
      <svg width="16" height="10" viewBox="0 0 20 12">
        <path d="M1,6 C4,0 6,12 9,6 C12,0 14,12 17,6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  // "Smooth random" — an irregular, non-periodic wandering curve (unlike the
  // clean, evenly-spaced sine above) — reads as filtered/slewed noise rather
  // than stepped/quantized randomness.
  return (
    <svg width="16" height="10" viewBox="0 0 20 12">
      <path d="M1,7 C2,3 3,9 4,5 C6,1 7,10 9,6 C11,2 12,8 14,4 C15,7 16,2 17,6"
        fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function nextLfoState(lfo: LfoState): Partial<LfoState> {
  if (!lfo.on) return { on: true, wave: 'sine' };
  if (lfo.wave === 'sine') return { on: true, wave: 'random' };
  return { on: false };
}
