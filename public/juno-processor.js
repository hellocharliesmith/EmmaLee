// AudioWorklet processor for the Juno track — a polyphonic emulation of the
// Roland Juno-60/106, vendored from JunoX (Andy Harman, Daniele Zannotti;
// https://github.com/pendragon-andyh/junox), licensed GPL-3.0-or-later.
// This file is the ~13 source files under junox/src/junox/ (ringBuffer,
// simpleSinglePoleFilter, chorus, abstractEnvelope, utils, juno60Envelope,
// lfo, lfoWithEnvelope, dco, ladderFilter, noise, voice, junox) flattened
// into one file with `import`/`export` stripped — matching every other
// public/*-processor.js in this repo (no ES-module imports between public
// files; untested pattern here) and mirroring JunoX's own esbuild step,
// which already bundles these into one file for distribution. Content is
// otherwise unmodified from upstream except for that mechanical flattening.
//
// Unlike Rings/Plaits/Clouds, there's no WASM here — pure JS DSP, no
// Emscripten build step. And unlike every other worklet in this app, Junox
// has REAL note-on/note-off gate semantics (not a fire-and-forget trigger +
// fixed decay) and genuine polyphony (multiple simultaneous voices, not
// Rings/Plaits' one-voice-per-track "strum" emulation of chords) — see
// AGENTS.md "Juno-60 track" for how the sequencer drives that.

// ── from junox/ringBuffer.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──
/**
 * Implementation of a ring-buffer. This is used for delay-based effects.
 */
class RingBuffer {
  /**
   * @param {number} maxBufferSize - Maximum number of samples that the signal can be delayed-by (calculate using `delaySeconds * sampleRate`).
   */
  constructor(maxBufferSize) {
    this.buffer = new Float32Array(maxBufferSize)
    this.writeIndex = 0
    this.maxBufferSize = maxBufferSize
  }

  /**
   *
   * @param {number} index
   */
  ringBufferIndex(index) {
    if (index < 0) {
      return index + this.maxBufferSize
    }
    if (index >= this.maxBufferSize) {
      return index - this.maxBufferSize
    }
    return index
  }

  /**
   * Read a sample from the ring-buffer.
   * Delay period = `readOffset / sampleRate`
   * @param (number) readOffset - The number of samples between the read and the write position
   */
  readSample(readOffset) {
    const readIndex = this.ringBufferIndex(this.writeIndex - readOffset)
    const indexA = Math.floor(readIndex)
    const fractional = readIndex - indexA
    const indexB = this.ringBufferIndex(indexA + 1)
    return this.buffer[indexA] * (1 - fractional) + this.buffer[indexB] * fractional
  }

  /**
   * Write a new sample into the ring-buffer.
   * @param {number} input
   */
  writeSample(input) {
    this.buffer[this.writeIndex] = input
    this.writeIndex = (this.writeIndex + 1) % this.maxBufferSize
  }

  /**
   * Reset the delay-line's contents (only used when the instrument is silent).
   */
  reset() {
    this.buffer.fill(0.0)
  }
}

// ── from junox/smoothMoves.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──
/**
 * If an audio signal changes instantly then you often hear a "glitch". This class allows us to
 * transition between two values smoothly.
 */
class SmoothMoves {
  /**
   * Create a new parameter.
   * @param {number} value - Initial value of the parameter.
   * @param {number} sampleRate - Samples-per-second for the current audio context.
   * @param {number} fc - Amount of smoothing for the LPF used to smooth changes (Hz).
   */
  constructor(value, sampleRate, fc = 5.0) {
    this.b1 = -Math.exp((-2.0 * fc * Math.PI) / sampleRate)
    this.a0 = 1.0 + this.b1

    this.targetValue = value
    this.isStarted = false
    this.z1 = 0.0

    this.reset()
  }

  /**
   * Change the current value to a new value using a linear transition over a period of time.
   * @param {number} value - New parameter value.
   * @param {boolean} useSmoothing = true - If true then the transition to the new value will be smoothed.
   */
  setValue(value, useSmoothing) {
    this.targetValue = value

    if (!this.isStarted || !useSmoothing) {
      this.reset()
      return
    }
  }

  /**
   * Reset immediately to the target value.
   * This should only be used if the instrument is currently silent.
   */
  reset() {
    this.z1 = this.targetValue * this.a0 - this.targetValue
    this.isStarted = false
  }

  /**
   * Get the next value of parameter.
   * @returns {number}
   */
  getNextValue() {
    this.isStarted = true
    const xout = this.targetValue * this.a0 - this.z1
    this.z1 = this.b1 * xout
    return xout
  }
}

// ── from junox/simpleSinglePoleFilter.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──
/**
 * Optimised implementation of single-pole low pass filter (with high-pass option).
 * The maximum this can attenuate is +-6db.
 */
class SimpleSinglePoleFilter {
  /**
   * @constructor
   * @param {number} sampleRate - Sample rate (Hz)
   * @param {*} fc - Cutoff frequency (Hz)
   */
  constructor(sampleRate, fc = 5.0) {
    this._piOverSampleRate = Math.PI / sampleRate
    this._a0 = 1.0
    this._b1 = 0.0
    this._z1 = 0.0

    this.setCutoff(fc)
  }

  /**
   * Flush storage and clear feedback.
   */
  reset() {
    this._z1 = 0.0
  }

  /**
   * Process a single sample through the low-pass filter (using transposed direct form II technique).
   * @param {number} xin - Input value.
   * @returns {number} - Output value.
   */
  renderLP(xin) {
    const xout = xin * this._a0 + this._z1
    this._z1 = -this._b1 * xout
    return xout
  }

  /**
   * Process using high-pass filter (inverse of low-pass).
   * @param {number} xin - Input value.
   * @returns {number} - Output value.
   */
  renderHP(xin) {
    return xin - this.renderLP(xin)
  }

  /**
   * Set cutoff frequency for for simple low pass filter.
   * @param {number} fc - Cutoff frequency (Hz)
   */
  setCutoff(fc) {
    this._b1 = -Math.exp(-2.0 * fc * this._piOverSampleRate)
    this._a0 = 1.0 + this._b1
  }
}

// ── from junox/chorus.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──

/**
 * Emulation of a Roland Juno 60 chorus effect.
 */
class Chorus {
  /**
   * @constructor
   * @param {number} sampleRate
   */
  constructor(sampleRate) {
    /**
     * Output from left-side of chorus.
     */
    this.leftOutput = 0.0

    /**
     * Output from right-side of chorus.
     */
    this.rightOutput = 0.0

    this._sampleRate = sampleRate
    this._isUsed = false
    this._nextChorusMode = 0

    this._ringBuffer = new RingBuffer(Math.trunc(sampleRate * 0.006))
    this._preFilter = new SimpleSinglePoleFilter(sampleRate, 7237)
    this._postLeftFilter = new SimpleSinglePoleFilter(sampleRate, 10644)
    this._postRightFilter = new SimpleSinglePoleFilter(sampleRate, 10644)

    // Current state of the wet/dry mix.
    this._dryCurrent = 1.0
    this._dryChange = 0.0
    this._dryTarget = 1.0

    // Current state of the triangle-wave LFO that controls the delay-offset.
    this._lfoValue = 0.0
    this._lfoIncrement = 0.01

    // Current settings of the left/right delay.
    this._maxLeftOffset = 0.0
    this._averageLeftSamples = 0.0
    this._maxRightOffset = 0.0
    this._averageRightSamples = 0.0
  }

  /**
   * Calculate the `leftOutput` and `rightOutput` signal values for the specified `input`.
   * @param {number} input
   */
  render(input) {
    this._isUsed = true
    let dry = this._dryCurrent

    // Handle transitions to the wet/dry ratio.
    if (this._dryChange !== 0.0) {
      dry += this._dryChange
      if (dry > 1.0) {
        // We have completed the transition to fully-dry.
        dry = 1.0
        this._dryChange = 0
        this.update(this._nextChorusMode)
      } else if (dry < this._dryTarget && this._dryChange < 0.0) {
        dry = this._dryTarget
        this._dryChange = 0
      }
      this._dryCurrent = dry
    }

    // If wet/dry ratio is fully-dry then we are in Mode 0. Just return the input value.
    if (dry === 1.0) {
      this.leftOutput = input
      this.rightOutput = input
      return
    }

    // Calculate the change to the LFO.
    let lfoValue = this._lfoValue + this._lfoIncrement
    if (lfoValue > 1.0 || lfoValue < -1.0) {
      this._lfoIncrement = -this._lfoIncrement
      lfoValue = this._lfoValue + this._lfoIncrement
    }
    this._lfoValue = lfoValue

    // Calculate the left/right output values (delayed-signal=>LPF + dry-signal).
    const dryOutput = input * dry
    const wetFactor = 1.0 - dry

    const leftDelaySamples = this._averageLeftSamples + lfoValue * this._maxLeftOffset
    const leftDelayedValue = this._ringBuffer.readSample(leftDelaySamples)
    this.leftOutput = dryOutput + this._postLeftFilter.renderLP(leftDelayedValue * wetFactor)

    const rightDelaySamples = this._averageRightSamples + lfoValue * this._maxRightOffset
    const rightDelayedValue = this._ringBuffer.readSample(rightDelaySamples)
    this.rightOutput = dryOutput + this._postRightFilter.renderLP(rightDelayedValue * wetFactor)

    // Add the latest input to the ring-buffer (pre-filter and pre-saturate).
    this._ringBuffer.writeSample(this._preFilter.renderLP(this._applySaturation(input)))
  }

  /**
   * Reset the delay-line's contents (only used when the instrument is silent).
   */
  reset() {
    this._ringBuffer.reset()
    this._preFilter.reset()
    this._postLeftFilter.reset()
    this._postRightFilter.reset()
    this._isUsed = false
  }

  /**
   * Update the chorus effect to the specified mode.
   * @param {number} chorusMode - New chorus-mode setting.
   */
  update(chorusMode) {
    if (this._dryCurrent < 1.0 && !this._isUsed) {
      // Want to avoid clicks/pops - so all mode-changes cause temporary transition to fully-dry.
      this._dryChange = 0.0005
      this._dryTarget = 1.0
      this._nextChorusMode = chorusMode
    } else {
      // Apply the desired parameter change.
      switch (chorusMode) {
        case 1: // Mode I.
          this._updateValues(0.513, 0.44, 0.00154, 0.00515, 0.00151, 0.0054, true)
          break
        case 2: // Mode II.
          this._updateValues(0.863, 0.44, 0.00154, 0.00515, 0.00151, 0.0054, true)
          break
        case 3: // Mode I+II.
          this._updateValues(9.75, 0.44, 0.00322, 0.00356, 0.00328, 0.00365, false)
          break
        default:
          // Off (dry = 100%)
          this._updateValues(0.513, 1.0, 0.00154, 0.00515, 0.00151, 0.0054, true)
          this._ringBuffer.reset()
          break
      }
    }
  }

  /**
   * @private Apply mild saturation (to mimic the NLP from the BBD).
   * @param {number} input - Input value.
   * @returns {number} - Result of the saturated input.
   */
  _applySaturation(input) {
    return input ////Math.tanh(input * 0.6) * 1.86202
  }

  /**
   * @private Apply the internal settings.
   * @param {number} freq - Frequency (Hz).
   * @param {number} dry - Ratio of dry:wet (1.0 = fully-dry).
   * @param {number} minLeftDelay - Minimum delay for the left channel (seconds).
   * @param {number} maxLeftDelay - Maximum delay for the left channel (seconds).
   * @param {number} minRightDelay - Minimum delay for the right channel (seconds).
   * @param {number} maxRightDelay - Maximum delay for the right channel (seconds).
   * @param {boolean} isStereo - True if the output image should be stereo.
   */
  _updateValues(freq, dry, minLeftDelay, maxLeftDelay, minRightDelay, maxRightDelay, isStereo) {
    // Left/right delay.
    const averageLeftDelay = (minLeftDelay + maxLeftDelay) * 0.5
    const maxLeftOffset = maxLeftDelay - averageLeftDelay
    this._averageLeftSamples = averageLeftDelay * this._sampleRate
    this._maxLeftOffset = maxLeftOffset * this._sampleRate

    const averageRightDelay = (minRightDelay + maxRightDelay) * 0.5
    const maxRightOffset = maxRightDelay - averageRightDelay
    this._averageRightSamples = averageRightDelay * this._sampleRate
    this._maxRightOffset = maxRightOffset * this._sampleRate * (isStereo ? -1 : 1)

    // Transition to desired wet/dry ration.
    this._dryTarget = dry
    if (!this._isUsed) {
      this._dryChange = dry
    }
    this._dryChange = (dry - this._dryCurrent) / 1000

    // Value-change between each "tick" of triangle-wave LFO.
    this._lfoIncrement = (Math.sign(this._lfoIncrement) * 4 * freq) / this._sampleRate
  }
}

// ── from junox/abstractEnvelope.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──
/**
 * Base implementation of an envelope.
 * @abstract
 */
class AbstractEnvelope {
  constructor(segments) {
    /** @property Set of segments that form the envelope. */
    this._segments = segments

    /** @property Index of the current segment of the envelope (-1 = not currently active). */
    this._currentPhase = -1

    /** @property Current value of the envelope. */
    this._currentValue = 0.0
  }

  /**
   * Returns true if the envelope is currently active.
   */
  isFinished() {
    return this._currentPhase === -1
  }

  /**
   * Returns true if the envelope is active, and has been released or shutdown.
   */
  isReleased() {
    return this.currentPhase !== 0 && this.currentPhase !== 1
  }

  /**
   * Returns true if the envelope is currently shutting-down.
   */
  isShuttingDown() {
    return this.currentPhase === this._segments.length - 1
  }

  /**
   * Trigger (or retrigger) the envelope.
   */
  trigger() {
    this._currentPhase = 0
    for (let segment of this._segments) {
      segment.reset()
    }
  }

  /**
   * Release the current note.
   */
  release() {
    if (this._currentPhase !== -1) {
      this._currentPhase = this._segments.length - 2
    }
  }

  /**
   * Shutdown the envelope (when you need all notes to stop quickly, or when you are stealing voices).
   */
  shutdown() {
    if (this._currentPhase !== -1) {
      this._currentPhase = this._segments.length - 1
    }
  }

  /**
   * Reset the envelope (only used when the voice is silent).
   */
  reset() {
    this._currentPhase = -1
    this._currentValue = 0.0
    for (let i = 0; i < this._segments.length; i++) {
      this._segments[i].reset()
    }
  }

  /**
   * Calculate the next value of the envelope.
   */
  render() {
    let currentPhase = this._currentPhase
    while (currentPhase >= 0 && currentPhase < this._segments.length) {
      // Calculate the next value of the current segment.
      const segment = this._segments[currentPhase]
      const nextValue = segment.process(this._currentValue)
      if (segment.isComplete(nextValue)) {
        // Switch to next phase of the envelope.
        currentPhase++
        if (currentPhase >= this._segments.length) {
          // All phases are complete, so update to "not-active".
          this._currentValue = 0.0
          currentPhase = -1
        }
        this._currentPhase = currentPhase
      } else {
        // Otherwise the calculated value was good.
        this._currentValue = nextValue
        break
      }
    }
    return this._currentValue
  }
}

class AttackSegment {
  /**
   * Create an envelope attack segment.
   * @param {number} sampleRate - Samples-per-second for the current audio context.
   * @param {number} attackTCO - For analog this is often "Math.exp(-1.5)".
   * @param {number} target - Target level at-which this segment should stop.
   * @param {bool} isSustainAtEnd - Set to true if the end of the segment is the sustain phase.
   */
  constructor(sampleRate, attackTCO, target, isSustainAtEnd) {
    this._sampleRate = sampleRate
    this._attackTCO = attackTCO
    this._attackCoeff = 0.0
    this._attackOffset = 0.0
    this._isSustainAtEnd = isSustainAtEnd
    this.target = target
  }

  /**
   * Configure the segment so that it would attack from 0 to +1 in the specified number of seconds.
   * @param {number} seconds - Planned duration of the segment (if the segment runs from 0 to +1)
   */
  setDuration(duration) {
    const samples = this._sampleRate * duration
    this._attackCoeff = Math.exp(-Math.log((1.0 + this._attackTCO) / this._attackTCO) / samples)
    this._attackOffset = (1.0 + this._attackTCO) * (1.0 - this._attackCoeff)
  }

  /**
   * Reset the segment.
   */
  reset() {}

  /**
   * Calculate the next value of this segment of the envelope.
   * @param {number} previousValue - Previous value of the envelope.
   * @returns {number} - Next value of the envelope
   */
  process(previousValue) {
    const result = previousValue * this._attackCoeff + this._attackOffset
    return result > this.target && this._isSustainAtEnd ? this.target : result
  }

  /**
   * Test if the segment is now complete.
   * @param {number} value - Value to test.
   * @returns {bool} - True if the value if the segment is now complete.
   */
  isComplete(value) {
    return value > this.target
  }
}

/**
 * Model a "decay" segment (where we want to "decay" or "release")
 */
class DecaySegment {
  /**
   * Create an envelope decay segment.
   * @param {number} sampleRate - Samples-per-second for the current audio context.
   * @param {number} decayTCO - For analog this is often "Math.exp(-4.95)".
   * @param {number} target - Target level at-which this segment should stop.
   * @param {bool} isSustainAtEnd - Set to true if the end of the segment is the sustain phase.
   */
  constructor(sampleRate, decayTCO, target, isSustainAtEnd) {
    this._sampleRate = sampleRate
    this._decayTCO = decayTCO
    this._decayCoeff = 0.0
    this._decayOffset = 0.0
    this._isSustainAtEnd = isSustainAtEnd
    this.target = target
  }

  /**
   * Configure the segment so that it would decay from +1 to 0 in the specified number of seconds.
   * @param {number} seconds - Planned duration of the segment (if the segment runs from +1 to 0)
   */
  setDuration(seconds) {
    const samples = this._sampleRate * seconds
    this._decayCoeff = Math.exp(-Math.log((1.0 + this._decayTCO) / this._decayTCO) / samples)
    this._decayOffset = (this.target - this._decayTCO) * (1.0 - this._decayCoeff)
  }

  /**
   * Reset the segment.
   */
  reset() {}

  /**
   * Calculate the next value of this segment of the envelope.
   * @param {number} previousValue - Previous value of the envelope.
   * @returns {number} - Next value of the envelope
   */
  process(previousValue) {
    const result = previousValue * this._decayCoeff + this._decayOffset
    return result < this.target && this._isSustainAtEnd ? this.target : result
  }

  /**
   * Test if the segment is now complete.
   * @param {number} value - Value to test.
   * @returns {bool} - True if the value if the segment is now complete.
   */
  isComplete(value) {
    return (value <= this.target && !this._isSustainAtEnd) || value < 0.02
  }
}

class DelaySegment {
  /**
   * Create an envelope delay segment.
   * @param {number} sampleRate - Samples-per-second for the current audio context.
   */
  constructor(sampleRate) {
    this._sampleRate = sampleRate
    this._delaySampleCount = 0
    this._currentRemaining = 0
  }

  /**
   * Configure the segment so that it will delay for the specified number of seconds.
   * @param {number} seconds - Planned duration of the segment.
   */
  setDuration(duration) {
    const delaySampleCount = (this._sampleRate * duration) | 0
    this._currentRemaining += delaySampleCount - this._delaySampleCount
    this._delaySampleCount = delaySampleCount
  }

  /**
   * Reset the segment.
   */
  reset() {
    this._currentRemaining = this._delaySampleCount
  }

  /**
   * Calculate the next value of this segment of the envelope.
   * @param {number} previousValue - Previous value of the envelope.
   * @returns {number} - Next value of the envelope.
   */
  process(previousValue) {
    this._currentRemaining--
    return previousValue
  }

  /**
   * Test if the segment is now complete.
   * @returns {bool} - True if the value if the segment is now complete.
   */
  isComplete() {
    return this._currentRemaining <= 0
  }
}

/**
 * Model a "shutdown" segment (where we want to shutdown all notes, or where we need to steal voices)
 */
class ShutdownSegment {
  /**
   * Create an envelope shutdown segment.
   * @param {number} sampleRate - Samples-per-second for the current audio context.
   * @param {number} seconds - Planned duration of the segment (if the segment runs from +1 to 0)
   */
  constructor(sampleRate, seconds) {
    this._shutdownRate = 1.0 / (seconds * sampleRate)
  }

  /**
   * Reset the segment.
   */
  reset() {}

  /**
   * Calculate the next value of this segment of the envelope.
   * @param {number} previousValue - Previous value of the envelope.
   * @returns {number} - Next value of the envelope
   */
  process(previousValue) {
    const result = previousValue - this._shutdownRate
    return this.value < 0.0 ? 0.0 : result
  }

  /**
   * Test if the segment is now complete.
   * @param {number} value - Value to test.
   * @returns {bool} - True if the value if the segment is now complete.
   */
  isComplete(value) {
    return value <= 0.0
  }
}

// ── from junox/utils.mjs (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──
/**
 * Clamp a number within a specified range.
 * @param {number} val - Number to be clamped.
 * @param {number} min - Minimum threshold.
 * @param {number} max - Maximum threshold.
 */
function clamp(val, min = -1.0, max = 1.0) {
  return val > max ? max : val < min ? min : val
}

/**
 * Fast approximation of the hyperbolic tangent of a number.
 * @param {number} x - A numeric expression that contains an angle measured in radians
 */
function fastTanh(x) {
  if (x < -3.0) {
    return -1.0
  } else if (x > 3.0) {
    return 1.0
  }
  const xSquared = x * x
  return (x * (27.0 + xSquared)) / (27.0 + 9.0 * xSquared)
}

/**
 * Use linear interpolation to lookup a value from an array.
 * @param {number} value - Input value (range is 0..[length of array]).
 * @param {Float64Array} table - The table to be looked-up from.
 */
function interpolatedLookup(value, table) {
  const index = value | 0
  const indexNext = index + 1
  const factor = value - index

  if (index < 0) {
    return table[0]
  }

  if (indexNext >= table.length) {
    return table[table.length - 1]
  }

  return table[index] * (1.0 - factor) + table[indexNext] * factor
}

// ── from junox/juno60Envelope.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──

const curveFromAttackSliderToDuration = [0.001, 0.03, 0.24, 0.65, 3.25]
const curveFromDecaySliderToDuration = [0.002, 0.096, 0.984, 4.449, 19.783]
const curveFromReleaseSliderToDuration = [0.002, 0.096, 0.984, 4.449, 19.783]

/**
 * Specific implementation of the Juno60 envelope.
 */
class Juno60Envelope extends AbstractEnvelope {
  /**
   * Create a Juno-60 envelope.
   * @param {number} sampleRate - Samples-per-second for the current audio context.
   */
  constructor(sampleRate) {
    super([
      new AttackSegment(sampleRate, 0.632, 1.0, false),
      new DecaySegment(sampleRate, 0.025, 0.0, true),
      new DecaySegment(sampleRate, 0.025, 0.0, false),
      new ShutdownSegment(sampleRate, 0.001),
    ])
    this._attack = this._segments[0]
    this._decay = this._segments[1]
    this._release = this._segments[2]
    this._shutdown = this._segments[3]
  }

  /**
   * Configure the segments of the envelope from direct values.
   * @param {number} attackDuration - Number of seconds for the duration of the attack phase.
   * @param {number} decayDuration - Number of seconds for the duration of the decay phase.
   * @param {number} sustainLevel - Level of the sustain phase (0.0 to 1.0).
   * @param {number} releaseDuration - Number of seconds for the duration of the release phase.
   */
  setValues(attackDuration, decayDuration, sustainLevel, releaseDuration) {
    this._attack.setDuration(attackDuration)
    this._decay.target = Math.max(0.02, sustainLevel)
    this._decay.setDuration(decayDuration)
    this._release.setDuration(this._decay.target <= 0.02 ? 0.01 : releaseDuration)
  }

  /**
   * Configure the segments of the envelope from slider-positions.
   * @param {number} attackSlider - Value of the attack slider (0.0 to 1.0).
   * @param {number} decaySlider - Value of the decay slider (0.0 to 1.0).
   * @param {number} sustainSlider - Value of the sustain slider (0.0 to 1.0).
   * @param {number} releaseSlider - Value of the release slider (0.0 to 1.0).
   */
  setValuesFromSliders(attackSlider, decaySlider, sustainSlider, releaseSlider) {
    const attackDuration = interpolatedLookup(
      attackSlider * curveFromAttackSliderToDuration.length,
      curveFromAttackSliderToDuration
    )
    const decayDuration = interpolatedLookup(decaySlider * curveFromDecaySliderToDuration.length, curveFromDecaySliderToDuration)
    const releaseDuration = interpolatedLookup(
      releaseSlider * curveFromReleaseSliderToDuration.length,
      curveFromReleaseSliderToDuration
    )

    this.setValues(attackDuration, decayDuration, sustainSlider, releaseDuration)
  }
}

// ── from junox/lfo.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──
/**
 * Implementation of a low frequency oscillator.
 *  * Capable of different output waveforms.
 * Note: You might want to pipe the output from a lowpass filter (see biquad).
 */
class LFO {
  /**
   * @constructor.
   * @param {number} sampleRate - Samples-per-second for the current audio context.
   */
  constructor(sampleRate) {
    this._oneOverSampleRate = 1.0 / sampleRate
    this._phaseIncrement = 0.0

    /** Current phase of the LFO (0.0 to 1.0) */
    this.currentPhase = 1.0

    /** Current value of the LFO. */
    this.currentValue = 0.0

    /** Has the LFO's cycled in the latest sample? This is useful when you want to automatically retrigger the envelope. */
    this.isRestarted = false

    /** Waveform ("none", "triangle", "square", "sine", "random", "noise") */
    this.waveform = 'triangle'
  }

  /**
   * Reset the LFO (only used when the instrument is silent).
   */
  reset() {
    this.currentPhase = 1.0
    this.currentValue = 0.0
  }

  /**
   * Calculate the next value of the LFO.
   */
  render() {
    // Increment the phase of the LFO.
    this.isRestarted = false
    this.currentPhase += this._phaseIncrement
    if (this.currentPhase > 1.0) {
      this.isRestarted = true
      this.currentPhase -= 1.0
    }

    // Convert the phase into the output waveform.
    let value = 0.0
    switch (this.waveform) {
      case 'none':
        value = 0.0
        break
      case 'sine':
        value = Math.sin(this.currentPhase * 2 * Math.PI)
        break
      case 'square':
        value = this.currentPhase > 0.5 ? -1.0 : 1.0
        break
      case 'random':
        value = this.isRestarted ? Math.random() * 2.0 - 1.0 : this.currentValue
        break
      case 'noise':
        value = Math.random() * 2.0 - 1.0
        break
      default:
        // Default to triangle.
        value = this.currentPhase * 4.0
        if (value > 1.0) {
          value = 2.0 - value
        }
        if (value < -1.0) {
          value = -2.0 - value
        }
        break
    }

    return (this.currentValue = value)
  }

  /**
   * Set the speed of the LFO..
   * @param {number} frequency - Frequency of the LFO (Hz).
   */
  setRate(frequency) {
    this._phaseIncrement = frequency * this._oneOverSampleRate
  }
}

// ── from junox/lfoWithEnvelope.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──

/**
 * Implementation of a low frequency oscillator - with the ability to delay the onset of modulation.
 * Note: You might want to pipe the output from a lowpass filter (see biquad).
 */
class LFOWithEnvelope extends LFO {
  /**
   * @constructor.
   * @param {number} sampleRate - Samples-per-second for the current audio context.
   */
  constructor(sampleRate) {
    super(sampleRate)

    const segments = [
      (this._delay = new DelaySegment(sampleRate)),
      (this._attack = new AttackSegment(sampleRate, 0.03, 1.0, true)),
      (this._release = new DecaySegment(sampleRate, 0.025, 0.0, false)),
      (this._shutdown = new ShutdownSegment(sampleRate, 0.001)),
    ]
    this._release.setDuration(0.1)
    this._env = new AbstractEnvelope(segments)
  }

  /**
   * Returns true if the envelope is currently active.
   */
  isActive() {
    return !this._env.isFinished()
  }

  /**
   * Trigger (or retrigger) the envelope.
   */
  trigger() {
    if (!this.isActive()) {
      this.currentPhase = 1.0
      this.currentValue = 0.0
    }
    if (this._env.isFinished() || !this._env.isReleased()) {
      this._env.trigger()
    }
  }

  /**
   * Release the current note.
   */
  release() {
    this._env.release()
  }

  /**
   * Shutdown the envelope (when you need all notes to stop quickly, or when you are stealing voices).
   */
  shutdown() {
    this._env.shutdown()
  }

  /**
   * Reset the envelope (only used when the voice is silent).
   * @override
   */
  reset() {
    super.reset()
    this._env.reset()
  }

  /**
   * Calculate the next value of the LFO.
   * @override
   */
  render() {
    if (!this.isActive()) {
      return 0.0
    }

    // Calculate the envelope (as determined by the "delay" setting).
    const envValue = this._env.render()
    if (envValue === 0.0) {
      // If no value then we can bail-out here.
      return 0.0
    }

    return envValue * super.render()
  }

  /**
   * Configure the LFO from direct values.
   * @param {number} frequency - Frequency of the LFO (Hz).
   * @param {number} delayDuration - Number of seconds for the duration of the delay phase.
   * @param {number} attackDuration - Number of seconds for the duration of the attack phase.
   */
  setValues(frequency, delayDuration, attackDuration) {
    this.setRate(frequency)
    this._delay.setDuration(delayDuration)
    this._attack.setDuration(attackDuration)
  }
}

// ── from junox/dco.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──
class Juno60DCO {
  constructor(sampleRate) {
    this.sampleRate = sampleRate
    this.currentPhase = 0.0
    this.phaseIncrement = 0.0
    this.pulseWidth = 0.5
    this.pulsePositive = 1.0
    this.pulseNegative = -1.0
    this.pulseHeight = 1.0
    this.subOutput = 1.0
  }

  /**
   * Signal the start of a new note (voice should be silent before this point).
   * @param {number} noteNumber - MIDI note number (0 to 127).
   */
  noteOn(noteNumber) {
    // Convert MIDI not number into a frequency, and then calculate the phase-increment for each sample-quantum.
    // Service notes explicitely says middle-A is 442.
    const noteFrequency = Math.pow(2, (noteNumber - 69) / 12) * 442
    this.phaseIncrement = noteFrequency / this.sampleRate

    // Juno60 DCO seems to start new notes partway through cycle (I think this is so that fast-attacks can be heard for low notes).
    this.currentPhase = 1.1
  }

  /**
   * Render output for a single quantum.
   * @param {number} detuneFactor - Factor to increase note's frequency by (0.5 = octave-down, 1.0 = default, 2.0 = octave-up)
   * @param {number} pulseWidth - Pulse width (0..1 - where 0 = square).
   * @param {number} sawLevel - Output level of the Sawtooth waveform.
   * @param {number} pulseLevel - Output level of the Pulse waveform.
   * @param {number} subLevel - Output level of the Sub waveform.
   */
  render(detuneFactor, pulseWidth, sawLevel, pulseLevel, subLevel) {
    // Increment phase [0-1]. Wrap-around if the cycle is complete.
    // The detuneFactor allows pitch-bend, LFO, and range to be applied.
    const phaseIncrement = this.phaseIncrement * detuneFactor
    const origPhase = this.currentPhase
    this.currentPhase += phaseIncrement
    if (this.currentPhase > 1.0) {
      this.currentPhase -= 1.0

      // Only change the PWM point when the phase has wrapped (so rapid modulation doesn't cause noise).
      this.pulseWidth = 0.5 - 0.45 * pulseWidth
      this.pulsePositive = 1.0 - pulseWidth * 0.95
      this.pulseNegative = -1.0
      this.pulseHeight = 0.45 * (this.pulsePositive - this.pulseNegative)
    }

    // Phat sawtooth (mimics charging capacitor).
    let newSawOutput = 0.0
    if (sawLevel > 0.0) {
      newSawOutput = this.currentPhase + this.currentPhase - 1.0
      newSawOutput -= this.calcPolyBLEP2(this.currentPhase, phaseIncrement, 1.0)
    }

    // Pulse uses a comparator against the current phase.
    let newPulseOutput = 0.0
    if (pulseLevel > 0.0) {
      newPulseOutput = this.currentPhase > this.pulseWidth ? (this.pulsePositive *= 0.998) : (this.pulseNegative *= 0.998)
      newPulseOutput -= this.calcPolyBLEP2(this.currentPhase, phaseIncrement, this.pulseHeight)
      const x = this.currentPhase - this.pulseWidth
      newPulseOutput += this.calcPolyBLEP2(x < 0.0 ? x + 1.0 : x, phaseIncrement, this.pulseHeight)
    }

    // Sub flip-flops between -1 and +1 when the phase reaches 0.5.
    let newSubOutput = (this.subOutput *= 0.998)
    let y = this.currentPhase - 0.5
    if (y < phaseIncrement && y > -phaseIncrement) {
      if (y < 0.0) {
        y += 1.0
      }
      const origSubOutput = newSubOutput
      if (this.currentPhase >= 0.5 && origPhase < 0.5) {
        this.subOutput = newSubOutput = newSubOutput > 0.0 ? -1.0 : +1.0
      }
      newSubOutput -= this.calcPolyBLEP2(y, phaseIncrement, origSubOutput)
    }

    // Return the mixed-down output.
    return newSawOutput * sawLevel + newPulseOutput * pulseLevel + newSubOutput * subLevel
  }

  /**
   * Calculate the PolyBLEP correction that is required to reduce aliasing.
   * @param {number} phase - Current phase.
   * @param {number} inc - Current phase-increment (to produce the desired pitch).
   * @param {number} height - Height of the PolyBLEP correction).
   */
  calcPolyBLEP2(phase, inc, height) {
    let result = 0.0
    if (phase < inc) {
      // Right side of transition.
      const t = phase / inc
      result = height * (t + t - t * t - 1.0)
    } else if (phase + inc > 1.0) {
      // Left side of transition.
      const t = (phase - 1.0) / inc
      result = height * (t * t + (t + t) + 1.0)
    }

    return result
  }
}

// ── from junox/ladderFilter.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──
/**
 * Implementation of Moog-style "Virtual Analog" ladder filter (based on Pirkle's Synth book).
 */
class LadderFilter {
  constructor(sampleRate) {
    this.reset()
    this.nyquistLimit = sampleRate * 0.5
    this.piOverSampleRate = Math.PI / sampleRate
  }

  /**
   * Reset the filter - ready for the next note.
   */
  reset() {
    this.z1 = 0.0
    this.z2 = 0.0
    this.z3 = 0.0
    this.z4 = 0.0
  }

  /**
   * Calculate the "cutoffFactor" for the specifed frequency.
   * @param {number} fc - Cutoff frequency (Hz).
   */
  calcCutoffFactor(fc) {
    if (fc > this.nyquistLimit) {
      fc = this.nyquistLimit
    }

    return Math.tan(fc * this.piOverSampleRate)
  }

  /**
   * Trigger the filter (useful for percussive sounds).
   * @param {number} initialExcite - Initial amount of excitement for the feedback resonance loop.
   */
  trigger(initialExcite) {
    this.z4 += initialExcite
  }

  /**
   * Apply filtering to the input sigmal.
   * If saturation or passband-compensation are required then pre-apply to input (Valimaki).
   * Consider applying a peak-limiter to the output (to prevent blow-up).
   * @param {number} input - Input signal (normally in range -1.0 to +1.0).
   * @param {number} cutoffFactor - Result of prewarping the cutoff-frequency.
   * @param {number} resonance - Resonance amount (range: 0.0 to 1.0).
   * @param {number} mode - Filter mode (see ladderFilterModes).
   */
  process(input, cutoffFactor, resonance, mode = ladderFilterModes.LPF4) {
    const oneOverOnePlusg = 1.0 / (1.0 + cutoffFactor)

    // Feedforward coefficient for VA one-pole filters.
    const alpha = cutoffFactor * oneOverOnePlusg

    // Feedback coefficients for VA one-pole filters.
    const beta4 = oneOverOnePlusg
    const beta3 = beta4 * alpha
    const beta2 = beta3 * alpha
    const beta1 = beta2 * alpha

    // Mix the feedback with the input.
    const feedback = beta1 * this.z1 + beta2 * this.z2 + beta3 * this.z3 + beta4 * this.z4
    const k = 4.0 * resonance
    const xin = (input - k * feedback) / (1.0 + k * alpha * alpha * alpha * alpha)

    // Apply pole 1.
    const lpf1In = (xin - this.z1) * alpha
    const lpf1Out = lpf1In + this.z1
    this.z1 = lpf1In + lpf1Out

    // Apply pole 2.
    const lpf2In = (lpf1Out - this.z2) * alpha
    const lpf2Out = lpf2In + this.z2
    this.z2 = lpf2In + lpf2Out

    // Apply pole 3.
    const lpf3In = (lpf2Out - this.z3) * alpha
    const lpf3Out = lpf3In + this.z3
    this.z3 = lpf3In + lpf3Out

    // Apply pole 4.
    const lpf4In = (lpf3Out - this.z4) * alpha
    const lpf4Out = lpf4In + this.z4
    this.z4 = lpf4In + lpf4Out

    // Implement the specified filter-mode.
    return mode[4] * lpf4Out + mode[3] * lpf3Out + mode[2] * lpf2Out + mode[1] * lpf1Out + mode[0] * xin
  }
}

/**
 * Set of available filter-modes.
 * (table 7.1 "The A, B, C, D and E values for the various filters" from Pirkle's Synth book)
 */
const ladderFilterModes = {
  LPF2: Float64Array.from([0.0, 0.0, 1.0, 0.0, 0.0]),
  LPF4: Float64Array.from([0.0, 0.0, 0.0, 0.0, 1.0]),
  BPF2: Float64Array.from([0.0, 2.0, -2.0, 0.0, 0.0]),
  BPF4: Float64Array.from([0.0, 0.0, 4.0, -8.0, 4.0]),
  HPF2: Float64Array.from([1.0, -2.0, 1.0, 0.0, 0.0]),
  HPF4: Float64Array.from([1.0, -4.0, 6.0, -4.0, 1.0]),
}
ladderFilterModes.all = [
  ladderFilterModes.LPF2,
  ladderFilterModes.LPF4,
  ladderFilterModes.BPF2,
  ladderFilterModes.BPF4,
  ladderFilterModes.HPF2,
  ladderFilterModes.HPF4,
]

// ── from junox/noise.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──
class Noise {
  constructor(sampleRate, fc = 5000) {
    // Coefficients for 6db low pass output filter.
    this._b1 = -Math.exp((-2.0 * fc * Math.PI) / sampleRate)
    this._a0 = 1.0 + this._b1
    this._z1 = 0.0
  }

  render() {
    // White noise.
    const xin = Math.random() * 2.0 - 1.0

    // Apply low pass filter to convert to pink noise.
    const xout = xin * this._a0 - this._z1
    this._z1 = this._b1 * xout
    return xout
  }
}

// ── from junox/voice.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──

class Voice {
  constructor({ patch, sampleRate }) {
    this.patch = patch
    this.sampleRate = sampleRate
    this.note = -1
    this.velocity = 0.0
    this.filterNoteFactor = 0.0

    this.dco = new Juno60DCO(sampleRate)
    this.noise = new Noise(sampleRate, 5000)

    this.modEnv = new Juno60Envelope(sampleRate)
    this.ampEnv = new Juno60Envelope(sampleRate)

    this.moogVCF = new LadderFilter(sampleRate)
  }

  /**
   * Render output for a single quantum. The passed-in parameters should be "smoothed" so that we don't hear zippering.
   * @param {number} lfoOut - Current value of the LFO (between -1 and +1)
   * @param {number} detuneFactor - Factor to increase note's frequency by (0.5 = octave-down, 1.0 = default, 2.0 = octave-up)
   * @param {number} pwmDepth - Pulse width depth (between 0-square and 1)
   * @param {number} sawLevel - Output level of the Sawtooth waveform (between 0 and 1).
   * @param {number} pulseLevel - Output level of the Pulse waveform (between 0 and 1).
   * @param {number} subLevel - Output level of the Sub waveform (between 0 and 1).
   * @param {number} noiseLevel - Output level of the noise (between 0 and 1).
   * @param {number} filterCutoff - Current value of the filter's cutoff slider (between 0 and 1).
   * @param {number} filterResonance - Current value of the filter's resonance slider (between 0 and 1).
   * @param {number} filterEnvMod - Current value of the filter's envelope modulation slider (between -1 (for negative) and +1 (for positive)).
   * @param {number} lfoDetuneOctaves - Number of octaves that the filter is detuned-by (for LFO and bend-lever).
   * @param {number} filterKeyMod - Current value of the filter's keyboard modulation slider (between 0 and 1).
   */
  render(
    lfoOut,
    detuneFactor,
    pwmDepth,
    sawLevel,
    pulseLevel,
    subLevel,
    noiseLevel,
    filterCutoff,
    filterResonance,
    filterEnvMod,
    lfoDetuneOctaves,
    filterKeyMod
  ) {
    const modEnvOut = this.modEnv.render()
    const ampEnvOut = this.ampEnv.render()

    let pulseWidth = pwmDepth
    if (this.patch.dco.pwmMod === 'l') {
      pulseWidth *= lfoOut * 0.5 + 0.5
    } else if (this.patch.dco.pwmMod === 'e') {
      pulseWidth *= modEnvOut
    }

    let dcoOut = this.dco.render(detuneFactor, pulseWidth, sawLevel, pulseLevel, subLevel)
    if (noiseLevel > 0.0) {
      dcoOut += this.noise.render() * noiseLevel
    }

    // The VCF is voltage controller (1 volt per octave). Calculate how much each of the
    // modulators contribute to the control voltage.
    const cutoffDetuneOctave = (filterCutoff * 200) / 12
    const envDetuneOctaves = modEnvOut * filterEnvMod * 12 // Envelope changes cutoff by upto +-12 octaves.
    const keyboardDetuneOctaves = filterKeyMod * this.filterNoteFactor
    const resonanceDetuneOctaves = this.patch.vcf.resonance * 0.5 // Resonance changes cutoff a little.
    const vcfCutoffValue =
      cutoffDetuneOctave +
      lfoDetuneOctaves * ampEnvOut + // Using env to dumb-down LFO makes UFO patch sound more natural.
      keyboardDetuneOctaves +
      envDetuneOctaves +
      resonanceDetuneOctaves

    // Convert the resulting control-voltage to the cutoff frequency and aply the filter.
    const cutoffFrequency = 7.8 * Math.pow(2.0, vcfCutoffValue)
    const vcfOut = this.moogVCF.process(dcoOut, this.moogVCF.calcCutoffFactor(cutoffFrequency), filterResonance)

    return this.velocity * vcfOut * ampEnvOut
  }

  noteOn(note, velocity) {
    // If the note is new (e.g. not a re-trigger) then initialize state.
    if (note !== this.note || this.isFinished()) {
      this.note = note
      this.dco.noteOn(note)
      this.modEnv.reset()
      this.ampEnv.reset()
      this.moogVCF.reset()

      const c4 = 60
      const fiveOctaves = 5 * 12
      this.filterNoteFactor = 5 * ((this.note - c4) / fiveOctaves)
    }

    // If the patch has no sound-source then assume that it is trying to use the filter as the source.
    if (!this.patch.dco.saw && !this.patch.dco.pulse && !this.patch.dco.subAmount && !this.patch.dco.noise) {
      const initialExcite = this.patch.vcf.resonance * this.patch.vcf.resonance * 0.01
      this.moogVCF.trigger(initialExcite)
    }

    this.velocity = velocity
    this.updatePatch(this.patch)
    this.modEnv.trigger()
    this.ampEnv.trigger()
  }

  noteOff() {
    this.modEnv.release()
    this.ampEnv.release()
  }

  isFinished() {
    return this.ampEnv.isFinished()
  }

  updatePatch(patch) {
    const env = patch.env

    this.modEnv.setValuesFromSliders(env.attack, env.decay, env.sustain, env.release)

    if (patch.vcaType === 'env') {
      this.ampEnv.setValuesFromSliders(env.attack, env.decay, env.sustain, env.release)
    } else {
      this.ampEnv.setValues(0.00247, 0.0057, 0.98, 0.0057)
    }

    this.patch = patch
  }
}

// ── from junox/junox.js (GPL-3.0-or-later, https://github.com/pendragon-andyh/junox) ──

const synthStatus = {
  SILENT: 0,
  NOTES_ACTIVE: 4, // This is the number of trailing frames that will be rendered AFTER all notes have finished.
}

class Junox {
  constructor({ patch, sampleRate, polyphony }) {
    this.patch = patch
    this.sampleRate = sampleRate
    this.maxVoices = polyphony

    this.voices = []
    this.status = synthStatus.SILENT

    // Parameters that need to be "smoothed" (so we can change them in realtime without hearing stepping/zippering)
    this.parameters = [
      (this.bendAmountParam = new SmoothMoves(0, sampleRate)),
      (this.dcoBendDepthParam = new SmoothMoves(1, sampleRate)),
      (this.pitchLfoModDepthParam = new SmoothMoves(0, sampleRate)),
      (this.pwmDepthParam = new SmoothMoves(0, sampleRate)),
      (this.sawLevelParam = new SmoothMoves(0, sampleRate)),
      (this.pulseLevelParam = new SmoothMoves(0, sampleRate)),
      (this.subLevelParam = new SmoothMoves(0, sampleRate)),
      (this.noiseLevelParam = new SmoothMoves(0, sampleRate)),
      (this.filterCutoffParam = new SmoothMoves(0, sampleRate)),
      (this.filterResonanceParam = new SmoothMoves(0, sampleRate)),
      (this.filterBendDepthParam = new SmoothMoves(1, sampleRate)),
      (this.filterEnvModParam = new SmoothMoves(0, sampleRate)),
      (this.filterLfoModParam = new SmoothMoves(0, sampleRate)),
      (this.filterKeyModParam = new SmoothMoves(0, sampleRate)),
      (this.vcaGainFactorParam = new SmoothMoves(0, sampleRate)),
    ]

    this.lfo = new LFOWithEnvelope(sampleRate)
    this.lfo.waveform = 'sine'

    this.hpf = new SimpleSinglePoleFilter(sampleRate)

    this.chorus = new Chorus(sampleRate)

    this.update()
  }

  noteOn(note, velocity) {
    this.status = synthStatus.NOTES_ACTIVE

    // If note already playing then retrigger.
    const voiceIndex = this.voices.findIndex((voice) => voice.note === note)
    if (voiceIndex >= 0) {
      this.voices[voiceIndex].noteOn(note, velocity)
      return
    }

    // TODO - Fix triggering and release for LFO.
    if (!this.voices.length && this.patch.lfo.autoTrigger) {
      this.lfo.trigger()
    }

    const newVoice = new Voice({ patch: this.patch, sampleRate: this.sampleRate })
    newVoice.noteOn(note, velocity)

    if (this.voices.length < this.maxVoices) {
      this.voices.push(newVoice)
      return
    }
    // TODO: recycle voice at minimum volume
    this.voices[0] = newVoice
  }

  noteOff(note) {
    this.voices.forEach((voice) => voice.note === note && !voice.isFinished() && voice.noteOff())
  }

  pitchBend(value) {
    this.bendAmountParam.setValue(value)
  }

  lfoTrigger() {
    this.lfo.trigger()
  }

  lfoRelease() {
    this.lfo.release()
  }

  render(outL, outR) {
    // If silent then return immediately.
    if (this.status === synthStatus.SILENT) {
      return
    }
    this.status--

    // TODO - Just leave voices deactivated.
    // remove dead voices first
    this.voices = this.voices.filter((voice) => !voice.isFinished())
    if (this.voices.length) {
      this.status = synthStatus.NOTES_ACTIVE
    }

    // Render contents of buffer.
    for (let i = 0; i < outL.length; i++) {
      const bendAmount = this.bendAmountParam.getNextValue()
      const dcoBendDepth = this.dcoBendDepthParam.getNextValue()
      const pwmDepth = this.pwmDepthParam.getNextValue()
      const pitchLfoModDepth = this.pitchLfoModDepthParam.getNextValue()
      const sawLevel = this.sawLevelParam.getNextValue()
      const pulseLevel = this.pulseLevelParam.getNextValue()
      const subLevel = this.subLevelParam.getNextValue()
      const noiseLevel = this.noiseLevelParam.getNextValue()
      const filterCutoff = this.filterCutoffParam.getNextValue()
      const filterResonance = this.filterResonanceParam.getNextValue()
      const filterBendDepth = this.filterBendDepthParam.getNextValue()
      const filterEnvMod = this.filterEnvModParam.getNextValue()
      const filterLfoMod = this.filterLfoModParam.getNextValue()
      const filterKeyMod = this.filterKeyModParam.getNextValue()
      const vcaGainFactor = this.vcaGainFactorParam.getNextValue()

      // Calculate "k-rate" values (trading smoothness/accuracy against performance).
      if (i === 0) {
        // TODO?
      }

      const lfoOut = this.lfo.render()

      // All voices are detuned by the same relative-amount (from LFO and pitch-bend lever).
      // Calculations come from the Juno 60 service manual.
      const dcoDetuneOctaves =
        lfoOut * pitchLfoModDepth * 0.25 + // +-300 cents (page 14).
        (bendAmount * dcoBendDepth * 7) / 12 // +-700 cents (page 14).
      let dcoDetuneFactor = this.patch.dco.range
      if (dcoDetuneOctaves !== 0.0) {
        dcoDetuneFactor *= Math.pow(2, dcoDetuneOctaves)
      }
      const filterDetuneOctaves =
        bendAmount * filterBendDepth * 4 + // +- 4 octaves
        filterLfoMod * lfoOut * 3.0 // +- 6 octaves (section 8.7 - VCF LFO Gain)

      // Gather the outputs from each voice.
      let monoOut = 0.0
      for (let v = 0; v < this.voices.length; v++) {
        const voice = this.voices[v]
        if (!voice.isFinished()) {
          monoOut += voice.render(
            lfoOut,
            dcoDetuneFactor,
            pwmDepth,
            sawLevel,
            pulseLevel,
            subLevel,
            noiseLevel,
            filterCutoff,
            filterResonance,
            filterEnvMod,
            filterDetuneOctaves,
            filterKeyMod
          )
        }
      }

      // Apply high pass filter.
      // Juno-60 has just 4 possible values (0, 1, 2, 3) corresponding to (none, 250, 520, 1220).
      // Our design uses a slider (like the Juno-6) so interpolate between the Juno-60's values).
      if (this.patch.hpf > 0.0) {
        let lowPassOut = this.hpf.renderLP(monoOut)
        if (this.patch.hpf < 0.25) {
          // And gradually apply HPF between 0.0 and 0.25.
          lowPassOut *= this.patch.hpf * 4.0
        }
        monoOut -= lowPassOut
      }

      // Apply the VCA gain.
      monoOut *= vcaGainFactor

      // Soft clip (to ensure that the output signal is not outside of range).
      monoOut = fastTanh(3.0 * monoOut)

      // Apply the chorus effect.
      this.chorus.render(monoOut)
      outL[i] = this.chorus.leftOutput
      outR[i] = this.chorus.rightOutput
    }

    // Check if synth should now be silent.
    if (this.status === synthStatus.SILENT) {
      // Fade-out the current output signal (should only contain echos).
      let fadeLevel = 1.0
      const fadeStep = fadeLevel / outL.length
      for (let i = 0; i < outL.length; i++) {
        outL[i] *= fadeLevel
        outR[i] *= fadeLevel
        fadeLevel -= fadeStep
      }

      // Reset any stateful elements (filters, delay-buffers, lfo, etc).
      if (this.patch.lfo.autoTrigger) {
        this.lfo.reset()
      }
      this.hpf.reset()
      this.chorus.reset()

      // Reset any parameters to their target values.
      for (let i = 0; i < this.parameters.length; i++) {
        this.parameters[i].reset()
      }
    }
  }

  setValue(path, value) {
    // This used to use NPM.lodash.set ... but that doesn't work well when using ES6 modules.
    const pathSegments = path.split('.')
    if (pathSegments.length) {
      let target = this.patch
      for (let i = 0; i < pathSegments.length - 1; i++) {
        target = target[pathSegments[i]] || (target[pathSegments[i]] = {})
      }
      target[pathSegments[pathSegments.length - 1]] = value

      this.update()
    }
  }

  update() {
    let isActive = false
    for (let v = 0; v < this.voices.length; v++) {
      const voice = this.voices[v]
      voice.updatePatch(this.patch)
      isActive = isActive || !voice.isFinished()
    }

    // Relative volumes of each source.
    let sawLevel = this.patch.dco.saw ? 0.2 : 0.0
    let pulseLevel = this.patch.dco.pulse ? 0.2 : 0.0
    let subLevel = this.patch.dco.sub ? this.patch.dco.subAmount * 0.195 : 0.0
    let noiseLevel = this.patch.dco.noise * 0.21

    // If multiple waveforms at same time then the overall level is reduced.
    let mixFactor = sawLevel + pulseLevel + subLevel + noiseLevel
    if (mixFactor > 0.26) {
      mixFactor = 0.26 / (0.26 + (mixFactor - 0.26) * 0.3)
      pulseLevel *= mixFactor
      sawLevel *= mixFactor
      subLevel *= mixFactor
      noiseLevel *= mixFactor
    }

    this.sawLevelParam.setValue(sawLevel, isActive)
    this.pulseLevelParam.setValue(pulseLevel, isActive)
    this.subLevelParam.setValue(subLevel, isActive)
    this.noiseLevelParam.setValue(noiseLevel, isActive)
    this.pitchLfoModDepthParam.setValue(this.patch.dco.lfo, isActive)
    this.pwmDepthParam.setValue(this.patch.dco.pwm, isActive)

    const envModDirection = this.patch.vcf.modPositive ? 1.0 : -1.0
    this.filterCutoffParam.setValue(this.patch.vcf.frequency, isActive)
    this.filterResonanceParam.setValue(this.patch.vcf.resonance, isActive)
    this.filterEnvModParam.setValue(this.patch.vcf.envMod * envModDirection, isActive)
    this.filterLfoModParam.setValue(this.patch.vcf.lfoMod, isActive)
    this.filterKeyModParam.setValue(this.patch.vcf.keyMod, isActive)

    this.chorus.update(this.patch.chorus)
    setLfoValuesFromSliders(this.lfo, this.patch.lfo.frequency, this.patch.lfo.delay)
    setHpfValuesFromSliders(this.hpf, this.patch.hpf)

    // VCA gain. 0.0 => 0.1, 0.5 => 0.316, 1.0 => 1.0
    const vcaGainFactor = Math.pow(1.2589, this.patch.vca * 10) * 0.1
    this.vcaGainFactorParam.setValue(vcaGainFactor, isActive)
  }

  panic() {
    // TODO - Use shutdown().
    this.voices = []
  }
}

const curveFromLfoRateSliderToFreq = [0.3, 0.85, 3.39, 11.49, 22.22]
const curveFromLfoDelaySliderToDelay = [0.0, 0.0639, 0.85, 1.2, 2.685]
const curveFromLfoDelaySliderToAttack = [0.001, 0.053, 0.188, 0.348, 1.15]

/**
 * Configure the LFO from the Juno60's slider values.
 * @param {LFO} - Instance of LFO class.
 * @param {number} rateSlider - Value of the rate slider (0.0 to 1.0).
 * @param {number} delaySlider - Value of the delay slider (0.0 to 1.0).
 */
function setLfoValuesFromSliders(lfo, rateSlider, delaySlider) {
  const frequency = interpolatedLookup(rateSlider * curveFromLfoRateSliderToFreq.length, curveFromLfoRateSliderToFreq)
  const delayDuration = interpolatedLookup(delaySlider * curveFromLfoDelaySliderToDelay.length, curveFromLfoDelaySliderToDelay)
  const attackDuration = interpolatedLookup(delaySlider * curveFromLfoDelaySliderToAttack.length, curveFromLfoDelaySliderToAttack)

  lfo.setValues(frequency, delayDuration, attackDuration)
}

const curveFromHpfSliderToFreq = [140, 250, 520, 1220]

function setHpfValuesFromSliders(hpf, rateSlider) {
  const frequency = interpolatedLookup(rateSlider * curveFromHpfSliderToFreq.length, curveFromHpfSliderToFreq)
  hpf.setCutoff(frequency)
}

// ── Worklet wrapper (not part of JunoX upstream) — adapts Junox to this
// app's {type, payload} message convention, mirroring plaits-processor.js's
// shape. No WASM to load, so — unlike every other processor here — there's
// no 'load-wasm' handshake: the synth is constructed immediately with a
// placeholder patch, and posts 'ready' synchronously so engine.ts's shared
// createTrackWorklet() (which awaits that message) resolves right away.
const DEFAULT_PATCH = {
  name: 'Init',
  vca: 0.7,
  vcaType: 'env',
  lfo: { autoTrigger: true, frequency: 0.5, delay: 0 },
  dco: { range: 1, saw: true, pulse: false, sub: false, subAmount: 0, noise: 0, pwm: 0, pwmMod: 'l', lfo: 0 },
  hpf: 0,
  vcf: { frequency: 0.7, resonance: 0, modPositive: true, envMod: 0, lfoMod: 0, keyMod: 1 },
  env: { attack: 0, decay: 0.2, sustain: 0.6, release: 0.2 },
  chorus: 1,
}
const JUNO_POLYPHONY = 8 // voices -- gate-length holds can overlap several chords at once

class JunoProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.synth = new Junox({ patch: DEFAULT_PATCH, polyphony: JUNO_POLYPHONY, sampleRate })

    this.port.onmessage = (e) => {
      const { type, payload } = e.data
      switch (type) {
        case 'set-patch':
          this.synth.patch = payload.patch
          this.synth.update()
          break
        case 'note-on':
          this.synth.noteOn(payload.note, payload.velocity ?? 1)
          break
        case 'note-off':
          this.synth.noteOff(payload.note)
          break
        case 'set-param':
          this.synth.setValue(payload.path, payload.value)
          break
        case 'all-notes-off':
          this.synth.panic()
          break
      }
    }

    this.port.postMessage({ type: 'ready' })
  }

  process(_inputs, outputs) {
    const output = outputs[0]
    this.synth.render(output[0], output[1])
    return true
  }
}

registerProcessor('juno-processor', JunoProcessor)

