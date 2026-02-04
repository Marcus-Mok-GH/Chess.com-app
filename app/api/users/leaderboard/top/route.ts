import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);

    const result = await query(
      'SELECT username, elo, games_played, wins, losses, draws FROM users ORDER BY elo DESC LIMIT $1',
      [limit]
    );

    return NextResponse.json({
      leaderboard: result.rows.map((row, index) => ({
        rank: index + 1,
        username: row.username,
        elo: row.elo,
        gamesPlayed: row.games_played,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws
      }))
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json({ error: 'Failed to get leaderboard' }, { status: 500 });
  }
}
