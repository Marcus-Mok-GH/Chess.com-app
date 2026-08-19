import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MoveHistory from './MoveHistory';

describe('MoveHistory', () => {
  it('renders "No moves yet" when history is empty', () => {
    render(<MoveHistory history={[]} />);
    expect(screen.getByText('No moves yet')).toBeDefined();
  });

  it('renders move pairs correctly when given move history array', () => {
    const history = ['e4', 'e5', 'Nf3', 'Nc6'];
    render(<MoveHistory history={history} />);

    expect(screen.getByText('1.')).toBeDefined();
    expect(screen.getByText('e4')).toBeDefined();
    expect(screen.getByText('e5')).toBeDefined();

    expect(screen.getByText('2.')).toBeDefined();
    expect(screen.getByText('Nf3')).toBeDefined();
    expect(screen.getByText('Nc6')).toBeDefined();
  });

  it('renders incomplete move pair when black has not moved yet', () => {
    const history = ['e4'];
    render(<MoveHistory history={history} />);

    expect(screen.getByText('1.')).toBeDefined();
    expect(screen.getByText('e4')).toBeDefined();
  });

  it('renders moves from object history format correctly', () => {
    const history = [
      { san: 'e4', from: 'e2', to: 'e4' },
      { san: 'e5', from: 'e7', to: 'e5' },
    ];
    render(<MoveHistory history={history} />);

    expect(screen.getByText('1.')).toBeDefined();
    expect(screen.getByText('e4')).toBeDefined();
    expect(screen.getByText('e5')).toBeDefined();
  });
});
