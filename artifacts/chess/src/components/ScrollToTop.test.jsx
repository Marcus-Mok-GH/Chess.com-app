import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import ScrollToTop from './ScrollToTop';

function Page({ name }) {
  const navigate = useNavigate();
  return (
    <div>
      <span>{name}</span>
      <button type="button" onClick={() => navigate('/b')}>go</button>
    </div>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/a']}>
      <ScrollToTop />
      <main data-testid="scroll-container">
        <Routes>
          <Route path="/a" element={<Page name="A" />} />
          <Route path="/b" element={<Page name="B" />} />
        </Routes>
      </main>
    </MemoryRouter>,
  );
}

describe('ScrollToTop', () => {
  let mainScrollTo;
  let windowScrollTo;

  beforeEach(() => {
    // jsdom does not implement scrolling; the app's container is `main`, so
    // that is the call this component exists to make.
    mainScrollTo = vi.fn();
    Element.prototype.scrollTo = mainScrollTo;
    windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('puts the new screen at the top of the app scroll container', () => {
    renderApp();
    expect(screen.getByText('A')).toBeTruthy();

    // Ignore the mount-time reset; the interesting case is the navigation.
    mainScrollTo.mockClear();
    windowScrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'go' }));

    expect(screen.getByText('B')).toBeTruthy();
    expect(mainScrollTo).toHaveBeenCalledWith({ top: 0, left: 0 });
    expect(windowScrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('does not reset twice for the same route', () => {
    renderApp();
    mainScrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    const callsAfterNavigation = mainScrollTo.mock.calls.length;

    // Re-render the same route: no extra scroll work.
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(mainScrollTo.mock.calls.length).toBe(callsAfterNavigation);
  });
});
