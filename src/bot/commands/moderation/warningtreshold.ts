import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { BotCommand } from "../../client";
import { WarningConfig } from "../../../database/models/WarningConfig";
import { parseDuration } from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        ephemeral: true,
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
        ephemeral: true,
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
            ephemeral: true,
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

      await interaction.reply({ embeds: [embed], ephemeral: true });

      logger.info(
        `Warning threshold configured in guild ${interaction.guild.id}: ${warnCount} warnings, ban=${ban}, timeout=${timeout}, duration=${duration}`
      );
    } catch (error) {
      logger.error("Error configuring warning threshold:", error);
      await interaction.reply({
        content: "An error occurred while configuring the warning threshold.",
        ephemeral: true,
      });
    }
  },
};

export default command;
