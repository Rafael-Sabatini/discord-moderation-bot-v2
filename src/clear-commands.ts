import { REST, Routes } from "discord.js";
import { logger } from "./utils/logger";
import dotenv from "dotenv";
dotenv.config();

async function clearCommands(): Promise<void> {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    throw new Error("TOKEN and CLIENT_ID environment variables are required");
  }

  try {
    const rest = new REST({ version: "10" }).setToken(token);

    // Clear global commands
    logger.info("🧹 Clearing global commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    logger.info("✅ Global commands cleared");

    // Clear guild commands if GUILD_ID is set
    if (guildId) {
      logger.info(`🧹 Clearing guild commands for: ${guildId}`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: [],
      });
      logger.info(`✅ Guild commands cleared for ${guildId}`);
    }

    logger.info("✅ All commands cache cleared successfully");
  } catch (error) {
    logger.error("❌ Failed to clear commands:", error);
    throw error;
  }
}

clearCommands().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
