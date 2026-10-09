import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Puzzles from './Puzzles';
import { LESSON_CATALOG } from '../engine/lessons/lessonCatalog';

vi.mock('../components/ChessBoard', () => ({
  default: ({ onPieceDrop, onSquareClick, position, customSquareStyles }) => (
    <div
      data-testid="chessboard"
      data-position={position}
      data-square-styles={JSON.stringify(customSquareStyles || {})}
    >
      <button data-testid="sq-c3" onClick={() => onSquareClick && onSquareClick('c3')}>
        c3
      </button>
      <button data-testid="sq-d5" onClick={() => onSquareClick && onSquareClick('d5')}>
        d5
      </button>
      <button data-testid="correct-move" onClick={() => onPieceDrop && onPieceDrop('c6', 'a5')}>
        correct move
      </button>
      <button data-testid="wrong-move" onClick={() => onPieceDrop && onPieceDrop('c6', 'b4')}>
        wrong move
      </button>
    </div>
  ),
}));

vi.mock('../engine/puzzles/puzzleGenerator', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generatePuzzleForThemes: vi.fn((themes, seed) => ({

      id: `mock-${seed}`,
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      sideToMove: 'white',
      solution: 'Na5',
      rating: 1000,
      hint: 'Look for a forcing knight capture.',
    })),
    generatePuzzle: vi.fn(() => ({
      id: 'daily-mock',
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      sideToMove: 'white',
      solution: 'Na5',
      rating: 1000,
      hint: 'Look for a forcing knight capture.',
    })),
  };
});

vi.mock('../engine/coach/coachAI', () => ({
  explainCoachMove: vi.fn(),
  getLessonConcept: vi.fn(),
}));

const { mockUserState } = vi.hoisted(() => ({
  mockUserState: {
    isLoggedIn: true,
    user: { id: 'u1', username: 'tester' },
    token: 'tok',
  },
}));

vi.mock('../contexts/UserContext', () => ({
  useUser: () => mockUserState,
}));

vi.mock('../services/api', () => ({
  default: {
    getPuzzleStats: vi.fn(() => Promise.resolve({ success: true, stats: null })),
    savePuzzleStats: vi.fn(() => Promise.resolve({ success: true, stats: {} })),
    generateLessonPuzzle: vi.fn(() => Promise.resolve({ success: true, puzzle: null })),
  },
}));

import { explainCoachMove, getLessonConcept } from '../engine/coach/coachAI';
import { generatePuzzleForThemes } from '../engine/puzzles/puzzleGenerator';
import api from '../services/api';

const MOCK_PUZZLE_FEN =
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';

// Puzzle generation is asynchronous (it runs in a worker), so board
// interactions must wait until the puzzle has actually loaded.
async function waitForPuzzleOnBoard() {
  await waitFor(() => {
    expect(screen.getByTestId('chessboard').getAttribute('data-position')).toBe(MOCK_PUZZLE_FEN);
  });
}

function renderPuzzles(initialEntries = ['/puzzles']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Puzzles />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockUserState.isLoggedIn = true;
  // The server-embedded payload is one-shot; never leak it across tests.
  delete window.__INITIAL_PUZZLE__;
});

describe('Puzzles page with Lesson Scheme & LLM commentary', () => {
beforeEach(() => {
  vi.clearAllMocks();
  explainCoachMove.mockResolvedValue('The knight move attacks the exposed black queen.');
  getLessonConcept.mockResolvedValue(
    'Black can win a piece here: look for the tactic this exact position allows.'
  );
});

  it('renders the lesson scheme header and current lesson title', async () => {
    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText(`Lesson Scheme · 1 of ${LESSON_CATALOG.length}`)).toBeTruthy();
      expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    });
  });

  it('renders a concise AI lesson concept for the generated puzzle', async () => {
    renderPuzzles();

    await waitForPuzzleOnBoard();
    await waitFor(() => {
      expect(
        screen.getByText('Black can win a piece here: look for the tactic this exact position allows.')
      ).toBeTruthy();
    });
    // The concept is requested for the SPECIFIC generated puzzle (its FEN,
    // side to move, and theme), not for the lesson's static description.
    expect(getLessonConcept).toHaveBeenCalledWith(
      expect.objectContaining({
        fen: MOCK_PUZZLE_FEN,
        sideToMove: 'white',
        lessonTitle: LESSON_CATALOG[0].title,
      })
    );
    expect(getLessonConcept).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.anything() })
    );
  });

  it('shows a position-aware fallback concept when the AI coach fails', async () => {
    getLessonConcept.mockRejectedValue(new Error('Connect your Pollinations account.'));

    renderPuzzles();

    await waitForPuzzleOnBoard();
    await waitFor(() => {
      const card = screen.getByText('Lesson Concept').closest('.puzzle-side-card');
      expect(card).toBeTruthy();
      // Fallback is built from the concrete generated position (its own FEN),
      // so it must mention the side that is actually on move.
      expect(card.textContent).toMatch(/White|Black/);
      expect(card.textContent.length).toBeGreaterThan(20);
    });
    expect(getLessonConcept).toHaveBeenCalledTimes(1);
  });

  it('explains an incorrect move without revealing the answer and offers retry', async () => {
    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    });
    await waitForPuzzleOnBoard();
    expect(explainCoachMove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('wrong-move'));

    await waitFor(() => {
      expect(screen.getByText('Why that move missed')).toBeTruthy();
      // The Pollinations AI coach (Luna/gpt-6) explains why the move misses;
      // the red banner overlay has been replaced by the AI explanation card.
      expect(screen.getByText('The knight move attacks the exposed black queen.')).toBeTruthy();
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    });
    expect(screen.queryByText('Not quite — try again.')).toBeNull();
    expect(screen.queryByText('That move missed the tactic. Try again.')).toBeNull();
  });

  it('renders raw LLM error when coach explanation fails without masking fallback', async () => {
    explainCoachMove.mockRejectedValue(new Error('402 - Connect your Pollinations account'));

    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    });
    await waitForPuzzleOnBoard();
    fireEvent.click(screen.getByTestId('wrong-move'));

    await waitFor(() => {
      expect(screen.getByText('AI Coach Explanation Error')).toBeTruthy();
      expect(screen.getByText('402 - Connect your Pollinations account')).toBeTruthy();
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    });
  });

  it('navigates through the lesson scheme in order when Next/Prev are clicked', async () => {
    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    });

    const nextBtn = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText(`Lesson Scheme · 2 of ${LESSON_CATALOG.length}`)).toBeTruthy();
      expect(screen.getByText('Center Control')).toBeTruthy();
    });

    const prevBtn = screen.getByRole('button', { name: /prev/i });
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(screen.getByText(`Lesson Scheme · 1 of ${LESSON_CATALOG.length}`)).toBeTruthy();
      expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    });
  });

  it('starts at the requested lesson when query param is present', async () => {
    renderPuzzles(['/puzzles?lesson=forks']);

    await waitFor(() => {
      expect(screen.getByText('Knight Forks')).toBeTruthy();
    });
  });

  it('loads saved puzzle stats from the API on mount', async () => {
    api.getPuzzleStats.mockResolvedValue({
      success: true,
      stats: {
        solvedCount: 7,
        attemptedCount: 10,
        currentStreak: 3,
        bestStreak: 9,
        rating: 1200,
        updatedAt: '2026-09-24T10:00:00.000Z',
      },
    });

    renderPuzzles();

    await waitForPuzzleOnBoard();
    await waitFor(() => {
      expect(screen.getByText('7')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('9')).toBeTruthy();
    });
  });

  it('highlights the solution piece square on the board when Hint is clicked', async () => {
    renderPuzzles();

    await waitForPuzzleOnBoard();

    const board = screen.getByTestId('chessboard');
    const stylesBefore = JSON.parse(board.getAttribute('data-square-styles'));
    expect(Object.keys(stylesBefore)).toHaveLength(0);

    // The mock puzzle's solution (Na5) resolves from square c6.
    fireEvent.click(screen.getByRole('button', { name: /hint/i }));

    await waitFor(() => {
      const styles = JSON.parse(board.getAttribute('data-square-styles'));
      expect(Object.keys(styles)).toContain('c6');
      expect(styles.c6.boxShadow).toBeTruthy();
    });

    // The text hint card is still shown alongside the board highlight.
    expect(screen.getByText('Look for a forcing knight capture.')).toBeTruthy();
  });

  it('persists stats to the API when a puzzle is skipped', async () => {
    api.getPuzzleStats.mockResolvedValue({ success: true, stats: null });
    renderPuzzles();

    await waitForPuzzleOnBoard();
    expect(api.savePuzzleStats).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /skip/i }));

    await waitFor(() => {
      // The payload must match the PUT /api/puzzles/stats/user contract
      // exactly (currentStreak, not streak) or the server rejects the save
      // and the rating never persists.
      expect(api.savePuzzleStats).toHaveBeenCalledWith({
        solvedCount: 0,
        attemptedCount: 1,
        currentStreak: 0,
        bestStreak: 0,
        rating: 400,
      });
    });
  });

  it('persists solved stats to the API after a correct move', async () => {
    api.getPuzzleStats.mockResolvedValue({ success: true, stats: null });
    renderPuzzles();

    await waitForPuzzleOnBoard();

    // The mocked board's correct-move button reports c6 -> a5, which
    // matches the mock puzzle's solution (Na5) in the black-to-move FEN.
    fireEvent.click(screen.getByTestId('correct-move'));

    await waitFor(() => {
      expect(api.savePuzzleStats).toHaveBeenCalledWith({
        solvedCount: 1,
        attemptedCount: 1,
        currentStreak: 1,
        bestStreak: 1,
        rating: 480,
      });
    }, { timeout: 3000 });
  });

  it('applies the account rating after signing in while the page stays open', async () => {
    mockUserState.isLoggedIn = false;
    const { rerender } = renderPuzzles();

    await waitForPuzzleOnBoard();
    // Guests never hit the stats API and stay at session-only defaults.
    expect(api.getPuzzleStats).not.toHaveBeenCalled();
    expect(screen.getByText('400')).toBeTruthy();

    api.getPuzzleStats.mockResolvedValue({
      success: true,
      stats: {
        solvedCount: 5,
        attemptedCount: 8,
        currentStreak: 2,
        bestStreak: 4,
        rating: 1120,
      },
    });
    mockUserState.isLoggedIn = true;
    rerender(
      <MemoryRouter initialEntries={['/puzzles']}>
        <Puzzles />
      </MemoryRouter>
    );

    // The persisted DB rating replaces the session defaults so the first
    // solve saves on top of the account's real Elo, not 400.
    await waitFor(() => {
      expect(screen.getByText('5')).toBeTruthy();
      expect(screen.getByText('1120')).toBeTruthy();
    });
  });

  it('shows an account notice instead of session stats for guests', async () => {
    mockUserState.isLoggedIn = false;

    renderPuzzles();

    await waitForPuzzleOnBoard();
    expect(await screen.findByText('Track your progress')).toBeTruthy();
    expect(screen.getByTestId('chessboard')).toBeTruthy(); // board still renders
    expect(screen.queryByText('Solved')).toBeNull(); // no stat labels for guests
  });

});


describe('SSR puzzle adoption on the client', () => {
  beforeEach(() => {
    // Scoped setup: no call history from earlier tests may leak into the
    // "did NOT regenerate" assertion, and the concept effect needs a promise.
    vi.clearAllMocks();
    explainCoachMove.mockResolvedValue('Move explanation.');
    getLessonConcept.mockResolvedValue('Concept for the adopted puzzle.');
    api.getPuzzleStats.mockResolvedValue({ success: true, stats: null });
  });

  // What the server embeds for /puzzles: a real position that differs from
  // the mocked generator's FEN, so tests can tell adopted vs generated apart.
  const SSR_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  function installServerPayload(lessonIndex = 0) {
    const lesson = LESSON_CATALOG[lessonIndex];
    window.__INITIAL_PUZZLE__ = {
      lessonIndex,
      puzzle: {
        id: 'lesson-ssr-424242',
        lessonIndex,
        fen: SSR_FEN,
        sideToMove: 'white',
        solution: 'e4',
        rating: 400,
        hint: 'Open with a central pawn move.',
        type: 'tactics',
        theme: 'Material Tactic',
        difficulty: 'beginner',
        lessonTitle: lesson.title,
        lessonTopic: lesson.topic,
        lessonOrder: lesson.order,
        lessonThemes: lesson.puzzleThemes,
      },
    };
  }

  it('adopts the server-rendered puzzle on first paint without regenerating', async () => {
    installServerPayload();

    renderPuzzles();

    // The synchronous first render already shows the embedded board — no
    // "Preparing lesson puzzle…" state — and the actions are usable.
    expect(screen.getByTestId('chessboard').getAttribute('data-position')).toBe(SSR_FEN);
    expect(screen.getByRole('button', { name: /skip/i }).disabled).toBe(false);

    // Effects settle against the ADOPTED puzzle…
    await waitFor(() => {
      expect(getLessonConcept).toHaveBeenCalledWith(
        expect.objectContaining({ fen: SSR_FEN, sideToMove: 'white' })
      );
    });
    // …no second puzzle is generated after mount, and the one-shot payload
    // is consumed so later visits regenerate as before.
    expect(generatePuzzleForThemes).not.toHaveBeenCalled();
    expect(window.__INITIAL_PUZZLE__).toBeUndefined();
  });

  it('ignores a payload that belongs to a different lesson', async () => {
    installServerPayload(3);

    renderPuzzles();

    await waitForPuzzleOnBoard();
    expect(generatePuzzleForThemes).toHaveBeenCalled();
    expect(window.__INITIAL_PUZZLE__).toBeUndefined();
  });

  it('ignores a malformed payload and generates normally', async () => {
    window.__INITIAL_PUZZLE__ = { lessonIndex: 0, puzzle: { fen: 42, solution: null } };

    renderPuzzles();

    await waitForPuzzleOnBoard();
    expect(generatePuzzleForThemes).toHaveBeenCalled();
  });

  it('ignores a payload whose FEN cannot be parsed', async () => {
    window.__INITIAL_PUZZLE__ = {
      lessonIndex: 0,
      puzzle: { id: 'lesson-bad-fen', lessonIndex: 0, fen: 'invalid', solution: 'e4', sideToMove: 'white' },
    };

    renderPuzzles();

    // Adopting it would show the start position while the puzzle keeps its
    // broken FEN — generation must run instead.
    await waitForPuzzleOnBoard();
    expect(generatePuzzleForThemes).toHaveBeenCalled();
  });

  it('ignores a payload whose solution is illegal for its position', async () => {
    window.__INITIAL_PUZZLE__ = {
      lessonIndex: 0,
      puzzle: {
        id: 'lesson-illegal-move',
        lessonIndex: 0,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        solution: 'Na5',
        sideToMove: 'white',
      },
    };

    renderPuzzles();

    await waitForPuzzleOnBoard();
    expect(generatePuzzleForThemes).toHaveBeenCalled();
  });

  it('defers progress saves until account stats have loaded', async () => {
    let resolveStats;
    api.getPuzzleStats.mockReturnValue(
      new Promise((resolve) => {
        resolveStats = resolve;
      }),
    );
    installServerPayload();

    renderPuzzles();

    // The adopted puzzle is playable before the stats request resolves:
    // skip right away. The local UI advances, but nothing may be persisted
    // from the default counters.
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    await screen.findByText('0% accuracy');
    expect(api.savePuzzleStats).not.toHaveBeenCalled();

    // The account baseline arrives and replaces the session defaults — the
    // early skip neither persisted defaults nor blocked this response.
    resolveStats({
      success: true,
      stats: {
        solvedCount: 7,
        attemptedCount: 10,
        currentStreak: 3,
        bestStreak: 9,
        rating: 1200,
        updatedAt: '2026-10-09T00:00:00.000Z',
      },
    });
    await waitFor(() => expect(screen.getByText('1200')).toBeTruthy());
    expect(screen.getByText('70% accuracy')).toBeTruthy();
    expect(api.savePuzzleStats).not.toHaveBeenCalled();

    // With the baseline known, the next skip persists on top of account values.
    const skipBtn = screen.getByRole('button', { name: /skip/i });
    await waitFor(() => expect(skipBtn.disabled).toBe(false));
    fireEvent.click(skipBtn);
    await waitFor(() => {
      expect(api.savePuzzleStats).toHaveBeenCalledWith({
        solvedCount: 7,
        attemptedCount: 11,
        currentStreak: 0,
        bestStreak: 9,
        rating: 1160,
      });
    });
  });

  it('keeps progress session-only when the account stats load fails', async () => {
    api.getPuzzleStats.mockRejectedValue(new Error('backend unreachable'));

    renderPuzzles();

    await waitForPuzzleOnBoard();
    await waitFor(() => expect(api.getPuzzleStats).toHaveBeenCalled());
    // Let the rejection settle so the failure is recorded before skipping.
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    await screen.findByText('0% accuracy');
    // No baseline is known: local progress stays session-only so defaults
    // can never overwrite unknown account values.
    expect(api.savePuzzleStats).not.toHaveBeenCalled();
  });
});

describe('Server-side lesson puzzle generation', () => {
  // A position that differs from the mocked local generator's FEN, so the two
  // sources are distinguishable in assertions.
  const SERVER_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  beforeEach(() => {
    vi.clearAllMocks();
    explainCoachMove.mockResolvedValue('Move explanation.');
    getLessonConcept.mockResolvedValue('Concept for the generated puzzle.');
    api.getPuzzleStats.mockResolvedValue({ success: true, stats: null });
    api.generateLessonPuzzle.mockResolvedValue({ success: true, puzzle: null });
  });

  function serverPuzzle(overrides = {}) {
    return {
      id: 'lesson-server-1',
      fen: SERVER_FEN,
      sideToMove: 'white',
      solution: 'e4',
      rating: 400,
      hint: 'Open with a central pawn move.',
      theme: 'Material Tactic',
      ...overrides,
    };
  }

  it('renders the puzzle generated by the API without generating locally', async () => {
    api.generateLessonPuzzle.mockResolvedValue({ success: true, puzzle: serverPuzzle() });

    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByTestId('chessboard').getAttribute('data-position')).toBe(SERVER_FEN);
    });
    // The server is asked for the lesson's puzzle at the page's difficulty...
    expect(api.generateLessonPuzzle).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: LESSON_CATALOG[0].id, difficulty: 'beginner' })
    );
    // ...and the worker generator never runs on the device.
    expect(generatePuzzleForThemes).not.toHaveBeenCalled();
  });

  it('falls back to local generation when the API request fails', async () => {
    api.generateLessonPuzzle.mockRejectedValue(new Error('backend unreachable'));

    renderPuzzles();

    await waitForPuzzleOnBoard();
    expect(generatePuzzleForThemes).toHaveBeenCalled();
  });

  it('falls back to local generation when the API returns an unplayable puzzle', async () => {
    api.generateLessonPuzzle.mockResolvedValue({
      success: true,
      puzzle: serverPuzzle({ fen: 'invalid' }),
    });

    renderPuzzles();

    await waitForPuzzleOnBoard();
    expect(generatePuzzleForThemes).toHaveBeenCalled();
  });
});
