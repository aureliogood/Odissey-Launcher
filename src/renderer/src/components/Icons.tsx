import type { JSX } from 'react'
import logoUrl from '../assets/logo.png'

export type IconName =
  | 'play'
  | 'stop'
  | 'versions'
  | 'users'
  | 'settings'
  | 'puzzle'
  | 'search'
  | 'download'
  | 'trash'
  | 'plus'
  | 'check'
  | 'chevron'
  | 'folder'
  | 'cpu'
  | 'monitor'
  | 'refresh'
  | 'alert'
  | 'x'
  | 'external'
  | 'shield'
  | 'microsoft'
  | 'copy'
  | 'info'
  | 'sparkles'
  | 'terminal'
  | 'gamepad'
  | 'clock'
  | 'image'

interface IconProps {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20 }: IconProps): JSX.Element {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  }

  switch (name) {
    case 'play':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M8 5.5c0-.8.9-1.3 1.6-.9l9.2 5.9c.7.4.7 1.4 0 1.8l-9.2 5.9c-.7.4-1.6-.1-1.6-.9V5.5Z" />
        </svg>
      )
    case 'stop':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <rect x="6" y="6" width="12" height="12" rx="2.5" />
        </svg>
      )
    case 'versions':
      return (
        <svg {...common}>
          <path d="m12 3 8 4.4-8 4.4-8-4.4L12 3Z" />
          <path d="m4 12 8 4.4 8-4.4" />
          <path d="m4 16.6 8 4.4 8-4.4" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.4 19.4c.6-3.1 2.9-5 5.6-5s5 1.9 5.6 5" />
          <path d="M16 5.4a3 3 0 0 1 0 5.7M17.4 14.7c1.7.5 2.9 2.1 3.3 4.2" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
        </svg>
      )
    case 'puzzle':
      return (
        <svg {...common}>
          <path d="M9.5 4.5a2 2 0 0 1 4 0V6h1.8a2 2 0 0 1 2 2v2h1.2a2 2 0 0 1 0 4h-1.2v2a2 2 0 0 1-2 2h-2v-1.2a2 2 0 0 0-4 0V18h-2a2 2 0 0 1-2-2v-2H4.2a2 2 0 0 1 0-4h1.1V8a2 2 0 0 1 2-2h2.2V4.5Z" />
        </svg>
      )
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      )
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 4v10.5" />
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
          <path d="M5 19.5h14" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4.5 7h15M9.5 7V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3V7" />
          <path d="m6.5 7 .8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <path d="m5 12.5 4.2 4.2L19 6.8" />
        </svg>
      )
    case 'chevron':
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      )
    case 'folder':
      return (
        <svg {...common}>
          <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3l2 2.2h7A2.5 2.5 0 0 1 20.5 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5v-10Z" />
        </svg>
      )
    case 'cpu':
      return (
        <svg {...common}>
          <rect x="7" y="7" width="10" height="10" rx="2" />
          <path d="M10 2.5V5M14 2.5V5M10 19v2.5M14 19v2.5M2.5 10H5M2.5 14H5M19 10h2.5M19 14h2.5" />
        </svg>
      )
    case 'monitor':
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="18" height="12" rx="2" />
          <path d="M9 20h6M12 16.5V20" />
        </svg>
      )
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0-2.1 6.2" />
          <path d="M20 4.5V11h-6.3" />
        </svg>
      )
    case 'alert':
      return (
        <svg {...common}>
          <path d="M12 3.6 2.8 19.2c-.4.7.1 1.5.9 1.5h16.6c.8 0 1.3-.8.9-1.5L12 3.6Z" />
          <path d="M12 9v4.5M12 17h.01" />
        </svg>
      )
    case 'x':
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      )
    case 'external':
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-8.5 8.5" />
          <path d="M19 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3.2 19 6v5.4c0 4.3-2.8 7.3-7 9.4-4.2-2.1-7-5.1-7-9.4V6l7-2.8Z" />
          <path d="m9 12 2.1 2.1L15.3 10" />
        </svg>
      )
    case 'microsoft':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <rect x="3" y="3" width="8" height="8" rx="1" />
          <rect x="13" y="3" width="8" height="8" rx="1" />
          <rect x="3" y="13" width="8" height="8" rx="1" />
          <rect x="13" y="13" width="8" height="8" rx="1" />
        </svg>
      )
    case 'copy':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      )
    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      )
    case 'sparkles':
      return (
        <svg {...common}>
          <path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8 12 3.5Z" />
          <path d="M18.5 15.5 19.2 17.3 21 18l-1.8.7-.7 1.8-.7-1.8L16 18l1.8-.7.7-1.8Z" />
        </svg>
      )
    case 'terminal':
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
          <path d="m7 9 3 3-3 3M12.5 15H17" />
        </svg>
      )
    case 'gamepad':
      return (
        <svg {...common}>
          <path d="M7.5 8h9a5 5 0 0 1 4.9 6l-.4 2.1a2.4 2.4 0 0 1-4.2 1.1L15 15H9l-1.8 2.2a2.4 2.4 0 0 1-4.2-1.1L2.6 14a5 5 0 0 1 4.9-6Z" />
          <path d="M8 11v3M6.5 12.5h3M16 12h.01M18 13.5h.01" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      )
    case 'image':
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
          <circle cx="8.3" cy="9.5" r="1.6" />
          <path d="m4.5 17 4.7-4.5 3.4 3.2 2.7-2.4 4.2 3.7" />
        </svg>
      )
  }
}

export function Logo({ size = 44 }: { size?: number }): JSX.Element {
  return (
    <img
      className="logo-img"
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      draggable={false}
    />
  )
}
