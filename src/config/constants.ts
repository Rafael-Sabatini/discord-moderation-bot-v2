export const MODERATOR_ROLES = [
  '1156184281471787068', // Owner
  '1158116870600261712', // Admin
  '1389665074444238960', // Head Moderator
  '1156205959128031333', // Moderator
  '1437842615528722535', // Added user
];

export const JAILED_ROLE_ID = '1245518227648413798';

export const TIMEOUTS = {
  INVITE_MS: 10 * 60 * 1000, // 10 minutes
  CRITICAL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const WARNING_THRESHOLDS = {
  MUTE: { count: 2, duration: 60 * 60 * 1000 }, // 1 hour
  BAN: { count: 3 },
};
