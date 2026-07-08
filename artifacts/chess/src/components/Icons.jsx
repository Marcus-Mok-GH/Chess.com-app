// Lightweight inline SVG icons — chess.com-style, single-stroke or filled.
// Keep these dependency-free so they work in any bundler.

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const filled = {
  fill: 'currentColor',
  stroke: 'none',
}

export function LogoMark({ size = 22 }) {
  // chess.com-style: a knight/pawn-inspired mark in the brand green
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#81b64c" />
      <path
        d="M9 22 L9 13 C9 10.5 11 8.5 13.5 8.5 C14.4 8.5 15.2 8.8 15.8 9.3 L18 7 L19.5 8.5 L17.5 10.5 C18.4 11.4 19 12.6 19 14 C19 15.5 18.3 16.8 17.2 17.7 L23 23.5 L20.5 26 L14.5 20 L11 20 L11 22 Z"
        fill="#fff"
      />
    </svg>
  )
}

export function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3 11.5 L12 4 L21 11.5" />
      <path d="M5 10 V20 H19 V10" />
      <path d="M10 20 V14 H14 V20" />
    </svg>
  )
}

export function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5 L16 12 L10 15.5 Z" {...filled} />
    </svg>
  )
}

export function OnlineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12 H21" />
      <path d="M12 3 C15 6 17 9 17 12 C17 15 15 18 12 21 C9 18 7 15 7 12 C7 9 9 6 12 3" />
    </svg>
  )
}

export function ArchiveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8 V20 H19 V8" />
      <path d="M10 12 H14" />
    </svg>
  )
}

export function AnalysisIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M16 16 L21 21" />
      <path d="M8 11 H14" />
      <path d="M11 8 V14" />
    </svg>
  )
}

export function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

export function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M13 2 L4 14 H11 L10 22 L20 10 H13 Z" {...filled} />
    </svg>
  )
}

export function RobotIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 4 V8" />
      <circle cx="12" cy="3" r="1" {...filled} />
      <circle cx="9" cy="14" r="1.2" {...filled} />
      <circle cx="15" cy="14" r="1.2" {...filled} />
      <path d="M2 14 H4" />
      <path d="M20 14 H22" />
    </svg>
  )
}
