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

    it("does not search for queries under 2 characters", async () => {
        api.adminSearchUsers.mockResolvedValue({ users: [] });
        renderAdmin();
        fireEvent.change(screen.getByLabelText(/search accounts/i), {
            target: { value: "b" },
        });
        await waitFor(() => new Promise((r) => setTimeout(r, 0)));
        expect(api.adminSearchUsers).not.toHaveBeenCalled();
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
