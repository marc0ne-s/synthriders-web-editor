// .synth writer — converts editor state back to beatmap.meta.bin / SynthGen JSON
// Preserves unknown fields. Never destructive. Backup-before-write.

import type { RawBeatmap, RawNote, Segment, Difficulty } from '../types/synth'
import { Constants } from '../types/synth'
import type { EditorNote, EditorObstacle, ProjectState } from '../stores/project'

// ── Editor → Raw ──────────────────────────────────────────────────────

/** Convert an EditorNote back to a RawNote for beatmap.meta.bin */
export function editorNoteToRaw(note: EditorNote): RawNote {
  const segments: Segment[] | null = note.rail
    ? note.rail.controlPoints.map(cp => ({ Position: [cp.x, cp.y, cp.z] }))
    : null

  return {
    Id: note.id,
    ComboId: 0, // derived from grouping in parser — preserved if source available
    Position: [note.position.x, note.position.y, note.position.z],
    Segments: segments,
    Type: note.hand === 'right' ? 0 : 1,
    Direction: note.direction,
  }
}

/** Group editor notes by tick (INDEX_SCALE-based integer key) */
export function groupNotesByTick(
  notes: EditorNote[],
  bpm: number
): Record<string, RawNote[]> {
  const groups: Record<string, RawNote[]> = {}

  for (const note of notes) {
    // Convert seconds → tick (beat * INDEX_SCALE)
    const beat = (note.seconds - (note.seconds > 0 ? 0 : 0)) * bpm / 60
    const tick = Math.round(beat * Constants.INDEX_SCALE)
    const key = tick.toString()

    if (!groups[key]) groups[key] = []
    groups[key].push(editorNoteToRaw(note))
  }

  return groups
}

// ── RawBeatmap Builder ─────────────────────────────────────────────────

export interface BuildRawOptions {
  /** Original raw data to preserve unknown fields from */
  source?: Record<string, unknown>
  title: string
  artist: string
  mapper: string
  bpm: number
  offset: number
  difficulty: string // Difficulty name
  notes: EditorNote[]
  rails: EditorNote[]
  obstacles: EditorObstacle[]
}

/** Build a complete RawBeatmap from editor state, preserving unknown fields */
export function buildRawBeatmap(opts: BuildRawOptions): RawBeatmap {
  const base: Partial<RawBeatmap> = {
    Name: opts.title,
    Author: opts.artist,
    Beatmapper: opts.mapper,
    BPM: opts.bpm,
    Offset: opts.offset,
    AudioName: '',
    Artwork: '',
    AudioFrecuency: 44100,
    AudioChannels: 2,
    Track: {} as RawBeatmap['Track'],
    Effects: {} as RawBeatmap['Effects'],
    Slides: {} as RawBeatmap['Slides'],
    Lights: {} as RawBeatmap['Lights'],
    Bookmarks: { BookmarksList: [] },
    DrumSamples: {},
    FilePath: '',
    IsAdminOnly: false,
    EditorVersion: 'web-editor-0.1.0',
    CustomDifficultyName: '',
    CustomDifficultySpeed: 1,
    UsingBeatMeasure: true,
    UpdatedWithMovementPositions: false,
    ProductionMode: false,
    Tags: [],
    BeatConverted: false,
    ModifiedTime: Date.now(),
  }

  // Group all notes (standard + rails) by tick
  const allNotes: EditorNote[] = [
    ...opts.notes,
    ...opts.rails.map(r => ({ ...r, type: 'rail' as const })),
  ].sort((a, b) => a.seconds - b.seconds)

  const track = groupNotesByTick(allNotes, opts.bpm)

  // Initialize all difficulty slots
  const difficulties: Difficulty[] = ['Easy', 'Normal', 'Hard', 'Expert', 'Master', 'Custom']
  for (const diff of difficulties) {
    if (diff === opts.difficulty) {
      ;(base.Track as Record<string, unknown>)[diff] = track
    } else {
      ;(base.Track as Record<string, unknown>)[diff] = {}
    }
  }

  // Preserve unknown fields from source
  if (opts.source && typeof opts.source === 'object') {
    const knownKeys = new Set(Object.keys(base))
    for (const [key, value] of Object.entries(opts.source)) {
      if (!knownKeys.has(key)) {
        ;(base as Record<string, unknown>)[key] = value
      }
    }
  }

  return base as RawBeatmap
}

// ── SynthGen format writer ─────────────────────────────────────────────

export interface SynthGenJSON {
  version: string
  metadata: {
    title: string
    artist: string
    mapper: string
    difficulty: string
    bpm: number
    offset: number
    duration: number
  }
  notes: { t: number; p: [number, number, number]; h: number; d?: number }[]
  rails: { t: number; p: [number, number, number]; h: number; d: number; cp: [number, number, number][] }[]
  obstacles: { t: number; p: [number, number, number]; s: [number, number, number]; r: [number, number, number]; d: number }[]
}

/** Build a SynthGen-format JSON object from editor state */
export function buildSynthGenJSON(state: ProjectState, existingRaw?: Record<string, unknown>): SynthGenJSON {
  const meta = {
    title: state.title,
    artist: state.artist,
    mapper: state.mapper,
    difficulty: state.difficulty,
    bpm: state.bpm,
    offset: state.offset,
    duration: state.duration,
  }

  const notes = state.notes.map(n => ({
    t: n.time,
    p: [n.position.x, n.position.y, n.position.z] as [number, number, number],
    h: n.hand === 'left' ? 1 : 0,
    d: n.direction,
  }))

  const rails = state.rails.map(r => ({
    t: r.time,
    p: [r.position.x, r.position.y, r.position.z] as [number, number, number],
    h: r.hand === 'left' ? 1 : 0,
    d: r.rail?.duration || 0,
    cp: (r.rail?.controlPoints || []).map(cp => [cp.x, cp.y, cp.z] as [number, number, number]),
  }))

  const obstacles = state.obstacles.map(o => ({
    t: o.time,
    p: [o.position.x, o.position.y, o.position.z] as [number, number, number],
    s: [o.size.w, o.size.h, o.size.d] as [number, number, number],
    r: [o.rotation.rx, o.rotation.ry, o.rotation.rz] as [number, number, number],
    d: o.duration,
  }))

  // Preserve unknown top-level keys
  const result: SynthGenJSON & Record<string, unknown> = {
    version: '2.0.0',
    metadata: meta,
    notes,
    rails,
    obstacles,
  }

  if (existingRaw && typeof existingRaw === 'object') {
    const knownKeys = new Set(['version', 'metadata', 'notes', 'rails', 'obstacles'])
    for (const [key, value] of Object.entries(existingRaw)) {
      if (!knownKeys.has(key)) {
        result[key] = value
      }
    }
  }

  return result
}

// ── Export helpers ─────────────────────────────────────────────────────

/** Serialise a data structure to a Blob for download */
export function toJSONBlob(data: unknown, pretty = false): Blob {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  return new Blob([json], { type: 'application/json' })
}

/** Trigger a browser download for a Blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Build and download a .synth file as ZIP (official format) */
export async function exportAsZIP(
  rawBeatmap: RawBeatmap,
  filename: string,
  extraFiles?: Record<string, Blob>
): Promise<void> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // beatmap.meta.bin as JSON
  zip.file('beatmap.meta.bin', JSON.stringify(rawBeatmap))

  // Additional files (audio, artwork, etc.)
  if (extraFiles) {
    for (const [name, blob] of Object.entries(extraFiles)) {
      zip.file(name, blob)
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, filename)
}
