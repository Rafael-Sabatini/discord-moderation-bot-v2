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
    .setDescription("Unmute a user")
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
      const member = await interaction.guild.members.fetch(targetUser.id);

      const mute = await Mute.findOne({
        userId: targetUser.id,
        guildId: interaction.guild.id,
        isActive: true,
      });

      if (!mute) {
        await interaction.reply({
          content: `${targetUser.tag} is not muted!`,
          ephemeral: true,
        });
        return;
      }

      mute.isActive = false;
      await mute.save();

      await member.timeout(null);

      await interaction.reply({
        content: `✅ User ${targetUser.tag} has been unmuted.`,
        ephemeral: true,
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
          { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
        ],
        0x00ff00,
      );

      logger.info(
        `User ${targetUser.id} unmuted by ${interaction.user.id} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error unmuting user:", error);
      await interaction.reply({
        content: "An error occurred while unmuting the user.",
        ephemeral: true,
      });
    }
  },
};

export default command;
