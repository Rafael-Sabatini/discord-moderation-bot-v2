import { Message, EmbedBuilder, ChannelType } from "discord.js";
import { BotClient } from "../client";
import { MessageLog } from "../../database/models/MessageLog";
import { logger } from "../../utils/logger";

const LOGGING_CHANNEL_ID = "1403026519118581863";

export default {
  name: "messageDelete",
  async execute(_client: BotClient, message: Message) {
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
      let deletedByTag = "Unknown";
      let deletedById: string | null = null;
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
          deletedByTag = deleteLog.executor.tag || "Unknown";
          deletedById = deleteLog.executor.id || null;
        }
      } catch (error) {
        logger.warn("Could not fetch audit logs for message deletion:", error);
      }

      // Create minimalistic embed
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle("Message Deleted")
        .setAuthor({
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL({ size: 64 }),
        })
        .addFields({
          name: "Channel",
          value: `<#${message.channelId}>`,
          inline: true,
        });

      // Add deleted by info if available
      if (deletedById) {
        embed.addFields({
          name: "Deleted by",
          value: `<@${deletedById}>`,
          inline: true,
        });
      }

      // Add content if present
      if (message.content) {
        const truncatedContent =
          message.content.length > 256
            ? message.content.substring(0, 253) + "..."
            : message.content;
        embed.addFields({
          name: "Content",
          value: truncatedContent,
          inline: false,
        });
      }

      // Extract and add images from attachments
      const images = message.attachments.filter((attachment) =>
        attachment.contentType?.startsWith("image/"),
      );

      if (images.size > 0) {
        // Set the first image as the embed image
        const firstImage = images.first();
        if (firstImage) {
          embed.setImage(firstImage.url);
        }

        // If there are multiple images, add info about them
        if (images.size > 1) {
          embed.addFields({
            name: "Attachments",
            value: `${images.size} image(s) deleted`,
            inline: true,
          });
        }
      }

      embed.setTimestamp();

      // Send to logging channel
      await loggingChannel.send({ embeds: [embed] });

      // Log to database
      if (message.guildId && message.channelId) {
        await MessageLog.create({
          guildId: message.guildId,
          channelId: message.channelId,
          messageId: message.id,
          authorId: message.author.id,
          authorTag: message.author.tag,
          content: message.content,
          action: "deleted",
          actionBy: deletedById || undefined,
          actionByTag: deletedByTag,
        });
      }

      logger.info(
        `Message deleted - Author: ${message.author.tag}, Deleted by: ${deletedByTag}, Channel: ${message.channelId}`,
      );
    } catch (error) {
      logger.error("Error handling messageDelete event:", error);
    }
  },
};
