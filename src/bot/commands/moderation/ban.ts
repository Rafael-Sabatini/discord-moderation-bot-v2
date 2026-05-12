import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import { BotCommand } from "../../client";
import { Ban } from "../../../database/models/Ban";
import {
  sendLoggingEmbed,
  resolveUser,
  parseDuration,
  LOGGING_CHANNELS,
} from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to ban")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the ban")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription(
          "Duration (e.g., 10m, 2h, 1d) - leave empty for permanent",
        )
        .setRequired(false),
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
    const reason = interaction.options.getString("reason", true);
    const durationStr = interaction.options.getString("duration");

    const targetUser = await resolveUser(interaction.guild, userIdentifier);
    if (!targetUser) {
      await interaction.reply({
        content: "Could not find that user!",
        ephemeral: true,
      });
      return;
    }

    try {
      let expiryDate: Date | null = null;
      let isPermanent = true;
      let durationDisplay = "Permanent";

      if (durationStr) {
        const durationMs = parseDuration(durationStr);
        if (durationMs === 0) {
          await interaction.reply({
            content: "Invalid duration format! Use: 10s, 5m, 2h, or 1d",
            ephemeral: true,
          });
          return;
        }
        expiryDate = new Date(Date.now() + durationMs);
        isPermanent = false;
        durationDisplay = durationStr;
      }

      const ban = new Ban({
        userId: targetUser.id,
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        reason,
        expiryDate,
        isPermanent,
      });
      await ban.save();

      // Ban the user
      await interaction.guild.members.ban(targetUser, { reason });

      // Delete all messages from the banned user
      let deletedCount = 0;
      try {
        deletedCount = await deleteUserMessages(
          interaction.guild,
          targetUser.id,
        );
      } catch (error) {
        logger.warn(
          `Failed to delete all messages for user ${targetUser.id}:`,
          error,
        );
        // Continue with the ban even if message deletion fails
      }

      await interaction.reply({
        content: `✅ User ${targetUser.tag} has been banned (${durationDisplay}).\n${deletedCount > 0 ? `Deleted ${deletedCount} message(s).\n` : ""}Reason: ${reason}`,
        ephemeral: true,
      });

      await sendLoggingEmbed(
        interaction.guild,
        LOGGING_CHANNELS.bans,
        "🔨 User Banned",
        [
          {
            name: "User",
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: true,
          },
          { name: "Duration", value: durationDisplay, inline: true },
          { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
          {
            name: "Messages Deleted",
            value: `${deletedCount}`,
            inline: true,
          },
          { name: "Reason", value: reason, inline: false },
        ],
        0xff0000,
      );

      logger.info(
        `User ${targetUser.id} banned by ${interaction.user.id} (${durationDisplay}) in guild ${interaction.guild.id}. Deleted ${deletedCount} messages.`,
      );
    } catch (error) {
      logger.error("Error banning user:", error);
      await interaction.reply({
        content: "An error occurred while banning the user.",
        ephemeral: true,
      });
    }
  },
};

/**
 * Deletes all messages from a specific user across all text channels in the guild
 * @param guild The Discord guild
 * @param userId The ID of the user whose messages should be deleted
 * @returns The total number of messages deleted
 */
async function deleteUserMessages(
  guild: import("discord.js").Guild,
  userId: string,
): Promise<number> {
  let totalDeleted = 0;

  // Fetch all channels in the guild
  const channels = await guild.channels.fetch();

  for (const channel of channels.values()) {
    // Only process text-based channels
    if (
      !channel ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildVoice)
    ) {
      continue;
    }

    try {
      // Fetch messages in batches and delete those from the user
      let lastMessageId: string | undefined;
      let batchDeleted = true;

      while (batchDeleted) {
        batchDeleted = false;
        const messages = await channel.messages.fetch({
          limit: 100,
          before: lastMessageId,
        });

        if (messages.size === 0) {
          break;
        }

        for (const message of messages.values()) {
          if (message.author.id === userId) {
            try {
              await message.delete();
              totalDeleted++;
              batchDeleted = true;
            } catch (error) {
              logger.warn(
                `Failed to delete message ${message.id} in channel ${channel.id}:`,
                error,
              );
            }
          }
          lastMessageId = message.id;
        }
      }
    } catch (error) {
      logger.warn(
        `Error processing channel ${channel.name} (${channel.id}):`,
        error,
      );
    }
  }

  return totalDeleted;
}

export default command;
