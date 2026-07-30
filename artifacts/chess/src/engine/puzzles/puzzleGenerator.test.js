import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { generatePuzzle, validateGeneratedPuzzle } from "./puzzleGenerator.js";

describe("procedural puzzle generator", () => {
  it.each([1, 42, 20260727])(
    "creates a legal, unique mate-in-one for seed %s",
    (seed) => {
      const puzzle = generatePuzzle(seed);
      expect(puzzle.generated).toBe(true);
      expect(validateGeneratedPuzzle(puzzle)).toBe(true);
    },
  );

  it("is reproducible for a given seed", () => {
    expect(generatePuzzle(12345)).toEqual(generatePuzzle(12345));
  });

  it("creates materially different positions across a session", () => {
    const puzzles = Array.from({ length: 40 }, (_, index) =>
      generatePuzzle(index + 1),
    );
    const positions = new Set(
      puzzles.map((puzzle) => puzzle.fen.split(" ")[0]),
    );
    const pieceLayouts = new Set(
      puzzles.map((puzzle) => puzzle.fen.split(" ")[0].replace(/[1-8/]/g, "")),
    );
    const themes = new Set(puzzles.map((puzzle) => puzzle.theme));
    const matingPieces = new Set(
      puzzles.map((puzzle) => {
        const chess = new Chess(puzzle.fen);
        return chess.move(puzzle.solution).piece;
      }),
    );

    expect(positions.size).toBe(40);
    expect(pieceLayouts.size).toBeGreaterThan(20);
    expect(themes.size).toBeGreaterThan(2);
    expect(matingPieces).toEqual(new Set(["q", "r", "b", "n", "p"]));
  }, 30000);
});
