import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useProject, type EditorNote, type EditorObstacle } from '../../stores/project'
import { useEditor } from '../../stores/editor'

// SynthRiders playfield constants
const PLAYWIDTH = 2.0
const DEPTH = 16
const NOTE_RADIUS = 0.08
const RAIL_RADIUS = 0.04

// Helper: map beat time to z position (notes come toward player from -z)
function timeToZ(t: number, maxTime: number): number {
  if (maxTime <= 0) return 0
  // Map time range [0, maxTime] → z range [-DEPTH, 0]
  return -((t / maxTime) * DEPTH)
}

// ── Note sphere component ──

function NoteSphere({ note, maxTime }: { note: EditorNote; maxTime: number }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const isRight = note.hand === 'right'
  const z = timeToZ(note.time, maxTime)

  // Pulse animation for rails
  useFrame(() => {
    if (meshRef.current && note.type === 'rail') {
      meshRef.current.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.1)
    }
  })

  return (
    <mesh ref={meshRef} position={[note.position.x, note.position.y, z]}>
      <sphereGeometry args={[note.type === 'rail' ? NOTE_RADIUS * 1.3 : NOTE_RADIUS, 24, 24]} />
      <meshStandardMaterial
        color={isRight ? '#42a5f5' : '#ef5350'}
        emissive={isRight ? '#1565c0' : '#c62828'}
        emissiveIntensity={0.3}
        roughness={0.4}
      />
    </mesh>
  )
}

// ── Rail path component ──

function RailPath({ note, maxTime }: { note: EditorNote; maxTime: number }) {
  if (!note.rail || note.rail.controlPoints.length < 2) return null

  const points = useMemo(() => {
    const startZ = timeToZ(note.time, maxTime)
    const endZ = timeToZ(note.time + note.rail!.duration, maxTime)

    const start = new THREE.Vector3(note.position.x, note.position.y, startZ)
    const cps = note.rail!.controlPoints.map((cp, i) => {
      const t = note.time + (note.rail!.duration * (i + 1)) / (note.rail!.controlPoints.length + 1)
      return new THREE.Vector3(cp.x, cp.y, timeToZ(t, maxTime))
    })
    const end = new THREE.Vector3(
      cps.length > 0 ? cps[cps.length - 1].x : note.position.x,
      cps.length > 0 ? cps[cps.length - 1].y : note.position.y,
      endZ,
    )

    return [start, ...cps, end]
  }, [note, maxTime])

  const curve = useMemo(() => {
    return new THREE.CatmullRomCurve3(points)
  }, [points])

  const tubeGeometry = useMemo(() => {
    return new THREE.TubeGeometry(curve, Math.max(32, points.length * 8), RAIL_RADIUS, 8, false)
  }, [curve, points.length])

  const isRight = note.hand === 'right'

  return (
    <mesh geometry={tubeGeometry}>
      <meshStandardMaterial
        color={isRight ? '#42a5f5' : '#ef5350'}
        emissive={isRight ? '#1565c0' : '#c62828'}
        emissiveIntensity={0.15}
        roughness={0.5}
        transparent
        opacity={0.7}
      />
    </mesh>
  )
}

// ── Obstacle (wall) component ──

function ObstacleBox({ obstacle, maxTime }: { obstacle: EditorObstacle; maxTime: number }) {
  const z = timeToZ(obstacle.time + obstacle.duration / 2, maxTime)
  const depth = obstacle.size.d * (DEPTH / maxTime) || 1

  return (
    <mesh
      position={[obstacle.position.x, obstacle.position.y, z]}
      rotation={[
        THREE.MathUtils.degToRad(obstacle.rotation.rx),
        THREE.MathUtils.degToRad(obstacle.rotation.ry),
        THREE.MathUtils.degToRad(obstacle.rotation.rz),
      ]}
    >
      <boxGeometry args={[obstacle.size.w, obstacle.size.h, depth]} />
      <meshStandardMaterial
        color="#ff9800"
        emissive="#e65100"
        emissiveIntensity={0.2}
        roughness={0.6}
        transparent
        opacity={0.5}
        wireframe={false}
      />
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(obstacle.size.w, obstacle.size.h, depth)]} />
        <lineBasicMaterial color="#ff9800" transparent opacity={0.8} />
      </lineSegments>
    </mesh>
  )
}

// ── Player position indicator ──

function PlayerIndicator() {
  return (
    <group position={[0, 0, 1.5]}>
      {/* Head box */}
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[0.3, 0.3, 0.2]} />
        <meshStandardMaterial color="#4a5568" emissive="#1a202c" emissiveIntensity={0.2} roughness={0.8} />
      </mesh>
      {/* Hand guides */}
      <mesh position={[-0.4, 1.0, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color="#42a5f5" emissive="#1565c0" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0.4, 1.0, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color="#ef5350" emissive="#c62828" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

// ── Main component ──

export default function Preview3D() {
  const project = useProject((s) => s.project)
  const playhead = useEditor((s) => s.playhead)

  const maxTime = useMemo(() => {
    let max = project.duration || 0
    for (const n of project.notes) {
      max = Math.max(max, n.time + (n.rail?.duration || 0))
    }
    for (const o of project.obstacles) {
      max = Math.max(max, o.time + o.duration)
    }
    return max > 0 ? max : 30 // default 30 seconds
  }, [project.notes, project.rails, project.obstacles, project.duration])

  const allNotes = useMemo(() => {
    return [...project.notes, ...project.rails]
  }, [project.notes, project.rails])

  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 5, 3]} intensity={0.6} />
      <pointLight position={[0, 2, 2]} intensity={0.3} color="#42a5f5" />

      {/* Playfield floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, -DEPTH / 2]}>
        <planeGeometry args={[PLAYWIDTH, DEPTH]} />
        <meshStandardMaterial color="#e5ded5" roughness={0.9} />
      </mesh>

      {/* Center line */}
      <line>
        <bufferGeometry attach="geometry">
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0.001, 1.5, 0, 0.001, -DEPTH]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#c4b8a7" transparent opacity={0.35} />
      </line>

      {/* Grid lines at intervals */}
      {Array.from({ length: Math.floor(DEPTH / 2) }, (_, i) => {
        const z = -(i * 2 + 1)
        return (
          <line key={`grid-${i}`}>
            <bufferGeometry attach="geometry">
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([-PLAYWIDTH / 2, 0.001, z, PLAYWIDTH / 2, 0.001, z]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#c4b8a7" transparent opacity={0.12} />
          </line>
        )
      })}

      {/* Side rails */}
      <line>
        <bufferGeometry attach="geometry">
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([-1, 0.001, 1.5, -1, 0.001, -DEPTH]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#b5aea5" transparent opacity={0.18} />
      </line>
      <line>
        <bufferGeometry attach="geometry">
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([1, 0.001, 1.5, 1, 0.001, -DEPTH]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#b5aea5" transparent opacity={0.18} />
      </line>

      {/* Notes */}
      {allNotes.map((note) => {
        if (note.type === 'rail') {
          return <RailPath key={note.id} note={note} maxTime={maxTime} />
        }
        return <NoteSphere key={note.id} note={note} maxTime={maxTime} />
      })}

      {/* Note spheres for rail start points (drawn last so they're on top) */}
      {project.rails.map((rail) => (
        <NoteSphere key={`railstart-${rail.id}`} note={rail} maxTime={maxTime} />
      ))}

      {/* Obstacles */}
      {project.obstacles.map((obstacle) => (
        <ObstacleBox key={obstacle.id} obstacle={obstacle} maxTime={maxTime} />
      ))}

      {/* Player indicator */}
      <PlayerIndicator />

      {/* Playhead cursor */}
      {playhead > 0 && (
        <mesh position={[0, 1, timeToZ(playhead, maxTime)]}>
          <planeGeometry args={[PLAYWIDTH, 0.03]} />
          <meshBasicMaterial color="#00e5ff" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  )
}
