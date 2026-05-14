import { useRef, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { useHotkeys } from 'react-hotkeys-hook'
import { useProject } from '../stores/project'
import { useEditor } from '../stores/editor'
import { useAudio } from '../stores/audio'
import Timeline from '../components/timeline/Timeline'
import Playhead from '../components/timeline/Playhead'
import Preview3D from '../components/preview/Preview3D'
import InspectorPanel from '../components/inspector/InspectorPanel'
import CommandPalette from '../components/command/CommandPalette'
import AIPalette from '../components/ai/AIPalette'
import { useExport } from '../hooks/useExport'

export default function EditorScreen() {
  const project = useProject((s) => s.project)
  const { show3D, setTool, activeTool, setSnap, snapGrid } = useEditor()
  const audio = useAudio()
  const { exportMap, exporting } = useExport()
  const audioFileRef = useRef<HTMLInputElement>(null)

  const handlePlayPause = useCallback(() => {
    if (!audio.state.isLoaded) {
      // Open audio file picker if no audio loaded
      audioFileRef.current?.click()
    } else {
      audio.toggle()
    }
  }, [audio])

  const handleStop = useCallback(() => {
    audio.stop()
  }, [audio])

  useHotkeys('space', (e) => { e.preventDefault(); handlePlayPause() }, [handlePlayPause])
  useHotkeys('esc', handleStop, [handleStop])
  useHotkeys('v', () => setTool('select'), [setTool])
  useHotkeys('b', () => setTool('draw'), [setTool])
  useHotkeys('e', () => setTool('eraser'), [setTool])
  useHotkeys('g', () => setSnap(snapGrid === '1/8' ? '1/16' : snapGrid === '1/16' ? '1/4' : '1/8'), [snapGrid, setSnap])
  useHotkeys('s', (e) => { e.preventDefault(); exportMap() }, [exportMap])

  const handleAudioFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        await audio.loadAudio(file)
        audio.play()
      } catch (err) {
        console.error('Failed to load audio:', err)
        alert('Failed to load audio file: ' + String(err))
      }
    }
  }, [audio])

  return (
    <div className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Hidden audio file input */}
      <input
        ref={audioFileRef}
        type="file"
        accept=".mp3,.ogg,.wav,.flac,.m4a,.aac"
        onChange={handleAudioFile}
        className="hidden"
      />

      <CommandPalette />

      {/* Toolbar */}
      <header className="flex items-center gap-4 px-5 py-3 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold"
            style={{ background: 'linear-gradient(135deg, #c94fd6, #00b8d4)', color: 'white', boxShadow: '0 0 8px rgba(0,184,212,0.08)' }}
          >◈</div>
          <div>
            <div className="text-sm font-semibold leading-tight">
              {project.title}
              {project.dirty && (
                <span className="ml-1.5" style={{ color: 'var(--color-amber)' }}>●</span>
              )}
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-dim)' }}>
              {project.artist} · {project.bpm} BPM
              {audio.state.isLoaded && ` · ${audio.state.duration.toFixed(0)}s`}
            </div>
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center gap-1.5">
          <TransportButton onClick={handleStop} label="⏹" title="Stop (Esc)" disabled={!audio.state.isLoaded} />
          <TransportButton
            onClick={handlePlayPause}
            label={audio.state.isPlaying ? '⏸' : '▶'}
            title={audio.state.isLoaded ? (audio.state.isPlaying ? 'Pause (Space)' : 'Play (Space)') : 'Load Audio… (Space)'}
          />
          {!audio.state.isLoaded && (
            <span className="text-xs ml-1" style={{ color: 'var(--color-text-faint)' }}>
              Space to load audio
            </span>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
        <ToolButton active={activeTool === 'select'} onClick={() => setTool('select')} label="Select" shortcut="V" />
        <ToolButton active={activeTool === 'draw'} onClick={() => setTool('draw')} label="Draw" shortcut="B" />
        <ToolButton active={activeTool === 'eraser'} onClick={() => setTool('eraser')} label="Erase" shortcut="E" />
          <div className="w-px h-6 mx-2"
            style={{ background: 'var(--color-border)' }}
          />
          <SnapButton snap={snapGrid} onClick={() => setSnap(snapGrid === '1/8' ? '1/16' : snapGrid === '1/16' ? '1/4' : '1/8')} />
          <AIButton />
          <div className="w-px h-6 mx-2"
            style={{ background: 'var(--color-border)' }}
          />
          <ExportButton onClick={exportMap} disabled={exporting} />
        </div>
      </header>

      {/* Main body */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex overflow-hidden">
            {show3D && (
              <div className="w-80 shrink-0 border-r"
                style={{ borderColor: 'rgba(100,160,255,0.06)' }}
              >
                <div className="h-full">
                  <Canvas
                    camera={{ position: [0, 0, 5], fov: 60 }}
                    style={{ background: 'transparent' }}
                  >
                    <Preview3D />
                  </Canvas>
                </div>
              </div>
            )}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 relative overflow-hidden">
                <Timeline />
                <Playhead />
              </div>
            </div>
          </div>
        </div>

          <div className="w-72 shrink-0 border-l"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <InspectorPanel />
        </div>
      </div>

      <AIPalette />
    </div>
  )
}

// ── Subcomponents ──

function TransportButton({ onClick, label, title, disabled }: {
  onClick: () => void; label: string; title: string; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-7 h-7 rounded-md flex items-center justify-center text-xs transition-all"
        style={{
          background: 'var(--color-border)',
          border: '1px solid var(--color-border)',
          color: disabled ? 'var(--color-text-faint)' : 'var(--color-cyan)',
          opacity: disabled ? 0.4 : 1,
        }}
    >{label}</button>
  )
}

function ToolButton({ active, onClick, label, shortcut }: { active: boolean; onClick: () => void; label: string; shortcut: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-sm text-xs font-medium transition-all"
      style={{
        background: active ? 'rgba(0, 184, 212, 0.1)' : 'transparent',
        color: active ? 'var(--color-cyan)' : 'var(--color-text-dim)',
        border: active ? '1px solid rgba(0, 184, 212, 0.18)' : '1px solid transparent',
      }}
    >
      {label} <span className="ml-1 opacity-50">{shortcut}</span>
    </button>
  )
}

function SnapButton({ snap, onClick }: { snap: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-sm text-xs font-medium transition-all"
      style={{
        background: 'rgba(200, 148, 96, 0.06)',
        color: 'var(--color-amber)',
        border: '1px solid rgba(200, 148, 96, 0.12)',
      }}
    >Snap {snap}</button>
  )
}

function AIButton() {
  return (
    <button
      className="px-4 py-1.5 rounded-sm text-xs font-bold transition-all hover:brightness-110"
      style={{
        background: 'linear-gradient(135deg, rgba(201,79,214,0.1), rgba(0,184,212,0.1))',
        color: 'var(--color-magenta)',
        border: '1px solid rgba(201, 79, 214, 0.15)',
      }}
    >✨ Generate</button>
  )
}

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-1.5 rounded-sm text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-50"
      style={{
        background: 'rgba(90, 158, 111, 0.08)',
        color: 'var(--color-green)',
        border: '1px solid rgba(90, 158, 111, 0.15)',
      }}
    >{disabled ? 'Exporting…' : 'Export'}</button>
  )
}
