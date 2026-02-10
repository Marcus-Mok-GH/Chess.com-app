# React Chess Multiplayer App

Real-time online chess with ELO ratings, bots (Stockfish), AI coaching (Mistral), game history/analysis. Vite React frontend + Express/Socket.IO backend + PostgreSQL.

## Quickstart
- `npm install` (uses bun lockfile)
- Setup DB: PostgreSQL + `server/setup-db.sql`; set `DATABASE_URL` in `.env`
- Dev: `npm run dev` (fullstack) or `npm run dev:all`
- Test: `npm test` (Vitest); `npm run test:coverage`; E2E: `npm run test:e2e`
- Build: `npm run build`; Preview: `npm run preview`
- Lint: `npm run lint` (Vite prod build)

## Architecture
- **Client** (`src/`): App.jsx (routing), components/ (UI: ChessBoard.jsx etc.), pages/ (Home.jsx, Play.jsx), services/ (api.js, socket.js), engine/ (AI/workers)
- **Server** (`server/`): index.js (Express bootstrap), routes/ (users/games), socket/ (matchmaking/game), db.js (Postgres pool)
- **Static**: `public/` (Stockfish WASM, pieces)
- Data: Users (ELO/games), Games (history/moves)

## Conventions
- 2-space indent; JSX single quotes; server semicolons
- Naming: PascalCase components/pages, camelCase hooks/utils
- Co-located tests: `*.test.jsx`
- API calls: `src/services/api.js`; Socket: `src/services/socket.js`
- Reuse: chess.js lib, Stockfish workers

## Gotchas
- Env: `DATABASE_URL`, `FRONTEND_URL` (CORS), `MISTRAL_API_KEY` (coaching)
- No WebSockets on Vercel (use external backend)
- Guest mode fallback (no DB)
- Tests need `tests/setup.js` globals (fetch/WS polyfills)
- Commit every change; `npm test` + `npm run build` pre-PR
