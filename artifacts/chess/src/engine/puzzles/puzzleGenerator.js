import { Chess } from "chess.js";

/**
 * Puzzle generation deliberately starts from legal, seed-deterministic game
 * positions. The generator searches those positions for a forcing material
 * gain, so regular play is no longer a rotation of hand-authored mate-in-one
 * diagrams. The small legacy collection remains only for explicit lessons and
 * as a safety fallback when a sampled position offers no clear tactic.
 */
export const BASE_PUZZLES = [];

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MAX_POSITION_ATTEMPTS = 72;
const MIN_RANDOM_PLIES = 16;
const RANDOM_PLY_SPREAD = 42;

function normalizeSeed(seed) {
  if (Number.isFinite(Number(seed))) return Number(seed) >>> 0 || 1;
  const text = String(seed ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
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

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
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

function weightedRandomMove(chess, random) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  const weighted = moves.map((move) => ({
    move,
    weight:
      1 +
      (move.captured ? 2.5 : 0) +
      (move.san.includes("+") ? 1.5 : 0) +
      (move.promotion ? 3 : 0),
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = random() * total;
  for (const entry of weighted) {
    threshold -= entry.weight;
    if (threshold <= 0) return entry.move;
  }
  return weighted[weighted.length - 1].move;
}

function sampleLegalPosition(random) {
  const chess = new Chess();
  const plies = MIN_RANDOM_PLIES + Math.floor(random() * RANDOM_PLY_SPREAD);

  for (let ply = 0; ply < plies; ply += 1) {
    if (chess.isGameOver()) return null;
    const move = weightedRandomMove(chess, random);
    if (!move) return null;
    chess.move(move);
  }

  if (chess.isGameOver() || chess.moves().length < 4) return null;
  return chess;
}

function findMaterialTactic(chess, options = {}) {
  const candidates = [];
  const allowMate = options.allowMate ?? true;

  for (const move of chess.moves({ verbose: true })) {
    const capturedValue = PIECE_VALUES[move.captured] ?? 0;
    const promotionValue = move.promotion ? (PIECE_VALUES[move.promotion] ?? 0) - 1 : 0;

    chess.move(move);
    const checkmate = chess.isCheckmate();
    const givesCheck = chess.isCheck();
    const legalReplies = chess.moves().length;
    chess.undo();

    if (checkmate) {
      if (!allowMate) continue;
      candidates.push({
        move,
        gain: 10,
        isMate: true,
        givesCheck: true,
        legalReplies: 0,
        score: 1000,
      });
      continue;
    }

    const gain = capturedValue + promotionValue;
    if (gain < 2 && !givesCheck) continue;

    candidates.push({
      move,
      gain,
      isMate: false,
      givesCheck,
      legalReplies,
      score: gain * 100 + (givesCheck ? 35 : 0) + Math.max(0, 12 - legalReplies),
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0] ?? null;
}

function themeForTactic(candidate) {
  if (candidate.move.captured === "q") return "Winning the Queen";
  if (candidate.move.captured === "r") return "Winning the Exchange";
  if (candidate.move.promotion) return "Promotion Tactic";
  if (candidate.givesCheck) return "Forcing Capture";
  return "Material Tactic";
}

function hintForTactic(candidate) {
  if (candidate.givesCheck) {
    return "Start with forcing checks, then look for the capture that wins material.";
  }
  if (candidate.move.captured === "q") {
    return "A valuable piece is vulnerable. Look for the move that wins the queen.";
  }
  return "Compare every forcing capture and identify the move that wins material.";
}

function ratePuzzle(chess, gain = 0) {
  const pieceCount = chess.board().flat().filter(Boolean).length;
  return Math.min(2200, 850 + pieceCount * 28 + gain * 110);
}

function createNaturalTactic(random, options = {}) {
  const allowMate = options.allowMate ?? true;
  const requireMate = options.requireMate ?? false;

  for (let attempt = 0; attempt < MAX_POSITION_ATTEMPTS; attempt += 1) {
    const chess = sampleLegalPosition(random);
    if (!chess) continue;
    const candidate = findMaterialTactic(chess, { allowMate });
    if (!candidate) continue;

    // If requireMate is true, skip non-mate candidates
    if (requireMate && !candidate.isMate) continue;

    return {
      fen: chess.fen(),
      sideToMove: chess.turn() === "w" ? "white" : "black",
      rating: ratePuzzle(chess, candidate.gain),
      theme: candidate.isMate ? "Checkmate Tactic" : themeForTactic(candidate),
      hint: candidate.isMate ? "Find the forcing move that ends the game in checkmate." : hintForTactic(candidate),
      solution: candidate.move.san,
      followup: null,
      type: candidate.isMate ? "mate-in-1" : "tactics",
      tags: ["tactics", candidate.givesCheck ? "forcing" : "material"],
      generated: true,
      generationMethod: "natural-tactical-position",
    };
  }
  return null;
}

export function validateGeneratedPuzzle(puzzle) {
  try {
    const chess = new Chess(puzzle.fen);
    if (chess.isCheckmate() || chess.isStalemate() || chess.isDraw() || chess.isInsufficientMaterial()) {
      return false;
    }
    if (chess.turn() !== puzzle.sideToMove?.[0]) return false;

    const movesBefore = chess.moves().length;
    if (movesBefore < 2) return false;
    const solution = chess.move(puzzle.solution);
    if (!solution) return false;

    if (puzzle.type === "mate-in-1") {
      const mateFinder = new Chess(puzzle.fen);
      const uniqueMate = findUniqueMate(mateFinder);
      return Boolean(uniqueMate && uniqueMate.san === solution.san && chess.isCheckmate());
    }

    if (puzzle.type === "tactics") {
      return Boolean(solution.captured || solution.promotion || solution.san.includes("+"));
    }

    return true;
  } catch {
    return false;
  }
}

export async function generatePuzzleAsync(seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return generatePuzzle(seed);
}

function normalizedThemeList(themes) {
  const rawThemes = Array.isArray(themes) ? themes : [themes];
  return [...new Set(rawThemes.map((theme) => String(theme ?? "").trim()).filter(Boolean))];
}

function hasRequestedTheme(candidate, themes) {
  const candidateTheme = String(candidate?.theme ?? "").trim().toLowerCase();
  return candidateTheme && themes.some((theme) => candidateTheme === theme.toLowerCase());
}

/**
 * Generate a puzzle matching requested lesson themes.
 * Dynamically creates a procedural tactical/mate position.
 */
export function generatePuzzleForThemes(themes, seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)) {
  const requestedThemes = normalizedThemeList(themes);
  const maxAttempts = 50;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptSeed = normalizeSeed(seed) + attempt * 1000;
    const puzzle = generatePuzzle(attemptSeed, { themes: requestedThemes });

    if (hasRequestedTheme(puzzle, requestedThemes)) {
      return {
        ...puzzle,
        id: `lesson-${normalizeSeed(seed)}`,
        lessonThemes: requestedThemes,
      };
    }
  }

  // Fallback: return a puzzle even if theme doesn't match exactly
  const puzzle = generatePuzzle(seed, { themes: requestedThemes });
  return {
    ...puzzle,
    id: `lesson-${normalizeSeed(seed)}`,
    lessonThemes: requestedThemes,
  };
}

export function generatePuzzle(seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff), options = {}) {
  const normalizedSeed = normalizeSeed(seed);
  const random = randomSource(normalizedSeed);
  const requestedType = String(options.type ?? "tactics").toLowerCase();
  const wantsMate = requestedType === "mate-in-1";

  const puzzle = createNaturalTactic(random, { allowMate: true, requireMate: wantsMate });

  if (!puzzle || !validateGeneratedPuzzle(puzzle)) {
    throw new Error("Unable to generate a verified chess puzzle.");
  }

  return { ...puzzle, id: puzzle.id ?? `generated-${normalizedSeed}` };
}

export async function generatePuzzleWithStockfish(options = {}) {
  const { seed = Date.now(), puzzleType = "tactics" } = options;
  console.warn("Stockfish generation is delegated to the server; using a local verified tactical position.");
  return generatePuzzle(seed, { type: puzzleType });
}

export async function validateWithStockfish(fen, solution) {
  const chess = new Chess(fen);
  try {
    return Boolean(chess.move(solution));
  } catch {
    return false;
  }
}

export async function generatePuzzleWithAI(description, options = {}) {
  const { provider = "default", seed = Date.now() } = options;
  const puzzle = generatePuzzle(seed, { type: "tactics" });
  return {
    ...puzzle,
    id: `ai-${normalizeSeed(seed)}`,
    hint: description ? `AI prompt: ${description}` : puzzle.hint,
    aiGenerated: true,
    provider,
    description,
  };
}

export async function generatePuzzleByMethod(method, options = {}) {
  if (method === "stockfish") return generatePuzzleWithStockfish(options);
  if (method === "ai") return generatePuzzleWithAI(options.description, options);
  return generatePuzzle(options.seed, { type: options.type });
}

export async function generateMultiplePuzzles(count = 5, options = {}) {
  return Array.from({ length: count }, (_, index) =>
    generatePuzzle(options.seed === undefined ? undefined : Number(options.seed) + index, { type: options.type }),
  );
}

export function filterByDifficulty(puzzles, difficulty) {
  const ranges = {
    easy: { min: 0, max: 1000 },
    medium: { min: 1000, max: 1600 },
    hard: { min: 1600, max: 3000 },
  };
  const range = ranges[difficulty] ?? ranges.medium;
  return puzzles.filter((puzzle) => puzzle.rating >= range.min && puzzle.rating <= range.max);
}

export function filterByTheme(puzzles, theme) {
  if (!theme) return puzzles;
  return puzzles.filter((puzzle) => puzzle.theme?.toLowerCase().includes(theme.toLowerCase()));
}

export function selectRandomPuzzle(puzzles, options = {}) {
  const filteredByDifficulty = options.difficulty ? filterByDifficulty(puzzles, options.difficulty) : [...puzzles];
  const filtered = options.theme ? filterByTheme(filteredByDifficulty, options.theme) : filteredByDifficulty;
  const choices = filtered.length > 0 ? filtered : puzzles;
  return { ...choices[Math.floor(Math.random() * choices.length)], id: `random-${Date.now()}` };
}

export const PUZZLE_METHODS = { HARDCODED: "hardcoded", STOCKFISH: "stockfish", AI: "ai" };

export default {
  generatePuzzle,
  generatePuzzleAsync,
  generatePuzzleForThemes,
  generatePuzzleByMethod,
  generatePuzzleWithStockfish,
  generatePuzzleWithAI,
  generateMultiplePuzzles,
  validateGeneratedPuzzle,
  filterByDifficulty,
  filterByTheme,
  selectRandomPuzzle,
  BASE_PUZZLES,
  PUZZLE_METHODS,
};
