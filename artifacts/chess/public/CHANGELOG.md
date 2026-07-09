# Changelog

## [2026-07-09] - OTP Value-Column Schema Self-Heal

### Fixed
- **OTP still returning "Failed to send verification code" in production** after the 2026-07-08 native flow rewrite + the 2026-07-09 id DEFAULT self-heal. The prod `verifications` table was originally created by an older deploy with a Better-Auth-compatible schema (including a NOT NULL `value` column) that the current `db/init.js` doesn't define. The new native `INSERT (identifier, code_hash, salt, expires_at)` omitted `value`, so PostgreSQL rejected every row with `23502 null value in column "value" violates not-null constraint`.
  - `routes/auth.js`: include `value: codeHash` in the INSERT so it satisfies the prod schema's NOT NULL `value` column (a hash is a valid `value` for the legacy schema).
  - `db/init.js`: idempotent `ALTER TABLE verifications DROP COLUMN IF EXISTS value` to self-heal older installs that have it; clean installs never get the column. Future migrations will be additive-only against the native schema.
- Verified in production: `POST /api/auth/email-otp/send-verification-otp` now returns `200 { success: true, message: "Verification code sent." }` for all test requests. End-to-end Playwright test in Zo Browser (load `/login`, enter email, click "Send Code") now lands on the "Check your email" page with the 6-digit code input, instead of staying on the login modal with the red error text.

## [2026-07-09] - In-Game Progress Survives Refresh

### Fixed
- **Bot / local games reset on refresh**: Moves, FEN, selected bot, player color, and resign state are now saved to `localStorage` after every move (and still mirrored to the database when logged in). Reloading the page restores the board immediately instead of starting a new game.
- **Online matches lost on refresh**: Active online session metadata (game id, player id, color, opponent) and the current board/move history are persisted client-side. On reload the client rehydrates from local cache, then re-joins the socket room and prefers the server/DB snapshot when it has more moves.
- **Disconnect ended online games**: Socket disconnect (including page refresh) no longer marks the match as ended when both sockets drop. Games only close on explicit leave, resign, or game-over. Participants can re-bind a new socket id after reconnect.

### Added
- **`utils/gamePersistence.js`**: Shared helpers for saving/loading local and online game snapshots plus the active-session pointer.
- **Missing online API client methods**: `createOnlineGame`, `joinOnlineGame`, `leaveOnlineGame`, and `getGameByCode` on the frontend API service.

### Changed
- **Play page**: Auto-resumes the active bot game after a hard refresh (including when returning to `/play`).
- **OnlinePlay page**: Restores the last active online session and navigates back into `/online/:gameId` after reload.

## [2026-07-09] - Mailer Resend Path

### Fixed
- **O**

## [2026-07-08] - OTP Native Flow + CSS Token Unification

### Fixed
- **OTP "failed to send OTP code"**: Rewrote `routes/auth.js` to a fully native email-OTP flow. The route was previously a proxy to Neon/Better Auth that errored out at runtime; now it issues a 6-digit code, stores its salted scrypt hash in a new `verifications` table, emails it via the existing `mailer.js`, and verifies it with constant-time comparison. The frontend client (`services/neonAuth.js`) now calls `/api/auth/email-otp/send-verification-otp`, `/api/auth/email-otp/resend`, `/api/auth/sign-in/email-otp`, and `/api/auth/session` directly — no external auth provider required.
- **App understyled**: Added the missing CSS variables in `index.css` (`--card`, `--background`, `--accent`, `--primary`, `--border`, `--text-dim`, `--text-primary`, `--text-secondary`, shadcn-style tokens, sidebar tokens, shadows, and the `--color-bg-secondary/tertiary`, `--color-border-hover/accent`, `--color-accent-muted/primary` aliases). Several pages (`Settings`, `GameHistory`, `OnlinePlay`, `Play`, `LoginModal`, etc.) referenced these variables but they were never defined, so colors and surfaces fell back to nothing. The app now consistently applies the chess.com palette across every page.

### Added
- **`verifications` table** in `db/init.js` and `db/migrations.js` for native OTP storage (identifier, code_hash, salt, expires_at, attempts, consumed_at) with self-healing `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for existing deployments.
- **`POST /api/auth/email-otp/resend`** endpoint with a 30-second cooldown to prevent abuse.
- **OTP hardening**: 6-digit codes with leading zeros preserved, `scryptSync` hashing with per-code salt, 10-minute TTL, 5-attempt cap, and `timingSafeEqual` on verify.

### Changed
- `services/neonAuth.js` replaced the Better Auth client with a thin `fetch`-based wrapper. The same surface (`emailOtp.sendVerificationOtp`, `signIn.emailOtp`, `getSession`, `signOut`) is preserved so call sites did not need changes.
- `UserContext` now passes the local session token to `getSession` and is tolerant of the new client response shape (`{ success, data, error }`).
- `UserContext.test.jsx` mocks updated to the new client contract.

## [2026-07-06] - Final Board Rendering Fix

### Fixed
- **Mobile Dimensions**: Added `min-height` and `min-width` constraints to the board wrapper and section in `ChessGame.css` to prevent dimension collapse on mobile viewports.
- **Component Cleanup**: Removed debug styles and logs while maintaining the standardized direct prop API for `react-chessboard` v5.

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
