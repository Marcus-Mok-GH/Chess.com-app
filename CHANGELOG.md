# Changelog

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
