import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';

// Shared handles captured from the mocked board and engine so the test can
// drive real drag/click handlers and control the bot's reply.
const h = vi.hoisted(() => ({ board: null, controls: null, bars: [], engineMove: 'e7e5' }));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('./ChessBoard', () => ({
  default: (props) => {
    h.board = props;
    return <div data-testid="board" />;
  },
}));

vi.mock('./GameControls', () => ({ default: (props) => { h.controls = props; return <div />; } }));
vi.mock('./MoveHistory', () => ({ default: () => <div /> }));
vi.mock('./PlayerBar', () => ({ default: (props) => { h.bars.push(props); return <div />; } }));
vi.mock('./DebugPanel', () => ({ default: () => <div /> }));
vi.mock('./AnimatedPiece', () => ({ default: () => <div /> }));
vi.mock('./CoachingTip', () => ({ default: () => <div /> }));
vi.mock('./ChessGame/subcomponents/GameStatus', () => ({ default: () => <div /> }));

vi.mock('../engine/coach/coachAI', () => ({ getCoachingFeedback: vi.fn(async () => null) }));
vi.mock('../utils/sound', () => ({ playSoundEffect: vi.fn() }));
vi.mock('../utils/haptics', () => ({
  default: { move: vi.fn(), select: vi.fn(), capture: vi.fn() },
}));
vi.mock('../utils/gamePersistence', () => ({
  saveLocalGame: vi.fn(),
  loadLocalGame: vi.fn(() => null),
  clearLocalGame: vi.fn(),
  markLocalGameFinished: vi.fn(),
}));
vi.mock('../contexts/UserContext', () => ({
  useUser: () => ({ user: null, isOnline: false }),
}));
vi.mock('../contexts/SettingsContext', () => ({
  DEFAULT_SETTINGS: {},
  useSettings: () => ({
    settings: {
      showCoordinates: true,
      highlightMoves: true,
      boardTheme: 'green',
      pieceSet: 'default',
      autoQueen: true,
      confirmMoves: false,
      showHints: true,
      enablePremoves: true,
      soundEnabled: false,
      soundVolume: 0,
      hapticEnabled: false,
      debugMode: false,
    },
  }),
}));
vi.mock('../services/api', () => ({
  default: {
    getEngineMove: vi.fn(async () => ({ bestMove: h.engineMove })),
    saveGame: vi.fn(async () => ({})),
  },
}));

import ChessGame from './ChessGame';
import { BOTS } from '../engine/bots/bots';

const NELSON = BOTS.find((b) => b.id === 'nelson');

function fenOf(position) {
  return typeof position === 'string' ? position : position.fen();
}

// Drive the bot reply + the premove-application effect that follows it.
async function settleTurn(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('ChessGame premoves', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.engineMove = 'e7e5';
    h.board = null;
    h.controls = null;
    h.bars = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each(['w', 'b'])('flips a %s bot game without changing the player side or position', (color) => {
    render(<ChessGame initialSelectedBot={NELSON} initialPlayerColor={color} onUiStateChange={vi.fn()} />);
    const initialFen = fenOf(h.board.position);
    expect(h.board.boardOrientation).toBe(color === 'w' ? 'white' : 'black');
    expect(h.bars.at(-1).name).toBe('You');

    act(() => h.controls.onFlipBoard());
    expect(h.board.boardOrientation).toBe(color === 'w' ? 'black' : 'white');
    expect(fenOf(h.board.position)).toBe(initialFen);
    expect(h.controls.playerColor).toBe(color);
    expect(h.bars.at(-2).name).toBe('You');
    expect(h.bars.at(-2).color).toBe(color);

    act(() => h.controls.onFlipBoard());
    expect(h.board.boardOrientation).toBe(color === 'w' ? 'white' : 'black');
    expect(h.bars.at(-1).name).toBe('You');
  });

  it('auto-plays a queued premove once the bot turn returns', async () => {
    render(
      <ChessGame
        initialSelectedBot={NELSON}
        initialPlayerColor="w"
        onUiStateChange={vi.fn()}
      />,
    );

    // Player plays 1.e4, handing the move to the bot.
    act(() => {
      h.board.onPieceDrop('e2', 'e4');
    });
    expect(fenOf(h.board.position)).toContain(' b ');

    // While the bot is on the move, dragging a white pawn queues a premove.
    act(() => {
      h.board.onPieceDrop('d2', 'd4');
    });
    expect(h.board.customSquareStyles.d2).toBeTruthy();
    expect(h.board.customSquareStyles.d4).toBeTruthy();
    // The premove is queued, not played: the pawn is still on d2.
    expect(new Chess(fenOf(h.board.position)).get('d2')).toMatchObject({ type: 'p', color: 'w' });

    // Let the bot reply (...e5) and the queued premove apply.
    await settleTurn();

    const board = new Chess(fenOf(h.board.position));
    expect(board.get('e5')).toMatchObject({ type: 'p', color: 'b' });
    expect(board.get('d4')).toMatchObject({ type: 'p', color: 'w' });
    expect(board.get('d2')).toBeUndefined();
    expect(h.board.customSquareStyles.d2).toBeFalsy();
  });

  it('discards a queued premove that is illegal when the turn returns', async () => {
    render(
      <ChessGame
        initialSelectedBot={NELSON}
        initialPlayerColor="w"
        onUiStateChange={vi.fn()}
      />,
    );

    act(() => {
      h.board.onPieceDrop('e2', 'e4');
    });

    // d2->d5 is not a legal pawn move; it can be queued, but must be dropped.
    act(() => {
      h.board.onPieceDrop('d2', 'd5');
    });
    expect(h.board.customSquareStyles.d2).toBeTruthy();

    await settleTurn();

    const board = new Chess(fenOf(h.board.position));
    expect(board.get('e5')).toMatchObject({ type: 'p', color: 'b' });
    expect(board.get('d2')).toMatchObject({ type: 'p', color: 'w' });
    expect(board.get('d5')).toBeUndefined();
  });
});