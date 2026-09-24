import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserProvider } from '../contexts/UserContext';
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
  summarizeLessonConcept: vi.fn(),
}));

vi.mock('../services/api', () => ({
  default: {
    getPuzzleStats: vi.fn(() => Promise.resolve({ success: true, stats: null })),
    savePuzzleStats: vi.fn(() => Promise.resolve({ success: true, stats: {} })),
  },
}));

import { explainCoachMove, summarizeLessonConcept } from '../engine/coach/coachAI';
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
    <UserProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Puzzles />
      </MemoryRouter>
    </UserProvider>
  );
}

describe('Puzzles page with Lesson Scheme & LLM commentary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    explainCoachMove.mockResolvedValue('The knight move attacks the exposed black queen.');
    summarizeLessonConcept.mockResolvedValue('Develop your pieces, control the center, and keep your king safe.');
  });

  it('renders the lesson scheme header and current lesson title', async () => {
    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText(`Lesson Scheme · 1 of ${LESSON_CATALOG.length}`)).toBeTruthy();
      expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    });
  });

  it('renders a concise AI lesson concept', async () => {
    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText('Develop your pieces, control the center, and keep your king safe.')).toBeTruthy();
    });
    expect(summarizeLessonConcept).toHaveBeenCalledWith(
      LESSON_CATALOG[0].title,
      LESSON_CATALOG[0].topic,
      LESSON_CATALOG[0].description,
    );
  });

  it('trims a long AI lesson concept to one or two short sentences', async () => {
    summarizeLessonConcept.mockResolvedValue(
      'Develop your pieces toward the center and castle quickly. Avoid moving the same piece twice or bringing the queen out too early because chasing it costs time. A simple opening routine like 1. e4 e5 2. Nf3 Nc6 3. Bc4 keeps every move useful.'
    );

    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText('Develop your pieces toward the center and castle quickly.')).toBeTruthy();
    });
    // The second and third sentences are cut: users skim this card.
    expect(screen.queryByText(/chasing it costs time/)).toBeNull();
    expect(screen.queryByText(/1\. e4 e5/)).toBeNull();
  });

  it('keeps abbreviations such as e.g. intact in the lesson concept', async () => {
    summarizeLessonConcept.mockResolvedValue(
      'Watch for pins, e.g., against the queen. Develop your pieces toward the center and castle quickly.'
    );

    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText(/Watch for pins, e\.g\., against the queen\./)).toBeTruthy();
    });
    expect(screen.queryByText(/^Watch for pins, e\.$/)).toBeNull();
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
      expect(api.savePuzzleStats).toHaveBeenCalledWith({
        solvedCount: 0,
        attemptedCount: 1,
        streak: 0,
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
        streak: 1,
        bestStreak: 1,
        rating: 480,
      });
    }, { timeout: 3000 });
  });

});