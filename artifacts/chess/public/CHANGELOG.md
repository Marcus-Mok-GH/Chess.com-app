## [2026-08-03] - Subtle Chess.com-Inspired Theme

### Changed

- Kept the existing navigation and layout intact while preserving the dark green Chess.com-inspired palette.
- Removed the heavier branding, extra gradients, and icon treatment so the theme remains understated.

## [2026-08-03] - Mobile Layout Optimization

### Changed

- Added safe-area-aware mobile header and page spacing so iPhone-style insets do not overlap content or navigation.
- Reserved space below local games for the fixed mobile action bar, including extra clearance on narrow phones where controls wrap.
- Reworked mobile game actions into responsive grids with compact-phone sizing and ellipsis-safe labels.
- Let mobile game review panels use the full-page height for scrolling instead of trapping reports in a half-viewport panel.
- Made mobile history actions full-width and touch-friendly, and kept lobby/history content clear of the bottom navigation.

## [2026-08-02] - Conservative Cleanup Refactor

### Changed
- Removed unused `useUser` import and unused `logout` context access from `GuestBlocked.jsx`.
- Removed unused default `React` imports from the ELO/Win rate chart components while retaining named imports.
- Removed the debug `console.log` block from `GameHistory.handleViewGame`, retaining move normalization and navigation.
- Hoisted the `unable to connect` error check into a single computed value in `LobbyUI.jsx`.

## [2026-08-02] - Pollinations Coach Prompt Flow

### Fixed
- Restored the Pollinations AI coach prompt after username completion.
- Added a persisted, per-user prompt gate for existing accounts and repaired the settings API client methods used to record the one-time display.
- Fixed failed OAuth handling, authenticated settings access, login redirects, and modal accessibility.

## [2026-08-01] - Online Game Review Fixes

### Fixed
- Validated automatic draw reasons against authoritative chess state and move history before completing online games.
- Added timeout protection to online-game completion requests.

## [2026-08-01] - Address AI Review Findings for Online Game Completion

### Fixed

- Classified automatic online draws as insufficient material, threefold repetition, fifty-move, or seventy-five-move outcomes before server synchronization.
- Validated automatic draw reasons against the authoritative server position and replayable move history.
- Added an eight-second timeout to terminal-game requests so a hung network call cannot block completion indefinitely.

## [2026-08-01] - Stable Online Game Completion and Join Races

### Fixed

- Added an idempotent server-authoritative terminal-game endpoint so checkmate, stalemate, resignation, and draw outcomes persist for both players.
- Prevented duplicate socket terminal events and concurrent friendly-game joins from corrupting seats.
- Added active-game result and move-count schema compatibility and ignored stale real-time snapshots on the client.
- Added strict terminal-result validation so clients cannot claim an agreed draw through the automatic game-end path.
- Made terminal completion tolerate an already-lost CAS response without throwing a 500.
- Added self-healing migration for move_count on databases created before the online move protocol.

## [2026-07-31] - Key-Value Persistence Packaging and Coverage

### Added
- Declared `@upstash/redis` as a direct dependency of the API server so production/serverless builds resolve the online-game KV adapter without relying on workspace-level hoisting.
- Added configuration coverage for disabled credentials, partial credentials, supported Upstash environment-variable aliases, and memoized client lifecycle.
- Added normalization coverage for JSON-encoded KV responses and malformed stored values.

### Fixed
- Made KV state normalization tolerate REST adapters that return serialized JSON while safely rejecting malformed values.

## July 27, 2026 - Varied Procedural Puzzle Compositions

### Changed

- **Responsive puzzle generation**: Moved procedural composition into a Web Worker with a bounded search budget and cheap king-distance rejection so unlucky seeds cannot block the puzzle UI.
- **Race-safe puzzle navigation**: Added generation request tokens and disabled Skip/Reset while loading so overlapping worker responses cannot overwrite newer puzzle state.
- **Bounded failure handling**: Added a five-second worker timeout and explicit board-state resets when fallback generation reuses the current puzzle.

- Replaced the two-template puzzle shuffler with seeded procedural mate-in-one composition, producing different piece combinations and layouts while retaining legality and unique-solution validation.
- Added regression coverage requiring distinct positions, varied material layouts, and multiple tactical themes across generated sessions.

## July 26, 2026 - Dynamic Puzzle Generation

### Added

- Replaced the fixed puzzle rotation with an on-demand procedural generator that transforms vetted tactical motifs, verifies legal positions and a unique mate-in-one, and creates a fresh puzzle after solve, skip, or reset.

# Changelog
## [2026-07-26] - Comprehensive Mobile Responsive Optimization

### Changed
- **AI review follow-up**: Kept keyboard-constrained modals scrollable, removed deprecated changelog wrapping CSS, and enforced 44px minimum touch targets for compact online-play and user controls.
- **Online Play** (`OnlinePlay.css`): 768px safe-area fallback, 390px breakpoint (lobby, mode-option, elo, game-code, match-found), 360px breakpoint (mode-option, join-form, btn-primary).
- **Chess Game** (`ChessGame.css`): 768px comprehensive rewrite (player-bar, board-wrapper, sidebar, move-history, control-buttons, bot-display), 390px breakpoint (tighter padding, move-row), 360px breakpoint (player-bar, move-row).
- **Game Bottom Bar** (`GameBottomBar.css`): Added 360px breakpoint (tighter gap, bot-avatar, gbb-btn).
- **Analysis** (`Analysis.css`): 768px rewrite (header-bar safe-area, board-wrap, panel, tabs, move-row, move-nav), 390px breakpoint, 360px breakpoint (tabs, font sizes, move-row).
- **Game History** (`GameHistory.css`): 390px breakpoint (page padding, h1, game-item, view-game-btn), 360px (h1, game-result, game-mode).
- **Settings** (`Settings.css`): 390px breakpoint (h1, setting-info, account-value), 360px (padding, min-height 44px buttons).
- **Puzzles** (`Puzzles.css`): Added 768px+390px+360px breakpoints (puzzles-title, board-wrap, side-card, status-value, puzzle-action).
- **Terms** (`Terms.css`): Added 390px+360px breakpoints.
- **Changelog** (`Changelog.css`): Added compact 640px/390px/360px layouts and robust wrapping for long technical release notes to eliminate horizontal overflow.
- **Login Modal** (`LoginModal.css`): Added 360px, keyboard-open `@media (max-height: 600px)` bottom-sheet style.
- **Set Username Modal** (`SetUsernameModal.css`): Added 480px bottom-sheet+safe-area, 360px compact, keyboard-open 600px.
- **Bot Selector** (`BotSelector.css`): 390px breakpoint (2-col grid, min-height), 360px (bot-avatar).
- **Play Setup** (`PlaySetup.css`): 390px breakpoint, 360px (tighter card padding).
- **Elo Slider** (`EloSlider.css`): Added 768px+390px mobile breakpoints.
- **Feedback Panel** (`FeedbackPanel.css`): 360px breakpoint refined, 320px breakpoint (tighter trigger, modal, type-btn).
- **Coaching Tip** (`CoachingTip.css`): Added 390px+360px breakpoints (padding, font sizes, 44px touch target on dismiss).
- **User Badge** (`UserBadge.css`): Added 360px breakpoint (tighter padding, avatar, elo, dropdown items).
- **Guest Blocked** (`GuestBlocked.css`): Added 390px+360px breakpoints (container, icon, title, description, target, btn).
- **Win Rate Chart** (`WinRateChart.css`): Added 390px+360px breakpoints (container, title, legend, stat-item).
- **Elo Progress Chart** (`EloProgressChart.css`): Added 390px+360px breakpoints (container, title, legend, tooltip-elo).
- **Game Analysis Modal** (`GameAnalysis.css`): Added 390px+360px breakpoints (full-screen modal, safe-area header, smaller fonts, max-height).
- **Quick Nav** (`QuickNav.css`): Added 360px breakpoint (overlay, header, 44px close-btn, item, footer).
- **Navigation Hints** (`NavigationHints.css`): Added 390px+360px breakpoints (overlay, modal, header, content, hint items, kbd).

### Preserved
- All existing gameplay, navigation, and feature behavior
- Touch target minimum: 44px enforced across interactive elements
- Font sizes >= 16px on inputs to prevent iOS zoom

## [2026-07-26] - AI Review Hardening

### Fixed
- Hardened authoritative online play after AI review: normalized game and player identities, consistent move history, awaited KV operations, correct async move drops, stale matchmaking event rejection, move-request timeouts, and stable socket concurrency tests.

# Changelog
## [2026-07-26] - Durable KV Persistence for Online Play

### Added
- **`onlineGameKv` service**: Upstash/Vercel REST KV layer for fast active-game lookups. Uses `KV_REST_API_URL`+`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN`. Gracefully disabled when credentials are absent.
- **Route-level KV tests**: Mock KV at route boundary. Tests stale-KV vs DB comparison, status compatibility, missing-KV repopulation, DB-outage fallback, and move write-through assertions.

### Changed
- **Write-through KV**: Active game create, join, move, and leave/end persist to KV after DB CAS. PostgreSQL remains source of truth.
- **GET by-code with stale-KV guard**: Polling endpoint checks KV first, compares `move_count` and status compatibility against `active_games`; when statuses differ DB is authoritative. Falls back to `games` table — stale non-playing KV no longer shadows a completed games row.

## [2026-07-26] - HTTP-Only Online Moves (No Optimistic Commit)

- **Authenticated account moves**: The HTTP move endpoint now requires a valid Bearer session and rejects missing, expired, or identity-mismatched credentials before reading or changing game state.

### Added
- **`api.postMove()`**: Submits moves via `POST /api/games/:gameId/move` with Bearer token from localStorage.
- **Endpoint tests**: Server-side tests for the HTTP move endpoint, active-games-first query, and KV behavior.

### Changed
- **Online moves are HTTP-only**: `useGameCore.makeMove` sends an HTTP POST instead of socket `make_move`. Input is locked during the request; board updates only from the server response. No optimistic commit.
- **Polling is primary**: 1.5s polling detects opponent moves by `move_count` advancement. Overlapping polls prevented; stops on game end.
- **Socket cleaned up**: Removed `move_ack`/`move_error` listeners. Socket.IO kept for chat, draw, resign, game-end, and reconnect.

## [2026-07-26] - Online-Play Reliability Pass
- Added a root Vitest test command and test dependencies so online-play reliability tests run consistently.

### Fixed
- **Async move/drop handling + duplicate prevention** (`useGameCore.js`, `OnlineChessGame.jsx`): Added a synchronous `moveInFlightRef` that blocks duplicate move submissions from rapid double-clicks or drag-and-drop. `handlePieceDrop` now checks this ref before allowing any move. `makeMove` is guarded end-to-end — the ref is set before the optimistic board update and cleared after the server round-trip.
- **Rollback/rehydrate on rejected moves** (`useGameCore.js`): When `api.saveGame()` fails, the component now rehydrates from the server via `api.getGameByCode()`. If the server is also unreachable, the optimistic move is rolled back by restoring the previous game state and move history. A transient error message is shown and auto-clears after 4 seconds.
- **Matchmaking cancel is immediate + immune to late events** (`useMatchmaking.js`, `OnlinePlay.jsx`): Cancel now resets UI state synchronously before the async `leaveMatchmaking` call. A `generationRef` counter is incremented on every start/cancel; stale `match_found` events arriving after a cancel are discarded. The async leave is fire-and-forget so it never blocks the UI.
- **Matchmaking cleanup on unmount** (`useMatchmaking.js`): The cleanup effect now calls `leaveMatchmaking` and `leaveMatchmaking` on the active player ID ref, preventing zombie queue entries when navigating away mid-search.
- **LoginModal close loop** (`OnlinePlay.jsx`): After successful OTP verification, the `onClose` callback now clears `pendingMode` and only re-triggers mode selection if the user is already logged in. This prevents the modal from re-opening in a loop.
- **Pending guards on create/join** (`OnlinePlay.jsx`): Added synchronous guards and loading state to prevent double-submission on rapid clicks. Buttons are disabled while the API call is in flight.
- **Friendly creator synchronization** (`OnlinePlay.jsx`): Creator waiting view now polls every 3s to detect when an opponent joins, automatically transitioning to the playing view.
- **Stale draw state cleared** (`OnlineChessGame.jsx`): `drawOffered` is now cleared on game end, opponent moves, draw accept/decline, resignation, and leave — preventing stale UI.
- **Polling requests use configured API base** (`matchmakingPolling.js`): All hardcoded `/api/` fetch paths now use `API_BASE_URL` from `apiBase.js`.

### Changed
- **useMatchmaking hook API**: Removed `playerId`/`setPlayerId` state in favor of `activePlayerIdRef`. Added `generationRef` for stale-event immunity.

## [2026-07-26] - Server-Authoritative Move Validation & CAS Concurrency Safety
- **Transport reconciliation**: Socket moves no longer race the HTTP fallback; missing acknowledgements first reconcile server state, and all move rejection events carry the game ID so the correct board rolls back.

### Added
- **Server-authoritative single-move validation** (`gameHandlers.js`): `make_move` validates exactly one new legal move against the server's stored FEN instead of replaying the full client history. Server applies the move on a fresh Chess instance from its own state.
- **Compare-and-set DB updates** (`gameService.js`, `init.js`): `updateGameStateCAS` uses `WHERE move_count = $expected` so simultaneous moves cannot overwrite each other. Added `move_count` column to `active_games`.
- **`move_ack` / `move_error` events** (`gameHandlers.js`, `socket.js`): Server emits `move_ack` on CAS success and `move_error` on rejection. Client uses `move_ack` to confirm server acceptance.
- **Client ack-gated in-flight lock** (`useGameCore.js`): `moveInFlightRef` held until `move_ack` arrives (5s timeout) when socket is connected. Falls back to immediate release when socket is disconnected.
- **Normalized player identity for reconnects** (`utils.js`): `verifyPlayerAuth` and `resolveMatchMoveOwner` use `userIdFromPlayerId` to normalize `user_<uuid>`, `user_<uuid>_<suffix>`, and bare UUID formats.
- **Tests**: CAS update tests, `verifyPlayerAuth` normalization tests, and frontend `moveHistory` helper tests.

## [2026-07-24] - Chess.com Theme Overhaul: Every Page Themed

### Changed
- **Centralized token aliases**: Added chess.com semantic aliases (`--chesscom-*`, `--move-best`, `--move-blunder`, etc.) to `index.css` so all pages share consistent color references without hardcoded fallbacks.
- **Branding consistency**: Renamed sidebar logo "Chess.com App" → "PlayChess", updated login eyebrow, HTML `<title>`, and `getTitle()` route mapping to use the unified brand name.
- **Puzzles page**: Replaced fallback `--chesscom-bg`/`--chesscom-card`/`--chesscom-text` color variables with canonical tokens (`--bg-page`, `--card`, `--text-primary`, etc.) for consistent theming.
- **Not-found page**: Replaced Tailwind utility classes with dedicated `.not-found-*` CSS classes using the chess.com dark panel card, green accent 404 code, and "Lost Position" title.
- **Analysis page**: Added semantic move classification colors (`.move-best`, `.move-brilliant`, `.move-good`, `.move-book`, `.move-inaccuracy`, `.move-mistake`, `.move-blunder`) for Game Review move lists.
- **Changelog page**: Restyled as a "release scorebook" with `--card` surfaces, `--border` separators, green markers on list items, and updated sidebar version pills.
- **Terms/Privacy pages**: Restyled as "chess handbook" pages with a green top accent bar, `--card` surface, green-accent section headers, and refined typography.
- **CloudFlare page**: Extracted inline styles into `CloudFlare.css` with a themed card, green accent bar, and proper token usage.

### Fixed
- **Puzzles route JSX tag mismatch**: Corrected a stray `}` in the Puzzles `<Route>` element in `App.jsx` that produced a JSX parse warning on build.
- **Changelog CSS token drift**: Unified remaining `--color-*` sidebar selectors to use `--bg-surface-2`, `--border`, `--text-primary`, `--text-muted` directly.
- **CodeRabbit review fixes (PR #136)**: Completed PlayChess branding in the mobile header and login copy, and removed the duplicate `Fixed` heading below.

- **/puzzles route 404 / black screen**: The `/puzzles` link in the landing and navigation pointed to a route that did not exist in `App.jsx`, so React Router matched nothing and the app shell rendered an empty (dark) main area — appearing as a black screen. Added a new auth-protected `Puzzles` page (`src/pages/Puzzles.jsx` + `Puzzles.css`) inside `ProtectedRoute` (consistent with `/settings`), and registered it inside the shared `AppShell` layout. Also added a `Puzzles` entry to the bottom mobile nav and the `getTitle()` mapping so the route renders with a proper title.
- **Catch-all 404 for unknown routes**: Added a `*` catch-all route rendering the existing `not-found.tsx` 404 card, so any future dead link shows a clear "Page Not Found" page instead of a blank/black main area.

### Added
- **Tactical Trainer feature**: New `/puzzles` page with an embedded, chess.js-validated set of starter positions, drag-to-move validation against the puzzle solution, hint highlighting, skip/next controls, session statistics (solved, current streak, best streak), wrong-move board reset, and cancellation of delayed transitions on skip/reset.


## [2026-07-15] - Auth Startup Gate Fix

### Fixed
- **Login startup gate removed**: Fixed login requests getting stuck behind a serverless database warm-up gate that returned "Auth service is starting. Please try again in a moment." indefinitely. Auth routes now use the existing lazy database initialization path so users receive the real auth response instead of a stale startup message.
- **Non-blocking auth warm-up retained**: Serverless deployments still start a background database warm-up and mark the shared database readiness flag on success, but failures no longer block login requests; auth handlers retry initialization on demand.

## [2026-07-16] - Restore Neon Auth Native Email Verification with Retries

### Fixed
- **Restored Neon Auth native email verification flow**: Modified `/api/auth/*` endpoints in `routes/auth.js` to proxy OTP requests to the Neon Auth API (`NEON_AUTH_BASE_URL`), allowing native email OTP generation and delivery without relying on a local/custom email mailer.
- **Added robust retry logic in proxying**: Built `proxyToNeonAuth` with 3 retries and exponential backoff (delaying 500ms, 1000ms, and 2000ms) on HTTP 5xx errors and connection/network failures to prevent login errors on transient service glitches.
- **Detailed error surfacing**: Hardened error handling to gracefully catch exhausted retries and surface detailed, underlying error messages (such as exact HTTP statuses and network exceptions) back to the client UI to make future debugging clear and friction-free.

## [2026-07-15] - Auth Routing and Serverless Startup Hardening

### Fixed
- **Login route prefix drift**: `api/[...path].js` now normalizes known Vercel catch-all API requests so Express receives `/api/...`, whether the platform forwards `/api/auth/...` or strips the function prefix to `/auth/...`. The normalizer leaves unrelated paths untouched and preserves `/api` / `/api?...` exactly, preventing login and OTP endpoints from regressing into 404/405-style routing failures.
- **Serverless auth cold starts**: `/api/auth/*` requests now lazily run the database initializer on Vercel before hitting OTP/session handlers. This keeps the self-hosted OTP tables and columns self-healing even when the serverless entry point does not start the standalone listener.

## [2026-07-12] - Restore Self-Hosted OTP Fallback

### Fixed
- **Login restored after Neon Auth env wipe.** `/api/auth/email-otp/*` routes 404'd with "Auth service unavailable" once `NEON_AUTH_BASE_URL` was cleared in Vercel (2026-07-11). `routes/auth.js` now runs a fully self-hosted OTP flow (hashed `verifications` table, scrypt code, 30s cooldown, 5-attempt cap) so login works with **zero** Neon env vars.
- **No more "Auth service unavailable" on the client.** All `/api/auth/*` handlers always return `{error:{message}}` JSON, including on proxy failures and uncaught throws. Previously a Neon upstream 404 surfaced as 404 + "Auth service unavailable. Please try again." on the user.

### Added
- `artifacts/api-server/src/chess-server/mailer.js` reinstated with Resend (primary, when `RESEND_API_KEY` is set) → SMTP (optional, lazy-loaded) → dev console-log fallback. Without any mailer in non-production (`NODE_ENV !== 'production'` or `OTP_DEV_LOG=1`), OTP codes are logged to the server console so dev sign-in still works; in production, the route reports a delivery error instead of fake-success so the raw code is never leaked.
- `api/[...path].js` strips the leading `/api` from the request URL when running on Vercel (gated on `process.env.VERCEL`) so the Express app's `/api/...` mounts still match under the serverless rewrite; standalone dev mode is unchanged.

### Changed
- `sign-in/email-otp` mints a local `sessions` row via `createSession` from `chess-server/auth.js`; `send-verification-otp` and `resend` write to the existing `verifications` table directly. No schema changes; existing `users` / `sessions` tables unchanged.
- `session` and `update-username` are local-only — they read and write the local `users` and `sessions` tables directly. There is no Neon forwarding in this path.

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
- **Component Modernization**: Updated `BotSelector`, `EloSlider`, `MoveHistory`, and `GameControls` with sleek, professional styling.
- **Chessboard Refinement**: Refactored `ChessBoard.jsx` to fully comply with the `react-chessboard` v5 options API, resolving the "stuck board" and interaction issues.

### Fixed
- **Board Interaction**: Corrected event handler signatures and prop mapping for `onPieceDrop`, `onSquareClick`, and `onPieceDragBegin` to ensure reliable drag-and-drop and tap-to-move functionality.

### Fixed (deploy)
- **Vercel preview build failed with `ERR_PNPM_OUTDATED_LOCKFILE`**: removed the lingering `nodemailer` entry from the root `package.json` so the lockfile matches; `pnpm install` is now consistent and the build runs through.
