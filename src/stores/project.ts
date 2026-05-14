import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ── Raw data types (mirrors .synth JSON structure) ──

export interface NoteData {
  /** beat time (seconds or beats depending on format) */
  t: number
  /** position [x, y, z] */
  p: [number, number, number]
  /** hand: 0 = right/blue, 1 = left/red */
  h: number
  /** direction: 0=omni, 1-8=arrow directions */
  d?: number
}

export interface RailData {
  t: number
  p: [number, number, number]
  h: number
  /** duration in beats */
  d: number
  /** control points for rail path */
  cp: [number, number, number][]
}

export interface ObstacleData {
  t: number
  p: [number, number, number]
  /** size [w, h, d] */
  s: [number, number, number]
  /** rotation [rx, ry, rz] in degrees */
  r: [number, number, number]
  /** duration in beats */
  d: number
}

// ── Editor-friendly derived types ──

export interface EditorNote {
  id: string
  /** beat time */
  time: number
  /** seconds (derived from BPM) */
  seconds: number
  position: { x: number; y: number; z: number }
  hand: 'left' | 'right'
  type: 'standard' | 'rail'
  direction: number
  /** rail data if this note starts a rail */
  rail?: { duration: number; controlPoints: { x: number; y: number; z: number }[] }
}

export interface EditorObstacle {
  id: string
  time: number
  seconds: number
  position: { x: number; y: number; z: number }
  size: { w: number; h: number; d: number }
  rotation: { rx: number; ry: number; rz: number }
  duration: number
}

export type DifficultyName = 'Easy' | 'Normal' | 'Hard' | 'Expert' | 'Master' | 'Custom'

export interface ProjectState {
  path: string | null
  title: string
  artist: string
  mapper: string
  bpm: number
  offset: number
  duration: number
  difficulty: DifficultyName
  notes: EditorNote[]
  rails: EditorNote[]
  obstacles: EditorObstacle[]
  /** format of the loaded file: 'synthgen', 'beatsaber', 'zip', 'unknown' */
  format: string
  /** raw file for round-trip saving */
  rawData: Record<string, unknown> | null
  dirty: boolean
}

// ── Helpers ──

let noteIdCounter = 0
function nextId(): string {
  return `note_${++noteIdCounter}_${Date.now()}`
}

function resetIdCounter(): void {
  noteIdCounter = 0
}

export function beatToSecond(beat: number, bpm: number): number {
  return beat * 60 / bpm
}

// ── Beat Saber converter format ──

interface BSMapNote {
  m_time: number
  m_lineIndex: number
  m_lineLayer: number
  m_type: number // 0=red/left, 1=blue/right in BS convention
  m_cutDirection: number // 0-8
}

interface BSMapObstacle {
  m_time: number
  m_lineIndex: number
  m_type: number // 0=full wall, 1=duck/crouch
  m_duration: number
  m_width: number
}

interface BSMapBookmark {
  name: string
  time: number
}

/** Convert a Beat Saber converter .synth to editor objects */
function parseBeatSaberJSON(raw: Record<string, unknown>, filename?: string): Partial<ProjectState> {
  resetIdCounter()

  const title = (raw.m_songName as string) || filename?.replace('.synth', '') || 'Untitled'
  const artist = (raw.m_authorName as string) || 'Unknown'
  const subName = (raw.m_songSubName as string) || ''
  const bpm = (raw.m_beatsPerMinute as number) || 120
  const offset = (raw.m_timeOffset as number) || 0
  const version = (raw.m_version as string) || '2'

  // Beat Saber grid constants → SynthRiders playfield coordinates
  // BS grid: lineIndex 0-3 (left to right), lineLayer 0-2 (bottom to top)
  const GRID_X = { min: -1.5, max: 1.5, lanes: 4 } // 4 lanes, -1.5 to 1.5
  const GRID_Y = { min: 0.4, max: 2.2, layers: 3 } // 3 layers, 0.4 to 2.2
  const LANE_WIDTH = (GRID_X.max - GRID_X.min) / (GRID_X.lanes - 1)
  const LAYER_HEIGHT = (GRID_Y.max - GRID_Y.min) / (GRID_Y.layers - 1)

  const rawNotes = (raw.m_notes || []) as BSMapNote[]
  const notes: EditorNote[] = rawNotes.map((n: BSMapNote) => {
    const x = GRID_X.min + n.m_lineIndex * LANE_WIDTH
    const y = GRID_Y.min + n.m_lineLayer * LAYER_HEIGHT

    // BS convention: m_type 0=red(left), 1=blue(right) — opposite of SR
    const hand = n.m_type === 0 ? 'left' : 'right'

    return {
      id: nextId(),
      time: n.m_time + offset,
      seconds: beatToSecond(n.m_time + offset, bpm),
      position: { x, y, z: 0 },
      hand,
      type: 'standard' as const,
      direction: n.m_cutDirection,
    }
  })

  const rawObs = (raw.m_obstacles || []) as BSMapObstacle[]
  const obstacles: EditorObstacle[] = rawObs.map((o: BSMapObstacle, i: number) => {
    const x = GRID_X.min + o.m_lineIndex * LANE_WIDTH
    const width = o.m_width * LANE_WIDTH
    // m_type: 0=full height wall, 1=duck/crouch wall
    const height = o.m_type === 1 ? 0.6 : 3.0
    const y = o.m_type === 1 ? 0.3 : height / 2

    return {
      id: `obs_${i}`,
      time: o.m_time + offset,
      seconds: beatToSecond(o.m_time + offset, bpm),
      position: { x, y, z: 0 },
      size: { w: width, h: height, d: 1.0 },
      rotation: { rx: 0, ry: 0, rz: 0 },
      duration: o.m_duration,
    }
  })

  // Estimate duration from last note or obstacle
  let duration = 0
  for (const n of notes) duration = Math.max(duration, n.time + 0.5)
  for (const o of obstacles) duration = Math.max(duration, o.time + o.duration)
  const bookmarkTimes = ((raw.m_bookmarks || []) as BSMapBookmark[]).map(b => b.time)
  for (const t of bookmarkTimes) duration = Math.max(duration, t)

  return {
    path: null,
    title: `${title}${subName ? ` (${subName})` : ''}`,
    artist,
    mapper: `Beat Saber v${version}`,
    bpm,
    offset,
    duration: Math.ceil(duration),
    difficulty: 'Expert',
    notes,
    rails: [],
    obstacles,
    rawData: raw,
    format: 'beatsaber',
    dirty: false,
  }
}

// ── SynthGen format ──

/** Parse SynthGen-format .synth into editor objects */
function parseSynthGenJSON(raw: Record<string, unknown>, filename?: string): Partial<ProjectState> {
  resetIdCounter()

  const meta = (raw.metadata || {}) as Record<string, unknown>
  const title = (meta.title || filename?.replace('.synth', '') || 'Untitled') as string
  const artist = (meta.artist || 'Unknown') as string
  const mapper = (meta.mapper || 'Unknown') as string
  const bpm = (meta.bpm || 120) as number
  const offset = (meta.offset || 0) as number
  const duration = (meta.duration || 0) as number

  const rawNotes = (raw.notes || []) as NoteData[]
  const notes: EditorNote[] = rawNotes.map((n: NoteData) => ({
    id: nextId(),
    time: n.t,
    seconds: beatToSecond(n.t + offset, bpm),
    position: { x: n.p[0], y: n.p[1], z: n.p[2] },
    hand: n.h === 1 ? 'left' : 'right',
    type: 'standard' as const,
    direction: n.d || 0,
  }))

  const rawRails = (raw.rails || []) as RailData[]
  const rails: EditorNote[] = rawRails.map((r: RailData) => ({
    id: nextId(),
    time: r.t,
    seconds: beatToSecond(r.t + offset, bpm),
    position: { x: r.p[0], y: r.p[1], z: r.p[2] },
    hand: r.h === 1 ? 'left' : 'right',
    type: 'rail' as const,
    direction: 0,
    rail: {
      duration: r.d,
      controlPoints: r.cp.map(c => ({ x: c[0], y: c[1], z: c[2] })),
    },
  }))

  const rawObs = (raw.obstacles || []) as ObstacleData[]
  const obstacles: EditorObstacle[] = rawObs.map((o: ObstacleData, i: number) => ({
    id: `obs_${i}`,
    time: o.t,
    seconds: beatToSecond(o.t + offset, bpm),
    position: { x: o.p[0], y: o.p[1], z: o.p[2] },
    size: { w: o.s[0], h: o.s[1], d: o.s[2] },
    rotation: { rx: o.r[0], ry: o.r[1], rz: o.r[2] },
    duration: o.d,
  }))

  return {
    path: null,
    title,
    artist,
    mapper,
    bpm,
    offset,
    duration,
    difficulty: (meta.difficulty as DifficultyName) || 'Expert',
    notes,
    rails,
    obstacles,
    rawData: raw,
    format: 'synthgen',
    dirty: false,
  }
}

// ── Auto-detect format and parse ──

/** Detect format type from raw JSON keys */
export function detectFormat(raw: Record<string, unknown>): string {
  if ('m_version' in raw && 'm_songName' in raw && 'm_notes' in raw) return 'beatsaber'
  if ('metadata' in raw && ('notes' in raw || 'rails' in raw)) return 'synthgen'
  if ('version' in raw && 'notes' in raw && 'rails' in raw) return 'synthgen'
  if ('Name' in raw && 'Track' in raw) return 'zip' // extracted beatmap.meta.bin
  return 'unknown'
}

/** Parse any recognised .synth JSON format */
export function parseSynthJSON(raw: Record<string, unknown>, filename?: string): Partial<ProjectState> {
  const format = detectFormat(raw)

  if (format === 'beatsaber') {
    return parseBeatSaberJSON(raw, filename)
  }

  // SynthGen format works for both 'synthgen' and 'unknown' (try best-effort)
  return parseSynthGenJSON(raw, filename)
}

// ── Store ──

interface ProjectStore {
  project: ProjectState
  setProject: (p: Partial<ProjectState>) => void
  addNote: (n: EditorNote) => void
  removeNote: (id: string) => void
  updateNote: (id: string, patch: Partial<EditorNote>) => void
  clear: () => void
}

const empty: ProjectState = {
  path: null,
  title: 'Untitled',
  artist: 'Unknown',
  mapper: '',
  bpm: 128,
  offset: 0,
  duration: 0,
  difficulty: 'Expert',
  notes: [],
  rails: [],
  obstacles: [],
  format: 'unknown',
  rawData: null,
  dirty: false,
}

export const useProject = create<ProjectStore>()(
  subscribeWithSelector((set) => ({
    project: empty,
    setProject: (p) => set((state) => ({
      project: { ...state.project, ...p, dirty: true },
    })),
    addNote: (n) => set((state) => ({
      project: {
        ...state.project,
        notes: [...state.project.notes, n].sort((a, b) => a.time - b.time),
        dirty: true,
      },
    })),
    removeNote: (id) => set((state) => ({
      project: {
        ...state.project,
        notes: state.project.notes.filter(n => n.id !== id),
        dirty: true,
      },
    })),
    updateNote: (id, patch) => set((state) => ({
      project: {
        ...state.project,
        notes: state.project.notes.map(n => n.id === id ? { ...n, ...patch } : n),
        dirty: true,
      },
    })),
    clear: () => set({ project: empty }),
  })),
)
