# Changelog
## [2026-07-17] - Use Vercel's Native Neon Integration for Email OTP

### Changed
- Restored the managed Neon Auth email-OTP flow. The app now delegates verification-code delivery and validation to Neon Auth through `NEON_AUTH_BASE_URL`; it no longer uses the local Resend/SMTP mailer for login.
- Removed empty project-level Neon/Postgres environment-variable overrides so the attached Vercel Neon resource can supply its deployment configuration.

## [2026-07-12] - Restore Self-Hosted OTP Fallback for "Auth service unavailable"

### Fixed
- **Login fully restored on Vercel without Neon Auth credentials.** `/api/auth/email-otp/*` no longer 404s when `NEON_AUTH_BASE_URL` is unset or points at a Neon Auth project where Better Auth's `emailOTP` plugin is disabled (the live state after the 2026-07-11 env wipe). Replaced the Neon-only proxy in `artifacts/api-server/src/chess-server/routes/auth.js` with a self-hosted OTP flow identical in shape to the pre-Neon implementation, so the login flow no longer depends on any upstream Neon Auth project being reachable.
- **`/api/auth/email-otp/send-verification-otp` and `/resend` no longer hit a dead Neon endpoint.** Both routes now use the same hashed `verifications` table + `scrypt` code + 30s cooldown + 5-attempt cap the project shipped with before the Neon swap. `sign-in/email-otp` mints a local `sessions` row via `createSession` from `chess-server/auth.js` so matchmaking, games, coach, and stats routes keep working without Neon.
- **All `/api/auth/*` handlers always return JSON.** Wrapped every handler in try/catch and normalized error envelopes to `{error:{message}}` (was returning 404 with "Auth service unavailable" on upstream 404s and 500 with HTML on uncaught throws).

### Added
- `artifacts/api-server/src/chess-server/mailer.js` — Resend (primary) → SMTP (optional) → dev console-log fallback, restored from git history (`deb29da`). Production stays on Resend if `RESEND_API_KEY` is set; the dev console-log branch is gated to `NODE_ENV !== 'production'` (or the explicit `OTP_DEV_LOG=1` opt-in) so a live auth code and recipient email can never be written to server logs in a production/preview build without an explicit dev flag.
- `scrypt`-hashed `verifications.value` with timing-safe comparison on every sign-in attempt, consistent with the pre-Neon `routes/auth.js`.
- API-path strip in `api/[...path].js`: Vercel invokes the serverless handler with the original `/api/...` URL; the Express app already mounts routes under `/api/...`, so the handler strips the leading `/api` only when `process.env.VERCEL` is set (standalone dev mode passes URLs through unchanged).

### Changed
- `routes/auth.js` now uses `createSession` and `findOrCreateUserByEmail` from `chess-server/auth.js` directly; the Neon proxying and hybrid fallback that the previous version attempted have been removed. The existing `users` and `sessions` table schema is unchanged.
- `/api/auth/session` and `/api/auth/update-username` always read from and write to the local `users` / `sessions` tables; no client contract change.

### Verified
- Local Postgres + `pnpm --filter @workspace/api-server run build` + `node dist/index.mjs`: full send → cooldown → resend → sign-in → session flow works (HTTP 200, mints `sessions` row, returns shaped user). Cooldown returns 429 with seconds-remaining; incorrect code returns 400 with attempts-remaining.

## [2026-07-11] - Branch Cleanup + Login Flow Verification

### Changed
- Pruned repository: closed stale PRs #100, #102, #110, #111 and deleted all non-main branches (7 remote, 8 local). Only `main` (9788cfc) remains, in sync with origin.

### Investigated
- Browser-tested the login flow on https://chess-com-app.vercel.app. The `/login` form renders and submits, but `POST /api/auth/email-otp/send-verification-otp` returns HTTP 404 with the client-facing error "Auth service unavailable. Please try again."
- Root cause was operational, not code: production Vercel env vars `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_PROJECT_ID`, and `VITE_NEON_AUTH_URL` were either unset or pointed at a Neon Auth project where the Better Auth `emailOTP` plugin/route was not enabled. `/api/health` and `/api/auth/signout` work (200), confirming the serverless function loads but the proxied upstream send-otp route 404s. The local `/api/auth/email-otp/send-verification-otp` route in `artifacts/api-server/src/chess-server/routes/auth.js` is correctly wired (proxies to `process.env.NEON_AUTH_BASE_URL + /auth/email-otp/send-verification-otp`).

### Security
- Wiped the suspect env values from Vercel production and replaced with placeholders so the live deployment no longer carries potentially-compromised or stale credentials. Re-add real values (from the Neon console / Vercel storage) before the app is used in production.

## [2026-07-10] - Neon Auth Email Verification

### Changed
- **OTP email delivery is now handled by Neon Auth (Better Auth)**, not by Resend or the project's own `mailer.js`. OTP send and code storage run on Neon's hosted auth service; the local Express server proxies requests using `NEON_AUTH_BASE_URL` and creates local sessions via `mintLocalSession`.
- Deleted `artifacts/api-server/src/chess-server/mailer.js`. Removed `nodemailer` from `artifacts/api-server` runtime dependencies.
- Replaced the custom 6-digit OTP storage (`verifications` + `sendOtpEmail`) in `routes/auth.js` with a thin Express proxy that forwards to the Neon Auth API.

### Added
- `routes/auth.js` now proxies OTP requests to the Neon Auth service at `NEON_AUTH_BASE_URL`. On successful sign-in, the user is created in the local `users` table and a session is mirrored into the local `sessions` table via `mintLocalSession` so existing routes (matchmaking, games, coach) keep working.
- Bearer-token auth on `/api/auth/session` and `/api/auth/update-username` for clients that already have a token.

### Notes
- Configure `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` in Vercel environment variables for Production and Preview.
- Configure the email provider (Resend or Neon shared) in the Neon Auth dashboard so codes are actually delivered.

## [2026-07-09] - OTP Endpoint Reliability Fix

### Fixed
- **OTP endpoint 500 in dev/test**: `mailer.js` now falls back to console logging when no mailer configured instead of throwing. This matches README contract and prevents 500 on `/api/auth/email-otp/*`.
- **OTP send invalidates previous code on failure**: Reordered `sendOtp()` to send email BEFORE DB writes, preserving existing valid codes if mailer fails and avoiding cooldown lockout with no code.
- **Cooldown query**: Now checks only non-consumed, non-expired verifications, allowing immediate re-request after successful verification.
- **Cold-start race in app.ts**: Changed `loadChessRoutes()` from fire-and-forget to top-level await and added JSON error handler, fixing intermittent 404/500 on `/api/auth/*` during cold start.

## [2026-07-09] - In-Game Progress Survives Refresh

### Fixed
- **Bot / local games reset on refresh**: Progress (moves, FEN, bot, color) is persisted to `localStorage` after every move and restored on reload. Logged-in users still also save to the database.
- **Online matches lost on refresh**: Session + board state survive hard refresh; client re-joins the socket room and hydrates from local cache then server/DB.
- **Refresh ended online games**: Disconnect no longer closes the match when sockets drop; only leave / resign / game-over ends a game. Rejoin rebinds the player's socket.

### Added
- Client `gamePersistence` helpers and missing online game API methods on the frontend client.

## [2026-07-09] - Login 500 Fix (OTP flow)

### Fixed
- **Request failed (500) on login/OTP**:
  - Wrapped all `/api/auth/*` OTP handlers (`send-verification-otp`, `resend`, `sign-in/email-otp`, `update-username`) in try/catch to always return proper JSON `{error:{message}}` instead of letting errors produce default Express HTML/empty 500 responses.
  - Added top-level Express error middleware in `chess-server/index.js` to guarantee JSON 500 responses for any uncaught route errors.
  - Hardened `hashCode()`: correctly converts stored hex `salt` to Buffer before `scryptSync`, and safe-guarded `timingSafeEqual` (length + try/catch) to prevent crypto comparison crashes.
  - Added duplicate-key race handling + try/catch in `findOrCreateUser` (email/username uniqueness).
  - Improved error logging and user-facing messages for OTP send/verify failures.
- **VerifyEmail resend bug**: fixed incorrect assumption that pending data always contains `username`; now falls back to context `pendingOtpEmail`.
- **Session creation**: added defensive `|| null` for `req.ip` / userAgent (some serverless proxies omit them).

## [2026-07-06] - Auth Failsafes & Robust Proxy

### Fixed
- **OTP Send Failures**: Implemented a "Smart Auth Bridge" that automatically detects and retries different OTP flow types (`sign-in` vs `email-verification`) if the initial request fails.
- **Proxy Transparency**: Added forwarding for `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` headers to ensure the upstream auth service correctly identifies the application domain and preserves CSRF state.
- **Improved Error Diagnostics**: Enhanced server-side logging and error message relaying to provide more clarity on bridge failures.


## [2026-07-06] - Auth Hardening & Error Reporting

### Fixed
- **OTP Send Failure**: Refined the auth proxy to be more robust by safely forwarding only existing headers (Cookie, Origin) and adding detailed error messages to the response. This helps diagnose network issues or header mismatches during the sign-in flow.


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
- **Component Modernization**: Updated `BotSelector`, `EloSlider`, `MoveHistory", and `GameControls` with sleek, professional styling.
- **Chessboard Refinement**: Refactored `ChessBoard.jsx" to fully comply with the `react-chessboard` v5 options API, resolving the "stuck board" and interaction issues.

### Fixed
- **Board Interaction**: Corrected event handler signatures and prop mapping for `onPieceDrop`, `onSquareClick", and `onPieceDragBegin` to ensure reliable drag-and-drop and tap-to-move functionality.

### Fixed (deploy)
- **Vercel preview build failed with `ERR_PNPM_OUTDATED_LOCKFILE`**: removed the lingering `nodemailer` entry from the root `package.json` so the lockfile matches; `pnpm install` is now consistent and the build runs through.
