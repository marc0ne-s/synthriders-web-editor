import { create } from 'zustand'
import { audioEngine, type AudioState } from '../audio/engine'
import { useEditor } from './editor'

interface AudioStore {
  state: AudioState
  /** Load an audio file from a File or ArrayBuffer */
  loadAudio: (file: File | ArrayBuffer) => Promise<void>
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (time: number) => void
  stop: () => void
}

export const useAudio = create<AudioStore>((_set, get) => ({
  state: audioEngine.state,

  loadAudio: async (file) => {
    await audioEngine.load(file)
    useAudio.setState({ state: audioEngine.state })
  },

  play: () => {
    audioEngine.play()
    useAudio.setState({ state: audioEngine.state })
  },

  pause: () => {
    audioEngine.pause()
    useAudio.setState({ state: audioEngine.state })
  },

  toggle: () => {
    if (get().state.isPlaying) {
      audioEngine.pause()
    } else {
      audioEngine.play()
    }
    useAudio.setState({ state: audioEngine.state })
  },

  seek: (time) => {
    audioEngine.seek(time)
    useAudio.setState({ state: audioEngine.state })
    useEditor.getState().setPlayhead(time)
  },

  stop: () => {
    audioEngine.stop()
    useAudio.setState({ state: audioEngine.state })
    useEditor.getState().stop()
  },
}))

// Subscribe to audio engine ticks — sync playhead to editor store during playback
audioEngine.subscribe((audioState) => {
  useAudio.setState({ state: audioState })
  if (audioState.isPlaying) {
    useEditor.getState().setPlayhead(audioState.currentTime)
  }
})
