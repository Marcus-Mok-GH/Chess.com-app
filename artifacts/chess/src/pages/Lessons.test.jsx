import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Lessons from './Lessons';
import { LESSON_CATALOG } from '../engine/lessons/lessonCatalog';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../components/ChessBoard', () => ({
  default: () => <div data-testid="example-board" />,
}));

vi.mock('../services/api', () => ({
  default: {
    getLessons: vi.fn(),
    getLesson: vi.fn(),
    getLessonProgress: vi.fn(),
    saveLessonProgress: vi.fn(),
  },
}));

import api from '../services/api';

function renderPage() {
  return render(
    <MemoryRouter>
      <Lessons />
    </MemoryRouter>
  );
}

describe('Lessons page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getLessons.mockResolvedValue({ success: true, lessons: LESSON_CATALOG });
    api.getLessonProgress.mockResolvedValue({ success: true, progress: [] });
    api.saveLessonProgress.mockResolvedValue({
      success: true,
      progress: { lessonId: 'forks', completed: true, score: null },
    });
  });

  it('renders lessons grouped by difficulty with titles', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Chess Lessons')).toBeTruthy();
    });

    expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    expect(screen.getByText('Knight Forks')).toBeTruthy();
    expect(screen.getByText('Beginner')).toBeTruthy();
    expect(screen.getByText('Intermediate')).toBeTruthy();
    expect(screen.getByText(`0 of ${LESSON_CATALOG.length} lessons complete`)).toBeTruthy();
  });

  it('reflects completed lessons from progress', async () => {
    api.getLessonProgress.mockResolvedValue({
      success: true,
      progress: [{ lessonId: 'forks', completed: true, score: null }],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(`1 of ${LESSON_CATALOG.length} lessons complete`)).toBeTruthy();
    });
    expect(screen.getAllByLabelText('Completed').length).toBe(1);
  });

  it('falls back to the local catalog when the API lessons call fails', async () => {
    api.getLessons.mockRejectedValue(new Error('offline'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Piece Development & Opening Principles')).toBeTruthy();
    });
  });

  it('opens a lesson detail view with example board and practice action', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Knight Forks')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Knight Forks'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all lessons/i })).toBeTruthy();
    });

    expect(screen.getByTestId('example-board')).toBeTruthy();
    expect(screen.getByRole('button', { name: /practice/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /mark complete/i })).toBeTruthy();
  });

  it('practice action navigates to a fresh puzzle for the selected lesson', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Knight Forks')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Knight Forks'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /practice/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /practice/i }));

    const destination = mockNavigate.mock.calls[0][0];
    const [, search = ''] = destination.split('?');
    const params = new URLSearchParams(search);
    expect(destination).toMatch(/^\/puzzles\?/);
    expect(params.get('lesson')).toBe('forks');
    expect(params.get('title')).toBe('Knight Forks');
    expect(params.get('themes')).toContain('Knight Ambush');
    expect(Number.isFinite(Number(params.get('seed')))).toBe(true);
  });

  it('mark complete calls saveLessonProgress and updates the button', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Knight Forks')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Knight Forks'));
    const completeButton = await screen.findByRole('button', { name: /mark complete/i });

    fireEvent.click(completeButton);

    await waitFor(() => {
      expect(api.saveLessonProgress).toHaveBeenCalledWith('forks', { completed: true });
      expect(screen.getByRole('button', { name: /^completed/i })).toBeTruthy();
    });
  });

  it('back button returns to the lesson list', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Knight Forks')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Knight Forks'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all lessons/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /all lessons/i }));

    await waitFor(() => {
      expect(screen.getByText('Chess Lessons')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /all lessons/i })).toBeNull();
    });
  });
});
