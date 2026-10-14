import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Chess } from 'chess.js';
import ChessGame from './ChessGame';

// Capture the props ChessGame hands to the board so the test can drive moves
// through the same click handler the real board uses.
const captured = vi.hoisted(() => ({ props: null }));
const mockSettings = vi.hoisted(() => ({ value: {} }));

vi.mock('./ChessBoard', () => ({
  default: (props) => {
    captured.props = props;
    return null;
  },
}));

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: mockSettings.value }),
}));

vi.mock('../contexts/UserContext', () => ({
  useUser: () => ({ user: null, isOnline: false, isLoggedIn: false }),
}));

vi.mock('../services/api', () => ({
  default: {
    getEngineMove: vi.fn().mockResolvedValue({ bestMove: null }),
    saveGame: vi.fn().mockResolvedValue({}),
    getLocalGameByCode: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../utils/gamePersistence', () => ({
  saveLocalGame: vi.fn(),
  loadLocalGame: vi.fn(() => null),
  clearLocalGame: vi.fn(),
  markLocalGameFinished: vi.fn(),
}));

vi.mock('../utils/haptics', () => ({
  default: { move: vi.fn(), capture: vi.fn(), select: vi.fn() },
  setHapticEnabled: vi.fn(),
}));

vi.mock('../engine/coach/coachAI', () => ({
  getCoachingFeedback: vi.fn().mockResolvedValue(null),
}));

const START_FEN = new Chess().fen();

function baseSettings(overrides = {}) {
  return {
    showCoordinates: false,
    highlightMoves: false,
    boardTheme: 'green',
    pieceSet: 'default',
    autoQueen: true,
    confirmMoves: false,
    showHints: false,
    soundEnabled: false,
    soundVolume: 0,
    hapticEnabled: false,
    debugMode: false,
    ...overrides,
  };
}

function renderGame() {
  return render(
    <MemoryRouter>
      <ChessGame initialPlayerColor="w" isLoggedIn={false} />
    </MemoryRouter>,
  );
}

async function playE2E4() {
  await waitFor(() => expect(captured.props).toBeTruthy());
  await act(async () => {
    captured.props.onSquareClick('e2');
  });
  await act(async () => {
    captured.props.onSquareClick('e4');
  });
}

describe('ChessGame Confirm Moves setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.props = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays a move without prompting when the setting is off', async () => {
    mockSettings.value = baseSettings({ confirmMoves: false });
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('confirm', confirm);

    renderGame();
    await playE2E4();

    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(captured.props.position.fen()).not.toBe(START_FEN);
    });
  });

  it('blocks the move when the player declines confirmation', async () => {
    mockSettings.value = baseSettings({ confirmMoves: true });
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('confirm', confirm);

    renderGame();
    await playE2E4();

    expect(confirm).toHaveBeenCalledWith('Confirm move: e4?');
    expect(captured.props.position.fen()).toBe(START_FEN);
  });

  it('plays the move when the player confirms', async () => {
    mockSettings.value = baseSettings({ confirmMoves: true });
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirm);

    renderGame();
    await playE2E4();

    expect(confirm).toHaveBeenCalledWith('Confirm move: e4?');
    await waitFor(() => {
      expect(captured.props.position.fen().startsWith('rnbqkbnr/pppppppp/8/8/4P3/')).toBe(true);
    });
  });
});
