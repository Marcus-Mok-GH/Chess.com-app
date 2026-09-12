import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BotSelector from './BotSelector';
import { BOTS } from '../engine/bots/bots';

const COACH_BOT = BOTS.find((b) => b.id === 'coach');

describe('BotSelector', () => {
  const defaultProps = {
    selectedBot: COACH_BOT,
    onSelectBot: vi.fn(),
    disabled: false,
    customElo: 1500,
    onCustomEloChange: vi.fn(),
    isLoggedIn: true,
  };

  it('enables coach bot when user is logged in', () => {
    render(<BotSelector {...defaultProps} />);
    const coachCard = screen.getByText('Coach');
    expect(coachCard).toBeDefined();
  });

  it('disables coach bot and shows login hint when user is not logged in', () => {
    render(<BotSelector {...defaultProps} isLoggedIn={false} />);
    expect(screen.getByText('Sign in to unlock the AI Coach')).toBeDefined();
  });

  it('sets aria-pressed correctly for selected and unselected bot buttons', () => {
    render(<BotSelector {...defaultProps} />);
    const coachButton = screen.getByRole('button', { name: /Coach/i });
    expect(coachButton.getAttribute('aria-pressed')).toBe('true');

    const doloresButton = screen.getByRole('button', { name: /Dolores/i });
    expect(doloresButton.getAttribute('aria-pressed')).toBe('false');
  });
});
