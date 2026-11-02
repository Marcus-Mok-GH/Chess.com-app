import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared handles captured from the mocked board and engine so the test can
// drive real drag handlers and control the bot's replies.
const h = vi.hoisted(() => ({ board: null, engineMoves: ['d7d5', 'g8f6'] }));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('./ChessBoard', () => ({
  default: (props) => {
    h.board = props;
    return <div data-testid="board" />;
  },
}));

vi.mock('./GameControls', () => ({ default: () => <div /> }));
vi.mock('./MoveHistory', () => ({ default: () => <div /> }));
vi.mock('./PlayerBar', () => ({ default: () => <div /> }));
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
    getEngineMove: vi.fn(async () => ({ bestMove: h.engineMoves.shift() })),
    saveGame: vi.fn(async () => ({})),
  },
}));

import ChessGame from './ChessGame';
import api from '../services/api';
import { BOTS } from '../engine/bots/bots';

const SAITAMA = BOTS.find((b) => b.id === 'saitama');

async function settleTurn(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function lastBotPayload() {
  const calls = api.getEngineMove.mock.calls;
  return calls[calls.length - 1][0].bot;
}

describe('Saitama awakening wiring', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.board = null;
    h.engineMoves = ['d7d5', 'g8f6'];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('sends a calm search first, then a max-strength one once provoked', async () => {
    render(
      <ChessGame
        initialSelectedBot={SAITAMA}
        initialPlayerColor="w"
        onUiStateChange={vi.fn()}
      />,
    );

    act(() => {
      h.board.onPieceDrop('e2', 'e4');
    });
    await settleTurn();

    const calm = lastBotPayload();
    expect(calm.name).toBe('Saitama');
    expect(calm.depth).toBe(3);
    expect(calm.nodes).toBe(4000);
    expect(calm.maxStrength).toBeUndefined();

    // Player takes the d5 pawn: from here the bot stops holding back.
    act(() => {
      h.board.onPieceDrop('e4', 'd5');
    });
    await settleTurn();

    const awakened = lastBotPayload();
    expect(awakened.name).toBe('Saitama');
    expect(awakened.maxStrength).toBe(true);
    expect(awakened.depth).toBe(20);
    expect(awakened.nodes).toBe(1000000);
    expect(awakened.blunderChance).toBe(0);
    expect(awakened.scriptedOpening).toBeUndefined();
  });
});