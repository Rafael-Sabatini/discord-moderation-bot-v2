import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { BotCommand } from "../../client";
import { Servermute } from "../../../database/models/Servermute";
import {
  sendLoggingEmbed,
  resolveUser,
  LOGGING_CHANNELS,
} from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("serverunmute")
    .setDescription("Server unmute a user")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to server unmute")
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
      const servermute = await Servermute.findOne({
        userId: targetUser.id,
        guildId: interaction.guild.id,
        isActive: true,
      });

      if (!servermute) {
        await interaction.reply({
          content: `${targetUser.tag} is not server muted!`,
          ephemeral: true,
        });
        return;
      }

      servermute.isActive = false;
      await servermute.save();

      await interaction.reply({
        content: `✅ User ${targetUser.tag} has been server unmuted.`,
        ephemeral: true,
      });

      await sendLoggingEmbed(
        interaction.guild,
        LOGGING_CHANNELS.servermutes,
        "🔊 User Server Unmuted",
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
        `User ${targetUser.id} server unmuted by ${interaction.user.id} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error server unmuting user:", error);
      await interaction.reply({
        content: "An error occurred while server unmuting the user.",
        ephemeral: true,
      });
    }
  },
};

export default command;
