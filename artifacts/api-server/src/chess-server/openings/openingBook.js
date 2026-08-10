/**
 * Opening Explorer book
 *
 * Embedded, single source of truth for the Opening Explorer. The tree is
 * authored as SAN move sequences from the standard chess starting position and
 * is flattened into:
 *
 *  - `roots`          — the top-level named openings shown on the explorer home
 *  - `childrenByFen`  — parent position FEN -> legal continuations from the book
 *  - `positionByFen`  — FEN -> named book position (eco/name/pgn/stats)
 *
 * Every SAN is validated with chess.js as the tree is built, so an illegal move
 * in the dataset fails fast at module load instead of leaking to the API. The
 * API layer re-validates each child SAN before emitting it (`legalChildren`).
 */

import { Chess } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Tree definition. Each node:
 *   eco        — ECO code (e.g. "C30")
 *   name       — human readable opening name (omitted for unnamed transpositions)
 *   moves      — SAN sequence that reaches this position from its parent
 *   stats      — { moves, whiteWins, draws, blackWins } plausible totals (may be null/zero)
 *   root       — include this node in the roots listing
 *   children   — deeper variations
 */
const TREE = [
  {
    eco: 'A00',
    name: 'Starting Position',
    moves: [],
    root: true,
    stats: { moves: 120000, whiteWins: 38200, draws: 27400, blackWins: 34400 },
    children: [
      {
        eco: 'B00',
        name: "King's Pawn Opening",
        moves: ['e4'],
        root: true,
        stats: { moves: 48000, whiteWins: 16200, draws: 11000, blackWins: 13900 },
        children: [
          {
            eco: 'B01',
            name: 'Scandinavian Defence',
            moves: ['d5'],
            root: true,
            stats: { moves: 4100, whiteWins: 1300, draws: 1000, blackWins: 1400 },
            children: [
              {
                eco: 'B01',
                name: 'Scandinavian Main Line',
                moves: ['exd5', 'Qxd5'],
                stats: { moves: 1800, whiteWins: 560, draws: 430, blackWins: 610 },
              },
              {
                eco: 'B01',
                name: 'Scandinavian Marshall Gambit',
                moves: ['exd5', 'Nf6'],
                stats: { moves: 620, whiteWins: 190, draws: 130, blackWins: 230 },
              },
            ],
          },
          {
            eco: 'B10',
            name: 'Caro-Kann Defence',
            moves: ['c6'],
            root: true,
            stats: { moves: 8800, whiteWins: 2700, draws: 2200, blackWins: 3000 },
            children: [
              {
                eco: 'B12',
                name: 'Caro-Kann Advance',
                moves: ['d4', 'd5', 'e5'],
                stats: { moves: 2100, whiteWins: 650, draws: 520, blackWins: 720 },
              },
              {
                eco: 'B13',
                name: 'Caro-Kann Exchange',
                moves: ['d4', 'd5', 'exd5', 'cxd5'],
                stats: { moves: 900, whiteWins: 300, draws: 220, blackWins: 290 },
              },
              {
                eco: 'B18',
                name: 'Caro-Kann Classical',
                moves: ['d4', 'd5', 'Nc3'],
                stats: { moves: 1400, whiteWins: 440, draws: 360, blackWins: 470 },
              },
            ],
          },
          {
            eco: 'C00',
            name: 'French Defence',
            moves: ['e6'],
            root: true,
            stats: { moves: 9500, whiteWins: 2900, draws: 2300, blackWins: 3200 },
            children: [
              {
                eco: 'C02',
                name: 'French Advance',
                moves: ['d4', 'd5', 'e5'],
                stats: { moves: 2400, whiteWins: 740, draws: 590, blackWins: 810 },
              },
              {
                eco: 'C03',
                name: 'French Tarrasch',
                moves: ['d4', 'd5', 'Nd2'],
                stats: { moves: 1900, whiteWins: 600, draws: 470, blackWins: 640 },
              },
              {
                eco: 'C15',
                name: 'French Winawer',
                moves: ['d4', 'd5', 'Nc3', 'Bb4'],
                stats: { moves: 1500, whiteWins: 430, draws: 360, blackWins: 540 },
              },
            ],
          },
          {
            eco: 'B20',
            name: 'Sicilian Defence',
            moves: ['c5'],
            root: true,
            stats: { moves: 22000, whiteWins: 6900, draws: 5200, blackWins: 7600 },
            children: [
              {
                eco: 'B22',
                name: 'Sicilian Alapin',
                moves: ['c3'],
                stats: { moves: 2800, whiteWins: 950, draws: 660, blackWins: 880 },
              },
              {
                eco: 'B23',
                name: 'Sicilian Closed',
                moves: ['Nc3'],
                stats: { moves: 1300, whiteWins: 420, draws: 310, blackWins: 420 },
              },
              {
                eco: 'B27',
                name: 'Sicilian Open',
                moves: ['Nf3'],
                stats: { moves: 11800, whiteWins: 3700, draws: 2800, blackWins: 4100 },
                children: [
                  {
                    eco: 'B80',
                    name: 'Sicilian Scheveningen',
                    moves: ['d6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e6'],
                    stats: { moves: 1900, whiteWins: 560, draws: 450, blackWins: 690 },
                  },
                  {
                    eco: 'B70',
                    name: 'Sicilian Dragon',
                    moves: ['d6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'],
                    stats: { moves: 2100, whiteWins: 620, draws: 480, blackWins: 770 },
                  },
                  {
                    eco: 'B90',
                    name: 'Sicilian Najdorf',
                    moves: ['d6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
                    stats: { moves: 4800, whiteWins: 1400, draws: 1150, blackWins: 1750 },
                  },
                ],
              },
            ],
          },
          {
            eco: 'C20',
            name: 'Open Game',
            moves: ['e5'],
            stats: { moves: 21000, whiteWins: 6900, draws: 4900, blackWins: 6400 },
            children: [
              {
                eco: 'C30',
                name: "King's Gambit",
                moves: ['f4'],
                root: true,
                stats: { moves: 3200, whiteWins: 980, draws: 720, blackWins: 1050 },
                children: [
                  {
                    eco: 'C33',
                    name: "King's Gambit Accepted",
                    moves: ['exf4'],
                    stats: { moves: 1500, whiteWins: 430, draws: 340, blackWins: 540 },
                  },
                  {
                    eco: 'C30',
                    name: "King's Gambit Declined",
                    moves: ['Bc5'],
                    stats: { moves: 520, whiteWins: 170, draws: 120, blackWins: 160 },
                  },
                ],
              },
              {
                eco: 'C60',
                name: 'Ruy Lopez',
                moves: ['Nf3', 'Nc6', 'Bb5'],
                root: true,
                stats: { moves: 18000, whiteWins: 6200, draws: 4900, blackWins: 4700 },
                children: [
                  {
                    eco: 'C65',
                    name: 'Ruy Lopez Berlin Defence',
                    moves: ['Nf6'],
                    stats: { moves: 6100, whiteWins: 1900, draws: 1800, blackWins: 1700 },
                  },
                  {
                    eco: 'C62',
                    name: 'Ruy Lopez Steinitz Defence',
                    moves: ['d6'],
                    stats: { moves: 1800, whiteWins: 610, draws: 490, blackWins: 470 },
                  },
                  {
                    eco: 'C78',
                    name: 'Ruy Lopez Morphy Defence',
                    moves: ['a6'],
                    stats: { moves: 7800, whiteWins: 2700, draws: 2200, blackWins: 1900 },
                  },
                ],
              },
              {
                eco: 'C50',
                name: 'Italian Game',
                moves: ['Nf3', 'Nc6', 'Bc4'],
                root: true,
                stats: { moves: 15000, whiteWins: 5200, draws: 4000, blackWins: 4100 },
                children: [
                  {
                    eco: 'C50',
                    name: 'Giuoco Piano',
                    moves: ['Bc5'],
                    stats: { moves: 4300, whiteWins: 1400, draws: 1150, blackWins: 1200 },
                  },
                  {
                    eco: 'C55',
                    name: 'Two Knights Defence',
                    moves: ['Nf6'],
                    stats: { moves: 3100, whiteWins: 1050, draws: 800, blackWins: 900 },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        eco: 'A40',
        name: "Queen's Pawn Opening",
        moves: ['d4'],
        root: true,
        stats: { moves: 44000, whiteWins: 16100, draws: 11900, blackWins: 12000 },
        children: [
          {
            eco: 'A45',
            name: 'Indian Defence',
            moves: ['Nf6'],
            root: true,
            stats: { moves: 19000, whiteWins: 6500, draws: 5200, blackWins: 5100 },
            children: [
              {
                eco: 'E60',
                name: "King's Indian Defence",
                moves: ['c4', 'g6', 'Nc3', 'Bg7'],
                stats: { moves: 5200, whiteWins: 1700, draws: 1500, blackWins: 1400 },
              },
              {
                eco: 'D80',
                name: "Grünfeld Defence",
                moves: ['c4', 'g6', 'Nc3', 'd5'],
                stats: { moves: 2100, whiteWins: 700, draws: 590, blackWins: 550 },
              },
              {
                eco: 'E20',
                name: 'Nimzo-Indian Defence',
                moves: ['c4', 'e6', 'Nc3', 'Bb4'],
                stats: { moves: 3100, whiteWins: 1000, draws: 900, blackWins: 850 },
              },
              {
                eco: 'E12',
                name: "Queen's Indian Defence",
                moves: ['c4', 'e6', 'Nf3', 'b6'],
                stats: null,
              },
            ],
          },
          {
            eco: 'D06',
            name: "Queen's Gambit",
            moves: ['d5', 'c4'],
            root: true,
            stats: { moves: 15000, whiteWins: 5400, draws: 4100, blackWins: 3600 },
            children: [
              {
                eco: 'D20',
                name: "Queen's Gambit Accepted",
                moves: ['dxc4'],
                stats: { moves: 2300, whiteWins: 850, draws: 610, blackWins: 540 },
              },
              {
                eco: 'D30',
                name: "Queen's Gambit Declined",
                moves: ['e6'],
                stats: { moves: 4800, whiteWins: 1700, draws: 1300, blackWins: 1150 },
              },
              {
                eco: 'D10',
                name: 'Slav Defence',
                moves: ['c6'],
                stats: { moves: 3600, whiteWins: 1250, draws: 980, blackWins: 880 },
              },
            ],
          },
          {
            eco: 'D02',
            name: 'London System',
            moves: ['d5', 'Bf4'],
            root: true,
            stats: { moves: 8000, whiteWins: 2900, draws: 2100, blackWins: 2000 },
            children: [
              {
                eco: 'D02',
                name: 'London System Main Line',
                moves: ['Nf6', 'e3'],
                stats: { moves: 2400, whiteWins: 870, draws: 630, blackWins: 600 },
              },
              {
                eco: 'D02',
                name: 'London System · c5 Setup',
                moves: ['c5'],
                stats: { moves: 0, whiteWins: 0, draws: 0, blackWins: 0 },
              },
            ],
          },
        ],
      },
      {
        eco: 'A10',
        name: 'English Opening',
        moves: ['c4'],
        root: true,
        stats: { moves: 13000, whiteWins: 4300, draws: 3400, blackWins: 3100 },
        children: [
          {
            eco: 'A20',
            name: "English King's Pawn Set",
            moves: ['e5'],
            stats: { moves: 3000, whiteWins: 1000, draws: 800, blackWins: 730 },
          },
          {
            eco: 'A30',
            name: 'English Symmetrical',
            moves: ['c5'],
            stats: { moves: 2600, whiteWins: 850, draws: 700, blackWins: 640 },
          },
          {
            eco: 'A15',
            name: 'English Indian Defence',
            moves: ['Nf6'],
            stats: null,
          },
        ],
      },
      {
        eco: 'A04',
        name: 'Reti Opening',
        moves: ['Nf3'],
        root: true,
        stats: { moves: 9000, whiteWins: 3000, draws: 2400, blackWins: 2100 },
        children: [
          {
            eco: 'A05',
            name: "Reti · King's Pawn Set",
            moves: ['d5'],
            stats: { moves: 1900, whiteWins: 640, draws: 510, blackWins: 460 },
          },
          {
            eco: 'A04',
            name: 'Reti · Symmetrical',
            moves: ['c5'],
            stats: { moves: 0, whiteWins: 0, draws: 0, blackWins: 0 },
          },
        ],
      },
    ],
  },
];

const childrenByFen = {};
const roots = [];
const positionByFen = new Map();

function build(startFen, defs, path) {
  for (const def of defs) {
    const pgn = [...path];
    let fen = startFen;
    for (const san of def.moves) {
      const chess = new Chess(fen);
      let move;
      try {
        move = chess.move(san);
      } catch (error) {
        throw new Error(
          `Opening book error: "${san}" is not a legal move from ${fen} (${def.name || 'unnamed node'})`
        );
      }
      pgn.push(move.san);
      fen = chess.fen();
    }

    const san = def.moves.length ? pgn[pgn.length - 1] : '';
    const entry = {
      eco: def.eco || null,
      name: def.name || null,
      fen,
      san,
      pgn: pgn.join(' '),
      stats: def.stats || null,
    };

    (childrenByFen[startFen] = childrenByFen[startFen] || []).push(entry);

    if (!positionByFen.has(fen)) {
      positionByFen.set(fen, {
        eco: entry.eco,
        name: entry.name,
        pgn: entry.pgn,
        stats: entry.stats,
      });
    }

    if (def.root) {
      roots.push({ ...entry, san: '' });
    }

    if (def.children) {
      build(fen, def.children, pgn);
    }
  }
}

build(START_FEN, TREE, []);

function normalizeFen(fen) {
  if (!fen || typeof fen !== 'string') return null;
  try {
    return new Chess(fen).fen();
  } catch {
    return null;
  }
}

function isLegalSan(fen, san) {
  try {
    new Chess(fen).move(san);
    return true;
  } catch {
    return false;
  }
}

/** Top-level named openings for the explorer home screen. */
export function getRoots() {
  return roots.map((root) => ({ ...root }));
}

/**
 * Legal continuations from a position FEN. Only moves that parse as legal from
 * the position are emitted; unknown or malformed FENs resolve to `[]`.
 */
export function legalChildren(fen) {
  const normalized = normalizeFen(fen);
  if (!normalized) return [];
  const entries = childrenByFen[normalized] || [];
  return entries
    .filter((entry) => isLegalSan(normalized, entry.san))
    .map((entry) => ({ ...entry, reachable: true }));
}

/** Named book position for a FEN, or null when the position is not in the book. */
export function getPosition(fen) {
  const normalized = normalizeFen(fen);
  if (!normalized) return null;
  return positionByFen.get(normalized) || null;
}

/** Case-insensitive substring search over opening names and ECO codes. */
export function searchOpenings(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const [fen, position] of positionByFen) {
    if (!position.name) continue;
    const name = position.name.toLowerCase();
    const eco = (position.eco || '').toLowerCase();
    if (name.includes(q) || eco.includes(q)) {
      results.push({ ...position, fen, san: '' });
    }
  }
  return results;
}
