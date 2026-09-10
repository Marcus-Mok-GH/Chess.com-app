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
      solution: 'Nxe5',
      rating: 1000,
      hint: 'Look for a forcing knight capture.',
    })),
    generatePuzzle: vi.fn(() => ({
      id: 'daily-mock',
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      sideToMove: 'white',
      solution: 'Nxe5',
      rating: 1000,
      hint: 'Look for a forcing knight capture.',
    })),
  };
});

vi.mock('../engine/coach/coachAI', () => ({
  explainCoachMove: vi.fn(),
}));

import { explainCoachMove } from '../engine/coach/coachAI';

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
  });

  it('renders the lesson scheme header and current lesson title', async () => {
    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText(`Lesson Scheme · 1 of ${LESSON_CATALOG.length}`)).toBeTruthy();
      expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    });
  });

  it('explains an incorrect move without revealing the answer and offers retry', async () => {
    renderPuzzles();

    await waitFor(() => {
      expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    });
    expect(explainCoachMove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('wrong-move'));

    await waitFor(() => {
      expect(screen.getByText('Why that move missed')).toBeTruthy();
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
});
