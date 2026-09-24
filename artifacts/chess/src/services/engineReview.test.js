import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeGamePositions } from './engineReview';

const { mockApi } = vi.hoisted(() => ({ mockApi: { getEngineEvaluations: vi.fn() } }));
vi.mock('./api', () => ({ default: mockApi }));

function result(fen, scoreCp, gameOver = false) {
  return { fen, gameOver, scoreCp, mate: null, bestMove: gameOver ? null : 'e2e4', bestSan: gameOver ? null : 'e4' };
}

describe('analyzeGamePositions', () => {
  beforeEach(() => {
    mockApi.getEngineEvaluations.mockReset();
  });

  it('chunks positions and assembles scores in order', async () => {
    const fens = ['f0', 'f1', 'f2', 'f3', 'f4'];
    mockApi.getEngineEvaluations.mockImplementation(async ({ fens: batch }) => ({
        results: batch.map((fen) => result(fen, Number(fen.slice(1)) * 10)),
      }));

    const { scores, bestMoves } = await analyzeGamePositions(fens, { chunkSize: 2 });
    expect(mockApi.getEngineEvaluations).toHaveBeenCalledTimes(3);
    expect(scores).toEqual([0, 10, 20, 30, 40]);
    expect(bestMoves[4]).toEqual({ bestMove: 'e2e4', bestSan: 'e4' });
  });

  it('delivers progressive results and progress callbacks', async () => {
    const fens = ['a', 'b', 'c', 'd'];
    mockApi.getEngineEvaluations.mockImplementation(async ({ fens: batch }) => ({
        results: batch.map((fen) => result(fen, 5)),
      }));

    const resultsSeen = [];
    const progressSeen = [];
    await analyzeGamePositions(fens, {
      chunkSize: 3,
      onResults: (indexed) => resultsSeen.push(...indexed.map((r) => r.index)),
      onProgress: (done, total) => progressSeen.push([done, total]),
    });

    expect(resultsSeen.sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
    expect(progressSeen.some(([done]) => done === 3)).toBe(true);
    expect(progressSeen[progressSeen.length - 1]).toEqual([4, 4]);
  });

  it('keeps known game-over scores but no best move', async () => {
    const fens = ['a', 'b'];
    mockApi.getEngineEvaluations.mockResolvedValue({
      results: [
        result('a', 30),
        { fen: 'b', gameOver: true, scoreCp: 0, mate: null, bestMove: null, bestSan: null },
      ],
    });

    const { scores, bestMoves } = await analyzeGamePositions(fens);
    expect(scores).toEqual([30, 0]);
    expect(bestMoves).toEqual([{ bestMove: 'e2e4', bestSan: 'e4' }, null]);
  });

  it('nulls scores the server could not compute', async () => {
    const fens = ['a', 'b'];
    mockApi.getEngineEvaluations.mockResolvedValue({
      results: [
        result('a', 30),
        { fen: 'b', gameOver: true, scoreCp: null, mate: null, bestMove: null, bestSan: null },
      ],
    });

    const { scores } = await analyzeGamePositions(fens);
    expect(scores).toEqual([30, null]);
  });

  it('treats a per-position error as a failed analysis', async () => {
    const fens = ['a', 'b'];
    mockApi.getEngineEvaluations.mockResolvedValue({
      results: [
        result('a', 30),
        { fen: 'b', gameOver: false, scoreCp: null, mate: null, bestMove: null, bestSan: null, error: 'Time budget exhausted' },
      ],
    });

    await expect(analyzeGamePositions(fens)).rejects.toThrow('Time budget exhausted');
  });

  it('retries 429 responses with backoff and succeeds', async () => {
    const fens = ['a', 'b'];
    const busy = new Error('Engine is busy');
    busy.status = 429;
    mockApi.getEngineEvaluations
      .mockRejectedValueOnce(busy)
      .mockResolvedValueOnce({ results: [result('a', 30), result('b', 12)] });

    const { scores } = await analyzeGamePositions(fens);
    expect(mockApi.getEngineEvaluations).toHaveBeenCalledTimes(2);
    expect(scores).toEqual([30, 12]);
  });

  it('does not retry non-429 failures', async () => {
    const fens = ['a', 'b'];
    const unavailable = new Error('Stockfish engine is not available in this deployment');
    unavailable.status = 503;
    mockApi.getEngineEvaluations.mockRejectedValue(unavailable);

    await expect(analyzeGamePositions(fens)).rejects.toThrow('Stockfish engine is not available');
    expect(mockApi.getEngineEvaluations).toHaveBeenCalledTimes(1);
  });

  it('stops issuing chunks after a failed request and rejects', async () => {
    const fens = Array.from({ length: 6 }, (_, i) => `f${i}`);
    mockApi.getEngineEvaluations.mockRejectedValue(new Error('boom'));

    await expect(analyzeGamePositions(fens, { chunkSize: 2, parallel: 1 })).rejects.toThrow('boom');
    // parallel=1 worker: first chunk fails, worker stops, no further calls
    expect(mockApi.getEngineEvaluations).toHaveBeenCalledTimes(1);
  });
});
