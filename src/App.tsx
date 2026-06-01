import { useState, useEffect } from 'react';
import { initAudio } from './audio/engine';
import { useSequencer } from './hooks/useSequencer';
import { PianoRoll } from './components/PianoRoll';
import { WaveformMeter } from './components/WaveformMeter';
import { RingsControls } from './components/RingsControls';
import { DelayControls } from './components/DelayControls';
import { ReverbControls } from './components/ReverbControls';
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

export default function App() {
  const [audioStarted, setAudioStarted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);

  useEffect(() => {
    setUnsupported(checkSupport());
  }, []);

  const {
    steps, visibleNotes, scale, rootNote, scroll, maxScroll,
    bpm, isPlaying, currentStep,
    setStep, setScale, setRootNote, scrollUp, scrollDown,
    start, stop, updateBpm,
  } = useSequencer();

  async function handlePlayStop() {
    if (unsupported) return;
    setAudioError(null);
    if (!audioStarted) {
      const ctx = new AudioContext();
      try {
        await initAudio(ctx);
        setAudioStarted(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setAudioError(`Audio failed to start: ${msg}`);
        return;
      }
    }
    if (isPlaying) stop(); else start();
  }

  return (
    <div className="app">
      <h1>Emma Lee</h1>

      {unsupported && (
        <div className="audio-banner error">
          ⚠ {unsupported}
        </div>
      )}

      <div className="transport">
        <button
          className={`play-btn${isPlaying ? ' playing' : ''}${unsupported ? ' disabled' : ''}`}
          onClick={handlePlayStop}
          disabled={!!unsupported}
        >
          {isPlaying ? '■ Stop' : '▶ Play'}
        </button>
        <div className="bpm-row">
          <label>BPM</label>
          <input type="range" min={40} max={200} value={bpm}
            onChange={e => updateBpm(parseInt(e.target.value))} />
          <span className="bpm-val">{bpm}</span>
        </div>
      </div>

      {audioError && (
        <div className="audio-banner error">
          ⚠ {audioError}
          <button className="banner-dismiss" onClick={() => setAudioError(null)}>✕</button>
        </div>
      )}

      <PianoRoll
        steps={steps}
        visibleNotes={visibleNotes}
        scale={scale}
        rootNote={rootNote}
        scroll={scroll}
        maxScroll={maxScroll}
        currentStep={currentStep}
        onSetStep={setStep}
        onSetScale={setScale}
        onSetRootNote={setRootNote}
        onScrollUp={scrollUp}
        onScrollDown={scrollDown}
      />

      <WaveformMeter />
      <RingsControls />

      <div className="fx-row">
        <DelayControls bpm={bpm} />
        <ReverbControls />
      </div>
    </div>
  );
}
