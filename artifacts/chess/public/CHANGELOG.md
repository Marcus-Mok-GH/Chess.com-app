# Changelog

## [2026-07-06] - Debugging Missing Board

### Added
- **Debug Styles**: Added a semi-transparent red background to the `ChessBoard` wrapper to verify visibility in the actual DOM.
- **Rendering Logs**: Added console logs to `ChessBoard.jsx` to track component initialization and position updates.

## [2026-07-06] - Chess Board Rendering Fix & Code Cleanup

### Fixed
- **Prop Cleanup**: Removed redundant and conflicting hybrid API (Direct + Options) in `ChessBoard.jsx` that was causing the board to be missing in deployment. Standardized on clean direct props for `react-chessboard` v5.
- **Positioning Fix**: Switched board container to `position: absolute` with `inset: 0` to ensure proper filling of the board wrapper across different viewport sizes.
- **Robust Piece Scaling**: Updated custom piece renderers to accept `squareWidth` and fallback to `100%`, fixing potential invisibility issues.
- **Universal Event Handlers**: Maintained defensive logic for board callbacks (`onPieceDrop`, `onSquareClick`, `canDragPiece`) to handle both object-destructured and positional arguments.

## [2026-07-05] - Self-Healing Chess Persistence Tables

### Changed
- **Automatic Table Creation**: Expanded startup database initialization so games, active game recovery, and match move tables create themselves and add missing persistence columns/indexes automatically.
- **Schema Alignment**: Updated the manual setup SQL to match the app-managed schema used by online refresh recovery.

## [2026-07-05] - Online Game Link Lifecycle Persistence

### Changed
- **Online Move Archiving**: Active online games now upsert each move into the permanent games table so refresh and hard-refresh recovery can use database-backed move history before a match ends.
- **Leave Handling**: Online game links now remain available while either participant is still connected and are only marked closed after both players have left or disconnected, regardless of the current match state.
- **Game Code Recovery**: Game-code lookups now fall back to active games when no archived game row exists yet.

## [2026-07-05] - Persistent Move Storage & Refresh Survival

### Added
- **Immediate DB Persistence**: Every move is now stored in the database for both bot and online matches.
- **Refresh Survival**: Improved session recovery for online games to survive page refreshes.

## [2026-07-05] - react-chessboard v5 Documentation Alignment

### Fixed
- **Options API Names**: Corrected `options` keys and added top-level `position` prop to fix board visibility.

## [2026-07-05] - react-chessboard v5 Compatibility Fix

### Fixed
- **react-chessboard v5 Migration**: Updated `ChessBoard.jsx` to use the `options` prop required by version 5.10.0 to fix the missing board issue.

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
