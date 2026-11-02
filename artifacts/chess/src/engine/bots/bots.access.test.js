import { describe, it, expect } from 'vitest';
import { BOTS, botRequiresSubscription, canAccessBot, getBotById } from './bots';

describe('premium bot access', () => {
  it('marks Rex and Nadia as subscription-only', () => {
    expect(botRequiresSubscription(getBotById('rex'))).toBe(true);
    expect(botRequiresSubscription(getBotById('nadia'))).toBe(true);
    expect(botRequiresSubscription(getBotById('nelson'))).toBe(false);
  });

  it('blocks free accounts from Rex and Nadia', () => {
    expect(canAccessBot(getBotById('rex'), false)).toBe(false);
    expect(canAccessBot(getBotById('nadia'), false)).toBe(false);
    expect(canAccessBot(getBotById('nelson'), false)).toBe(true);
  });

  it('allows subscribers to play Rex and Nadia', () => {
    expect(canAccessBot(getBotById('rex'), true)).toBe(true);
    expect(canAccessBot(getBotById('nadia'), true)).toBe(true);
  });

  it('only flags the intended premium bots in the roster', () => {
    const premium = BOTS.filter((b) => b.requiresSubscription).map((b) => b.id).sort();
    expect(premium).toEqual(['nadia', 'rex']);
  });
});
