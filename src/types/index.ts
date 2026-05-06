export interface CommandData {
  name: string;
  description: string;
  type: 'moderation' | 'utility';
}

export interface ModerationAction {
  type: 'ban' | 'kick' | 'mute' | 'warn' | 'jail' | 'timeout';
  userId: string;
  guildId: string;
  moderatorId: string;
  reason: string;
  duration?: number;
}

export interface LogEntry {
  timestamp: Date;
  action: string;
  userId: string;
  moderatorId: string;
  guildId: string;
  reason: string;
  details?: Record<string, unknown>;
}
