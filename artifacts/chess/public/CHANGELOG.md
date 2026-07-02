# Changelog

## 2.1.0 - 2026-07-02
- **Chess.com Inspired Landing Page**: Redesigned the landing page with a two-column hero section, featuring a live board preview and signature action buttons.
- **Desktop Sidebar Navigation**: Implemented a professional sidebar navigation for desktop views, matching the chess.com layout and improving accessibility.
- **UI Theme Refresh**: Overhauled global styles to use the chess.com color palette (#262421 background, #81b64c green) and Nunito typography.
- **Coach AI Brevity**: Updated backend system prompts to strictly enforce short, medium-length responses (max 2-3 sentences).
- **Dialogue Persistence**: Reverted AI move commentary to ensure coaching feedback on the player's move persists throughout the AI's turn.
- **Mobile Responsiveness**: Improved layout transitions between desktop sidebar and mobile bottom navigation.

## 2.0.5 - 2026-07-01
- Updated the chessboard integration for the current `react-chessboard` options API.
- Re-enabled drag-and-drop moves while preserving tap-to-move support for local and online games.
- Limited dragging to movable player pieces and disabled dragging on read-only boards.

## 2.0.4 - 2026-06-29
- Added "Inspired by chess.com" attribution to the landing page footer.

## 2.0.3 - 2026-06-29
- Created `README.md` with project overview and workflow rules.
- Created `agents.md` with mandatory instructions for AI agents to update the changelog after every change.

## 2.0.2 - 2026-06-29
- Implemented "Tap to Move" chessboard logic and disabled drag-and-drop to improve touch interaction reliability.
- Optimized Settings and Home screens for mobile devices with enlarged touch targets, responsive layouts, and improved spacing.
- Fixed username requirement validation and improved error feedback in the `SetUsernameModal`.
- Improved mobile UX by hiding global navigation on active game routes to maximize screen space.
- Added accessibility and performance fixes to chessboard pieces to prevent accidental click interception.

## 2.0.1 - 2026-06-21
- Fixed Stockfish AI hanging on Vercel by shimming the engine API to support both `postMessage/onmessage` and `sendCommand/print` interfaces.
- Implemented a robust initialization fallback strategy to handle Stockfish module caching issues in serverless environments.
- Increased default engine timeout to 10 seconds to better accommodate serverless cold starts.
- Added enhanced server-side logging for engine communication to assist with production troubleshooting.

## 2.0.0 - 2026-06-20
- Major architectural refactor: split monolithic files into modular components, hooks, and services.
- Bot engine modularization: extracted individual bot personalities into separate files for easier contribution and maintenance.
- Local and Online Play refactoring: deconstructed massive React components into manageable sub-units.
- Backend deconstruction: decoupled socket handlers, database services, and server configuration.
- Simplified `server/index.js` and consolidated middleware for improved readability and security.
- Version 2.0.0 marks a significant milestone in code quality and maintainability.

## 1.1.74 - 2026-06-15
- Optimized mobile and desktop UI for a more professional look.
- Fixed horizontal overflow on the landing page (hero title, stats grid).
- Refined chessboard sizing to dynamically account for header, bottom navigation, and safe area insets.
- Improved bottom navigation design with a modern active state indicator and better spacing.
- Fixed layout clipping issues on small devices (320px width) and landscape orientations.

## 1.1.73 - 2026-06-12
- Moved Stockfish engine to the server-side to resolve initialization errors and improve reliability across devices.
- Integrated a new backend route `/api/engine/move` for move calculation and hints.
- Optimized engine initialization and search parameters for serverless environments.

## 1.1.72 - 2026-05-20
- Fixed a bug where clicking "Logout" or "Sign Out" had no effect by making the `logout` function more robust.
- Added automated unit tests to ensure local session state is cleared even if remote sign-out fails.
- Guaranteed navigation to the landing page after logout to provide immediate feedback and reset the UI state.