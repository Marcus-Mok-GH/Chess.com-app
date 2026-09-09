import { describe, expect, it } from 'vitest';
import { isOnlineGameActive } from './onlineGameStatus';

describe('isOnlineGameActive', () => {
  it('keeps actions visible while an online game is active', () => {
    expect(isOnlineGameActive('playing')).toBe(true);
    expect(isOnlineGameActive('check')).toBe(true);
  });

  it('hides actions after the game ends or before it starts', () => {
    expect(isOnlineGameActive('ended')).toBe(false);
    expect(isOnlineGameActive('completed')).toBe(false);
    expect(isOnlineGameActive('waiting')).toBe(false);
    expect(isOnlineGameActive(undefined)).toBe(false);
  });
});
