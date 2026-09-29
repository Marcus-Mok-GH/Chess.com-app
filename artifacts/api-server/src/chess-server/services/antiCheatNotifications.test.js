import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query } from '../db.js';
import { notifyCheatConfirmed, recordIntegrityDecision } from './antiCheatService.js';

const GAME_CODE = 'AB12CD34';

const GAME_ROW = {
  game_code: GAME_CODE,
  white_player_id: 'user-white',
  black_player_id: 'user-black',
  white_player_name: 'Alice',
  black_player_name: 'Bob',
  result: 'black',
  time_control: 'rapid',
  white_elo: 1380,
  black_elo: 1455,
  flagged_players: ['user-black'],
};

/** Six bind parameters per notification row: recipient, type, game, title, body, payload. */
const PARAMS_PER_ROW = 6;

function notificationInserts() {
  return query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO notifications'));
}

function insertParams() {
  const inserts = notificationInserts();
  return inserts.length ? inserts[0][1] : [];
}

function recipients() {
  const params = insertParams();
  const found = [];
  for (let index = 0; index < params.length; index += PARAMS_PER_ROW) found.push(params[index]);
  return found.sort();
}

function bodies() {
  const params = insertParams();
  const found = [];
  for (let index = 4; index < params.length; index += PARAMS_PER_ROW) found.push(String(params[index]));
  return found;
}

function payloads() {
  const params = insertParams();
  const found = [];
  for (let index = 5; index < params.length; index += PARAMS_PER_ROW) {
    found.push(JSON.parse(String(params[index])));
  }
  return found;
}

/**
 * Routes each statement the fair-play flow issues. `game` and `reports` are
 * overridable so a test can exercise a different attribution path.
 */
function stubQuery({ game = GAME_ROW, reports = [], flaggedPlayers } = {}) {
  const row = game
    ? { ...game, flagged_players: flaggedPlayers ?? game.flagged_players }
    : null;
  query.mockImplementation(async (sql) => {
    const text = String(sql);
    if (text.includes('UPDATE game_integrity_reviews')) {
      return { rows: [{ game_code: GAME_CODE, review_decision: 'confirmed' }] };
    }
    if (text.includes('FROM games g')) return { rows: row ? [row] : [] };
    if (text.includes('fair_play_reports')) return { rows: reports };
    if (text.includes('INSERT INTO notifications')) return { rows: [] };
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CHESS_REVIEW_ADMIN_IDS = 'rev-1,rev-2';
});

afterEach(() => {
  delete process.env.CHESS_REVIEW_ADMIN_IDS;
});

describe('recordIntegrityDecision — confirmed', () => {
  it('notifies the opponent and the other reviewers with the game and rating', async () => {
    stubQuery();

    const review = await recordIntegrityDecision(GAME_CODE, {
      decision: 'confirmed',
      reviewerId: 'rev-1',
    });

    expect(review).toBeTruthy();
    // Opponent (Alice, the non-flagged side) plus the reviewer who did not
    // make the decision.
    expect(recipients()).toEqual(['rev-2', 'user-white']);

    const opponentBody = bodies()[0];
    expect(opponentBody).toContain(GAME_CODE);
    expect(opponentBody).toContain('Bob (Rapid · Elo 1455)');

    for (const payload of payloads()) {
      expect(payload).toMatchObject({
        gameCode: GAME_CODE,
        timeControl: 'rapid',
        ratingLabel: 'Rapid',
        reviewerId: 'rev-1',
        link: `/review/${GAME_CODE}`,
      });
      expect(payload.cheaters).toEqual([
        { playerId: 'user-black', name: 'Bob', elo: 1455 },
      ]);
    }
  });

  it('does not notify the accused player', async () => {
    stubQuery();

    await recordIntegrityDecision(GAME_CODE, { decision: 'confirmed', reviewerId: 'rev-1' });

    expect(recipients()).not.toContain('user-black');
  });

  it('does not tell the deciding reviewer about their own decision', async () => {
    stubQuery();

    await recordIntegrityDecision(GAME_CODE, { decision: 'confirmed', reviewerId: 'rev-2' });

    expect(recipients()).toEqual(['rev-1', 'user-white']);
    // The decision is still attributed in the notice the others receive.
    expect(bodies()[1]).toContain('by reviewer rev-2');
  });

  it('falls back to player reports when the analysis flagged nobody', async () => {
    stubQuery({
      flaggedPlayers: [],
      reports: [{ reported_player_id: 'user-black' }],
    });

    await recordIntegrityDecision(GAME_CODE, { decision: 'confirmed', reviewerId: 'rev-1' });

    expect(recipients()).toEqual(['rev-2', 'user-white']);
    expect(bodies()[0]).toContain('Bob (Rapid · Elo 1455)');
  });

  it('stays silent when no accused player can be identified', async () => {
    stubQuery({ flaggedPlayers: [], reports: [] });

    await recordIntegrityDecision(GAME_CODE, { decision: 'confirmed', reviewerId: 'rev-1' });

    expect(notificationInserts()).toHaveLength(0);
  });

  it('never lets a failed notification undo the decision', async () => {
    stubQuery();
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('UPDATE game_integrity_reviews')) {
        return { rows: [{ game_code: GAME_CODE, review_decision: 'confirmed' }] };
      }
      if (text.includes('INSERT INTO notifications')) throw new Error('db down');
      if (text.includes('FROM games g')) return { rows: [GAME_ROW] };
      return { rows: [] };
    });

    const review = await recordIntegrityDecision(GAME_CODE, {
      decision: 'confirmed',
      reviewerId: 'rev-1',
    });

    expect(review).toMatchObject({ review_decision: 'confirmed' });
  });
});

describe('recordIntegrityDecision — not confirmed', () => {
  it('sends nothing when a case is cleared', async () => {
    stubQuery();
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('UPDATE game_integrity_reviews')) {
        return { rows: [{ game_code: GAME_CODE, review_decision: 'cleared' }] };
      }
      return { rows: [] };
    });

    await recordIntegrityDecision(GAME_CODE, { decision: 'cleared', reviewerId: 'rev-1' });

    expect(notificationInserts()).toHaveLength(0);
  });

  it('sends nothing when a case still needs review', async () => {
    stubQuery();
    query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('UPDATE game_integrity_reviews')) {
        return { rows: [{ game_code: GAME_CODE, review_decision: 'needs_review' }] };
      }
      return { rows: [] };
    });

    await recordIntegrityDecision(GAME_CODE, { decision: 'needs_review', reviewerId: 'rev-1' });

    expect(notificationInserts()).toHaveLength(0);
  });
});

describe('notifyCheatConfirmed', () => {
  it('does nothing for an unknown game', async () => {
    stubQuery({ game: null });

    const created = await notifyCheatConfirmed('NOSUCHGAME');

    expect(created).toEqual([]);
    expect(notificationInserts()).toHaveLength(0);
  });

  it('names no reviewer when the confirmation is unattributed', async () => {
    stubQuery();

    await notifyCheatConfirmed(GAME_CODE);

    // With nobody to exclude, the whole review team is notified.
    expect(recipients()).toEqual(['rev-1', 'rev-2', 'user-white']);
    for (const body of bodies()) expect(body).not.toContain('null');
    expect(payloads()[0].reviewerId).toBeNull();
  });

  it('still delivers to valid recipients when one is unroutable', async () => {
    stubQuery();
    const base = query.getMockImplementation();
    // A stale reviewer id fails its foreign key. The batch insert dies with
    // it, so delivery has to fall back to one statement per recipient.
    query.mockImplementation(async (sql, params) => {
      const text = String(sql);
      if (text.includes('INSERT INTO notifications')) {
        const isBatch = params.length > PARAMS_PER_ROW;
        if (isBatch || params[0] === 'rev-2') {
          throw new Error('violates foreign key constraint "notifications_recipient_id_fkey"');
        }
        return { rows: [{ id: 1, recipient_id: params[0] }] };
      }
      return base(sql, params);
    });

    const created = await notifyCheatConfirmed(GAME_CODE, { reviewerId: 'rev-3' });

    // The victim and the reachable reviewer are still told.
    expect(created.map((row) => row.recipient_id).sort()).toEqual(['rev-1', 'user-white']);
  });

  it('omits the rating when the game has no recorded pool', async () => {
    stubQuery({
      game: { ...GAME_ROW, time_control: null, white_elo: null, black_elo: null },
    });

    await notifyCheatConfirmed(GAME_CODE, { reviewerId: 'rev-1' });

    const opponentBody = bodies()[0];
    expect(opponentBody).toContain('Bob');
    expect(opponentBody).not.toContain('Elo');
    expect(payloads()[0].ratingLabel).toBeNull();
  });
});
