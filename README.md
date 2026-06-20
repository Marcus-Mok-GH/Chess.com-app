# chess.com-app

A full-stack React chess platform featuring real-time multiplayer, AI opponents, and game analysis. Built with Vite, Express, Socket.IO, and PostgreSQL — deployed as a single Vercel serverless app.

## 🚀 Technical Stack

### Frontend (SPA)
- **Runtime**: React 18, Vite 7 (HMR)
- **Routing**: React Router DOM 7
- **Chess**: chess.js (logic) & react-chessboard (rendering)
- **AI Integration**: Puter.js & Fireworks AI (DeepSeek models via `/api/coach`)
- **Analytics**: Recharts & Vercel Analytics
- **Design**: CSS Modules with CSS Variables

### Backend (Node.js)
- **Server**: Express (REST API)
- **Real-time**: Socket.IO (WebSocket + HTTP long-polling fallback)
- **Database**: PostgreSQL via `pg` + Kysely query builder
- **Auth**: Neon Auth (OTP-based, via `@neondatabase/auth`)
- **Engine**: Stockfish 18 (WASM in-browser + Node.js lite for server-side moves)

## 🛡️ Architecture & Data Flow

- **Matchmaking**: Hybrid Socket.IO/HTTP polling to handle restrictive networks and serverless cold starts.
- **State Management**: React Context (`UserContext`, `SettingsContext`) synchronized with PostgreSQL.
- **AI Coaching**: Backend-proxied requests to Fireworks AI (`/api/coach`) with move history normalization and JSON-structured feedback.
- **Database Schema**: Initialized via `server/db/setup.js`. Tables: `users`, `games`, `active_games`, `elo_history`.
- **Deployment**: Single Vercel app — Vite SPA frontend + Express backend bundled as a Vercel serverless function at `api/[...path].js`.

## 📜 Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start full-stack dev (Express + Vite on port 5173) |
| `npm run dev:server` | Start Express server only |
| `npm run dev:vite` | Start Vite dev server only |
| `npm run build` | Build frontend for production |
| `npm start` | Start production Express server (serves `/dist`) |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run db:setup` | Initialize / migrate PostgreSQL schema |

## ⚙️ Configuration

Copy `.env.example` to `.env` and fill in the values below.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL pooled connection string |
| `NEON_AUTH_URL` | Neon Auth URL for OTP sign-in — server-side only (Neon Console → Auth tab) |

### Production only

| Variable | Description |
|----------|-------------|
| `FRONTEND_URL` | CORS origin / custom domain (defaults to `http://localhost:5173`) |
| `VITE_SOCKET_URL` | Socket.IO server URL — only set when backend is on a separate host |
| `DATABASE_URL_UNPOOLED` | Direct (non-pooled) connection for schema migrations (defaults to `DATABASE_URL`) |

### Optional overrides

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: `3001`) |
| `FIREWORKS_BASE_URL` | Fireworks AI proxy endpoint |
| `FIREWORKS_COACH_MODEL` | DeepSeek model ID |
| `FIREWORKS_API_KEY` | Fireworks auth key (only if proxy enforces auth) |
| `FORCE_POLLING` | Set `true` to disable WebSocket upgrade (long-polling only) |

## 📁 Repository Structure

```
chess.com-app/
├── api/
│   └── [...path].js          # Vercel serverless entry — proxies all /api/* to Express
├── public/
│   ├── custom-pieces/        # SVG piece set (alternate)
│   ├── pieces/               # SVG piece set (default)
│   ├── sounds/               # Audio assets
│   ├── stockfish.js          # Stockfish WASM loader
│   ├── stockfish.wasm        # Stockfish engine binary
│   └── sw.js                 # Service worker
├── server/
│   ├── index.js              # Express app entry point
│   ├── auth.js               # Auth middleware
│   ├── db.js                 # Database client (legacy entry)
│   ├── db/
│   │   ├── pool.js           # pg connection pool
│   │   ├── query.js          # Query helpers
│   │   ├── init.js           # Schema init
│   │   ├── migrations.js     # Migration runner
│   │   ├── cleanup.js        # DB cleanup utilities
│   │   ├── setup.js          # `npm run db:setup` entry
│   │   └── status.js         # DB health check
│   ├── middleware/
│   │   └── errors.js         # Global error handler
│   ├── routes/
│   │   ├── auth.js           # POST /api/auth/*
│   │   ├── coach.js          # POST /api/coach
│   │   ├── engine.js         # POST /api/engine
│   │   ├── games.js          # GET/POST /api/games
│   │   ├── matchmaking.js    # GET/POST /api/matchmaking
│   │   └── users.js          # GET/PATCH /api/users
│   └── socket/
│       ├── index.js          # Socket.IO setup
│       ├── auth.js           # Socket auth middleware
│       ├── game.js           # In-game event handlers
│       └── matchmaking.js    # Matchmaking event handlers
├── src/
│   ├── App.jsx               # Root component & routes
│   ├── index.jsx             # React entry point
│   ├── components/           # Reusable UI components
│   │   ├── ChessBoard.jsx
│   │   ├── ChessGame.jsx
│   │   ├── OnlineChessGame.jsx
│   │   ├── Navigation.jsx
│   │   ├── GameControls.jsx
│   │   ├── GameAnalysis.jsx
│   │   ├── MoveHistory.jsx
│   │   ├── PlayerBar.jsx
│   │   ├── EloProgressChart.jsx
│   │   ├── WinRateChart.jsx
│   │   └── ...
│   ├── contexts/
│   │   ├── UserContext.jsx   # Auth & user state
│   │   └── SettingsContext.jsx
│   ├── engine/
│   │   ├── bots/bots.js      # Bot definitions & difficulty levels
│   │   ├── coach/coachAI.js  # AI coaching client
│   │   ├── game/             # Game logic helpers (gameId, moveHistory, onlineGame)
│   │   └── matchmaking/matchmaking.js
│   ├── hooks/
│   │   ├── useKeyboardNavigation.js
│   │   ├── usePuter.js
│   │   └── useSwipe.js
│   ├── pages/
│   │   ├── Landing.jsx       # Marketing / splash page
│   │   ├── Login.jsx         # OTP sign-in
│   │   ├── VerifyEmail.jsx
│   │   ├── Home.jsx          # Dashboard
│   │   ├── Play.jsx          # vs Bot
│   │   ├── OnlinePlay.jsx    # vs Human (matchmaking)
│   │   ├── Game.jsx          # Active game view
│   │   ├── Analysis.jsx      # Post-game analysis
│   │   ├── GameHistory.jsx
│   │   ├── Settings.jsx
│   │   └── Changelog.jsx
│   ├── services/
│   │   ├── api.js            # REST API client
│   │   ├── apiBase.js        # Base fetch wrapper
│   │   ├── socket.js         # Socket.IO client
│   │   ├── matchmakingPolling.js
│   │   └── neonAuth.js       # Neon Auth helpers
│   └── utils/
│       ├── haptics.js
│       └── sound.js
├── tests/
│   ├── setup.js              # Vitest global setup
│   └── e2e/
│       └── matchmaking-polling.spec.ts
├── .env.example
├── vercel.json
├── vite.config.js
└── package.json
```
