import { Chess } from 'chess.js';

function looksLikePgn(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('[')) return true;
  return /\d+\.(\.\.)?\s/.test(trimmed);
}

function parsePgnToSan(pgn) {
  if (!looksLikePgn(pgn)) return null;
  try {
    const game = new Chess();
    const ok = game.loadPgn(pgn);
    if (!ok) return null;
    return game.history();
  } catch {
    return null;
  }
}

function parseMoveEntry(entry) {
  if (!entry) return entry;

  if (typeof entry === 'object') {
    return entry;
  }

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return entry;
      }
    }
    return entry;
  }

  return entry;
}

function parsePgTextArrayLiteral(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const items = [];
  let current = '';
  let inQuotes = false;
  let escape = false;

  for (let i = 1; i < trimmed.length - 1; i += 1) {
    const ch = trimmed[i];

    if (escape) {
      current += ch;
      escape = false;
      continue;
    }

    if (ch === '\\') {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ',') {
      items.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  items.push(current);
  return items;
}

export function normalizeMoveHistory(history) {
  if (!history) return [];

  let raw = history;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      const parsedArray = parsePgTextArrayLiteral(raw);
      if (parsedArray) {
        raw = parsedArray;
      } else {
        const pgnMoves = parsePgnToSan(raw);
        return pgnMoves || [];
      }
    }
  }

  if (!Array.isArray(raw)) return [];

  if (raw.length === 1 && typeof raw[0] === 'string') {
    const pgnMoves = parsePgnToSan(raw[0]);
    if (pgnMoves && pgnMoves.length > 0) {
      return pgnMoves;
    }
  }

  return raw.map(parseMoveEntry);
}

export function getSanFromEntry(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object') return entry.san || '';
  return '';
}

export function getMoveFromEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  if (typeof entry !== 'object') return null;

  if (entry.from && entry.to) {
    return {
      from: entry.from,
      to: entry.to,
      promotion: entry.promotion || 'q',
    };
  }

  if (entry.san) return entry.san;
  return null;
}

export function toDetailedMoveHistory(history) {
  const normalized = normalizeMoveHistory(history);
  return normalized
    .map((entry) => {
      if (typeof entry === 'string') {
        return { san: entry };
      }
      if (entry && typeof entry === 'object') {
        return {
          san: entry.san,
          from: entry.from,
          to: entry.to,
          promotion: entry.promotion,
        };
      }
      return null;
    })
    .filter(Boolean);
}

export function toSanHistory(history) {
  const normalized = normalizeMoveHistory(history);
  const game = new Chess();
  const sanMoves = [];

  normalized.forEach((entry) => {
    const moveNotation = getMoveFromEntry(entry) || getSanFromEntry(entry);
    if (!moveNotation) return;

    try {
      const move = game.move(moveNotation);
      if (move?.san) {
        sanMoves.push(move.san);
      }
    } catch {
      // Ignore invalid moves
    }
  });

  return sanMoves;
}

export function buildGameFromHistory(history, fallbackFen = null) {
  const game = new Chess();
  const normalized = normalizeMoveHistory(history);

  for (const entry of normalized) {
    const move = getMoveFromEntry(entry) || getSanFromEntry(entry);
    if (!move) continue;

    try {
      const applied = game.move(move);
      if (!applied) break;
    } catch {
      break;
    }
  }

  if (fallbackFen && game.fen() !== fallbackFen) {
    try {
      return new Chess(fallbackFen);
    } catch {
      return game;
    }
  }

  return game;
}

export function toStoredMoveHistory(history) {
  return normalizeMoveHistory(history)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') return JSON.stringify(entry);
      return null;
    })
    .filter(Boolean);
}
