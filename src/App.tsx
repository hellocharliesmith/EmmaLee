import { useState } from 'react';
import { initAudio } from './audio/engine';
import { useSequencer } from './hooks/useSequencer';
import { PianoRoll } from './components/PianoRoll';
import { WaveformMeter } from './components/WaveformMeter';
import { RingsControls } from './components/RingsControls';
import { DelayControls } from './components/DelayControls';
import { ReverbControls } from './components/ReverbControls';
import './App.css';

export default function App() {
  const [audioStarted, setAudioStarted] = useState(false);
  const {
    steps, visibleNotes, scale, rootNote, scroll, maxScroll,
    bpm, isPlaying, currentStep,
    setStep, setScale, setRootNote, scrollUp, scrollDown,
    start, stop, updateBpm,
  } = useSequencer();

  async function handlePlayStop() {
    if (!audioStarted) {
      const ctx = new AudioContext();
      await initAudio(ctx);
      setAudioStarted(true);
    }
    if (isPlaying) stop(); else start();
  }

  return (
    <div className="app">
      <h1>Emma Lee</h1>

      <div className="transport">
        <button className={`play-btn${isPlaying ? ' playing' : ''}`} onClick={handlePlayStop}>
          {isPlaying ? '■ Stop' : '▶ Play'}
        </button>
        <div className="bpm-row">
          <label>BPM</label>
          <input type="range" min={40} max={200} value={bpm}
            onChange={e => updateBpm(parseInt(e.target.value))} />
          <span className="bpm-val">{bpm}</span>
        </div>
      </div>

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
