import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../services/api", () => ({
    default: { getLeaderboard: vi.fn() },
}));

vi.mock("../contexts/UserContext", () => ({
    useUser: () => ({ user: { username: "me" } }),
}));

import api from "../services/api";
import Leaderboard from "./Leaderboard";

beforeEach(() => {
    api.getLeaderboard.mockReset();
    api.getLeaderboard.mockResolvedValue({
        timeControl: "unlimited",
        leaderboard: [
            {
                rank: 1,
                username: "alice",
                elo: 1300,
                rapidElo: 1500,
                classicalElo: 1100,
                blitzElo: 1600,
                gamesPlayed: 10,
            },
            {
                rank: 2,
                username: "me",
                elo: 1200,
                rapidElo: 1400,
                classicalElo: 1250,
                blitzElo: 1380,
                gamesPlayed: 3,
            },
        ],
    });
});

describe("Leaderboard", () => {
    it("shows every pool rating and marks the signed-in player", async () => {
        render(<Leaderboard />);

        await waitFor(() => expect(screen.getByText("alice")).toBeDefined());

        // Selected-pool column plus the other pools for the same row.
        expect(screen.getByText("1300")).toBeDefined();
        expect(screen.getByText(/Blitz 1600/)).toBeDefined();
        expect(screen.getByText(/Rapid 1500/)).toBeDefined();
        expect(screen.getByText(/Classical 1100/)).toBeDefined();
        expect(screen.getByText("you")).toBeDefined();
    });

    it("offers every pool and refetches the board for the selected one", async () => {
        render(<Leaderboard />);

        await waitFor(() =>
            expect(api.getLeaderboard).toHaveBeenCalledWith(50, "unlimited"),
        );

        const poolSelect = screen.getByRole("combobox", {
            name: /rating pool/i,
        });
        expect(
            Array.from(poolSelect.options).map((option) => option.value),
        ).toEqual(["unlimited", "blitz", "rapid", "classical"]);

        fireEvent.change(poolSelect, { target: { value: "classical" } });

        await waitFor(() =>
            expect(api.getLeaderboard).toHaveBeenCalledWith(50, "classical"),
        );
    });

    it("renders an error when the board fails to load", async () => {
        api.getLeaderboard.mockRejectedValue(new Error("Network down"));

        render(<Leaderboard />);

        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toContain(
                "Network down",
            ),
        );
    });
});
