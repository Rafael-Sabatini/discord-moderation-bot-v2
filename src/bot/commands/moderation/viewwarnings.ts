import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { BotCommand } from "../../client";
import { Warning } from "../../../database/models/Warning";
import { logger } from "../../../utils/logger";
import { resolveUser } from "../../../utils/moderation";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("viewwarnings")
    .setDescription("View warnings for a user")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to view warnings for")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        ephemeral: true,
      });
      return;
    }

    const userIdentifier = interaction.options.getString("user", true);

    const targetUser = await resolveUser(interaction.guild, userIdentifier);
    if (!targetUser) {
      await interaction.reply({
        content: "Could not find that user!",
        ephemeral: true,
      });
      return;
    }

    try {
      const warnings = await Warning.find({
        userId: targetUser.id,
        guildId: interaction.guild.id,
      }).sort({ timestamp: -1 });

      if (warnings.length === 0) {
        await interaction.reply({
          content: `${targetUser.tag} has no warnings.`,
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Warnings for ${targetUser.tag}`)
        .setColor(0xffa500)
        .setFooter({ text: `Total warnings: ${warnings.length}` });

      warnings.forEach((warning, index) => {
        embed.addFields({
          name: `Warning #${index + 1}`,
          value: `**Moderator:** <@${warning.moderatorId}>\n**Reason:** ${warning.reason}\n**Date:** <t:${Math.floor(warning.timestamp.getTime() / 1000)}:f>`,
          inline: false,
        });
      });

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });

      logger.info(
        `Warnings viewed for user ${targetUser.id} by ${interaction.user.id} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error viewing warnings:", error);
      await interaction.reply({
        content: "An error occurred while viewing warnings.",
        ephemeral: true,
      });
    }
  },
};

export default command;
