import http from "node:http";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({
    query: vi.fn(),
}));

vi.mock("../coachAuth.js", () => ({
    authenticatedUserId: vi.fn(),
}));

vi.mock("../services/presenceService.js", () => ({
    isOnline: vi.fn(),
    markActive: vi.fn(),
}));

vi.mock("../auth.js", () => ({
  // Cookie-only reader used by Bearer-fallback routes.
  getSessionCookieToken: vi.fn((req) => {
    const cookieHeader = req?.headers?.cookie;
    if (typeof cookieHeader !== 'string') return null;
    for (const part of cookieHeader.split(';')) {
      const [key, ...valueParts] = part.trim().split('=');
      if (key === 'chess_session') return valueParts.join('=');
    }
    return null;
  }),
    validateSession: vi.fn().mockResolvedValue(2),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    getSessionToken: vi.fn(() => "test-token"),
}));

import { authenticatedUserId } from "../coachAuth.js";
import { query } from "../db.js";

let socialRoutes;

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/social", socialRoutes);
    return app;
}

function loopback(app, method, path, body, headers = { Authorization: "Bearer test-token" }) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, () => {
            const { port } = server.address();
            const hasBody = body !== undefined && method !== "GET";
            const data = hasBody ? JSON.stringify(body) : "";
            const reqHeaders = {};
            if (hasBody) {
                reqHeaders["content-type"] = "application/json";
                reqHeaders["content-length"] = Buffer.byteLength(data);
            }
            Object.assign(reqHeaders, headers);
            const req = http.request(
                { host: "127.0.0.1", port, path, method, headers: reqHeaders },
                (res) => {
                    let buf = "";
                    res.on("data", (c) => (buf += c));
                    res.on("end", () =>
                        server.close(() => {
                            let parsed;
                            try {
                                parsed = JSON.parse(buf);
                            } catch {
                                parsed = buf;
                            }
                            resolve({ status: res.statusCode, body: parsed });
                        }),
                    );
                },
            );
            req.on("error", (e) => server.close(() => reject(e)));
            if (hasBody) req.write(data);
            req.end();
        });
    });
}

beforeEach(async () => {
    vi.resetAllMocks();
    authenticatedUserId.mockResolvedValue(2);
    socialRoutes = (await import("./social.js")).default;
});

describe("POST /api/social/clubs/:slug/join", () => {
    it("reports joined:true when the membership is new", async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: "club_1", slug: "test-club" }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [{ club_id: "club_1" }], rowCount: 1 });

        const res = await loopback(buildApp(), "POST", "/api/social/clubs/test-club/join");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, joined: true, club: { id: "club_1", slug: "test-club" } });
    });

    it("is idempotent: a repeat join succeeds with joined:false instead of double-counting", async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: "club_1", slug: "test-club" }], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const res = await loopback(buildApp(), "POST", "/api/social/clubs/test-club/join");
        expect(res.status).toBe(200);
        expect(res.body.joined).toBe(false);
        expect(res.body.success).toBe(true);
    });

    it("returns 404 for an unknown club", async () => {
        query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const res = await loopback(buildApp(), "POST", "/api/social/clubs/nope/join");
        expect(res.status).toBe(404);
    });

    it("returns 401 without a valid session", async () => {
        authenticatedUserId.mockResolvedValueOnce(null);

        const res = await loopback(buildApp(), "POST", "/api/social/clubs/test-club/join", undefined, {});
        expect(res.status).toBe(401);
        expect(query).not.toHaveBeenCalled();
    });
});

describe("GET /api/social/clubs", () => {
    const clubRow = (isMember) => ({
        id: "club_1",
        slug: "test-club",
        name: "Test Club",
        description: "A club",
        created_by: "2",
        created_at: new Date(),
        member_count: "3",
        is_member: isMember ? 1 : 0,
    });

    it("marks clubs the caller belongs to with isMember:true", async () => {
        query.mockResolvedValueOnce({ rows: [clubRow(true)], rowCount: 1 });

        const res = await loopback(buildApp(), "GET", "/api/social/clubs");
        expect(res.status).toBe(200);
        expect(res.body.clubs).toHaveLength(1);
        expect(res.body.clubs[0].isMember).toBe(true);
        expect(res.body.clubs[0].memberCount).toBe(3);
    });

    it("stays public for anonymous callers and reports isMember:false", async () => {
        authenticatedUserId.mockResolvedValueOnce(null);
        query.mockResolvedValueOnce({ rows: [clubRow(false)], rowCount: 1 });

        const res = await loopback(buildApp(), "GET", "/api/social/clubs", undefined, {});
        expect(res.status).toBe(200);
        expect(res.body.clubs[0].isMember).toBe(false);
    });
});
