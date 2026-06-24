import { Message, ChannelType, PermissionsBitField } from 'discord.js';
import { BotClient } from '../client';
import { BlockedWord } from '../../database/models/BlockedWord';
import { hasInviteLink, hasMarkdownHeader } from '../../utils/validators';
import { logAction } from '../../utils/logging';
import { TIMEOUTS } from '../../config/constants';

const CRITICAL_TIMEOUT = TIMEOUTS.CRITICAL_MS;
const INVITE_TIMEOUT = TIMEOUTS.INVITE_MS;

// Roles that are never subject to the content filter.
const FILTER_EXEMPT_ROLE_IDS = [
  '1156184281471787068', // Owner
  '1158116870600261712', // Admin
  '1389665074444238960', // Head mod
];

export default {
  name: 'messageCreate',
  async execute(client: BotClient, message: Message) {
    // Ignore bot messages and DMs
    if (message.author.bot || message.channel.type === ChannelType.DM) return;
    if (!message.guild) return;

    // Never apply the filter to exempt staff roles (Owner / Admin / Head mod)
    const member = message.member;
    if (member && FILTER_EXEMPT_ROLE_IDS.some((id) => member.roles.cache.has(id))) {
      return;
    }

    const content = message.content || '';

    try {
      // Check for invite links
      if (hasInviteLink(content)) {
        await handleViolation(client, message, 'Posted Discord invite link', INVITE_TIMEOUT, false);
        return;
      }

      // Check for markdown headers
      if (hasMarkdownHeader(content)) {
        await handleViolation(client, message, 'Posted Discord markdown header', INVITE_TIMEOUT, false);
        return;
      }

      // Check for blocked words
      const blockedWords = await BlockedWord.find({ guildId: message.guildId });
      
      for (const blockedWord of blockedWords) {
        try {
          const regex = new RegExp(blockedWord.pattern, 'i');
          if (regex.test(content)) {
            const isCritical = blockedWord.severity === 'critical';
            const timeout = isCritical ? CRITICAL_TIMEOUT : 0;
            await handleViolation(
              client,
              message,
              `Posted blocked word/pattern: ${blockedWord.pattern}`,
              timeout,
              isCritical
            );
            return;
          }
        } catch (error) {
          console.error(`Invalid regex pattern for rule ${blockedWord._id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  },
};

async function handleViolation(
  client: BotClient,
  message: Message,
  reason: string,
  timeout: number,
  isCritical: boolean
): Promise<void> {
  const botMember = await message.guild!.members.fetchMe();

  // Delete the message
  if (
    (message.channel as any).permissionsFor?.(botMember)?.has(PermissionsBitField.Flags.ManageMessages)
  ) {
    await message.delete().catch(() => null);

    await logAction(message.guild!, 'messages', {
      type: 'delete',
      user: { id: message.author.id, tag: message.author.tag },
      moderator: { id: client.user!.id, tag: client.user!.tag },
      reason,
    });
  }

  // Apply timeout if needed
  if (timeout > 0 && botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    const member = await message.guild!.members.fetch(message.author.id).catch(() => null);
    
    if (member?.moderatable) {
      const durationText = isCritical ? '7 days' : '10 minutes';
      await member.timeout(timeout, reason).catch(() => null);

      await logAction(message.guild!, 'timeouts', {
        type: 'timeout',
        user: { id: message.author.id, tag: message.author.tag },
        moderator: { id: client.user!.id, tag: client.user!.tag },
        reason,
        duration: durationText,
      });
    }
  }
}
