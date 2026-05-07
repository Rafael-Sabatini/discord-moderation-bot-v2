import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { BotCommand } from "../../client";
import { Mute } from "../../../database/models/Mute";
import {
  sendLoggingEmbed,
  resolveUser,
  LOGGING_CHANNELS,
} from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Unmute a user (removes timeout)")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to unmute")
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
      await interaction.deferReply({ ephemeral: true });

      const member = await interaction.guild.members.fetch(targetUser.id);

      // Check if user has an active mute record in database
      const mute = await Mute.findOne({
        userId: targetUser.id,
        guildId: interaction.guild.id,
        isActive: true,
      });

      // Check if user is actually timed out (has an active timeout)
      const isTimedOut = member.communicationDisabledUntil !== null;

      // If no mute record and no timeout, user is not muted
      if (!mute && !isTimedOut) {
        await interaction.editReply({
          content: `${targetUser.tag} is not muted or timed out!`,
        });
        return;
      }

      // Deactivate the mute record if it exists
      if (mute) {
        mute.isActive = false;
        await mute.save();
      }

      // Remove the timeout (if one exists)
      if (isTimedOut) {
        await member.timeout(null, "Unmuted by moderator");
      }

      await interaction.editReply({
        content: `✅ User ${targetUser.tag} has been unmuted.`,
      });

      await sendLoggingEmbed(
        interaction.guild,
        LOGGING_CHANNELS.mutes,
        "🔊 User Unmuted",
        [
          {
            name: "User",
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: true,
          },
          {
            name: "Moderator",
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: true,
          },
          {
            name: "Reason",
            value: mute ? "Database mute removed" : "Timeout removed",
            inline: true,
          },
        ],
        0x00ff00,
      );

      logger.info(
        `User ${targetUser.id} unmuted by ${interaction.user.id} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error unmuting user:", error);
      await interaction.editReply({
        content: "An error occurred while unmuting the user.",
      });
    }
  },
};

export default command;
