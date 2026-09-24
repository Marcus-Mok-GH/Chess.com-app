import api from './api';

/**
 * Progressive Stockfish analysis of a game's positions.
 *
 * The backend evaluates at most a few positions per request (serverless time
 * limits), so positions are sent in chunks. Results are delivered per chunk
 * via `onResults(indexedResults)` as they arrive; `onProgress(done, total)`
 * reports overall progress. Chunks run with limited parallelism to stay
 * gentle on the engine concurrency guard.
 *
 * @param {string[]} fens - Positions to evaluate (start position + one per move).
 * @param {object} [options]
 * @param {number} [options.chunkSize=8] - Positions per request.
 * @param {number} [options.parallel=2] - Concurrent requests.
 * @param {(indexed: Array<{index: number, scoreCp: number|null, gameOver: boolean, bestMove: string|null, bestSan: string|null}>) => void} [options.onResults]
 * @param {(done: number, total: number) => void} [options.onProgress]
 * @returns {Promise<{ scores: Array<number|null>, bestMoves: Array<{bestMove: string|null, bestSan: string|null}> }>}
 */
export async function analyzeGamePositions(fens, options = {}) {
  const { chunkSize = 8, parallel = 2, onResults, onProgress } = options;
  const scores = new Array(fens.length).fill(null);
  const bestMoves = new Array(fens.length).fill(null);
  const chunks = [];
  for (let i = 0; i < fens.length; i += chunkSize) {
    chunks.push({ startIndex: i, fens: fens.slice(i, i + chunkSize) });
  }

  let done = 0;
  let failed = null;

  const runChunk = async (chunk) => {
    try {
      const data = await api.getEngineEvaluations({ fens: chunk.fens });
      const indexed = [];
      (data.results || []).forEach((result, offset) => {
        const index = chunk.startIndex + offset;
        scores[index] = result.gameOver || result.scoreCp == null ? null : result.scoreCp;
        bestMoves[index] = result.gameOver
          ? null
          : { bestMove: result.bestMove || null, bestSan: result.bestSan || null };
        indexed.push({
          index,
          scoreCp: scores[index],
          gameOver: Boolean(result.gameOver),
          bestMove: result.bestMove || null,
          bestSan: result.bestSan || null,
        });
      });
      if (onResults) onResults(indexed);
    } catch (error) {
      failed = failed || error;
    } finally {
      done += chunk.fens.length;
      if (onProgress) onProgress(Math.min(done, fens.length), fens.length);
    }
  };

  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(parallel, chunks.length)) }, async () => {
    while (cursor < chunks.length && !failed) {
      const chunk = chunks[cursor];
      cursor += 1;
      await runChunk(chunk);
    }
  });
  await Promise.all(workers);

  if (failed) {
    const error = new Error(failed.message || 'Engine analysis failed');
    error.status = failed.status;
    throw error;
  }

  return { scores, bestMoves };
}
