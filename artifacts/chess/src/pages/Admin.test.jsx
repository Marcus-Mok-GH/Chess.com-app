import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Admin from "./Admin";

vi.mock("../services/api", () => ({
    default: {
        adminSearchUsers: vi.fn(),
        adminBanUser: vi.fn(),
        adminUnbanUser: vi.fn(),
        adminDeleteUser: vi.fn(),
        adminGetUserAnalytics: vi.fn(),
        adminSetUserElo: vi.fn(),
    },
}));

const mockUseUser = vi.fn();
vi.mock("../contexts/UserContext", () => ({
    useUser: () => mockUseUser(),
}));

import api from "../services/api";

function makeUser(overrides = {}) {
    return {
        id: "user_1",
        username: "admin",
        isAdmin: true,
        ...overrides,
    };
}

function makeAccount(overrides = {}) {
    return {
        id: "user_2",
        username: "bobby",
        email: "bobby@example.com",
        elo: 1500,
        gamesPlayed: 10,
        isBanned: false,
        isAdmin: false,
        ...overrides,
    };
}

function renderAdmin() {
    return render(
        <MemoryRouter initialEntries={["/admin"]}>
            <Admin />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("Admin page access", () => {
    it("shows an access notice to non-admins", () => {
        mockUseUser.mockReturnValue({ user: makeUser({ isAdmin: false }) });
        renderAdmin();
        expect(screen.getByText(/need admin access/i)).toBeTruthy();
    });
});

describe("Admin page search", () => {
    beforeEach(() => {
        mockUseUser.mockReturnValue({ user: makeUser() });
    });

    it("loads the full account list on mount", async () => {
        api.adminSearchUsers.mockResolvedValue({ users: [makeAccount()] });
        renderAdmin();
        await waitFor(() => expect(api.adminSearchUsers).toHaveBeenCalledWith(""));
        expect(await screen.findByText("bobby")).toBeTruthy();
    });

    it("does not run a text search for single-character queries", async () => {
        api.adminSearchUsers.mockResolvedValue({ users: [] });
        renderAdmin();
        await waitFor(() => expect(api.adminSearchUsers).toHaveBeenCalledWith(""));
        fireEvent.change(screen.getByLabelText(/search accounts/i), {
            target: { value: "b" },
        });
        await waitFor(() => new Promise((r) => setTimeout(r, 500)));
        expect(api.adminSearchUsers).not.toHaveBeenCalledWith("b");
    });

    it("shows results as the admin types (debounced)", async () => {
        api.adminSearchUsers.mockResolvedValue({ users: [makeAccount()] });
        renderAdmin();
        fireEvent.change(screen.getByLabelText(/search accounts/i), {
            target: { value: "bobby" },
        });
        await waitFor(() => expect(api.adminSearchUsers).toHaveBeenCalledWith("bobby"), {
            timeout: 3000,
        });
        expect(await screen.findByText("bobby")).toBeTruthy();
    });
});

describe("Admin page actions", () => {
    beforeEach(() => {
        mockUseUser.mockReturnValue({ user: makeUser() });
    });

    it("bans a user with a reason after confirmation", async () => {
        const account = makeAccount();
        api.adminSearchUsers.mockResolvedValue({ users: [account] });
        api.adminBanUser.mockResolvedValue({
            user: { ...account, isBanned: true, bannedReason: "engine use" },
        });
        renderAdmin();
        fireEvent.change(screen.getByLabelText(/search accounts/i), {
            target: { value: "bobby" },
        });
        fireEvent.click(await screen.findByRole("button", { name: /^ban$/i }));
        fireEvent.change(screen.getByPlaceholderText(/reason/i), {
            target: { value: "engine use" },
        });
        fireEvent.click(screen.getByRole("button", { name: /confirm ban/i }));
        await waitFor(() =>
            expect(api.adminBanUser).toHaveBeenCalledWith(account.id, "engine use"),
        );
        expect(await screen.findByText(/^Banned bobby\.$/)).toBeTruthy();
    });

    it("unbans a banned user", async () => {
        const account = makeAccount({ isBanned: true, bannedReason: "engine use" });
        api.adminSearchUsers.mockResolvedValue({ users: [account] });
        api.adminUnbanUser.mockResolvedValue({
            user: { ...account, isBanned: false, bannedReason: null },
        });
        renderAdmin();
        fireEvent.change(screen.getByLabelText(/search accounts/i), {
            target: { value: "bobby" },
        });
        fireEvent.click(await screen.findByRole("button", { name: /unban/i }));
        await waitFor(() =>
            expect(api.adminUnbanUser).toHaveBeenCalledWith(account.id),
        );
        expect(await screen.findByText(/^Unbanned bobby\.$/)).toBeTruthy();
    });

    it("deletes a user after confirmation", async () => {
        const account = makeAccount();
        api.adminSearchUsers.mockResolvedValue({ users: [account] });
        api.adminDeleteUser.mockResolvedValue({ success: true, deleted: account });
        renderAdmin();
        fireEvent.change(screen.getByLabelText(/search accounts/i), {
            target: { value: "bobby" },
        });
        fireEvent.click(await screen.findByRole("button", { name: /^delete$/i }));
        fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
        await waitFor(() =>
            expect(api.adminDeleteUser).toHaveBeenCalledWith(account.id),
        );
        expect(await screen.findByText(/^Deleted account bobby\.$/)).toBeTruthy();
    });
});

describe("Admin analytics", () => {
    it("shows a user's stats and game history in the analytics modal", async () => {
        const account = makeAccount();
        api.adminSearchUsers.mockResolvedValue({ users: [account] });
        api.adminGetUserAnalytics.mockResolvedValue({
            success: true,
            user: { ...account, elo: 1350, createdAt: "2026-01-15T00:00:00Z" },
            stats: { totalGames: 3, wins: 1, losses: 1, draws: 1, winRate: 33 },
            recentGames: [
                { gameId: "ABC123", color: "white", opponent: "magnus", result: "win", mode: "online", playedAt: "2026-09-20T00:00:00Z" },
            ],
        });
        renderAdmin();
        fireEvent.click(await screen.findByRole("button", { name: /^analytics$/i }));
        expect(api.adminGetUserAnalytics).toHaveBeenCalledWith(account.id);
        expect(await screen.findByText(/vs magnus/)).toBeTruthy();
        expect(screen.getByText("33%")).toBeTruthy();
        expect(screen.getByDisplayValue("1350")).toBeTruthy();
    });

    it("saves a new elo and shows a confirmation", async () => {
        const account = makeAccount();
        api.adminSearchUsers.mockResolvedValue({ users: [account] });
        api.adminGetUserAnalytics.mockResolvedValue({
            success: true,
            user: { ...account, elo: 1350, createdAt: "2026-01-15T00:00:00Z" },
            stats: { totalGames: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
            recentGames: [],
        });
        api.adminSetUserElo.mockResolvedValue({ success: true, user: { ...account, elo: 1800 } });
        renderAdmin();
        fireEvent.click(await screen.findByRole("button", { name: /^analytics$/i }));
        const eloField = await screen.findByLabelText(/elo rating/i);
        fireEvent.change(eloField, { target: { value: "1800" } });
        fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
        await waitFor(() => expect(api.adminSetUserElo).toHaveBeenCalledWith(account.id, 1800));
        expect(await screen.findByText("Set bobby's elo to 1800.")).toBeTruthy();
    });

    it("rejects an invalid elo without calling the API", async () => {
        const account = makeAccount();
        api.adminSearchUsers.mockResolvedValue({ users: [account] });
        api.adminGetUserAnalytics.mockResolvedValue({
            success: true,
            user: { ...account, elo: 1350, createdAt: "2026-01-15T00:00:00Z" },
            stats: { totalGames: 0, wins: 0, losses: 0, draws: 0, winRate: 0 },
            recentGames: [],
        });
        renderAdmin();
        fireEvent.click(await screen.findByRole("button", { name: /^analytics$/i }));
        const eloField = await screen.findByLabelText(/elo rating/i);
        fireEvent.change(eloField, { target: { value: "12" } });
        fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
        expect(api.adminSetUserElo).not.toHaveBeenCalled();
        expect(await screen.findByText(/whole number between 100 and 4000/)).toBeTruthy();
    });
});
