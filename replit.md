# PlayChess

A chess platform for playing against bots or other players online, with puzzles, openings, lessons, and email-code login.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/chess run dev` — run the chess frontend (Vite)
- `pnpm run test` — curated Vitest suite (34 files listed in root `package.json`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite (with SSR entry), Tailwind 4, react-router
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: better-auth with email OTP (6-digit codes)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/chess` — React frontend. Pages in `src/pages/` (Login/VerifyEmail, OnlinePlay, Puzzles, Openings, Lessons, Friends, Changelog), game components in `src/components/`, pure logic in `src/utils/` and `src/engine/`.
- `artifacts/chess/public/CHANGELOG.md` — user-facing changelog; **must be updated after every change** (see `agents.md`).
- `artifacts/api-server` — Express 5 API. Everything interesting is under `src/chess-server/`: `routes/` (HTTP), `services/` (game, matchmaking, chess clock, Elo), `db/` (Postgres access + self-healing schema), `kv/` (Upstash Redis for live game presence), `puzzles/`, `openings/`, `lessons/`.
- `lib/db` — Drizzle schema (`src/schema/`) and drizzle-kit config; source of truth for DB tables.
- `lib/api-spec` — OpenAPI spec + Orval config; source of truth for API contracts.
- `lib/api-client-react`, `lib/api-zod` — generated client hooks and Zod schemas (do not hand-edit).

## Architecture decisions

- The chess clock is server-authoritative and scheduler-free (which is what makes it correct on serverless): remaining time is derived from stored ms-per-side plus a `clock_running_since` timestamp, moves bake elapsed time into the mover inside the same compare-and-set update as the board, and flag fall is resolved lazily on any read (poll, move, or fetch).
- The API database schema self-heals: `initDatabase` version-gates its DDL via `schema_meta`, and plain queries and transactions both detect missing table/column errors (`42P01`/`42703`), force a full DDL pass, and retry. Adding columns therefore requires bumping the schema version — a test enforces this.
- Online reactions are display-layer only: the wire format is a plain word sent through the normal chat endpoint; the word→emoji mapping and floating-burst rendering happen client-side.
- Email verification state is coordinated through a global guard (`GlobalVerificationGuard`) rather than per-page navigation calls, to avoid races between async state updates and `navigate()`.
- `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (1-day package age) as supply-chain defense — do not disable or exclude packages from it casually.

## Product

- **Play online**: ranked matchmaking with chosen time control (Rapid 10+0 or Unlimited — timed and untimed players never pair), or friendly games where the creator picks the control and seat color (White / Random / Black). Live clocks, resign/draw, emoji reactions floating over the board, in-game chat, Elo updates and post-game analysis for ranked games.
- **Play bots**: local engine games (Stockfish) with color choice, including a random-color roll at game start.
- **Train**: puzzles with solution-piece hints, openings explorer, lessons.
- **Accounts**: passwordless email login — enter email, receive a 6-digit code, verify. Friends list and presence.

## User preferences

- PR vs direct push: create a PR for complex changes (including complicated backend changes); simple frontend changes can be pushed directly to `main`.
- Commit/PR attribution: do NOT add any author, co-author, or generated-by trailers (e.g. no `Co-Authored-By:` lines, no `🤖 Generated with Codebuff` footers) to commits or PR descriptions.

## Gotchas

- **Always update `artifacts/chess/public/CHANGELOG.md` after every change** — it's a mandatory rule in `agents.md`, with clear, dated entries.
- **Use pnpm, not npm/yarn** — the root `preinstall` script hard-fails on anything else.
- **Register new test files in the root `package.json` `test` script.** It is a curated list of files, not a glob — a new test file is silently skipped by `pnpm run test` until added there. Running a bare `vitest run` sweeps in hundreds of files that aren't part of the canonical suite.
- **DB schema changes need a schema-version bump** in the API server's `db/` init code (a test enforces it), and new columns should ride the additive `ADD COLUMN IF NOT EXISTS` self-heal pass so existing installs receive them.
- Frontend pages share auth styling through `src/pages/Login.css` — verify-email and related screens intentionally reuse the `login-*` classes rather than duplicating styles.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
