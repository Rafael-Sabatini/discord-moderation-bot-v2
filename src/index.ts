import dotenv from "dotenv";
dotenv.config();
import { BotClient } from "./bot/client";
import { connectDatabase } from "./database/connection";
import { setupExpressAPI } from "./api/server";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  try {
    logger.info("🚀 Starting Discord Moderation Bot v2...");

    // Connect to MongoDB
    await connectDatabase();

    // Initialize Discord bot
    const bot = new BotClient();

    // Load commands and events
    await bot.loadCommands();
    await bot.loadEvents();

    // Deploy commands to Discord
    await bot.deployCommands();

    // Login to Discord
    const token = process.env.TOKEN;
    if (!token) {
      throw new Error("TOKEN environment variable is required");
    }

    await bot.login(token);

    // Setup Express API (runs alongside bot)
    setupExpressAPI(bot);

    logger.info("✅ Bot started successfully!");
  } catch (error) {
    logger.error("❌ Fatal error during startup:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  logger.info("🛑 Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("🛑 Shutting down gracefully...");
  process.exit(0);
});

main();
