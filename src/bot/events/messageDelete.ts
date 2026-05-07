import { Message, EmbedBuilder, ChannelType } from "discord.js";
import { BotClient } from "../client";
import { MessageLog } from "../../database/models/MessageLog";
import { logger } from "../../utils/logger";

const LOGGING_CHANNEL_ID = "1403026519118581863";

export default {
  name: "messageDelete",
  async execute(client: BotClient, message: Message) {
    try {
      // Ignore bot messages and DMs
      if (message.author?.bot || message.channel?.type === ChannelType.DM)
        return;
      if (!message.guild) return;

      // Get the guild
      const guild = message.guild;
      const loggingChannel = await guild.channels
        .fetch(LOGGING_CHANNEL_ID)
        .catch(() => null);
      if (!loggingChannel || !loggingChannel.isTextBased()) {
        logger.warn(
          `Logging channel ${LOGGING_CHANNEL_ID} not found or is not a text channel`,
        );
        return;
      }

      // Try to get the user who deleted the message from audit logs
      let deletedBy = "Unknown";
      let deletedByTag = "Unknown";
      let deletedById = null;
      try {
        const auditLogs = await guild.fetchAuditLogs({
          type: 72, // MESSAGE_DELETE
          limit: 5,
        });
        const deleteLog = auditLogs.entries.find(
          (entry) =>
            entry.targetId === message.id &&
            Date.now() - entry.createdTimestamp < 5000, // Within 5 seconds
        );
        if (deleteLog && deleteLog.executor) {
          deletedBy = deleteLog.executor.username;
          deletedByTag = deleteLog.executor.tag;
          deletedById = deleteLog.executor.id;
        }
      } catch (error) {
        logger.warn("Could not fetch audit logs for message deletion:", error);
      }

      // Create embed with improved styling
      const embed = new EmbedBuilder()
        .setColor(0xff4444) // Vibrant red
        .setTitle("🗑️ Message Deleted")
        .setAuthor({
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL({ size: 64 }),
        })
        .setDescription(
          message.content
            ? `\`\`\`\n${message.content.substring(0, 1024)}\n\`\`\``
            : "*No text content*",
        )
        .addFields(
          {
            name: "👤 Author",
            value: `<@${message.author.id}> (${message.author.id})`,
            inline: true,
          },
          {
            name: "📍 Channel",
            value: `<#${message.channelId}>`,
            inline: true,
          },
          {
            name: "🔨 Deleted By",
            value: deletedById
              ? `<@${deletedById}> (${deletedByTag})`
              : "`Unknown`",
            inline: true,
          },
          {
            name: "⏰ Created",
            value: `<t:${Math.floor(message.createdTimestamp / 1000)}:f>`,
            inline: true,
          },
          {
            name: "📌 Message ID",
            value: `\`${message.id}\``,
            inline: true,
          },
          {
            name: "💬 Channel ID",
            value: `\`${message.channelId}\``,
            inline: true,
          },
        )
        .setFooter({
          text: `User ID: ${message.author.id}`,
          iconURL: message.author.displayAvatarURL({ size: 32 }),
        })
        .setTimestamp();

      // Send to logging channel
      await loggingChannel.send({ embeds: [embed] });

      // Log to database
      await MessageLog.create({
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        authorId: message.author.id,
        authorTag: message.author.tag,
        content: message.content,
        action: "deleted",
        actionBy: deletedById,
        actionByTag: deletedByTag,
      });

      logger.info(
        `Message deleted - Author: ${message.author.tag}, Deleted by: ${deletedByTag}`,
      );
    } catch (error) {
      logger.error("Error handling messageDelete event:", error);
    }
  },
};
