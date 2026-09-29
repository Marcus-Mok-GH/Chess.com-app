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
            { rank: 1, username: "alice", elo: 1300, rapidElo: 1500, gamesPlayed: 10 },
            { rank: 2, username: "me", elo: 1200, rapidElo: 1400, gamesPlayed: 3 },
        ],
    });
});

describe("Leaderboard", () => {
    it("shows both pool ratings and marks the signed-in player", async () => {
        render(<Leaderboard />);

        await waitFor(() => expect(screen.getByText("alice")).toBeDefined());

        // Unlimited column plus the secondary rapid rating for the same row.
        expect(screen.getByText("1300")).toBeDefined();
        expect(screen.getByText("1500")).toBeDefined();
        expect(screen.getByText("you")).toBeDefined();
    });

    it("offers both pools and refetches the board for the selected one", async () => {
        render(<Leaderboard />);

        await waitFor(() =>
            expect(api.getLeaderboard).toHaveBeenCalledWith(50, "unlimited"),
        );

        const poolSelect = screen.getByRole("combobox", {
            name: /rating pool/i,
        });
        expect(
            Array.from(poolSelect.options).map((option) => option.value),
        ).toEqual(["unlimited", "rapid"]);

        fireEvent.change(poolSelect, { target: { value: "rapid" } });

        await waitFor(() =>
            expect(api.getLeaderboard).toHaveBeenCalledWith(50, "rapid"),
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
