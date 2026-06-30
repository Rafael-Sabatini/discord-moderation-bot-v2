import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { BotCommand } from "../../client";
import { Warning } from "../../../database/models/Warning";
import {
  sendLoggingEmbed,
  resolveUser,
  LOGGING_CHANNELS,
} from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to warn")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the warning")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userIdentifier = interaction.options.getString("user", true);
    const reason = interaction.options.getString("reason", true);

    const targetUser = await resolveUser(interaction.guild, userIdentifier);
    if (!targetUser) {
      await interaction.reply({
        content: "Could not find that user!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const warning = new Warning({
        userId: targetUser.id,
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        reason,
      });
      await warning.save();

      await interaction.reply({
        content: `✅ User ${targetUser.tag} has been warned.\nReason: ${reason}`,
        flags: MessageFlags.Ephemeral,
      });

      await sendLoggingEmbed(
        interaction.guild,
        LOGGING_CHANNELS.warnings,
        "⚠️ User Warned",
        [
          {
            name: "User",
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: true,
          },
          { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
          { name: "Reason", value: reason, inline: false },
          { name: "Warning ID", value: warning._id.toString(), inline: true },
        ],
        0xffa500,
      );

      logger.info(
        `User ${targetUser.id} warned by ${interaction.user.id} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error warning user:", error);
      await interaction.reply({
        content: "An error occurred while warning the user.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
