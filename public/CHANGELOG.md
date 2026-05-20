# Changelog

## 1.1.72 - 2026-05-22
- Fixed a bug where clicking "Logout" or "Sign Out" had no effect by making the `logout` function more robust.
- Added automated unit tests to ensure local session state is cleared even if remote sign-out fails.
- Guaranteed navigation to the landing page after logout to provide immediate feedback and reset the UI state.

## 1.1.71 - 2026-05-21
- Removed automatic redirect from landing page for authenticated users.
- Updated app logo to always link to the landing page.
- Updated landing page Hero CTA to "Go to Dashboard" for logged-in users.

## 1.1.70 - 2026-05-20
- Fixed "Load failed" error in Safari during OTP code request.
- Implemented missing server-side Better Auth (Neon Auth) configuration and handler.
- Added database migration for Better Auth tables (users, sessions, accounts, verifications).
- Improved CORS and origin handling for Vercel deployments.

## 1.1.69 - 2026-05-19
- Migrated authentication from Supabase to Neon Auth (Better Auth).
- Replaced `@supabase/supabase-js` with `@neondatabase/auth` and implemented a native Neon Auth client.
- Updated the OTP flow to support 6-digit codes; adjusted input constraints, placeholder text, and user-facing messaging in `VerifyEmail.jsx` and `UserContext.jsx`.
- Removed Supabase-specific routes and hooks, including the `/auth/callback` path and `useMagicLink` helper.
- Enhanced `UserContext` session restoration to work with Neon's cookie-based session management.

## 1.1.68 - 2026-05-19
- Removed startup schema-mismatch reset gating from database initialization to avoid boot-time crashes when legacy columns are detected.
- Kept startup database initialization focused on idempotent `CREATE TABLE IF NOT EXISTS`/index creation so all required tables are always ensured at boot.

## 1.1.67 - 2026-05-19
- Optimized PostgreSQL pool configuration for Vercel + Neon by tuning serverless pool sizing and idle timeout defaults.
- Added Neon pooler hostname detection/warnings to help prevent non-pooled connection strings in serverless deployments.
- Kept IPv4-only socket forcing scoped to Supabase hosts so Neon deployments can use their standard pooled endpoints on Vercel.

## 1.1.66 - 2026-05-18
- Fixed database initialization failure caused by type mismatch between integer and string-based player IDs.
- Standardized all player ID columns across the database schema to `VARCHAR(100)` and enabled `pgcrypto` for UUID generation.
- Added a conditional one-time database reset that only triggers when a legacy integer-based schema is detected.

## 1.1.65 - 2026-05-16
- Fixed OTP verification to accept 8-digit codes issued by Supabase; updated input length limits, validation conditions, placeholder text, and all user-facing messaging in `Login.jsx`, `LoginModal.jsx`, and `UserContext.jsx`.

## 1.1.64 - 2026-05-14
- Updated the landing page primary "Get started" button to redirect users to the login page.

## 1.1.63 - 2026-05-14
- Updated the landing page primary CTA labels by replacing "Play vs Computer" and "Play Online" with "Get started."

## 1.1.62 - 2026-05-14
- Fixed magic-link callback completion when Supabase returns auth data in URL hash (including `token_hash` or `code`) by reading hash parameters in addition to query parameters.
- Improved post-redirect session hydration timing for callback URLs that arrive without direct tokens, reducing cases where users stayed on the login page after opening a valid magic link.

## 1.1.61 - 2026-05-14
- Added support for a configurable Supabase magic-link callback URL via `VITE_SUPABASE_AUTH_CALLBACK_URL`.
- Magic-link requests now prefer the configured callback URL and append `type=magiclink` and `requestId` automatically.

## 1.1.60 - 2026-05-13
- Fixed magic-link callback handling when redirect URLs only include `requestId` (e.g., ending with `#`) by retrying Supabase session hydration for a short window before failing.
- Reduced false-negative login failures where users were sent back to the login screen despite a valid magic-link session still initializing in the browser.

## 1.1.59 - 2026-05-14
- Fixed magic-link login reliability by improving post-redirect session synchronization and relaxing token validation when a session is already established by the browser.
- Improved user session recovery to automatically register/sync backend profiles when a valid Supabase session exists but the local profile is missing.
- Fixed a bug where clicking a magic link would sometimes land on the login page without completing the sign-in process.

## 1.1.58 - 2026-05-13
- Redesigned app icon with a stylized knight silhouette, green accent gradient, subtle board pattern, and glow effects matching the app's dark theme and color palette.

## 1.1.57 - 2026-05-09
- Implemented Remote Authentication feature: Magic links requested on one device and opened on another will automatically log in the original device.
- Added Socket.io handlers for cross-device session transfer and remote login notifications.
- Updated Login UI to provide feedback when a remote login is successfully completed.

## 1.1.55 - 2026-05-08
- Refined README.md for a technical audience, adding deep architecture details and environment configuration.
- Removed public-facing installation steps and local screenshot references from README.md.

## 1.1.54 - 2026-05-08
- Updated README.md with comprehensive project-specific information, features, tech stack, and setup instructions.
- Removed generic Replit boilerplate from README.md.

## 1.1.53 - 2026-05-08
- Removed Stockfish move fallback behavior so bot turns now require a successfully initialized engine and report explicit worker errors when initialization/search fails.

## 1.1.52 - 2026-05-08
- Improved Stockfish bot reliability by simplifying worker engine path resolution, extending engine startup timeout, and prioritizing consistent UCI initialization before selecting moves.
- Reduced unintended weak-bot behavior at high ratings by avoiding unnecessary initialization failures that previously triggered fallback legal/random move selection.

## 1.1.51 - 2026-05-07
- Fixed login "Load failed" error in Safari by removing hardcoded `localhost` fallbacks in `vite.config.js` and normalizing API base URLs to use relative paths in production.
- Enhanced Supabase client initialization to handle missing environment variables with descriptive error messages instead of generic network failures.

## 1.1.50 - 2026-05-07
- Removed `NEXT_PUBLIC_*` API/socket URL fallbacks from client networking so runtime endpoints are resolved exclusively from Vite environment variables.

## 1.1.49 - 2026-05-07
- Fixed login/API network failures caused by protocol-less API host values by deriving the request protocol from the active browser origin before appending `/api`.

## 1.1.48 - 2026-05-07
- Updated Stockfish worker fallback comments to clearer AI-themed wording while keeping the AI move-recovery behavior intact.

## 1.1.47 - 2026-05-07
- Fixed AI turn freezes by adding Stockfish worker initialization timeout/error fallback, so the bot now always responds with a legal move even if the engine fails to boot.

## 1.1.46 - 2026-05-07
- Optimized the app header for mobile screens with tighter spacing, adaptive layout, and cleaner title/logout behavior on narrow devices.
- Improved bottom navigation touch ergonomics with larger tap targets and safe-area-aware spacing for modern phones.
- Tuned home page mobile spacing/card density so key stats and sections are easier to scan without crowding.

## 1.1.45 - 2026-05-07
- Added/updated automated tests for landing-page live stats rendering and redirect behavior.
- Added API client coverage for `getPublicStats()` to ensure `/stats/public` requests are exercised.

## 1.1.44 - 2026-05-07
- Fixed API route wiring so `/api/health` and `/api/stats/public` are registered independently.
- Hardened public stats initialization to auto-run database setup when tables are missing, preventing landing-stat crashes during first boot.

## 1.1.43 - 2026-05-07
- Replaced landing-page mock stats with live backend metrics (online players, registered players, recorded games, and server uptime) fetched in real time from a new public stats API endpoint.

## 1.1.42 - 2026-05-07
- Added global favicon link coverage so the chess icon appears consistently across app routes (including `/login`) and auxiliary static test pages.

## 1.1.41 - 2026-05-07
- Removed `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallbacks so Supabase auth now reads only Vite env variables (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).

## 1.1.40 - 2026-05-07
- Optimized the mobile header so navigation wraps cleanly and can be horizontally scrolled instead of clipping on smaller phones.
- Improved compact-screen in-game layout by making sidebar panels stack full width to reduce cramped two-column cards.

## 1.1.38 - 2026-05-06
- Fixed Supabase magic-link sign-in callback handling so login succeeds even when the redirect omits `username`/`email` query params by caching pending magic-link context locally.
- Updated magic-link redirect URL to a stable `/login?type=magiclink` callback and clear URL hash tokens after successful callback processing.

## 1.1.37 - 2026-05-06
- Fixed magic-link login callback handling for implicit-flow redirects containing `#access_token` + `refresh_token` by persisting the returned session before app login.
- Kept token-hash verification path for query callbacks and continued accepting both `type=magiclink` and `type=email` callback variants.
- Reduced `/login` auth loop risk by completing sign-in from either callback format used by Supabase email links.

## 1.1.36 - 2026-05-06
- Fixed magic-link callback completion when Supabase returns `type=email` by treating both `magiclink` and `email` callback types as valid auth returns.
- Normalized callback verification payloads to use Supabase-compatible `type=email` for magic-link verification requests.
- Added regression coverage for query callbacks that arrive with `type=email` to prevent `/login` loops after clicking emailed links.

## 1.1.35 - 2026-05-06
- Fixed magic-link callback reliability so `/login` now completes sign-in when Supabase returns hash-based `access_token` callbacks as well as query token variants.
- Added authenticated-user auto-redirect on `/login` to guarantee post-auth navigation lands on `/home` instead of remaining on the login screen.
- Persisted Supabase auth session locally after OTP verification and reuse it via `getSession()` so startup auth checks no longer clear a freshly-created magic-link session.
- Added login callback regression tests covering both query `token_hash` and hash `access_token` callback formats.

## 1.1.34 - 2026-05-06
- Improved startup performance by restoring cached user sessions immediately and moving Supabase/API session refresh into a non-blocking background sync.
- Optimized font loading in `index.html` with stylesheet preload + noscript fallback to reduce render-blocking on first paint.

## 1.1.33 - 2026-05-06
- Hardened magic-link callback handling by verifying Supabase callback tokens before app login and then redirecting to `/home`.
- Added support for callback token parsing from query (`token`, `token_hash`) and hash fragments for reliable post-email-link sign-in.

## 1.1.32 - 2026-05-06
- Reverted authentication flow from OTP code entry back to magic-link sign-in on both login surfaces.
- Restored magic-link redirect callback handling on `/login` for automatic post-link sign-in.

## 1.1.31 - 2026-05-06
- Refined `public/favicon.svg` to better match the app's chess theme with board colors and a centered king silhouette.

## 1.1.30 - 2026-05-06
- Refined OTP login modal state handling and improved OTP input semantics (`inputMode` + `one-time-code` autocomplete).
- Added a new custom chess-themed `public/favicon.svg` app icon.

## 1.1.29 - 2026-05-06
- Switched login authentication from magic-link sign-in to explicit 6-digit OTP verification on both the full login page and ranked login modal.
- Added client-side OTP verification flow before profile login to ensure users complete one-time code validation.
- Updated auth UX copy and button states to reflect requesting and verifying OTP codes instead of magic links.

## 1.1.28 - 2026-05-06
- Added `src/pages/Changelog.test.jsx` to verify changelog markdown is fetched from `/CHANGELOG.md` and rendered correctly.
- Added UI smoke coverage for changelog header/back button rendering behavior.

## 1.1.27 - 2026-05-06
- Fixed `/changelog` build failures by loading changelog content via runtime fetch from `/CHANGELOG.md` instead of importing `../../CHANGELOG.md?raw`.
- Added `public/CHANGELOG.md` so production deployments (including Vercel) always serve the changelog file at a stable path.

## 1.1.26 - 2026-05-06
- Installed `vite` explicitly with `npm install` and verified local production build succeeds.
- Added missing `@testing-library/dom` dev dependency to fix Vitest module resolution errors.
- Verified both `npm run build` and `npm test` pass locally after dependency updates.

## 1.1.25 - 2026-05-06
- Adjusted Vercel install command to `npm ci --include=dev ...` so build-time tools in `devDependencies` are installed during deployment builds.
- Reverted `vite` and `@vitejs/plugin-react` back to `devDependencies` to keep runtime dependencies lean.
- Removed `NODE_ENV` from `vercel.example.json` to avoid unintentionally omitting dev dependencies during Vercel installs.

## 1.1.24 - 2026-05-06
- Fixed deployment build failure (`Command "npm run build" exited with 1`) caused by missing `vite` binary when hosts install only production dependencies.
- Moved `vite` and `@vitejs/plugin-react` into runtime `dependencies` so `vite build` is available in CI/CD build environments.

## 1.1.23 - 2026-05-06
- Regenerated `package-lock.json` to resolve `npm ci` EINTEGRITY failures on `brace-expansion@1.1.14` tarball verification.
- Confirmed deterministic install now succeeds with `npm ci --ignore-scripts --no-audit --no-fund --legacy-peer-deps --no-workspaces`.

## 1.1.22 - 2026-05-04
- Fixed Vercel install flag usage by replacing invalid `--workspaces=false` with npm-supported `--no-workspaces` on `npm ci`.
- Kept lockfile-based installs and peer dependency compatibility flags for deterministic CI deployments.

## 1.1.21 - 2026-05-04
- Restored lockfile integrity and kept deterministic Vercel installs on `npm ci` instead of switching to `npm install`.
- Updated Vercel install command to explicitly pass `--workspaces=false` with existing safety flags to prevent workspace-context parsing issues in CI.

## 1.1.20 - 2026-05-04
- Adjusted Vercel install step to use `npm install` with production-safe flags instead of `npm ci` to avoid workspace-flag parsing failures during deployment.
- Kept `legacy-peer-deps` behavior in the install command so Vercel builds remain resilient to peer dependency conflicts.

## 1.1.19 - 2026-05-04
- Replaced manual OTP code entry with magic-link authentication on both the login page and login modal.
- Added magic-link request flow with redirect metadata so returning users are automatically signed in and sent to the logged-in home page.
- Updated Supabase OTP request payload to include `email_redirect_to` for auto-auth callback behavior.

## 1.1.18 - 2026-05-04
- Stabilized Vercel dependency installation by switching the deploy install step to lockfile-based `npm ci` with `--legacy-peer-deps`.
- Added an npm config fallback (`legacy-peer-deps=true`) to avoid peer-resolution install failures in stricter npm environments.

## 1.1.17 - 2026-05-04
- Rebuilt `/changelog` page to render directly from `CHANGELOG.md` so the in-app page matches file content and formatting.
- Added Home quick-action button to open `/changelog` from the logged-in main page.
- Added a "Back to Home" button on the changelog page for easy two-way navigation.

## 1.1.16 - 2026-05-04
- Allowed non-participants to join online games as spectators with read-only realtime updates.
- Restricted move submission to only the two bound match players and added explicit spectator move rejection.
- Enforced server-side turn order so only the active color can submit a move.

## 1.1.15 - 2026-05-04
- Fixed online multiplayer move sync by binding Socket.IO connections to each player when joining a game created via HTTP APIs.
- Added explicit game-participant authorization in Socket.IO `join_game` so only players in the match can subscribe and move.
- Removed invalid client-side `socket.leave(...)` call that could interrupt online game session cleanup in browsers.

## 1.1.14 - 2026-05-04
- Fixed online multiplayer move sync by binding Socket.IO connections to each player when joining a game created via HTTP APIs.
- Added explicit game-participant authorization in Socket.IO `join_game` so only players in the match can subscribe and move.
- Removed invalid client-side `socket.leave(...)` call that could interrupt online game session cleanup in browsers.

## 1.1.13 - 2026-05-04
- Added visible success confirmation after OTP send requests so users know the request completed.
- Forced Supabase OTP requests to use OTP email content type instead of magic-link content.
- Updated login UX copy to explicitly state users should receive a 6-digit OTP code, not a magic link.

## 1.1.12 - 2026-05-04
- Added automatic database self-healing: if a query fails with missing-table (`42P01`), the app re-initializes schema and retries once.
- Prevented route crashes when tables are missing by triggering `initDatabase()` on-demand from the shared DB query layer.

## 1.1.11 - 2026-05-04
- Aligned OTP request payload shape with Supabase's documented `options` object (`shouldCreateUser` + metadata).
- Updated login copy to focus on email OTP code entry only.
- Removed remaining magic-link wording from login surfaces.

## 1.1.10 - 2026-05-04
- Removed remaining password-based login path in the ranked-game login modal.
- Fully switched Supabase auth UX to email OTP verification in both login surfaces.
- Kept explicit OTP code entry flow (no magic link fallback).

## 1.1.9 - 2026-05-04
- Fixed Supabase OTP request payload to use documented `create_user` and metadata fields.
- Improved OTP request UX by separating "send code" and "verify code" loading states.
- Included username metadata when requesting OTP and added pre-send username validation.

## 1.1.8 - 2026-05-04
- Replaced Supabase email/password auth with email OTP verification flow.
- Removed magic-link usage from the login experience; users now request and enter a one-time code.
- Kept username-based game profile provisioning after successful Supabase OTP verification.

## 1.1.7 - 2026-05-03
- Unified frontend env variable support to accept both `VITE_*` and `NEXT_PUBLIC_*` names for shared API/socket/Supabase config.
- Updated Vite env exposure to include `NEXT_PUBLIC_` prefix for cross-frontend compatibility.

## 1.1.6 - 2026-05-03
- Updated Fireworks proxy coach endpoint path to OpenAI-compatible `/v1/chat/completions`.

## 1.1.5 - 2026-05-03
- Updated coach Fireworks integration to use the provided proxy endpoint base URL (`FIREWORKS_BASE_URL`).
- Made coach auth header optional so the proxy can run with or without `FIREWORKS_API_KEY`.
- Exposed endpoint details in `/coach/status` and updated coach availability messaging.

## 1.1.4 - 2026-05-03
- Switched AI coach provider from Mistral to Fireworks AI.
- Updated coach endpoints to use Fireworks chat completions with configurable `FIREWORKS_COACH_MODEL`.
- Updated coach UI messaging to reference `FIREWORKS_API_KEY` and Fireworks branding.

## 1.1.3 - 2026-05-03
- Switched authentication flow to Supabase Auth with email/password sign-in and auto sign-up fallback.
- Updated login screens and modal to collect Supabase credentials while preserving in-app username profiles.

## 1.1.2 - 2026-02-10
- Fixed Neon serverless driver pool config for Vercel production: separated pg/Neon pool options, dynamic ws import, auto-detect Neon hosts, enabled secure WebSocket.

## 1.1.1 - 2026-02-10
- Added missing `elo_history` table creation to database init (fixes 500 on ELO update route).
- Improved login error logging for easier debugging on Vercel.

## 1.1.0 - 2026-02-10
- Expanded matchmaking polling improvements for serverless environments.
- Added ELO progress and win rate charts to game history and profile views.
- Added Playwright E2E coverage for matchmaking polling fallback and cancel flow.
- Improved matchmaking connection handling, logging, and guardrails.
- Fixed online bot play to apply UCI moves reliably with Stockfish timeout fallback.
- Ensured Vitest ignores Playwright specs during unit test runs.

## 1.0.1 - 2026-02-09
- Introduced HTTP polling matchmaking endpoints for Vercel-style serverless hosting.
- Improved Socket.IO compatibility for external server configurations.
- Deployment configuration updates for Vercel and hosting environments.

## 1.0.0 - 2026-02-04
- Added database readiness logging for troubleshooting.
