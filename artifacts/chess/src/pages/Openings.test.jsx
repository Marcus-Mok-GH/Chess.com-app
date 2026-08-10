import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Openings from './Openings';

vi.mock('../services/api', () => ({
  default: {
    getOpeningRoots: vi.fn(),
    getOpeningChildren: vi.fn(),
    searchOpenings: vi.fn(),
  },
}));

vi.mock('../components/ChessBoard', () => ({
  default: () => <div data-testid="chessboard" />,
}));

import api from '../services/api';

const START = {
  eco: 'A00',
  name: 'Starting Position',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  san: '',
  stats: { moves: 100, whiteWins: 40, draws: 20, blackWins: 30 },
};

const E4 = {
  eco: 'B00',
  name: "King's Pawn Opening",
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  san: 'e4',
  pgn: 'e4',
  stats: { moves: 50, whiteWins: 20, draws: 10, blackWins: 15 },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <Openings />
    </MemoryRouter>
  );
}

describe('Openings page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getOpeningRoots.mockResolvedValue({ success: true, openings: [START, E4], count: 2 });
    api.getOpeningChildren.mockResolvedValue({ success: true, children: [], position: null });
    api.searchOpenings.mockResolvedValue({ success: true, results: [], count: 0 });
  });

  it('loads roots and auto-opens the starting position', async () => {
    renderPage();

    expect(screen.getByText(/Loading opening book/i)).toBeTruthy();

    await waitFor(() => expect(api.getOpeningRoots).toHaveBeenCalled());
    await waitFor(() => expect(api.getOpeningChildren).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /back/i })).toBeTruthy();
    expect(screen.getByTestId('chessboard')).toBeTruthy();
  });

  it('navigates deeper when a child move is clicked', async () => {
    api.getOpeningChildren.mockResolvedValue({
      success: true,
      children: [E4],
      position: { eco: 'A00', name: 'Starting Position', pgn: '', stats: START.stats },
    });

    renderPage();

    const moveButton = await screen.findByRole('button', { name: /e4/i });
    fireEvent.click(moveButton);

    await waitFor(() => expect(api.getOpeningChildren).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/to move/i)).toBeTruthy();
  });

  it('goes back to the parent position', async () => {
    api.getOpeningChildren.mockResolvedValue({
      success: true,
      children: [E4],
      position: { eco: 'A00', name: 'Starting Position', pgn: '', stats: START.stats },
    });

    renderPage();

    const moveButton = await screen.findByRole('button', { name: /e4/i });
    fireEvent.click(moveButton);
    await waitFor(() => expect(api.getOpeningChildren).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    await waitFor(() => expect(api.getOpeningChildren).toHaveBeenCalledTimes(3));
  });

  it('searches for openings by name', async () => {
    api.searchOpenings.mockResolvedValue({
      success: true,
      results: [
        {
          eco: 'B90',
          name: 'Sicilian Najdorf',
          fen: '...',
          pgn: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6',
        },
      ],
      count: 1,
    });

    renderPage();

    fireEvent.change(screen.getByLabelText(/search openings/i), { target: { value: 'najdorf' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(api.searchOpenings).toHaveBeenCalledWith('najdorf'));
    expect(await screen.findByText(/Sicilian Najdorf/i)).toBeTruthy();
  });
});
