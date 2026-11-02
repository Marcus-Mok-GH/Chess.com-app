import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import BotSelector from './BotSelector';
import { BOTS } from '../engine/bots/bots';

const COACH_BOT = BOTS.find((b) => b.id === 'coach');
const REX = BOTS.find((b) => b.id === 'rex');
const NADIA = BOTS.find((b) => b.id === 'nadia');

function renderSelector(props = {}) {
  return render(
    <MemoryRouter>
      <BotSelector
        selectedBot={COACH_BOT}
        onSelectBot={vi.fn()}
        disabled={false}
        customElo={1500}
        onCustomEloChange={vi.fn()}
        isLoggedIn
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('BotSelector', () => {
  it('enables coach bot when user is logged in', () => {
    renderSelector();
    expect(screen.getByText('Coach')).toBeDefined();
  });

  it('disables coach bot and shows login hint when user is not logged in', () => {
    renderSelector({ isLoggedIn: false });
    expect(screen.getByText('Sign in to unlock the AI Coach')).toBeDefined();
  });

  it('hides Rex\'s true rating and shows "???" on his roster card', () => {
    renderSelector({ hasSubscription: true });
    expect(screen.getByText('Rex')).toBeDefined();
    expect(screen.getByText('Rating: ???')).toBeDefined();
    expect(screen.queryByText('Rating: 2900')).toBeNull();
  });

  it('locks Rex and Nadia for free users and shows the upgrade hint', () => {
    renderSelector({ hasSubscription: false });
    const rexBtn = screen.getByText('Rex').closest('button');
    const nadiaBtn = screen.getByText('Nadia').closest('button');
    expect(rexBtn?.disabled).toBe(true);
    expect(nadiaBtn?.disabled).toBe(true);
    expect(screen.getByText('Upgrade to unlock Rex and Nadia')).toBeDefined();
    expect(screen.getAllByText('Premium').length).toBeGreaterThanOrEqual(2);
  });

  it('unlocks Rex and Nadia for subscribers', () => {
    renderSelector({ hasSubscription: true, selectedBot: REX });
    const rexBtn = screen.getByText('Rex').closest('button');
    const nadiaBtn = screen.getByText('Nadia').closest('button');
    expect(rexBtn?.disabled).toBe(false);
    expect(nadiaBtn?.disabled).toBe(false);
    expect(screen.queryByText('Upgrade to unlock Rex and Nadia')).toBeNull();
  });
});
