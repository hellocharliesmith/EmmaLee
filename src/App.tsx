import { useState, useEffect, type ReactNode } from 'react';
import * as Tone from 'tone';
import * as Engine from './audio/engine';
import { RINGS_TRACK_IDS, DRUM_VOICE_IDS, type RingsTrackId, type DrumVoiceId, type TrackId as EngineTrackId } from './audio/engine';
import { divisionSeconds } from './audio/utils';
import { useSequencer, TRACK_IDS, TRACK_LABELS, DRUM_ROW_LABELS, PAGE_COUNT, STEP_COUNT,
         type ScaleType, type StepValue, type TrackId, type TrackSeqState } from './hooks/useSequencer';
import { useSavedSongs } from './hooks/useSavedSongs';
import { DEMO_SONGS } from './demoSongs';
import { generateSongName } from './songNames';
import { RINGS_PRESETS, PLAITS_PRESETS, DRUM_PRESETS, TEXTURE_PRESETS, JUNO60_PRESETS, JUNO106_PRESETS, NO_LFO, type RingsPreset, type PlaitsPreset, type DrumPreset, type TexturePreset } from './presets';
import { PianoRoll } from './components/PianoRoll';
import { Knob } from './components/Knob';
import { Slider } from './components/Slider';
import { Dropdown } from './components/Dropdown';
import { WaveformMeter } from './components/WaveformMeter';
import { RingsControls } from './components/RingsControls';
import { PlaitsControls } from './components/PlaitsControls';
import { GenerativeControls } from './components/GenerativeControls';
import { DrumControls, type DrumVoiceParams } from './components/DrumControls';
import { JunoControls } from './components/JunoControls';
import { GridsControls, type GridsUiState } from './components/GridsControls';
import { generateGridsPattern, GRIDS_INSTRUMENT_BD, GRIDS_INSTRUMENT_SD, GRIDS_INSTRUMENT_HH } from './audio/grids';
import { defaultGenerativeVoiceState } from './audio/generative';
import { DelayControls } from './components/DelayControls';
import { ReverbControls } from './components/ReverbControls';
import { CloudsControls, type CloudsUiState } from './components/CloudsControls';
import { SaveLoad } from './components/SaveLoad';
import { VoiceTabViz } from './components/VoiceTabViz';
import type { LfoState, ExciterState, PlaitsEnvelopeState, PlaitsFilterState, SavedSong, SongState, RingsTrackState, PlaitsTrackState, DrumTrackState, JunoTrackState, JunoPatch, LegacySongStateV1, LegacySongStateV2, LegacySongStateV3 } from './types';
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
  juno:   ['var(--amber-400)',  'var(--amber-500)'],
};
const MASTER_VOICE_COLOR = 'var(--neutral-dark-300)';

// Which engine.ts worklets feed each tab's VoiceTabViz — the Drums tab is one
// grid/tab here but 3 independent engine tracks (see DRUM_VOICE_IDS's comment
// in engine.ts), so its indicator aggregates all three.
const VOICE_TRACKS_FOR_TAB: Record<TrackId, EngineTrackId[]> = {
  ringsA: ['ringsA'],
  ringsB: ['ringsB'],
  plaits: ['plaits'],
  drums:  DRUM_VOICE_IDS,
  juno:   ['juno'],
};

// One small abstract glyph per tab, inherits the tab's own text color
// (currentColor) so it just works across selected/unselected states.
const TRACK_ICONS: Record<TrackId, ReactNode> = {
  ringsA: (
    <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /></svg>
  ),
  ringsB: (
    <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="8" cy="8" r="1.3" fill="currentColor" /></svg>
  ),
  plaits: (
    <svg width="14" height="14" viewBox="0 0 16 16"><path d="M1,8 C3,3 5,13 8,8 C11,3 13,13 15,8" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
  ),
  drums: (
    <svg width="14" height="14" viewBox="0 0 16 16"><circle cx="4" cy="10.5" r="1.6" fill="currentColor" /><circle cx="8" cy="5.5" r="2.1" fill="currentColor" /><circle cx="12" cy="10.5" r="1.6" fill="currentColor" /></svg>
  ),
  // A few piano keys — the classic polyphonic-keyboard-synth shape, distinct
  // from every other tab's glyph.
  juno: (
    <svg width="14" height="14" viewBox="0 0 16 16"><rect x="2" y="2" width="3" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="6.5" y="2" width="3" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="11" y="2" width="3" height="8" fill="currentColor" /></svg>
  ),
};
const MASTER_ICON: ReactNode = (
  <svg width="14" height="14" viewBox="0 0 16 16"><rect x="2" y="6" width="2" height="7" fill="currentColor" /><rect x="7" y="2" width="2" height="11" fill="currentColor" /><rect x="12" y="8" width="2" height="5" fill="currentColor" /></svg>
);

// Non-standard window members we touch: Safari's legacy AudioContext name,
// plus the two DevTools console helpers this app installs (see the
// captureVoice/captureTexture effects below).
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    captureVoice?: () => unknown;
    captureTexture?: () => unknown;
  }
}

function checkSupport(): string | null {
  if (typeof AudioContext === 'undefined' && typeof window.webkitAudioContext === 'undefined')
    return 'Web Audio API not supported in this browser.';
  const Ctx = window.AudioContext ?? window.webkitAudioContext!;
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

const DEFAULT_EXCITER: ExciterState = { model: 'internal', timbre: 0.6, parameter: 0.5, gateMs: 80, level: 1.0, attackMs: 0 };
const DEFAULT_PLAITS_ENVELOPE: PlaitsEnvelopeState = { attackMs: 0, sustain: 0 };
const DEFAULT_PLAITS_FILTER: PlaitsFilterState = { enabled: false, cutoff: 1, resonance: 0 };

interface RingsParamsState {
  kind: 'rings';
  model: number;
  params: [number, number, number, number]; // structure, brightness, damping, position
  lfo: LfoState[];
  exciter: ExciterState;
  volume: number;
  delaySend: number;
  reverbSend: number;
  cloudsSend: number;
}

interface PlaitsParamsState {
  kind: 'plaits';
  engine: number;
  params: [number, number, number, number, number]; // harmonics, timbre, morph, decay, lpgColour
  lfo: LfoState[];
  envelope: PlaitsEnvelopeState;
  filter: PlaitsFilterState;
  volume: number;
  delaySend: number;
  reverbSend: number;
  cloudsSend: number;
}

interface DrumParamsState {
  kind: 'drums';
  voices: Record<DrumVoiceId, DrumVoiceParams>;
  volume: number;
  delaySend: number;
  reverbSend: number;
  cloudsSend: number;
}

interface JunoParamsState {
  kind: 'juno';
  patch: JunoPatch;
  bank: '60' | '106';
  volume: number;
  delaySend: number;
  reverbSend: number;
  cloudsSend: number;
}

type AnyTrackParams = RingsParamsState | PlaitsParamsState | DrumParamsState | JunoParamsState;

function defaultRingsParams(): RingsParamsState {
  return { kind: 'rings', model: 1, params: [0.11, 0.24, 0.44, 0.25], lfo: DEFAULT_LFO, exciter: DEFAULT_EXCITER, volume: 0.85, delaySend: 0.5, reverbSend: 0.5, cloudsSend: 0.4 };
}
function defaultPlaitsParams(): PlaitsParamsState {
  return { kind: 'plaits', engine: 8, params: [0.5, 0.5, 0.5, 0.5, 1], lfo: NO_LFO, envelope: DEFAULT_PLAITS_ENVELOPE, filter: DEFAULT_PLAITS_FILTER, volume: 0.85, delaySend: 0.5, reverbSend: 0.5, cloudsSend: 0.4 };
}
// Decay defaults match engine.ts's DRUM_VOICE_CONFIG so the knobs reflect what's
// actually set on the worklet at creation time.
function defaultDrumVoices(): Record<DrumVoiceId, DrumVoiceParams> {
  return {
    drumHihat: { tone: 0.5, decay: 0.25, volume: 1, character: 0.5, blend: 0 },
    drumSnare: { tone: 0.5, decay: 0.45, volume: 1, character: 0.5, blend: 0 },
    drumKick:  { tone: 0.5, decay: 0.5,  volume: 1, character: 0.5, blend: 0 },
  };
}
function defaultDrumParams(): DrumParamsState {
  return { kind: 'drums', voices: defaultDrumVoices(), volume: 0.85, delaySend: 0.5, reverbSend: 0.5, cloudsSend: 0.4 };
}
function defaultJunoParams(): JunoParamsState {
  return { kind: 'juno', patch: JUNO60_PRESETS[0], bank: '60', volume: 0.85, delaySend: 0.5, reverbSend: 0.5, cloudsSend: 0.4 };
}
function defaultParamsFor(id: TrackId): AnyTrackParams {
  if (id === 'plaits') return defaultPlaitsParams();
  if (id === 'drums') return defaultDrumParams();
  if (id === 'juno') return defaultJunoParams();
  return defaultRingsParams();
}

type ViewSection = 'track' | 'master';

export default function App() {
  const [audioStarted, setAudioStarted] = useState(false);
  const [audioError,   setAudioError]   = useState<string | null>(null);
  // Lazy initializer, not an effect — the answer can't change after load.
  const [unsupported] = useState<string | null>(checkSupport);

  const {
    tracks, activeTrack, setActiveTrack,
    steps, visibleNotes, rootNote, globalScale, globalRootNote, scroll, maxScroll,
    bpm, isPlaying, currentStep,
    currentPage, enabledPages, currentPagePlaying,
    toggleNote, toggleStrumDir, setProbability, setVelocity, setPageSteps,
    loadTracks, clearCurrentPage,
    setScale, setRootNote, scrollUp, scrollDown,
    switchToPage, togglePageEnabled,
    lastStep, setLastStep,
    generative, setGenerativeConfig,
    octaveShift, setOctaveShift, toggleTie, setWander, setGate,
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
  const showGenerative = activeTrack !== 'drums' && generative.enabled;

  function updateTrackParamsFor(id: TrackId, fn: (prev: AnyTrackParams) => AnyTrackParams) {
    setTrackParams(prev => ({ ...prev, [id]: fn(prev[id]) }));
  }
  function updateActiveParams(fn: (prev: AnyTrackParams) => AnyTrackParams) {
    updateTrackParamsFor(activeTrack, fn);
  }

  // ── Mute (Master mixer) ──────────────────────────────────────────────
  // Session-only, like kidsMode/cloudsUi below — not part of the save
  // format. Mute never touches the stored `volume` — it just zeroes the
  // actual engine output on top of it, so unmuting restores exactly the
  // fader position it was at.
  const [mutedTracks, setMutedTracks] = useState<Record<TrackId, boolean>>(() => {
    const init = {} as Record<TrackId, boolean>;
    for (const id of TRACK_IDS) init[id] = false;
    return init;
  });

  // Drums is one UI tab but 3 separate engine.ts tracks — volume/sends broadcast to all 3.
  function applyVolumeToEngine(id: TrackId, v: number, muted: boolean) {
    const effective = muted ? 0 : v;
    if (id === 'drums') {
      const voices = (trackParams.drums as DrumParamsState).voices;
      DRUM_VOICE_IDS.forEach(vid => Engine.setTrackVolume(vid, (voices[vid].volume ?? 1) * effective));
    } else {
      Engine.setTrackVolume(id, effective);
    }
  }
  function setVolumeFor(id: TrackId, v: number) {
    updateTrackParamsFor(id, p => ({ ...p, volume: v }));
    applyVolumeToEngine(id, v, mutedTracks[id]);
  }
  function toggleMute(id: TrackId) {
    setMutedTracks(prev => {
      const nextMuted = !prev[id];
      applyVolumeToEngine(id, trackParams[id].volume, nextMuted);
      return { ...prev, [id]: nextMuted };
    });
  }
  function setSendFor(id: TrackId, kind: 'delay' | 'reverb' | 'clouds', v: number) {
    const field = kind === 'delay' ? 'delaySend' : kind === 'reverb' ? 'reverbSend' : 'cloudsSend';
    updateTrackParamsFor(id, p => ({ ...p, [field]: v }));
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

  // ── Clouds (master granular effect) ──────────────────────────────────
  // Session-only, like gridsUi above — not part of the save format yet.
  const [cloudsUi, setCloudsUi] = useState<CloudsUiState>({
    position: 0.5, size: 0.5, pitch: 0.5, density: 0.65, texture: 0.5,
    feedback: 0.0, mix: 0.5, reverbSend: 0.0, freeze: false,
    quality: 2, // manual's 3rd option: 16kHz 8-bit mu-law, stereo — matches Engine.initAudio's default
  });

  // ── Grids drum pattern generator (Drums tab only) ────────────────────
  // Local, session-only state (not part of the save format — it's a one-shot
  // generator input, not sequencer state; regenerating just overwrites the
  // current page's steps like any other manual edit would).
  const [gridsUi, setGridsUi] = useState<GridsUiState>({
    x: 0.5, y: 0.5, densityHH: 0.7, densitySD: 0.55, densityBD: 0.65, randomness: 0,
  });
  function handleGenerateDrums() {
    const pattern = generateGridsPattern({
      x: Math.round(gridsUi.x * 255),
      y: Math.round(gridsUi.y * 255),
      // Grids' own instrument order is bd/sd/hh — map from the UI's hh/sd/bd knobs.
      density: [
        Math.round(gridsUi.densityBD * 255),
        Math.round(gridsUi.densitySD * 255),
        Math.round(gridsUi.densityHH * 255),
      ],
      randomness: Math.round(gridsUi.randomness * 255),
    });
    // App's drum row order (matches DRUM_ROW_LABELS/DRUM_VOICE_IDS, top to
    // bottom): 0 = Hi-Hat, 1 = Snare, 2 = Kick — different from Grids' own
    // bd/sd/hh order, so remap per step.
    const newSteps: StepValue[] = Array.from({ length: 32 }, (_, step) => {
      const notes: number[] = [];
      if (pattern.active[GRIDS_INSTRUMENT_HH][step]) notes.push(0);
      if (pattern.active[GRIDS_INSTRUMENT_SD][step]) notes.push(1);
      if (pattern.active[GRIDS_INSTRUMENT_BD][step]) notes.push(2);
      if (notes.length === 0) return null;
      const accented =
        (notes.includes(0) && pattern.accent[GRIDS_INSTRUMENT_HH][step]) ||
        (notes.includes(1) && pattern.accent[GRIDS_INSTRUMENT_SD][step]) ||
        (notes.includes(2) && pattern.accent[GRIDS_INSTRUMENT_BD][step]);
      return { notes, strumDown: false, velocity: accented ? 1 : 0.75 };
    });
    setPageSteps(newSteps);
  }

  // ── Kids mode ─────────────────────────────────────────────────────────
  const [kidsMode, setKidsMode] = useState(false);
  const KIDS_ROWS = 8;
  useEffect(() => { if (kidsMode) setActiveTrack('ringsA'); }, [kidsMode, setActiveTrack]);

  // Console helper — open DevTools and type captureVoice() to get current track params
  useEffect(() => {
    window.captureVoice = () => {
      const p = trackParams[activeTrack];
      const out = JSON.stringify(p, null, 2);
      console.log(`captureVoice() — active track: ${activeTrack}\n${out}`);
      return p;
    };
  }, [trackParams, activeTrack]);

  // Console helper — open DevTools and type captureTexture() to get the current
  // Texture (master granular effect) settings, same workflow as captureVoice().
  useEffect(() => {
    window.captureTexture = () => {
      const { position, size, pitch, density, texture, feedback, mix, reverbSend } = cloudsUi;
      const p = { name: 'Untitled', position, size, pitch, density, texture, feedback, mix, reverbSend };
      const out = JSON.stringify(p, null, 2);
      console.log(`captureTexture()\n${out}`);
      return p;
    };
  }, [cloudsUi]);

  // ── Save / load ───────────────────────────────────────────────────────
  const { songs, save, update, remove } = useSavedSongs();
  // What's currently loaded — shown in the Songs menu so it's always clear
  // what you're looking at. 'demo' vs 'saved' is inferred from savedAt === 0,
  // the marker DEMO_SONGS entries are always spread with (see loadSong below).
  const [currentSongName, setCurrentSongName] = useState('Demo 1');
  const [currentSongKind, setCurrentSongKind] = useState<'demo' | 'saved' | 'new'>('demo');
  // Which entry in `songs` (if any) is currently loaded — null for demos and
  // brand-new songs. Lets a plain "Save" update that song in place instead of
  // always minting a new copy (see SaveLoad.tsx's canSaveInPlace / "Save As").
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);

  function captureState(): SongState {
    const ringsAP = trackParams.ringsA as RingsParamsState;
    const ringsBP = trackParams.ringsB as RingsParamsState;
    const plaitsP = trackParams.plaits as PlaitsParamsState;
    const drumsP  = trackParams.drums as DrumParamsState;

    const ringsA: RingsTrackState = {
      pages: tracks.ringsA.pages, enabledPages: tracks.ringsA.enabledPages, lastStep: tracks.ringsA.lastStep,
      scale: tracks.ringsA.scale, rootNote: tracks.ringsA.rootNote, scrollRow: tracks.ringsA.scrollRow,
      generative: tracks.ringsA.generative,
      octaveShift: tracks.ringsA.octaveShift ?? 0,
      model: ringsAP.model, structure: ringsAP.params[0], brightness: ringsAP.params[1],
      damping: ringsAP.params[2], position: ringsAP.params[3], lfo: ringsAP.lfo, exciter: ringsAP.exciter,
      volume: ringsAP.volume, delaySend: ringsAP.delaySend, reverbSend: ringsAP.reverbSend, cloudsSend: ringsAP.cloudsSend,
    };
    const ringsB: RingsTrackState = {
      pages: tracks.ringsB.pages, enabledPages: tracks.ringsB.enabledPages, lastStep: tracks.ringsB.lastStep,
      scale: tracks.ringsB.scale, rootNote: tracks.ringsB.rootNote, scrollRow: tracks.ringsB.scrollRow,
      generative: tracks.ringsB.generative,
      octaveShift: tracks.ringsB.octaveShift ?? 0,
      model: ringsBP.model, structure: ringsBP.params[0], brightness: ringsBP.params[1],
      damping: ringsBP.params[2], position: ringsBP.params[3], lfo: ringsBP.lfo, exciter: ringsBP.exciter,
      volume: ringsBP.volume, delaySend: ringsBP.delaySend, reverbSend: ringsBP.reverbSend, cloudsSend: ringsBP.cloudsSend,
    };
    const plaits: PlaitsTrackState = {
      pages: tracks.plaits.pages, enabledPages: tracks.plaits.enabledPages, lastStep: tracks.plaits.lastStep,
      scale: tracks.plaits.scale, rootNote: tracks.plaits.rootNote, scrollRow: tracks.plaits.scrollRow,
      generative: tracks.plaits.generative,
      octaveShift: tracks.plaits.octaveShift ?? 0,
      engine: plaitsP.engine, harmonics: plaitsP.params[0], timbre: plaitsP.params[1],
      morph: plaitsP.params[2], decay: plaitsP.params[3], lpgColour: plaitsP.params[4], lfo: plaitsP.lfo,
      envelope: plaitsP.envelope,
      filter: plaitsP.filter,
      volume: plaitsP.volume, delaySend: plaitsP.delaySend, reverbSend: plaitsP.reverbSend, cloudsSend: plaitsP.cloudsSend,
    };
    const drums: DrumTrackState = {
      pages: tracks.drums.pages, enabledPages: tracks.drums.enabledPages, lastStep: tracks.drums.lastStep,
      scale: tracks.drums.scale, rootNote: tracks.drums.rootNote, scrollRow: tracks.drums.scrollRow,
      voices: drumsP.voices, volume: drumsP.volume, delaySend: drumsP.delaySend, reverbSend: drumsP.reverbSend, cloudsSend: drumsP.cloudsSend,
    };
    const junoP = trackParams.juno as JunoParamsState;
    const juno: JunoTrackState = {
      pages: tracks.juno.pages, enabledPages: tracks.juno.enabledPages, lastStep: tracks.juno.lastStep,
      scale: tracks.juno.scale, rootNote: tracks.juno.rootNote, scrollRow: tracks.juno.scrollRow,
      generative: tracks.juno.generative,
      octaveShift: tracks.juno.octaveShift ?? 0,
      patch: junoP.patch, bank: junoP.bank,
      volume: junoP.volume, delaySend: junoP.delaySend, reverbSend: junoP.reverbSend, cloudsSend: junoP.cloudsSend,
    };

    return {
      version: 4, bpm, tracks: { ringsA, ringsB, plaits, drums, juno },
      delayDivision, delayMix, delayFeedback, delayFilter,
      reverbType, reverbMix, reverbDecay, reverbPreDelay, reverbTone,
    };
  }

  function stepsToPages(steps: StepValue[]): { pages: StepValue[][], enabledPages: boolean[] } {
    const pages = [steps, ...Array.from({ length: PAGE_COUNT - 1 }, () => Array(32).fill(null) as StepValue[])];
    return { pages, enabledPages: [true, false, false, false] };
  }

  function defaultJunoTrackState(): JunoTrackState {
    return {
      ...stepsToPages(Array(32).fill(null)), scale: 'major', rootNote: 0, scrollRow: 7,
      patch: JUNO60_PRESETS[0], bank: '60',
      volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
  }
  // Every pre-Juno save (a genuine v3 file, or one just migrated up from v1/v2)
  // gets a fresh default Juno track — same "missing track gets a default"
  // pattern as drumsState's own fallback below, just applied uniformly here
  // instead of duplicating it in migrateLegacy/migrateV2toV3.
  function withDefaultJuno(v3: LegacySongStateV3): SongState {
    return { ...v3, version: 4, tracks: { ...v3.tracks, juno: defaultJunoTrackState() } };
  }

  function migrateLegacy(old: LegacySongStateV1): LegacySongStateV3 {
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
      engine: 8, harmonics: 0.5, timbre: 0.5, morph: 0.5, decay: 0.5, lpgColour: 0.5, lfo: NO_LFO,
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

  function migrateV2toV3(v2: LegacySongStateV2): LegacySongStateV3 {
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
        plaits: { ...stepsToPages(v2.tracks.plaits.steps), scale: v2.tracks.plaits.scale, rootNote: v2.tracks.plaits.rootNote, scrollRow: v2.tracks.plaits.scrollRow, engine: v2.tracks.plaits.engine, harmonics: v2.tracks.plaits.harmonics, timbre: v2.tracks.plaits.timbre, morph: v2.tracks.plaits.morph, decay: v2.tracks.plaits.decay, lpgColour: v2.tracks.plaits.lpgColour ?? 0.5, lfo: NO_LFO, volume: v2.tracks.plaits.volume, delaySend: v2.tracks.plaits.delaySend, reverbSend: v2.tracks.plaits.reverbSend },
        drums: drumsV3,
      },
      delayDivision: v2.delayDivision, delayMix: v2.delayMix, delayFeedback: v2.delayFeedback, delayFilter: v2.delayFilter,
      reverbType: v2.reverbType, reverbMix: v2.reverbMix, reverbDecay: v2.reverbDecay, reverbPreDelay: v2.reverbPreDelay, reverbTone: v2.reverbTone,
    };
  }

  function loadSong(song: SavedSong) {
    setCurrentSongName(song.name);
    setCurrentSongKind(song.savedAt === 0 ? 'demo' : 'saved');
    // Only track an id if it's a genuine entry in `songs` (the user's saved-song
    // list) — a demo (savedAt === 0) or a freshly-imported file (has a real
    // savedAt but was never added to `songs`) must NOT be treated as
    // in-place-saveable, or a later plain Save would silently no-op (update()
    // can't find an id that isn't actually in the list).
    setCurrentSongId(song.savedAt !== 0 && songs.some(s => s.id === song.id) ? song.id : null);
    // Mute is session-only (see its own state above) — a freshly-loaded song
    // should start with nothing muted, and this also keeps mutedTracks from
    // going stale against the fresh syncParamsToEngine call below (which sets
    // raw, unmuted volume for every track regardless of prior mute state).
    setMutedTracks(prev => {
      const next = { ...prev };
      for (const id of TRACK_IDS) next[id] = false;
      return next;
    });
    const raw = song.state;
    let state: SongState;
    if ('version' in raw && raw.version === 4) {
      state = raw as SongState;
    } else if ('version' in raw && raw.version === 3) {
      state = withDefaultJuno(raw as LegacySongStateV3);
    } else if ('version' in raw && raw.version === 2) {
      state = withDefaultJuno(migrateV2toV3(raw as LegacySongStateV2));
    } else {
      state = withDefaultJuno(migrateLegacy(raw as LegacySongStateV1));
    }

    // Saves missing the drums track entirely get a fresh default.
    const drumsState: DrumTrackState = state.tracks.drums ?? {
      ...stepsToPages(Array(32).fill(null)), scale: 'major', rootNote: 0, scrollRow: 7,
      voices: defaultDrumVoices(), volume: 0.85, delaySend: 0.5, reverbSend: 0.5,
    };
    const rawVoices = drumsState.voices ?? defaultDrumVoices();
    // Per-field merge (not a plain `??` on the whole voices object) since a
    // save from before a given field existed can have a real per-voice object
    // that's simply missing that one key — same pattern as `exciter`'s
    // level/attackMs fallback, see AGENTS.md "Rings exciters" > Save format.
    const drumVoices = {
      drumHihat: { ...rawVoices.drumHihat, volume: rawVoices.drumHihat.volume ?? 1, character: rawVoices.drumHihat.character ?? 0.5, blend: rawVoices.drumHihat.blend ?? 0 },
      drumSnare: { ...rawVoices.drumSnare, volume: rawVoices.drumSnare.volume ?? 1, character: rawVoices.drumSnare.character ?? 0.5, blend: rawVoices.drumSnare.blend ?? 0 },
      drumKick:  { ...rawVoices.drumKick,  volume: rawVoices.drumKick.volume  ?? 1, character: rawVoices.drumKick.character  ?? 0.5, blend: rawVoices.drumKick.blend  ?? 0 },
    };

    const nextTracks: Record<TrackId, TrackSeqState> = {
      ringsA: { pages: state.tracks.ringsA.pages, enabledPages: state.tracks.ringsA.enabledPages, currentPage: 0, lastStep: state.tracks.ringsA.lastStep ?? STEP_COUNT - 1, scale: state.tracks.ringsA.scale, rootNote: state.tracks.ringsA.rootNote, scrollRow: state.tracks.ringsA.scrollRow, generative: { ...defaultGenerativeVoiceState(), ...state.tracks.ringsA.generative }, octaveShift: state.tracks.ringsA.octaveShift ?? 0 },
      ringsB: { pages: state.tracks.ringsB.pages, enabledPages: state.tracks.ringsB.enabledPages, currentPage: 0, lastStep: state.tracks.ringsB.lastStep ?? STEP_COUNT - 1, scale: state.tracks.ringsB.scale, rootNote: state.tracks.ringsB.rootNote, scrollRow: state.tracks.ringsB.scrollRow, generative: { ...defaultGenerativeVoiceState(), ...state.tracks.ringsB.generative }, octaveShift: state.tracks.ringsB.octaveShift ?? 0 },
      plaits: { pages: state.tracks.plaits.pages, enabledPages: state.tracks.plaits.enabledPages, currentPage: 0, lastStep: state.tracks.plaits.lastStep ?? STEP_COUNT - 1, scale: state.tracks.plaits.scale, rootNote: state.tracks.plaits.rootNote, scrollRow: state.tracks.plaits.scrollRow, generative: { ...defaultGenerativeVoiceState(), ...state.tracks.plaits.generative }, octaveShift: state.tracks.plaits.octaveShift ?? 0 },
      drums:  { pages: drumsState.pages, enabledPages: drumsState.enabledPages, currentPage: 0, lastStep: drumsState.lastStep ?? STEP_COUNT - 1, scale: drumsState.scale, rootNote: drumsState.rootNote, scrollRow: drumsState.scrollRow },
      juno: { pages: state.tracks.juno.pages, enabledPages: state.tracks.juno.enabledPages, currentPage: 0, lastStep: state.tracks.juno.lastStep ?? STEP_COUNT - 1, scale: state.tracks.juno.scale, rootNote: state.tracks.juno.rootNote, scrollRow: state.tracks.juno.scrollRow, generative: { ...defaultGenerativeVoiceState(), ...state.tracks.juno.generative }, octaveShift: state.tracks.juno.octaveShift ?? 0 },
    };
    const nextParams: Record<TrackId, AnyTrackParams> = {
      ringsA: {
        kind: 'rings', model: state.tracks.ringsA.model,
        params: [state.tracks.ringsA.structure, state.tracks.ringsA.brightness, state.tracks.ringsA.damping, state.tracks.ringsA.position],
        lfo: state.tracks.ringsA.lfo, exciter: { ...DEFAULT_EXCITER, ...state.tracks.ringsA.exciter }, volume: state.tracks.ringsA.volume,
        delaySend: state.tracks.ringsA.delaySend, reverbSend: state.tracks.ringsA.reverbSend,
        cloudsSend: state.tracks.ringsA.cloudsSend ?? 0.4,
      },
      ringsB: {
        kind: 'rings', model: state.tracks.ringsB.model,
        params: [state.tracks.ringsB.structure, state.tracks.ringsB.brightness, state.tracks.ringsB.damping, state.tracks.ringsB.position],
        lfo: state.tracks.ringsB.lfo, exciter: { ...DEFAULT_EXCITER, ...state.tracks.ringsB.exciter }, volume: state.tracks.ringsB.volume,
        delaySend: state.tracks.ringsB.delaySend, reverbSend: state.tracks.ringsB.reverbSend,
        cloudsSend: state.tracks.ringsB.cloudsSend ?? 0.4,
      },
      plaits: {
        kind: 'plaits', engine: state.tracks.plaits.engine,
        params: [state.tracks.plaits.harmonics, state.tracks.plaits.timbre, state.tracks.plaits.morph, state.tracks.plaits.decay, state.tracks.plaits.lpgColour ?? 0.5],
        lfo: state.tracks.plaits.lfo ?? NO_LFO,
        envelope: { ...DEFAULT_PLAITS_ENVELOPE, ...state.tracks.plaits.envelope },
        filter: { ...DEFAULT_PLAITS_FILTER, ...state.tracks.plaits.filter },
        volume: state.tracks.plaits.volume, delaySend: state.tracks.plaits.delaySend, reverbSend: state.tracks.plaits.reverbSend,
        cloudsSend: state.tracks.plaits.cloudsSend ?? 0.4,
      },
      drums: {
        kind: 'drums', voices: drumVoices, volume: drumsState.volume,
        delaySend: drumsState.delaySend, reverbSend: drumsState.reverbSend,
        cloudsSend: drumsState.cloudsSend ?? 0.4,
      },
      juno: {
        kind: 'juno', patch: state.tracks.juno.patch, bank: state.tracks.juno.bank,
        volume: state.tracks.juno.volume, delaySend: state.tracks.juno.delaySend, reverbSend: state.tracks.juno.reverbSend,
        cloudsSend: state.tracks.juno.cloudsSend ?? 0.4,
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
      syncParamsToEngine(nextParams, state.delayDivision, state.bpm,
        state.delayMix, state.delayFeedback, state.delayFilter,
        state.reverbType, state.reverbMix, state.reverbDecay, state.reverbPreDelay, state.reverbTone);
    }
  }

  // Boot with the first demo loaded. loadSong fans out into a dozen setState
  // calls by design (it IS the "load everything" path) — running it once from
  // a mount effect is intentional, not an accidental render cascade.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { loadSong({ ...DEMO_SONGS[0], savedAt: 0 }); }, []);

  function loadRingsPreset(id: TrackId, preset: RingsPreset) {
    updateTrackParamsFor(id, p => p.kind === 'rings'
      ? { ...p, model: preset.model, params: preset.params, lfo: preset.lfo, exciter: preset.exciter ?? p.exciter }
      : p);
    if (!Engine.isAudioReady()) return;
    Engine.setRingsModel(id as RingsTrackId, preset.model);
    preset.params.forEach((v, i) => Engine.setRingsParam(id as RingsTrackId, i, v));
    preset.lfo.forEach((l, i) => {
      Engine.setLFOWave(id as RingsTrackId, i, l.wave);
      Engine.setLFORate(id as RingsTrackId, i, l.rate);
      Engine.setLFODepth(id as RingsTrackId, i, l.depth);
      Engine.setLFOEnabled(id as RingsTrackId, i, l.on);
    });
    if (preset.exciter) {
      const ex = preset.exciter;
      Engine.setExciterModel(id as RingsTrackId, ex.model);
      Engine.setExciterParam(id as RingsTrackId, 'timbre', ex.timbre);
      Engine.setExciterParam(id as RingsTrackId, 'parameter', ex.parameter);
      Engine.setExciterGateMs(id as RingsTrackId, ex.gateMs);
      Engine.setExciterLevel(id as RingsTrackId, ex.level);
      Engine.setExciterAttackMs(id as RingsTrackId, ex.attackMs);
    }
  }

  function loadDrumPreset(preset: DrumPreset) {
    // Presets (DrumVoicePreset) only carry tone/decay/volume — merge field-by-
    // field per voice rather than replacing the whole voice object, so a
    // track's Character/Blend knobs survive loading a preset untouched.
    updateTrackParamsFor('drums', p => p.kind === 'drums'
      ? { ...p, voices: {
          drumHihat: { ...p.voices.drumHihat, ...preset.voices.drumHihat },
          drumSnare: { ...p.voices.drumSnare, ...preset.voices.drumSnare },
          drumKick:  { ...p.voices.drumKick,  ...preset.voices.drumKick },
        } }
      : p);
    if (!Engine.isAudioReady()) return;
    DRUM_VOICE_IDS.forEach(vid => {
      const v = preset.voices[vid];
      Engine.setTrackVolume(vid, v.volume);
      Engine.setDrumParam(vid, 1, v.tone);
      Engine.setDrumParam(vid, 2, v.decay);
    });
  }

  function loadPlaitsPreset(preset: PlaitsPreset) {
    updateTrackParamsFor('plaits', p => p.kind === 'plaits'
      ? { ...p, engine: preset.engine, params: preset.params, lfo: preset.lfo }
      : p);
    if (!Engine.isAudioReady()) return;
    Engine.setPlaitsModel(preset.engine);
    preset.params.forEach((v, i) => Engine.setPlaitsParam(i, v));
    preset.lfo.forEach((l, i) => {
      Engine.setPlaitsLFOWave(i, l.wave);
      Engine.setPlaitsLFORate(i, l.rate);
      Engine.setPlaitsLFODepth(i, l.depth);
      Engine.setPlaitsLFOEnabled(i, l.on);
    });
  }

  function loadTexturePreset(preset: TexturePreset) {
    setCloudsUi(prev => ({
      ...prev,
      position: preset.position, size: preset.size, pitch: preset.pitch,
      density: preset.density, texture: preset.texture, feedback: preset.feedback,
      mix: preset.mix, reverbSend: preset.reverbSend, freeze: false,
    }));
    if (!Engine.isAudioReady()) return;
    Engine.setCloudsParam(0, preset.position);
    Engine.setCloudsParam(1, preset.size);
    Engine.setCloudsParam(2, (preset.pitch - 0.5) * 96);
    Engine.setCloudsParam(3, preset.density);
    Engine.setCloudsParam(4, preset.texture);
    Engine.setCloudsParam(7, preset.feedback);
    Engine.setCloudsWet(preset.mix);
    Engine.setCloudsReverbSend(preset.reverbSend);
    Engine.setCloudsFreeze(false);
  }

  function handleExport(name: string) {
    const song: SavedSong = {
      id: crypto.randomUUID(),
      name,
      savedAt: Date.now(),
      state: captureState(),
    };
    const blob = new Blob([JSON.stringify(song, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleNewSong() {
    setCurrentSongName(generateSongName());
    setCurrentSongKind('new');
    setCurrentSongId(null);
    // Same reasoning as loadSong's reset — see its comment.
    setMutedTracks(prev => {
      const next = { ...prev };
      for (const id of TRACK_IDS) next[id] = false;
      return next;
    });
    function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

    const ringsAPreset = pick(RINGS_PRESETS);
    const ringsBPreset = pick(RINGS_PRESETS);
    const plaitsPreset = pick(PLAITS_PRESETS);
    const drumPreset   = pick(DRUM_PRESETS);
    const junoBank: '60' | '106' = Math.random() < 0.5 ? '60' : '106';
    const junoPreset = pick(junoBank === '60' ? JUNO60_PRESETS : JUNO106_PRESETS);

    const emptyPages = () => Array.from({ length: PAGE_COUNT }, () => Array(STEP_COUNT).fill(null) as StepValue[]);

    const nextTracks: Record<TrackId, TrackSeqState> = {
      ringsA: { pages: emptyPages(), enabledPages: [true,false,false,false], currentPage: 0, lastStep: STEP_COUNT - 1, scale: 'major', rootNote: 0, scrollRow: 12, generative: defaultGenerativeVoiceState(), octaveShift: 0 },
      ringsB: { pages: emptyPages(), enabledPages: [true,false,false,false], currentPage: 0, lastStep: STEP_COUNT - 1, scale: 'major', rootNote: 0, scrollRow: 12, generative: defaultGenerativeVoiceState(), octaveShift: 0 },
      plaits: { pages: emptyPages(), enabledPages: [true,false,false,false], currentPage: 0, lastStep: STEP_COUNT - 1, scale: 'major', rootNote: 0, scrollRow: 12, generative: defaultGenerativeVoiceState(), octaveShift: 0 },
      drums:  { pages: emptyPages(), enabledPages: [true,false,false,false], currentPage: 0, lastStep: STEP_COUNT - 1, scale: 'chromatic', rootNote: 0, scrollRow: 0  },
      juno:   { pages: emptyPages(), enabledPages: [true,false,false,false], currentPage: 0, lastStep: STEP_COUNT - 1, scale: 'major', rootNote: 0, scrollRow: 12, generative: defaultGenerativeVoiceState(), octaveShift: 0 },
    };
    const nextParams: Record<TrackId, AnyTrackParams> = {
      ringsA: { kind: 'rings', model: ringsAPreset.model, params: ringsAPreset.params, lfo: ringsAPreset.lfo, exciter: DEFAULT_EXCITER, volume: 0.85, delaySend: 0.5, reverbSend: 0.5, cloudsSend: 0.4 },
      ringsB: { kind: 'rings', model: ringsBPreset.model, params: ringsBPreset.params, lfo: ringsBPreset.lfo, exciter: DEFAULT_EXCITER, volume: 0.85, delaySend: 0.5, reverbSend: 0.5, cloudsSend: 0.4 },
      plaits: { kind: 'plaits', engine: plaitsPreset.engine, params: plaitsPreset.params, lfo: plaitsPreset.lfo, envelope: DEFAULT_PLAITS_ENVELOPE, filter: DEFAULT_PLAITS_FILTER, volume: 0.85, delaySend: 0.5, reverbSend: 0.5, cloudsSend: 0.4 },
      // drumPreset.voices (DrumVoicePreset) only carries tone/decay/volume —
      // merge onto fresh defaults so Character/Blend start at their sane
      // defaults (0.5/0) instead of undefined.
      drums:  { kind: 'drums', voices: {
        drumHihat: { ...defaultDrumVoices().drumHihat, ...drumPreset.voices.drumHihat },
        drumSnare: { ...defaultDrumVoices().drumSnare, ...drumPreset.voices.drumSnare },
        drumKick:  { ...defaultDrumVoices().drumKick,  ...drumPreset.voices.drumKick },
      }, volume: 0.85, delaySend: 0.5, reverbSend: 0.5, cloudsSend: 0.4 },
      juno: { kind: 'juno', patch: junoPreset, bank: junoBank, volume: 0.85, delaySend: 0.5, reverbSend: 0.5, cloudsSend: 0.4 },
    };

    loadTracks(nextTracks);
    setTrackParams(nextParams);
    if (Engine.isAudioReady()) {
      syncParamsToEngine(nextParams, delayDivision, bpm,
        delayMix, delayFeedback, delayFilter,
        reverbType, reverbMix, reverbDecay, reverbPreDelay, reverbTone);
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
      applyVolumeToEngine(id, p.volume, mutedTracks[id]);
      Engine.setTrackSend(id, 'delay', p.delaySend);
      Engine.setTrackSend(id, 'reverb', p.reverbSend);
      Engine.setTrackSend(id, 'clouds', p.cloudsSend);
    }
    const pp = params.plaits as PlaitsParamsState;
    Engine.setPlaitsParam(0, pp.params[0]);
    Engine.setPlaitsParam(1, pp.params[1]);
    Engine.setPlaitsParam(2, pp.params[2]);
    Engine.setPlaitsParam(3, pp.params[3]);
    // LPG Colour (param 4) — no UI control, always pinned to the "darker" full
    // lowpass-gate end (1.0) regardless of what's in saved state (see engine.ts).
    Engine.setPlaitsParam(4, 1.0);
    Engine.setPlaitsModel(pp.engine);
    pp.lfo.forEach((l, i) => {
      Engine.setPlaitsLFOWave(i, l.wave);
      Engine.setPlaitsLFORate(i, l.rate);
      Engine.setPlaitsLFODepth(i, l.depth);
      Engine.setPlaitsLFOEnabled(i, l.on);
    });
    applyVolumeToEngine('plaits', pp.volume, mutedTracks.plaits);
    Engine.setTrackSend('plaits', 'delay', pp.delaySend);
    Engine.setTrackSend('plaits', 'reverb', pp.reverbSend);
    Engine.setTrackSend('plaits', 'clouds', pp.cloudsSend);

    const dp = params.drums as DrumParamsState;
    applyVolumeToEngine('drums', dp.volume, mutedTracks.drums);
    DRUM_VOICE_IDS.forEach(vid => {
      Engine.setTrackSend(vid, 'delay', dp.delaySend);
      Engine.setTrackSend(vid, 'reverb', dp.reverbSend);
      Engine.setTrackSend(vid, 'clouds', dp.cloudsSend);
      Engine.setDrumParam(vid, 1, dp.voices[vid].tone);
      Engine.setDrumParam(vid, 2, dp.voices[vid].decay);
      Engine.setDrumParam(vid, 0, dp.voices[vid].character ?? 0.5);
      Engine.setDrumBlend(vid, dp.voices[vid].blend ?? 0);
    });

    const jp = params.juno as JunoParamsState;
    Engine.setJunoPatch(jp.patch);
    applyVolumeToEngine('juno', jp.volume, mutedTracks.juno);
    Engine.setTrackSend('juno', 'delay', jp.delaySend);
    Engine.setTrackSend('juno', 'reverb', jp.reverbSend);
    Engine.setTrackSend('juno', 'clouds', jp.cloudsSend);

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
      try {
        // Tone.start() resumes Tone's own AudioContext from within the gesture
        // frame, which marks this page as "user-activated" in Chrome (hasBeenActive).
        // Chrome 71+ then allows AudioContext.resume() anywhere on the page for the
        // remainder of the session — so we can safely create a native ctx after the
        // await and resume it without being inside the gesture stack frame.
        await Tone.start();
        const ctx = new AudioContext();
        await ctx.resume();
        Tone.setContext(ctx);
        await Engine.initAudio(ctx);
        syncParamsToEngine(trackParams, delayDivision, bpm,
          delayMix, delayFeedback, delayFilter,
          reverbType, reverbMix, reverbDecay, reverbPreDelay, reverbTone);
        setAudioStarted(true);
      } catch (err) {
        setAudioError(`Audio failed to start: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    if (isPlaying) stop(); else start();
  }

  const kidsNotes = kidsMode ? visibleNotes.slice(0, KIDS_ROWS) : visibleNotes;

  // `lastStep` only musically applies to whichever enabled page ends up LAST in
  // the playback cycle (see useSequencer.ts's Tone.Loop — same ei/lastEnabledPage
  // derivation). PianoRoll grays everything beyond `lastStep` unconditionally, so
  // only pass it through when the page being VIEWED is actually that last enabled
  // page — otherwise every other page would show the same graying by mistake.
  const enabledPageIndices  = [0, 1, 2, 3].filter(i => enabledPages[i]);
  const lastEnabledPageIdx  = enabledPageIndices[enabledPageIndices.length - 1];
  const isCurrentPageLastEnabled = currentPage === lastEnabledPageIdx;

  // Per-track accent color (CSS vars set in App.css) — Kids Mode is always pinned
  // to ringsA so it just gets the default Rose, no class needed. Master isn't a
  // track, so it gets a neutral highlight instead of any track's hue.
  const trackColorClass = kidsMode ? '' : viewSection === 'master' ? ' track-master'
    : activeTrack === 'ringsB' ? ' track-rings-b'
    : activeTrack === 'plaits' ? ' track-plaits'
    : activeTrack === 'drums'  ? ' track-drums'
    : activeTrack === 'juno'   ? ' track-juno'
    : '';

  return (
    <div className={`app${kidsMode ? ' kids-mode' : ''}${trackColorClass}`}>

      {/* ── Header — three clusters (transport | file actions | kids),
          divided by thin vertical rules. Stays identical across every tab —
          track/scale-specific controls live in the page-selector row below,
          not here. ── */}
      <div className="app-header">
        <h1>Emma Lee</h1>
        {!kidsMode && (
          <div className="header-clusters">
            <div className="header-cluster">
              <button
                className={`play-btn${isPlaying ? ' playing' : ''}${unsupported ? ' disabled' : ''}`}
                onClick={handlePlayStop} disabled={!!unsupported}
              >
                {isPlaying ? '■ Stop' : '▶ Play'}
              </button>
              <div className="bpm-row">
                <label>BPM</label>
                <Slider value={bpm} min={40} max={200} step={1}
                  onChange={v => updateBpm(Math.round(v))} className="bpm-slider" />
                <span className="bpm-val">{bpm}</span>
              </div>
              <div className="key-row">
                <label>Key</label>
                <Dropdown className="key-select" value={String(globalRootNote)}
                  options={ROOT_NAMES.map((n, i) => ({ value: String(i), label: n }))}
                  onChange={v => setRootNote(parseInt(v))}
                />
                <Dropdown className="key-select" value={globalScale}
                  options={SCALE_OPTIONS.map(s => ({ value: s.id, label: s.label }))}
                  onChange={v => setScale(v as ScaleType)}
                />
              </div>
            </div>
            <div className="header-divider" />
            <div className="header-cluster">
              <SaveLoad songs={songs}
                currentSongName={currentSongName} currentSongKind={currentSongKind} currentSongId={currentSongId}
                onSave={name => {
                  const id = save(name, captureState());
                  setCurrentSongName(name); setCurrentSongKind('saved'); setCurrentSongId(id);
                }}
                onSaveInPlace={() => { if (currentSongId) update(currentSongId, captureState()); }}
                onLoad={loadSong} onDelete={remove} onNewSong={handleNewSong}
                onExport={handleExport} onImport={loadSong} />
            </div>
            <div className="header-divider" />
            <div className="header-cluster">
              <button
                className={`kids-toggle${kidsMode ? ' active' : ''}`}
                onClick={() => setKidsMode(v => !v)}
                title={kidsMode ? 'Exit Kids Mode' : 'Kids Mode'}
              >
                {kidsMode ? 'Exit Kids' : 'Kids'}
              </button>
            </div>
          </div>
        )}
        {kidsMode && (
          <button
            className={`kids-toggle${kidsMode ? ' active' : ''}`}
            onClick={() => setKidsMode(v => !v)}
            title="Exit Kids Mode"
          >
            Exit Kids
          </button>
        )}
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
          {/* ── Normal mode layout — transport/file actions/kids now live in
              the header above; this is just the track-specific chrome. ── */}
          {audioError && (
            <div className="audio-banner error">
              ⚠ {audioError}
              <button className="banner-dismiss" onClick={() => setAudioError(null)}>✕</button>
            </div>
          )}

          <div className="page-selector">
            {TRACK_IDS.map(id => {
              const isViewing = viewSection === 'track' && activeTrack === id;
              return (
                <button key={id}
                  className={['page-btn', 'track-tab', isViewing ? 'viewing' : ''].filter(Boolean).join(' ')}
                  onClick={() => { setActiveTrack(id); setViewSection('track'); }}
                >
                  <span className="tab-label-group">
                    <span className="tab-icon">{TRACK_ICONS[id]}</span>
                    {TRACK_LABELS[id]}
                  </span>
                  <VoiceTabViz tracks={VOICE_TRACKS_FOR_TAB[id]}
                    color={isViewing ? 'var(--bg-body)' : TRACK_FADER_COLORS[id][0]} />
                </button>
              );
            })}
            <button
              className={['page-btn', 'track-tab', viewSection === 'master' ? 'viewing' : ''].filter(Boolean).join(' ')}
              onClick={() => setViewSection('master')}
            >
              <span className="tab-label-group">
                <span className="tab-icon">{MASTER_ICON}</span>
                Master
              </span>
              <VoiceTabViz tracks="all"
                color={viewSection === 'master' ? 'var(--bg-body)' : MASTER_VOICE_COLOR} />
            </button>
          </div>

          {viewSection === 'track' && activeTrack !== 'drums' && (
            <div className="seq-mode-toggle">
              <button
                className={`page-btn${!generative.enabled ? ' viewing' : ''}`}
                onClick={() => setGenerativeConfig({ enabled: false })}
              >Piano Roll</button>
              <button
                className={`page-btn${generative.enabled ? ' viewing' : ''}`}
                onClick={() => setGenerativeConfig({ enabled: true })}
              >Generative</button>
              <div className="octave-control" title="Shift this track's notes by whole octaves — doesn't change the stored notes, just where they play back">
                <label>Octave</label>
                <button className="page-btn" disabled={octaveShift <= -2}
                  onClick={() => setOctaveShift(octaveShift - 1)}
                >−</button>
                <span className="octave-val">{octaveShift > 0 ? `+${octaveShift}` : octaveShift}</span>
                <button className="page-btn" disabled={octaveShift >= 2}
                  onClick={() => setOctaveShift(octaveShift + 1)}
                >+</button>
              </div>
            </div>
          )}

          {viewSection === 'track' && !showGenerative && (
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
              <button
                className="page-btn clear-seq-btn"
                onClick={clearCurrentPage}
                title="Clear all steps on this page"
              >Clear</button>
            </div>
          )}

          {viewSection === 'track' ? (
            <>
              {showGenerative ? (
                <GenerativeControls config={generative} onChange={setGenerativeConfig} />
              ) : (
                <PianoRoll
                  steps={steps} visibleNotes={visibleNotes}
                  rootNote={rootNote} scroll={scroll} maxScroll={maxScroll}
                  currentStep={isPlaying && currentPagePlaying[activeTrack] === currentPage ? currentStep : -1}
                  lastStep={isCurrentPageLastEnabled ? lastStep : undefined}
                  onSetLastStep={setLastStep}
                  rowLabels={activeTrack === 'drums' ? DRUM_ROW_LABELS : undefined}
                  noStrum={activeTrack === 'drums' || activeTrack === 'juno'}
                  showVelocity={activeTrack === 'drums'}
                  onToggleNote={toggleNote} onToggleStrumDir={toggleStrumDir}
                  onSetProbability={setProbability}
                  onSetVelocity={setVelocity}
                  onSetWander={activeTrack === 'drums' ? undefined : setWander}
                  onToggleTie={activeTrack === 'plaits' ? toggleTie : undefined}
                  onSetGate={activeTrack === 'juno' ? setGate : undefined}
                  onScrollUp={scrollUp} onScrollDown={scrollDown}
                />
              )}

              <div className="track-controls-row">
                <div className="track-controls-main">
                  {active.kind === 'rings' && (
                    <RingsControls
                      trackId={activeTrack as RingsTrackId}
                      model={active.model} params={active.params} lfo={active.lfo} exciter={active.exciter}
                      presets={RINGS_PRESETS}
                      onPresetLoad={p => loadRingsPreset(activeTrack, p)}
                      onModelChange={m => updateActiveParams(p => p.kind === 'rings' ? ({ ...p, model: m }) : p)}
                      onParamChange={(i, v) => updateActiveParams(p => {
                        if (p.kind !== 'rings') return p;
                        const n = [...p.params] as [number,number,number,number]; n[i] = v;
                        return { ...p, params: n };
                      })}
                      onLfoChange={(i, u) => updateActiveParams(p => p.kind === 'rings'
                        ? ({ ...p, lfo: p.lfo.map((l, idx) => idx === i ? { ...l, ...u } : l) }) : p)}
                      onExciterChange={u => updateActiveParams(p => p.kind === 'rings'
                        ? ({ ...p, exciter: { ...p.exciter, ...u } }) : p)}
                      generativeEnabled={generative.enabled}
                    />
                  )}
                  {active.kind === 'plaits' && (
                    <PlaitsControls
                      engine={active.engine} params={active.params} lfo={active.lfo} envelope={active.envelope}
                      filter={active.filter}
                      presets={PLAITS_PRESETS}
                      onPresetLoad={loadPlaitsPreset}
                      onEngineChange={eg => updateActiveParams(p => p.kind === 'plaits' ? ({ ...p, engine: eg }) : p)}
                      onParamChange={(i, v) => updateActiveParams(p => {
                        if (p.kind !== 'plaits') return p;
                        const n = [...p.params] as [number,number,number,number,number]; n[i] = v;
                        return { ...p, params: n };
                      })}
                      onLfoChange={(i, u) => updateActiveParams(p => p.kind === 'plaits'
                        ? ({ ...p, lfo: p.lfo.map((l, idx) => idx === i ? { ...l, ...u } : l) }) : p)}
                      onEnvelopeChange={u => updateActiveParams(p => p.kind === 'plaits'
                        ? ({ ...p, envelope: { ...p.envelope, ...u } }) : p)}
                      onFilterChange={u => updateActiveParams(p => p.kind === 'plaits'
                        ? ({ ...p, filter: { ...p.filter, ...u } }) : p)}
                      generativeEnabled={generative.enabled}
                    />
                  )}
                  {active.kind === 'juno' && (
                    <JunoControls
                      patch={active.patch} bank={active.bank}
                      presets60={JUNO60_PRESETS} presets106={JUNO106_PRESETS}
                      onPatchChange={patch => updateActiveParams(p => p.kind === 'juno' ? ({ ...p, patch }) : p)}
                      onBankChange={bank => updateActiveParams(p => p.kind === 'juno' ? ({ ...p, bank }) : p)}
                    />
                  )}
                  {active.kind === 'drums' && (
                    <>
                      <DrumControls
                        voices={active.voices}
                        presets={DRUM_PRESETS}
                        onPresetLoad={loadDrumPreset}
                        onVoiceChange={(voice, field, value) => updateActiveParams(p => p.kind === 'drums'
                          ? ({ ...p, voices: { ...p.voices, [voice]: { ...p.voices[voice], [field]: value } } })
                          : p)}
                      />
                      <GridsControls
                        state={gridsUi}
                        onChange={next => setGridsUi(prev => ({ ...prev, ...next }))}
                        onGenerate={handleGenerateDrums}
                      />
                    </>
                  )}
                </div>
                <div className="send-row">
                  <div className="panel-name">Sends</div>
                  <div className="sends-grid">
                    <Knob value={active.volume} min={0} max={1.5} label="Volume" size={68}
                      onChange={v => setVolumeFor(activeTrack, v)} />
                    <Knob value={active.delaySend} min={0} max={1} label="Delay" size={68}
                      onChange={v => setSendFor(activeTrack, 'delay', v)} />
                    <Knob value={active.reverbSend} min={0} max={1} label="Reverb" size={68}
                      onChange={v => setSendFor(activeTrack, 'reverb', v)} />
                    <Knob value={active.cloudsSend} min={0} max={1} label="Texture" size={68}
                      onChange={v => setSendFor(activeTrack, 'clouds', v)} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="master-layout">
              <div className="waveform-section">
                <WaveformMeter />
              </div>

              {/* Delay | Texture | Reverb | Mixer — four side-by-side
                  columns divided by 1px vertical rules, per master_layout.html. */}
              <div className="master-columns">
                <div className="master-fx-col">
                  <DelayControls
                    bpm={bpm} division={delayDivision} mix={delayMix}
                    feedback={delayFeedback} filter={delayFilter}
                    onDivisionChange={setDelayDivision} onMixChange={setDelayMix}
                    onFeedbackChange={setDelayFeedback} onFilterChange={setDelayFilter}
                  />
                </div>
                <div className="master-col-divider" />
                <div className="master-fx-col">
                  <CloudsControls
                    state={cloudsUi}
                    presets={TEXTURE_PRESETS}
                    onPresetLoad={loadTexturePreset}
                    onChange={next => setCloudsUi(prev => ({ ...prev, ...next }))}
                  />
                </div>
                <div className="master-col-divider" />
                <div className="master-fx-col">
                  <ReverbControls
                    activeType={reverbType} wet={reverbMix}
                    decay={reverbDecay} preDelay={reverbPreDelay} tone={reverbTone}
                    onTypeChange={setReverbType} onWetChange={setReverbMix}
                    onDecayChange={setReverbDecay} onPreDelayChange={setReverbPreDelay}
                    onToneChange={setReverbTone}
                  />
                </div>
                <div className="master-col-divider" />

                {/* Vertical mixer faders */}
                <div className="master-mixer-col">
                  <div className="mixer-section-label">Mixer</div>
                  <div className="mixer-faders">
                    {/* Master volume — taller, neutral style */}
                    <div className="mixer-fader-wrap">
                      <Slider vertical className="v-fader-master"
                        min={0} max={1.5} step={0.01}
                        value={masterVolume}
                        onChange={v => { setMasterVolume(v); Engine.setMasterVolume(v); }}
                      />
                      <div className="mixer-fader-label mixer-fader-label-master">Master</div>
                    </div>

                    {/* Per-track faders, color-coded */}
                    {TRACK_IDS.map(id => (
                      <div key={id} className="mixer-fader-wrap">
                        <Slider vertical
                          accent={TRACK_FADER_COLORS[id][0]}
                          min={0} max={1.5} step={0.01}
                          value={trackParams[id].volume}
                          onChange={v => setVolumeFor(id, v)}
                        />
                        <button
                          className={`mixer-mute-btn${mutedTracks[id] ? ' muted' : ''}`}
                          onClick={() => toggleMute(id)}
                          title={mutedTracks[id] ? `Unmute ${TRACK_LABELS[id]}` : `Mute ${TRACK_LABELS[id]}`}
                        >M</button>
                        <div className="mixer-fader-label" style={{ color: TRACK_FADER_COLORS[id][0] }}>
                          {TRACK_LABELS[id]}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
