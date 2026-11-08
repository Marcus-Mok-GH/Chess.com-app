import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGameCore } from "./useGameCore";

vi.mock("../../../services/api", () => ({
    default: {
        postMove: vi.fn(),
        endOnlineGame: vi.fn(),
    },
}));

vi.mock("../../../utils/gamePersistence", () => ({
    loadOnlineGameState: vi.fn(() => null),
    saveOnlineGameState: vi.fn(),
    clearOnlineGameState: vi.fn(),
    clearOnlineSession: vi.fn(),
}));

vi.mock("../../../utils/sound", () => ({
    playSoundEffect: vi.fn(),
}));

import api from "../../../services/api";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function renderCore() {
    return renderHook(() => useGameCore("GAME1", "player_white", "white", {}));
}

describe("useGameCore optimistic moves", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows the move on the board before the server confirms it", async () => {
        let resolvePost;
        api.postMove.mockReturnValue(new Promise((resolve) => (resolvePost = resolve)));
        const { result } = renderCore();

        let movePromise;
        act(() => {
            movePromise = result.current.makeMove({ from: "e2", to: "e4" });
        });

        // Optimistic: applied locally while the POST is still in flight.
        expect(result.current.moveHistory).toHaveLength(1);
        expect(result.current.game.fen()).toBe(AFTER_E4_FEN);
        expect(api.postMove).toHaveBeenCalledTimes(1);
        expect(api.postMove).toHaveBeenCalledWith(
            expect.objectContaining({
                expectedMoveCount: 0,
                move: expect.objectContaining({ from: "e2", to: "e4", san: "e4" }),
            }),
        );

        // A second move while the first is unconfirmed is refused.
        let second;
        act(() => {
            second = result.current.makeMove({ from: "g1", to: "f3" });
        });
        await second;
        expect(api.postMove).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolvePost({ success: true, moveHistory: ["e4"], fen: AFTER_E4_FEN });
            await movePromise;
        });

        // Reconciled with the server's authoritative history.
        expect(result.current.moveHistory).toEqual(["e4"]);
        expect(result.current.game.fen()).toBe(AFTER_E4_FEN);
        expect(result.current.gameStatus).toBe("playing");
    });

    it("rolls back the optimistic move when the server rejects it", async () => {
        api.postMove.mockResolvedValue({ success: false, error: "Move rejected" });
        const { result } = renderCore();

        let moved;
        await act(async () => {
            moved = await result.current.makeMove({ from: "e2", to: "e4" });
        });

        expect(moved).toBe(false);
        expect(result.current.moveHistory).toHaveLength(0);
        expect(result.current.game.fen()).toBe(START_FEN);
        expect(result.current.moveError).toBe("Move rejected");
        expect(result.current.gameStatus).toBe("playing");
    });

    it("rolls back and ends the game when the server says the move timed out", async () => {
        api.postMove.mockResolvedValue({ timedOut: true, endReason: "timeout", result: "black" });
        const { result } = renderCore();

        let moved;
        await act(async () => {
            moved = await result.current.makeMove({ from: "e2", to: "e4" });
        });

        expect(moved).toBe(false);
        expect(result.current.moveHistory).toHaveLength(0);
        expect(result.current.game.fen()).toBe(START_FEN);
        expect(result.current.gameStatus).toBe("ended");
        expect(result.current.endReason).toBe("timeout");
        expect(result.current.winner).toBe("black");
    });

    it("rolls back when the request fails", async () => {
        api.postMove.mockRejectedValue(new Error("Move could not be sent"));
        const { result } = renderCore();

        let moved;
        await act(async () => {
            moved = await result.current.makeMove({ from: "d2", to: "d4" });
        });

        expect(moved).toBe(false);
        expect(result.current.moveHistory).toHaveLength(0);
        expect(result.current.game.fen()).toBe(START_FEN);
        expect(result.current.moveError).toBe("Move could not be sent");
    });
});
