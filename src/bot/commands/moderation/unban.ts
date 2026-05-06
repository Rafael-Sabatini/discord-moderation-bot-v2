import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { BotCommand } from "../../client";
import { Ban } from "../../../database/models/Ban";
import {
  sendLoggingEmbed,
  resolveUser,
  LOGGING_CHANNELS,
} from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to unban")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

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
      const ban = await Ban.findOne({
        userId: targetUser.id,
        guildId: interaction.guild.id,
        isActive: true,
      });

      if (!ban) {
        await interaction.reply({
          content: `${targetUser.tag} is not banned!`,
          ephemeral: true,
        });
        return;
      }

      ban.isActive = false;
      await ban.save();

      await interaction.guild.bans.remove(targetUser);

      await interaction.reply({
        content: `✅ User ${targetUser.tag} has been unbanned.`,
        ephemeral: true,
      });

      await sendLoggingEmbed(
        interaction.guild,
        LOGGING_CHANNELS.bans,
        "🔓 User Unbanned",
        [
          {
            name: "User",
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: true,
          },
          { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
        ],
        0x00ff00,
      );

      logger.info(
        `User ${targetUser.id} unbanned by ${interaction.user.id} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error unbanning user:", error);
      await interaction.reply({
        content: "An error occurred while unbanning the user.",
        ephemeral: true,
      });
    }
  },
};

export default command;
