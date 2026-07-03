import type { SongState } from './types';

export interface DemoSong {
  id: string;
  name: string;
  state: SongState;
}

export const DEMO_SONGS: DemoSong[] = [
  {
    id: 'demo-1',
    name: 'Demo 1',
    state: {
      version: 3,
      bpm: 72,
      tracks: {
        ringsA: {
          pages: [
            [{"notes":[64],"strumDown":false},null,null,null,null,null,null,null,{"notes":[71],"strumDown":false},null,null,null,null,null,{"notes":[69],"strumDown":false},null,null,null,null,null,null,null,null,{"notes":[81],"strumDown":false},{"notes":[79],"strumDown":false},null,null,null,null,null,null,null],
            [{"notes":[64],"strumDown":false},null,null,null,null,null,null,null,{"notes":[71],"strumDown":false},null,null,null,null,null,{"notes":[74],"strumDown":false},null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
            Array(32).fill(null),
            Array(32).fill(null),
          ],
          enabledPages: [true, true, false, false],
          scale: 'major',
          rootNote: 0,
          scrollRow: 7,
          model: 1,
          structure: 0.11,
          brightness: 0.24,
          damping: 0.44,
          position: 0.25,
          lfo: [
            { on: false, wave: 'sine',   rate: 0.5,    depth: 0.15 },
            { on: true,  wave: 'random', rate: 1.6,    depth: 0.07083333333333333 },
            { on: true,  wave: 'random', rate: 0.8975, depth: 0.075 },
            { on: false, wave: 'sine',   rate: 0.5,    depth: 0.15 },
          ],
          volume: 0.85,
          delaySend: 0.5,
          reverbSend: 0.575,
        },
        ringsB: {
          pages: [
            [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,{"notes":[67,69,72,76],"strumDown":false},null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,{"notes":[67,72,76,81],"strumDown":false},null,null,null,null,null,null,null,null,null,null,null,null,null],
            Array(32).fill(null),
            Array(32).fill(null),
          ],
          enabledPages: [true, true, false, false],
          scale: 'major',
          rootNote: 0,
          scrollRow: 6,
          model: 0,
          structure: 0.2,
          brightness: 0.3,
          damping: 0.59,
          position: 0.25,
          lfo: [
            { on: false, wave: 'sine',   rate: 0.5, depth: 0.15 },
            { on: false, wave: 'sine',   rate: 1.6, depth: 0.1 },
            { on: false, wave: 'sine',   rate: 0.5, depth: 0.15 },
            { on: true,  wave: 'random', rate: 0.5, depth: 0.09166666666666666 },
          ],
          volume: 0.2625,
          delaySend: 0.20833333333333334,
          reverbSend: 0.675,
        },
        plaits: {
          pages: [
            [{"notes":[48],"strumDown":false},null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,{"notes":[57],"strumDown":false,"prob":0.33},{"notes":[55],"strumDown":false,"prob":0.5}],
            Array(32).fill(null),
            Array(32).fill(null),
          ],
          enabledPages: [true, true, false, false],
          scale: 'major',
          rootNote: 0,
          scrollRow: 16,
          engine: 10,
          harmonics: 0,
          timbre: 0.5,
          morph: 0.21,
          decay: 0.9,
          lpgColour: 0,
          volume: 0.21249999999999994,
          delaySend: 0.7583333333333333,
          reverbSend: 0.31666666666666665,
        },
        drums: {
          pages: [
            Array(32).fill(null),
            Array(32).fill(null),
            Array(32).fill(null),
            Array(32).fill(null),
          ],
          enabledPages: [true, false, false, false],
          scale: 'major',
          rootNote: 0,
          scrollRow: 7,
          voices: {
            drumHihat: { tone: 0.5, decay: 0.25, volume: 1 },
            drumSnare:  { tone: 0.5, decay: 0.45, volume: 1 },
            drumKick:   { tone: 0.5, decay: 0.5,  volume: 1 },
          },
          volume: 0.85,
          delaySend: 0.5,
          reverbSend: 0.5,
        },
      },
      delayDivision: '1/8',
      delayMix: 0.24,
      delayFeedback: 0.23,
      delayFilter: 2800,
      reverbType: 'algo',
      reverbMix: 0.51,
      reverbDecay: 0.69,
      reverbPreDelay: 0.02,
      reverbTone: 6000,
    },
  },
];
