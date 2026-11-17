import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PlayerBar from './PlayerBar';

function renderBar(props = {}) {
  return render(
    <PlayerBar
      name="You"
      avatar="👤"
      isBot={false}
      isActive={false}
      capturedPieces={[]}
      color="w"
      {...props}
    />,
  );
}

describe('PlayerBar', () => {
  it('shows the rating when one is supplied', () => {
    renderBar({ rating: 1200 });
    expect(screen.getByText('(1200)')).toBeDefined();
  });

  it('renders no rating line in bot games, where player rows carry no Elo', () => {
    const { container } = renderBar();
    expect(container.querySelector('.player-rating')).toBeNull();
    expect(screen.getByText('You')).toBeDefined();
  });
});
