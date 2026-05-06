import { REST, Routes } from "discord.js";
import { BotClient } from "./bot/client";
import { logger } from "./utils/logger";
import dotenv from "dotenv";
dotenv.config();

async function deployCommands(): Promise<void> {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token || !clientId) {
    throw new Error("TOKEN and CLIENT_ID environment variables are required");
  }

  const bot = new BotClient();
  await bot.loadCommands();

  const commands = Array.from(bot.commands.values()).map((cmd) =>
    cmd.data.toJSON(),
  );

  logger.info(`Deploying ${commands.length} commands...`);

  try {
    const rest = new REST({ version: "10" }).setToken(token);

    const guildId = process.env.GUILD_ID;
    if (guildId) {
      logger.info(`📤 Deploying to guild: ${guildId}`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
    } else {
      logger.info(`📤 Deploying globally`);
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
    }

    logger.info("✅ Commands deployed successfully");
  } catch (error) {
    logger.error("❌ Failed to deploy commands:", error);
    throw error;
  }
}

deployCommands().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
