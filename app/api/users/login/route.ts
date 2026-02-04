import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 2) {
      return NextResponse.json({ error: 'Username must be at least 2 characters' }, { status: 400 });
    }

    if (trimmedUsername.length > 20) {
      return NextResponse.json({ error: 'Username must be 20 characters or less' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores' }, { status: 400 });
    }

    // Try to find existing user
    let result = await query(
      'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE LOWER(username) = LOWER($1)',
      [trimmedUsername]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          elo: user.elo,
          gamesPlayed: user.games_played,
          wins: user.wins,
          losses: user.losses,
          draws: user.draws,
          createdAt: user.created_at
        },
        isNewUser: false
      });
    }

    // Create new user
    result = await query(
      'INSERT INTO users (username, elo) VALUES ($1, $2) RETURNING id, username, elo, games_played, wins, losses, draws, created_at',
      [trimmedUsername, 1200]
    );

    const newUser = result.rows[0];
    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        elo: newUser.elo,
        gamesPlayed: newUser.games_played,
        wins: newUser.wins,
        losses: newUser.losses,
        draws: newUser.draws,
        createdAt: newUser.created_at
      },
      isNewUser: true
    });

  } catch (error: any) {
    console.error('Login error:', error);
    if (error.code === '23505') {
      // Unique violation - race condition
      try {
        const result = await query(
          'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE LOWER(username) = LOWER($1)',
          [body.username.trim()]
        );
        if (result.rows.length > 0) {
          const user = result.rows[0];
          return NextResponse.json({
            success: true,
            user: {
              id: user.id,
              username: user.username,
              elo: user.elo,
              gamesPlayed: user.games_played,
              wins: user.wins,
              losses: user.losses,
              draws: user.draws,
              createdAt: user.created_at
            },
            isNewUser: false
          });
        }
      } catch (e) {
        console.error('Retry fetch error:', e);
      }
    }
    return NextResponse.json({ error: 'Failed to login' }, { status: 500 });
  }
}
