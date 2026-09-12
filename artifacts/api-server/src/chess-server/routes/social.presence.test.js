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
    validateSession: vi.fn().mockResolvedValue(2),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    getSessionToken: vi.fn(() => "test-token"),
}));

import { authenticatedUserId } from "../coachAuth.js";
import { query } from "../db.js";
import { isOnline } from "../services/presenceService.js";

let socialRoutes;

function buildApp() {
    const app = express();
    app.use(express.json());
    return app;
}

function loopback(
    app,
    method,
    path,
    body,
    headers = { Authorization: "Bearer test-token" },
) {
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
  isOnline.mockResolvedValue(false);
  socialRoutes = (await import("./social.js")).default;
});

describe("GET /api/social/presence/:userId", () => {
    it("returns 401 without a valid session", async () => {
        const app = buildApp();
        app.use("/api/social", socialRoutes);
        authenticatedUserId.mockResolvedValueOnce(null);

        const res = await loopback(
            app,
            "GET",
            "/api/social/presence/user_1",
            undefined,
            {},
        );
        expect(res.status).toBe(401);
    });

    it("returns 200 with online:false when the target user is offline", async () => {
        const app = buildApp();
        app.use("/api/social", socialRoutes);
        isOnline.mockResolvedValueOnce(false);

        const res = await loopback(app, "GET", "/api/social/presence/user_1");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ userId: "user_1", online: false });
        expect(isOnline).toHaveBeenCalledWith("user_1");
    });

    it("returns 200 with online:true when the target user is online", async () => {
        const app = buildApp();
        app.use("/api/social", socialRoutes);
        isOnline.mockResolvedValueOnce(true);

        const res = await loopback(app, "GET", "/api/social/presence/user_1");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ userId: "user_1", online: true });
        expect(isOnline).toHaveBeenCalledWith("user_1");
    });
});
