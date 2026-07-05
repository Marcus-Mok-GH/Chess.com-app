# Changelog

## [2026-07-05] - Persistent Move Storage & Refresh Survival

### Added
- **Immediate DB Persistence**: Updated both local (bot) and online game logic to save every move to the database immediately, ensuring no data loss on sudden refreshes.
- **Online Session Recovery**: Implemented `localStorage` persistence for `playerId` and `playerColor` in `OnlinePlay.jsx` to allow players to resume matches after a page reload.
- **Hybrid State Loading**: `OnlineChessGame.jsx` now performs an initial state fetch from the database via REST API to ensure the board is populated instantly while waiting for the socket connection.

## [2026-07-05] - react-chessboard v5 Documentation Alignment

### Fixed
- **Options API Names**: Reverted `options` prop keys to `boardOrientation`, `animationDurationInMs`, `darkSquareStyle`, `lightSquareStyle`, `pieces`, and `squareStyles` based on official v5 documentation snapshot to fix visibility issues.
- **Reactivity Fix**: Added `position` as both a top-level prop and an `options` entry to ensure the board re-renders on state changes.

## [2026-07-05] - react-chessboard v5 Compatibility Fix

### Fixed
- **react-chessboard v5 Migration**: Updated `ChessBoard.jsx` to use the `options` prop required by version 5.10.0. Fixed property names (`orientation`, `customPieces`, `customSquareStyles`, `animationDuration`) and updated callback signatures (`onSquareClick`, `onPieceDrop`, `isDraggablePiece`) to match the new API, resolving the issue where the board was missing in games.

## [2026-07-03] - Deep Layout & Overflow Resolution

### Fixed
- **Game Page Overflow**: Completely overhauled `ChessGame.css` and `Analysis.css` with flexible flexbox rules (`min-width: 0`, `flex: 1`) to prevent the board and sidebar from exceeding viewport width.
- **Mobile Board Scaling**: Constrained board dimensions using `max-width: min(700px, 80svh)` to ensure the game remains visible and scroll-free on all mobile devices.
- **Sidebar Flexibility**: Removed fixed widths from game sidebars, allowing them to shrink gracefully on medium screens before switching to mobile layout.
- **Online Component Styling**: Added robust CSS for online-only elements (Chat, Reactions, Game Info) to ensure they respect the sidebar container bounds.
- **Box Model Enforcement**: Applied `box-sizing: border-box` globally to all elements and pseudo-elements to prevent padding-induced overflow.
- **Bot Grid Responsiveness**: Refined the bot selection grid to use `auto-fit` with smaller minimum widths for better compatibility with small phones.

## [2026-07-03] - Global Mobile & Desktop Optimization

### Changed
- **Responsive Shell**: Updated main application layout to use `100svh` for consistent full-screen height across mobile browsers without address bar interference.
- **Safe Area Integration**: Implemented `env(safe-area-inset-*)` padding for mobile headers and navigation to support modern notched devices.
- **Theme Variable Migration**: Replaced all remaining hardcoded hex colors in page stylesheets with centralized theme variables (`--color-bg-primary`, etc.).
- **Touch Targets**: Standardized all buttons and interactive elements to a minimum height of 44px for improved mobile usability.
- **Premium UI Effects**: Added backdrop-blur and semi-transparent backgrounds to mobile navigation bars.
- **Layout Scaling**: Refined landing page and setup cards to better handle tablet and small-phone resolutions.

## [2026-07-03] - Gameplay UI Fix & Theme Integration (Wingman Update)

### Fixed
- **react-chessboard Integration**: Updated `ChessBoard` component to pass props directly to `react-chessboard`, fixing a critical rendering issue where the board appeared unstyled or broken.
- **Missing Theme Variables**: Defined global CSS variables for radii (`--radius-lg`, etc.), shadows, and transitions in `index.css` to fix "unstyled" elements across the app.
- **Mobile Layout Overlap**: Implemented CSS rules for `.hide-bottom-nav` in `App.css` to prevent the main navigation from overlapping game controls on mobile devices.
- **Online Game Styling**: Added missing CSS imports to `OnlineChessGame` to ensure online matches inherit the professional gameplay layout.
- **Layout Spacing**: Adjusted main content padding to prevent UI elements from being cut off by the navigation bars on smaller screens.

## [2026-07-03] - Gameplay UI Fix & Theme Integration

### Fixed
- **Gameplay Layout**: Restored and standardized the layout for the active gameplay page. Fixed the "unstyle" issue where sub-components (Player Bar, Move History, Game Controls) were missing their CSS rules after the theme migration.
- **Variable Alignment**: Replaced legacy `hsl(var(...))` calls with the new standardized hex-based theme variables (`var(--color-bg-primary)`, etc.) to ensure consistent rendering across all browsers.
- **Mobile Responsiveness**: Refined the flexbox stacking for mobile devices, ensuring the board and sidebar adjust correctly on smaller screens.

## [2026-07-03] - Global Theme Standardization

### Changed
- **Unified Chess.com Theme**: Standardized colors and fonts across all pages (Analysis, Changelog, Game History, Login, Online Play, Play, and Settings) using central theme variables in `index.css`.
- **Global Typography**: Enforced Nunito font and heavy weight (800) for all headings to match the Chess.com brand identity.
- **Background Consistency**: Set a unified dark background (`#262421`) and card color (`#2f2d2a`) across the entire application for a seamless user experience.

## [2026-07-03] - UI Refinement & Gameplay Focus

### Fixed
- **Bot Selector Styling**: Improved the bot selection grid with more compact, responsive cards and dedicated CSS module (`BotSelector.css`) for better visual balance on the setup page.
- **Gameplay UI Clutter**: Removed the redundant bot selection list from the in-game sidebar to provide a cleaner, distraction-free environment during active matches.


## [2026-07-03] - Login Redirect Fix & Landing Page Enhancement

### Changed
- **ProtectedRoute Redirect**: Unauthenticated users clicking login-required buttons are now redirected to `/login` instead of the landing page (`/`).
- **Landing Page Feature Section**: Added a responsive 6-card feature grid below the hero section highlighting Play Computer, Play Online, Analysis Board, Game Archive, ELO Rating, and Custom Settings. Styled to match the chess.com dark theme with a 3→2↑ column responsive layout.

## [2026-07-02] - Full UI Theme Synchronization

### Added
- **Unified Chess.com Palette**: Synchronized all pages (Home, Play, Settings) to use the #262421 background and #312e2b card theme.
- **Improved Sidebar Navigation**: Enhanced the desktop sidebar with better hover states, active indicators, and a cleaner footer.

### Changed
- **Home Page Redesign**: Replaced legacy gradients with a clean, high-contrast layout matching the new landing page.
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
