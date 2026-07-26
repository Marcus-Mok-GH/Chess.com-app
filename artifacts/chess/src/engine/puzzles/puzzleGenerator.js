import { Chess } from "chess.js";

const BASE_PUZZLES = [
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

export function generatePuzzle(
  seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff),
) {
  const normalizedSeed = normalizeSeed(seed);
  const random = randomSource(normalizedSeed);
  const base = BASE_PUZZLES[Math.floor(random() * BASE_PUZZLES.length)];
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
    rating: base.rating,
    theme: base.theme,
    hint: base.hint,
    solution: mate.san,
    followup: null,
    generated: true,
  };

  if (!validateGeneratedPuzzle(puzzle)) {
    throw new Error("Generated puzzle did not pass legality checks.");
  }

  return puzzle;
}
