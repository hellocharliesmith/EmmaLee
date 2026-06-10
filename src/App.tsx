import { useState, useEffect } from 'react';
import * as Engine from './audio/engine';
import { divisionSeconds } from './audio/utils';
import { useSequencer, type ScaleType, type StepValue } from './hooks/useSequencer';
import { useSavedSongs } from './hooks/useSavedSongs';
import { PianoRoll } from './components/PianoRoll';
import { Knob } from './components/Knob';
import { WaveformMeter } from './components/WaveformMeter';
import { RingsControls } from './components/RingsControls';
import { DelayControls } from './components/DelayControls';
import { ReverbControls } from './components/ReverbControls';
import { SaveLoad } from './components/SaveLoad';
import type { LfoState, SavedSong, SongState } from './types';
import './App.css';

const ROOT_NAMES = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const SCALE_OPTIONS: { id: ScaleType; label: string }[] = [
  { id: 'major',         label: 'Major' },
  { id: 'melodic-minor', label: 'Mel. Minor' },
  { id: 'chromatic',     label: 'Chromatic' },
];

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

const DEFAULT_LFO: LfoState[] = [
  { on: false, wave: 'sine',   rate: 0.5,  depth: 0.15 },
  { on: true,  wave: 'random', rate: 1.6,  depth: 0.1  },
  { on: false, wave: 'sine',   rate: 0.5,  depth: 0.15 },
  { on: false, wave: 'sine',   rate: 0.5,  depth: 0.15 },
];

export default function App() {
  const [audioStarted, setAudioStarted] = useState(false);
  const [audioError,   setAudioError]   = useState<string | null>(null);
  const [unsupported,  setUnsupported]  = useState<string | null>(null);

  useEffect(() => { setUnsupported(checkSupport()); }, []);

  const {
    steps, pageSteps, enabledPages, viewPage, playingPage,
    visibleNotes, scale, rootNote, scroll, maxScroll,
    bpm, isPlaying, currentStep,
    toggleNote, toggleStrumDir, setProbability,
    toggleEnablePage, switchViewPage,
    loadAllPages,
    setScale, setRootNote, scrollUp, scrollDown, setScrollRowDirect,
    start, stop, updateBpm,
  } = useSequencer();

  // ── Rings
  const [model,  setModel]  = useState(1);
  const [params, setParams] = useState<[number,number,number,number]>([0.11, 0.24, 0.44, 0.25]);
  const [lfo,    setLfo]    = useState<LfoState[]>(DEFAULT_LFO);

  // ── Delay
  const [delayDivision, setDelayDivision] = useState('1/8');
  const [delayMix,      setDelayMix]      = useState(0.2);
  const [delayFeedback, setDelayFeedback] = useState(0.16);
  const [delayFilter,   setDelayFilter]   = useState(2800);

  // ── Reverb
  const [reverbType,     setReverbType]     = useState('algo');
  const [reverbMix,      setReverbMix]      = useState(0.5);
  const [reverbDecay,    setReverbDecay]    = useState(0.72);
  const [reverbPreDelay, setReverbPreDelay] = useState(0.02);
  const [reverbTone,     setReverbTone]     = useState(6000);

  // ── Master volume
  const [masterVolume, setMasterVolume] = useState(1.0);

  // ── Kids mode
  const [kidsMode, setKidsMode] = useState(false);
  const KIDS_ROWS = 8;

  // ── Save / load
  const { songs, save, remove } = useSavedSongs();

  function captureState(): SongState {
    return {
      steps: pageSteps, scale, rootNote, scrollRow: scroll, bpm,
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
    setScale(s.scale);
    setRootNote(s.rootNote);
    // Support both old (single page) and new (4 page) formats
    const pages = Array.isArray(s.steps[0]) || s.steps.length > 32
      ? s.steps as unknown as StepValue[][]
      : [s.steps as unknown as StepValue[], Array(32).fill(null), Array(32).fill(null), Array(32).fill(null)];
    loadAllPages(pages, s.enabledPages ?? [true, false, false, false]);
    setScrollRowDirect(s.scrollRow);
    updateBpm(s.bpm);
    setModel(s.model);
    setParams([s.structure, s.brightness, s.damping, s.position]);
    setLfo(s.lfo);
    setDelayDivision(s.delayDivision);
    setDelayMix(s.delayMix);
    setDelayFeedback(s.delayFeedback);
    setDelayFilter(s.delayFilter);
    setReverbType(s.reverbType);
    setReverbMix(s.reverbMix);
    setReverbDecay(s.reverbDecay);
    setReverbPreDelay(s.reverbPreDelay);
    setReverbTone(s.reverbTone);
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

  const kidsNotes = kidsMode ? visibleNotes.slice(0, KIDS_ROWS) : visibleNotes;

  // Shared page selector used in both modes
  const PageSelector = () => (
    <div className="page-selector">
      {!kidsMode && <span className="page-label">Pages</span>}
      {[0,1,2,3].map(p => {
        const enabled = enabledPages[p];
        const viewing = viewPage === p;
        const playing = isPlaying && playingPage === p;
        return (
          <div key={p} className="page-item">
            <button
              className={['page-btn', viewing ? 'viewing' : '', enabled ? 'enabled' : '', playing ? 'playing' : ''].filter(Boolean).join(' ')}
              onClick={() => { if (!enabled && p > 0) toggleEnablePage(p); switchViewPage(p); }}
            >
              {p + 1}
              {playing && <span className="page-playing-dot" />}
            </button>
            {p > 0 && enabled && !kidsMode && (
              <button className="page-remove" onClick={() => toggleEnablePage(p)}>×</button>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={`app${kidsMode ? ' kids-mode' : ''}`}>

      {/* ── Header ── */}
      <div className="app-header">
        <h1>Emma Lee</h1>
        <button
          className={`kids-toggle${kidsMode ? ' active' : ''}`}
          onClick={() => setKidsMode(v => !v)}
          title={kidsMode ? 'Exit Kids Mode' : 'Kids Mode'}
        >
          {kidsMode ? '🎮 Exit Kids' : '🎮 Kids'}
        </button>
      </div>

      {unsupported && <div className="audio-banner error">⚠ {unsupported}</div>}

      {/* ── Kids mode layout ── */}
      {kidsMode ? (
        <>
          <div className="kids-top-bar">
            <button
              className={`play-btn kids-play${isPlaying ? ' playing' : ''}`}
              onClick={handlePlayStop} disabled={!!unsupported}
            >
              {isPlaying ? '■ Stop' : '▶ Play'}
            </button>
            <PageSelector />
            <div className="master-vol-wrap">
              <Knob value={masterVolume} min={0} max={1.5} label="Vol"
                onChange={v => { setMasterVolume(v); Engine.setMasterVolume(v); }} />
            </div>
          </div>
          <WaveformMeter />
          <PianoRoll
            steps={steps} visibleNotes={kidsNotes}
            rootNote={rootNote} scroll={scroll} maxScroll={maxScroll}
            currentStep={currentStep} kidsMode
            onToggleNote={toggleNote} onToggleStrumDir={toggleStrumDir}
            onSetProbability={setProbability}
            onScrollUp={scrollUp} onScrollDown={scrollDown}
          />
        </>
      ) : (
        <>
          {/* ── Normal mode layout ── */}
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
            <div className="scale-selects">
              <select className="scale-select" value={rootNote}
                onChange={e => setRootNote(parseInt(e.target.value))}>
                {ROOT_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
              </select>
              <select className="scale-select" value={scale}
                onChange={e => setScale(e.target.value as ScaleType)}>
                {SCALE_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <SaveLoad songs={songs}
              onSave={name => save(name, captureState())}
              onLoad={loadSong} onDelete={remove} />
          </div>

          {audioError && (
            <div className="audio-banner error">
              ⚠ {audioError}
              <button className="banner-dismiss" onClick={() => setAudioError(null)}>✕</button>
            </div>
          )}

          <PageSelector />

          <PianoRoll
            steps={steps} visibleNotes={visibleNotes}
            rootNote={rootNote} scroll={scroll} maxScroll={maxScroll}
            currentStep={currentStep}
            onToggleNote={toggleNote} onToggleStrumDir={toggleStrumDir}
            onSetProbability={setProbability}
            onScrollUp={scrollUp} onScrollDown={scrollDown}
          />

          <div className="waveform-section">
            <div className="master-vol-wrap">
              <Knob value={masterVolume} min={0} max={1.5} label="Vol"
                onChange={v => { setMasterVolume(v); Engine.setMasterVolume(v); }} />
            </div>
            <WaveformMeter />
          </div>

          <RingsControls
            model={model} params={params} lfo={lfo}
            onModelChange={m => setModel(m)}
            onParamChange={(i, v) => setParams(prev => { const n = [...prev] as [number,number,number,number]; n[i]=v; return n; })}
            onLfoChange={(i, u) => setLfo(prev => prev.map((l, idx) => idx===i ? {...l,...u} : l))}
          />

          <div className="fx-row">
            <DelayControls
              bpm={bpm} division={delayDivision} mix={delayMix}
              feedback={delayFeedback} filter={delayFilter}
              onDivisionChange={setDelayDivision} onMixChange={setDelayMix}
              onFeedbackChange={setDelayFeedback} onFilterChange={setDelayFilter}
            />
            <ReverbControls
              activeType={reverbType} wet={reverbMix}
              decay={reverbDecay} preDelay={reverbPreDelay} tone={reverbTone}
              onTypeChange={setReverbType} onWetChange={setReverbMix}
              onDecayChange={setReverbDecay} onPreDelayChange={setReverbPreDelay}
              onToneChange={setReverbTone}
            />
          </div>
        </>
      )}
    </div>
  );
}
