import { useState } from 'react';
import { initAudio } from './audio/engine';
import { useSequencer } from './hooks/useSequencer';
import { Sequencer } from './components/Sequencer';
import { RingsControls } from './components/RingsControls';
import { ReverbControls } from './components/ReverbControls';
import { DelayControls } from './components/DelayControls';
import './App.css';

export default function App() {
  const [audioStarted, setAudioStarted] = useState(false);
  const { steps, bpm, isPlaying, currentStep, start, stop, toggleStep, setStepNote, updateBpm } = useSequencer();

  async function handlePlayStop() {
    if (!audioStarted) {
      const ctx = new AudioContext();
      await initAudio(ctx);
      setAudioStarted(true);
    }
    if (isPlaying) {
      stop();
    } else {
      start();
    }
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
          <input
            type="range" min={40} max={200} value={bpm}
            onChange={e => updateBpm(parseInt(e.target.value))}
          />
          <span className="bpm-val">{bpm}</span>
        </div>
      </div>
      <Sequencer steps={steps} currentStep={currentStep} onToggle={toggleStep} onNoteChange={setStepNote} />
      <RingsControls />
      <DelayControls bpm={bpm} />
      <ReverbControls />
    </div>
  );
}
