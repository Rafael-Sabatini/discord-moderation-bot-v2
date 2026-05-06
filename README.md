# Discord Moderation Bot v2 - TypeScript

A complete rewrite of the moderation bot using TypeScript, Discord.js v14, and Mongoose v9.

## Setup Instructions

### 1. Directory Structure

Run these commands to create the necessary directories:

```bash
# Windows Command Prompt
mkdir src\bot\commands\moderation
mkdir src\bot\commands\utility
mkdir src\api\routes
mkdir logs
```

### 2. Environment Setup

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Create TypeScript Files

After creating directories, the TypeScript source files can be created. Here's what will be in each directory:

**src/bot/commands/moderation/**
- addrule.ts - Add blocked word rules
- removerule.ts - Remove blocked word rules
- warn.ts - Warn users
- ban.ts - Ban users
- kick.ts - Kick users
- mute.ts - Mute/timeout users
- (and more moderation commands)

**src/bot/commands/utility/**
- ping.ts - Bot latency check
- verify.ts - Account verification

**src/bot/events/**
- messageCreate.ts - Message creation handler (for blocked words)
- guildMemberAdd.ts - New member handler

**src/api/routes/**
- users.ts - User management endpoints
- moderation.ts - Moderation action endpoints
- rules.ts - Blocked word rules endpoints

### 5. Development

Start the development server with TypeScript support:

```bash
npm run dev
```

Build for production:

```bash
npm run build
npm start
```

## Features

✅ Account age & email verification
✅ Advanced moderation commands (ban, kick, mute, warn, jail)
✅ Blocked words/rules system with regex support
✅ Two severity levels:
   - **Critical**: Deletes message + 7-day timeout
   - **Non-critical**: Deletes message only
✅ RESTful Express API
✅ MongoDB integration with Mongoose
✅ TypeScript with strict type checking
✅ Winston logging
✅ Rate limiting
✅ CORS support

## Database

Uses MongoDB with these collections:
- users (Account verification)
- warnings (User warnings)
- bans (Ban records)
- jailedusers (Jailed users)
- blockedwords (Blocked word rules)

## Tech Stack

- **Discord.js**: 14.26.4
- **Mongoose**: 9.6.1
- **Express**: 5.2.1
- **TypeScript**: 6.0.3
- **Node.js**: 18+

## Commands

### Moderation
- `/warn <user> <reason>` - Warn a user
- `/addrule <pattern> <severity>` - Add blocked word rule
- `/removerule <rule_id>` - Remove blocked word rule
- `/viewrules` - View all rules

### Utility
- `/ping` - Check bot latency
- `/verify <email>` - Verify account age & email

## License

MIT
