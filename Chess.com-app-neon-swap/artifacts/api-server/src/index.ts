import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  path: "/socket.io",
});

// Dynamically import JS chess socket handlers
async function setupSocketHandlers() {
  try {
    const { registerSocketHandlers } = await import("./chess-server/socket/index.js" as any);
    io.on("connection", (socket: any) => {
      logger.info({ socketId: socket.id }, "Socket client connected");
      registerSocketHandlers(io, socket);
    });
  } catch (err) {
    logger.error({ err }, "Failed to load socket handlers");
  }
}

async function startServer() {
  await setupSocketHandlers();

  // Initialize DB
  try {
    const { initDatabase } = await import("./chess-server/db.js" as any);
    await initDatabase();
    logger.info("Database initialized");
  } catch (err) {
    logger.warn({ err }, "DB init failed — will retry on first query");
  }

  httpServer.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Fatal server error");
  process.exit(1);
});
