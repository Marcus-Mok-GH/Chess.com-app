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
});
