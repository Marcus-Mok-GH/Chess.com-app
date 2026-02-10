export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { username: string } }
) {
  try {
    const { username } = params;

    const result = await query(
      'SELECT id, username, elo, games_played, wins, losses, draws, created_at FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = result.rows[0];
    return NextResponse.json({
      id: user.id,
      username: user.username,
      elo: user.elo,
      gamesPlayed: user.games_played,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      createdAt: user.created_at
    });

  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
  }
}
