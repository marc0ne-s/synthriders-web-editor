// AudioEngine — singleton Web Audio API playback engine
// Handles: load/decode audio, play/pause/seek, waveform peak extraction

const PEAK_SAMPLES = 1024 // number of waveform peaks to extract

export interface AudioState {
  duration: number
  currentTime: number
  isPlaying: boolean
  isLoaded: boolean
  /** normalised waveform peaks [0..1] for canvas rendering */
  peaks: Float32Array
}

type Listener = (state: AudioState) => void

class AudioEngineImpl {
  private ctx: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private startedAt = 0
  private pausedAt = 0
  private listeners = new Set<Listener>()
  private rafId = 0
  private _state: AudioState = {
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    isLoaded: false,
    peaks: new Float32Array(0),
  }

  get state(): AudioState {
    return this._state
  }

  /** Ensure AudioContext exists (must be called from user gesture) */
  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  /** Load and decode audio from a File or ArrayBuffer */
  async load(file: File | ArrayBuffer): Promise<void> {
    const ctx = this.ensureCtx()
    let arrayBuf: ArrayBuffer

    if (file instanceof File) {
      arrayBuf = await file.arrayBuffer()
    } else {
      arrayBuf = file
    }

    this.buffer = await ctx.decodeAudioData(arrayBuf)

    // Extract waveform peaks
    const peaks = this.extractPeaks(this.buffer, PEAK_SAMPLES)

    this._state = {
      duration: this.buffer.duration,
      currentTime: 0,
      isPlaying: false,
      isLoaded: true,
      peaks,
    }
    this.emit()
  }

  /** Extract normalised peak amplitudes for waveform display */
  private extractPeaks(buffer: AudioBuffer, numPeaks: number): Float32Array {
    const channel = buffer.getChannelData(0) // use first channel
    const peaks = new Float32Array(numPeaks)
    const samplesPerPeak = Math.floor(channel.length / numPeaks)

    for (let i = 0; i < numPeaks; i++) {
      let max = 0
      const start = i * samplesPerPeak
      for (let j = 0; j < samplesPerPeak; j++) {
        const abs = Math.abs(channel[start + j])
        if (abs > max) max = abs
      }
      peaks[i] = Math.min(max * 1.2, 1.0) // slight boost for visibility
    }
    return peaks
  }

  /** Start or resume playback */
  play(): void {
    if (!this.buffer) return
    const ctx = this.ensureCtx()

    // Stop any existing source
    this.stopSource()

    this.source = ctx.createBufferSource()
    this.source.buffer = this.buffer
    this.source.connect(ctx.destination)
    this.source.start(0, this.pausedAt)
    this.startedAt = ctx.currentTime - this.pausedAt

    this.source.onended = () => {
      if (this._state.currentTime >= this._state.duration - 0.01) {
        this.pausedAt = 0
        this._state = { ...this._state, currentTime: 0, isPlaying: false }
      } else {
        this._state = { ...this._state, isPlaying: false }
      }
      this.emit()
      cancelAnimationFrame(this.rafId)
    }

    this._state = { ...this._state, isPlaying: true }
    this.emit()
    this.tick()
  }

  /** Pause but keep position */
  pause(): void {
    if (!this.ctx) return
    this.pausedAt = this._state.currentTime
    this.stopSource()
    this._state = { ...this._state, isPlaying: false }
    this.emit()
    cancelAnimationFrame(this.rafId)
  }

  /** Seek to a specific time */
  seek(time: number): void {
    this.pausedAt = Math.max(0, Math.min(time, this._state.duration))
    this._state = { ...this._state, currentTime: this.pausedAt }
    this.emit()

    if (this._state.isPlaying) {
      // Restart from new position
      this.play()
    }
  }

  /** Stop and reset to 0 */
  stop(): void {
    this.pausedAt = 0
    this.stopSource()
    this._state = { ...this._state, currentTime: 0, isPlaying: false }
    this.emit()
    cancelAnimationFrame(this.rafId)
  }

  /** Clean up audio sources */
  private stopSource(): void {
    if (this.source) {
      try { this.source.stop() } catch { /* already stopped */ }
      this.source.disconnect()
      this.source = null
    }
  }

  /** RAF loop for updating currentTime */
  private tick = (): void => {
    if (!this._state.isPlaying || !this.ctx) return
    const elapsed = this.ctx.currentTime - this.startedAt
    const time = Math.min(elapsed, this._state.duration)
    this._state = { ...this._state, currentTime: time }
    this.emit()
    this.rafId = requestAnimationFrame(this.tick)
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private emit(): void {
    for (const fn of this.listeners) {
      fn(this._state)
    }
  }

  /** Destroy the engine */
  dispose(): void {
    cancelAnimationFrame(this.rafId)
    this.stopSource()
    this.ctx?.close()
    this.ctx = null
    this.buffer = null
    this.listeners.clear()
    this._state = {
      duration: 0,
      currentTime: 0,
      isPlaying: false,
      isLoaded: false,
      peaks: new Float32Array(0),
    }
  }
}

// Singleton
export const audioEngine = new AudioEngineImpl()
