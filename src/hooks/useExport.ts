import { useCallback, useState } from 'react'
import { useProject } from '../stores/project'
import { buildSynthGenJSON, buildRawBeatmap, toJSONBlob, downloadBlob, exportAsZIP } from '../synth-format/writer'

export function useExport() {
  const project = useProject(s => s.project)
  const [exporting, setExporting] = useState(false)

  const exportMap = useCallback(async () => {
    setExporting(true)
    try {
      const safeName = project.title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'untitled'

      if (project.format === 'zip') {
        // Official format → ZIP with beatmap.meta.bin
        const rawBeatmap = buildRawBeatmap({
          source: project.rawData ?? undefined,
          title: project.title,
          artist: project.artist,
          mapper: project.mapper,
          bpm: project.bpm,
          offset: project.offset,
          difficulty: project.difficulty,
          notes: project.notes,
          rails: project.rails,
          obstacles: project.obstacles,
        })

        await exportAsZIP(rawBeatmap, `${safeName}.synth`)
      } else {
        // SynthGen / Beat Saber / unknown → plain JSON
        const synthGen = buildSynthGenJSON(project, project.rawData ?? undefined)
        const blob = toJSONBlob(synthGen, true)
        downloadBlob(blob, `${safeName}.synth`)
      }
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed: ' + String(err))
    } finally {
      setExporting(false)
    }
  }, [project])

  return { exportMap, exporting }
}
