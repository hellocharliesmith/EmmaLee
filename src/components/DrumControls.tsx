import { setDrumParam, type DrumVoiceId } from '../audio/engine';
import { Knob } from './Knob';

const VOICE_ORDER: DrumVoiceId[] = ['drumHihat', 'drumSnare', 'drumKick'];
const VOICE_LABELS: Record<DrumVoiceId, string> = {
  drumHihat: 'Hi-Hat', drumSnare: 'Snare', drumKick: 'Kick',
};

export interface DrumVoiceParams { tone: number; decay: number; }

export interface DrumControlsProps {
  voices: Record<DrumVoiceId, DrumVoiceParams>;
  onVoiceChange: (voice: DrumVoiceId, field: 'tone' | 'decay', value: number) => void;
}

// param: 0=harmonics ("Tone") 3=decay — see engine.ts setDrumParam
export function DrumControls({ voices, onVoiceChange }: DrumControlsProps) {
  return (
    <div className="rings-controls">
      {VOICE_ORDER.map(voice => (
        <div key={voice} className="knob-row">
          <label>{VOICE_LABELS[voice]}</label>
          <Knob value={voices[voice].tone} min={0} max={1} label="Tone"
            onChange={v => { onVoiceChange(voice, 'tone', v); setDrumParam(voice, 0, v); }} />
          <Knob value={voices[voice].decay} min={0} max={1} label="Decay"
            onChange={v => { onVoiceChange(voice, 'decay', v); setDrumParam(voice, 3, v); }} />
        </div>
      ))}
    </div>
  );
}
