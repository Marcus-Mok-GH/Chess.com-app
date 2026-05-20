# chess.com-app

A sophisticated, full-stack React chess platform featuring real-time multiplayer, advanced AI opponents, and deep game analysis. This internal repository hosts the core engine, socket orchestration, and premium UI components.

## 🚀 Technical Stack

### Frontend (SPA)
- **Runtime**: React 18, Vite-powered HMR
- **Routing**: React Router 7 (Data-driven navigation)
- **Engine**: Chess.js (logic) & React-Chessboard (rendering)
- **AI Integration**: Puter.js v2 & Fireworks AI (DeepSeek models)
- **Analytics**: Recharts (D3-based) & Vercel Analytics
- **Design**: CSS Modules with CSS Variables for theme consistency

### Backend (Node.js)
- **Server**: Express (REST API)
- **Real-time**: Socket.IO (Event-driven state sync)
- **Database**: PostgreSQL with `@neondatabase/serverless` for edge compatibility
- **Auth**: Supabase Auth (PKCE/Magic Link flows)
- **Engine**: Stockfish.js running on the server-side via Node.js API

## 🛡️ Architecture & Data Flow

- **Matchmaking Engine**: Utilizes a hybrid Socket.IO/HTTP polling approach to ensure connectivity across restrictive network environments and serverless cold starts.
- **State Management**: React Context-driven user and settings state, synchronized with PostgreSQL for persistence.
- **AI Coaching**: Backend-proxied requests to Fireworks AI endpoints (`/api/coach`) with move history normalization and JSON-structured feedback extraction.
- **Database Schema**: Managed via `server/db.js` and `server/db/setup.js`. Includes tables for `users`, `games`, `active_games`, and `elo_history`.

## 📜 Available Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `node server/index.js & vite` | Starts full-stack development environment |
| `npm run build` | `vite build` | Compiles production-ready frontend bundle |
| `npm start` | `node server/index.js` | Starts the production Express server (serves `/dist`) |
| `npm test` | `vitest run` | Executes unit and integration test suite |
| `npm run test:e2e` | `playwright test` | Runs end-to-end browser automation tests |
| `npm run db:setup` | `node server/db/setup.js` | Initializes/Migrates PostgreSQL schema |

## ⚙️ Configuration

Key environment variables required for full functionality:

| Variable | Description | Default/Example |
|----------|-------------|------------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `FRONTEND_URL` | CORS origin for production | `https://chess-premium.com` |
| `FIREWORKS_API_KEY` | API key for AI coach | `fw_...` |
| `FIREWORKS_BASE_URL` | Base URL for Fireworks proxy | `https://...` |
| `VITE_SUPABASE_URL` | Supabase project URL | `https://...` |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key | `eyJhbG...` |

## 📁 Repository Structure

- `src/`: Client-side React application.
- `server/`: Express backend, Socket.IO handlers, and database logic.
- `public/`: Static assets and Stockfish WASM binaries.
- `tests/`: Shared test utilities and global mocks.

---

*Confidential. Internal use only.*
