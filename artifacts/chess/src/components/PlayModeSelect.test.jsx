import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PlayModeSelect from './PlayModeSelect';

describe('PlayModeSelect', () => {
  it('renders both play options', () => {
    render(<PlayModeSelect onSelectBots={vi.fn()} onSelectOnline={vi.fn()} />);
    expect(screen.getByRole('button', { name: /bots/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /online/i })).toBeDefined();
  });

  it('calls onSelectBots when Bots is chosen', () => {
    const onSelectBots = vi.fn();
    render(<PlayModeSelect onSelectBots={onSelectBots} onSelectOnline={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /bots/i }));
    expect(onSelectBots).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectOnline when Online is chosen', () => {
    const onSelectOnline = vi.fn();
    render(<PlayModeSelect onSelectBots={vi.fn()} onSelectOnline={onSelectOnline} />);
    fireEvent.click(screen.getByRole('button', { name: /online/i }));
    expect(onSelectOnline).toHaveBeenCalledTimes(1);
  });

  it('keeps Online enabled while online', () => {
    render(<PlayModeSelect onSelectBots={vi.fn()} onSelectOnline={vi.fn()} onlineDisabled={false} />);
    expect(screen.getByRole('button', { name: /online/i }).disabled).toBe(false);
  });

  it('disables Online and shows an Offline badge while offline', () => {
    render(<PlayModeSelect onSelectBots={vi.fn()} onSelectOnline={vi.fn()} onlineDisabled />);
    expect(screen.getByRole('button', { name: /online/i }).disabled).toBe(true);
    expect(screen.getByText('Offline')).toBeDefined();
    // Bots still works offline
    expect(screen.getByRole('button', { name: /bots/i }).disabled).toBe(false);
  });
});
