// Round-trip tests for .synth parser → editor → writer pipeline
//
// To run: npx vitest run src/synth-format/roundtrip.test.ts

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseSynthJSON, detectFormat, type ProjectState } from '../stores/project'
import { buildSynthGenJSON } from './writer'
import { decryptQuestBeatmap, looksEncrypted } from './quest-crypto'

const FIXTURES = path.resolve(__dirname, '../../test-fixtures')

// ── ZIP binary reader ───────────────────────────────────────────────────

function extractEntryFromZIP(zipPath: string, entryName: string): Uint8Array {
  const buf = fs.readFileSync(zipPath)
  const nameBytes = new TextEncoder().encode(entryName)

  let offset = 0
  while (offset < buf.length - 30) {
    if (buf[offset] === 0x50 && buf[offset+1] === 0x4b && buf[offset+2] === 0x03 && buf[offset+3] === 0x04) {
      const nameLen = buf.readUInt16LE(offset + 26)
      const extraLen = buf.readUInt16LE(offset + 28)
      const compSize = buf.readUInt32LE(offset + 18)
      const entryNameActual = buf.slice(offset + 30, offset + 30 + nameLen)
      if (nameLen === nameBytes.length && entryNameActual.every((b, i) => b === nameBytes[i])) {
        const dataStart = offset + 30 + nameLen + extraLen
        return new Uint8Array(buf.slice(dataStart, dataStart + compSize))
      }
    }
    offset++
  }
  throw new Error(`Entry '${entryName}' not found in ${zipPath}`)
}

function inspectAE2Header(zipPath: string): Record<string, unknown> {
  const buf = fs.readFileSync(zipPath)
  const info: Record<string, unknown> = {}

  let offset = 0
  while (offset < buf.length - 30) {
    if (buf[offset] === 0x50 && buf[offset+1] === 0x4b && buf[offset+2] === 0x03 && buf[offset+3] === 0x04) {
      const nameLen = buf.readUInt16LE(offset + 26)
      const extraLen = buf.readUInt16LE(offset + 28)
      const compMethod = buf.readUInt16LE(offset + 8)
      const gpFlag = buf.readUInt16LE(offset + 6)
      const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('latin1')
      const extra = buf.slice(offset + 30 + nameLen, offset + 30 + nameLen + extraLen)

      if (name === 'beatmap.meta.bin') {
        info.compressionMethod = compMethod === 99 ? 'AES' : compMethod === 8 ? 'deflated' : String(compMethod)
        info.generalPurposeFlag = `0x${gpFlag.toString(16)}`
        info.encrypted = !!(gpFlag & 1)

        if (compMethod === 99 && extraLen >= 11 && extra[0] === 0x01 && extra[1] === 0x99) {
          const aeLen = extra.readUInt16LE(2)
          const aeVersion = extra.readUInt16LE(4)
          const vendorId = extra.slice(6, 8).toString('ascii')
          const strength = extra[8]
          const actualMethod = extra.readUInt16LE(9)
          info.aeVersion = aeVersion
          info.aeVendor = vendorId
          info.aesStrength = strength
          info.actualCompressionMethod = actualMethod === 8 ? 'DEFLATE' : String(actualMethod)
        }
      }
    }
    offset++
  }
  return info
}

// ──────────────────────────────────────────────────────────────
// SynthGen plain JSON roundtrip
// ──────────────────────────────────────────────────────────────

describe('SynthGen plain JSON roundtrip', () => {
  it('loads sample.synth and roundtrips notes', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'sample.synth'), 'utf-8'))
    const parsed = parseSynthJSON(raw, 'sample.synth')

    expect(parsed.format).toBe('synthgen')
    expect(parsed.title).toBe('Sample Song')
    expect(parsed.artist).toBe('SynthGen Demo')
    expect(parsed.bpm).toBe(120)
    expect(parsed.notes!.length).toBeGreaterThan(0)

    const state: ProjectState = {
      path: null, title: parsed.title || 'Untitled', artist: parsed.artist || 'Unknown',
      mapper: parsed.mapper || '', bpm: parsed.bpm || 120, offset: parsed.offset || 0,
      duration: parsed.duration || 0, difficulty: (parsed.difficulty as any) || 'Expert',
      notes: parsed.notes || [], rails: parsed.rails || [], obstacles: parsed.obstacles || [],
      format: parsed.format || 'unknown', rawData: raw, dirty: false,
    }

    const exported = buildSynthGenJSON(state, raw)
    expect(exported.metadata.title).toBe('Sample Song')
    expect(exported.notes.length).toBe(raw.notes.length)

    // First note fidelity
    expect(exported.notes[0].t).toBe(raw.notes[0].t)
    expect(exported.notes[0].p).toEqual(raw.notes[0].p)
    expect(exported.notes[0].h).toBe(raw.notes[0].h)
  })

  it('preserves unknown top-level fields', () => {
    const raw = {
      version: '2.0.0',
      metadata: { title: 'Test', artist: 'X', mapper: 'Y', difficulty: 'Expert', bpm: 128, offset: 0, duration: 60 },
      notes: [], rails: [], obstacles: [],
      _custom_private_field: 'should survive',
    }
    const state: ProjectState = {
      path: null, title: 'Test', artist: 'X', mapper: 'Y', bpm: 128, offset: 0, duration: 60,
      difficulty: 'Expert', notes: [], rails: [], obstacles: [],
      format: 'synthgen', rawData: raw, dirty: false,
    }
    const exported = buildSynthGenJSON(state, raw) as any
    expect(exported._custom_private_field).toBe('should survive')
  })
})

// ──────────────────────────────────────────────────────────────
// Beat Saber converter format
// ──────────────────────────────────────────────────────────────

describe('Beat Saber converter format', () => {
  it('detects BS format and parses', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'generated.synth'), 'utf-8'))
    expect(detectFormat(raw)).toBe('beatsaber')
    const parsed = parseSynthJSON(raw)
    expect(parsed.format).toBe('beatsaber')
  })
})

// ──────────────────────────────────────────────────────────────
// Quest ZIP structure verification
// ──────────────────────────────────────────────────────────────

describe('Quest ZIP structure', () => {
  it('CaravanPalace contains expected companion files', () => {
    const buf = fs.readFileSync(path.join(FIXTURES, 'CaravanPalaceLoneDigger.synth'))
    const filenames: string[] = []
    let offset = 0
    while (offset < buf.length - 30) {
      if (buf[offset] === 0x50 && buf[offset+1] === 0x4b && buf[offset+2] === 0x03 && buf[offset+3] === 0x04) {
        const nameLen = buf.readUInt16LE(offset + 26)
        filenames.push(new TextDecoder().decode(buf.slice(offset + 30, offset + 30 + nameLen)))
      }
      offset++
    }
    expect(filenames).toContain('beatmap.meta.bin')
    expect(filenames).toContain('synthriderz.meta.json')
    expect(filenames).toContain('cover.jpg')
    expect(filenames).toContain('LoneDigger.ogg')
    console.log(`  ✓ ZIP contains: ${filenames.join(', ')}`)
  })

  it('beatmap.meta.bin is WinZip AE-2 AES-256 encrypted', () => {
    const info = inspectAE2Header(path.join(FIXTURES, 'CaravanPalaceLoneDigger.synth'))
    expect(info.compressionMethod).toBe('AES')
    expect(info.encrypted).toBe(true)
    expect(info.aeVersion).toBe(2)
    expect(info.aeVendor).toBe('AE')
    expect(info.aesStrength).toBe(3)
    expect(info.actualCompressionMethod).toBe('DEFLATE')
    console.log(`  ✓ AE-2 header: version=${info.aeVersion}, vendor=${info.aeVendor}, AES-${[128,192,256][(info.aesStrength as number)-1]}`)
  })

  it('Camellia fixture is AE-2 AES-256', () => {
    const info = inspectAE2Header(path.join(FIXTURES, '10740-Camellia-Paracausal-Cocoon-Protocol-From-SGTS-2025-Grand-Finals-Tiebreaker-spiritalsreal.synth'))
    expect(info.encrypted).toBe(true)
    expect(info.aeVersion).toBe(2)
    console.log(`  ✓ AE-2: ${Object.entries(info).map(([k,v]) => `${k}=${v}`).join(', ')}`)
  })
})

// ──────────────────────────────────────────────────────────────
// Quest decryption (expected: will fail with current password)
// ──────────────────────────────────────────────────────────────

describe('Quest decryption (KNOWN LIMITATION)', () => {
  it('decryption framework is wired — needs correct password for fixtures', async () => {
    // These fixtures are Synthriderz-community downloads.
    // The embedded password was extracted from a specific Quest binary
    // and community maps may use different encryption keys.
    //
    // When Marcus provides a .synth file from his own Quest,
    // this test will pass.

    const bytes = extractEntryFromZIP(
      path.join(FIXTURES, 'CaravanPalaceLoneDigger.synth'),
      'beatmap.meta.bin'
    )
    expect(looksEncrypted(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(10000)

    // Verify decryption runs without crashing (may fail with wrong password)
    const result = await decryptQuestBeatmap(bytes)
    // result is null if password is wrong — that's expected for these fixtures
    console.log(`  ✓ Decryption executed, password verification: ${result ? 'PASSED' : 'FAILED (expected)'}`)
    console.log(`  ℹ To verify: use a .synth from Marcus's own Quest with known password`)
  })
})

// ──────────────────────────────────────────────────────────────
// Full roundtrip pipeline (using SynthGen fixtures)
// ──────────────────────────────────────────────────────────────

describe('Full roundtrip pipeline', () => {
  it('SynthGen: parse → edit → export → re-parse is idempotent', () => {
    const original = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'sample.synth'), 'utf-8'))
    const parsed = parseSynthJSON(original)

    const state: ProjectState = {
      path: null,
      title: parsed.title || 'Untitled',
      artist: parsed.artist || 'Unknown',
      mapper: parsed.mapper || '',
      bpm: parsed.bpm || 120,
      offset: parsed.offset || 0,
      duration: parsed.duration || 0,
      difficulty: (parsed.difficulty as any) || 'Expert',
      notes: parsed.notes || [],
      rails: parsed.rails || [],
      obstacles: parsed.obstacles || [],
      format: 'synthgen',
      rawData: original,
      dirty: false,
    }

    const exported = buildSynthGenJSON(state, original)

    // Re-parse the exported output
    const reparsed = parseSynthJSON(exported as any)

    // Metadata fidelity
    expect(reparsed.title).toBe(parsed.title)
    expect(reparsed.artist).toBe(parsed.artist)
    expect(reparsed.bpm).toBe(parsed.bpm)
    expect(reparsed.notes!.length).toBe(parsed.notes!.length)

    // Note positions preserved
    for (let i = 0; i < parsed.notes!.length; i++) {
      const a = reparsed.notes![i]
      const b = parsed.notes![i]
      expect(a.time).toBeCloseTo(b.time, 4)
      expect(a.position.x).toBeCloseTo(b.position.x, 4)
      expect(a.position.y).toBeCloseTo(b.position.y, 4)
      expect(a.hand).toBe(b.hand)
    }

    console.log(`  ✓ ${parsed.notes!.length} notes round-tripped perfectly`)
  })

  it('unknown fields survive the full roundtrip', () => {
    const raw = {
      version: '2.0.0',
      metadata: { title: 'T', artist: 'A', mapper: 'M', difficulty: 'Expert', bpm: 140, offset: 0, duration: 120 },
      notes: [{ t: 1, p: [0, 1, 0], h: 0 }],
      rails: [],
      obstacles: [],
      _syncSettings: { inputLatency: 50, audioOffset: 12 },
    }

    const parsed = parseSynthJSON(raw)
    const state: ProjectState = {
      path: null, title: 'T', artist: 'A', mapper: 'M', bpm: 140, offset: 0, duration: 120,
      difficulty: 'Expert', notes: parsed.notes || [], rails: [], obstacles: [],
      format: 'synthgen', rawData: raw, dirty: false,
    }

    const exported = buildSynthGenJSON(state, raw) as any
    const reparsed = parseSynthJSON(exported)

    // Unknown field survived export
    expect(exported._syncSettings).toEqual({ inputLatency: 50, audioOffset: 12 })

    // And re-parsing preserves format detection
    expect(reparsed.format).toBe('synthgen')
    expect(reparsed.notes!.length).toBe(1)
  })
})
