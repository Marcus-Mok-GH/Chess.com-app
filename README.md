# ♟️ chess.com-app

**The most fun chess experience on the internet.**

Challenge delightfully unhinged AI personalities, battle real players in real-time, analyze your games like a grandmaster, and climb the ratings ladder — all in a beautiful, responsive interface that feels like the real Chess.com.

> *"I beat Magnus in 12 moves... then he trash-talked me for 3 minutes straight."*

---

## ✨ Why You'll Love It

- **15 unforgettable AI opponents** — Each bot has a unique personality, voice, and trash-talking style. Play against a conspiracy theorist who thinks the pawns are plotting against him, a bot that only plays sacrifices, a fish that refuses to let the game end, or a friendly coach who actually wants you to improve.
- **Real-time online play** — Jump into ranked matchmaking or create private friendly games with shareable codes. Moves appear near-instantly (optimistic local play + a fast poll), with live clocks, premoves, chat, and draw offers.
- **Deep post-game analysis** — Step through every move on an interactive board. Review your games with engine evaluations, opening-book classification, puzzles, lessons, and an AI coach that explains what actually happened.
- **A social layer** — Friends, clubs, leaderboards, and notifications. Find your people, or found a club and start recruiting.
- **Real progression** — Earn a live ELO rating. Track your wins, losses, draws, and win rate. Your stats actually mean something.
- **Play anywhere** — Gorgeous desktop sidebar + fully optimized mobile experience. Works beautifully on phones, tablets, and big screens.
- **Speaks your language** — Full interface in English, Simplified Chinese, Traditional Chinese, Malay, Tamil, and Hindi.
- **No friction sign-in** — Just enter your email and get a 6-digit code. No passwords, no hassle.

---

## 🎮 How to Play

| Mode          | Description                              | Perfect for                  |
|---------------|------------------------------------------|------------------------------|
| **Play vs AI**    | Pick from 15 unique bots with different skill levels | Practicing, having a laugh, learning |
| **Online Ranked** | Matchmaking against real players at your level | Competitive play & rating climbs |
| **Friendly Games** | Create or join private games with codes | Playing with friends |
| **Clubs**     | Create or join communities of players | Finding your people |
| **Analysis**      | Deep dive into any finished game, with engine scores and book moves | Improving your chess         |
| **History**       | Replay all your past games               | Nostalgia + learning         |

---

## 🤖 Meet the Bots (Just a Few Highlights)

- **Pip (250)** — Absolute-beginner buddy. Just learned the rules and just wants a friend to practice with.
- **Nelson (400)** — Conspiracy theorist. Blames the Illuminati when he loses. Hilarious.
- **Magnus (2200)** — Ruthless trash-talker. Will mock you while destroying your position.
- **Mr. Brilliant (2000)** — Only plays sacrifices. Hands you material, keeps the evaluation, and dares you to take it.
- **Stallfish (1600)** — 🐟 Aggression zero. Refuses checkmate, stalemate, and draws, and shuffles pieces until the game outlives you both.
- **Saitama (2500)** — Plays it cool until you take his material or check his king. Then one punch ends the game.
- **Rex (2900)** — *Premium.* Opens with the Bongcloud, donates his queen, then plays like Stockfish itself.
- **Coach** — Actually helpful. Gives good advice (sometimes).

Every bot reacts to checks, captures, blunders, wins, and draws with unique, memorable lines. It's half chess, half comedy.

**Premium bots** — Rex and Nadia are unlocked with a Whop subscription, which also unlocks unlimited game reviews.

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

Run the full test suite with `pnpm test`.

**Production deployment** is set up for Vercel (see `vercel.json`).

### Required Environment
- `DATABASE_URL` — PostgreSQL connection (Neon, Supabase, etc. recommended)
- Optional: `SMTP_*` vars for real email delivery (falls back to console logging for dev)

---

## 🛠 Tech Stack

**Frontend**
- React 19 + Vite 7
- react-chessboard v5
- Real-time with HTTP polling (500ms game sync, optimistic own moves)

**Backend**
- Express 5
- PostgreSQL + Drizzle ORM
- Stockfish for bot and review engines
- Email OTP authentication (no passwords)

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
│   └── api-server/         # Express backend
├── lib/
│   ├── db/                 # Shared database layer
│   └── api-spec/           # OpenAPI + Zod schemas
└── ...
```

---

## 🛠 Workflow Notes

- Always update `artifacts/chess/public/CHANGELOG.md` after meaningful changes.
- The project uses a monorepo with pnpm workspaces (pnpm only — npm/yarn hard-fail).
- Auth flow is fully custom (email + 6-digit OTP) — no external auth providers at runtime.

---

## Contributing

See [CONTRIBUTIONS.md](CONTRIBUTIONS.md) for what contributors can work on, project boundaries, required checks, and pull request expectations.

## AI Coach — Pollinations User-Pays Setup

The AI coach uses Pollinations BYOP (Bring Your Own Pollen), not the free/keyless API path. Each player must sign in to Pollinations and approve a budget in the consent screen; coaching requests are then billed against that player's authorized Pollen key. The app never stores a Pollinations app secret or pays for player usage.

Configure the API server with:

- `POLLINATIONS_CLIENT_ID`: the publishable `pk_...` App Key from `https://enter.pollinations.ai/keys`.
- `POLLINATIONS_REDIRECT_URI`: the exact registered callback URI, normally `https://<your-api-host>/api/coach/callback`.
- `POLLINATIONS_TOKEN_ENCRYPTION_KEY`: a long random server secret used to encrypt delegated `sk_...` keys at rest. `BETTER_AUTH_SECRET` is accepted as a fallback, but a separate secret is recommended.
- `POLLINATIONS_COACH_BUDGET`: optional default budget shown in the consent screen; defaults to `5` Pollen.
- `POLLINATIONS_COACH_EXPIRY_DAYS`: optional authorization lifetime; defaults to `7` days.
- `POLLINATIONS_COACH_MODELS`: optional comma-separated model restriction forwarded to Pollinations OAuth; when unset, no model restriction is sent.
- `COACH_MODEL`: optional primary model sent to the Pollinations OpenAI-compatible endpoint; defaults to `openai`.
- `COACH_FREE_MODEL`: optional free fallback model used when the primary model returns an affordability/balance error; defaults to `laguna`.

If the primary coach model returns HTTP 402 because the user's approved Pollen budget is unavailable, the server retries the request with `COACH_FREE_MODEL`. Set `POLLINATIONS_COACH_MODELS` when you want OAuth to restrict the connection to specific model IDs.

The callback must be registered exactly in the Pollinations App Key, including scheme, hostname, path, and any query string. The database migration creates short-lived PKCE state records and encrypted per-user coach tokens. Tokens are never sent to the frontend.

---

**Ready to play?**

Clone it. Run it. Challenge Nelson. Get destroyed by Magnus. Then analyze why it happened — but watch out for Stallfish, because that game might never end.

Chess has never been this entertaining.

♟️
