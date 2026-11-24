/**
 * Shared shape for the daily-quota summaries returned by the puzzle and
 * review quota services: current usage plus the gate decision for the UI.
 *
 * @param {number} limit Daily allowance; `Infinity` means unlimited.
 * @param {number} used Amount consumed so far today.
 * @returns {{used: number, limit: number|null, remaining: number|null, unlimited: boolean, allowed: boolean, resetsAt: string}}
 */
export function buildUsageSummary(limit, used) {
  const unlimited = !Number.isFinite(limit);

  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);

  return {
    used,
    limit: unlimited ? null : limit,
    remaining: unlimited ? null : Math.max(0, limit - used),
    unlimited,
    allowed: unlimited || used < limit,
    resetsAt: tomorrow.toISOString(),
  };
}
