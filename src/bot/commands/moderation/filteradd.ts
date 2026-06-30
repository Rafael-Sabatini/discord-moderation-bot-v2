import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { BotCommand } from "../../client";
import { BlockedWord } from "../../../database/models/BlockedWord";
import { logger } from "../../../utils/logger";
const ALLOWED_ROLES = [
  "1389665074444238960", // Head Moderator
  "1158116870600261712", // Admin
];

const command: BotCommand = {
  data: new SlashCommandBuilder()

    .setName("filteradd")
    .setDescription("Add a regex filter rule")
    .addStringOption((option) =>
      option
        .setName("rulename")
        .setDescription("Name for this filter rule")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("regex")
        .setDescription("Regular expression pattern to match")
        .setRequired(true),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild || !interaction.user || !interaction.member) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const memberRoles = interaction.member.roles;
    const hasRequiredRole =
      typeof memberRoles === "object" &&
      "cache" in memberRoles &&
      ALLOWED_ROLES.some((roleId) => memberRoles.cache.has(roleId));

    if (!hasRequiredRole) {
      await interaction.reply({
        content:
          "You need the Head Moderator or Admin role to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const ruleName = interaction.options.getString("rulename", true);
    const regex = interaction.options.getString("regex", true);

    try {
      // Validate regex
      try {
        new RegExp(regex);
      } catch (e) {
        await interaction.reply({
          content: `Invalid regex pattern: ${e instanceof Error ? e.message : "Unknown error"}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Check if rule name already exists
      const existingRule = await BlockedWord.findOne({
        guildId: interaction.guild.id,
        ruleName: ruleName,
      });

      if (existingRule) {
        await interaction.reply({
          content: "A rule with that name already exists!",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Create a new blocked word entry
      const newRule = new BlockedWord({
        guildId: interaction.guild.id,
        ruleName: ruleName,
        pattern: regex,
        severity: "non-critical",
        createdBy: interaction.user.id,
      });

      await newRule.save();

      const embed = new EmbedBuilder()
        .setTitle("✅ Filter Rule Added")
        .setColor(0x00ff00)
        .addFields(
          { name: "Rule Name", value: ruleName, inline: true },
          { name: "Pattern", value: `\`\`\`${regex}\`\`\``, inline: false },
          { name: "Severity", value: "non-critical", inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

      logger.info(
        `Filter rule "${ruleName}" added to guild ${interaction.guild.id} by ${interaction.user.tag}`
      );
    } catch (error) {
      logger.error("Error adding filter rule:", error);
      await interaction.reply({
        content: "An error occurred while adding the filter rule.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
