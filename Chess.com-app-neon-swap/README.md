# ♟️ chess.com-app

**The most fun chess experience on the internet.**

Challenge delightfully unhinged AI personalities, battle real players in real-time, analyze your games like a grandmaster, and climb the ratings ladder — all in a beautiful, responsive interface that feels like the real Chess.com.

> *"I beat Magnus in 12 moves... then he trash-talked me for 3 minutes straight."*

---

## ✨ Why You'll Love It

- **12+ unforgettable AI opponents** — Each bot has a unique personality, voice, and trash-talking style. Play against a conspiracy theorist who thinks the pawns are plotting against him, a ruthless 2200-rated monster who will destroy your ego, or a friendly coach who actually wants you to improve.
- **Real-time online play** — Jump into ranked matchmaking or create private friendly games with shareable codes. Live queues, instant match-found animations, and smooth Socket.IO gameplay.
- **Deep post-game analysis** — Step through every move on an interactive board. Review your games with detailed move lists and insights.
- **Real progression** — Earn a live ELO rating. Track your wins, losses, draws, and win rate. Your stats actually mean something.
- **Play anywhere** — Gorgeous desktop sidebar + fully optimized mobile experience. Works beautifully on phones, tablets, and big screens.
- **No friction sign-in** — Just enter your email and get a 6-digit code. No passwords, no hassle.

---

## 🎮 How to Play

| Mode          | Description                              | Perfect for                  |
|---------------|------------------------------------------|------------------------------|
| **Play vs AI**    | Pick from 12 unique bots with different skill levels | Practicing, having a laugh, learning |
| **Online Ranked** | Matchmaking against real players at your level | Competitive play & rating climbs |
| **Friendly Games** | Create or join private games with codes | Playing with friends |
| **Analysis**      | Deep dive into any finished game         | Improving your chess         |
| **History**       | Replay all your past games               | Nostalgia + learning         |

---

## 🤖 Meet the Bots (Just a Few Highlights)

- **Nelson (400)** — Conspiracy theorist. Blames the Illuminati when he loses. Hilarious.
- **Magnus (2200)** — Ruthless trash-talker. Will mock you while destroying your position.
- **Coach** — Actually helpful. Gives good advice (sometimes).
- **Dolores, Raj, Nadia, Felix** and more — Each with their own voice, ego, and play style.

Every bot reacts to checks, captures, blunders, wins, and draws with unique, memorable lines. It's half chess, half comedy.

---

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start the API server (in one terminal)
pnpm --filter @workspace/api-server run dev

# Start the frontend (in another terminal)
cd artifacts/chess && pnpm dev
```

Then open http://localhost:5173 (or whatever port Vite chooses).

**Production deployment** is set up for Vercel (see `vercel.json`).

### Required Environment
- `DATABASE_URL` — PostgreSQL connection (Neon, Supabase, etc. recommended)
- Optional: `VITE_NEON_AUTH_URL` for the Neon Auth client (auto-set by Vercel on Neon integrations)

---

## 🛠 Tech Stack

**Frontend**
- React 18 + Vite 7
- react-chessboard v5
- Real-time with Socket.IO (with polling fallback)

**Backend**
- Express 5 + Socket.IO
- PostgreSQL + Drizzle ORM
- Neon Auth (email OTP, no passwords)

**Infrastructure**
- Vercel serverless functions
- pnpm workspaces
- Fully typed (TypeScript where it matters)

---

## 📁 Project Structure

```
chess.com-app/
├── api/                    # Vercel serverless entry
├── artifacts/
│   ├── chess/              # React frontend (the beautiful UI)
│   └── api-server/         # Express backend + Socket.IO
├── lib/
│   ├── db/                 # Shared database layer
│   └── api-spec/           # OpenAPI + Zod schemas
└── ...
```

---

## 🛠 Workflow Notes

- Always update `CHANGELOG.md` after meaningful changes.
- The project uses a monorepo with pnpm workspaces.
- Auth flow is fully custom (email + 6-digit OTP) — no external auth providers at runtime.

---

**Ready to play?**

Clone it. Run it. Challenge Nelson. Get destroyed by Magnus. Then analyze why it happened.

Chess has never been this entertaining.

♟️
