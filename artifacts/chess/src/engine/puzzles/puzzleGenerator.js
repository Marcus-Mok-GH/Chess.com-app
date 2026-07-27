import { Chess } from "chess.js";

export const BASE_PUZZLES = [
  {
    fen: "6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1",
    rating: 800,
    theme: "Back-rank Radar",
    hint: "The king has no escape square. Find the rook move that ends the game.",
  },
  {
    fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1",
    rating: 1200,
    theme: "Smothered Finish",
    hint: "The king is boxed in by its own pieces. Find the knight mate.",
  },
  {
    fen: "6k1/6pp/8/8/2B5/8/8/3R2K1 w - - 0 1",
    rating: 1000,
    theme: "Rook and Bishop Net",
    hint: "The bishop seals one diagonal. Find the rook's finishing square.",
  },
  {
    fen: "6k1/5ppp/8/8/4B3/8/8/3Q2K1 w - - 0 1",
    rating: 900,
    theme: "Diagonal Lock",
    hint: "Use the bishop's control to deliver mate with the queen.",
  },
  {
    fen: "7k/5ppp/8/8/8/5N2/8/3Q2K1 w - - 0 1",
    rating: 1100,
    theme: "Knight-Supported Queen",
    hint: "The knight guards the key square. Find the queen mate.",
  },
];

function normalizeSeed(seed) {
  const value = Number.isFinite(Number(seed))
    ? Number(seed)
    : Date.now() ^ Math.floor(Math.random() * 0xffffffff);
  return value >>> 0 || 1;
}

function randomSource(seed) {
  let state = normalizeSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function transformedFen(fen, mirrorFiles, flipColors) {
  const source = new Chess(fen);
  const target = new Chess();
  target.clear();

  for (const row of source.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const fileIndex = piece.square.charCodeAt(0) - 97;
      const rank = Number(piece.square[1]);
      const transformedFile = mirrorFiles ? 7 - fileIndex : fileIndex;
      const transformedRank = flipColors ? 9 - rank : rank;
      target.put(
        {
          type: piece.type,
          color: flipColors ? (piece.color === "w" ? "b" : "w") : piece.color,
        },
        `${String.fromCharCode(97 + transformedFile)}${transformedRank}`,
      );
    }
  }

  const turn = flipColors ? (source.turn() === "w" ? "b" : "w") : source.turn();
  const parts = target.fen().split(" ");
  return `${parts[0]} ${turn} - - 0 1`;
}

function findUniqueMate(chess) {
  let matingMove = null;
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    const isMate = chess.isCheckmate();
    chess.undo();
    if (!isMate) continue;
    if (matingMove) return null;
    matingMove = move;
  }
  return matingMove;
}

export function validateGeneratedPuzzle(puzzle) {
  try {
    const chess = new Chess(puzzle.fen);
    const matingMove = findUniqueMate(chess);
    if (!matingMove || chess.turn() !== puzzle.sideToMove[0]) return false;
    const solution = chess.move(puzzle.solution);
    return solution.san === matingMove.san && chess.isCheckmate();
  } catch {
    return false;
  }
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function randomSquare(random, used, pieceType) {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const minimumRank = pieceType === "p" ? 2 : 1;
    const rankCount = pieceType === "p" ? 6 : 8;
    const square = `${String.fromCharCode(97 + Math.floor(random() * 8))}${minimumRank + Math.floor(random() * rankCount)}`;
    if (!used.has(square)) {
      used.add(square);
      return square;
    }
  }
  return null;
}

function composePuzzle(random) {
  const majorPieces = ["q", "r", "b", "n"];
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const chess = new Chess();
    chess.clear();
    const used = new Set();
    const pieces = [
      { type: "k", color: "w" },
      { type: "k", color: "b" },
      { type: pick(random, majorPieces), color: "w" },
      { type: pick(random, majorPieces), color: "w" },
    ];
    const extraPieces = Math.floor(random() * 4);
    for (let index = 0; index < extraPieces; index += 1) {
      pieces.push({
        type: random() < 0.6 ? "p" : pick(random, majorPieces),
        color: random() < 0.72 ? "b" : "w",
      });
    }

    let placed = true;
    for (const piece of pieces) {
      const square = randomSquare(random, used, piece.type);
      if (!square || !chess.put(piece, square)) {
        placed = false;
        break;
      }
    }
    if (!placed) continue;

    try {
      const parts = chess.fen().split(" ");
      parts[1] = "w";
      parts[2] = "-";
      parts[3] = "-";
      parts[4] = "0";
      parts[5] = "1";
      chess.load(parts.join(" "));
      const blackKing = chess
        .board()
        .flat()
        .find((piece) => piece?.type === "k" && piece.color === "b");
      if (
        chess.isCheck() ||
        !blackKing ||
        chess.isAttacked(blackKing.square, "w") ||
        chess.isGameOver()
      ) {
        continue;
      }
      if (!findUniqueMate(chess)) continue;
      return { fen: chess.fen() };
    } catch {
      continue;
    }
  }
  return null;
}

function themeForMove(move) {
  return (
    {
      q: "Queen Net",
      r: "Rook Finish",
      b: "Diagonal Strike",
      n: "Knight Ambush",
      p: "Pawn Breakthrough",
    }[move.piece] ?? "Mate in One"
  );
}

function hintForMove(move) {
  return (
    {
      q: "Use the queen's reach to cover every escape square.",
      r: "Find the rook line that leaves the king nowhere to run.",
      b: "Look along the diagonals for a decisive finish.",
      n: "A knight jump can cover the king's remaining escape squares.",
      p: "A pawn move can deliver the final check.",
    }[move.piece] ?? "Find the only move that delivers checkmate."
  );
}

function ratePuzzle(chess) {
  const pieceCount = chess.board().flat().filter(Boolean).length;
  return Math.min(1500, 700 + pieceCount * 75);
}

export function generatePuzzle(
  seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff),
) {
  const normalizedSeed = normalizeSeed(seed);
  const random = randomSource(normalizedSeed);
  const composed = composePuzzle(random);
  const base =
    composed ?? BASE_PUZZLES[Math.floor(random() * BASE_PUZZLES.length)];
  const mirrorFiles = random() >= 0.5;
  const flipColors = random() >= 0.5;
  const fen = transformedFen(base.fen, mirrorFiles, flipColors);
  const chess = new Chess(fen);
  const mate = findUniqueMate(chess);

  if (!mate) throw new Error("Unable to generate a verified chess puzzle.");

  const puzzle = {
    id: `generated-${normalizedSeed}`,
    fen,
    sideToMove: chess.turn() === "w" ? "white" : "black",
    rating: base.rating ?? ratePuzzle(chess),
    theme: base.theme ?? themeForMove(mate),
    hint: base.hint ?? hintForMove(mate),
    solution: mate.san,
    followup: null,
    generated: true,
  };

  if (!validateGeneratedPuzzle(puzzle)) {
    throw new Error("Generated puzzle did not pass legality checks.");
  }

  return puzzle;
}
