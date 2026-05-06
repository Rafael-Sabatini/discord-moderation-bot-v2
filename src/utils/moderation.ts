import {
  EmbedBuilder,
  Guild,
  User,
  TextChannel,
} from 'discord.js';
import { logger } from './logger';

// Logging channel IDs
export const LOGGING_CHANNELS = {
  bans: '1403026353661546647',
  mutes: '1403026389552337040',
  servermutes: '1403026443612586062',
  warnings: '1403026483974373498',
  purges: '1451999307531157757',
};

export async function sendLoggingEmbed(
  guild: Guild,
  channelId: string,
  title: string,
  fields: Array<{ name: string; value: string; inline?: boolean }>,
  color: number = 0x0099ff
): Promise<void> {
  try {
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      logger.warn(`Logging channel ${channelId} not found or is not text-based`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .addFields(fields)
      .setTimestamp();

    await (channel as TextChannel).send({ embeds: [embed] });
  } catch (error) {
    logger.error(`Error sending logging embed to ${channelId}:`, error);
  }
}

export async function resolveUser(
  guild: Guild,
  identifier: string
): Promise<User | null> {
  try {
    // Try to parse as user ID
    if (/^\d+$/.test(identifier)) {
      return await guild.client.users.fetch(identifier);
    }

    // Try to fetch by username
    const members = await guild.members.search({ query: identifier, limit: 1 });
    if (members.size > 0) {
      return members.first()?.user || null;
    }

    return null;
  } catch (error) {
    logger.error('Error resolving user:', error);
    return null;
  }
}

export function parseDuration(durationStr: string): number {
  const match = durationStr.match(/^(\d+)([smhd])$/i);
  if (!match) return 0;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 1000 * 60,
    h: 1000 * 60 * 60,
    d: 1000 * 60 * 60 * 24,
  };

  return value * (multipliers[unit] || 0);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
