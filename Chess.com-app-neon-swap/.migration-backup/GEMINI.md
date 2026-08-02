# Project Overview: Chess AI & Online Platform

This is a comprehensive chess application built with React, Vite, and Chess.js. It features a robust offline play mode against various AI bot personalities and a unique "online" matchmaking system that facilitates play between different browser tabs or windows using local synchronization.

## Core Technologies

- **Frontend:** React 18 with Vite for fast builds and HMR.
- **Routing:** React Router DOM for page navigation.
- **Chess Logic:** `chess.js` for move validation and game state management.
- **Board UI:** `react-chessboard` for the interactive board.
- **AI Engines:**
    - **Stockfish:** Integrated via Web Workers (`stockfish.js`, `stockfish.wasm`) for high-level play.
    - **Custom Minimax:** A local implementation with Alpha-Beta pruning for lightweight AI tasks.
- **Matchmaking:** Uses server-side queues with Socket.io for real-time play.
- **Styling:** CSS modules and standard CSS files.

## Project Structure

- `src/components/`: UI components (ChessBoard, PlayerBar, BotSelector, etc.).
- `src/pages/`: Main application views (Landing, Play, OnlinePlay).
- `src/utils/`: Core logic and utilities.
    - `bots.js`: Definitions for bot personalities (Nelson, Elena, Viktor, Isabella, Magnus).
    - `chessAI.js`: Minimax AI implementation.
    - `stockfishWorker.js`: Web worker for Stockfish integration and move selection.
    - `matchmaking.js`: Local matchmaking and ELO calculation logic.
- `public/`: Static assets, including Stockfish WASM and worker files.
- `pages/api/`: Next.js-style API routes (used for Tidewave instrumentation).

## AI Personalities

The project features unique bot personalities with specific play styles, ELO ratings, and dynamic quotes:
- **Nelson (400):** Aggressive conspiracy theorist.
- **Elena (800):** Passive-aggressive teacher focusing on positional play.
- **Viktor (1200):** Existentialist focusing on defense and king safety.
- **Isabella (1600):** Sharp, tactical royalty with high aggression.
- **Magnus (2200):** Ruthless trash-talker using high-depth Stockfish.

## Building and Running

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

## Development Conventions

- **State Management:** Primarily uses React `useState` and `useRef` within functional components.
- **AI Logic:** Computationally heavy AI tasks are offloaded to Web Workers to keep the UI responsive.
- **Animations:** Custom animation logic in `ChessGame.jsx` and `AnimatedPiece.jsx` for smooth piece movements.
- **Local Synchronization:** Matchmaking and online play are simulated locally; ensure multiple tabs are open to test matchmaking features.
