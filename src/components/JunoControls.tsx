import { setJunoPatch, setJunoParam } from '../audio/engine';
import { Slider } from './Slider';
import { Dropdown } from './Dropdown';
import type { JunoPatch } from '../types';
import type { JunoPreset } from '../presets';

const CHORUS_LABELS: Record<number, string> = { 0: 'Off', 1: 'I', 2: 'II', 3: 'I+II' };

export interface JunoControlsProps {
  patch: JunoPatch;
  bank: '60' | '106';
  presets60: JunoPreset[];
  presets106: JunoPreset[];
  onPatchChange: (patch: JunoPatch) => void;
  onBankChange: (bank: '60' | '106') => void;
}

// Curated subset of Junox's full patch — a Bank/Preset picker plus 11 live
// knobs (Cutoff/Resonance/Attack/Release/LFO Rate/Delay/DCO Depth/VCF Depth/
// Chorus/Noise/HPF), not every raw parameter (real Juno-60/106 hardware has
// ~20 physical controls). Noise + HPF specifically requested — key to airy/
// cloudy textures. LFO here is Junox's real architecture: one LFO routed to
// pitch + filter at independent depths, not a per-parameter LFO pool like
// Rings/Plaits. See AGENTS.md "Juno-60 track".
export function JunoControls({ patch, bank, presets60, presets106, onPatchChange, onBankChange }: JunoControlsProps) {
  const presets = bank === '60' ? presets60 : presets106;

  return (
    <div className="rings-controls">
      <div className="knob-row">
        <label title="Juno-60 and Juno-106 share the same DCO/VCF/chorus circuit — this switches which factory patch list Preset below shows, not the sound engine itself">Bank</label>
        <button className={`lfo-cycle-btn${bank === '60' ? ' on' : ''}`} onClick={() => onBankChange('60')}>60</button>
        <button className={`lfo-cycle-btn${bank === '106' ? ' on' : ''}`} onClick={() => onBankChange('106')}>106</button>
      </div>
      <div className="knob-row">
        <label>Preset</label>
        <Dropdown value="" placeholder="— Load preset —"
          options={presets.map((p, i) => ({ value: String(i), label: p.name }))}
          onChange={v => {
            const p = presets[parseInt(v)];
            if (!p) return;
            onPatchChange(p);
            setJunoPatch(p);
          }}
        />
      </div>

      <div className="section-divider" />
      <div className="panel-name" title="A real subtractive lowpass, same VCO→VCF→VCA structure as the real hardware">Filter</div>
      <div className="knob-row">
        <label title="How bright the filtered sound is — low values darken/mute the tone, high values let everything through">Cutoff</label>
        <Slider value={patch.vcf.frequency} min={0} max={1}
          onChange={v => {
            const next = { ...patch, vcf: { ...patch.vcf, frequency: v } };
            onPatchChange(next);
            setJunoParam('vcf.frequency', v);
          }}
        />
      </div>
      <div className="knob-row">
        <label title="Emphasizes the frequencies right at the cutoff — higher values get peaky/resonant">Resonance</label>
        <Slider value={patch.vcf.resonance} min={0} max={1}
          onChange={v => {
            const next = { ...patch, vcf: { ...patch.vcf, resonance: v } };
            onPatchChange(next);
            setJunoParam('vcf.resonance', v);
          }}
        />
      </div>

      <div className="section-divider" />
      <div className="panel-name">Envelope</div>
      <div className="knob-row">
        <label title="How quickly the note swells in after the gate opens">Attack</label>
        <Slider value={patch.env.attack} min={0} max={1}
          onChange={v => {
            const next = { ...patch, env: { ...patch.env, attack: v } };
            onPatchChange(next);
            setJunoParam('env.attack', v);
          }}
        />
      </div>
      <div className="knob-row">
        <label title="How quickly the note fades out after the gate closes (see the step sequencer's Gate row)">Release</label>
        <Slider value={patch.env.release} min={0} max={1}
          onChange={v => {
            const next = { ...patch, env: { ...patch.env, release: v } };
            onPatchChange(next);
            setJunoParam('env.release', v);
          }}
        />
      </div>

      <div className="section-divider" />
      <div className="panel-name" title="One LFO, routed to pitch (vibrato) and filter cutoff at independent depths — real Juno-60/106 hardware layout, not a per-parameter LFO pool like Rings/Plaits">LFO</div>
      <div className="knob-row">
        <label title="LFO speed">Rate</label>
        <Slider value={patch.lfo.frequency} min={0} max={1}
          onChange={v => {
            const next = { ...patch, lfo: { ...patch.lfo, frequency: v } };
            onPatchChange(next);
            setJunoParam('lfo.frequency', v);
          }}
        />
      </div>
      <div className="knob-row">
        <label title="How long after a note starts before the LFO fades in — 0 means it's already at full depth from the start">Delay</label>
        <Slider value={patch.lfo.delay} min={0} max={1}
          onChange={v => {
            const next = { ...patch, lfo: { ...patch.lfo, delay: v } };
            onPatchChange(next);
            setJunoParam('lfo.delay', v);
          }}
        />
      </div>
      <div className="knob-row">
        <label title="How much the LFO wobbles pitch — classic vibrato">DCO Depth</label>
        <Slider value={patch.dco.lfo} min={0} max={1}
          onChange={v => {
            const next = { ...patch, dco: { ...patch.dco, lfo: v } };
            onPatchChange(next);
            setJunoParam('dco.lfo', v);
          }}
        />
      </div>
      <div className="knob-row">
        <label title="How much the LFO wobbles the filter cutoff — a slow wah/sweep">VCF Depth</label>
        <Slider value={patch.vcf.lfoMod} min={0} max={1}
          onChange={v => {
            const next = { ...patch, vcf: { ...patch.vcf, lfoMod: v } };
            onPatchChange(next);
            setJunoParam('vcf.lfoMod', v);
          }}
        />
      </div>

      <div className="section-divider" />
      <div className="panel-name" title="Key controls for airy, cloudy textures">Texture</div>
      <div className="knob-row">
        <label title="Blends white noise into the oscillator mix — the main source of an airy, breathy character">Noise</label>
        <Slider value={patch.dco.noise} min={0} max={1}
          onChange={v => {
            const next = { ...patch, dco: { ...patch.dco, noise: v } };
            onPatchChange(next);
            setJunoParam('dco.noise', v);
          }}
        />
      </div>
      <div className="knob-row">
        <label title="High-pass filter — thins out the low end, pushing the sound toward a thinner, airier character">HPF</label>
        <Slider value={patch.hpf} min={0} max={1}
          onChange={v => {
            const next = { ...patch, hpf: v };
            onPatchChange(next);
            setJunoParam('hpf', v);
          }}
        />
      </div>
      <div className="knob-row">
        <label title="The iconic Juno BBD chorus — Off, Mode I (subtle), Mode II (deeper), or I+II (both at once, widest)">Chorus</label>
        <button className={`lfo-cycle-btn${patch.chorus > 0 ? ' on' : ''}`}
          onClick={() => {
            const nextChorus = (patch.chorus + 1) % 4;
            const next = { ...patch, chorus: nextChorus };
            onPatchChange(next);
            setJunoParam('chorus', nextChorus);
          }}
        >{CHORUS_LABELS[patch.chorus]}</button>
      </div>
    </div>
  );
}
