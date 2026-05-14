import { useRef, useEffect, useCallback } from 'react'
import { useEditor } from '../../stores/editor'
import { useProject } from '../../stores/project'
import { useAudio } from '../../stores/audio'

const LANE_HEIGHT = 28
const HEADER_HEIGHT = 28
const WAVEFORM_HEIGHT = 40
const PIXELS_PER_SECOND = 80

export default function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const editor = useEditor()
  const project = useProject((s) => s.project)
  const audio = useAudio((s) => s.state)

  const { playhead, visibleRange, timelineZoom, snapGrid } = editor
  const seek = useAudio((s) => s.seek)

  const totalLanes = 4
  const lanesOffset = audio.isLoaded ? WAVEFORM_HEIGHT : 0

  // Scroll/zoom handling
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.metaKey || e.ctrlKey) {
        const zoom = editor.timelineZoom * (e.deltaY < 0 ? 1.1 : 0.9)
        useEditor.getState().setZoom(zoom)
      } else {
        const delta = e.deltaY > 0 ? 1 : -1
        useEditor.getState().panRange(delta)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [editor.timelineZoom])

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.parentElement!.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = rect.width + 'px'
    canvas.style.height = rect.height + 'px'

    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const pps = PIXELS_PER_SECOND * timelineZoom

    // Clear
    ctx.fillStyle = '#f6f2ed'
    ctx.fillRect(0, 0, w, h)

    const [startSec, endSec] = visibleRange
    const beatDuration = 60 / project.bpm

    // ── Waveform (if audio loaded) ──
    if (audio.isLoaded && audio.peaks.length > 0) {
      const peaks = audio.peaks
      const peakAreaW = w - HEADER_HEIGHT

      // Background
      ctx.fillStyle = 'rgba(229, 222, 213, 0.6)'
      ctx.fillRect(HEADER_HEIGHT, 0, peakAreaW, WAVEFORM_HEIGHT)

      // Draw waveform bars
      const barWidth = Math.max(peakAreaW / peaks.length, 1)
      const mid = WAVEFORM_HEIGHT / 2

      for (let i = 0; i < peaks.length; i++) {
        const peakX = HEADER_HEIGHT + i * barWidth
        if (peakX > w) break

        const peakHeight = peaks[i] * (WAVEFORM_HEIGHT * 0.44)

        // Played portion (dimmer)
        const peakTime = (i / peaks.length) * audio.duration
        if (peakTime < playhead) {
          ctx.fillStyle = 'rgba(90, 158, 111, 0.35)'
        } else {
          ctx.fillStyle = 'rgba(53, 152, 220, 0.25)'
        }

        // Mirror waveform (top and bottom from center)
        ctx.fillRect(peakX, mid - peakHeight, barWidth - 0.5, Math.max(peakHeight * 2, 1))
      }

      // Center line
      ctx.strokeStyle = 'rgba(180, 165, 145, 0.15)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(HEADER_HEIGHT, mid)
      ctx.lineTo(w, mid)
      ctx.stroke()

      // Waveform label
      ctx.fillStyle = 'rgba(138, 130, 120, 0.4)'
      ctx.font = '9px monospace'
      ctx.textAlign = 'right'
      ctx.fillText('WAV', HEADER_HEIGHT - 4, mid + 4)

      // Separator line below waveform
      ctx.strokeStyle = 'rgba(180, 165, 145, 0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(HEADER_HEIGHT, WAVEFORM_HEIGHT)
      ctx.lineTo(w, WAVEFORM_HEIGHT)
      ctx.stroke()
    }

    // Beat grid
    const firstBeat = Math.floor(startSec / beatDuration) * beatDuration

    for (let b = firstBeat; b <= endSec; b += beatDuration) {
      const x = HEADER_HEIGHT + (b - startSec) * pps
      if (x < HEADER_HEIGHT || x > w) continue

      const beatNum = Math.round(b / beatDuration)
      if (beatNum % 4 === 0) {
        ctx.strokeStyle = 'rgba(180, 165, 145, 0.3)'
        ctx.lineWidth = 1
      } else {
        ctx.strokeStyle = 'rgba(180, 165, 145, 0.12)'
        ctx.lineWidth = 0.5
      }
      ctx.beginPath()
      ctx.moveTo(x, lanesOffset)
      ctx.lineTo(x, h)
      ctx.stroke()
    }

    // Lane backgrounds
    const laneConfigs = [
      { y: lanesOffset, label: 'R', color: 'rgba(53,152,220,0.04)', textColor: '#3598dc' },
      { y: lanesOffset + LANE_HEIGHT, label: 'L', color: 'rgba(224,79,79,0.04)', textColor: '#e04f4f' },
      { y: lanesOffset + LANE_HEIGHT * 2, label: 'OB', color: 'rgba(200,148,96,0.04)', textColor: '#c89460' },
      { y: lanesOffset + LANE_HEIGHT * 3, label: 'RAIL', color: 'rgba(201,79,214,0.04)', textColor: '#c94fd6' },
    ]

    laneConfigs.forEach(({ y, color, label, textColor }) => {
      ctx.fillStyle = color
      ctx.fillRect(HEADER_HEIGHT, y, w - HEADER_HEIGHT, LANE_HEIGHT)

      ctx.strokeStyle = 'rgba(180, 165, 145, 0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(HEADER_HEIGHT, y + LANE_HEIGHT)
      ctx.lineTo(w, y + LANE_HEIGHT)
      ctx.stroke()

      ctx.fillStyle = textColor
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(label, HEADER_HEIGHT - 6, y + LANE_HEIGHT - 8)
    })

    // Timeline header (seconds)
    const headerY = lanesOffset + totalLanes * LANE_HEIGHT
    ctx.fillStyle = 'rgba(180, 165, 145, 0.1)'
    ctx.fillRect(HEADER_HEIGHT, headerY, w - HEADER_HEIGHT, HEADER_HEIGHT)

    ctx.fillStyle = 'rgba(138, 130, 120, 0.55)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    const secInterval = timelineZoom < 0.5 ? 4 : timelineZoom < 1.5 ? 2 : 1
    for (let s = Math.floor(startSec); s <= endSec; s += secInterval) {
      const x = HEADER_HEIGHT + (s - startSec) * pps
      if (x < HEADER_HEIGHT || x > w) continue
      ctx.fillText(`${s}s`, x, headerY + 18)
    }

    // Draw notes
    const drawNote = (x: number, laneIdx: number, hand: number, isRail: boolean) => {
      const y = lanesOffset + laneIdx * LANE_HEIGHT + 4
      const hh = LANE_HEIGHT - 8
      const color = hand === 1 ? '#ef5350' : '#42a5f5'

      if (isRail) {
        ctx.fillStyle = '#9c27b0'
        ctx.fillRect(x - 3, y, 6, hh)
        ctx.strokeStyle = '#ab47bc'
        ctx.lineWidth = 1
        ctx.strokeRect(x - 3, y, 6, hh)
      } else {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(x - 3, y + 2, 6, hh - 4, 2)
        ctx.fill()
      }
    }

    for (const note of project.notes) {
      const x = HEADER_HEIGHT + (note.seconds - startSec) * pps
      if (x < HEADER_HEIGHT || x > w) continue
      const laneIdx = note.hand === 'left' ? 1 : 0
      drawNote(x, laneIdx, note.hand === 'left' ? 1 : 0, false)
    }

    for (const rail of project.rails) {
      const x = HEADER_HEIGHT + (rail.seconds - startSec) * pps
      if (x < HEADER_HEIGHT || x > w) continue
      drawNote(x, 3, rail.hand === 'left' ? 1 : 0, true)
    }

    for (const obs of project.obstacles) {
      const x = HEADER_HEIGHT + (obs.seconds - startSec) * pps
      if (x < HEADER_HEIGHT || x > w) continue
      const durPx = Math.max(obs.duration * pps / beatDuration * (60 / project.bpm), 4)
      ctx.fillStyle = '#ff9800'
      ctx.fillRect(x - 1, lanesOffset + LANE_HEIGHT * 2 + 4, durPx, LANE_HEIGHT - 8)
      ctx.strokeStyle = '#ffa726'
      ctx.lineWidth = 1
      ctx.strokeRect(x - 1, lanesOffset + LANE_HEIGHT * 2 + 4, durPx, LANE_HEIGHT - 8)
    }

    // Playhead
    if (playhead > 0 || audio.isPlaying) {
      const px = HEADER_HEIGHT + (playhead - startSec) * pps
      if (px >= HEADER_HEIGHT && px <= w) {
        ctx.strokeStyle = '#00e5ff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(px, 0)
        ctx.lineTo(px, h)
        ctx.stroke()

        ctx.strokeStyle = 'rgba(0,229,255,0.2)'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(px, 0)
        ctx.lineTo(px, h)
        ctx.stroke()
      }
    }
  }, [project, visibleRange, timelineZoom, playhead, snapGrid, audio])

  // Click to seek
  const handleClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left - HEADER_HEIGHT
    const pps = PIXELS_PER_SECOND * timelineZoom
    const time = visibleRange[0] + x / pps
    if (time >= 0) {
      useEditor.getState().setPlayhead(time)
      if (audio.isLoaded) {
        seek(time)
      }
    }
  }, [visibleRange, timelineZoom, seek, audio.isLoaded])

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative overflow-hidden"
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
      />

      {project.notes.length === 0 && project.obstacles.length === 0 && project.rails.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ paddingLeft: HEADER_HEIGHT }}
        >
          <div className="text-center">
            <div className="text-3xl mb-2">🎼</div>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text-dim)' }}>
              {project.rawData ? 'Map loaded — click or play to set position' : 'Drop a .synth file to get started'}
            </div>
            <div className="text-xs mt-2" style={{ color: 'var(--color-text-faint)' }}>
              {project.bpm} BPM · scroll=pan · ⌘scroll=zoom · Space=play
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
