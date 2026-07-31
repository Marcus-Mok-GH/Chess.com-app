import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, waitFor } from '@testing-library/react';
import Changelog from './Changelog';

describe('Changelog page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and renders changelog entries from /CHANGELOG.md', async () => {
    const markdown = `# Changelog\n\n## 1.1.28 - 2026-05-06\n- Added changelog page tests.\n- Verified build compatibility.\n\n## 1.1.27 - 2026-05-06\n- Previous release item.`;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(markdown),
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(
      <MemoryRouter>
        <Changelog />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(view.getByText('1.1.28')).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith('/CHANGELOG.md');
    expect(view.getByText('Added changelog page tests.')).toBeTruthy();
    expect(view.getByText('Verified build compatibility.')).toBeTruthy();
    expect(view.getByText('1.1.27')).toBeTruthy();
  });

  it('shows header and back button', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('# Changelog'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(
      <MemoryRouter>
        <Changelog />
      </MemoryRouter>
    );

    expect(view.getByText('Changelog')).toBeTruthy();
    const backButton = view.getByRole('button', { name: /back to home/i });
    expect(backButton).toBeTruthy();
    fireEvent.click(backButton);
  });
});
