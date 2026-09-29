import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolvePlayerColor,
  resolveOnlinePlayerColor,
} from './playerColor';

describe('resolvePlayerColor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns white unchanged', () => {
    expect(resolvePlayerColor('w')).toBe('w');
  });

  it('returns black unchanged', () => {
    expect(resolvePlayerColor('b')).toBe('b');
  });

  it('resolves random to a valid color', () => {
    const resolved = resolvePlayerColor('random');
    expect(['w', 'b']).toContain(resolved);
  });

  it('rolls 50/50 for random', () => {
    const roll = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(resolvePlayerColor('random')).toBe('w');
    roll.mockReturnValue(0.75);
    expect(resolvePlayerColor('random')).toBe('b');
  });

  it('falls back to a random roll for unknown values', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(resolvePlayerColor('nonsense')).toBe('w');
  });
});

describe('resolveOnlinePlayerColor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns white unchanged', () => {
    expect(resolveOnlinePlayerColor('white')).toBe('white');
  });

  it('returns black unchanged', () => {
    expect(resolveOnlinePlayerColor('black')).toBe('black');
  });

  it('resolves random to a valid color', () => {
    expect(['white', 'black']).toContain(resolveOnlinePlayerColor('random'));
  });

  it('rolls 50/50 for random', () => {
    const roll = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(resolveOnlinePlayerColor('random')).toBe('white');
    roll.mockReturnValue(0.75);
    expect(resolveOnlinePlayerColor('random')).toBe('black');
  });

  it('falls back to a random roll for unknown values', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    expect(resolveOnlinePlayerColor('nonsense')).toBe('black');
  });
});
