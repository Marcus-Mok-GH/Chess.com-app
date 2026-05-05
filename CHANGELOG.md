# Changelog

## 1.1.26 - 2026-05-05
- Fixed Vercel install command failure by removing unsupported `--no-workspaces` flag from `npm ci`.
- Kept install command compatible across npm versions used by Vercel builders.

## 1.1.25 - 2026-05-05
- Fixed Vercel npm install failures by pinning `brace-expansion` away from blocked `1.1.14` lockfile resolution.
- Updated lockfile package resolution to `brace-expansion@1.1.12` and removed stale integrity entries for deterministic installs.

## 1.1.24 - 2026-05-05
- Fixed npm install/CI lockfile resolution by replacing SSH-based `libsignal-node` lockfile URLs with HTTPS equivalents.
- This prevents `npm ci` failures in environments without outbound SSH access to GitHub (port 22).

## 1.1.23 - 2026-05-05
- Refined the `/login` page with a secure sign-in badge and clearer value-focused intro copy.
- Added quick benefit callouts to communicate speed, security, and profile continuity before authentication.
- Preserved the existing magic-link flow while improving visual hierarchy and readability on desktop and mobile.

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
