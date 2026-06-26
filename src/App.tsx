import { useState, useEffect } from 'react';
import * as Tone from 'tone';
import * as Engine from './audio/engine';
import { RINGS_TRACK_IDS, DRUM_VOICE_IDS, type RingsTrackId, type DrumVoiceId } from './audio/engine';
import { divisionSeconds } from './audio/utils';
import { useSequencer, TRACK_IDS, TRACK_LABELS, DRUM_ROW_LABELS, PAGE_COUNT,
         type ScaleType, type StepValue, type TrackId, type TrackSeqState } from './hooks/useSequencer';
import { useSavedSongs } from './hooks/useSavedSongs';
import { PianoRoll } from './components/PianoRoll';
import { Knob } from './components/Knob';
import { WaveformMeter } from './components/WaveformMeter';
import { RingsControls } from './components/RingsControls';
import { PlaitsControls } from './components/PlaitsControls';
import { DrumControls, type DrumVoiceParams } from './components/DrumControls';
import { DelayControls } from './components/DelayControls';
import { ReverbControls } from './components/ReverbControls';
import { SaveLoad } from './components/SaveLoad';
import type { LfoState, SavedSong, SongState, RingsTrackState, PlaitsTrackState, DrumTrackState, LegacySongStateV1, LegacySongStateV2 } from './types';
import './App.css';

const ROOT_NAMES = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const SCALE_OPTIONS: { id: ScaleType; label: string }[] = [
  { id: 'major',         label: 'Major' },
  { id: 'melodic-minor', label: 'Mel. Minor' },
  { id: 'chromatic',     label: 'Chromatic' },
];

const TRACK_FADER_COLORS: Record<TrackId, [string, string]> = {
  ringsA: ['var(--rose-400)',   'var(--rose-500)'],
  ringsB: ['var(--teal-400)',   'var(--teal-500)'],
  plaits: ['var(--sage-400)',   'var(--sage-500)'],
  drums:  ['var(--slate-400)',  'var(--slate-500)'],
};

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
  params: [number, number, number, number, number]; // harmonics, timbre, morph, decay, lpgColour
  volume: number;
  delaySend: number;
  reverbSend: number;
}

interface DrumParamsState {
  kind: 'drums';
  voices: Record<DrumVoiceId, DrumVoiceParams>;
  volume: number;
  delaySend: number;
  reverbSend: number;
}

type AnyTrackParams = RingsParamsState | PlaitsParamsState | DrumParamsState;

function defaultRingsParams(): RingsParamsState {
  return { kind: 'rings', model: 1, params: [0.11, 0.24, 0.44, 0.25], lfo: DEFAULT_LFO, volume: 0.85, delaySend: 0.5, reverbSend: 0.5 };
}
function defaultPlaitsParams(): PlaitsParamsState {
  return { kind: 'plaits', engine: 8, params: [0.5, 0.5, 0.5, 0.5, 0.5], volume: 0.85, delaySend: 0.5, reverbSend: 0.5 };
}
// Decay defaults match engine.ts's DRUM_VOICE_CONFIG so the knobs reflect what's
// actually set on the worklet at creation time.
function defaultDrumVoices(): Record<DrumVoiceId, DrumVoiceParams> {
  return {
    drumHihat: { tone: 0.5, decay: 0.25 },
    drumSnare: { tone: 0.5, decay: 0.45 },
    drumKick:  { tone: 0.5, decay: 0.5 },
  };
}
function defaultDrumParams(): DrumParamsState {
  return { kind: 'drums', voices: defaultDrumVoices(), volume: 0.85, delaySend: 0.5, reverbSend: 0.5 };
}
function defaultParamsFor(id: TrackId): AnyTrackParams {
  if (id === 'plaits') return defaultPlaitsParams();
  if (id === 'drums') return defaultDrumParams();
  return defaultRingsParams();
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
    currentPage, enabledPages, currentPagePlaying,
    toggleNote, toggleStrumDir, setProbability, setVelocity,
    loadTracks,
    setScale, setRootNote, scrollUp, scrollDown,
    switchToPage, togglePageEnabled,
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

  // Drums is one UI tab but 3 separate engine.ts tracks — volume/sends broadcast to all 3.
  function setVolumeFor(id: TrackId, v: number) {
    updateTrackParamsFor(id, p => ({ ...p, volume: v }));
    if (id === 'drums') DRUM_VOICE_IDS.forEach(vid => Engine.setTrackVolume(vid, v));
    else Engine.setTrackVolume(id, v);
  }
  function setSendFor(id: TrackId, kind: 'delay' | 'reverb', v: number) {
    updateTrackParamsFor(id, p => kind === 'delay' ? ({ ...p, delaySend: v }) : ({ ...p, reverbSend: v }));
    if (id === 'drums') DRUM_VOICE_IDS.forEach(vid => Engine.setTrackSend(vid, kind, v));
    else Engine.setTrackSend(id, kind, v);
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
    const drumsP  = trackParams.drums as DrumParamsState;

    const ringsA: RingsTrackState = {
      pages: tracks.ringsA.pages, enabledPages: tracks.ringsA.enabledPages,
      scale: tracks.ringsA.scale, rootNote: tracks.ringsA.rootNote, scrollRow: tracks.ringsA.scrollRow,
      model: ringsAP.model, structure: ringsAP.params[0], brightness: ringsAP.params[1],
      damping: ringsAP.params[2], position: ringsAP.params[3], lfo: ringsAP.lfo,
      volume: ringsAP.volume, delaySend: ringsAP.delaySend, reverbSend: ringsAP.reverbSend,
    };
    const ringsB: RingsTrackState = {
      pages: tracks.ringsB.pages, enabledPages: tracks.ringsB.enabledPages,
      scale: tracks.ringsB.scale, rootNote: tracks.ringsB.rootNote, scrollRow: tracks.ringsB.scrollRow,
      model: ringsBP.model, structure: ringsBP.params[0], brightness: ringsBP.params[1],
      damping: ringsBP.params[2], position: ringsBP.params[3], lfo: ringsBP.lfo,
      volume: ringsBP.volume, delaySend: ringsBP.delaySend, reverbSend: ringsBP.reverbSend,
    };
    const plaits: PlaitsTrackState = {
      pages: tracks.plaits.pages, enabledPages: tracks.plaits.enabledPages,
      scale: tracks.plaits.scale, rootNote: tracks.plaits.rootNote, scrollRow: tracks.plaits.scrollRow,
      engine: plaitsP.engine, harmonics: plaitsP.params[0], timbre: plaitsP.params[1],
      morph: plaitsP.params[2], decay: plaitsP.params[3], lpgColour: plaitsP.params[4],
      volume: plaitsP.volume, delaySend: plaitsP.delaySend, reverbSend: plaitsP.reverbSend,
    };
    const drums: DrumTrackState = {
      pages: tracks.drums.pages, enabledPages: tracks.drums.enabledPages,
      scale: tracks.drums.scale, rootNote: tracks.drums.rootNote, scrollRow: tracks.drums.scrollRow,
      voices: drumsP.voices, volume: drumsP.volume, delaySend: drumsP.delaySend, reverbSend: drumsP.reverbSend,
    };

    return {
      version: 3, bpm, tracks: { ringsA, ringsB, plaits, drums },
      delayDivision, delayMix, delayFeedback, delayFilter,
      reverbType, reverbMix, reverbDecay, reverbPreDelay, reverbTone,
    };
  }

  function stepsToPages(steps: StepValue[]): { pages: StepValue[][], enabledPages: boolean[] } {
    const pages = [steps, ...Array.from({ length: PAGE_COUNT - 1 }, () => Array(32).fill(null) as StepValue[])];
    return { pages, enabledPages: [true, false, false, false] };
  }

  function migrateLegacy(old: LegacySongStateV1): SongState {
    const oldSteps: StepValue[] = Array.isArray(old.steps[0]) || (old.steps as StepValue[]).length > 32
      ? (old.steps as unknown as StepValue[][])[0]
      : (old.steps as StepValue[]);
    const ringsA: RingsTrackState = {
      ...stepsToPages(oldSteps), scale: old.scale, rootNote: old.rootNote, scrollRow: old.scrollRow,
      model: old.model, structure: old.structure, brightness: old.brightness,
      damping: old.damping, position: old.position, lfo: old.lfo,
      volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    const ringsB: RingsTrackState = {
      ...stepsToPages(Array(32).fill(null)), scale: 'major', rootNote: 0, scrollRow: 7,
      model: 1, structure: 0.11, brightness: 0.24, damping: 0.44, position: 0.25,
      lfo: DEFAULT_LFO, volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    const plaits: PlaitsTrackState = {
      ...stepsToPages(Array(32).fill(null)), scale: 'major', rootNote: 0, scrollRow: 7,
      engine: 8, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.5, lpgColour: 0.5,
      volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    const drums: DrumTrackState = {
      ...stepsToPages(Array(32).fill(null)), scale: 'major', rootNote: 0, scrollRow: 7,
      voices: defaultDrumVoices(), volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    return {
      version: 3, bpm: old.bpm, tracks: { ringsA, ringsB, plaits, drums },
      delayDivision: old.delayDivision, delayMix: old.delayMix,
      delayFeedback: old.delayFeedback, delayFilter: old.delayFilter,
      reverbType: old.reverbType === 'rings' ? 'algo' : old.reverbType,
      reverbMix: old.reverbMix, reverbDecay: old.reverbDecay,
      reverbPreDelay: old.reverbPreDelay, reverbTone: old.reverbTone,
    };
  }

  function migrateV2toV3(v2: LegacySongStateV2): SongState {
    const emptyDrumsV3: DrumTrackState = {
      ...stepsToPages(Array(32).fill(null)), scale: 'major', rootNote: 0, scrollRow: 7,
      voices: defaultDrumVoices(), volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    const drumsV2 = v2.tracks.drums;
    const drumsV3: DrumTrackState = drumsV2 ? {
      ...stepsToPages(drumsV2.steps), scale: drumsV2.scale, rootNote: drumsV2.rootNote, scrollRow: drumsV2.scrollRow,
      voices: (drumsV2.voices as DrumTrackState['voices']) ?? defaultDrumVoices(),
      volume: drumsV2.volume, delaySend: drumsV2.delaySend, reverbSend: drumsV2.reverbSend,
    } : emptyDrumsV3;

    return {
      version: 3, bpm: v2.bpm,
      tracks: {
        ringsA: { ...stepsToPages(v2.tracks.ringsA.steps), scale: v2.tracks.ringsA.scale, rootNote: v2.tracks.ringsA.rootNote, scrollRow: v2.tracks.ringsA.scrollRow, model: v2.tracks.ringsA.model, structure: v2.tracks.ringsA.structure, brightness: v2.tracks.ringsA.brightness, damping: v2.tracks.ringsA.damping, position: v2.tracks.ringsA.position, lfo: v2.tracks.ringsA.lfo, volume: v2.tracks.ringsA.volume, delaySend: v2.tracks.ringsA.delaySend, reverbSend: v2.tracks.ringsA.reverbSend },
        ringsB: { ...stepsToPages(v2.tracks.ringsB.steps), scale: v2.tracks.ringsB.scale, rootNote: v2.tracks.ringsB.rootNote, scrollRow: v2.tracks.ringsB.scrollRow, model: v2.tracks.ringsB.model, structure: v2.tracks.ringsB.structure, brightness: v2.tracks.ringsB.brightness, damping: v2.tracks.ringsB.damping, position: v2.tracks.ringsB.position, lfo: v2.tracks.ringsB.lfo, volume: v2.tracks.ringsB.volume, delaySend: v2.tracks.ringsB.delaySend, reverbSend: v2.tracks.ringsB.reverbSend },
        plaits: { ...stepsToPages(v2.tracks.plaits.steps), scale: v2.tracks.plaits.scale, rootNote: v2.tracks.plaits.rootNote, scrollRow: v2.tracks.plaits.scrollRow, engine: v2.tracks.plaits.engine, harmonics: v2.tracks.plaits.harmonics, timbre: v2.tracks.plaits.timbre, morph: v2.tracks.plaits.morph, decay: v2.tracks.plaits.decay, lpgColour: v2.tracks.plaits.lpgColour ?? 0.5, volume: v2.tracks.plaits.volume, delaySend: v2.tracks.plaits.delaySend, reverbSend: v2.tracks.plaits.reverbSend },
        drums: drumsV3,
      },
      delayDivision: v2.delayDivision, delayMix: v2.delayMix, delayFeedback: v2.delayFeedback, delayFilter: v2.delayFilter,
      reverbType: v2.reverbType, reverbMix: v2.reverbMix, reverbDecay: v2.reverbDecay, reverbPreDelay: v2.reverbPreDelay, reverbTone: v2.reverbTone,
    };
  }

  function loadSong(song: SavedSong) {
    const raw = song.state;
    let state: SongState;
    if ('version' in raw && raw.version === 3) {
      state = raw as SongState;
    } else if ('version' in raw && raw.version === 2) {
      state = migrateV2toV3(raw as LegacySongStateV2);
    } else {
      state = migrateLegacy(raw as LegacySongStateV1);
    }

    // Saves missing the drums track entirely get a fresh default.
    const drumsState: DrumTrackState = state.tracks.drums ?? {
      ...stepsToPages(Array(32).fill(null)), scale: 'major', rootNote: 0, scrollRow: 7,
      voices: defaultDrumVoices(), volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    const drumVoices = drumsState.voices ?? defaultDrumVoices();

    const nextTracks: Record<TrackId, TrackSeqState> = {
      ringsA: { pages: state.tracks.ringsA.pages, enabledPages: state.tracks.ringsA.enabledPages, currentPage: 0, scale: state.tracks.ringsA.scale, rootNote: state.tracks.ringsA.rootNote, scrollRow: state.tracks.ringsA.scrollRow },
      ringsB: { pages: state.tracks.ringsB.pages, enabledPages: state.tracks.ringsB.enabledPages, currentPage: 0, scale: state.tracks.ringsB.scale, rootNote: state.tracks.ringsB.rootNote, scrollRow: state.tracks.ringsB.scrollRow },
      plaits: { pages: state.tracks.plaits.pages, enabledPages: state.tracks.plaits.enabledPages, currentPage: 0, scale: state.tracks.plaits.scale, rootNote: state.tracks.plaits.rootNote, scrollRow: state.tracks.plaits.scrollRow },
      drums:  { pages: drumsState.pages, enabledPages: drumsState.enabledPages, currentPage: 0, scale: drumsState.scale, rootNote: drumsState.rootNote, scrollRow: drumsState.scrollRow },
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
        params: [state.tracks.plaits.harmonics, state.tracks.plaits.timbre, state.tracks.plaits.morph, state.tracks.plaits.decay, state.tracks.plaits.lpgColour ?? 0.5],
        volume: state.tracks.plaits.volume, delaySend: state.tracks.plaits.delaySend, reverbSend: state.tracks.plaits.reverbSend,
      },
      drums: { kind: 'drums', voices: drumVoices, volume: drumsState.volume, delaySend: drumsState.delaySend, reverbSend: drumsState.reverbSend },
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
      syncParamsToEngine(nextParams, state.delayDivision, state.bpm,
        state.delayMix, state.delayFeedback, state.delayFilter,
        state.reverbType, state.reverbMix, state.reverbDecay, state.reverbPreDelay, state.reverbTone);
    }
  }

  function syncParamsToEngine(
    params: Record<TrackId, AnyTrackParams>,
    delDiv: string, bpmVal: number,
    dMix: number, dFb: number, dFilt: number,
    rType: string, rMix: number, rDecay: number, rPre: number, rTone: number,
  ) {
    for (const id of RINGS_TRACK_IDS) {
      const p = params[id] as RingsParamsState;
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
    const pp = params.plaits as PlaitsParamsState;
    Engine.setPlaitsParam(0, pp.params[0]);
    Engine.setPlaitsParam(1, pp.params[1]);
    Engine.setPlaitsParam(2, pp.params[2]);
    Engine.setPlaitsParam(3, pp.params[3]);
    Engine.setPlaitsParam(4, pp.params[4]);
    Engine.setPlaitsModel(pp.engine);
    Engine.setTrackVolume('plaits', pp.volume);
    Engine.setTrackSend('plaits', 'delay', pp.delaySend);
    Engine.setTrackSend('plaits', 'reverb', pp.reverbSend);

    const dp = params.drums as DrumParamsState;
    DRUM_VOICE_IDS.forEach(vid => {
      Engine.setTrackVolume(vid, dp.volume);
      Engine.setTrackSend(vid, 'delay', dp.delaySend);
      Engine.setTrackSend(vid, 'reverb', dp.reverbSend);
      Engine.setDrumParam(vid, 1, dp.voices[vid].tone);
      Engine.setDrumParam(vid, 2, dp.voices[vid].decay);
    });

    Engine.setDelayTime(divisionSeconds(delDiv, bpmVal));
    Engine.setDelayMix(dMix);
    Engine.setDelayFeedback(dFb);
    Engine.setDelayFilter(dFilt);
    void Engine.setReverbType(rType);
    Engine.setReverbWet(rMix);
    Engine.setReverbDecay(rDecay);
    Engine.setReverbPreDelay(rPre);
    Engine.setReverbTone(rTone);
  }

  async function handlePlayStop() {
    if (unsupported) return;
    setAudioError(null);
    if (!audioStarted) {
      const ctx = new AudioContext();
      // Give Tone our AudioContext synchronously (before any await) so that
      // Tone.start() resumes OUR context inside the user-gesture stack frame.
      // This prevents Chrome from creating a second suspended context and
      // ensures the Transport's ConstantSourceNode starts on a running context.
      Tone.setContext(new Tone.Context(ctx));
      await Tone.start();
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

  // Per-track accent color (CSS vars set in App.css) — Kids Mode is always pinned
  // to ringsA so it just gets the default Rose, no class needed. Master isn't a
  // track, so it gets a neutral highlight instead of any track's hue.
  const trackColorClass = kidsMode ? '' : viewSection === 'master' ? ' track-master'
    : activeTrack === 'ringsB' ? ' track-rings-b'
    : activeTrack === 'plaits' ? ' track-plaits'
    : activeTrack === 'drums'  ? ' track-drums'
    : '';

  return (
    <div className={`app${kidsMode ? ' kids-mode' : ''}${trackColorClass}`}>

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
            {viewSection === 'track' && activeTrack !== 'drums' && (
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

          {viewSection === 'track' && (
            <div className="page-buttons">
              {Array.from({ length: PAGE_COUNT }, (_, i) => {
                const isPageViewing = currentPage === i;
                const isPageEnabled = enabledPages[i];
                const isPagePlaying = isPlaying && currentPagePlaying[activeTrack] === i;
                const cls = ['page-btn',
                  isPageViewing  ? 'viewing' : '',
                  isPageEnabled  ? 'enabled' : '',
                  isPagePlaying  ? 'playing' : '',
                ].filter(Boolean).join(' ');
                return (
                  <button key={i} className={cls}
                    onClick={() => isPageViewing ? togglePageEnabled(i) : switchToPage(i)}
                    title={isPageViewing ? (isPageEnabled ? 'Click to remove from loop' : 'Click to add to loop') : `Switch to page ${i + 1} (enables it)`}
                  >{i + 1}</button>
                );
              })}
            </div>
          )}

          {viewSection === 'track' ? (
            <>
              <PianoRoll
                steps={steps} visibleNotes={visibleNotes}
                rootNote={rootNote} scroll={scroll} maxScroll={maxScroll}
                currentStep={isPlaying && currentPagePlaying[activeTrack] === currentPage ? currentStep : -1}
                rowLabels={activeTrack === 'drums' ? DRUM_ROW_LABELS : undefined}
                noStrum={activeTrack === 'drums'}
                showVelocity={activeTrack === 'drums'}
                onToggleNote={toggleNote} onToggleStrumDir={toggleStrumDir}
                onSetProbability={setProbability}
                onSetVelocity={setVelocity}
                onScrollUp={scrollUp} onScrollDown={scrollDown}
              />

              <div className="track-controls-row">
                <div>
                  {active.kind === 'rings' && (
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
                  )}
                  {active.kind === 'plaits' && (
                    <PlaitsControls
                      engine={active.engine} params={active.params}
                      onEngineChange={eg => updateActiveParams(p => p.kind === 'plaits' ? ({ ...p, engine: eg }) : p)}
                      onParamChange={(i, v) => updateActiveParams(p => {
                        if (p.kind !== 'plaits') return p;
                        const n = [...p.params] as [number,number,number,number,number]; n[i] = v;
                        return { ...p, params: n };
                      })}
                    />
                  )}
                  {active.kind === 'drums' && (
                    <DrumControls
                      voices={active.voices}
                      onVoiceChange={(voice, field, value) => updateActiveParams(p => p.kind === 'drums'
                        ? ({ ...p, voices: { ...p.voices, [voice]: { ...p.voices[voice], [field]: value } } })
                        : p)}
                    />
                  )}
                </div>
                <div className="send-row">
                  <div className="knob-row">
                    <label>Sends</label>
                    <Knob value={active.volume} min={0} max={1.5} label="Volume"
                      onChange={v => setVolumeFor(activeTrack, v)} />
                    <Knob value={active.delaySend} min={0} max={1} label="Delay"
                      onChange={v => setSendFor(activeTrack, 'delay', v)} />
                    <Knob value={active.reverbSend} min={0} max={1} label="Reverb"
                      onChange={v => setSendFor(activeTrack, 'reverb', v)} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="master-layout">
              {/* Left: waveform meter + FX controls stacked */}
              <div className="master-fx-col">
                <div className="waveform-section">
                  <WaveformMeter />
                </div>
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

              {/* Right: vertical mixer faders */}
              <div className="master-mixer-col">
                <div className="mixer-section-label">Mixer</div>
                <div className="mixer-faders">
                  {/* Master volume — taller, neutral style */}
                  <div className="mixer-fader-wrap">
                    <input
                      type="range"                      className="v-fader v-fader-master"
                      min={0} max={1.5} step={0.01}
                      value={masterVolume}
                      onChange={e => { const v = parseFloat(e.target.value); setMasterVolume(v); Engine.setMasterVolume(v); }}
                    />
                    <div className="mixer-fader-label mixer-fader-label-master">Master</div>
                  </div>

                  <div className="mixer-v-divider" />

                  {/* Per-track faders, color-coded */}
                  {TRACK_IDS.map(id => (
                    <div key={id} className="mixer-fader-wrap">
                      <input
                        type="range"                        className="v-fader"
                        style={{
                          '--fader-color':      TRACK_FADER_COLORS[id][0],
                          '--fader-color-dark': TRACK_FADER_COLORS[id][1],
                        } as React.CSSProperties}
                        min={0} max={1.5} step={0.01}
                        value={trackParams[id].volume}
                        onChange={e => setVolumeFor(id, parseFloat(e.target.value))}
                      />
                      <div className="mixer-fader-label" style={{ color: TRACK_FADER_COLORS[id][0] }}>
                        {TRACK_LABELS[id]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
