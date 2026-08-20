import type { SongState } from './types';
import { NO_LFO, JUNO60_PRESETS } from './presets';

// Both demos predate the Juno track (added 2026-08-19) — same empty-pages
// default `makeDefaultTrackState` gives a fresh Juno track, loaded with the
// first factory patch ("Strings 1").
const DEMO_JUNO_TRACK = {
  pages: [Array(32).fill(null), Array(32).fill(null), Array(32).fill(null), Array(32).fill(null)],
  enabledPages: [true, false, false, false],
  scale: 'major' as const,
  rootNote: 0,
  scrollRow: 7,
  volume: 0.85,
  delaySend: 0.5,
  reverbSend: 0.5,
  patch: JUNO60_PRESETS[0],
  bank: '60' as const,
};

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
      version: 4,
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
          lfo: NO_LFO,
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
            drumHihat: { tone: 0.5, decay: 0.25, volume: 1, character: 0.5, blend: 0 },
            drumSnare:  { tone: 0.5, decay: 0.45, volume: 1, character: 0.5, blend: 0 },
            drumKick:   { tone: 0.5, decay: 0.5,  volume: 1, character: 0.5, blend: 0 },
          },
          volume: 0.85,
          delaySend: 0.5,
          reverbSend: 0.5,
        },
        juno: DEMO_JUNO_TRACK,
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
  {
    id: 'demo-2',
    name: 'Phased and Bent',
    state: {
      "version": 4,
      "bpm": 88,
      "tracks": {
        "ringsA": {
          "pages": [
            [
              {
                "notes": [
                  60
                ],
                "strumDown": false
              },
              {
                "notes": [
                  61
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              {
                "notes": [
                  72
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  60
                ],
                "strumDown": false
              },
              {
                "notes": [
                  61
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              {
                "notes": [
                  72
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  60
                ],
                "strumDown": false
              },
              {
                "notes": [
                  61
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              {
                "notes": [
                  72
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  60
                ],
                "strumDown": false
              },
              {
                "notes": [
                  61
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              {
                "notes": [
                  72
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  60
                ],
                "strumDown": false
              },
              {
                "notes": [
                  61
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              {
                "notes": [
                  72
                ],
                "strumDown": false
              },
              {
                "notes": [
                  75
                ],
                "strumDown": false
              },
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ]
          ],
          "enabledPages": [
            true,
            false,
            false,
            false
          ],
          "lastStep": 31,
          "scale": "major",
          "rootNote": 8,
          "scrollRow": 14,
          "model": 0,
          "structure": 0.31,
          "brightness": 0.25,
          "damping": 0.29,
          "position": 0.28,
          "lfo": [
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            },
            {
              "on": true,
              "wave": "sine",
              "rate": 1.6,
              "depth": 0.0708
            },
            {
              "on": true,
              "wave": "random",
              "rate": 2.189375,
              "depth": 0.09583333333333333
            },
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            }
          ],
          "volume": 0.85,
          "delaySend": 0,
          "reverbSend": 0.32499999999999996,
          "cloudsSend": 0.4
        },
        "ringsB": {
          "pages": [
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  60,
                  63,
                  67,
                  70
                ],
                "strumDown": false,
                "prob": 0.75
              },
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  56,
                  61,
                  65,
                  70
                ],
                "strumDown": false,
                "prob": 0.75
              },
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  58,
                  63,
                  65,
                  68
                ],
                "strumDown": false,
                "prob": 0.75
              },
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  56,
                  60,
                  63,
                  67
                ],
                "strumDown": false,
                "prob": 0.33
              },
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ]
          ],
          "enabledPages": [
            true,
            true,
            true,
            true
          ],
          "lastStep": 23,
          "scale": "major",
          "rootNote": 8,
          "scrollRow": 16,
          "model": 1,
          "structure": 0.12,
          "brightness": 0.14,
          "damping": 0.63,
          "position": 0.25,
          "lfo": [
            {
              "on": true,
              "wave": "random",
              "rate": 0.8975,
              "depth": 0.05
            },
            {
              "on": false,
              "wave": "random",
              "rate": 1.6,
              "depth": 0.0708
            },
            {
              "on": false,
              "wave": "random",
              "rate": 0.8975,
              "depth": 0.075
            },
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            }
          ],
          "volume": 0.3624999999999998,
          "delaySend": 0.30416666666666664,
          "reverbSend": 0.8125,
          "cloudsSend": 0.4
        },
        "plaits": {
          "pages": [
            [
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  70
                ],
                "strumDown": false
              },
              {
                "notes": [
                  75
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              {
                "notes": [
                  73
                ],
                "strumDown": false
              },
              {
                "notes": [
                  79
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              {
                "notes": [
                  63
                ],
                "strumDown": false
              },
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              {
                "notes": [
                  73
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              {
                "notes": [
                  61
                ],
                "strumDown": false
              },
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              {
                "notes": [
                  72
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              {
                "notes": [
                  60
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  70
                ],
                "strumDown": false
              },
              null
            ],
            [
              null,
              null,
              {
                "notes": [
                  58
                ],
                "strumDown": false
              },
              {
                "notes": [
                  63
                ],
                "strumDown": false
              },
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              {
                "notes": [
                  58
                ],
                "strumDown": false
              },
              {
                "notes": [
                  63
                ],
                "strumDown": false
              },
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              {
                "notes": [
                  58
                ],
                "strumDown": false
              },
              {
                "notes": [
                  63
                ],
                "strumDown": false
              },
              {
                "notes": [
                  68
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              {
                "notes": [
                  58
                ],
                "strumDown": false
              },
              {
                "notes": [
                  63
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ]
          ],
          "enabledPages": [
            true,
            true,
            false,
            false
          ],
          "lastStep": 21,
          "scale": "major",
          "rootNote": 8,
          "scrollRow": 15,
          "engine": 8,
          "harmonics": 0.48,
          "timbre": 0,
          "morph": 0,
          "decay": 0.12,
          "lpgColour": 0,
          "volume": 0.4499999999999999,
          "delaySend": 0,
          "reverbSend": 0.4666666666666667,
          "cloudsSend": 0.4,
          "lfo": [
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            },
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            },
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            },
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            }
          ]
        },
        "drums": {
          "pages": [
            [
              {
                "notes": [
                  2
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "prob": 0.5,
                "velocity": 0.5
              },
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "prob": 0.33,
                "velocity": 0.25
              },
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "prob": 0.5,
                "velocity": 0.75
              },
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  2
                ],
                "strumDown": false,
                "prob": 0.5,
                "velocity": 0.5
              },
              null,
              {
                "notes": [
                  2
                ],
                "strumDown": false,
                "prob": 0.33,
                "velocity": 0.75
              },
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ],
            [
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              null
            ]
          ],
          "enabledPages": [
            true,
            false,
            false,
            false
          ],
          "lastStep": 23,
          "scale": "major",
          "rootNote": 0,
          "scrollRow": 7,
          "voices": {
            "drumHihat": {
              "tone": 0.22916666666666663,
              "decay": 0.0875,
              "volume": 0.11249999999999996,
              "character": 0.5,
              "blend": 0
            },
            "drumSnare": {
              "tone": 0.5,
              "decay": 0.45,
              "volume": 1,
              "character": 0.5,
              "blend": 0
            },
            "drumKick": {
              "tone": 0.37083333333333335,
              "decay": 0.3416666666666667,
              "volume": 0.5166666666666666,
              "character": 0.5,
              "blend": 0
            }
          },
          "volume": 0,
          "delaySend": 0.6583333333333333,
          "reverbSend": 0.27499999999999997,
          "cloudsSend": 0.4
        },
        "juno": DEMO_JUNO_TRACK
      },
      "delayDivision": "1/8",
      "delayMix": 0.24,
      "delayFeedback": 0.23,
      "delayFilter": 2800,
      "reverbType": "algo",
      "reverbMix": 0.46,
      "reverbDecay": 0.77,
      "reverbPreDelay": 0.036,
      "reverbTone": 10000
    },
  },
];
