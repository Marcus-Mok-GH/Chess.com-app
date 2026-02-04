import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: { username: string } }
) {
  try {
    const { username } = params;
    const body = await request.json();
    const { opponentElo, result: gameResult } = body;

    if (typeof opponentElo !== 'number' || !['win', 'loss', 'draw'].includes(gameResult)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const userResult = await query(
      'SELECT id, elo, games_played, wins, losses, draws FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userResult.rows[0];
    const K_FACTOR = 32;

    const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - user.elo) / 400));
    const actualScore = gameResult === 'win' ? 1 : gameResult === 'draw' ? 0.5 : 0;
    const newElo = Math.round(user.elo + K_FACTOR * (actualScore - expectedScore));

    const wins = user.wins + (gameResult === 'win' ? 1 : 0);
    const losses = user.losses + (gameResult === 'loss' ? 1 : 0);
    const draws = user.draws + (gameResult === 'draw' ? 1 : 0);
    const gamesPlayed = user.games_played + 1;

    await query(
      'UPDATE users SET elo = $1, games_played = $2, wins = $3, losses = $4, draws = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
      [newElo, gamesPlayed, wins, losses, draws, user.id]
    );

    return NextResponse.json({
      success: true,
      previousElo: user.elo,
      newElo,
      eloChange: newElo - user.elo,
      gamesPlayed,
      wins,
      losses,
      draws
    });

  } catch (error) {
    console.error('Update ELO error:', error);
    return NextResponse.json({ error: 'Failed to update ELO' }, { status: 500 });
  }
}
