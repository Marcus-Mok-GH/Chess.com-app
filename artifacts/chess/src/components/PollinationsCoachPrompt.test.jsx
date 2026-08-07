import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PollinationsCoachPrompt from './PollinationsCoachPrompt';

describe('PollinationsCoachPrompt', () => {
  it('shows login variant when mode is login', () => {
    render(<PollinationsCoachPrompt mode="login" onConnected={vi.fn()} />);
    expect(screen.getByText('Sign in to use AI Coach')).toBeDefined();
    expect(screen.getByText('Log in to access Pollinations AI coaching.')).toBeDefined();
  });

  it('shows connect variant by default', () => {
    render(<PollinationsCoachPrompt onConnected={vi.fn()} />);
    expect(screen.getByText('Connect AI Coach')).toBeDefined();
    expect(screen.getByText('Connect Pollinations AI')).toBeDefined();
  });
});
