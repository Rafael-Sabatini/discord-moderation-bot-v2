import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { BotCommand } from "../../client";
import { WarningConfig } from "../../../database/models/WarningConfig";
import { parseDuration } from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const ALLOWED_ROLES = [
  "1389665074444238960", // Head Moderator
  "1158116870600261712", // Admin
];

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("warningtreshold")
    .setDescription("Configure warning threshold for automatic actions")
    .addNumberOption((option) =>
      option
        .setName("warncount")
        .setDescription("Number of warnings before action is taken")
        .setRequired(true)
        .setMinValue(1),
    )
    .addBooleanOption((option) =>
      option
        .setName("ban")
        .setDescription("Ban the user after reaching threshold (yes/no)")
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("timeout")
        .setDescription("Timeout the user after reaching threshold (yes/no)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration for ban or timeout (e.g., 1h, 1d, 7d)")
        .setRequired(false),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if user has required role
    const memberRoles = interaction.member.roles;
    const hasRequiredRole =
      typeof memberRoles === "object" &&
      "cache" in memberRoles &&
      ALLOWED_ROLES.some((roleId) => memberRoles.cache.has(roleId));

    if (!hasRequiredRole) {
      await interaction.reply({
        content: "You need the Head Moderator or Admin role to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const warnCount = interaction.options.getNumber("warncount", true);
    const ban = interaction.options.getBoolean("ban") ?? false;
    const timeout = interaction.options.getBoolean("timeout") ?? false;
    const durationStr = interaction.options.getString("duration");

    if (!ban && !timeout) {
      await interaction.reply({
        content: "You must enable at least one action (ban or timeout)",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      let duration = 0;
      let durationDisplay = "Permanent";

      if (durationStr) {
        duration = parseDuration(durationStr);
        if (duration === 0) {
          await interaction.reply({
            content: "Invalid duration format! Use: 10s, 5m, 2h, or 1d",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        durationDisplay = durationStr;
      }

      await WarningConfig.findOneAndUpdate(
        { guildId: interaction.guild.id },
        {
          warnThreshold: warnCount,
          applyBan: ban,
          applyTimeout: timeout,
          duration,
        },
        { upsert: true, new: true }
      );

      const embed = new EmbedBuilder()
        .setTitle("✅ Warning Threshold Configured")
        .setColor(0x00ff00)
        .addFields(
          { name: "Threshold", value: `${warnCount} warnings`, inline: true },
          { name: "Action on Ban", value: ban ? "✅ Yes" : "❌ No", inline: true },
          { name: "Action on Timeout", value: timeout ? "✅ Yes" : "❌ No", inline: true },
          { name: "Duration", value: durationDisplay, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

      logger.info(
        `Warning threshold configured in guild ${interaction.guild.id}: ${warnCount} warnings, ban=${ban}, timeout=${timeout}, duration=${duration}`
      );
    } catch (error) {
      logger.error("Error configuring warning threshold:", error);
      await interaction.reply({
        content: "An error occurred while configuring the warning threshold.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
