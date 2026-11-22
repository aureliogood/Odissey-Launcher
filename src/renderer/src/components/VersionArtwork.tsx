import type { JSX } from 'react'
import cover115 from '../assets/version-covers/1.15.png'
import cover116 from '../assets/version-covers/1.16.png'
import cover117 from '../assets/version-covers/1.17.png'
import cover118 from '../assets/version-covers/1.18.png'
import cover119 from '../assets/version-covers/1.19.png'
import cover120 from '../assets/version-covers/1.20.png'
import cover121 from '../assets/version-covers/1.21.png'
import cover122 from '../assets/version-covers/1.22.png'
import cover26 from '../assets/version-covers/26.png'

interface VersionArtworkProps {
  version: string
}

interface Palette {
  sky: string
  far: string
  ground: string
  grass: string
  accent: string
  detail: string
}

const palettes: Palette[] = [
  { sky: '#579bc2', far: '#48718d', ground: '#4c634a', grass: '#91aa59', accent: '#d7a34c', detail: '#e8d087' },
  { sky: '#e99d92', far: '#9c6778', ground: '#536c48', grass: '#8faf59', accent: '#e6bed0', detail: '#ffe4ad' },
  { sky: '#579b9e', far: '#416f6b', ground: '#344d43', grass: '#64865c', accent: '#789888', detail: '#b6e5dd' },
  { sky: '#6ca8d0', far: '#607a9d', ground: '#526b62', grass: '#849962', accent: '#dbcfaa', detail: '#d9edee' },
  { sky: '#9b5546', far: '#663c43', ground: '#3a302e', grass: '#665b40', accent: '#ed783c', detail: '#ffd04c' },
  { sky: '#e6a85e', far: '#ae7448', ground: '#766344', grass: '#a48b4e', accent: '#d7b65e', detail: '#ffe0a0' }
]

const covers: Record<string, string> = {
  '1.15': cover115,
  '1.16': cover116,
  '1.17': cover117,
  '1.18': cover118,
  '1.19': cover119,
  '1.20': cover120,
  '1.21': cover121,
  '1.22': cover122,
  '26': cover26
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619)
  return hash >>> 0
}

function familyForVersion(version: string): number {
  if (version.startsWith('1.20')) return 1
  if (version.startsWith('1.19')) return 2
  if (version.startsWith('1.18')) return 3
  if (version.startsWith('1.16') || version.startsWith('1. nether')) return 4
  if (/^1\.[0-9](\.|$)/.test(version)) return 5
  return 0
}

function randomFrom(seed: number): () => number {
  let state = seed || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function VersionArtwork({ version }: VersionArtworkProps): JSX.Element {
  const cover = covers[version]
  if (cover) {
    return <img className="version-art-illustration" src={cover} alt="" loading="lazy" draggable={false} />
  }

  const seed = hashString(version)
  const random = randomFrom(seed)
  const palette = palettes[familyForVersion(version)]
  const gradientId = `version-sky-${seed.toString(16)}`
  const sunX = 58 + Math.round(random() * 205)
  const sunY = 30 + Math.round(random() * 36)
  const horizon = 112 + Math.round(random() * 24)
  const peaks = Array.from({ length: 8 }, (_, index) => {
    const x = index * 48 - 14
    const peakY = 54 + Math.round(random() * 42)
    const width = 55 + Math.round(random() * 38)
    return `${x},${horizon} ${x + width / 2},${peakY} ${x + width},${horizon}`
  }).join(' ')
  const trees = Array.from({ length: 5 }, (_, index) => {
    const x = 14 + index * 68 + Math.round(random() * 25)
    const y = horizon - 4 + Math.round(random() * 19)
    const size = 12 + Math.round(random() * 12)
    const crown = index % 2 === 0 ? palette.grass : palette.accent
    return (
      <g key={`${version}-tree-${index}`} shapeRendering="crispEdges">
        <rect x={x + size * 0.42} y={y - size * 0.7} width={size * 0.22} height={size * 1.7} fill="#493d32" />
        <rect x={x} y={y - size * 1.25} width={size} height={size} fill={crown} />
        <rect x={x + size * 0.2} y={y - size * 1.48} width={size * 0.6} height={size * 0.35} fill={palette.detail} opacity=".48" />
      </g>
    )
  })
  const blocks = Array.from({ length: 14 }, (_, index) => {
    const x = Math.round(random() * 310)
    const y = horizon + 20 + Math.round(random() * 47)
    const size = 3 + Math.round(random() * 5)
    return <rect key={`${version}-block-${index}`} x={x} y={y} width={size} height={size} fill={index % 3 ? palette.detail : palette.accent} opacity={0.35 + random() * 0.4} />
  })
  const playerX = 128 + Math.round(random() * 60)
  const playerY = horizon - 13 + Math.round(random() * 13)
  const playerShirt = ['#29a8a6', '#4b87c3', '#a66fb2', '#c07842'][Math.floor(random() * 4)]
  const playerHair = ['#5b3828', '#a8703e', '#242a2b'][Math.floor(random() * 3)]

  return (
    <svg className="version-art-illustration" viewBox="0 0 320 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={palette.sky} />
          <stop offset="1" stopColor={palette.far} />
        </linearGradient>
        <linearGradient id={`${gradientId}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".4" stopColor="#090d15" stopOpacity="0" />
          <stop offset="1" stopColor="#090d15" stopOpacity=".72" />
        </linearGradient>
      </defs>
      <rect width="320" height="190" fill={`url(#${gradientId})`} />
      <circle cx={sunX} cy={sunY} r={15 + Math.round(random() * 10)} fill={palette.detail} opacity=".8" />
      <g fill="#f3eee0" opacity=".33" shapeRendering="crispEdges">
        <rect x={24 + Math.round(random() * 42)} y={24 + Math.round(random() * 18)} width="31" height="5" />
        <rect x={48 + Math.round(random() * 38)} y={29 + Math.round(random() * 18)} width="21" height="5" />
        <rect x={204 + Math.round(random() * 48)} y={19 + Math.round(random() * 27)} width="38" height="5" />
      </g>
      <polygon points={peaks} fill={palette.far} />
      <path d={`M0 ${horizon + 4} L38 ${horizon - 8} L64 ${horizon + 3} L104 ${horizon - 13} L145 ${horizon + 5} L185 ${horizon - 8} L228 ${horizon + 2} L270 ${horizon - 12} L320 ${horizon + 8} V190 H0Z`} fill={palette.ground} />
      <path d={`M0 ${horizon + 13} L49 ${horizon + 7} L88 ${horizon + 18} L143 ${horizon + 8} L194 ${horizon + 21} L247 ${horizon + 8} L320 ${horizon + 17} V190 H0Z`} fill={palette.grass} opacity=".82" />
      {trees}
      <g shapeRendering="crispEdges" opacity=".92">
        <rect x={playerX - 8} y={playerY} width="18" height="17" fill="#d4a477" />
        <rect x={playerX - 8} y={playerY} width="18" height="6" fill={playerHair} />
        <rect x={playerX - 5} y={playerY + 7} width="3" height="3" fill="#273747" />
        <rect x={playerX + 3} y={playerY + 7} width="3" height="3" fill="#273747" />
        <rect x={playerX - 11} y={playerY + 17} width="24" height="24" fill={playerShirt} />
        <rect x={playerX - 10} y={playerY + 41} width="9" height="19" fill="#24304a" />
        <rect x={playerX + 2} y={playerY + 41} width="9" height="19" fill="#24304a" />
        <rect x={playerX + 13} y={playerY + 20} width="4" height="27" fill={palette.detail} transform={`rotate(-28 ${playerX + 15} ${playerY + 20})`} />
        <rect x={playerX + 17} y={playerY + 12} width="4" height="15" fill="#b8c4cf" transform={`rotate(-28 ${playerX + 19} ${playerY + 12})`} />
      </g>
      {blocks}
      <rect width="320" height="190" fill={`url(#${gradientId}-shade)`} />
      <rect width="320" height="190" fill="#090d15" opacity=".12" />
    </svg>
  )
}
