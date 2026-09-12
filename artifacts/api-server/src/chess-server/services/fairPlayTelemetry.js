const MAX_THINK_TIME_MS = 60 * 60 * 1000;
const MAX_HIDDEN_TIME_MS = 60 * 60 * 1000;
const MAX_FOCUS_LOSSES = 100;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sanitizeFairPlaySignals(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const normalized = {};
  const thinkTimeMs = numberOrNull(value.thinkTimeMs);
  const hiddenMs = numberOrNull(value.hiddenMs);
  const focusLosses = numberOrNull(value.focusLosses);
  if (thinkTimeMs !== null) normalized.thinkTimeMs = Math.round(clamp(thinkTimeMs, 0, MAX_THINK_TIME_MS));
  if (hiddenMs !== null) normalized.hiddenMs = Math.round(clamp(hiddenMs, 0, MAX_HIDDEN_TIME_MS));
  if (focusLosses !== null) normalized.focusLosses = Math.round(clamp(focusLosses, 0, MAX_FOCUS_LOSSES));
  if (value.visibility === 'hidden' || value.visibility === 'visible') normalized.visibility = value.visibility;
  return Object.keys(normalized).length ? normalized : null;
}

export function withFairPlayMetadata(move, { playerId, signals, serverTimestamp = Date.now() } = {}) {
  const decorated = {
    ...move,
    playerId: playerId == null ? null : String(playerId),
    serverTimestamp: Math.trunc(Number(serverTimestamp)) || Date.now(),
  };
  const normalized = sanitizeFairPlaySignals(signals);
  if (normalized) decorated.fairPlaySignals = normalized;
  return decorated;
}

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function standardDeviation(values, mean) {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function buildTimingMetrics(moves) {
  const safeMoves = Array.isArray(moves) ? moves : [];
  const clientTimes = safeMoves
    .map(move => numberOrNull(move?.fairPlaySignals?.thinkTimeMs))
    .filter(value => value !== null);
  const serverTimestamps = safeMoves
    .map(move => numberOrNull(move?.serverTimestamp))
    .filter(value => value !== null)
    .sort((a, b) => a - b);
  const serverIntervals = serverTimestamps.slice(1)
    .map((timestamp, index) => timestamp - serverTimestamps[index])
    .filter(value => value >= 0);
  const focusLosses = safeMoves.reduce((sum, move) => sum + (numberOrNull(move?.fairPlaySignals?.focusLosses) || 0), 0);
  const hiddenMs = safeMoves.reduce((sum, move) => sum + (numberOrNull(move?.fairPlaySignals?.hiddenMs) || 0), 0);
  const averageThinkTimeMs = clientTimes.length
    ? clientTimes.reduce((sum, value) => sum + value, 0) / clientTimes.length
    : null;
  const medianThinkTimeMs = median(clientTimes);
  const fastMoveRate = clientTimes.length
    ? clientTimes.filter(value => value <= 650).length / clientTimes.length
    : 0;
  const suspiciousScore = Math.round(clamp(
    (fastMoveRate * 30) + (medianThinkTimeMs !== null && medianThinkTimeMs <= 900 ? 12 : 0) +
      (focusLosses >= 3 ? 8 : 0) + (hiddenMs >= 5000 ? 4 : 0),
    0,
    50,
  ));

  return {
    observedMoves: clientTimes.length,
    hasClientTelemetry: clientTimes.length > 0 || focusLosses > 0 || hiddenMs > 0,
    averageThinkTimeMs: averageThinkTimeMs === null ? null : Number(averageThinkTimeMs.toFixed(2)),
    medianThinkTimeMs: medianThinkTimeMs === null ? null : Number(medianThinkTimeMs.toFixed(2)),
    thinkTimeStdDevMs: averageThinkTimeMs === null ? null : Number(standardDeviation(clientTimes, averageThinkTimeMs).toFixed(2)),
    fastMoveRate: Number(fastMoveRate.toFixed(4)),
    serverIntervalMedianMs: median(serverIntervals),
    focusLosses: Math.round(focusLosses),
    hiddenMs: Math.round(hiddenMs),
    suspiciousScore,
  };
}
