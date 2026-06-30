import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { BotCommand } from "../../client";
import { Warning } from "../../../database/models/Warning";
import { sendLoggingEmbed, LOGGING_CHANNELS } from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("remwarn")
    .setDescription("Remove a warning")
    .addStringOption((option) =>
      option
        .setName("warnid")
        .setDescription("Warning ID to remove")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const warnId = interaction.options.getString("warnid", true);

    try {
      const warning = await Warning.findById(warnId);

      if (!warning) {
        await interaction.reply({
          content: "Warning not found!",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (warning.guildId !== interaction.guild.id) {
        await interaction.reply({
          content: "This warning is not from this server!",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const userId = warning.userId;
      const reason = warning.reason;

      await Warning.findByIdAndDelete(warnId);

      const user = await interaction.client.users.fetch(userId);

      await interaction.reply({
        content: `✅ Warning removed for ${user.tag}`,
        flags: MessageFlags.Ephemeral,
      });

      await sendLoggingEmbed(
        interaction.guild,
        LOGGING_CHANNELS.warnings,
        "✅ Warning Removed",
        [
          { name: "User", value: `${user.tag} (${user.id})`, inline: true },
          { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
          { name: "Original Reason", value: reason, inline: false },
          { name: "Warning ID", value: warnId, inline: true },
        ],
        0x00ff00,
      );

      logger.info(
        `Warning ${warnId} removed by ${interaction.user.id} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error removing warning:", error);
      await interaction.reply({
        content: "An error occurred while removing the warning.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
