import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProject, parseSynthJSON } from '../stores/project'
import { loadBeatmapMeta } from '../synth-format/quest-crypto'
import { useEditor } from '../stores/editor'

export default function WelcomeScreen() {
  const navigate = useNavigate()
  const { clear, setProject } = useProject()
  const { setScreen } = useEditor()
  const [loadingFile, setLoadingFile] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      void tryLoadFile(e.dataTransfer.files[0])
    }
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      void tryLoadFile(e.target.files[0])
    }
  }, [])

  const tryLoadFile = async (file: File) => {
    setLoadingFile(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())

      // Check if ZIP (PK magic bytes)
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B

      if (isZip) {
        // ZIP-wrapped .synth (official editor / Quest format)
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(bytes)

        // Try beatmap.meta.bin with auto-detection (plain JSON or Quest-encrypted)
        const metaBin = zip.file('beatmap.meta.bin')
        if (metaBin) {
          try {
            const raw = await loadBeatmapMeta(metaBin)
            if (raw) {
              const parsed = parseSynthJSON(raw, file.name)
              setProject(parsed)
              setScreen('editor')
              navigate('/editor')
              return
            }
          } catch (err) {
            console.warn('beatmap.meta.bin is encrypted or unreadable:', err)
          }
        }

        // Try synthriderz.meta.json fallback
        const metaJson = zip.file('synthriderz.meta.json')
        if (metaJson) {
          const data = await metaJson.async('text')
          const raw = JSON.parse(data)
          // This is usually just {id, hash} — extract what we can
          setProject({
            title: file.name.replace('.synth', ''),
            artist: 'Unknown',
            bpm: 120,
            difficulty: 'Expert',
            rawData: raw,
          })
          setScreen('editor')
          navigate('/editor')
          return
        }

        alert('ZIP archive found but no readable metadata inside.\nThe map may be Quest-encrypted. Try a different file.')
      } else {
        // Plain JSON .synth (Beat Saber converter / SynthGen format)
        const text = new TextDecoder().decode(bytes)
        const raw = JSON.parse(text)
        const parsed = parseSynthJSON(raw, file.name)
        setProject(parsed)
        setScreen('editor')
        navigate('/editor')
      }
    } catch (err) {
      console.error(err)
      alert('Failed to load .synth file: ' + String(err))
    } finally {
      setLoadingFile(false)
    }
  }

  const handleNewBlank = () => {
    clear()
    setScreen('editor')
    navigate('/editor')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-10 p-8">
      {/* Brand */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-center"
      >
        <div className="inline-block w-20 h-20 rounded-xl mb-6"
          style={{
            background: 'linear-gradient(135deg, #c94fd6, #00b8d4)',
            boxShadow: '0 0 30px rgba(0,184,212,0.1), inset 0 0 20px rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex items-center justify-center h-full text-3xl font-bold text-white">◈</div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          SYNTH<span style={{ color: 'var(--color-cyan)' }}>RIDERS</span>
        </h1>
        <p className="mt-3 text-base" style={{ color: 'var(--color-text-dim)' }}>
          Cross-platform beatmap editor for VR rhythm
        </p>
      </motion.div>

      {/* Drop Zone */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="w-full max-w-xl rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer relative transition-colors duration-150"
        style={{
          borderColor: dragOver ? 'rgba(0, 184, 212, 0.3)' : 'var(--color-border)',
          background: dragOver
            ? 'linear-gradient(145deg, rgba(0,184,212,0.05), var(--color-bg-elev))'
            : 'linear-gradient(145deg, var(--color-bg-card), var(--color-bg-elev))',
        }}
      >
        {loadingFile && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#f6f2ed]/80 rounded-2xl z-10">
            <div className="text-sm font-medium flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--color-cyan)', borderTopColor: 'transparent' }} />
              Loading…
            </div>
          </div>
        )}
        <div className="text-5xl mb-4">🎵</div>
        <h3 className="text-xl font-semibold mb-2">Drop a .synth map file</h3>
        <p style={{ color: 'var(--color-text-dim)' }} className="mb-6">
          Supports plain JSON and ZIP format maps
        </p>
        <div className="flex gap-3 justify-center">
          <input
            type="file"
            accept=".synth"
            id="synth-file-input"
            onChange={handleFileInput}
            className="hidden"
          />
          <label
            htmlFor="synth-file-input"
            className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all hover:brightness-110 cursor-pointer"
            style={{
              background: 'rgba(0, 184, 212, 0.08)',
              border: '1px solid rgba(0, 184, 212, 0.15)',
              color: 'var(--color-cyan)',
            }}
          >Browse Files</label>
          <button
            onClick={handleNewBlank}
            className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all hover:brightness-110"
            style={{
              background: 'rgba(0, 229, 160, 0.08)',
              border: '1px solid rgba(0, 229, 160, 0.15)',
              color: 'var(--color-green)',
            }}
          >New Blank Map</button>
        </div>
      </motion.div>

      {/* Footer shortcuts */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex gap-6 text-xs"
        style={{ color: 'var(--color-text-faint)' }}
      >
        <span>⌘K Command Palette</span>
        <span>⌘O Open Map…</span>
        <span>⌘, Settings</span>
      </motion.div>
    </div>
  )
}
