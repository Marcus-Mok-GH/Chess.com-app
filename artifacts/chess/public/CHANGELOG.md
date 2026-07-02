# Changelog

## [2026-07-02] - Full UI Theme Synchronization

### Added
- **Unified Chess.com Palette**: Synchronized all pages (Home, Play, Settings) to use the #262421 background and #312e2b card theme.
- **Improved Sidebar Navigation**: Enhanced the desktop sidebar with better hover states, active indicators, and a cleaner footer.

### Changed
- **Home Page Redesign**: Replaced legacy gradients with a clean, high-contrast layout matching the new layout.
- **Global Typography**: Standardized Nunito font across all components for a professional look.

### Fixed
- **Mobile/Desktop Transitions**: Refined the flexbox layout in AppShell to ensure content takes full width when the sidebar is present.
- **CSS Hierarchy**: Updated index.css to enforce the new theme variables and prevent Tailwind overrides.

## [2026-07-02] - Coach AI & Chess.com Theme Overhaul

### Added
- **Chess.com Inspired Landing Page**: Redesigned the landing page with a two-column hero section, featuring a live board preview and signature action buttons.
- **Desktop Sidebar Navigation**: Implemented a professional sidebar navigation for desktop views, matching the chess.com layout and improving accessibility.

### Changed
- **UI Theme Refresh**: Overhauled global styles to use the chess.com color palette (#262421 background, #81b64c green) and Nunito typography.
- **Coach AI Brevity**: Updated backend system prompts to strictly enforce short, medium-length responses (max 2-3 sentences).

### Fixed
- **Dialogue Persistence**: Reverted AI move commentary to ensure coaching feedback on the player's move persists throughout the AI's turn.
- **Mobile Responsiveness**: Improved layout transitions between desktop sidebar and mobile bottom navigation.

## [2026-06-30] - Deployment & Code Restoration Fixes

### Fixed
- **Vercel Deployment**: Resolved project naming conflicts by ensuring the project ID uses lowercase, which was causing deployment failures.
- **OnlinePlay.jsx Restored**: Restored `artifacts/chess/src/pages/OnlinePlay.jsx` which was previously truncated/corrupted.