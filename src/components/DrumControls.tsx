import { setDrumParam, setDrumBlend, setTrackVolume, type DrumVoiceId } from '../audio/engine';
import { Knob } from './Knob';
import { Dropdown } from './Dropdown';
import type { DrumPreset } from '../presets';

const VOICE_ORDER: DrumVoiceId[] = ['drumHihat', 'drumSnare', 'drumKick'];
const VOICE_LABELS: Record<DrumVoiceId, string> = {
  drumHihat: 'Hi-Hat', drumSnare: 'Snare', drumKick: 'Kick',
};

// harmonics (param 0) is a real, distinct character control per drum engine
// (see analog_bass_drum.h / analog_snare_drum.h / hi_hat.h Render() signatures
// and engine.ts's createDrumTrack comment) — drive/self-FM for the kick,
// noise/body blend ("snappy") for the snare, metallic-noise mix for the hi-hat.
// One knob, per-voice label so it reads clearly despite meaning something
// different each time — same spirit as PlaitsControls.tsx's ENGINE_PARAM_LABELS.
const CHARACTER_LABELS: Record<DrumVoiceId, string> = {
  drumKick: 'Drive', drumSnare: 'Snappy', drumHihat: 'Noise',
};

export interface DrumVoiceParams {
  tone: number;
  decay: number;
  volume: number;
  character: number; // harmonics (param 0), default 0.5 -- see CHARACTER_LABELS above
  blend: number;      // 0-1, analog<->synthetic mix, default 0 (pure analog, today's sound)
}

export interface DrumControlsProps {
  voices: Record<DrumVoiceId, DrumVoiceParams>;
  presets: DrumPreset[];
  onPresetLoad: (p: DrumPreset) => void;
  onVoiceChange: (voice: DrumVoiceId, field: 'tone' | 'decay' | 'volume' | 'character' | 'blend', value: number) => void;
}

// Plaits' drum engines (bass_drum/snare_drum/hi_hat) all use the same mapping in
// their underlying DSP (confirmed in analog_bass_drum.h / analog_snare_drum.h /
// hi_hat.h Render() signatures): param 1 (timbre) = tone filter, param 2 (morph)
// = decay time. patch.decay (param 3) does nothing for these — see engine.ts.
export function DrumControls({ voices, presets, onPresetLoad, onVoiceChange }: DrumControlsProps) {
  return (
    <div className="rings-controls">
      {presets.length > 0 && (
        <div className="knob-row">
          <label>Preset</label>
          <Dropdown value="" placeholder="— Load preset —"
            options={presets.map((p, i) => ({ value: String(i), label: p.name }))}
            onChange={v => { const p = presets[parseInt(v)]; if (p) onPresetLoad(p); }}
          />
        </div>
      )}
      {VOICE_ORDER.map(voice => (
        <div key={voice} className="knob-row">
          <label>{VOICE_LABELS[voice]}</label>
          <Knob value={voices[voice].volume} min={0} max={1} label="Vol"
            onChange={v => { onVoiceChange(voice, 'volume', v); setTrackVolume(voice, v); }} />
          <Knob value={voices[voice].tone} min={0} max={1} label="Tone"
            onChange={v => { onVoiceChange(voice, 'tone', v); setDrumParam(voice, 1, v); }} />
          <Knob value={voices[voice].decay} min={0} max={1} label="Decay"
            onChange={v => { onVoiceChange(voice, 'decay', v); setDrumParam(voice, 2, v); }} />
          <Knob value={voices[voice].character} min={0} max={1} label={CHARACTER_LABELS[voice]}
            onChange={v => { onVoiceChange(voice, 'character', v); setDrumParam(voice, 0, v); }} />
          <Knob value={voices[voice].blend} min={0} max={1} label="Blend"
            onChange={v => { onVoiceChange(voice, 'blend', v); setDrumBlend(voice, v); }} />
        </div>
      ))}
    </div>
  );
}
