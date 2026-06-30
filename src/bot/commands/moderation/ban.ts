import {
  MessageFlags,
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
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer the reply since this might take a while
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
  const deletedMessages: Array<{
    timestamp: string;
    author: string;
    content: string;
    channel: string;
    attachments: Array<{ name: string; size: string }>;
  }> = [];

  const channels = await guild.channels.fetch();
  // bulkDelete only works on messages newer than 14 days, so there's no point
  // scanning (or trying to delete) anything older — that's what made this hang.
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  // Safety bound so a very busy channel can't page indefinitely.
  const MAX_SCAN_PER_CHANNEL = 1000;

  const textChannels = Array.from(channels.values()).filter(
    (channel): channel is import("discord.js").TextChannel =>
      !!channel && channel.type === ChannelType.GuildText,
  );

  // Collect and bulk-delete the banned user's recent messages in one channel,
  // paginating newest-first and stopping at the 14-day cutoff or the scan cap.
  const processChannel = async (
    channel: import("discord.js").TextChannel,
  ): Promise<number> => {
    let deletedHere = 0;
    let lastMessageId: string | undefined;
    let scanned = 0;

    try {
      while (scanned < MAX_SCAN_PER_CHANNEL) {
        const fetchOptions: { limit: number; before?: string } = { limit: 100 };
        if (lastMessageId) fetchOptions.before = lastMessageId;

        const messages = await channel.messages.fetch(fetchOptions);
        if (messages.size === 0) break;

        const toDelete: any[] = [];
        let reachedCutoff = false;

        for (const message of messages.values()) {
          scanned++;
          lastMessageId = message.id;

          // Messages are newest-first; stop once we pass the 14-day boundary.
          if (message.createdTimestamp < cutoff) {
            reachedCutoff = true;
            break;
          }

          if (message.author.id === userId) {
            deletedMessages.push({
              timestamp: new Date(message.createdTimestamp).toISOString(),
              author: message.author.tag,
              content: message.content || "(No text content)",
              channel: `#${channel.name}`,
              attachments: Array.from(message.attachments.values()).map(
                (att) => ({
                  name: att.name || "unknown",
                  size: formatFileSize(att.size),
                }),
              ),
            });
            toDelete.push(message);
          }
        }

        if (toDelete.length > 0) {
          try {
            const deleted = await channel.bulkDelete(toDelete, true);
            deletedHere += deleted.size;
          } catch (error) {
            logger.warn(
              `Failed to bulk delete messages in channel ${channel.id}:`,
              error,
            );
          }
        }

        if (reachedCutoff || messages.size < 100) break;
      }
    } catch (error) {
      logger.warn(
        `Error processing channel ${channel.name} (${channel.id}):`,
        error,
      );
    }

    return deletedHere;
  };

  // Channels are independent rate-limit buckets, so scan them in parallel
  // instead of one-after-another — far faster and won't appear to hang.
  const counts = await Promise.all(textChannels.map(processChannel));
  const totalDeleted = counts.reduce((sum, n) => sum + n, 0);

  // Generate transcript (chronological order)
  let transcriptFile: AttachmentBuilder | null = null;
  if (deletedMessages.length > 0) {
    deletedMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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
