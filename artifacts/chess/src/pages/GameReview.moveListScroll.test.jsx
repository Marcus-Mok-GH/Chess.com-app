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
  useUser: () => ({ user: { username: 'whitey', id: 'u1' }, isLoggedIn: true, isOnline: true }),
}));

const { mockApi } = vi.hoisted(() => ({ mockApi: { getGameByCode: vi.fn(), getEngineEvaluations: vi.fn(), checkBookMoves: vi.fn() } }));
vi.mock('../services/api', () => ({ default: mockApi }));

const { mockAnalyzeGame, mockGetReviewUsage } = vi.hoisted(() => ({
  mockAnalyzeGame: vi.fn(),
  mockGetReviewUsage: vi.fn(),
}));
vi.mock('../engine/coach/coachAI', () => ({
  analyzeGame: mockAnalyzeGame,
  getReviewUsage: mockGetReviewUsage,
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

const ENGINE_RESPONSE = {
  results: [
    { fen: 'start', gameOver: false, scoreCp: 30, mate: null, bestMove: 'e2e4', bestSan: 'e4' },
    { fen: 'f1', gameOver: false, scoreCp: -30, mate: null, bestMove: 'e7e5', bestSan: 'e5' },
    { fen: 'f2', gameOver: false, scoreCp: 40, mate: null, bestMove: 'b8c6', bestSan: 'Nc6' },
    { fen: 'f3', gameOver: true, scoreCp: null, mate: null, bestMove: null, bestSan: null },
  ],
};

const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  scrollIntoView.mockClear();
  // jsdom leaves scrollIntoView undefined; defining it lets this suite catch the
  // regression where stepping through moves dragged the page down.
  Element.prototype.scrollIntoView = scrollIntoView;
  mockApi.getGameByCode.mockResolvedValue(GAME);
  mockApi.getEngineEvaluations.mockResolvedValue(ENGINE_RESPONSE);
  mockApi.checkBookMoves.mockImplementation(async (moves) => ({
    results: moves.map((pair) => ({ fen: pair.fen, uci: pair.uci, san: null, book: false })),
  }));
  mockAnalyzeGame.mockResolvedValue({ format: 'move_review', moves: [] });
  mockGetReviewUsage.mockResolvedValue({ used: 0, limit: 1, remaining: 1, unlimited: false, resetsAt: null });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/review/AB12CD34']}>
      <Routes>
        <Route path="/review/:gameCode" element={<GameReview />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Give a jsdom element the scroll geometry the move-list logic reads. */
function makeScrollable(element, { clientHeight = 100, scrollTop = 0 } = {}) {
  let current = scrollTop;
  Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(element, 'scrollTop', {
    get: () => current,
    set: (value) => { current = value; },
    configurable: true,
  });
  return {
    get scrollTop() { return current; },
    setRect({ top, height }) {
      element.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 0, width: 0, height });
    },
  };
}

/** Every move button shares the same stub, so whichever one becomes active is measured. */
function stubMoveGeometry(container, { top, height = 20 }) {
  const moves = container.querySelectorAll('.review-move');
  expect(moves.length).toBeGreaterThan(0);
  moves.forEach((move) => {
    move.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 0, width: 0, height });
  });
}

async function openReview() {
  const view = renderPage();
  await screen.findByText('e4');
  const list = view.container.querySelector('.review-moves');
  expect(list).toBeTruthy();
  return { view, list };
}

describe('game review move list scrolling', () => {
  it('keeps the active move visible by scrolling the list itself, never the page', async () => {
    const { view, list } = await openReview();
    const geometry = makeScrollable(list);
    geometry.setRect({ top: 0, height: 100 });
    // The list window ends 100px below its top; the moves sit 150px down.
    stubMoveGeometry(view.container, { top: 150 });

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(list.scrollTop).toBe(70);
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('scrolls the list back up to a move that sits above the visible window', async () => {
    const { view, list } = await openReview();
    const geometry = makeScrollable(list, { scrollTop: 200 });
    geometry.setRect({ top: 0, height: 100 });
    stubMoveGeometry(view.container, { top: -60 });

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(list.scrollTop).toBe(140);
    });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('leaves the list alone when the active move is already visible', async () => {
    const { view, list } = await openReview();
    const geometry = makeScrollable(list);
    geometry.setRect({ top: 0, height: 100 });
    stubMoveGeometry(view.container, { top: 10 });

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(screen.getByText('Move 1')).toBeTruthy();
    });
    expect(list.scrollTop).toBe(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not scroll the page when the review opens', async () => {
    await openReview();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
