import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Puzzles from './Puzzles';
import { LESSON_CATALOG } from '../engine/lessons/lessonCatalog';

vi.mock('../components/ChessBoard', () => ({
  default: ({ onPieceDrop, onSquareClick, position }) => (
    <div data-testid="chessboard" data-position={position}>
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
  },
}));

import { explainCoachMove, getLessonConcept } from '../engine/coach/coachAI';
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
      expect(screen.getByText('That move missed the tactic. Try again.')).toBeTruthy();
      expect(screen.getByText('The knight move attacks the exposed black queen.')).toBeTruthy();
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
    });
    expect(screen.queryByText('Not quite — try again.')).toBeNull();
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