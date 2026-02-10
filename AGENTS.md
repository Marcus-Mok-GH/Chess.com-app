# Repository Guidelines

## Project Structure & Module Organization
- React client lives in `src/` (routing in `src/App.jsx`, UI in `src/components/`, pages in `src/pages/`, state/providers in `src/contexts/`, helpers/workers in `src/utils/`).
- Express + Socket.IO backend is in `server/` (`server/index.js` bootstrap, `server/routes/` HTTP APIs, `server/socket/` realtime handlers, `server/db.js` pool + schema bootstrap + cleanup jobs).
- Static assets and Stockfish WASM are served from `public/`; legacy Next.js shells remain in `app/` and `pages/` for compatibility.
- Tests use Vitest; shared setup sits in `tests/`, while specs are colocated next to source files as `*.test.jsx` or `*.spec.jsx`.

## Build, Test, and Development Commands
- `npm run dev` – start full stack (Express + Vite) for local development.
- `npm run dev:server` / `npm run dev:vite` – run backend or frontend separately.
- `npm run build` then `npm run start` – produce Vite build to `dist/` and serve via Express.
- `npm test` – Vitest suite; `npm run test:watch` for TDD; `npm run test:coverage` enforces project coverage thresholds; `npm run test:setup` seeds browser-like globals if needed.

## Coding Style & Naming Conventions
- Use 2-space indentation. Frontend prefers single quotes; Node server files expect semicolons.
- Components/pages: PascalCase (`ChessBoard.jsx`); hooks: camelCase (`useClock.js`); CSS mirrors component names (`ChessBoard.css`).
- Keep API calls in `src/services/api.js`; Socket.IO client logic in `src/services/socket.js`; worker scripts in `src/utils/`.
- Run `npm run lint` (Vite production build) before commits to catch formatting drift.

## Testing Guidelines
- Stack: Vitest + @testing-library/react + jsdom (`vitest.config.js`). Globals and DOM/network stubs live in `tests/setup.js` (fetch, WebSocket, Intersection/ResizeObserver).
- Prefer colocated tests beside implementation; name with `.test.jsx` or `.spec.jsx`. Aim to keep thresholds (80/80/75/80) green via `npm run test:coverage`.

## Commit & Pull Request Guidelines
- Write imperative, descriptive commits (e.g., `feat: add Socket.IO matchmaking cleanup`).
- For every edit or change, create a git commit and push it to the remote.
- For every edit or change, update `CHANGELOG.md` and bump the app version in `package.json` and `package-lock.json`.
- Branch naming: `feature/<short-desc>` or `fix/<short-desc>`; default branch protection unknown—run `npm run build` and `npm test` before opening PRs.
- PRs should summarize scope, note test results, and link issues; include screenshots for UI changes when possible.

## Security & Configuration Tips
- Never commit `.env`. Required vars: `DATABASE_URL`, `PORT`, `FRONTEND_URL`, `MISTRAL_API_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, optional `VITE_SERVER_URL`; set `FORCE_POLLING=true` only when WebSockets are blocked.
- Adjust CORS via `FRONTEND_URL` before deploying; coach endpoints proxy paid Mistral API—consider rate limiting for public exposure.

## Architecture Overview
- Vite React client ↔ Express/Socket.IO API ↔ PostgreSQL; Stockfish runs in web workers; Mistral AI powers coaching endpoints. Health checks at `/health` and `/api/health` assist readiness probes.
