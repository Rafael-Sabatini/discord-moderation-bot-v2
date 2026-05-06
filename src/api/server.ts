import express, { Express } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { BotClient } from "../bot/client";
import { logger } from "../utils/logger";

export function setupExpressAPI(bot: BotClient): Express {
  const app = express();
  const port = process.env.PORT || 3000;

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  });
  app.use(limiter);

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      botOnline: bot.isReady(),
      timestamp: new Date().toISOString(),
    });
  });

  // Bot info endpoint
  app.get("/info", (_req, res) => {
    if (!bot.isReady()) {
      return res.status(503).json({ error: "Bot not ready" });
    }
    return res.json({
      // ← add return here
      botTag: bot.user?.tag,
      botId: bot.user?.id,
      guilds: bot.guilds.cache.size,
      commands: bot.commands.size,
      uptime: bot.uptime,
    });
  });

  // TODO: Add route handlers
  // - POST /api/moderation/ban
  // - POST /api/moderation/kick
  // - POST /api/moderation/warn
  // - GET /api/users/:userId
  // - GET /api/rules/:guildId
  // - POST /api/rules

  // Error handling
  app.use((err: any, _req: any, res: any, _next: any) => {
    logger.error("Express error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.listen(port, () => {
    logger.info(`🚀 Express API listening on port ${port}`);
  });

  return app;
}
