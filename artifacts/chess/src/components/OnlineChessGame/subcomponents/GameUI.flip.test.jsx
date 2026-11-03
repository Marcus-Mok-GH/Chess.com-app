import { fireEvent, render, screen } from '@testing-library/react';
import { Chess } from 'chess.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../ChessBoard', () => ({ default: ({ boardOrientation }) => <div data-testid="board" data-orientation={boardOrientation} /> }));
vi.mock('../../PlayerBar', () => ({ default: ({ name, isActive }) => <div data-testid="player-bar" data-active={isActive}>{name}</div> }));
vi.mock('../../MoveHistory', () => ({ default: () => null }));
vi.mock('../../../utils/haptics', () => ({ default: { button: vi.fn() } }));

import GameUI from './GameUI';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('online game board flip', () => {
  it.each(['white', 'black'])('offers Flip Board while viewing from %s and keeps turn indicators tied to player colors', (orientation) => {
    const onFlipBoard = vi.fn();
    const white = { name: 'White player', color: 'w' };
    const black = { name: 'Black player', color: 'b' };
    render(
      <GameUI
        game={new Chess()}
        boardOrientation={orientation}
        onFlipBoard={onFlipBoard}
        topPlayer={orientation === 'white' ? black : white}
        bottomPlayer={orientation === 'white' ? white : black}
        capturedPieces={{ w: [], b: [] }}
        settings={{}}
        animatingPieces={[]}
        chatMessages={[]}
        moveHistory={[]}
        getStatusMessage={() => 'Your turn'}
        gameStatus="playing"
        opponentStatus="connected"
        eloChange={null}
        gameId="example"
        canLeave={false}
      />,
    );
    expect(screen.getByTestId('board').getAttribute('data-orientation')).toBe(orientation);
    const bars = screen.getAllByTestId('player-bar');
    expect(bars[0].getAttribute('data-active')).toBe(String(orientation === 'black'));
    expect(bars[1].getAttribute('data-active')).toBe(String(orientation === 'white'));
    fireEvent.click(screen.getByRole('button', { name: 'Flip Board' }));
    expect(onFlipBoard).toHaveBeenCalledOnce();
  });
});
