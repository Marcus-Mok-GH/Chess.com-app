import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PlaySetup from './PlaySetup';

describe('PlaySetup', () => {
  const defaultProps = {
    gameMode: 'bot',
    onSelectGameMode: vi.fn(),
    whiteName: 'Alice',
    onWhiteNameChange: vi.fn(),
    blackName: 'Bob',
    onBlackNameChange: vi.fn(),
    autoRotate: true,
    onAutoRotateChange: vi.fn(),
    selectedBot: { id: 'nelson', name: 'Nelson', rating: 1300 },
    onSelectBot: vi.fn(),
    customElo: 1000,
    onCustomEloChange: vi.fn(),
    playerColor: 'w',
    onSelectColor: vi.fn(),
    onStart: vi.fn(),
    isLoggedIn: true,
  };

  it('renders mode switch and defaults to Vs Computer', () => {
    render(<PlaySetup {...defaultProps} />);
    expect(screen.getByText('Vs Computer')).toBeDefined();
    expect(screen.getByText('Pass & Play')).toBeDefined();
    expect(screen.getByText('Opponent')).toBeDefined();
  });

  it('displays custom name inputs and auto-rotate toggle in Pass & Play mode', () => {
    render(<PlaySetup {...defaultProps} gameMode="pass_and_play" />);
    expect(screen.getByLabelText(/White Player/i)).toBeDefined();
    expect(screen.getByLabelText(/Black Player/i)).toBeDefined();
    expect(screen.getByText(/Auto-rotate board after each turn/i)).toBeDefined();
  });

  it('invokes callbacks when mode and player names change', () => {
    const onSelectGameMode = vi.fn();
    const onWhiteNameChange = vi.fn();

    render(
      <PlaySetup
        {...defaultProps}
        gameMode="pass_and_play"
        onSelectGameMode={onSelectGameMode}
        onWhiteNameChange={onWhiteNameChange}
      />
    );

    const vsCompBtn = screen.getByText('Vs Computer');
    fireEvent.click(vsCompBtn);
    expect(onSelectGameMode).toHaveBeenCalledWith('bot');

    const whiteInput = screen.getByLabelText(/White Player/i);
    fireEvent.change(whiteInput, { target: { value: 'Charlie' } });
    expect(onWhiteNameChange).toHaveBeenCalledWith('Charlie');
  });
});
