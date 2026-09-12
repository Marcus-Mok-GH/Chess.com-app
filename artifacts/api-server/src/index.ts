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

async function startServer() {
  // Initialize DB
  try {
    const { initDatabase } = await import("./chess-server/db.js" as any);
    await initDatabase();
    logger.info("Database initialized");
  } catch (err) {
    logger.warn({ err }, "DB init failed — will retry on first query");
  }

  app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Fatal server error");
  process.exit(1);
});