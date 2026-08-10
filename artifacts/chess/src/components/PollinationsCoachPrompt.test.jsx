import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import PollinationsCoachPrompt from './PollinationsCoachPrompt';

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PollinationsCoachPrompt', () => {
  it('shows login variant when mode is login', () => {
    renderWithRouter(<PollinationsCoachPrompt mode="login" onConnected={vi.fn()} />);
    expect(screen.getByText(/Sign in to use AI Coach/)).toBeDefined();
    expect(screen.getByText(/Sign in to your chess account/)).toBeDefined();
  });

  it('shows connect variant by default', () => {
    renderWithRouter(<PollinationsCoachPrompt onConnected={vi.fn()} />);
    expect(screen.getByText(/Connect AI Coach/)).toBeDefined();
    expect(screen.getByText(/Connect Pollinations AI/)).toBeDefined();
  });
});
