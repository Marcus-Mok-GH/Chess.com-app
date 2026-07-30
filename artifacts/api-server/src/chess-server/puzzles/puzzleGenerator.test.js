import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { generatePuzzle, validateGeneratedPuzzle } from "./puzzleGenerator.js";

describe("API procedural puzzle generator", () => {
  it("generates 40 unique legal positions with eight solutions per mating piece", () => {
    const puzzles = Array.from({ length: 40 }, (_, index) =>
      generatePuzzle(index + 1),
    );
    const positions = new Set(puzzles.map((puzzle) => puzzle.fen.split(" ")[0]));
    const matingPieceCounts = Object.fromEntries(
      ["q", "r", "b", "n", "p"].map((piece) => [piece, 0]),
    );

    for (const puzzle of puzzles) {
      expect(validateGeneratedPuzzle(puzzle)).toBe(true);
      const chess = new Chess(puzzle.fen);
      const piece = chess.move(puzzle.solution).piece;
      matingPieceCounts[piece] += 1;
    }

    expect(positions.size).toBe(40);
    expect(matingPieceCounts).toEqual({ q: 8, r: 8, b: 8, n: 8, p: 8 });
  }, 30000);
});
