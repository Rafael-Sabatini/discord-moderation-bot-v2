import { Message, ChannelType, PermissionsBitField } from 'discord.js';
import { BotClient } from '../client';
import { BlockedWord } from '../../database/models/BlockedWord';
import { hasInviteLink, hasMarkdownHeader } from '../../utils/validators';
import { logAction } from '../../utils/logging';
import { TIMEOUTS } from '../../config/constants';

const CRITICAL_TIMEOUT = TIMEOUTS.CRITICAL_MS;
const INVITE_TIMEOUT = TIMEOUTS.INVITE_MS;

// Roles that are never subject to the content filter (no rule ever applies).
const FULL_EXEMPT_ROLE_IDS = [
  '1156184281471787068', // Owner
  '1158116870600261712', // Admin
];

// Roles exempt only from rules that carry a punishment/timeout (critical rules,
// invite links, markdown headers). Delete-only (non-critical) rules still apply.
const PUNISHMENT_EXEMPT_ROLE_IDS = [
  '1389665074444238960', // Head Moderator
  '1156205959128031333', // Moderator
];

export default {
  name: 'messageCreate',
  async execute(client: BotClient, message: Message) {
    // Ignore bot messages and DMs
    if (message.author.bot || message.channel.type === ChannelType.DM) return;
    if (!message.guild) return;

    // Owner / Admin bypass the filter entirely. Moderators / Head Moderators are
    // only exempt from punishing rules — delete-only (non-critical) rules still
    // apply to them (enforced in handleViolation).
    const member = message.member;
    const hasAnyRole = (ids: string[]) =>
      !!member && ids.some((id) => member.roles.cache.has(id));

    if (hasAnyRole(FULL_EXEMPT_ROLE_IDS)) return;

    const punishmentExempt = hasAnyRole(PUNISHMENT_EXEMPT_ROLE_IDS);

    const content = message.content || '';

    try {
      // Check for invite links
      if (hasInviteLink(content)) {
        await handleViolation(client, message, 'Posted Discord invite link', INVITE_TIMEOUT, false, punishmentExempt);
        return;
      }

      // Check for markdown headers
      if (hasMarkdownHeader(content)) {
        await handleViolation(client, message, 'Posted Discord markdown header', INVITE_TIMEOUT, false, punishmentExempt);
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
              isCritical,
              punishmentExempt
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
  isCritical: boolean,
  punishmentExempt: boolean
): Promise<void> {
  // Punishment-exempt roles (Moderators / Head Moderators) are only subject to
  // delete-only rules. Anything that carries a timeout does not apply to them.
  if (punishmentExempt && timeout > 0) {
    return;
  }

  const botMember = await message.guild!.members.fetchMe();

  // Always delete the offending message — this applies to every violation,
  // regardless of severity.
  const canManageMessages = (message.channel as any).permissionsFor
    ?.(botMember)
    ?.has(PermissionsBitField.Flags.ManageMessages);
  if (canManageMessages) {
    try {
      await message.delete();
      await logAction(message.guild!, 'messages', {
        type: 'delete',
        user: { id: message.author.id, tag: message.author.tag },
        moderator: { id: client.user!.id, tag: client.user!.tag },
        reason,
      });
    } catch (error) {
      console.warn(`Failed to delete filtered message ${message.id}:`, error);
    }
  } else {
    console.warn(
      `Cannot delete filtered message ${message.id}: bot lacks Manage Messages in channel ${message.channelId}`
    );
  }

  // Non-critical violations are delete-only — no further punishment.
  if (timeout <= 0) return;

  // Critical violations: time the member out.
  if (botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
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
