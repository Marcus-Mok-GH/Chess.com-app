import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  generatePuzzle,
  generatePuzzleForThemes,
  validateGeneratedPuzzle,
} from "./puzzleGenerator.js";

describe("procedural tactical puzzle generator", () => {
  it.each([1, 42, 20260727])(
    "creates a legal material tactic for seed %s",
    (seed) => {
      const puzzle = generatePuzzle(seed);
      const chess = new Chess(puzzle.fen);
      const solution = chess.move(puzzle.solution);

      expect(puzzle.generated).toBe(true);
      expect(puzzle.type).toBe("tactics");
      expect(validateGeneratedPuzzle(puzzle)).toBe(true);
      expect(solution).toBeTruthy();
      expect(chess.isCheckmate()).toBe(false);
      expect(Boolean(solution.captured || solution.promotion || solution.san.includes("+"))).toBe(true);
    },
  );

  it("is reproducible for a given seed", () => {
    expect(generatePuzzle(12345)).toEqual(generatePuzzle(12345));
  });

  it("preserves explicit mate-in-one lesson themes", () => {
    const themes = ["Knight Ambush", "Knight-Supported Queen"];
    const puzzle = generatePuzzleForThemes(themes, 20260820);

    expect(validateGeneratedPuzzle(puzzle)).toBe(true);
    expect(themes).toContain(puzzle.theme);
    expect(puzzle.type).toBe("mate-in-1");
    expect(puzzle.generationMethod).toBe("lesson-theme");
    expect(puzzle.lessonThemes).toEqual(themes);
  });

  it("creates materially different natural positions across a session", () => {
    const puzzles = Array.from({ length: 40 }, (_, index) => generatePuzzle(index + 1));
    const positions = new Set(puzzles.map((puzzle) => puzzle.fen.split(" ")[0]));
    const themes = new Set(puzzles.map((puzzle) => puzzle.theme));
    const sideToMove = new Set(puzzles.map((puzzle) => puzzle.sideToMove));

    expect(positions.size).toBe(40);
    expect(themes.size).toBeGreaterThan(1);
    expect(sideToMove.size).toBe(2);
    expect(puzzles.every((puzzle) => puzzle.type === "tactics")).toBe(true);
  }, 30000);
});
