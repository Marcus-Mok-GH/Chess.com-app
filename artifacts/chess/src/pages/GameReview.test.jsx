import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GameReview from './GameReview';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../components/ChessBoard', () => ({
  default: () => <div data-testid="review-board" />,
}));

vi.mock('../contexts/UserContext', () => ({
  useUser: () => ({ user: { username: 'whitey', id: 'u1' }, isOnline: true }),
}));

const { mockApi } = vi.hoisted(() => ({ mockApi: { getGameByCode: vi.fn(), getEngineEvaluations: vi.fn() } }));
vi.mock('../services/api', () => ({ default: mockApi }));

const { mockAnalyzeGame } = vi.hoisted(() => ({ mockAnalyzeGame: vi.fn() }));
vi.mock('../engine/coach/coachAI', () => ({
  analyzeGame: mockAnalyzeGame,
  getCoachConnectionUrl: () => 'https://example.test/coach/connect',
}));

const GAME = {
  game_code: 'AB12CD34',
  move_history: [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }],
  result: 'white',
  game_mode: 'casual',
  white_player_name: 'whitey',
  black_player_name: 'blacky',
  created_at: '2026-09-20T10:00:00Z',
};

// Engine scores in side-to-move perspective: start(+30) after e4(-30)
// after e5(+40) after Nf3(-25). Losses: e4 -> 30-30=0 (best), e5 -> -30+40... etc.
const ENGINE_RESPONSE = {
  results: [
    { fen: 'start', gameOver: false, scoreCp: 30, mate: null, bestMove: 'e2e4', bestSan: 'e4' },
    { fen: 'f1', gameOver: false, scoreCp: -30, mate: null, bestMove: 'e7e5', bestSan: 'e5' },
    { fen: 'f2', gameOver: false, scoreCp: 40, mate: null, bestMove: 'b8c6', bestSan: 'Nc6' },
    { fen: 'f3', gameOver: true, scoreCp: null, mate: null, bestMove: null, bestSan: null },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/review/AB12CD34']}>
      <Routes>
        <Route path="/review/:gameCode" element={<GameReview />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('GameReview page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getGameByCode.mockResolvedValue(GAME);
    mockApi.getEngineEvaluations.mockResolvedValue(ENGINE_RESPONSE);
    mockAnalyzeGame.mockResolvedValue({
      format: 'move_review',
      moves: [
        { ply: 1, san: 'e4', review: 'Strong central start.' },
        { ply: 2, san: 'e5', review: 'Fine symmetric reply.' },
      ],
    });
  });

  it('renders game header and move list', async () => {
    renderPage();
    expect(await screen.findByText('Game Review')).toBeTruthy();
    expect(screen.getByText(/whitey vs blacky/)).toBeTruthy();
    expect(await screen.findByText('e4')).toBeTruthy();
    expect(screen.getByText('e5')).toBeTruthy();
    expect(screen.getByText('Nf3')).toBeTruthy();
  });

  it('shows per-side accuracy once the engine finishes', async () => {
    renderPage();
    await screen.findByText('e4');
    await waitFor(() => {
      const accuracies = screen.getAllByText(/^\d+\.\d%$/);
      expect(accuracies.length).toBeGreaterThanOrEqual(2);
    }, { timeout: 3000 });
    expect(screen.getByText('whitey')).toBeTruthy();
    expect(screen.getByText('blacky')).toBeTruthy();
  });

  it('navigates moves with next/prev buttons', async () => {
    renderPage();
    await screen.findByText('e4');
    const next = screen.getByRole('button', { name: 'Next move' });
    fireEvent.click(next);
    expect(screen.getByText('Move 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }));
    expect(screen.getByText('Start')).toBeTruthy();
  });

  it('shows the back link to game history', async () => {
    renderPage();
    expect(await screen.findByText('← Back to Game History')).toBeTruthy();
  });

  it('shows coach commentary for the selected move', async () => {
    renderPage();
    await screen.findByText('e4');
    fireEvent.click(screen.getByText('e4'));
    await waitFor(() => {
      expect(screen.getByText('Strong central start.')).toBeTruthy();
    });
  });

  it('handles a missing game gracefully', async () => {
    mockApi.getGameByCode.mockResolvedValue(null);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Game not found.')).toBeTruthy();
    });
  });
});
