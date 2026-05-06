import {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { logger } from "../utils/logger";
import fs from "fs";
import path from "path";

export interface BotCommand {
  data: SlashCommandBuilder | any;
  execute: (interaction: any) => Promise<void>;
}

export class BotClient extends Client {
  public commands: Collection<string, BotCommand> = new Collection();
  private commandsPath: string = path.join(__dirname, "..", "bot", "commands");

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.on("ready", () => {
      if (this.user) {
        logger.info(`✅ Bot logged in as ${this.user.tag}`);
        logger.info(`📊 Loaded ${this.commands.size} commands`);
      }
    });

    this.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`Unknown command: ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error(
          `Error executing command ${interaction.commandName}:`,
          error,
        );
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "There was an error executing this command!",
          });
        } else {
          await interaction.reply({
            content: "There was an error executing this command!",
          });
        }
      }
    });
  }

  public async loadCommands(): Promise<void> {
    const categoryFolders = fs.readdirSync(this.commandsPath);

    for (const folder of categoryFolders) {
      const folderPath = path.join(this.commandsPath, folder);

      if (!fs.statSync(folderPath).isDirectory()) continue;

      const commandFiles = fs
        .readdirSync(folderPath)
        .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

      logger.info(
        `📂 Loading commands from ${folder}: found ${commandFiles.length} files`,
      );

      for (const file of commandFiles) {
        try {
          const filePath = path.join(folderPath, file);
          delete require.cache[require.resolve(filePath)];
          const command: BotCommand = require(filePath).default;

          if (!command.data || !command.data.name) {
            logger.warn(`⚠️  Command ${file} is missing required data`);
            continue;
          }

          this.commands.set(command.data.name, command);
          logger.info(`✅ Loaded command: ${command.data.name}`);
        } catch (error) {
          logger.error(`❌ Error loading command ${file}:`, error);
        }
      }
    }
  }

  public async loadEvents(): Promise<void> {
    const eventsPath = path.join(__dirname, "..", "bot", "events");
    const eventFiles = fs
      .readdirSync(eventsPath)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

    logger.info(`📂 Loading ${eventFiles.length} events`);

    for (const file of eventFiles) {
      try {
        const filePath = path.join(eventsPath, file);
        delete require.cache[require.resolve(filePath)];
        const event = require(filePath).default;

        if (!event.name) {
          logger.warn(`⚠️  Event ${file} is missing a name`);
          continue;
        }

        this.on(event.name, (...args) => event.execute(this, ...args));
        logger.info(`✅ Loaded event: ${event.name}`);
      } catch (error) {
        logger.error(`❌ Error loading event ${file}:`, error);
      }
    }
  }

  public async deployCommands(): Promise<void> {
    const token = process.env.TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!token || !clientId) {
      throw new Error("TOKEN and CLIENT_ID environment variables are required");
    }

    const commands = Array.from(this.commands.values()).map((cmd) =>
      cmd.data.toJSON(),
    );

    logger.info(`Deploying ${commands.length} commands...`);

    try {
      const rest = new REST({ version: "10" }).setToken(token);

      if (guildId) {
        logger.info(`📤 Deploying commands to guild: ${guildId}`);
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
          body: commands,
        });
        logger.info(
          `✅ Successfully deployed ${commands.length} commands to guild`,
        );
      } else {
        logger.info(`📤 Deploying commands globally`);
        await rest.put(Routes.applicationCommands(clientId), {
          body: commands,
        });
        logger.info(
          `✅ Successfully deployed ${commands.length} global commands (may take up to 1 hour)`,
        );
      }
    } catch (error) {
      logger.error("❌ Failed to deploy commands:", error);
      throw error;
    }
  }
}
