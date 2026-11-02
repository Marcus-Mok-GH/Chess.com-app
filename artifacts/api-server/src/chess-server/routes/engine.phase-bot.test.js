import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';

import { getSearchParams } from './engine.js';
import {
  getBotPhase,
  hasProvocationTriggered,
  resolveActiveBot,
} from '../../../../chess/src/engine/bots/awakening.js';
import { saitama } from '../../../../chess/src/engine/bots/personalities/saitama.js';
import { BOTS, getBotRatingDisplay } from '../../../../chess/src/engine/bots/bots.js';

function buildHistory(sans) {
  const game = new Chess();
  return sans.map((san) => game.move(san));
}

// The bot sits on the opposite side of the player.
function phaseFor(sans, playerColor) {
  const moveHistory = buildHistory(sans);
  const botColor = playerColor === 'w' ? 'b' : 'w';
  return {
    moveHistory,
    botColor,
    playerColor,
    phase: getBotPhase(saitama, { moveHistory, playerColor }),
  };
}

describe('Saitama phase detection', () => {
  it('stays calm through quiet development', () => {
    const { phase } = phaseFor(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], 'w');
    expect(phase).toBe('calm');
  });

  it('awakens when the player wins material', () => {
    const { phase } = phaseFor(['e4', 'd5', 'exd5'], 'w');
    expect(phase).toBe('awakened');
  });

  it('awakens when the player gives check', () => {
    const { phase } = phaseFor(['e4', 'd5', 'Bb5+'], 'w');
    expect(phase).toBe('awakened');
  });

  it('ignores captures the bot itself makes', () => {
    const { phase } = phaseFor(['d4', 'd5', 'c4', 'dxc4', 'Nc3', 'Nf6'], 'w');
    expect(phase).toBe('calm');
  });

  it('ignores checks the bot itself gives', () => {
    const { phase } = phaseFor(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Bb4+'], 'w');
    expect(phase).toBe('calm');
    expect(hasProvocationTriggered(buildHistory(['e4']), 'b')).toBe(false);
  });
});

describe('Saitama engine parameters', () => {
  it('uses the weakest search while calm', () => {
    const calm = resolveActiveBot(saitama, { moveHistory: [], playerColor: 'w' });
    expect(calm.isAwakened).toBe(false);
    expect(getSearchParams(calm)).toBe('go nodes 4000');
  });

  it('jumps to a max-strength search once provoked', () => {
    const { moveHistory, playerColor } = phaseFor(['e4', 'd5', 'exd5'], 'w');
    const awake = resolveActiveBot(saitama, { moveHistory, playerColor });
    expect(awake.isAwakened).toBe(true);
    expect(awake.maxStrength).toBe(true);
    expect(getSearchParams(awake)).toMatch(/^go movetime \d+$/);
  });

  it('swaps in the awakened quote set', () => {
    const { moveHistory, playerColor } = phaseFor(['e4', 'd5', 'exd5'], 'w');
    const awake = resolveActiveBot(saitama, { moveHistory, playerColor });
    expect(awake.quotes.start).not.toEqual(saitama.quotes.start);
    expect(awake.quotes.awakened.length).toBeGreaterThan(0);
  });

  it('leaves other bots untouched', () => {
    const rex = BOTS.find((bot) => bot.id === 'rex');
    const prowled = resolveActiveBot(rex, {
      moveHistory: buildHistory(['e4', 'd5', 'exd5']),
      playerColor: 'w',
    });
    expect(prowled).toBe(rex);
  });
});

describe('Saitama roster entry', () => {
  it('is registered with a display rating', () => {
    const bot = BOTS.find((candidate) => candidate.id === 'saitama');
    expect(bot).toBeDefined();
    expect(getBotRatingDisplay(bot)).toBe('C-Class');
  });
});