# Changelog

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
