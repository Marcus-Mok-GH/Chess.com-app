# Qwen Code Chess Application

## Project Overview

This is a sophisticated chess application built with React, TypeScript, and Vite. The application features both single-player and multiplayer chess functionality with advanced features like AI opponents, online matchmaking, game analysis, and animated pieces.

### Key Features

- **Single Player Chess**: Play against various AI bots with different difficulty levels and personalities
- **Multiplayer Chess**: Play online with friends or matched opponents through a matchmaking system
- **Advanced AI**: Multiple bot personalities with adjustable ELO ratings powered by Stockfish engine
- **Game Analysis**: Post-game analysis to review moves and identify improvements
- **Animated Pieces**: Smooth animations for piece movements, captures, and castling
- **Matchmaking System**: Ranked and friendly game modes with ELO rating system
- **Game Controls**: Undo moves, flip board, get hints, and customize settings
- **Real-time Online Play**: WebSocket-based multiplayer functionality

### Architecture

The application follows a modern React architecture with:

- **React 18** with hooks for state management
- **Vite** as the build tool and development server
- **TypeScript** for type safety
- **React Router DOM** for navigation between pages
- **chess.js** for chess game logic
- **react-chessboard** for the chess board UI
- **Stockfish.js** for advanced AI computation via Web Workers
- **OpenTelemetry** for observability and tracing
- **Tidewave** for development instrumentation

### Main Components

- **App.jsx**: Main routing component with BrowserRouter
- **ChessGame.jsx**: Core single-player chess game logic
- **OnlineChessGame.jsx**: Multiplayer chess game component
- **ChessBoard.jsx**: Interactive chess board component
- **BotSelector.jsx**: Interface for choosing AI opponents
- **GameControls.jsx**: Game control buttons and status indicators
- **MoveHistory.jsx**: Display of move history
- **PlayerBar.jsx**: Player information and captured pieces display
- **GameAnalysis.jsx**: Post-game analysis features
- **Settings.jsx**: Game settings and preferences

### Pages

- **Landing**: Home page with navigation options
- **Play**: Single-player chess against AI opponents
- **OnlinePlay**: Multiplayer chess with matchmaking and game creation

## Building and Running

### Prerequisites

- Node.js (latest LTS version recommended)
- npm or yarn package manager

### Installation

```bash
npm install
```

### Development Server

```bash
npm run dev
```

This will start the development server with hot module replacement (HMR).

### Production Build

```bash
npm run build
```

This creates an optimized production build in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

This serves the production build locally for testing.

## Development Conventions

### Code Style

- Follow standard React/TypeScript conventions
- Use functional components with hooks
- Maintain consistent naming patterns (camelCase for variables/functions)
- Use PascalCase for component names
- Follow the existing file structure with components in `/src/components`

### Component Structure

- Place reusable UI components in `/src/components`
- Organize page-level components in `/src/pages`
- Store utility functions in `/src/utils`
- Keep styles scoped to components using CSS modules or component-specific CSS files

### State Management

- Use React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`) for local component state
- Use refs (`useRef`) for mutable values that don't trigger re-renders
- For complex state logic, consider custom hooks

### Testing

While no explicit test files were found in the initial exploration, tests should be added following React testing library patterns:

- Unit tests for utility functions in `/src/utils`
- Integration tests for components
- End-to-end tests for critical user flows

### Dependencies

Key dependencies include:
- `chess.js`: Chess game logic implementation
- `react-chessboard`: Chess board UI component
- `stockfish.js`: Chess engine for AI moves
- `@opentelemetry/sdk-node`: Observability and tracing
- `react-router-dom`: Client-side routing
- `next`: Next.js framework (for potential SSR features)

## Special Features

### AI Bots
The application includes multiple AI bot personalities with different characteristics:
- Various difficulty levels with adjustable ELO ratings
- Different play styles and personality quotes
- Customizable bot with specific ELO rating
- Advanced Stockfish integration for strong play

### Online Functionality
- Real-time multiplayer chess
- Matchmaking system with ranked games
- Game creation and joining via codes
- ELO rating system for competitive play
- WebSocket-based communication for moves

### Visual Enhancements
- Animated piece movements
- Highlighted possible moves
- Captured pieces display
- Check highlighting
- Hint visualization
- Responsive design for different screen sizes

### Debugging and Analysis
- Debug panel showing AI thinking process
- Game analysis tools
- Move history tracking
- Performance monitoring with OpenTelemetry