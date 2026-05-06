import { Message, EmbedBuilder, ChannelType } from 'discord.js';
import { BotClient } from '../client';
import { MessageLog } from '../../database/models/MessageLog';
import { logger } from '../../utils/logger';

const LOGGING_CHANNEL_ID = '1403026519118581863';

export default {
  name: 'messageUpdate',
  async execute(client: BotClient, oldMessage: Message, newMessage: Message) {
    try {
      // Ignore bot messages and DMs
      if (newMessage.author?.bot || newMessage.channel?.type === ChannelType.DM) return;
      if (!newMessage.guild) return;

      // Ignore if content didn't change (only embeds changed, etc.)
      if (oldMessage.content === newMessage.content) return;

      // Get the guild
      const guild = newMessage.guild;
      const loggingChannel = await guild.channels.fetch(LOGGING_CHANNEL_ID).catch(() => null);

      if (!loggingChannel || !loggingChannel.isTextBased()) {
        logger.warn(`Logging channel ${LOGGING_CHANNEL_ID} not found or is not a text channel`);
        return;
      }

      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0xFFA500) // Orange
        .setTitle('✏️ Message Edited')
        .addFields(
          { name: 'Author', value: `${newMessage.author.tag} (${newMessage.author.id})`, inline: false },
          { name: 'Channel', value: `${newMessage.channel} (${newMessage.channelId})`, inline: false },
          {
            name: 'Before',
            value: oldMessage.content || '*[Empty Message]*',
            inline: false,
          },
          {
            name: 'After',
            value: newMessage.content || '*[Empty Message]*',
            inline: false,
          },
          { name: 'Message ID', value: newMessage.id, inline: true },
          { name: 'Timestamp', value: `<t:${Math.floor(newMessage.createdTimestamp / 1000)}:f>`, inline: true }
        )
        .setTimestamp();

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
        action: 'edited',
        oldContent: oldMessage.content,
        newContent: newMessage.content,
      });

      logger.info(`Message edited - Author: ${newMessage.author.tag}, Channel: ${newMessage.channelId}`);
    } catch (error) {
      logger.error('Error handling messageUpdate event:', error);
    }
  },
};
