# Database Setup Guide

This chess app uses PostgreSQL to store user data and ELO ratings.

## Prerequisites

- PostgreSQL 13+ installed and running
- Node.js 18+

## Quick Setup

### 1. Create PostgreSQL Database

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Create database
CREATE DATABASE chess_db;

# Create a user (optional, can use postgres)
CREATE USER chess_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE chess_db TO chess_user;

# Exit
\q
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```
DATABASE_URL=postgresql://chess_user:your_secure_password@localhost:5432/chess_db
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### 3. Initialize Database Schema

The server will automatically create tables on first run. Alternatively, run the SQL script:

```bash
psql -U chess_user -d chess_db -f server/setup-db.sql
```

### 4. Start the Application

**Development mode (both frontend and backend):**
```bash
npm run dev:all
```

**Or run separately:**
```bash
# Terminal 1: Start backend server
npm run dev:server

# Terminal 2: Start frontend
npm run dev
```

### 5. Configure Frontend API URL

For production, set the `VITE_API_URL` environment variable:

```bash
VITE_API_URL=https://your-api-domain.com/api
```

## Database Schema

### Users Table

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| username | VARCHAR(20) | Unique username |
| elo | INTEGER | ELO rating (default: 1200) |
| games_played | INTEGER | Total games played |
| wins | INTEGER | Number of wins |
| losses | INTEGER | Number of losses |
| draws | INTEGER | Number of draws |
| created_at | TIMESTAMP | Account creation time |
| updated_at | TIMESTAMP | Last update time |

### Games Table (Optional)

Stores game history for analysis and replay.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| game_code | VARCHAR(10) | Unique game code |
| white_player_id | INTEGER | FK to users |
| black_player_id | INTEGER | FK to users |
| result | VARCHAR(10) | 'white', 'black', 'draw' |
| game_mode | VARCHAR(20) | 'friendly' or 'ranked' |
| status | VARCHAR(20) | 'waiting', 'playing', 'ended' |

### Match Moves Table

Stores per-user move history for online matches.

| Column | Type | Description |
|--------|------|-------------|
| game_id | VARCHAR(20) | Match game ID |
| username | VARCHAR(20) | FK to users.username |
| move_history | TEXT[] | Moves made by this user |
| created_at | TIMESTAMP | First saved |
| updated_at | TIMESTAMP | Last update |

## API Endpoints

### POST /api/users/login
Create or login user by username.

**Request:**
```json
{ "username": "PlayerName" }
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "PlayerName",
    "elo": 1200,
    "gamesPlayed": 0,
    "wins": 0,
    "losses": 0,
    "draws": 0
  },
  "isNewUser": true
}
```

### GET /api/users/:username
Get user profile.

### POST /api/users/:username/elo
Update ELO after a game.

**Request:**
```json
{
  "opponentElo": 1250,
  "result": "win"  // "win", "loss", or "draw"
}
```

### GET /api/users/leaderboard/top?limit=10
Get top players by ELO.

## Fallback Mode

If the database is unavailable, the app now allows guest users to play against bots without saving or analysis. Logged-in features (game history, analysis, settings) require the database.

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a connection pooler like PgBouncer for high traffic
3. Enable SSL for database connections
4. Set appropriate `FRONTEND_URL` for CORS
