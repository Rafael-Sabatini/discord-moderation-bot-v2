import { Guild } from 'discord.js';
import { logger } from './logger';

export interface ActionLog {
  type: string;
  user?: { id: string; tag: string };
  moderator?: { id: string; tag: string };
  reason?: string;
  duration?: string;
  targetId?: string;
  [key: string]: unknown;
}

export async function logAction(
  guild: Guild,
  category: string,
  details: ActionLog
): Promise<void> {
  try {
    logger.info(
      `[${category.toUpperCase()}] ${details.type || 'action'} - Guild: ${guild.name} (${guild.id})`
    );
    
    if (details.user) {
      logger.debug(`  User: ${details.user.tag} (${details.user.id})`);
    }
    if (details.moderator) {
      logger.debug(`  Moderator: ${details.moderator.tag} (${details.moderator.id})`);
    }
    if (details.reason) {
      logger.debug(`  Reason: ${details.reason}`);
    }
    if (details.duration) {
      logger.debug(`  Duration: ${details.duration}`);
    }
  } catch (error) {
    logger.error('Error logging action:', error);
  }
}
