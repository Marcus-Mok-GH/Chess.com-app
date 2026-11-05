import { render } from '@testing-library/react';
import { Chess } from 'chess.js';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../ChessBoard', () => ({ default: () => <div data-testid="board" /> }));
vi.mock('../../PlayerBar', () => ({ default: () => null }));
vi.mock('../../MoveHistory', () => ({ default: () => null }));
vi.mock('../../../utils/haptics', () => ({ default: { button: vi.fn() } }));

import GameUI from './GameUI';

// jsdom leaves scrollIntoView undefined. Defining it lets these tests catch the
// regression where the chat auto-scroll dragged the whole page down.
const scrollIntoView = vi.fn();

beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  scrollIntoView.mockClear();
});

const baseProps = {
  game: new Chess(),
  boardOrientation: 'white',
  onFlipBoard: vi.fn(),
  topPlayer: { name: 'Black player', color: 'b' },
  bottomPlayer: { name: 'White player', color: 'w' },
  capturedPieces: { w: [], b: [] },
  settings: {},
  animatingPieces: [],
  moveHistory: [],
  getStatusMessage: () => 'Your turn',
  gameStatus: 'playing',
  opponentStatus: 'connected',
  eloChange: null,
  gameId: 'example',
  canLeave: false,
  chatEnabled: true,
};

describe('online game chat scrolling', () => {
  it('does not scroll the window when the chat renders', () => {
    render(<GameUI {...baseProps} chatMessages={[{ id: 1, playerId: 'p1', message: 'hi' }]} />);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps the newest message visible by scrolling the message list itself', () => {
    const { container, rerender } = render(
      <GameUI {...baseProps} chatMessages={[{ id: 1, playerId: 'p1', message: 'hi' }]} />,
    );

    const list = container.querySelector('.chat-messages');
    expect(list).toBeTruthy();

    const scrollTops = [];
    Object.defineProperty(list, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(list, 'scrollTop', {
      get: () => scrollTops.at(-1) ?? 0,
      set: (value) => scrollTops.push(value),
      configurable: true,
    });

    rerender(<GameUI {...baseProps} chatMessages={[
      { id: 1, playerId: 'p1', message: 'hi' },
      { id: 2, playerId: 'p2', message: 'hello' },
    ]} />);

    expect(scrollTops).toEqual([500]);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
