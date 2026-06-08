import { useState, useEffect } from 'react';
import * as Engine from './audio/engine';
import { Knob } from './components/Knob';
import { divisionSeconds } from './audio/utils';
import { useSequencer } from './hooks/useSequencer';
import { useSavedSongs } from './hooks/useSavedSongs';
import { PianoRoll } from './components/PianoRoll';
import { SubStepDrawer } from './components/SubStepDrawer';
import { WaveformMeter } from './components/WaveformMeter';
import { RingsControls } from './components/RingsControls';
import { DelayControls } from './components/DelayControls';
import { ReverbControls } from './components/ReverbControls';
import { SaveLoad } from './components/SaveLoad';
import type { LfoState, SavedSong, SongState } from './types';
import './App.css';

function checkSupport(): string | null {
  if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined')
    return 'Web Audio API not supported in this browser.';
  const Ctx = (window.AudioContext ?? (window as any).webkitAudioContext) as typeof AudioContext;
  if (!('audioWorklet' in Ctx.prototype))
    return 'AudioWorklet not supported. Please update Chrome to version 66+ or use a modern browser.';
  if (typeof WebAssembly === 'undefined')
    return 'WebAssembly not supported. Please update your browser.';
  return null;
}

// ── Default synth state ───────────────────────────────────────────────────
const DEFAULT_LFO: LfoState[] = [
  { on: false, wave: 'sine',   rate: 0.5,  depth: 0.15 }, // Structure
  { on: true,  wave: 'random', rate: 1.6,  depth: 0.1  }, // Brightness
  { on: false, wave: 'sine',   rate: 0.5,  depth: 0.15 }, // Damping
  { on: false, wave: 'sine',   rate: 0.5,  depth: 0.15 }, // Position
];

export default function App() {
  const [audioStarted, setAudioStarted] = useState(false);
  const [audioError,   setAudioError]   = useState<string | null>(null);
  const [unsupported,  setUnsupported]  = useState<string | null>(null);
  const [drawerStep,   setDrawerStep]   = useState<number | null>(null);

  useEffect(() => { setUnsupported(checkSupport()); }, []);

  // ── Sequencer state ─────────────────────────────────────────────────────
  const {
    steps, visibleNotes, allNotes, scale, rootNote, scroll, maxScroll,
    bpm, isPlaying, currentStep,
    setStep, loadSteps, setScale, setRootNote,
    scrollUp, scrollDown, setScrollRowDirect,
    start, stop, updateBpm,
  } = useSequencer();

  // ── Rings state (lifted) ────────────────────────────────────────────────
  const [model,  setModel]  = useState(1);
  const [params, setParams] = useState<[number,number,number,number]>([0.11, 0.24, 0.44, 0.25]);
  const [lfo,    setLfo]    = useState<LfoState[]>(DEFAULT_LFO);

  // ── Delay state (lifted) ────────────────────────────────────────────────
  const [delayDivision, setDelayDivision] = useState('1/8');
  const [delayMix,      setDelayMix]      = useState(0.2);
  const [delayFeedback, setDelayFeedback] = useState(0.16);
  const [delayFilter,   setDelayFilter]   = useState(2800);

  // ── Master volume ───────────────────────────────────────────────────────
  const [masterVolume, setMasterVolume] = useState(1.0);

  // ── Reverb state (lifted) ───────────────────────────────────────────────
  const [reverbType,     setReverbType]     = useState('algo');
  const [reverbMix,      setReverbMix]      = useState(0.5);
  const [reverbDecay,    setReverbDecay]    = useState(0.72);
  const [reverbPreDelay, setReverbPreDelay] = useState(0.02);
  const [reverbTone,     setReverbTone]     = useState(6000);

  // ── Save / load ─────────────────────────────────────────────────────────
  const { songs, save, remove } = useSavedSongs();

  function captureState(): SongState {
    return {
      steps, scale, rootNote, scrollRow: scroll, bpm,
      model,
      structure: params[0], brightness: params[1],
      damping: params[2],   position: params[3],
      lfo,
      delayDivision, delayMix, delayFeedback, delayFilter,
      reverbType, reverbMix, reverbDecay, reverbPreDelay, reverbTone,
    };
  }

  function loadSong(song: SavedSong) {
    const s = song.state;

    // Sequencer
    setScale(s.scale);
    setRootNote(s.rootNote);
    loadSteps(s.steps);
    setScrollRowDirect(s.scrollRow);
    updateBpm(s.bpm);

    // Rings state
    setModel(s.model);
    setParams([s.structure, s.brightness, s.damping, s.position]);
    setLfo(s.lfo);

    // Delay state
    setDelayDivision(s.delayDivision);
    setDelayMix(s.delayMix);
    setDelayFeedback(s.delayFeedback);
    setDelayFilter(s.delayFilter);

    // Reverb state
    setReverbType(s.reverbType);
    setReverbMix(s.reverbMix);
    setReverbDecay(s.reverbDecay);
    setReverbPreDelay(s.reverbPreDelay);
    setReverbTone(s.reverbTone);

    // Update engine if audio is already running
    if (Engine.isAudioReady()) {
      Engine.setRingsParam(0, s.structure);
      Engine.setRingsParam(1, s.brightness);
      Engine.setRingsParam(2, s.damping);
      Engine.setRingsParam(3, s.position);
      Engine.setRingsModel(s.model);
      s.lfo.forEach((l, i) => {
        Engine.setLFOWave(i, l.wave);
        Engine.setLFORate(i, l.rate);
        Engine.setLFODepth(i, l.depth);
        Engine.setLFOEnabled(i, l.on);
      });
      Engine.setDelayTime(divisionSeconds(s.delayDivision, s.bpm));
      Engine.setDelayMix(s.delayMix);
      Engine.setDelayFeedback(s.delayFeedback);
      Engine.setDelayFilter(s.delayFilter);
      Engine.setReverbType(s.reverbType);
      Engine.setReverbWet(s.reverbMix);
      Engine.setReverbDecay(s.reverbDecay);
      Engine.setReverbPreDelay(s.reverbPreDelay);
      Engine.setReverbTone(s.reverbTone);
    }
  }

  // ── Audio init ──────────────────────────────────────────────────────────
  async function handlePlayStop() {
    if (unsupported) return;
    setAudioError(null);
    if (!audioStarted) {
      const ctx = new AudioContext();
      try {
        await Engine.initAudio(ctx);
        setAudioStarted(true);
      } catch (err) {
        setAudioError(`Audio failed to start: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    if (isPlaying) stop(); else start();
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <h1>Emma Lee</h1>

      {unsupported && <div className="audio-banner error">⚠ {unsupported}</div>}

      <div className="transport">
        <button
          className={`play-btn${isPlaying ? ' playing' : ''}${unsupported ? ' disabled' : ''}`}
          onClick={handlePlayStop} disabled={!!unsupported}
        >
          {isPlaying ? '■ Stop' : '▶ Play'}
        </button>
        <div className="bpm-row">
          <label>BPM</label>
          <input type="range" min={40} max={200} value={bpm}
            onChange={e => updateBpm(parseInt(e.target.value))} />
          <span className="bpm-val">{bpm}</span>
        </div>
        <SaveLoad
          songs={songs}
          onSave={name => save(name, captureState())}
          onLoad={loadSong}
          onDelete={remove}
        />
      </div>

      {audioError && (
        <div className="audio-banner error">
          ⚠ {audioError}
          <button className="banner-dismiss" onClick={() => setAudioError(null)}>✕</button>
        </div>
      )}

      <PianoRoll
        steps={steps} visibleNotes={visibleNotes} scale={scale}
        rootNote={rootNote} scroll={scroll} maxScroll={maxScroll}
        currentStep={currentStep} drawerStep={drawerStep}
        onSetStep={setStep} onSetScale={setScale} onSetRootNote={setRootNote}
        onScrollUp={scrollUp} onScrollDown={scrollDown}
        onOpenDrawer={col => setDrawerStep(prev => prev === col ? null : col)}
      />
      {drawerStep !== null && steps[drawerStep] !== null && (
        <SubStepDrawer
          stepIndex={drawerStep}
          step={steps[drawerStep]}
          allNotes={allNotes}
          onClose={() => setDrawerStep(null)}
          onUpdate={value => setStep(drawerStep, value)}
        />
      )}

      <div className="waveform-section">
        <div className="master-vol-wrap">
          <Knob
            value={masterVolume} min={0} max={1.5} label="Vol"
            onChange={v => { setMasterVolume(v); Engine.setMasterVolume(v); }}
          />
        </div>
        <WaveformMeter />
      </div>

      <RingsControls
        model={model} params={params} lfo={lfo}
        onModelChange={m  => setModel(m)}
        onParamChange={(i, v) => setParams(prev => { const n = [...prev] as [number,number,number,number]; n[i]=v; return n; })}
        onLfoChange={(i, u) => setLfo(prev => prev.map((l, idx) => idx===i ? {...l,...u} : l))}
      />

      <div className="fx-row">
        <DelayControls
          bpm={bpm}
          division={delayDivision}  mix={delayMix}
          feedback={delayFeedback}  filter={delayFilter}
          onDivisionChange={setDelayDivision}
          onMixChange={setDelayMix}
          onFeedbackChange={setDelayFeedback}
          onFilterChange={setDelayFilter}
        />
        <ReverbControls
          activeType={reverbType}   wet={reverbMix}
          decay={reverbDecay}       preDelay={reverbPreDelay}
          tone={reverbTone}
          onTypeChange={setReverbType}
          onWetChange={setReverbMix}
          onDecayChange={setReverbDecay}
          onPreDelayChange={setReverbPreDelay}
          onToneChange={setReverbTone}
        />
      </div>
    </div>
  );
}
