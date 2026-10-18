import { act, render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserProvider, useUser } from "./UserContext";

// ── Module-level mocks ────────────────────────────────────────────────────────

vi.mock("../services/api", () => ({
    default: {
        login: vi.fn(),
        getUser: vi.fn(),
        updateElo: vi.fn(),
    },
}));

vi.mock("../services/neonAuth", () => ({
    neonAuth: {
        emailOtp: {
            sendVerificationOtp: vi.fn(),
        },
        signIn: {
            emailOtp: vi.fn(),
        },
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        signOut: vi.fn(),
    },
}));

import { neonAuth } from "../services/neonAuth";

// ── Test helper ───────────────────────────────────────────────────────────────

/**
 * Render a component that exposes the useUser context value through a callback.
 */
function renderWithUserContext(onValue) {
    function TestChild() {
        const ctx = useUser();
        onValue(ctx);
        return null;
    }
    render(
        <UserProvider>
            <TestChild />
        </UserProvider>,
    );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("UserContext.requestOtp – 6-digit code message (PR #1.1.65)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        neonAuth.getSession.mockResolvedValue({ data: { session: null } });
        // Simulate being online
        Object.defineProperty(navigator, "onLine", {
            value: true,
            configurable: true,
        });
        localStorage.clear();
    });

    it("returns a success message referencing a 6-digit verification code", async () => {
        neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({
            success: true,
            data: { sent: true },
        });

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        let result;
        await act(async () => {
            result = await capturedContext.requestOtp({
                email: "user@example.com",
                username: "testuser",
            });
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain("6-digit");
    });

    it("success message does NOT reference a 8-digit code (regression)", async () => {
        neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({
            success: true,
            data: { sent: true },
        });

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        let result;
        await act(async () => {
            result = await capturedContext.requestOtp({
                email: "user@example.com",
                username: "testuser",
            });
        });

        expect(result.message).not.toContain("8-digit");
    });

    it("returns the exact success message string", async () => {
        neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({
            success: true,
            data: { sent: true },
        });

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        let result;
        await act(async () => {
            result = await capturedContext.requestOtp({
                email: "user@example.com",
                username: "testuser",
            });
        });

        expect(result.message).toBe(
            "Code sent! Check your email for a 6-digit verification code.",
        );
    });

    it("calls neonAuth.emailOtp.sendVerificationOtp with the correct email", async () => {
        neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({
            success: true,
            data: { sent: true },
        });

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        await act(async () => {
            await capturedContext.requestOtp({
                email: "user@example.com",
                username: "testuser",
            });
        });

        expect(neonAuth.emailOtp.sendVerificationOtp).toHaveBeenCalledWith(
            expect.objectContaining({ email: "user@example.com" }),
        );
    });

    it("returns an error when neonAuth.emailOtp.sendVerificationOtp fails", async () => {
        neonAuth.emailOtp.sendVerificationOtp.mockResolvedValue({
            success: false,
            error: "Rate limit exceeded",
        });

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        let result;
        await act(async () => {
            result = await capturedContext.requestOtp({
                email: "user@example.com",
                username: "testuser",
            });
        });

        expect(result.success).toBeUndefined();
        expect(result.error).toBeTruthy();
    });

    it("returns an error when called offline", async () => {
        Object.defineProperty(navigator, "onLine", {
            value: false,
            configurable: true,
        });

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        let result;
        await act(async () => {
            result = await capturedContext.requestOtp({
                email: "user@example.com",
                username: "testuser",
            });
        });

        expect(result.error).toBeTruthy();
        expect(neonAuth.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
    });

    // Boundary / negative cases ─────────────────────────────────────────────

    it("returns an error when email is empty", async () => {
        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        let result;
        await act(async () => {
            result = await capturedContext.requestOtp({
                email: "",
                username: "testuser",
            });
        });

        expect(result.error).toBeTruthy();
        expect(neonAuth.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
    });

    it("returns an error when username is too short", async () => {
        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        let result;
        await act(async () => {
            result = await capturedContext.requestOtp({
                email: "user@example.com",
                username: "x",
            });
        });

        expect(result.error).toBeTruthy();
        expect(neonAuth.emailOtp.sendVerificationOtp).not.toHaveBeenCalled();
    });

    it("removes a stale localStorage token mirror after cookie session validation", async () => {
        // Simulate a browser that previously mirrored a truncated/stale token
        // (the pre-fix bug: /auth/session returns only a prefix as session.id).
        localStorage.setItem("chess_user_data", JSON.stringify({
            id: "u-1", username: "alice", email: "a@b.c", elo: 1200,
        }));
        localStorage.setItem("chess_user_cache_epoch", String(Date.now()));
        localStorage.setItem("chess_user_token", "abc12345");

        neonAuth.getSession.mockResolvedValue({
            data: {
                session: { id: "abc12345", userId: "u-1" },
                user: { id: "u-1", username: "alice", email: "a@b.c", elo: 1200 },
            },
        });

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(capturedContext.user?.username).toBe("alice");
        // The garbage mirror must be REMOVED, never overwritten with the prefix.
        expect(localStorage.getItem("chess_user_token")).toBeNull();
    });

    it("propagates isAdmin from the server session onto the context user", async () => {
        // Regression: the backend session response includes isAdmin, but the
        // UserContext mapping dropped it, so admins never saw the Admin page.
        neonAuth.getSession.mockResolvedValue({
            data: {
                session: { id: "sess-1", userId: "u-admin" },
                user: {
                    id: "u-admin", username: "root", email: "root@example.com",
                    elo: 2500, isAdmin: true,
                },
            },
        });

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(capturedContext.user?.isAdmin).toBe(true);
        // Non-admin flags stay false, never truthy garbage.
        expect(capturedContext.user?.needsUsername).toBe(false);
    });

    describe("logout", () => {
        it("clears local state even if remote signOut fails", async () => {
            // Mock failure
            neonAuth.signOut.mockRejectedValue(new Error("Network error"));

            // Setup some session data in localStorage
            localStorage.setItem("chess_user_session", "testuser");
            localStorage.setItem("chess_user_token", "tok");

            let capturedContext;
            renderWithUserContext((ctx) => {
                capturedContext = ctx;
            });

            // Mock window.location.href to prevent actual navigation in JSDOM
            const assignMock = vi.fn();
            const originalLocation = window.location;

            vi.stubGlobal("location", {
                ...originalLocation,
                assign: assignMock,
                href: "http://localhost/settings",
                pathname: "/settings",
            });

            // In JSDOM, setting location.href doesn't update location.pathname automatically
            // when stubbed like this. We mock the behavior.
            const locationStub = {
                ...originalLocation,
                assign: assignMock,
                href: "http://localhost/settings",
                pathname: "/settings",
            };

            Object.defineProperty(locationStub, "href", {
                set: (val) => {
                    if (val === "/") locationStub.pathname = "/";
                    return val;
                },
                get: () => "http://localhost" + locationStub.pathname,
            });

            vi.stubGlobal("location", locationStub);

            await act(async () => {
                await capturedContext.logout();
            });

            // Local state should be cleared
            expect(capturedContext.user).toBeNull();
            expect(localStorage.getItem("chess_user_session")).toBeNull();
            expect(localStorage.getItem("chess_user_token")).toBeNull();
            expect(window.location.pathname).toBe("/");

            vi.unstubAllGlobals();
        });

        it("clears local state when remote signOut succeeds", async () => {
            neonAuth.signOut.mockResolvedValue();

            localStorage.setItem("chess_user_session", "testuser");
            localStorage.setItem("chess_user_token", "tok");

            let capturedContext;
            renderWithUserContext((ctx) => {
                capturedContext = ctx;
            });

            const assignMock = vi.fn();
            const originalLocation = window.location;

            const locationStub = {
                ...originalLocation,
                assign: assignMock,
                href: "http://localhost/settings",
                pathname: "/settings",
            };

            Object.defineProperty(locationStub, "href", {
                set: (val) => {
                    if (val === "/") locationStub.pathname = "/";
                    return val;
                },
                get: () => "http://localhost" + locationStub.pathname,
            });

            vi.stubGlobal("location", locationStub);

            await act(async () => {
                await capturedContext.logout();
            });

            expect(capturedContext.user).toBeNull();
            expect(localStorage.getItem("chess_user_session")).toBeNull();
            expect(localStorage.getItem("chess_user_token")).toBeNull();
            expect(window.location.pathname).toBe("/");

            vi.unstubAllGlobals();
        });
    });
});

// ── SSR session adoption (window.__SSR_USER__) ──────────────────────────────
// The Vercel renderer embeds the validated session user as a one-shot window
// payload (same pattern as the Puzzles page). The provider must adopt it
// synchronously so the first client render matches the personalized server
// HTML exactly, then delete it on mount, while init() stays the authority.
const SSR_TEST_USER = {
    id: "ssr-user-1",
    username: "marina",
    email: "marina@example.com",
    elo: 1500,
    rapidElo: 1500,
    classicalElo: 1480,
    blitzElo: 1510,
    bulletElo: 1520,
    gamesPlayed: 42,
    wins: 20,
    losses: 15,
    draws: 7,
    createdAt: "2026-01-01T00:00:00.000Z",
    needsUsername: false,
    isAdmin: false,
};

describe("SSR session adoption (window.__SSR_USER__)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        neonAuth.getSession.mockResolvedValue({ data: { session: null, user: null } });
        Object.defineProperty(navigator, "onLine", {
            value: true,
            configurable: true,
        });
        localStorage.clear();
        delete window.__SSR_USER__;
    });

    afterEach(() => {
        delete window.__SSR_USER__;
    });

    // Captures the context value DURING the first render, before any effect
    // (payload deletion, cache restore, or backend validation) can run.
    function renderCapturingFirstRender() {
        let first = null;
        function FirstRenderProbe() {
            const ctx = useUser();
            if (!first) {
                first = { user: ctx.user, isLoggedIn: ctx.isLoggedIn, isLoading: ctx.isLoading };
            }
            return null;
        }
        render(
            <UserProvider>
                <FirstRenderProbe />
            </UserProvider>,
        );
        return first;
    }

    it("adopts the server payload synchronously on the first render, logged in", () => {
        window.__SSR_USER__ = SSR_TEST_USER;

        const first = renderCapturingFirstRender();

        expect(first.user).toEqual(SSR_TEST_USER);
        expect(first.isLoggedIn).toBe(true);
        expect(first.isLoading).toBe(false);
    });

    it("never waits for getSession(): the payload counts even when the backend never answers", () => {
        window.__SSR_USER__ = SSR_TEST_USER;
        neonAuth.getSession.mockImplementation(() => new Promise(() => {}));

        const first = renderCapturingFirstRender();

        expect(first.user?.username).toBe("marina");
        expect(first.isLoading).toBe(false);
    });

    it("deletes the one-shot payload on first mount", () => {
        window.__SSR_USER__ = SSR_TEST_USER;

        renderCapturingFirstRender();

        expect(window.__SSR_USER__).toBeUndefined();
    });

    it("ignores malformed payloads and keeps the loading anonymous flow", () => {
        window.__SSR_USER__ = { not: "a user", username: 42 };

        const first = renderCapturingFirstRender();

        expect(first.user).toBeNull();
        expect(first.isLoggedIn).toBe(false);
        expect(first.isLoading).toBe(true);
    });

    it("keeps init() as the authority: a successful revalidation refreshes and persists the account", async () => {
        window.__SSR_USER__ = SSR_TEST_USER;
        neonAuth.getSession.mockResolvedValue({
            data: {
                session: { id: "sess-1", userId: "u-1" },
                user: { id: "u-1", username: "marina", email: "marina@example.com", elo: 1550 },
            },
        });

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(capturedContext.user?.username).toBe("marina");
        expect(capturedContext.user?.elo).toBe(1550);
        expect(capturedContext.isLoading).toBe(false);
        // The adoptable payload was consumed on mount, not persisted anew.
        expect(window.__SSR_USER__).toBeUndefined();
    });

    it("keeps init() as the authority: a definitive logged-out answer clears the seeded session", async () => {
        // Seeded user, but no cached login and the backend answers
        // definitively "not signed in" -> the seeded session must be cleared.
        window.__SSR_USER__ = SSR_TEST_USER;

        let capturedContext;
        renderWithUserContext((ctx) => {
            capturedContext = ctx;
        });

        expect(capturedContext.user?.username).toBe("marina");

        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(capturedContext.user).toBeNull();
        expect(capturedContext.isLoading).toBe(false);
    });
});
