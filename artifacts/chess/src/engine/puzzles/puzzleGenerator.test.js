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

  it("preserves explicit lesson themes in generated puzzles", () => {
    const themes = ["Knight Ambush", "Knight-Supported Queen"];
    const puzzle = generatePuzzleForThemes(themes, 20260820);

    expect(validateGeneratedPuzzle(puzzle)).toBe(true);
    expect(puzzle.lessonThemes).toEqual(themes);
  });

  it("generates puzzles matching requested theme", () => {
    // Test with a theme that should be findable in generated puzzles
    const requestedTheme = "Winning the Queen";
    const puzzle = generatePuzzleForThemes([requestedTheme], 20260821);

    expect(validateGeneratedPuzzle(puzzle)).toBe(true);
    expect(puzzle.lessonThemes).toContain(requestedTheme);
    // The puzzle's actual theme should match at least one requested theme
    const puzzleTheme = String(puzzle.theme ?? "").trim().toLowerCase();
    expect(puzzleTheme).toBe(requestedTheme.toLowerCase());
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

  it("generates mate-in-1 puzzles when requested", () => {
    const puzzle = generatePuzzle(20260822, { type: "mate-in-1" });

    expect(validateGeneratedPuzzle(puzzle)).toBe(true);
    expect(puzzle.type).toBe("mate-in-1");

    // Verify it's actually a checkmate
    const chess = new Chess(puzzle.fen);
    const solution = chess.move(puzzle.solution);
    expect(solution).toBeTruthy();
    expect(chess.isCheckmate()).toBe(true);
  }, 30000);
});
