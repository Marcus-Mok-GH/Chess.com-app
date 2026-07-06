# Changelog

## [2026-07-06] - Chess Board Rendering Final Fix (Prop Redundancy Approach)

### Fixed
- **Prop Redundancy Fix**: Implemented a "Direct + Options" hybrid API for `ChessBoard.jsx` to resolve the ambiguity of `react-chessboard` v5. This ensures the board renders correctly regardless of whether the library version uses the legacy `options` prop or the modern direct props.
- **Robust Piece Scaling**: Updated custom piece renderers to accept `squareWidth` and fallback to `100%`, fixing issues where pieces might be invisible due to undefined scale props.
- **Universal Event Handlers**: Added defensive logic to all board callbacks (`onPieceDrop`, `onSquareClick`, `canDragPiece`) to handle both object-destructured (v5) and positional (v4) arguments.
- **Z-Index & Visibility**: Added a `min-height` to the board wrapper to prevent layout collapse during the library's internal initialization.

## [2026-07-05] - Persistent Move Storage & Refresh Survival
... (rest of the changelog)
