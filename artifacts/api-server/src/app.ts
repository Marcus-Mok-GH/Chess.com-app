import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Legacy health endpoint (frontend fetches /health directly)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Chess routes (JS files loaded dynamically)
// Use top-level await so routes are guaranteed to be mounted before the first
// request is handled. The previous implementation called loadChessRoutes()
// without awaiting, creating a race where /api/auth/* could return 404/500
// on cold start, which manifested as \"OTP endpoint keeps failing\".
try {
  const matchmakingRoutes = (await import("./chess-server/routes/matchmaking.js" as any)).default;
  const gameRoutes = (await import("./chess-server/routes/games.js" as any)).default;
  const userRoutes = (await import("./chess-server/routes/users.js" as any)).default;
  const coachRoutes = (await import("./chess-server/routes/coach.js" as any)).default;
  const engineRoutes = (await import("./chess-server/routes/engine.js" as any)).default;
  const authRoutes = (await import("./chess-server/routes/auth.js" as any)).default;
  const statsRoutes = (await import("./chess-server/routes/stats.js" as any)).default;
  const puzzleRoutes = (await import("./chess-server/routes/puzzles.js" as any)).default;
  const socialRoutes = (await import("./chess-server/routes/social.js" as any)).default;

  app.use("/api/matchmaking", matchmakingRoutes);
  app.use("/api/games", gameRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/coach", coachRoutes);
  app.use("/api/engine", engineRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/stats", statsRoutes);
  app.use("/api/puzzles", puzzleRoutes);
  app.use("/api/social", socialRoutes);
} catch (err) {
  console.error("Failed to load chess routes:", err);
}

// Global error handler — ensures every uncaught error returns JSON
// instead of HTML, matching the behavior in chess-server/index.js
// and preventing generic \"Request failed (500)\" without details on the client.
app.use((err: any, _req: any, res: any, next: any) => {
  console.error("[Server] Unhandled route error:", err?.message || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: { message: "Internal server error. Please try again later." } });
});

export default app;
