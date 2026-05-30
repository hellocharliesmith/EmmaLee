import { useState, useRef, useCallback, useEffect } from 'react';
import * as Tone from 'tone';
import { triggerNote } from '../audio/engine';

export interface Step {
  active: boolean;
  note: number;
}

const DEFAULT_NOTES = [60, 62, 64, 65, 67, 69, 71, 72, 60, 62, 64, 65, 67, 69, 71, 72];

function makeDefaultSteps(): Step[] {
  return Array.from({ length: 16 }, (_, i) => ({
    active: [0, 4, 8, 12].includes(i),
    note: DEFAULT_NOTES[i],
  }));
}

export function useSequencer() {
  const [steps, setSteps] = useState<Step[]>(makeDefaultSteps);
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const sequenceRef = useRef<Tone.Sequence | null>(null);

  // Always-current ref so the running sequence closure sees live edits
  const stepsRef = useRef(steps);
  useEffect(() => { stepsRef.current = steps; }, [steps]);

  const start = useCallback(() => {
    Tone.getTransport().bpm.value = bpm;

    sequenceRef.current = new Tone.Sequence(
      (time, stepIndex) => {
        const step = stepsRef.current[stepIndex as number];
        Tone.getDraw().schedule(() => {
          setCurrentStep(stepIndex as number);
          if (step.active) triggerNote(step.note);
        }, time);
      },
      Array.from({ length: 16 }, (_, i) => i),
      '16n'
    );

    sequenceRef.current.start(0);
    Tone.getTransport().start();
    setIsPlaying(true);
  }, [bpm]);

  const stop = useCallback(() => {
    Tone.getTransport().stop();
    sequenceRef.current?.dispose();
    sequenceRef.current = null;
    setCurrentStep(-1);
    setIsPlaying(false);
  }, []);

  const toggleStep = useCallback((index: number) => {
    setSteps(prev => prev.map((s, i) =>
      i === index ? { ...s, active: !s.active } : s
    ));
  }, []);

  const setStepNote = useCallback((index: number, note: number) => {
    setSteps(prev => prev.map((s, i) =>
      i === index ? { ...s, note } : s
    ));
  }, []);

  const updateBpm = useCallback((value: number) => {
    setBpm(value);
    Tone.getTransport().bpm.value = value;
  }, []);

  return { steps, bpm, isPlaying, currentStep, start, stop, toggleStep, setStepNote, updateBpm };
}
