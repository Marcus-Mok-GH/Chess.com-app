import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("./puzzleGenerator", () => ({
  generatePuzzleForThemes: vi.fn((themes, seed) => ({
    id: `sync-${seed}`,
    themes,
  })),
}));

// Each test re-imports the client after a module reset so worker state
// (a singleton worker plus its "unavailable" flag) is fresh per test.
async function freshClient() {
  vi.resetModules();
  const module = await import("./puzzleWorkerClient");
  return module.generatePuzzleForThemesAsync;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("generatePuzzleForThemesAsync", () => {
  it("generates in the worker and resolves the matching request id", async () => {
    class FakeWorker {
      constructor(url, options) {
        this.url = url;
        this.options = options;
        this.postMessageCalls = [];
      }
      postMessage(data) {
        this.postMessageCalls.push(data);
        // Echo a puzzle tagged with the request id, asynchronously.
        queueMicrotask(() => {
          this.onmessage({ data: { id: data.id, puzzle: { id: `worker-${data.id}`, seed: data.seed } } });
        });
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", FakeWorker);

    const generate = await freshClient();
    const puzzle = await generate(["fork"], 42, { difficulty: "easy" });

    expect(puzzle).toEqual({ id: "worker-1", seed: 42 });
    const { generatePuzzleForThemes } = await import("./puzzleGenerator");
    expect(generatePuzzleForThemes).not.toHaveBeenCalled();
  });

  it("falls back to synchronous generation when Worker is unavailable", async () => {
    const generate = await freshClient();
    const puzzle = await generate(["pin"], 7, { difficulty: "intermediate" });

    expect(puzzle).toEqual({ id: "sync-7", themes: ["pin"] });
    const { generatePuzzleForThemes } = await import("./puzzleGenerator");
    expect(generatePuzzleForThemes).toHaveBeenCalledWith(["pin"], 7, {
      difficulty: "intermediate",
    });
  });

  it("rejects the caller and falls back after the worker errors", async () => {
    class CrashingWorker {
      constructor() {}
      postMessage() {
        queueMicrotask(() => {
          this.onerror({ message: "script error" });
        });
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", CrashingWorker);

    const generate = await freshClient();
    await expect(generate(["fork"], 1)).rejects.toThrow("script error");

    // After the crash the client must not respawn the worker; the next
    // request goes through the synchronous fallback instead.
    const { generatePuzzleForThemes } = await import("./puzzleGenerator");
    const puzzle = await generate(["fork"], 2);
    expect(puzzle).toEqual({ id: "sync-2", themes: ["fork"] });
  });

  it("surfaces generator errors thrown inside the worker", async () => {
    const { generatePuzzleForThemes } = await import("./puzzleGenerator");
    generatePuzzleForThemes.mockImplementation(() => {
      throw new Error("no tactic found");
    });
    class FailingWorker {
      postMessage(data) {
        queueMicrotask(() => {
          this.onmessage({ data: { id: data.id, error: "no tactic found" } });
        });
      }
      terminate() {}
    }
    vi.stubGlobal("Worker", FailingWorker);

    const generate = await freshClient();
    await expect(generate(["fork"], 3)).rejects.toThrow("no tactic found");
  });
});
