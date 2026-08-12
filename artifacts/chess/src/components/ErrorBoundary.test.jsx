import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

vi.mock('./ErrorBoundary.css', () => ({}));

function BrokenChild() {
  throw new Error('Test failure details');
}

describe('ErrorBoundary', () => {
  let consoleError;
  let clipboardDescriptor;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    } else {
      delete navigator.clipboard;
    }
  });

  it('shows error details and copies the report to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeTruthy();
    expect(screen.getByText(/Test failure details/)).toBeTruthy();
    expect(screen.getByText(/component stack/i)).toBeTruthy();
    expect(screen.getByText(/BrokenChild/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /copy error report/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('Test failure details');
    expect(screen.getByRole('status').textContent).toMatch(/copied/i);
  });
});
