import { useState, useCallback } from 'react'
import { useProject } from '../../stores/project'

interface TreeNodeProps {
  keyName: string
  value: unknown
  path: string
  depth: number
}

const MAX_PREVIEW_LEN = 80
const MAX_INITIAL_DEPTH = 2

const colors = {
  key: '#42a5f5',
  string: '#a5d6a7',
  number: '#ffcc80',
  boolean: '#ce93d8',
  null: '#78909c',
  brace: 'rgba(160,180,200,0.5)',
  typeTag: 'rgba(160,180,200,0.4)',
}

function getTypeTag(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array[${value.length}]`
  if (typeof value === 'object') return `object{${Object.keys(value as object).length}}`
  return typeof value
}

function formatPrimitive(value: unknown): { text: string; color: string } {
  if (value === null) return { text: 'null', color: colors.null }
  if (typeof value === 'string') {
    const truncated = value.length > MAX_PREVIEW_LEN
      ? JSON.stringify(value.slice(0, MAX_PREVIEW_LEN)) + '…"'
      : JSON.stringify(value)
    return { text: truncated, color: colors.string }
  }
  if (typeof value === 'number') return { text: String(value), color: colors.number }
  if (typeof value === 'boolean') return { text: String(value), color: colors.boolean }
  return { text: String(value), color: colors.null }
}

function isExpandable(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  return false
}

function TreeNode({ keyName, value, path, depth }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < MAX_INITIAL_DEPTH)
  const expandable = isExpandable(value)

  const toggle = useCallback(() => {
    if (expandable) setExpanded(e => !e)
  }, [expandable])

  if (!expandable) {
    const { text, color } = formatPrimitive(value)
    return (
      <div className="flex items-start py-0.5 hover:bg-white/[0.02] min-w-0"
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        <span className="shrink-0 mr-1.5 text-xs font-mono" style={{ color: colors.key }}>
          {keyName}
        </span>
        <span className="text-xs mr-1" style={{ color: colors.brace }}>:</span>
        <span className="text-xs font-mono truncate" style={{ color }}>
          {text}
        </span>
      </div>
    )
  }

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>)

  const typeTag = getTypeTag(value)

  return (
    <div className="min-w-0">
      <div
        className="flex items-start py-0.5 hover:bg-white/[0.02] cursor-pointer select-none min-w-0"
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={toggle}
      >
        <span className="shrink-0 w-3 text-center text-xs mr-1"
          style={{ color: colors.brace }}
        >
          {expanded ? '▼' : '▶'}
        </span>
        <span className="shrink-0 mr-1.5 text-xs font-mono" style={{ color: colors.key }}>
          {keyName}
        </span>
        <span className="text-xs mr-1" style={{ color: colors.brace }}>:</span>
        {expanded ? (
          <span className="text-xs" style={{ color: colors.brace }}>
            {Array.isArray(value) ? '[' : '{'}
          </span>
        ) : (
          <span className="text-xs truncate" style={{ color: colors.typeTag }}>
            {typeTag}
          </span>
        )}
      </div>

      {expanded && (
        <>
          {entries.map(([k, v]) => (
            <TreeNode
              key={`${path}.${k}`}
              keyName={k}
              value={v}
              path={`${path}.${k}`}
              depth={depth + 1}
            />
          ))}
          <div style={{ paddingLeft: depth * 14 + 4 }}>
            <span className="text-xs" style={{ color: colors.brace }}>
              {Array.isArray(value) ? ']' : '}'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

export default function JSONTreeView() {
  const project = useProject((s) => s.project)
  const raw = project.rawData
  const format = project.format

  if (!raw) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-3xl mb-2">🔍</div>
          <div className="text-xs font-medium" style={{ color: 'var(--color-text-dim)' }}>
            No data loaded
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>
            Open a .synth file to inspect
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-2 font-mono text-xs"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="flex items-center py-0.5 mb-1">
        <span className="text-xs font-bold uppercase tracking-widest mr-2"
          style={{ color: 'var(--color-text-faint)' }}
        >Root</span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{
          background: 'rgba(66,165,245,0.1)',
          color: '#42a5f5',
        }}>{format}</span>
        <span className="text-xs ml-2" style={{ color: 'rgba(160,180,200,0.35)' }}>
          {getTypeTag(raw)}
        </span>
      </div>

      <div className="border-t mb-2" style={{ borderColor: 'rgba(100,160,255,0.06)' }} />

      {Object.entries(raw).map(([key, value]) => (
        <TreeNode
          key={key}
          keyName={key}
          value={value}
          path={`root.${key}`}
          depth={0}
        />
      ))}
    </div>
  )
}
