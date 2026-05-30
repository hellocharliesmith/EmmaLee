import { useState } from 'react';
import { initAudio, setReverbWet } from './audio/engine';
import { useSequencer } from './hooks/useSequencer';
import { Sequencer } from './components/Sequencer';
import { RingsControls } from './components/RingsControls';
import './App.css';

export default function App() {
  const [audioStarted, setAudioStarted] = useState(false);
  const [reverbWet, setReverbWetState] = useState(0.45);
  const { steps, bpm, isPlaying, currentStep, start, stop, toggleStep, setStepNote, updateBpm } = useSequencer();

  async function handlePlayStop() {
    console.log('[emma] play tapped, audioStarted:', audioStarted);
    if (!audioStarted) {
      const ctx = new AudioContext();
      console.log('[emma] AudioContext created, state:', ctx.state);
      try {
        await initAudio(ctx);
        setAudioStarted(true);
      } catch (err) {
        console.error('[emma] initAudio failed:', err);
        return;
      }
    }
    if (isPlaying) {
      stop();
    } else {
      start();
    }
  }

  function handleReverbChange(value: number) {
    setReverbWetState(value);
    setReverbWet(value);
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
      <div className="rings-controls">
        <div className="section-divider" />
        <div className="knob-row">
          <label>Reverb</label>
          <input
            type="range" min={0} max={1} step={0.01} value={reverbWet}
            onChange={e => handleReverbChange(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
