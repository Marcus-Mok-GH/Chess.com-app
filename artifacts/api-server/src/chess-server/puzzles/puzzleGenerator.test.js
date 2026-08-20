import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { generatePuzzle, validateGeneratedPuzzle } from "./puzzleGenerator.js";

describe("API procedural puzzle generator", () => {
  it("generates unique legal material tactics instead of cycling mate-in-one templates", () => {
    const puzzles = Array.from({ length: 40 }, (_, index) => generatePuzzle(index + 1));
    const positions = new Set(puzzles.map((puzzle) => puzzle.fen.split(" ")[0]));
    const themes = new Set(puzzles.map((puzzle) => puzzle.theme));

    for (const puzzle of puzzles) {
      expect(validateGeneratedPuzzle(puzzle)).toBe(true);
      expect(puzzle.type).toBe("tactics");
      const chess = new Chess(puzzle.fen);
      const move = chess.move(puzzle.solution);
      expect(move).toBeTruthy();
      expect(chess.isCheckmate()).toBe(false);
      expect(Boolean(move.captured || move.promotion || move.san.includes("+"))).toBe(true);
    }

    expect(positions.size).toBe(40);
    expect(themes.size).toBeGreaterThan(1);
  }, 30000);
});
