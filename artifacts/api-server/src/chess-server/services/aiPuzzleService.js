/**
 * AI Puzzle Service
 *
 * Generates chess puzzles from natural-language descriptions using an AI
 * provider. The provider returns a JSON object with a FEN position, the
 * side to move, and the solution move in SAN. We validate every field
 * with chess.js, and if anything is illegal or unparseable we fall back
 * to the procedural generator (so the AI method degrades gracefully).
 *
 * The default provider is Pollinations (keyless, OpenAI-compatible),
 * matching the coach route. Override via env:
 *   PUZZLE_AI_API_URL, PUZZLE_AI_MODEL, PUZZLE_AI_API_KEY
 */

import { Chess } from "chess.js";
import {
  generatePuzzle as generateProceduralPuzzle,
  validateGeneratedPuzzle,
} from "../puzzles/puzzleGenerator.js";

const PUZZLE_AI_API_URL =
  process.env.PUZZLE_AI_API_URL ||
  process.env.COACH_API_URL ||
  "https://text.pollinations.ai/openai/chat/completions";
const PUZZLE_AI_MODEL =
  process.env.PUZZLE_AI_MODEL || process.env.COACH_MODEL || "kimi-k3";
const PUZZLE_AI_API_KEY =
  process.env.PUZZLE_AI_API_KEY ||
  process.env.COACH_API_KEY ||
  process.env.FIREWORKS_API_KEY ||
  null;
const PUZZLE_AI_TIMEOUT_MS = parseInt(process.env.PUZZLE_AI_TIMEOUT_MS || "15000", 10);
const PUZZLE_AI_MAX_RETRIES = parseInt(process.env.PUZZLE_AI_MAX_RETRIES || "2", 10);

const SYSTEM_PROMPT = `You are a chess composer. Given a description, return a legal chess position where the side to move has exactly one clearly-best move (a tactic, ideally a forced win of material or mate). Respond ONLY with a compact JSON object, no prose, in this exact shape:
{"fen":"<FEN with side to move>","sideToMove":"white"|"black","solution":"<SAN move>","theme":"short label","hint":"one sentence"}
Constraints:
- The FEN must be a legal position loadable by chess.js.
- The solution SAN must be a legal move in that position for the side to move.
- Prefer a single decisive move (mate-in-1 or a winning tactic).`;

/**
 * Generate a puzzle via AI from a text description.
 *
 * @param {string} description - Natural-language request, e.g. "a smothered mate with a knight".
 * @param {object} [options] - { difficulty, type, seed, provider, userId }
 * @returns {Promise<object>} A valid puzzle object (AI-generated if the model output is legal, else a procedural fallback that still satisfies the request shape).
 */
export function isAIAvailable() {
  return Boolean(PUZZLE_AI_API_URL);
}

export async function generatePuzzleWithAI(description, options = {}) {
  const { difficulty = "medium", type = "tactics", seed, provider = "default" } = options;

  const userPrompt = buildUserPrompt(description, difficulty, type);
  let aiResult = null;
  try {
    aiResult = await callAI(userPrompt, provider);
  } catch (error) {
    console.warn("[AI Puzzle] Provider call failed:", error.message);
  }

  const puzzle = aiResult ? materialiseAIPuzzle(aiResult, description, difficulty, type, seed) : null;
  if (puzzle && validateGeneratedPuzzle(puzzle)) {
    return puzzle;
  }

  // Fallback: procedural generation, but tag it so callers/consumers know
  // the AI didn't produce a legal position.
  console.warn("[AI Puzzle] Model output illegal or unparseable; falling back to procedural generation.");
  try {
    const fallback = generateProceduralPuzzle(seed ?? Date.now());
    return { ...fallback, method: "ai-fallback", requestedMethod: "ai", aiDescription: description, aiGenerated: false };
  } catch (error) {
    throw new Error(`AI puzzle generation failed and procedural fallback errored: ${error.message}`);
  }
}

/**
 * Lower-level: call a specific AI provider. Currently only the
 * OpenAI-compatible endpoint (Pollinations/Fireworks) is wired, but the
 * signature leaves room for additional providers.
 */
export async function generateWithProvider(description, provider, options = {}) {
  return generatePuzzleWithAI(description, { ...options, provider });
}

/**
 * Validate a puzzle's FEN + solution using chess.js. Returns a boolean.
 */
export function validateAIPuzzle(puzzle) {
  if (!puzzle?.fen || !puzzle?.solution) return false;
  try {
    return validateGeneratedPuzzle(puzzle);
  } catch {
    return false;
  }
}

/**
 * Convert a puzzle to a human-readable description string.
 */
export function describeToSAN(puzzle) {
  if (!puzzle) return "";
  const parts = [];
  if (puzzle.theme) parts.push(puzzle.theme);
  if (puzzle.sideToMove) parts.push(`${puzzle.sideToMove} to move`);
  if (puzzle.solution) parts.push(`solution ${puzzle.solution}`);
  return parts.join(" - ");
}

export function generatePuzzleDescription(puzzle) {
  try {
    const parts = [];
    if (puzzle.theme) parts.push(`Theme: ${puzzle.theme}`);
    if (puzzle.sideToMove) parts.push(`${puzzle.sideToMove} to move`);
    if (puzzle.fen) parts.push(`FEN: ${puzzle.fen}`);
    if (puzzle.solution) parts.push(`Solution: ${puzzle.solution}`);
    return parts.join(" - ");
  } catch {
    return "Chess puzzle";
  }
}

// ---- internals -----------------------------------------------------------

function buildUserPrompt(description, difficulty, type) {
  const target =
    type === "mate-in-1"
      ? "a forced mate in one move"
      : type === "mate-in-2"
        ? "a forced mate in two moves"
        : "a winning tactical shot";
  const diff =
    difficulty === "easy"
      ? "simple"
      : difficulty === "hard" || difficulty === "expert"
        ? "advanced"
        : "intermediate";
  return `Compose ${diff} chess puzzle: ${target}.\nRequest: "${description || "a tactical combination"}"\nReturn only the JSON object described above.`;
}

async function callAI(userPrompt, _provider) {
  const headers = { "Content-Type": "application/json" };
  if (PUZZLE_AI_API_KEY) headers.Authorization = `Bearer ${PUZZLE_AI_API_KEY}`;

  let lastError;
  for (let attempt = 1; attempt <= PUZZLE_AI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PUZZLE_AI_TIMEOUT_MS);
    try {
      const response = await fetch(PUZZLE_AI_API_URL, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: PUZZLE_AI_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          stream: false,
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errText.slice(0, 200)}`);
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      return parseAIContent(content);
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      console.warn(`[AI Puzzle] Attempt ${attempt}/${PUZZLE_AI_MAX_RETRIES} failed: ${err.message}`);
      if (attempt < PUZZLE_AI_MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastError;
}

function parseAIContent(content) {
  if (!content) return null;
  // Extract the first JSON object from the response.
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

function materialiseAIPuzzle(ai, description, difficulty, type, seed) {
  if (!ai?.fen || !ai?.solution) return null;
  try {
    const chess = new Chess(ai.fen);
    const move = chess.move(ai.solution);
    if (!move) return null;
    const sideToMove = ai.sideToMove
      ? ai.sideToMove.toLowerCase().startsWith("w")
        ? "white"
        : "black"
      : chess.turn() === "w"
        ? "white"
        : "black";

    // Confirm the side-to-move matches the FEN's turn before Stockfish-style
    // validation. chess.js `move()` flips turn after applying, so we check the
    // pre-move turn.
    const turnBefore = new Chess(ai.fen).turn();
    const expectedSide = turnBefore === "w" ? "white" : "black";
    if (sideToMove !== expectedSide) return null;

    return {
      id: `ai-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      fen: ai.fen,
      sideToMove: expectedSide,
      rating: ratingForDifficulty(difficulty),
      theme: ai.theme || themeForType(type),
      hint: ai.hint || "Find the clearly best move.",
      solution: move.san,
      followup: null,
      generated: true,
      method: "ai",
      aiDescription: description,
      aiGenerated: true,
    };
  } catch {
    return null;
  }
}

function ratingForDifficulty(difficulty) {
  return { easy: 900, medium: 1300, hard: 1700, expert: 2100 }[difficulty] ?? 1300;
}

function themeForType(type) {
  return (
    {
      "mate-in-1": "Mate in One",
      "mate-in-2": "Mate in Two",
      tactics: "AI Tactical Composition",
      endgame: "AI Endgame Study",
      middlegame: "AI Middlegame Tactic",
    }[type] ?? "AI Composition"
  );
}

export default {
  generatePuzzleWithAI,
  generateWithProvider,
  validateAIPuzzle,
  describeToSAN,
  generatePuzzleDescription,
};
