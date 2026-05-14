import { useState } from 'react'
import { useProject } from '../../stores/project'
import JSONTreeView from './JSONTreeView'

type Tab = 'stats' | 'json'

export default function InspectorPanel() {
  const project = useProject((s) => s.project)
  const [tab, setTab] = useState<Tab>('stats')

  const noteCount = project.notes.length
  const railCount = project.rails.length
  const obsCount = project.obstacles.length

  const totalSeconds = project.duration || Math.max(
    0,
    ...project.notes.map(n => n.seconds + (n.rail?.duration || 0) * (60 / project.bpm)),
    ...project.obstacles.map(o => o.seconds + o.duration * (60 / project.bpm)),
  )

  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.floor(totalSeconds % 60)
  const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`

  const nps = totalSeconds > 0 ? (noteCount / totalSeconds).toFixed(1) : '0.0'
  const isLoaded = !!project.rawData

  return (
    <div className="h-full flex flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Tab bar */}
      <div className="flex border-b px-2" style={{ borderColor: 'var(--color-border)' }}>
        <TabButton active={tab === 'stats'} onClick={() => setTab('stats')} label="Stats" />
        <TabButton active={tab === 'json'} onClick={() => setTab('json')} label="JSON" />
        {isLoaded && (
          <span className="ml-auto self-center text-xs px-1.5 py-0.5 rounded"
            style={{
              background: project.dirty ? 'rgba(255,167,38,0.1)' : 'rgba(0,229,160,0.1)',
              color: project.dirty ? 'var(--color-amber)' : 'var(--color-green)',
            }}
          >
            {project.dirty ? 'dirty' : 'clean'}
          </span>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'stats' ? (
          <div className="h-full overflow-auto p-4">
            {isLoaded ? (
              <>
                <div className="mb-4">
                  <div className="text-sm font-semibold">{project.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                    {project.artist}
                  </div>
                  {project.format && (
                    <div className="text-xs mt-1 px-1.5 py-0.5 inline-block rounded"
                      style={{
                        background: project.format === 'beatsaber' ? 'rgba(255,152,0,0.1)' : 'rgba(66,165,245,0.1)',
                        color: project.format === 'beatsaber' ? '#ff9800' : '#42a5f5',
                      }}
                    >
                      {project.format}
                    </div>
                  )}
                </div>

                <div className="text-xs space-y-2 mb-4" style={{ color: 'var(--color-text-dim)' }}>
                  <div className="flex justify-between">
                    <span>BPM</span>
                    <span className="font-mono">{project.bpm}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Difficulty</span>
                    <span className="font-mono">{project.difficulty}</span>
                  </div>
                  {project.mapper && (
                    <div className="flex justify-between">
                      <span>Mapper</span>
                      <span className="font-mono truncate ml-2 max-w-[120px]">{project.mapper}</span>
                    </div>
                  )}
                </div>

                <div className="border-t pt-3 mb-4" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-widest mb-2"
                    style={{ color: 'var(--color-text-faint)' }}
                  >Statistics</div>

                  <div className="text-xs space-y-1.5" style={{ color: 'var(--color-text-dim)' }}>
                    <div className="flex justify-between">
                      <span>Notes</span>
                      <span className="font-mono">{noteCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rails</span>
                      <span className="font-mono">{railCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Obstacles</span>
                      <span className="font-mono">{obsCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Duration</span>
                      <span className="font-mono">{durationStr}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>NPS</span>
                      <span className="font-mono">{nps}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3 mb-4" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-widest mb-2"
                    style={{ color: 'var(--color-text-faint)' }}
                  >Hands</div>

                  <div className="text-xs space-y-1" style={{ color: 'var(--color-text-dim)' }}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: '#42a5f5' }} />
                        <span>Right</span>
                      </div>
                      <span className="font-mono">
                        {project.notes.filter(n => n.hand === 'right').length}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: '#ef5350' }} />
                        <span>Left</span>
                      </div>
                      <span className="font-mono">
                        {project.notes.filter(n => n.hand === 'left').length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3 mt-auto" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="text-xs font-semibold uppercase tracking-widest mb-2"
                    style={{ color: 'var(--color-text-faint)' }}
                  >File</div>
                  <div className="text-xs space-y-1" style={{ color: 'var(--color-text-dim)' }}>
                    <div className="flex justify-between">
                      <span>Format</span>
                      <span className="font-mono">{project.format}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 h-full"
                style={{ color: 'var(--color-text-faint)' }}
              >
                <div className="text-3xl">📋</div>
                <div className="text-sm font-medium text-center">No map loaded</div>
                <div className="text-xs text-center" style={{ color: 'var(--color-text-dim)' }}>
                  Drop a .synth file on the<br />welcome screen to begin
                </div>
              </div>
            )}
          </div>
        ) : (
          <JSONTreeView />
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 text-xs font-medium transition-colors relative"
      style={{ color: active ? 'var(--color-text)' : 'var(--color-text-faint)' }}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded"
          style={{ background: 'var(--color-blue)' }}
        />
      )}
    </button>
  )
}
