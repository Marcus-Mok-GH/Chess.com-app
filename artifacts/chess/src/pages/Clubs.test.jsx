import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Clubs from "./Clubs";

vi.mock("../services/api", () => ({
    default: {
        getClubs: vi.fn(),
        createClub: vi.fn(),
        joinClub: vi.fn(),
    },
}));

const mockUseUser = vi.fn();
vi.mock("../contexts/UserContext", () => ({
    useUser: () => mockUseUser(),
}));

import api from "../services/api";

function makeClub(overrides = {}) {
    return {
        id: "club_1",
        slug: "test-club",
        name: "Test Club",
        description: "A club for testing",
        createdBy: "user_1",
        createdAt: "2026-01-01T00:00:00.000Z",
        memberCount: 3,
        isMember: false,
        ...overrides,
    };
}

function renderClubs() {
    return render(
        <MemoryRouter initialEntries={["/clubs"]}>
            <Clubs />
        </MemoryRouter>,
    );
}

describe("Clubs page join button", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseUser.mockReturnValue({
            user: { id: "user_1", username: "alice", elo: 1200 },
            isLoggedIn: true,
            isLoading: false,
        });
        api.getClubs.mockResolvedValue({ clubs: [makeClub()], count: 1 });
        api.createClub.mockResolvedValue({ club: makeClub({ memberCount: 1 }) });
        api.joinClub.mockResolvedValue({ success: true, joined: true });
    });

    it("shows an enabled Join button for a club the user has not joined", async () => {
        renderClubs();
        const button = await screen.findByText("Join");
        expect(button.closest("button").disabled).toBe(false);
        expect(await screen.findByText("3 members")).toBeTruthy();
    });

    it("sends only one join request when the button is clicked repeatedly", async () => {
        let resolveJoin;
        api.joinClub.mockReturnValue(new Promise((resolve) => (resolveJoin = resolve)));
        renderClubs();
        const button = await screen.findByText("Join");

        fireEvent.click(button);
        fireEvent.click(button);
        fireEvent.click(button);

        expect(api.joinClub).toHaveBeenCalledTimes(1);
        expect(api.joinClub).toHaveBeenCalledWith("test-club");
        expect(button.closest("button").disabled).toBe(true);

        await act(async () => resolveJoin({ success: true, joined: true }));
        expect(await screen.findByText("Joined")).toBeTruthy();
    });

    it("counts a new membership once and locks the button to Joined", async () => {
        renderClubs();
        fireEvent.click(await screen.findByText("Join"));

        const button = await screen.findByText("Joined");
        expect(button.closest("button").disabled).toBe(true);
        expect(await screen.findByText("4 members")).toBeTruthy();
        expect(await screen.findByText("Joined Test Club.")).toBeTruthy();

        // A joined club cannot be joined again, so the count cannot inflate.
        fireEvent.click(button);
        expect(api.joinClub).toHaveBeenCalledTimes(1);
    });

    it("does not count a repeat join the server reports as already-member", async () => {
        api.joinClub.mockResolvedValue({ success: true, joined: false });
        renderClubs();
        fireEvent.click(await screen.findByText("Join"));

        expect(await screen.findByText("Joined")).toBeTruthy();
        expect(await screen.findByText("3 members")).toBeTruthy();
    });

    it("shows Joined and disabled for a club the user already belongs to", async () => {
        api.getClubs.mockResolvedValue({ clubs: [makeClub({ isMember: true })], count: 1 });
        renderClubs();

        const button = await screen.findByText("Joined");
        expect(button.closest("button").disabled).toBe(true);
        fireEvent.click(button);
        expect(api.joinClub).not.toHaveBeenCalled();
    });

    it("re-enables Join and shows the error when the request fails", async () => {
        api.joinClub.mockRejectedValue(new Error("Failed to join club"));
        renderClubs();
        fireEvent.click(await screen.findByText("Join"));

        await waitFor(() => expect(screen.getByText("Failed to join club")).toBeTruthy());
        const button = screen.getByText("Join");
        expect(button.closest("button").disabled).toBe(false);
        expect(screen.queryByText("4 members")).toBeNull();
    });
});
