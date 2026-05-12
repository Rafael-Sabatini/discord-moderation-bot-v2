import { Message, EmbedBuilder, ChannelType } from "discord.js";
import { BotClient } from "../client";
import { MessageLog } from "../../database/models/MessageLog";
import { logger } from "../../utils/logger";

const LOGGING_CHANNEL_ID = "1403026519118581863";

export default {
  name: "messageUpdate",
  async execute(client: BotClient, oldMessage: Message, newMessage: Message) {
    try {
      // Ignore bot messages and DMs
      if (newMessage.author?.bot || newMessage.channel?.type === ChannelType.DM)
        return;
      if (!newMessage.guild) return;

      // Ignore if content didn't change (only embeds changed, etc.)
      if (oldMessage.content === newMessage.content) return;

      // Get the guild
      const guild = newMessage.guild;
      const loggingChannel = await guild.channels
        .fetch(LOGGING_CHANNEL_ID)
        .catch(() => null);
      if (!loggingChannel || !loggingChannel.isTextBased()) {
        logger.warn(
          `Logging channel ${LOGGING_CHANNEL_ID} not found or is not a text channel`,
        );
        return;
      }

      // Truncate long messages for readability
      const maxLength = 256;
      const oldContent =
        oldMessage.content && oldMessage.content.length > maxLength
          ? oldMessage.content.substring(0, maxLength - 3) + "..."
          : oldMessage.content || "*No text content*";

      const newContent =
        newMessage.content && newMessage.content.length > maxLength
          ? newMessage.content.substring(0, maxLength - 3) + "..."
          : newMessage.content || "*No text content*";

      // Create minimalistic embed
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("Message Edited")
        .setAuthor({
          name: newMessage.author.tag,
          iconURL: newMessage.author.displayAvatarURL({ size: 64 }),
        })
        .addFields(
          {
            name: "Channel",
            value: `<#${newMessage.channelId}>`,
            inline: true,
          },
          {
            name: "Before",
            value: oldContent,
            inline: false,
          },
          {
            name: "After",
            value: newContent,
            inline: false,
          },
        )
        .setTimestamp();

      // Extract and add images from attachments
      const images = newMessage.attachments.filter((attachment) =>
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
            value: `${images.size} image(s) in message`,
            inline: true,
          });
        }
      }

      // Send to logging channel
      await loggingChannel.send({ embeds: [embed] });

      // Log to database
      await MessageLog.create({
        guildId: newMessage.guildId,
        channelId: newMessage.channelId,
        messageId: newMessage.id,
        authorId: newMessage.author.id,
        authorTag: newMessage.author.tag,
        content: newMessage.content,
        action: "edited",
        oldContent: oldMessage.content,
        newContent: newMessage.content,
      });

      logger.info(
        `Message edited - Author: ${newMessage.author.tag}, Channel: ${newMessage.channelId}`,
      );
    } catch (error) {
      logger.error("Error handling messageUpdate event:", error);
    }
  },
};
