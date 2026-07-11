import { setRingsParam, setRingsModel, setLFOEnabled, setLFOWave, setLFORate, setLFODepth,
         setExciterModel, setExciterParam, setExciterGateMs,
         type RingsTrackId, type ExciterModel } from '../audio/engine';
import { Knob } from './Knob';
import { Slider } from './Slider';
import { Dropdown } from './Dropdown';
import { LfoScope } from './LfoScope';
import { lfoIcon, nextLfoState } from './lfoCycle';
import type { LfoState, ExciterState } from '../types';
import type { RingsPreset } from '../presets';

const MODELS = [
  { id: 0, label: 'Modal',   description: 'Struck metal, glass, wood — 60 resonant modes' },
  { id: 1, label: 'Strings', description: 'Sympathetic strings — sitar-like overtones' },
  { id: 2, label: 'String',  description: 'Karplus-Strong — plucked/bowed string' },
  // Secret modes (bonus models from MI firmware)
  { id: 3, label: 'FM',      description: 'FM voice — stiff string + frequency modulation' },
  { id: 4, label: 'Sym.Q',   description: 'Sympathetic strings, pitch-quantized to semitones' },
  { id: 5, label: 'S+Rev',   description: 'String synth with Rings\' built-in plate reverb (Damping controls depth)' },
];

const PARAM_LABELS = ['Structure', 'Brightness', 'Damping', 'Position'];
const PARAM_DESCS  = [
  'Resonator coupling & mode density',
  'Tone of the resonator',
  'Decay time',
  'Excitation position along the string/plate',
];

// LFO index matches param index: 0=Structure, 1=Brightness, 2=Damping, 3=Position
const PARAM_LFO_INDEX = [0, 1, 2, 3];

// Rings' own internal burst (default, unchanged since before this existed) vs
// Elements' Mallet/Plectrum/Particles/Flow/Noise fed into Rings' real IN port
// instead — see engine.ts's setExciterModel / AGENTS.md "Rings exciter".
const EXCITER_MODELS: { id: ExciterModel; label: string; description: string }[] = [
  { id: 'internal',  label: 'Internal',  description: "Rings' own burst/pulse — the only mode this had before" },
  { id: 'mallet',    label: 'Mallet',    description: 'Struck impulse, filtered — closest to Internal, separately tunable' },
  { id: 'plectrum',  label: 'Plectrum',  description: 'Plucked impulse with a delayed pick transient' },
  { id: 'particles', label: 'Particles', description: 'Granular random-amplitude impulse train while gated — sparkly, grainy' },
  { id: 'flow',      label: 'Flow',      description: 'Continuous filtered noise — breath/bow character, the sustained texture Internal can\'t do' },
  { id: 'noise',     label: 'Noise',     description: 'Plain filtered white noise — simplest, most neutral' },
];
// "Parameter"'s meaning per model (Timbre is always filter cutoff, every model) — see exciter_slim.cc.
const EXCITER_PARAMETER_LABEL: Record<ExciterModel, string> = {
  internal: 'Parameter', mallet: 'Decay', plectrum: 'Pick Delay', particles: 'Decay', flow: 'Texture', noise: 'Resonance',
};

export interface RingsControlsProps {
  trackId: RingsTrackId;
  model: number;
  params: [number, number, number, number];
  lfo: LfoState[];
  exciter: ExciterState;
  presets: RingsPreset[];
  onPresetLoad: (p: RingsPreset) => void;
  onModelChange: (m: number) => void;
  onParamChange: (i: number, v: number) => void;
  onLfoChange: (i: number, updates: Partial<LfoState>) => void;
  onExciterChange: (updates: Partial<ExciterState>) => void;
}

export function RingsControls({ trackId, model, params, lfo, exciter, presets, onPresetLoad, onModelChange, onParamChange, onLfoChange, onExciterChange }: RingsControlsProps) {
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
      <div className="knob-row">
        <label>Model</label>
        <Dropdown className="model-select" value={String(model)}
          options={MODELS.map(m => ({ value: String(m.id), label: m.label }))}
          onChange={v => { const m = parseInt(v); onModelChange(m); setRingsModel(trackId, m); }}
        />
      </div>

      {params.map((val, i) => {
        const lfoIdx = PARAM_LFO_INDEX[i];
        const lfoState = lfoIdx >= 0 ? lfo[lfoIdx] : null;
        return (
          <div key={i}>
            <div className="knob-row param-row">
              <label title={PARAM_DESCS[i]}>{PARAM_LABELS[i]}</label>
              <Slider
                value={val} min={0} max={1}
                onChange={v => { onParamChange(i, v); setRingsParam(trackId, i, v); }}
              />
              {lfoState && (
                <div className="lfo-inline">
                  <div className="lfo-cycle-wrap">
                    <button
                      className={`lfo-cycle-btn${lfoState.on ? ' on' : ''}`}
                      onClick={() => {
                        const next = nextLfoState(lfoState);
                        onLfoChange(lfoIdx, next);
                        if ('wave' in next && next.wave) setLFOWave(trackId, lfoIdx, next.wave);
                        if ('on' in next && next.on !== undefined) setLFOEnabled(trackId, lfoIdx, next.on);
                      }}
                    >{lfoIcon(lfoState)}</button>
                    <div className="cap">shape</div>
                  </div>
                  <Knob
                    value={lfoState.rate} min={1 / 30} max={8} label="Rate" size={48} log
                    disabled={!lfoState.on}
                    onChange={v => { onLfoChange(lfoIdx, { rate: v }); setLFORate(trackId, lfoIdx, v); }}
                  />
                  <Knob
                    value={lfoState.depth} min={0} max={0.5} label="Depth" size={48}
                    disabled={!lfoState.on}
                    onChange={v => { onLfoChange(lfoIdx, { depth: v }); setLFODepth(trackId, lfoIdx, v); }}
                  />
                  <div className="lfo-cycle-wrap">
                    <LfoScope lfo={lfoState} maxDepth={0.5} />
                    <div className="cap">wave</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="section-divider" />
      <div className="panel-name">Exciter</div>
      <div className="knob-row">
        <label title="What excites the resonator — Rings' own burst, or Elements' Mallet/Plectrum/Particles/Flow/Noise fed into its real IN port">Model</label>
        <Dropdown value={exciter.model}
          options={EXCITER_MODELS.map(m => ({ value: m.id, label: m.label }))}
          onChange={v => { const m = v as ExciterModel; onExciterChange({ model: m }); setExciterModel(trackId, m); }}
        />
      </div>
      {exciter.model !== 'internal' && (
        <>
          <div className="knob-row">
            <label title="Filter cutoff — shapes every exciter model the same way">Timbre</label>
            <Slider
              value={exciter.timbre} min={0} max={1}
              onChange={v => { onExciterChange({ timbre: v }); setExciterParam(trackId, 'timbre', v); }}
            />
          </div>
          <div className="knob-row">
            <label>{EXCITER_PARAMETER_LABEL[exciter.model]}</label>
            <Slider
              value={exciter.parameter} min={0} max={1}
              onChange={v => { onExciterChange({ parameter: v }); setExciterParam(trackId, 'parameter', v); }}
            />
          </div>
          <div className="knob-row">
            <label title="How long the gate stays open per trigger — Particles/Flow need it held to sustain; Mallet/Plectrum/Noise mostly ignore its length">Gate</label>
            <Slider
              value={exciter.gateMs} min={20} max={800}
              onChange={v => { onExciterChange({ gateMs: v }); setExciterGateMs(trackId, v); }}
            />
          </div>
        </>
      )}
    </div>
  );
}
