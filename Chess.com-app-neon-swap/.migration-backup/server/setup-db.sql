-- Chess App Database Setup
-- Run this script to create the database schema

-- Create database (run as postgres superuser)
-- CREATE DATABASE chess_db;

-- Connect to chess_db before running the rest

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(20) UNIQUE NOT NULL,
    elo INTEGER DEFAULT 1200,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Games table (optional, for game history)
CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    game_code VARCHAR(10) UNIQUE NOT NULL,
    white_player_id INTEGER REFERENCES users(id),
    black_player_id INTEGER REFERENCES users(id),
    white_player_name VARCHAR(20),
    black_player_name VARCHAR(20),
    result VARCHAR(10), -- 'white', 'black', 'draw', null
    game_mode VARCHAR(20) DEFAULT 'friendly',
    fen TEXT,
    move_history TEXT[],
    status VARCHAR(20) DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User settings table (UI preferences per user)
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matchmaking queue table for real-time multiplayer
CREATE TABLE IF NOT EXISTS matchmaking_queue (
    id SERIAL PRIMARY KEY,
    socket_id VARCHAR(100) NOT NULL,
    player_id VARCHAR(100) NOT NULL,
    player_name VARCHAR(50) NOT NULL,
    elo INTEGER DEFAULT 1200,
    is_ranked BOOLEAN DEFAULT true,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Active games table for real-time games (via WebSocket)
CREATE TABLE IF NOT EXISTS active_games (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(20) UNIQUE NOT NULL,
    white_player_id VARCHAR(100),
    black_player_id VARCHAR(100),
    white_socket_id VARCHAR(100),
    black_socket_id VARCHAR(100),
    white_player_name VARCHAR(50),
    black_player_name VARCHAR(50),
    white_elo INTEGER,
    black_elo INTEGER,
    fen TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    move_history TEXT[] DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'waiting',
    game_mode VARCHAR(20) DEFAULT 'ranked',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS match_moves (
    game_id VARCHAR(20) NOT NULL,
    username VARCHAR(20) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    move_history TEXT[] DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (game_id, username)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_elo ON users(elo DESC);
CREATE INDEX IF NOT EXISTS idx_games_code ON games(game_code);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_matchmaking_player_id ON matchmaking_queue(player_id);
CREATE INDEX IF NOT EXISTS idx_matchmaking_elo ON matchmaking_queue(elo);
CREATE INDEX IF NOT EXISTS idx_active_games_game_id ON active_games(game_id);
CREATE INDEX IF NOT EXISTS idx_active_games_status ON active_games(status);
CREATE INDEX IF NOT EXISTS idx_match_moves_game_id ON match_moves(game_id);
CREATE INDEX IF NOT EXISTS idx_match_moves_username ON match_moves(username);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to games table
DROP TRIGGER IF EXISTS update_games_updated_at ON games;
CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Sample data (optional)
-- INSERT INTO users (username, elo) VALUES ('TestPlayer', 1200);
