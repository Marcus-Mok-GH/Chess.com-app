import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
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
async function loadChessRoutes() {
  try {
    const matchmakingRoutes = (await import("./chess-server/routes/matchmaking.js" as any)).default;
    const gameRoutes = (await import("./chess-server/routes/games.js" as any)).default;
    const userRoutes = (await import("./chess-server/routes/users.js" as any)).default;
    const coachRoutes = (await import("./chess-server/routes/coach.js" as any)).default;
    const engineRoutes = (await import("./chess-server/routes/engine.js" as any)).default;
    const authRoutes = (await import("./chess-server/routes/auth.js" as any)).default;
    const statsRoutes = (await import("./chess-server/routes/stats.js" as any)).default;

    app.use("/api/matchmaking", matchmakingRoutes);
    app.use("/api/games", gameRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/coach", coachRoutes);
    app.use("/api/engine", engineRoutes);
    app.use("/api/auth", authRoutes);
    app.use("/api/stats", statsRoutes);
  } catch (err) {
    console.error("Failed to load chess routes:", err);
  }
}

loadChessRoutes();

export default app;
