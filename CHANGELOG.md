# Changelog

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
- Fixed OTP flow implementation to match Supabase docs: removed unsupported attempt to force OTP via request payload.
- Kept explicit send-success UI so OTP requests no longer look like silent failures.
- Updated success copy to clarify OTP vs magic-link behavior depends on Supabase Email Template configuration.

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
