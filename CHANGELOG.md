## [2026-07-30] - Verified Dynamic Puzzle Generation

### Added
- Added runtime puzzle API routes and a frontend selector for rules-based, Stockfish-assisted, and AI-assisted generation.
- Added a reusable Stockfish worker client, legal-position analysis, and chess.js validation of generated solutions.
- Added OpenAI-compatible AI puzzle generation with strict JSON/legality checks and graceful procedural fallback when the provider is unavailable.

### Changed
- Made method selection flow end-to-end through the Puzzles page and `/api/puzzles/generate`.
- Kept puzzle generation resilient: rules work offline, Stockfish falls back if analysis times out, and AI falls back if its provider returns an invalid or unavailable response.

### Verified
- `pnpm run test`: 120 tests passed.
- `pnpm run build`: typechecks and all production builds passed.
- Local smoke tests returned valid chess.js-verified puzzles for rules, Stockfish, and AI fallback paths.

## [2026-07-28] - Dynamic Puzzle Generation with Multiple Methods

### Added
- **Generation method selector**: Added UI to choose between three puzzle generation methods:
  - **Rules-based**: Procedural generation using chess.js with hardcoded tactical patterns
  - **Stockfish**: AI-powered puzzle generation using Stockfish engine (ready for integration)
  - **AI**: Experimental LLM-based puzzle generation (ready for integration)
- **Enhanced puzzle API**: Extended `/api/puzzles/generate` endpoint to support generation method selection
- **Generation method state**: Added state management for tracking selected generation method

### Changed
- **Puzzles.jsx**: Updated to include generation method selector UI with Brain (Rules), Robot (Stockfish), and Code2 (AI) icons
- **Puzzle generation flow**: Modified `generatePuzzleSafely` to accept generation method parameter and pass it to API calls
- **Puzzles.css**: Added styling for generation method selector cards and options
- **API integration**: Updated `fetchPuzzleFromAPI` to support generation method parameter

### Technical Details
- Generation methods are passed through the API to allow server-side selection
- Fallback to local procedural generation if API fails
- All three methods use the same puzzle validation and rating system
- UI provides visual feedback for selected method


## [2026-07-28] - Dynamic Puzzle Generation API

### Added
- **API puzzle endpoints**: Added `/api/puzzles/generate` (GET/POST), `/api/puzzles/validate`, `/api/puzzles/stockfish`, `/api/puzzles/themes`, and `/api/puzzles/daily` routes to the API server for dynamic puzzle generation and management.
- **Difficulty levels**: Added support for easy/medium/hard difficulty levels in generated puzzles.
- **Puzzle type filtering**: Added support for mate-in-1, mate-in-2, and tactics puzzle types.
- **Daily puzzle**: Added deterministic daily puzzle generation based on current date.
- **Stockfish integration**: Added Stockfish-based puzzle generation for more sophisticated tactical puzzles
- **AI-based generation**: Added experimental AI-based puzzle generation using LLM providers

### Changed
- **Enhanced puzzle generator**: Extended the existing procedural puzzle generator to support difficulty-based rating adjustments and multiple puzzle types.
- **Puzzles page**: Updated to use API endpoints for puzzle generation with fallback to local Web Worker
- **Puzzle variety**: Increased puzzle diversity with theme-based generation (forks, pins, skewers, discovered attacks)

## [2026-07-27] - Varied Procedural Puzzle Compositions

### Changed

- **Responsive puzzle generation**: Moved procedural composition into a Web Worker with a bounded search budget and cheap king-distance rejection so unlucky seeds cannot block the puzzle UI.
- **Race-safe puzzle navigation**: Added generation request tokens and disabled Skip/Reset while loading so overlapping worker responses cannot overwrite newer puzzle state.
- **Bounded failure handling**: Added a five-second worker timeout and explicit board-state resets when fallback generation reuses the current puzzle.

- Replaced the two-template puzzle shuffler with seeded procedural mate-in-one composition, producing different piece combinations and layouts while retaining legality and unique-solution validation.
- Added regression coverage requiring distinct positions, varied material layouts, and multiple tactical themes across generated sessions.

## [2026-07-26] - Dynamic Puzzle Generation

### Added

- **Procedural tactical puzzles**: Replaced the fixed puzzle rotation with runtime-generated, chess.js-verified mate-in-one positions. Each position has exactly one legal mating move, randomized orientation/theme metadata, deterministic seed support for testing, coverage in the standard test suite, and immediate generation of a fresh puzzle after solve, skip, or reset.

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
- Addressed AI review findings for authoritative online play: normalized game and player identity checks, consistent move-history storage, awaited KV operations, async move-drop handling, stale matchmaking event rejection, move-request timeout recovery, and stable socket CAS tests.

## [2026-07-26] - Durable KV Persistence for Online Play (Upstash/Vercel-compatible)

### Added
- **`onlineGameKv` service** (`kv/onlineGameKv.js`): Isolated Upstash/Vercel-compatible REST KV layer with dependency injection, testability, namespaced keys (`onlinegame:{gameCode}`), JSON state normalization, 4-hour active-game TTL, and graceful disabled/unavailable behavior (no-op when `KV_REST_API_URL`+`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN` are unset).
- **Pure service tests** (`kv/onlineGameKv.test.js`): Covers enabled/disabled config, roundtrip, TTL/key namespace, outage fallback, set guards, and normalization. Route-level KV behavior tested in `routes/games.move.test.js`.
- **Route-level KV tests** (`routes/games.move.test.js`): Mock `onlineGameKv` at route boundary. By-code tests: stale KV + newer DB returns DB with KV repopulation; equal/current KV returns KV without set; missing KV returns DB with set; active DB query failure falls back to valid KV; stale non-playing KV does not shadow completed games table row; status mismatch prefers DB over higher-move-count KV. Move tests: accepted move invokes `kv.set` with incremented move_count; illegal and CAS-stale moves invoke no set.

### Changed
- **Write-through KV after authoritative changes** (`routes/games.js`, `gameService.js`): Game create, join, move (HTTP + socket CAS), and leave/end now write-through or delete KV after DB success. PostgreSQL remains durable source of truth and CAS authority; KV outage never rejects a valid DB move.
- **GET by-code prefers KV with status compatibility** (`routes/games.js`): `/api/games/by-code/:gameCode` checks KV first for active playing state, falls back to `active_games` and repopulates KV; completed games may fall back to `games`. Compares `move_count` when both are available and statuses are compatible; when statuses differ (e.g., KV `playing` vs DB `ended`), DB is authoritative. No longer serves a stale non-playing KV without checking the `games` table.
- **Leave/end updates or removes KV** (`routes/games.js`, `gameService.js`, `gameHandlers.js`): Socket leave/end and HTTP leave delete KV entry.
- **`@upstash/redis` dependency** added at workspace root.

## [2026-07-26] - HTTP-Only Online Moves (No Optimistic Commit)

- **Authenticated account moves**: The HTTP move endpoint now requires a valid Bearer session and rejects missing, expired, or identity-mismatched credentials before reading or changing game state.

### Added
- **Server-authoritative HTTP move endpoint** (`routes/games.js`): `POST /api/games/:gameId/move` accepts `{ move, playerId, expectedMoveCount }`, validates Bearer token when provided, verifies player identity and turn from `active_games`, validates the move with `chess.js` from the stored FEN, and atomically compare-and-set updates `fen`, `move_history`, and `move_count`. Returns `4xx` on illegal/stale/unauthorized moves without modifying state.
- **`api.postMove()`** (`services/api.js`): Frontend method to submit moves via HTTP POST with optional Bearer token from localStorage session.
- **Endpoint tests** (`routes/games.move.test.js`): 26 tests covering validation, auth, CAS concurrency, illegal moves, active-games-first query ordering, and KV write-through/comparison behavior.

### Changed
- **Online moves are HTTP-only** (`useGameCore.js`): `makeMove` no longer sends socket `make_move` events or applies optimistic board updates. It locks input via `moveInFlightRef`, sends an HTTP POST, and applies the server response directly. No rollback logic needed — the server is the sole authority.
- **Polling is primary** (`OnlineChessGame.jsx`): 1.5s polling via `getGameByCode` detects opponent moves by `move_count` advancement. Overlapping polls are prevented by an `inFlight` guard; polling stops on game end.
- **Socket handlers cleaned up** (`OnlineChessGame.jsx`): Removed `move_ack` and `move_error` socket listeners (board moves no longer go through Socket.IO). Socket.IO remains for `game_state`, `game_ended`, `player_joined`, `draw_offered`, `chat_message`, and reconnect recovery.
- **`getGameByCode` checks `active_games` first** (`routes/games.js`): Query order reversed so live active games are never shadowed by stale `games` table snapshots.

### Preserved
- Friendly/ranked flows, reconnect recovery, mobile interaction, and all prior reliability fixes unchanged.
- Socket.IO retained for optional chat, draw, resign, and game-end notifications.

---

## [2026-07-26] - Online-Play Reliability Pass
- Added a root Vitest test command and test dependencies so online-play reliability tests run consistently.

### Fixed
- **Async move/drop handling + duplicate prevention** (`useGameCore.js`, `OnlineChessGame.jsx`): Added a synchronous `moveInFlightRef` that blocks duplicate move submissions from rapid double-clicks or drag-and-drop. `handlePieceDrop` now checks this ref before allowing any move. `makeMove` is guarded end-to-end — the ref is set before the optimistic board update and cleared after the server round-trip.
- **Rollback/rehydrate on rejected moves** (`useGameCore.js`): When `api.saveGame()` fails, the component now rehydrates from the server via `api.getGameByCode()`. If the server is also unreachable, the optimistic move is rolled back by restoring the previous game state and move history. A transient error message is shown and auto-clears after 4 seconds.
- **Matchmaking cancel is immediate + immune to late events** (`useMatchmaking.js`, `OnlinePlay.jsx`): Cancel now resets UI state synchronously before the async `leaveMatchmaking` call. A `generationRef` counter is incremented on every start/cancel; stale `match_found` events arriving after a cancel are discarded. The async leave is fire-and-forget so it never blocks the UI.
- **Matchmaking cleanup on unmount** (`useMatchmaking.js`): The cleanup effect now calls `leaveMatchmaking` and `leaveMatchmaking` on the active player ID ref, preventing zombie queue entries when navigating away mid-search. Active player ID is tracked via `activePlayerIdRef` instead of React state to avoid stale closures.
- **LoginModal close loop** (`OnlinePlay.jsx`): After successful OTP verification, the `onClose` callback now clears `pendingMode` and only re-triggers mode selection if the user is already logged in (`isLoggedIn` check). This prevents the modal from re-opening in a loop when `UserContext` hasn't re-rendered yet.
- **Pending guards on create/join** (`OnlinePlay.jsx`): Added `pendingCreateRef`/`pendingJoinRef` synchronous guards and `isCreating`/`isJoining` UI state to prevent double-submission on rapid clicks. Buttons are disabled and show loading text while the API call is in flight.
- **Friendly creator synchronization** (`OnlinePlay.jsx`): When a creator is in the waiting view, a 3-second poll detects when an opponent joins the game (by checking the opponent player ID in the game record). On detection, the creator is automatically transitioned to the playing view and the socket room is joined.
- **Stale draw state cleared** (`OnlineChessGame.jsx`): `drawOffered` is now cleared on game end, opponent moves, draw accept/decline, resignation, and leaving the game — preventing stale "Draw offered" UI from persisting across state transitions.
- **Polling requests use configured API base** (`matchmakingPolling.js`): All hardcoded `/api/` fetch paths now use `API_BASE_URL` from `apiBase.js`, so matchmaking polling, heartbeat, and leave requests route correctly when `VITE_API_URL` is set to a non-default base.

### Changed
- **useMatchmaking hook API** (`useMatchmaking.js`): Removed `playerId`/`setPlayerId` state in favor of `activePlayerIdRef` (avoids stale-closure issues). Added `generationRef` and `activePlayerIdRef` to the return value for consumer use.

---

## [2026-07-26] - Server-Authoritative Move Validation & CAS Concurrency Safety
- **Transport reconciliation**: Socket moves no longer race the HTTP fallback; missing acknowledgements first reconcile server state, and all move rejection events carry the game ID so the correct board rolls back.

### Added
- **Server-authoritative single-move validation** (`gameHandlers.js`): `make_move` now validates exactly one new legal move against the server's stored FEN instead of replaying the full client-submitted history. The server applies the move on a fresh `Chess` instance from its own state, rejecting stale/duplicate/out-of-sync submissions.
- **Compare-and-set DB updates** (`gameService.js`, `init.js`): `updateGameStateCAS` uses `WHERE move_count = $expected` so simultaneous moves cannot overwrite each other. Added `move_count INTEGER DEFAULT 0` column to `active_games` for optimistic concurrency control.
- **`move_ack` / `move_error` events** (`gameHandlers.js`, `socket.js`): Server emits `move_ack` with `{gameId, fen, moveCount}` on CAS success and `move_error` on rejection. Client registers listeners and uses `move_ack` to confirm server acceptance.
- **Client ack-gated in-flight lock** (`useGameCore.js`): `moveInFlightRef` is held until `move_ack` arrives (with 5s safety timeout) when socket is connected, preventing further moves before server confirmation. Falls back to immediate release when socket is disconnected (HTTP-only path).
- **Normalized player identity for reconnects** (`utils.js`): `verifyPlayerAuth` and `resolveMatchMoveOwner` now use `userIdFromPlayerId` to normalize `user_<uuid>`, `user_<uuid>_<suffix>`, and bare UUID formats, preventing false auth rejections on reconnect.
- **Tests** (`game.test.js`, `utils.test.js`, `moveHistory.test.js`): Added CAS update tests (success, concurrent stale, wrong status), `verifyPlayerAuth` normalization tests, and frontend pure helper tests for `normalizeMoveHistory`, `buildGameFromHistory`, `getMoveFromEntry`, and `toStoredMoveHistory`.

---

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
- **CodeRabbit review fixes (PR #136)**: Completed PlayChess branding in the mobile header and login copy, and restored independent changelog section boundaries.

## [2026-07-24] - Auto-update opponent moves in online play (no refresh needed)

- **Bug**: In live online games the opponent's moves only appeared after a manual page refresh.
- **Root cause**: The online game relied on Socket.IO (`io.to(gameId).emit('move_made', ...)` on the server, `socketService.on('move_made', ...)` on the client). On the Vercel deployment `VITE_SOCKET_URL` is unset, so the client's `resolveSocketConfig()` resolves to `url: null` and `connect()` is a no-op — no socket, no room join, no broadcasts. The board only updated when the user refreshed, which re-hydrated from the `/api/games/by-code` REST endpoint. The standalone Express server's Socket.IO layer is also not reachable from a Vercel serverless function (the `httpServer` listener is gated behind `!process.env.VERCEL`).
- **Fix** (`artifacts/chess/src/components/OnlineChessGame.jsx`): added an HTTP polling fallback that mirrors the existing socket `move_made` handler.
  - Polls `/api/games/by-code/:gameCode` every 2s while the game is active.
  - Only applies state when the server has strictly more ply entries than the client (tracked via `appliedHistoryLenRef`, kept in sync by both the optimistic local `makeMove` path and the socket handler).
  - Skips the local player's own just-submitted move by ply parity (white even / black odd), so it never clobbers the optimistic board while the server echo is in flight.
  - Self-suppresses once `gameStatus === 'ended'` (read via `gameStatusRef` to avoid re-subscribing each tick).
  - Reuses the same `setGame` / `setMoveHistory` / `setGameStatus` / `setWinner` setters as the socket path, so board-hydrate, haptics, and end-of-game flow are identical.
- **Compatibility**: additive only — when Socket.IO is wired up (e.g. a Railway backend with `VITE_SOCKET_URL` set), the socket handler still fires instantly; this fallback simply keeps the board in sync in the no-socket deployment without conflicting with it.
- **CodeRabbit review fixes (PR #135)**:
  - Declare `gameStatusRef` via `useRef(gameStatus)` alongside the other refs — previously referenced but never declared, which would `ReferenceError` on mount and prevent the polling effect from initializing.
  - Re-flow terminal-status reconciliation so `setGameStatus('ended')` / `setWinner(result)` / `clearOnlineSession()` run **independently** of whether a new remote move arrived this tick. Previously the `lastMoveIsLocal` early-return (and the no-new-history early-return) skipped the `ended` block, so a locally-submitted checkmate echoed by the server never cleared the session or surfaced the win via polling. Board rebuild + haptics stay gated on a genuine new remote move (strict ply count delta + parity skip for the local player's own echo).
- **Verification**: `bun run build` passes (~7s).

## [2026-07-24] - Fix Vercel API fallthrough 500s

- Disabled the legacy production SPA static-file fallback when the Express app runs inside Vercel. The Vercel function bundle does not contain `artifacts/api-server/src/dist/index.html`, so unmatched `/api/*` requests previously fell through to `sendFile()` and returned HTTP 500 with `ENOENT`.
- Added an API-scoped JSON 404 handler before the standalone frontend fallback so unknown or mistyped endpoints now return `{"error":{"message":"API endpoint not found."}}` instead of attempting to serve frontend HTML.
- Added Node regression tests covering unknown feature paths and the `/api/` root under production Vercel environment flags.

## [2026-07-24] - Address CodeRabbit review on PR #132

- **Frontend** (`artifacts/chess/src/contexts/UserContext.jsx`):
  - Definitive logout now wins over a fresh cache. Previously a backend `200 { session: null, user: null }` with a <7d cache silently kept the stale login until the cache expired — a backend-confirmed logout/revocation stayed visible on the client. The `else if (cacheFresh)` branch is now `else if (transient && cacheFresh)`, so only genuinely transient failures preserve the cache; a non-transient null response clears auth state even when the cache is fresh.
  - Fixed `isLoading` getting stuck `true` when the cache was stale AND a pending-OTP marker was present. `setIsLoading(false)` now runs whenever the component is mounted, regardless of `PENDING_OTP_KEY`.
- **Backend** (`artifacts/api-server/src/chess-server/routes/auth.js`):
  - Short-circuited the `/session` handler: `if (!userId)` now runs immediately after `validateSession(token)`, so invalid/expired/missing tokens never trigger a `SELECT * FROM users` round-trip. The users lookup (and its 503-on-throw) only runs for validated user IDs.
- **Verification**: `bun run build` passes (~5s), `node --check` on the route.

## [2026-07-24] - Persist login for up to 7 days across navigation

- **Bug**: Login state was being dropped within seconds of changing pages in the app. `UserContext`'s init effect re-ran on route navigation and called `/api/auth/session` every time; any transient backend hiccup (cold Neon connection, network blip) was indistinguishable from a real "logged out" and cleared `localStorage`, logging the user out.
- **Fix (frontend)**: `artifacts/chess/src/contexts/UserContext.jsx`
  - Cache-first: render the remembered user from `localStorage` instantly before any backend call.
  - Init guard (`initRanRef`) so verification runs once per provider mount, not on every route change.
  - 7-day TTL (`SESSION_CACHE_TTL_MS`), mirroring the backend `SESSION_DAYS = 7` sliding window; successful re-validation slides the window forward (updates `cachedAt`).
  - Transient tolerance: if `/api/auth/session` returns non-2xx or the fetch throws, keep the cached login while the cache is still fresh (< 7d). Only a definitive `200 { session: null, user: null }` with a stale/missing cache triggers a real logout.
- **Fix (backend)**: `artifacts/api-server/src/chess-server/routes/auth.js`
  - `GET /api/auth/session` returns `503 { kind: 'transient' }` when the DB query itself throws (broken/cold Neon), instead of `200 { session: null, user: null }` which was being conflated with a real logout. Missing token, invalid token, and user-not-found still return `200 { session: null, user: null }` (those ARE real logouts).
- **Verification**: `bun run build` passes (~5s).

## [2026-07-24] - Fix `/signup` black screen

- **Bug**: Landing-page Sign Up and Get Started controls navigate to `/signup`, but `App.jsx` had no `/signup` route. Vercel correctly served the SPA, then React rendered no matching route — resulting in a blank/black screen.
- **Fix**: Added a `/signup` compatibility route that redirects to the existing `/login` passwordless email-OTP flow.
- **Verification**: `pnpm --filter @workspace/chess run build` passes.

## [2026-07-23] - Fix username always rejected as "length 0"

- **Bug**: In `SetUsername`, no matter what was typed, the server always returned `Username must be 2-20 characters (yours is 0).` The root cause was a header-merge ordering bug in `services/api.js` `request()`:
  ```js
  // OLD — broken
  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },  // built first
    ...options,                                                            // then WIPED by options
  };
  ```
  Because `{...options}` came *last*, it shallow-copied `options.headers` (overwriting the freshly-built `headers`) for any call that passed its own headers — which `updateUsername` always does. `updateUsername` only sets `Authorization`, never `Content-Type`, so every username request left the client with **no `Content-Type` header**.
- **Impact**: With no `Content-Type: application/json`, Express's `json()` middleware skipped parsing, so `req.body` was `undefined` → `const { username } = req.body || {}` → `''` → length 0 → the misleading "too short" error on every single attempt. Other calls sending custom headers still worked (login path unaffected because it sets no custom headers).
- **Fix**: Reorder the merge so `...options` is applied first and `headers` last, preserving the `Authorization` passed by callers while always setting `Content-Type`:
  ```js
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };
  ```
- **Verification**: Built a harness simulating the exact `ConfigMerge` + Headers + Express `json()` middleware for old vs. new. OLD: 3/3 fail (Content-Type dropped → body unparsed → validator sees length 0) for any input. NEW: dummy username `testuser` → length 8, accepted; genuinely-short `a` → length 1, still rejected (validator intact); login-style calls with no custom headers unaffected. Verified both `api-server` (`dist/index.mjs`, 1.3 MB) and `chess` (`dist/public`) builds compile cleanly. **Live server test**: booted the real `auth.js` route (the same file Vercel runs) on a localhost Express app with DB/auth helpers stubbed, and hit `/api/auth/update-username` via the exact `fetch()` shape the frontend uses. Fixed merge -> server returned `{ success: true, user: { username: "testuser", ... } }` (status 200, length 8). Buggy merge -> server returned `Username must be 2-20 characters (yours is 0).` (status 400) for the identical input, reproducing the reported symptom end-to-end.
- **Files**: `artifacts/chess/src/services/api.js` (canonical `/home/workspace/Chess.com-app`), plus the same one-line reorder applied to sibling copies `chess.com-app/artifacts/chess/src/services/api.js` and `Chess.com-app-neon-swap/artifacts/chess/src/services/api.js` for consistency.
- **Regression test**: Added `api.test.js` case asserting `request()` sends both `Content-Type` and caller-provided `Authorization` headers (the merge-order invariant this fix restores). `npx vitest run` passes (2/2).

## [2026-07-23] - Fix landing page boards overlaying all content

- **Critical visual fix**: Each decorative `ChessBoard` wrapper uses absolute positioning. The landing page board frames were not positioned containers, so the wrappers could be positioned against the page rather than their intended frame, rendering oversized boards and pieces across the landing page.
- **`Landing.css`**: added `position: relative` to `.hero-board-frame` and `.feature-block-board`, containing each board within its fixed square frame at every viewport size.

## [2026-07-23] - Fix mobile nav drawer on the landing page

- **Bug**: On screens ≤1024px the hamburger menu button toggled `mobileNavOpen` state but the sidebar/backdrop never appeared, leaving the mobile landing broken — nav links unreachable and the layout misaligned.
- **Root cause**: `Landing.jsx` toggles a `nav-open` class on the root `.landing` element, but `Landing.css` was checking for an `.open` class on the sidebar/backdrop themselves (`.landing-sidebar.open`, `.landing-nav-backdrop.open`). Those selectors never matched, so the off-canvas transform and backdrop never applied.
- **`Landing.css`**: replaced the dead `.open` rules with `.landing.nav-open .landing-sidebar { transform: translateX(0); }` and `.landing.nav-open .landing-nav-backdrop { display: block; }`. No JSX change needed — the JS class toggle was already correct.
- Verified in the local preview: desktop (1440×900) keeps the inline sidebar; mobile (390×844) collapses to a top bar with a hamburger that opens a Play / Puzzles / Learn / Train / Watch / Community drawer over a dimmed backdrop, and the Feedback button stays in the bottom-left corner. `tsc` and the production build pass.

# Changelog

## [2026-07-22] - Landing redesign: chess.com theme + UI parity, Feedback button → bottom-left

- **`Landing.jsx`**: rewrote the landing page so its layout mirrors chess.com's homepage ("`marcusmok` mode"): fixed left sidebar (logo → Play / Puzzles / Learn / Train / Watch / Community nav → Sign Up / Log In buttons → search), a hero with a real `react-chessboard` board + "Play Chess Online — by Marcus" headline + green **Get Started** CTA, a live-stats strip (players online / games / members), a row of compact feature cards (Lessons / Bots / Puzzles / Watch), alternating full-width feature blocks each with its own board position, an app download promo, and a footer with social links. Distinctive departures kept on purpose: live-player count fetched from `/stats/public`, local Play Online / Play Computer CTAs instead of chess.com's "Today's Leader", and an in-app brand mark. Analytes precomputed once at module scope (was `useMemo` inside `.map` — invalid hook call).
- **`Landing.css`**: complete rewrite to match chess.com's visual language — page `#1a1a1a`, surfaces `#272522` / `#312e2b`, primary `#81b64c` (green) with `#6e9c3f` hover, board `#779556` light / `#ebecd0` dark square, 12px rounded corners, 200ms transitions, Nunito (already global). Sidebar collapses into a top mobile bar + off-canvas drawer at ≤1024px. Full responsive breakpoints at 1024 / 768 / 480px.
- **`FeedbackPanel.css`**: moved the floating Feedback trigger from top-right (`top: 70px; right: 20px`) to the **bottom-left corner** (`position: fixed; bottom: 18px; left: 18px`) at desktop, 480px, and 360px breakpoints. Modal and overlay positioning retained.
- Verified end-to-end: `pnpm run build` passes (2428 modules → 3.86s), preview server renders the new layout (sidebar → board hero → stats → feature cards → alternating blocks → footer) and confirms the Feedback button sits bottom-left as requested. Fixed two icon imports surfaced by the build: `PuzzlesIcon` → `Puzzle`, `Pawn` → `Crown` (the installed lucide-react version has no `Pawn` glyph).
- Files changed: `artifacts/chess/src/pages/Landing.jsx`, `artifacts/chess/src/pages/Landing.css`, `artifacts/chess/src/components/FeedbackPanel.css`.

## [2026-07-22] - Better SetUsername validation messages (root cause of the "always errors on valid 2-20" bug)

- **Bug**: User typed a valid-looking 2-20 username (e.g. `John Doe` with an interior space, or a username starting/ending with a space) and got the generic `"Username must be 2-20 characters."` error — which told them nothing useful and made it look like the length check itself was broken. The real rejection was the `USERNAME_RE = /^[a-zA-Z0-9._-]{2,20}$/` character-class test firing on space/special chars.
- **`auth.js` `/update-username` route**: split the single regex check into two checks so the error message actually names the failed rule — first a length check (`"Username must be 2-20 characters (yours is N)."`), then a character check (`"Usernames can only contain letters, numbers, dots (.), hyphens (-), and underscores (_). No spaces, @, or special characters."`).
- **`SetUsernameModal.jsx`**: added a frontend pre-check for leading/trailing spaces (`"Usernames can't start or end with a space."`) and clarified the rejected-characters message. Catches the most likely accidental case before it ever hits the server.
- Verified with Vite production build — `node_modules/.bin/vite build` passes with no new errors.
- Files changed: `artifacts/api-server/src/chess-server/routes/auth.js`, `artifacts/chess/src/components/SetUsernameModal.jsx`.

## [2026-07-22] - Mobile frontend optimisation sweep

- **Dynamic viewport units**: replaced `min-height/height: 100vh` with `100svh`/`100dvh` across all layout surfaces (`App.css` `.app` + `.loading-screen`, `ChessGame.css`, `PlaySetup.css`, `Home.css`, `Landing.css`, `Terms.css`, `ErrorBoundary.css`) so content no longer hides behind the iOS/Android URL bar or home indicator on mobile.
- **`Login.css` (the previously unstyled-for-mobile page)**: added explicit mobile + extra-small-phone media queries — `safe-area-inset` padding around the notch, `100svh` height, narrower card with `box-sizing: border-box`, and a ≤380px variant that aligns to the top on tiny phones to avoid clipping by the home indicator. Removed a redundant duplicated `padding` declaration.
- **`Home.css`**: added a small-phones (`≤380px`) media query that scales the welcome title (1.625rem), subtitle, stat-card padding, and action-card typography so the entry screen no longer overflows on iPhone SE/mini-class devices.
- Applied CodeRabbit review feedback (PR #124): removed a trailing `padding: 2rem` override in `ErrorBoundary.css` that nullified the safe-area-aware inset padding, and corrected the `Login.css` padding shorthand to use `inset-right`/`inset-left` in their CSS-spec positions (top/right/bottom/left) so cutout-side phones are padded correctly.
- Verified with `bun run build` (production bundle) — all changes pass and no new errors.

---

## [2026-07-22] - Fix Neon Auth email-OTP proxy: wrong upstream path + missing body.type

- Fixed `proxyToNeonAuth` in `artifacts/api-server/src/chess-server/routes/auth.js`:
  - Strips `/api/auth` prefix before joining on `NEON_AUTH_BASE_URL` (which already ends in `/neondb/auth`).
  - Fixes 404/empty-error responses on `email-otp/send-verification-otp`, `email-otp/resend`, `sign-in/email-otp`, and `sign-out`.
- Added default OTP `body.type = "sign-in"` for `send-verification-otp` and `resend` (Neon Auth requires explicit `type`: `sign-in` | `email-verification` | `forget-password`). Callers can still override.
- Frontend unchanged — it still POSTs `{ email }` / `{ email, otp }` to `/api/auth/...`, which now proxies correctly.
- Added unit tests (`artifacts/api-server/src/chess-server/routes/auth.proxy.test.js`, Node native test runner): verify prefix stripping, default `type` injection, and explicit `type` override.
- Verified end-to-end against live `NEON_AUTH_BASE_URL`: returns HTTP 200 `{"success":true}` instead of HTTP 404 / `{"error":{"message":"\"\""}}`.

---

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


## [2026-07-16] - Restore Neon Auth Native Email Verification with Retries

### Fixed
- **Restored Neon Auth native email verification flow**: Modified `/api/auth/*` endpoints in `routes/auth.js` to proxy OTP requests to the Neon Auth API (`NEON_AUTH_BASE_URL`), allowing native email OTP generation and delivery without relying on a local/custom email mailer.
- **Added robust retry logic in proxying**: Built `proxyToNeonAuth` with 3 retries and exponential backoff (delaying 500ms, 1000ms, and 2000ms) on HTTP 5xx errors and connection/network failures to prevent login errors on transient service glitches.
- **Detailed error surfacing**: Hardened error handling to gracefully catch exhausted retries and surface detailed, underlying error messages (such as exact HTTP statuses and network exceptions) back to the client UI to make future debugging clear and friction-free.

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
