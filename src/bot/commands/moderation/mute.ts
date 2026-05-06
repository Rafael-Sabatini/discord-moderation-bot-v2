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
  parseDuration,
  LOGGING_CHANNELS,
} from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a user")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to mute")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the mute")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration (e.g., 10m, 2h, 1d)")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        ephemeral: true,
      });
      return;
    }

    const userIdentifier = interaction.options.getString("user", true);
    const reason = interaction.options.getString("reason", true);
    const durationStr = interaction.options.getString("duration", true);

    const durationMs = parseDuration(durationStr);
    if (durationMs === 0) {
      await interaction.reply({
        content: "Invalid duration format! Use: 10s, 5m, 2h, or 1d",
        ephemeral: true,
      });
      return;
    }

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
      const expiryDate = new Date(Date.now() + durationMs);

      const mute = new Mute({
        userId: targetUser.id,
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        reason,
        expiryDate,
        isPermanent: false,
      });
      await mute.save();

      await member.timeout(durationMs, reason);

      await interaction.reply({
        content: `✅ User ${targetUser.tag} has been muted for ${durationStr}.\nReason: ${reason}`,
        ephemeral: true,
      });

      await sendLoggingEmbed(
        interaction.guild,
        LOGGING_CHANNELS.mutes,
        "🔇 User Muted",
        [
          {
            name: "User",
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: true,
          },
          { name: "Duration", value: durationStr, inline: true },
          { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
          { name: "Reason", value: reason, inline: false },
        ],
        0xffa500,
      );

      logger.info(
        `User ${targetUser.id} muted by ${interaction.user.id} for ${durationStr} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error muting user:", error);
      await interaction.reply({
        content: "An error occurred while muting the user.",
        ephemeral: true,
      });
    }
  },
};

export default command;
