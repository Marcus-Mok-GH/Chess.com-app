## 2026-08-01

- Redesigned the online friendly-game code request/waiting panel with a responsive Chess.com-inspired visual treatment, clearer invite guidance, and a one-click copy action.

## [2026-08-01] - Game Code UI Redesign

### Changed
- Redesigned `.game-code-box` in OnlinePlay with sleek glassmorphism aesthetic: dark gradient background, subtle green glow border, top-edge highlight line, radial shine overlay, and backdrop-filter blur.
- Enhanced `.game-code` badges in GameHistory and chart components with premium glow treatments.
- Split game code display into semantic label + value for better visual hierarchy.
- Added ::before/::after pseudo-elements for highlight and depth effects.
- Updated CHANGELOG.md with detailed entry.

### Files Modified
- `artifacts/chess/src/pages/OnlinePlay.css`
- `artifacts/chess/src/pages/OnlinePlay.jsx`
- `artifacts/chess/src/pages/GameHistory.css`
- `artifacts/chess/src/components/WinRateChart.css`
- `artifacts/chess/src/components/EloProgressChart.css`
