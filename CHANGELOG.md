# Changelog

## [2026-07-06] - Authentic Chess.com Theme Overhaul

### Changed
- **UI Theme Synchronization**: Overhauled global styles to use the authentic Chess.com color palette (#302e2b background, #262421 cards/sidebar, #81b64c green).
- **Typography Refresh**: Switched to 'Nunito' as the primary font to match the classic chess.com feel.
- **Layout Refinement**: Updated sidebar, landing page, and user dashboard to align with the professional, high-contrast look of the original platform.


## [2026-07-06] - Auth Logic & OTP Verification Fix

### Fixed
- **Invalid OTP Bug**: Resolved an issue where correct OTP codes were being rejected by implementing full cookie and header forwarding in the auth proxy. This ensures that Better Auth's CSRF and verification state are preserved between the "send" and "verify" steps.
- **Request Synchronization**: Added explicit `type: 'sign-in'` and `Accept` headers to the upstream auth calls to match the standard Better Auth signature.


## [2026-07-06] - Deployment Stability Fix

### Fixed
- **Dynamic Import Errors**: Implemented a global listener for `vite:preloadError` and module fetch `TypeErrors`. This ensures that if a user has the app open during a redeploy, the app will automatically refresh to load the latest asset hashes instead of crashing with a "Failed to fetch dynamically imported module" error.


## [2026-07-06] - Mobile Optimization & react-chessboard v5 Final Fix

### Added
- **Mobile First Responsive Design**: Implemented a comprehensive CSS overhaul to maximize chessboard size on mobile devices and ensure touch-friendly UI elements.
- **Adaptive Navigation**: Refined the sidebar and mobile header to use screen real estate more efficiently across all device sizes.

### Changed
- **Options API Migration**: Fully transitioned `ChessBoard.jsx` to use the `options` object as required by `react-chessboard` v5, moving all event handlers and styles into the centralized configuration.
- **Enhanced Event Mapping**: Updated `onSquareClick` and `onPieceDrop` to destructure arguments as per the new v5 object-based signature, fixing the "stuck pieces" and click-to-move issues.

### Fixed
- **Chessboard Logic**: Resolved the issue where pieces would not drop or moves wouldn't register by correctly mapping the new library API to the internal game state handlers.
- **Touch Interactions**: Added `touch-action: none` and optimized CSS for better mobile responsiveness during drag operations.


## [2026-07-06] - Ultra-Modern UI & Board Logic Fix

### Added
- **Modern Typography**: Integrated 'Plus Jakarta Sans' as the primary font for a high-end interface feel.
- **Glassmorphism Theme**: Implemented a dark space theme with translucent panels, subtle gradients, and glow effects across the entire app.

### Changed
- **UI/UX Overhaul**: Completely redesigned the Landing, Home, Login, and Play Setup pages with modern aesthetics, improved spacing, and refined interactive elements.
- **Component Modernization**: Updated `BotSelector`, `EloSlider`, `MoveHistory`, and `GameControls` with sleek, professional styling.
- **Chessboard Refinement**: Refactored `ChessBoard.jsx` to fully comply with the `react-chessboard` v5 options API, resolving the "stuck board" and interaction issues.

### Fixed
- **Board Interaction**: Corrected event handler signatures and prop mapping for `onPieceDrop`, `onSquareClick`, and `onPieceDragBegin` to ensure reliable drag-and-drop and tap-to-move functionality.
