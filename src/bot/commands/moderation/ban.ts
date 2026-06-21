import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
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

    // Defer the reply since this might take a while
    await interaction.deferReply({ ephemeral: true });

    try {
      let expiryDate: Date | null = null;
      let isPermanent = true;
      let durationDisplay = "Permanent";

      if (durationStr) {
        const durationMs = parseDuration(durationStr);
        if (durationMs === 0) {
          await interaction.editReply({
            content: "Invalid duration format! Use: 10s, 5m, 2h, or 1d",
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

      // Ban the user first
      await interaction.guild.members.ban(targetUser, { reason });

      // Delete all messages from the banned user and get transcript
      let deletedCount = 0;
      let transcriptFile: AttachmentBuilder | null = null;

      try {
        const result = await deleteUserMessagesWithTranscript(
          interaction.guild,
          targetUser.id,
        );
        deletedCount = result.count;
        transcriptFile = result.attachment;
      } catch (error) {
        logger.warn(
          `Failed to delete messages for user ${targetUser.id}:`,
          error,
        );
        // Continue with the ban even if message deletion fails
      }

      // Send the reply
      await interaction.editReply({
        content: `✅ User ${targetUser.tag} has been banned (${durationDisplay}).\n${deletedCount > 0 ? `Deleted ${deletedCount} message(s).\n` : ""}Reason: ${reason}`,
      });

      // Send logging embed with transcript
      const loggingChannel = await interaction.guild.channels.fetch(
        LOGGING_CHANNELS.bans,
      );

      if (loggingChannel && loggingChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🔨 User Banned")
          .addFields(
            {
              name: "User",
              value: `${targetUser.tag} (${targetUser.id})`,
              inline: true,
            },
            { name: "Duration", value: durationDisplay, inline: true },
            {
              name: "Moderator",
              value: `${interaction.user.tag}`,
              inline: true,
            },
            {
              name: "Messages Deleted",
              value: `${deletedCount}`,
              inline: true,
            },
            { name: "Reason", value: reason, inline: false },
          )
          .setTimestamp();

        const messageData: {
          embeds: EmbedBuilder[];
          files?: AttachmentBuilder[];
        } = {
          embeds: [embed],
        };

        if (transcriptFile) {
          messageData.files = [transcriptFile];
        }

        await loggingChannel.send(messageData);
      }

      logger.info(
        `User ${targetUser.id} banned by ${interaction.user.id} (${durationDisplay}) in guild ${interaction.guild.id}. Deleted ${deletedCount} messages.`,
      );
    } catch (error) {
      logger.error("Error banning user:", error);
      await interaction.editReply({
        content: "An error occurred while banning the user.",
      });
    }
  },
};

/**
 * Deletes all messages from a specific user and creates a transcript
 * @param guild The Discord guild
 * @param userId The ID of the user whose messages should be deleted
 * @returns Object containing the count of deleted messages and transcript attachment
 */
async function deleteUserMessagesWithTranscript(
  guild: import("discord.js").Guild,
  userId: string,
): Promise<{ count: number; attachment: AttachmentBuilder | null }> {
  let totalDeleted = 0;
  const deletedMessages: Array<{
    timestamp: string;
    author: string;
    content: string;
    channel: string;
    attachments: Array<{ name: string; size: string }>;
  }> = [];

  // Fetch all channels in the guild
  const channels = await guild.channels.fetch();
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  for (const channel of channels.values()) {
    // Only process text-based channels
    if (!channel || channel.type !== ChannelType.GuildText) {
      continue;
    }

    try {
      let lastMessageId: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const messages = await channel.messages.fetch({
          limit: 100,
          before: lastMessageId,
        });

        if (messages.size === 0) {
          break;
        }

        // Separate messages into bulk-deletable (newer than 2 weeks) and old
        const bulkDeleteable: Array<any> = [];
        const oldMessages: Array<any> = [];

        for (const message of messages.values()) {
          if (message.author.id === userId) {
            // Store message info for transcript
            deletedMessages.push({
              timestamp: new Date(message.createdTimestamp).toISOString(),
              author: message.author.tag,
              content: message.content || "(No text content)",
              channel: `#${(channel as any).name}`,
              attachments: Array.from(message.attachments.values()).map(
                (att) => ({
                  name: att.name || "unknown",
                  size: formatFileSize(att.size),
                }),
              ),
            });

            // Categorize for deletion
            if (message.createdTimestamp > twoWeeksAgo) {
              bulkDeleteable.push(message);
            } else {
              oldMessages.push(message);
            }
          }
          lastMessageId = message.id;
        }

        // Bulk delete messages (much faster - up to 100 at a time)
        if (bulkDeleteable.length > 0) {
          try {
            const deleted = await (channel as any).bulkDelete(bulkDeleteable, true);
            totalDeleted += deleted.size;
          } catch (error) {
            logger.warn(
              `Failed to bulk delete messages in channel ${channel.id}:`,
              error,
            );
          }
        }

        // Delete old messages individually (can't bulk delete messages older than 2 weeks)
        for (const message of oldMessages) {
          try {
            await message.delete();
            totalDeleted++;
          } catch (error) {
            logger.warn(
              `Failed to delete message ${message.id} in channel ${channel.id}:`,
              error,
            );
          }
        }

        // Check if we should continue
        if (messages.size < 100) {
          hasMore = false;
        }
      }
    } catch (error) {
      logger.warn(
        `Error processing channel ${(channel as any).name} (${channel.id}):`,
        error,
      );
    }
  }

  // Generate transcript
  let transcriptFile: AttachmentBuilder | null = null;
  if (deletedMessages.length > 0) {
    const transcript = generateBanTranscript(deletedMessages, guild.name);
    const transcriptBuffer = Buffer.from(transcript);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    transcriptFile = new AttachmentBuilder(transcriptBuffer, {
      name: `ban_transcript_${userId}_${timestamp}.txt`,
    });
  }

  return { count: totalDeleted, attachment: transcriptFile };
}

/**
 * Generates a transcript of deleted messages from a ban
 * @param messages Array of deleted messages
 * @param guildName Name of the guild
 * @returns Formatted transcript string
 */
function generateBanTranscript(
  messages: Array<{
    timestamp: string;
    author: string;
    content: string;
    channel: string;
    attachments: Array<{ name: string; size: string }>;
  }>,
  guildName: string,
): string {
  let transcript = `=== BAN MESSAGE TRANSCRIPT ===\n`;
  transcript += `Guild: ${guildName}\n`;
  transcript += `Purged: ${new Date().toISOString()}\n`;
  transcript += `Total Messages: ${messages.length}\n`;
  transcript += `${"=".repeat(50)}\n\n`;

  for (const msg of messages) {
    transcript += `[${msg.timestamp}] ${msg.author} in ${msg.channel}:\n`;
    transcript += `${msg.content}\n`;

    if (msg.attachments.length > 0) {
      transcript += `Attachments:\n`;
      msg.attachments.forEach((att) => {
        transcript += `  - ${att.name} (${att.size})\n`;
      });
    }

    transcript += `\n`;
  }

  transcript += `${"=".repeat(50)}\n`;
  transcript += `End of transcript`;

  return transcript;
}

/**
 * Formats file size in human-readable format
 * @param bytes File size in bytes
 * @returns Formatted file size string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export default command;
