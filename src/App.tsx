import { useState, useEffect } from 'react';
import * as Engine from './audio/engine';
import { RINGS_TRACK_IDS, type RingsTrackId } from './audio/engine';
import { divisionSeconds } from './audio/utils';
import { useSequencer, TRACK_IDS, TRACK_LABELS,
         type ScaleType, type StepValue, type TrackId, type TrackSeqState } from './hooks/useSequencer';
import { useSavedSongs } from './hooks/useSavedSongs';
import { PianoRoll } from './components/PianoRoll';
import { Knob } from './components/Knob';
import { WaveformMeter } from './components/WaveformMeter';
import { RingsControls } from './components/RingsControls';
import { PlaitsControls } from './components/PlaitsControls';
import { DelayControls } from './components/DelayControls';
import { ReverbControls } from './components/ReverbControls';
import { SaveLoad } from './components/SaveLoad';
import type { LfoState, SavedSong, SongState, RingsTrackState, PlaitsTrackState, LegacySongStateV1 } from './types';
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

interface RingsParamsState {
  kind: 'rings';
  model: number;
  params: [number, number, number, number]; // structure, brightness, damping, position
  lfo: LfoState[];
  volume: number;
  delaySend: number;
  reverbSend: number;
}

interface PlaitsParamsState {
  kind: 'plaits';
  engine: number;
  params: [number, number, number, number]; // harmonics, timbre, morph, decay
  volume: number;
  delaySend: number;
  reverbSend: number;
}

type AnyTrackParams = RingsParamsState | PlaitsParamsState;

function defaultRingsParams(): RingsParamsState {
  return { kind: 'rings', model: 1, params: [0.11, 0.24, 0.44, 0.25], lfo: DEFAULT_LFO, volume: 0.85, delaySend: 0.5, reverbSend: 0.5 };
}
function defaultPlaitsParams(): PlaitsParamsState {
  return { kind: 'plaits', engine: 8, params: [0.5, 0.5, 0.5, 0.5], volume: 0.85, delaySend: 0.5, reverbSend: 0.5 };
}
function defaultParamsFor(id: TrackId): AnyTrackParams {
  return id === 'plaits' ? defaultPlaitsParams() : defaultRingsParams();
}

type ViewSection = 'track' | 'master';

export default function App() {
  const [audioStarted, setAudioStarted] = useState(false);
  const [audioError,   setAudioError]   = useState<string | null>(null);
  const [unsupported,  setUnsupported]  = useState<string | null>(null);

  useEffect(() => { setUnsupported(checkSupport()); }, []);

  const {
    tracks, activeTrack, setActiveTrack,
    steps, visibleNotes, scale, rootNote, scroll, maxScroll,
    bpm, isPlaying, currentStep,
    toggleNote, toggleStrumDir, setProbability,
    loadTracks,
    setScale, setRootNote, scrollUp, scrollDown,
    start, stop, updateBpm,
  } = useSequencer();

  const [viewSection, setViewSection] = useState<ViewSection>('track');

  // ── Per-track instrument state ───────────────────────────────────────
  const [trackParams, setTrackParams] = useState<Record<TrackId, AnyTrackParams>>(() => {
    const init = {} as Record<TrackId, AnyTrackParams>;
    for (const id of TRACK_IDS) init[id] = defaultParamsFor(id);
    return init;
  });
  const active = trackParams[activeTrack];

  function updateTrackParamsFor(id: TrackId, fn: (prev: AnyTrackParams) => AnyTrackParams) {
    setTrackParams(prev => ({ ...prev, [id]: fn(prev[id]) }));
  }
  function updateActiveParams(fn: (prev: AnyTrackParams) => AnyTrackParams) {
    updateTrackParamsFor(activeTrack, fn);
  }

  // ── Delay (master) ───────────────────────────────────────────────────
  const [delayDivision, setDelayDivision] = useState('1/8');
  const [delayMix,      setDelayMix]      = useState(0.2);
  const [delayFeedback, setDelayFeedback] = useState(0.16);
  const [delayFilter,   setDelayFilter]   = useState(2800);

  // ── Reverb (master) ──────────────────────────────────────────────────
  const [reverbType,     setReverbType]     = useState('algo');
  const [reverbMix,      setReverbMix]      = useState(0.5);
  const [reverbDecay,    setReverbDecay]    = useState(0.72);
  const [reverbPreDelay, setReverbPreDelay] = useState(0.02);
  const [reverbTone,     setReverbTone]     = useState(6000);

  // ── Master volume ────────────────────────────────────────────────────
  const [masterVolume, setMasterVolume] = useState(1.0);

  // ── Kids mode ─────────────────────────────────────────────────────────
  const [kidsMode, setKidsMode] = useState(false);
  const KIDS_ROWS = 8;
  useEffect(() => { if (kidsMode) setActiveTrack('ringsA'); }, [kidsMode, setActiveTrack]);

  // ── Save / load ───────────────────────────────────────────────────────
  const { songs, save, remove } = useSavedSongs();

  function captureState(): SongState {
    const ringsAP = trackParams.ringsA as RingsParamsState;
    const ringsBP = trackParams.ringsB as RingsParamsState;
    const plaitsP = trackParams.plaits as PlaitsParamsState;

    const ringsA: RingsTrackState = {
      steps: tracks.ringsA.steps, scale: tracks.ringsA.scale, rootNote: tracks.ringsA.rootNote, scrollRow: tracks.ringsA.scrollRow,
      model: ringsAP.model, structure: ringsAP.params[0], brightness: ringsAP.params[1],
      damping: ringsAP.params[2], position: ringsAP.params[3], lfo: ringsAP.lfo,
      volume: ringsAP.volume, delaySend: ringsAP.delaySend, reverbSend: ringsAP.reverbSend,
    };
    const ringsB: RingsTrackState = {
      steps: tracks.ringsB.steps, scale: tracks.ringsB.scale, rootNote: tracks.ringsB.rootNote, scrollRow: tracks.ringsB.scrollRow,
      model: ringsBP.model, structure: ringsBP.params[0], brightness: ringsBP.params[1],
      damping: ringsBP.params[2], position: ringsBP.params[3], lfo: ringsBP.lfo,
      volume: ringsBP.volume, delaySend: ringsBP.delaySend, reverbSend: ringsBP.reverbSend,
    };
    const plaits: PlaitsTrackState = {
      steps: tracks.plaits.steps, scale: tracks.plaits.scale, rootNote: tracks.plaits.rootNote, scrollRow: tracks.plaits.scrollRow,
      engine: plaitsP.engine, harmonics: plaitsP.params[0], timbre: plaitsP.params[1],
      morph: plaitsP.params[2], decay: plaitsP.params[3],
      volume: plaitsP.volume, delaySend: plaitsP.delaySend, reverbSend: plaitsP.reverbSend,
    };

    return {
      version: 2, bpm, tracks: { ringsA, ringsB, plaits },
      delayDivision, delayMix, delayFeedback, delayFilter,
      reverbType, reverbMix, reverbDecay, reverbPreDelay, reverbTone,
    };
  }

  function migrateLegacy(old: LegacySongStateV1): SongState {
    const oldSteps: StepValue[] = Array.isArray(old.steps[0]) || (old.steps as StepValue[]).length > 32
      ? (old.steps as unknown as StepValue[][])[0]
      : (old.steps as StepValue[]);
    const ringsA: RingsTrackState = {
      steps: oldSteps, scale: old.scale, rootNote: old.rootNote, scrollRow: old.scrollRow,
      model: old.model, structure: old.structure, brightness: old.brightness,
      damping: old.damping, position: old.position, lfo: old.lfo,
      volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    const ringsB: RingsTrackState = {
      steps: Array(32).fill(null), scale: 'major', rootNote: 0, scrollRow: 7,
      model: 1, structure: 0.11, brightness: 0.24, damping: 0.44, position: 0.25,
      lfo: DEFAULT_LFO, volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    const plaits: PlaitsTrackState = {
      steps: Array(32).fill(null), scale: 'major', rootNote: 0, scrollRow: 7,
      engine: 8, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.5,
      volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    return {
      version: 2, bpm: old.bpm, tracks: { ringsA, ringsB, plaits },
      delayDivision: old.delayDivision, delayMix: old.delayMix,
      delayFeedback: old.delayFeedback, delayFilter: old.delayFilter,
      reverbType: old.reverbType === 'rings' ? 'algo' : old.reverbType,
      reverbMix: old.reverbMix, reverbDecay: old.reverbDecay,
      reverbPreDelay: old.reverbPreDelay, reverbTone: old.reverbTone,
    };
  }

  function loadSong(song: SavedSong) {
    const raw = song.state;
    const state: SongState = ('version' in raw && raw.version === 2)
      ? raw as SongState
      : migrateLegacy(raw as LegacySongStateV1);

    const nextTracks: Record<TrackId, TrackSeqState> = {
      ringsA: { steps: state.tracks.ringsA.steps, scale: state.tracks.ringsA.scale, rootNote: state.tracks.ringsA.rootNote, scrollRow: state.tracks.ringsA.scrollRow },
      ringsB: { steps: state.tracks.ringsB.steps, scale: state.tracks.ringsB.scale, rootNote: state.tracks.ringsB.rootNote, scrollRow: state.tracks.ringsB.scrollRow },
      plaits: { steps: state.tracks.plaits.steps, scale: state.tracks.plaits.scale, rootNote: state.tracks.plaits.rootNote, scrollRow: state.tracks.plaits.scrollRow },
    };
    const nextParams: Record<TrackId, AnyTrackParams> = {
      ringsA: {
        kind: 'rings', model: state.tracks.ringsA.model,
        params: [state.tracks.ringsA.structure, state.tracks.ringsA.brightness, state.tracks.ringsA.damping, state.tracks.ringsA.position],
        lfo: state.tracks.ringsA.lfo, volume: state.tracks.ringsA.volume,
        delaySend: state.tracks.ringsA.delaySend, reverbSend: state.tracks.ringsA.reverbSend,
      },
      ringsB: {
        kind: 'rings', model: state.tracks.ringsB.model,
        params: [state.tracks.ringsB.structure, state.tracks.ringsB.brightness, state.tracks.ringsB.damping, state.tracks.ringsB.position],
        lfo: state.tracks.ringsB.lfo, volume: state.tracks.ringsB.volume,
        delaySend: state.tracks.ringsB.delaySend, reverbSend: state.tracks.ringsB.reverbSend,
      },
      plaits: {
        kind: 'plaits', engine: state.tracks.plaits.engine,
        params: [state.tracks.plaits.harmonics, state.tracks.plaits.timbre, state.tracks.plaits.morph, state.tracks.plaits.decay],
        volume: state.tracks.plaits.volume, delaySend: state.tracks.plaits.delaySend, reverbSend: state.tracks.plaits.reverbSend,
      },
    };

    loadTracks(nextTracks);
    setTrackParams(nextParams);

    updateBpm(state.bpm);
    setDelayDivision(state.delayDivision);
    setDelayMix(state.delayMix);
    setDelayFeedback(state.delayFeedback);
    setDelayFilter(state.delayFilter);
    setReverbType(state.reverbType);
    setReverbMix(state.reverbMix);
    setReverbDecay(state.reverbDecay);
    setReverbPreDelay(state.reverbPreDelay);
    setReverbTone(state.reverbTone);

    if (Engine.isAudioReady()) {
      for (const id of RINGS_TRACK_IDS) {
        const p = nextParams[id] as RingsParamsState;
        Engine.setRingsParam(id, 0, p.params[0]);
        Engine.setRingsParam(id, 1, p.params[1]);
        Engine.setRingsParam(id, 2, p.params[2]);
        Engine.setRingsParam(id, 3, p.params[3]);
        Engine.setRingsModel(id, p.model);
        p.lfo.forEach((l, i) => {
          Engine.setLFOWave(id, i, l.wave);
          Engine.setLFORate(id, i, l.rate);
          Engine.setLFODepth(id, i, l.depth);
          Engine.setLFOEnabled(id, i, l.on);
        });
        Engine.setTrackVolume(id, p.volume);
        Engine.setTrackSend(id, 'delay', p.delaySend);
        Engine.setTrackSend(id, 'reverb', p.reverbSend);
      }
      const pp = nextParams.plaits as PlaitsParamsState;
      Engine.setPlaitsParam(0, pp.params[0]);
      Engine.setPlaitsParam(1, pp.params[1]);
      Engine.setPlaitsParam(2, pp.params[2]);
      Engine.setPlaitsParam(3, pp.params[3]);
      Engine.setPlaitsModel(pp.engine);
      Engine.setTrackVolume('plaits', pp.volume);
      Engine.setTrackSend('plaits', 'delay', pp.delaySend);
      Engine.setTrackSend('plaits', 'reverb', pp.reverbSend);

      Engine.setDelayTime(divisionSeconds(state.delayDivision, state.bpm));
      Engine.setDelayMix(state.delayMix);
      Engine.setDelayFeedback(state.delayFeedback);
      Engine.setDelayFilter(state.delayFilter);
      void Engine.setReverbType(state.reverbType);
      Engine.setReverbWet(state.reverbMix);
      Engine.setReverbDecay(state.reverbDecay);
      Engine.setReverbPreDelay(state.reverbPreDelay);
      Engine.setReverbTone(state.reverbTone);
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

      {/* ── Kids mode layout (always Rings A, no track/master tabs) ── */}
      {kidsMode ? (
        <>
          <div className="kids-top-bar">
            <button
              className={`play-btn kids-play${isPlaying ? ' playing' : ''}`}
              onClick={handlePlayStop} disabled={!!unsupported}
            >
              {isPlaying ? '■ Stop' : '▶ Play'}
            </button>
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
            {viewSection === 'track' && (
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
            )}
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

          <div className="page-selector">
            {TRACK_IDS.map(id => (
              <button key={id}
                className={['page-btn', 'track-tab', (viewSection === 'track' && activeTrack === id) ? 'viewing' : ''].filter(Boolean).join(' ')}
                onClick={() => { setActiveTrack(id); setViewSection('track'); }}
              >{TRACK_LABELS[id]}</button>
            ))}
            <button
              className={['page-btn', 'track-tab', viewSection === 'master' ? 'viewing' : ''].filter(Boolean).join(' ')}
              onClick={() => setViewSection('master')}
            >Master</button>
          </div>

          {viewSection === 'track' ? (
            <>
              <PianoRoll
                steps={steps} visibleNotes={visibleNotes}
                rootNote={rootNote} scroll={scroll} maxScroll={maxScroll}
                currentStep={currentStep}
                onToggleNote={toggleNote} onToggleStrumDir={toggleStrumDir}
                onSetProbability={setProbability}
                onScrollUp={scrollUp} onScrollDown={scrollDown}
              />

              {active.kind === 'rings' ? (
                <RingsControls
                  trackId={activeTrack as RingsTrackId}
                  model={active.model} params={active.params} lfo={active.lfo}
                  onModelChange={m => updateActiveParams(p => p.kind === 'rings' ? ({ ...p, model: m }) : p)}
                  onParamChange={(i, v) => updateActiveParams(p => {
                    if (p.kind !== 'rings') return p;
                    const n = [...p.params] as [number,number,number,number]; n[i] = v;
                    return { ...p, params: n };
                  })}
                  onLfoChange={(i, u) => updateActiveParams(p => p.kind === 'rings'
                    ? ({ ...p, lfo: p.lfo.map((l, idx) => idx === i ? { ...l, ...u } : l) }) : p)}
                />
              ) : (
                <PlaitsControls
                  engine={active.engine} params={active.params}
                  onEngineChange={eg => updateActiveParams(p => p.kind === 'plaits' ? ({ ...p, engine: eg }) : p)}
                  onParamChange={(i, v) => updateActiveParams(p => {
                    if (p.kind !== 'plaits') return p;
                    const n = [...p.params] as [number,number,number,number]; n[i] = v;
                    return { ...p, params: n };
                  })}
                />
              )}

              <div className="send-row">
                <div className="knob-row">
                  <label>Sends</label>
                  <Knob value={active.volume} min={0} max={1.5} label="Volume"
                    onChange={v => { updateActiveParams(p => ({ ...p, volume: v })); Engine.setTrackVolume(activeTrack, v); }} />
                  <Knob value={active.delaySend} min={0} max={1} label="Delay"
                    onChange={v => { updateActiveParams(p => ({ ...p, delaySend: v })); Engine.setTrackSend(activeTrack, 'delay', v); }} />
                  <Knob value={active.reverbSend} min={0} max={1} label="Reverb"
                    onChange={v => { updateActiveParams(p => ({ ...p, reverbSend: v })); Engine.setTrackSend(activeTrack, 'reverb', v); }} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="waveform-section">
                <div className="master-vol-wrap">
                  <Knob value={masterVolume} min={0} max={1.5} label="Vol"
                    onChange={v => { setMasterVolume(v); Engine.setMasterVolume(v); }} />
                </div>
                <WaveformMeter />
              </div>

              <div className="mixer-row">
                <div className="knob-row">
                  <label>Mixer</label>
                  {TRACK_IDS.map(id => (
                    <Knob key={id} value={trackParams[id].volume} min={0} max={1.5} label={TRACK_LABELS[id]}
                      onChange={v => { updateTrackParamsFor(id, p => ({ ...p, volume: v })); Engine.setTrackVolume(id, v); }} />
                  ))}
                </div>
              </div>

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
        </>
      )}
    </div>
  );
}
