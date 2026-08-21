import type { SongState } from './types';
import { NO_LFO, JUNO60_PRESETS } from './presets';

// Both demos predate the Juno track (added 2026-08-19) — same empty-pages
// default `makeDefaultTrackState` gives a fresh Juno track, loaded with the
// first factory patch ("Strings 1"). rootNote is a parameter, not hardcoded
// to 0 — Demo 2 ("Phased and Bent") actually plays in rootNote 8, and a
// fixed 0 here left Juno silently out of key with the rest of that song
// (bug, found 2026-08-20 — see App.tsx's withDefaultJuno for the same fix
// applied to arbitrary user saves).
function makeDemoJunoTrack(rootNote: number) {
  return {
    pages: [Array(32).fill(null), Array(32).fill(null), Array(32).fill(null), Array(32).fill(null)],
    enabledPages: [true, false, false, false],
    scale: 'major' as const,
    rootNote,
    scrollRow: 7,
    volume: 0.85,
    delaySend: 0.5,
    reverbSend: 0.5,
    patch: JUNO60_PRESETS[0],
    bank: '60' as const,
  };
}

export interface DemoSong {
  id: string;
  name: string;
  state: SongState;
}

export const DEMO_SONGS: DemoSong[] = [
  {
    id: 'demo-1',
    name: 'Simple Song',
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
        juno: makeDemoJunoTrack(0),
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
    name: 'The Bends',
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
        "juno": makeDemoJunoTrack(8)
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
  {
    id: 'demo-3',
    name: 'Reflective Sparkle',
    state: {
      "version": 4,
      "bpm": 61,
      "tracks": {
        "ringsA": {
          "pages": [
            [
              {
                "notes": [
                  57,
                  67,
                  72,
                  74
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
                  65,
                  74,
                  76,
                  79
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
          "lastStep": 31,
          "scale": "major",
          "rootNote": 0,
          "scrollRow": 13,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "octaveShift": 0,
          "model": 0,
          "structure": 0.22,
          "brightness": 0.2,
          "damping": 0.76,
          "position": 0.25,
          "lfo": [
            {
              "on": false,
              "wave": "random",
              "rate": 1.1625,
              "depth": 0.2020833333333333
            },
            {
              "on": true,
              "wave": "random",
              "rate": 2.13,
              "depth": 0.060416666666666674
            },
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            },
            {
              "on": true,
              "wave": "random",
              "rate": 4.0443750000000005,
              "depth": 0.14374999999999996
            }
          ],
          "exciter": {
            "model": "internal",
            "timbre": 0.6,
            "parameter": 0.5,
            "gateMs": 80,
            "level": 1,
            "attackMs": 0
          },
          "volume": 0.85,
          "delaySend": 0.5,
          "reverbSend": 0.7458333333333333,
          "cloudsSend": 0.4
        },
        "ringsB": {
          "pages": [
            [
              null,
              null,
              null,
              null,
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              null,
              null,
              {
                "notes": [
                  79
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
              null,
              null,
              null,
              {
                "notes": [
                  79,
                  81,
                  84
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
          "rootNote": 0,
          "scrollRow": 4,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "octaveShift": 0,
          "model": 1,
          "structure": 0.28,
          "brightness": 0.24,
          "damping": 0.74,
          "position": 0.46,
          "lfo": [
            {
              "on": true,
              "wave": "sine",
              "rate": 0.96375,
              "depth": 0.054166666666666655
            },
            {
              "on": false,
              "wave": "random",
              "rate": 1.6,
              "depth": 0.1
            },
            {
              "on": true,
              "wave": "sine",
              "rate": 0.2520249859028403,
              "depth": 0.09375
            },
            {
              "on": true,
              "wave": "random",
              "rate": 0.5,
              "depth": 0.21458333333333332
            }
          ],
          "exciter": {
            "model": "internal",
            "timbre": 0.6,
            "parameter": 0.5,
            "gateMs": 80,
            "level": 1,
            "attackMs": 0
          },
          "volume": 0.36249999999999993,
          "delaySend": 0.7208333333333333,
          "reverbSend": 0.6208333333333333,
          "cloudsSend": 0.4
        },
        "plaits": {
          "pages": [
            [
              {
                "notes": [
                  57
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
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  52
                ],
                "strumDown": false,
                "prob": 0.66
              },
              {
                "notes": [
                  53
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
              null,
              null,
              null,
              {
                "notes": [
                  55
                ],
                "strumDown": false,
                "prob": 0.5
              },
              {
                "notes": [
                  60
                ],
                "strumDown": false,
                "prob": 0.66
              },
              {
                "notes": [
                  59
                ],
                "strumDown": false,
                "prob": 0.75
              }
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
          "rootNote": 0,
          "scrollRow": 16,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "octaveShift": 0,
          "engine": 10,
          "harmonics": 0,
          "timbre": 0.28,
          "morph": 0.84,
          "decay": 0.77,
          "lpgColour": 0,
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
          ],
          "envelope": {
            "attackMs": 0,
            "sustain": 0
          },
          "filter": {
            "enabled": false,
            "cutoff": 1,
            "resonance": 0
          },
          "volume": 0.51,
          "delaySend": 0.6041666666666666,
          "reverbSend": 0.5,
          "cloudsSend": 0.4
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
              null,
              null,
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "velocity": 0.5
              },
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "prob": 1,
                "velocity": 0.75
              },
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "velocity": 0.25
              },
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "velocity": 0.5
              },
              {
                "notes": [
                  1
                ],
                "strumDown": false,
                "velocity": 0.25
              },
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
                "prob": 0.66,
                "velocity": 0.5
              },
              null,
              null,
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "velocity": 0.25
              },
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "velocity": 0.5
              },
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "velocity": 0.25
              },
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
                "prob": 1,
                "velocity": 0.75
              },
              {
                "notes": [
                  2
                ],
                "strumDown": false,
                "prob": 1,
                "velocity": 0.5
              }
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
          "rootNote": 0,
          "scrollRow": 7,
          "voices": {
            "drumHihat": {
              "tone": 0.22083333333333333,
              "decay": 0.10416666666666666,
              "volume": 1,
              "character": 0.5,
              "blend": 0
            },
            "drumSnare": {
              "tone": 0.19999999999999996,
              "decay": 0.3375,
              "volume": 1,
              "character": 0.5,
              "blend": 0
            },
            "drumKick": {
              "tone": 0.3375,
              "decay": 0.7208333333333334,
              "volume": 1,
              "character": 0.5,
              "blend": 0
            }
          },
          "volume": 0.6625,
          "delaySend": 0.48333333333333334,
          "reverbSend": 0.25,
          "cloudsSend": 0.4
        },
        "juno": {
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
          "rootNote": 0,
          "scrollRow": 7,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "octaveShift": 0,
          "patch": {
            "name": "Strings 1",
            "vca": 0.5,
            "vcaType": "env",
            "lfo": {
              "autoTrigger": true,
              "frequency": 0.6,
              "delay": 0
            },
            "dco": {
              "range": 1,
              "saw": true,
              "pulse": false,
              "sub": false,
              "subAmount": 0,
              "noise": 0,
              "pwm": 0,
              "pwmMod": "l",
              "lfo": 0
            },
            "hpf": 0,
            "vcf": {
              "frequency": 0.7,
              "resonance": 0,
              "modPositive": true,
              "envMod": 0,
              "lfoMod": 0,
              "keyMod": 1
            },
            "env": {
              "attack": 0.4,
              "decay": 0,
              "sustain": 1,
              "release": 0.45
            },
            "chorus": 1
          },
          "bank": "60",
          "volume": 0.85,
          "delaySend": 0.5,
          "reverbSend": 0.5,
          "cloudsSend": 0.4
        }
      },
      "delayDivision": "1/8",
      "delayMix": 0.2,
      "delayFeedback": 0.16,
      "delayFilter": 2800,
      "reverbType": "digital",
      "reverbMix": 0.5,
      "reverbDecay": 0.66,
      "reverbPreDelay": 0.02,
      "reverbTone": 8600
    },
  },
  {
    id: 'demo-4',
    name: 'Peaceful Highlife',
    state: {
      "version": 4,
      "bpm": 110,
      "tracks": {
        "ringsA": {
          "pages": [
            [
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  68
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
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  68
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
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  68
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
              {
                "notes": [
                  65
                ],
                "strumDown": false
              },
              {
                "notes": [
                  65
                ],
                "strumDown": false
              }
            ],
            [
              null,
              {
                "notes": [
                  70
                ],
                "strumDown": false
              },
              {
                "notes": [
                  70
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  70
                ],
                "strumDown": false
              },
              {
                "notes": [
                  70
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  68
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
            true,
            false,
            false
          ],
          "lastStep": 15,
          "scale": "major",
          "rootNote": 8,
          "scrollRow": 12,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "octaveShift": 0,
          "model": 0,
          "structure": 0.35,
          "brightness": 0.25,
          "damping": 0.24,
          "position": 0.28,
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
              "rate": 1.6,
              "depth": 0.0708
            },
            {
              "on": true,
              "wave": "sine",
              "rate": 0.8975,
              "depth": 0.05416666666666666
            },
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            }
          ],
          "exciter": {
            "model": "internal",
            "timbre": 0.6,
            "parameter": 0.5,
            "gateMs": 80,
            "level": 1,
            "attackMs": 0
          },
          "volume": 0.85,
          "delaySend": 0.7041666666666666,
          "reverbSend": 0.6791666666666666,
          "cloudsSend": 0.8
        },
        "ringsB": {
          "pages": [
            [
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
                  68
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  72
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
              null,
              null,
              null,
              {
                "notes": [
                  70
                ],
                "strumDown": false
              },
              {
                "notes": [
                  70
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              {
                "notes": [
                  67
                ],
                "strumDown": false
              },
              null,
              null,
              null
            ],
            [
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
                  65
                ],
                "strumDown": false
              },
              null,
              null,
              null,
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
              {
                "notes": [
                  61
                ],
                "strumDown": false
              },
              {
                "notes": [
                  61
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  70
                ],
                "strumDown": false
              },
              {
                "notes": [
                  70
                ],
                "strumDown": false
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
          "lastStep": 31,
          "scale": "major",
          "rootNote": 8,
          "scrollRow": 13,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "octaveShift": 0,
          "model": 2,
          "structure": 0.11,
          "brightness": 0.24,
          "damping": 0.26,
          "position": 0.25,
          "lfo": [
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            },
            {
              "on": true,
              "wave": "random",
              "rate": 1.6,
              "depth": 0.0708
            },
            {
              "on": true,
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
          "exciter": {
            "model": "internal",
            "timbre": 0.6,
            "parameter": 0.5,
            "gateMs": 80,
            "level": 1,
            "attackMs": 0
          },
          "volume": 0.85,
          "delaySend": 0.5916666666666667,
          "reverbSend": 0.65,
          "cloudsSend": 0.7375
        },
        "plaits": {
          "pages": [
            [
              {
                "notes": [
                  56
                ],
                "strumDown": false,
                "prob": 0.66
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
              {
                "notes": [
                  65
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
              {
                "notes": [
                  60
                ],
                "strumDown": false,
                "prob": 0.5
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
              {
                "notes": [
                  63
                ],
                "strumDown": false,
                "prob": 0.66
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
            false
          ],
          "lastStep": 31,
          "scale": "major",
          "rootNote": 8,
          "scrollRow": 16,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "octaveShift": 0,
          "engine": 10,
          "harmonics": 0,
          "timbre": 0.23,
          "morph": 0.21,
          "decay": 0.7,
          "lpgColour": 0,
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
          ],
          "envelope": {
            "attackMs": 0,
            "sustain": 0
          },
          "filter": {
            "enabled": false,
            "cutoff": 1,
            "resonance": 0
          },
          "volume": 0.38749999999999996,
          "delaySend": 0.14583333333333334,
          "reverbSend": 0.3416666666666667,
          "cloudsSend": 0.2583333333333334
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
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  1,
                  2
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
              {
                "notes": [
                  2
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
              {
                "notes": [
                  2
                ],
                "strumDown": false
              },
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
          "lastStep": 31,
          "scale": "chromatic",
          "rootNote": 0,
          "scrollRow": 0,
          "voices": {
            "drumHihat": {
              "tone": 0.29966666666666664,
              "decay": 0.1,
              "volume": 0.15,
              "character": 0.5,
              "blend": 0
            },
            "drumSnare": {
              "tone": 0.06666666666666667,
              "decay": 0,
              "volume": 0.12950000000000003,
              "character": 0.5,
              "blend": 0
            },
            "drumKick": {
              "tone": 0.23716666666666664,
              "decay": 0.18333333333333335,
              "volume": 0.683,
              "character": 0.5,
              "blend": 0
            }
          },
          "volume": 0,
          "delaySend": 0,
          "reverbSend": 0.13749999999999998,
          "cloudsSend": 0
        },
        "juno": {
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
          "rootNote": 0,
          "scrollRow": 7,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "octaveShift": 0,
          "patch": {
            "name": "Strings 1",
            "vca": 0.5,
            "vcaType": "env",
            "lfo": {
              "autoTrigger": true,
              "frequency": 0.6,
              "delay": 0
            },
            "dco": {
              "range": 1,
              "saw": true,
              "pulse": false,
              "sub": false,
              "subAmount": 0,
              "noise": 0,
              "pwm": 0,
              "pwmMod": "l",
              "lfo": 0
            },
            "hpf": 0,
            "vcf": {
              "frequency": 0.7,
              "resonance": 0,
              "modPositive": true,
              "envMod": 0,
              "lfoMod": 0,
              "keyMod": 1
            },
            "env": {
              "attack": 0.4,
              "decay": 0,
              "sustain": 1,
              "release": 0.45
            },
            "chorus": 1
          },
          "bank": "60",
          "volume": 0.85,
          "delaySend": 0.5,
          "reverbSend": 0.5,
          "cloudsSend": 0.4
        }
      },
      "delayDivision": "1/16",
      "delayMix": 0.24,
      "delayFeedback": 0.23,
      "delayFilter": 2800,
      "reverbType": "plate",
      "reverbMix": 0.42,
      "reverbDecay": 0.69,
      "reverbPreDelay": 0.045,
      "reverbTone": 7600
    },
  },
  {
    id: 'demo-5',
    name: 'Anderson Spike',
    state: {
      "version": 4,
      "bpm": 65,
      "tracks": {
        "ringsA": {
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
          "rootNote": 0,
          "scrollRow": 12,
          "generative": {
            "enabled": true,
            "gateModel": "markov",
            "density": 0.18,
            "complexity": 0.51,
            "mutationProb": 0.15,
            "noteSet": [
              2,
              4,
              7,
              9
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "model": 1,
          "structure": 0.31,
          "brightness": 0.37,
          "damping": 0.62,
          "position": 0.5,
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
              "on": true,
              "wave": "sine",
              "rate": 0.16708126548956723,
              "depth": 0.09166666666666666
            },
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            }
          ],
          "exciter": {
            "model": "internal",
            "timbre": 0.6,
            "parameter": 0.5,
            "gateMs": 80,
            "level": 1,
            "attackMs": 0
          },
          "volume": 0.36249999999999993,
          "delaySend": 0.31111111111111045,
          "reverbSend": 0.7611111111111104,
          "cloudsSend": 0.6138888888888896
        },
        "ringsB": {
          "pages": [
            [
              {
                "notes": [
                  64,
                  67,
                  71,
                  74
                ],
                "strumDown": false,
                "prob": 0.5
              },
              null,
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  71
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
                  64
                ],
                "strumDown": false
              },
              {
                "notes": [
                  60
                ],
                "strumDown": false
              },
              {
                "notes": [
                  59
                ],
                "strumDown": false
              },
              {
                "notes": [
                  55
                ],
                "strumDown": false
              },
              null,
              null,
              {
                "notes": [
                  62,
                  65,
                  69,
                  72
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
              {
                "notes": [
                  53,
                  57,
                  60,
                  64
                ],
                "strumDown": false,
                "prob": 0.75
              },
              null,
              null,
              null,
              {
                "notes": [
                  57,
                  60,
                  64,
                  67
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
          "lastStep": 31,
          "scale": "major",
          "rootNote": 0,
          "scrollRow": 13,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "model": 0,
          "structure": 0.25,
          "brightness": 0.35,
          "damping": 0.62,
          "position": 0.28,
          "lfo": [
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            },
            {
              "on": false,
              "wave": "random",
              "rate": 0.7249560727764109,
              "depth": 0.0708
            },
            {
              "on": true,
              "wave": "random",
              "rate": 0.261509173346986,
              "depth": 0.07777777777777904
            },
            {
              "on": false,
              "wave": "sine",
              "rate": 0.5,
              "depth": 0.15
            }
          ],
          "exciter": {
            "model": "internal",
            "timbre": 0.6,
            "parameter": 0.5,
            "gateMs": 80,
            "level": 1,
            "attackMs": 0
          },
          "volume": 0.3999999999999999,
          "delaySend": 0.2055555555555562,
          "reverbSend": 0.8611111111111105,
          "cloudsSend": 0.5694444444444458
        },
        "plaits": {
          "pages": [
            [
              {
                "notes": [
                  57
                ],
                "strumDown": false
              },
              null,
              null,
              {
                "notes": [
                  57
                ],
                "strumDown": false
              },
              {
                "notes": [
                  57
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
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  62
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
              null,
              null
            ],
            [
              {
                "notes": [
                  57
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              {
                "notes": [
                  57
                ],
                "strumDown": false,
                "prob": 0.75
              },
              null,
              {
                "notes": [
                  57
                ],
                "strumDown": false,
                "prob": 0.5
              },
              null,
              null,
              {
                "notes": [
                  57
                ],
                "strumDown": false,
                "prob": 0.66
              },
              null,
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  50
                ],
                "strumDown": false
              },
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  50
                ],
                "strumDown": false,
                "prob": 0.66
              },
              {
                "notes": [
                  50
                ],
                "strumDown": false,
                "prob": 0.5
              },
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
          "lastStep": 31,
          "scale": "major",
          "rootNote": 0,
          "scrollRow": 16,
          "generative": {
            "enabled": false,
            "gateModel": "bernoulli",
            "density": 0.5,
            "complexity": 0.5,
            "mutationProb": 0.15,
            "noteSet": [
              0,
              4,
              7
            ],
            "octaveMin": 3,
            "octaveMax": 5,
            "gateBias": 0.5
          },
          "engine": 6,
          "harmonics": 0.41,
          "timbre": 0.1,
          "morph": 0.3,
          "decay": 0.72,
          "lpgColour": 0,
          "lfo": [
            {
              "on": false,
              "wave": "random",
              "rate": 0.5,
              "depth": 0.15
            },
            {
              "on": true,
              "wave": "random",
              "rate": 0.8138499421204091,
              "depth": 0.027777777777777145
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
          ],
          "envelope": {
            "attackMs": 1242.86,
            "sustain": 0.03
          },
          "volume": 0.53,
          "delaySend": 0.4,
          "reverbSend": 0.7055555555555562,
          "cloudsSend": 0.7638888888888895
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
                "velocity": 0.75
              },
              null,
              null,
              null,
              null,
              null,
              {
                "notes": [
                  1
                ],
                "strumDown": false
              },
              null,
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "prob": 0.66
              },
              null,
              null,
              null,
              null,
              {
                "notes": [
                  2
                ],
                "strumDown": false
              },
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
                "prob": 0.75
              },
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "prob": 0.5,
                "velocity": 0.5
              },
              null,
              null,
              null,
              null,
              {
                "notes": [
                  2
                ],
                "strumDown": false
              },
              null,
              null,
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "prob": 0.66,
                "velocity": 0.5
              },
              {
                "notes": [
                  0,
                  2
                ],
                "strumDown": false
              },
              null,
              null,
              {
                "notes": [
                  0
                ],
                "strumDown": false,
                "prob": 0.5,
                "velocity": 0.5
              }
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
          "scale": "chromatic",
          "rootNote": 0,
          "scrollRow": 0,
          "voices": {
            "drumHihat": {
              "tone": 0.3552222222222229,
              "decay": 0.10833333333333334,
              "volume": 0.09999999999999999,
              "character": 0.5,
              "blend": 0
            },
            "drumSnare": {
              "tone": 0.3,
              "decay": 0.5388888888888876,
              "volume": 0.342,
              "character": 0.5,
              "blend": 0
            },
            "drumKick": {
              "tone": 0.24411111111111045,
              "decay": 0.4972222222222229,
              "volume": 0.683,
              "character": 0.5,
              "blend": 0
            }
          },
          "volume": 1.05,
          "delaySend": 0.5,
          "reverbSend": 0.6055555555555543,
          "cloudsSend": 0.777777777777779
        },
        "juno": makeDemoJunoTrack(0)
      },
      "delayDivision": "1/8",
      "delayMix": 0.13,
      "delayFeedback": 0.3,
      "delayFilter": 3400,
      "reverbType": "algo",
      "reverbMix": 0.51,
      "reverbDecay": 0.69,
      "reverbPreDelay": 0.02,
      "reverbTone": 6000
    },
  },
];
