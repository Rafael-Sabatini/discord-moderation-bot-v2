import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { BotCommand } from "../../client";
import { LOGGING_CHANNELS } from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .addIntegerOption((option) =>
      option
        .setName("range")
        .setDescription("Number of messages to delete (1-1000)")
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(true),
    )
    .setName("purge")
    .setDescription("Purge messages")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to purge messages from (optional)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("channel")
        .setDescription("Channel ID to purge messages from (optional)")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild || !interaction.channel) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userIdentifier = interaction.options.getString("user");
    const range = interaction.options.getInteger("range") || 50;
    const channelId = interaction.options.getString("channel");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Determine target channels based on provided options:
      // - channelid only or user + channelid → that specific channel
      // - user only → all text channels
      // - neither → current channel only
      let targetChannels: any[] = [];

      if (channelId) {
        const channel = await interaction.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          await interaction.editReply({ content: "Invalid channel!" });
          return;
        }
        targetChannels = [channel];
      } else if (userIdentifier) {
        const allChannels = await interaction.guild.channels.fetch();
        targetChannels = allChannels
          .filter((ch: any) => ch && ch.isTextBased())
          .map((ch: any) => ch);
      } else {
        targetChannels = [interaction.channel];
      }

      // bulkDelete cannot delete messages older than 14 days, so there is no
      // point scanning past that cutoff.
      const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
      const cutoff = Date.now() - TWO_WEEKS_MS;
      // Cap how many messages we scan per channel. When filtering by user we
      // scan beyond `range` (not every message matches) but never forever.
      const scanCap = userIdentifier ? Math.min(range * 10, 1000) : range;

      // Accept a raw ID, a mention (<@123> / <@!123>), or a username substring.
      const userIdDigits = userIdentifier
        ? userIdentifier.replace(/\D/g, "")
        : "";
      const matchesUser = (msg: any) => {
        if (!userIdentifier) return true;
        if (userIdDigits && msg.author.id === userIdDigits) return true;
        return msg.author.username
          .toLowerCase()
          .includes(userIdentifier.toLowerCase());
      };

      // Collect matching messages from a single channel, paginating until we
      // have `range`, cross the 14-day cutoff, run out, or hit the scan cap.
      const collectFromChannel = async (channel: any) => {
        const found: any[] = [];
        let lastId: string | undefined;
        let scanned = 0;
        let hitCutoff = false;
        let errored = false;

        try {
          while (found.length < range && scanned < scanCap) {
            const fetchOptions: any = { limit: 100 };
            if (lastId) fetchOptions.before = lastId;

            const batch = await channel.messages.fetch(fetchOptions);
            if (batch.size === 0) break;

            for (const msg of batch.values()) {
              scanned++;
              if (found.length >= range) break;

              // Messages are newest-first; stop at the 14-day boundary
              if (msg.createdTimestamp < cutoff) {
                hitCutoff = true;
                break;
              }

              if (matchesUser(msg)) found.push(msg);
            }

            if (hitCutoff || batch.size < 100) break;
            lastId = batch.last()?.id;
          }
        } catch (err) {
          // Missing access / read perms on a channel — skip it rather than abort
          errored = true;
          logger.warn(`Purge: could not read channel ${channel?.id}: ${err}`);
        }

        return { found, scanned, hitCutoff, errored };
      };

      // Fetch channels in parallel. Message fetches are rate-limited per-channel,
      // so independent channels don't contend — far faster than sequential.
      const results = await Promise.all(
        targetChannels.map((channel) => collectFromChannel(channel)),
      );

      // Merge matches from every channel and pick the most recent `range`
      // messages by date, so the deletion spans channels in chronological
      // order rather than draining the first channel first.
      const collectedMessages = results
        .flatMap((r) => r.found)
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .slice(0, range);
      const totalScanned = results.reduce((n, r) => n + r.scanned, 0);
      const anyCutoff = results.some((r) => r.hitCutoff);
      const allErrored =
        results.length > 0 && results.every((r) => r.errored);

      if (collectedMessages.length === 0) {
        let reason = "No messages found to delete.";
        if (allErrored) {
          reason =
            "Couldn't read the target channel(s). The bot needs **View Channel**, **Read Message History**, and **Manage Messages** permissions there.";
        } else if (totalScanned === 0) {
          reason = "There are no messages to scan in the target channel(s).";
        } else if (userIdentifier) {
          reason = `No messages from \`${userIdentifier}\` found in the last ${totalScanned} message(s) scanned. (Discord only allows bulk-deleting messages newer than 14 days.)`;
        } else if (anyCutoff) {
          reason =
            "No messages newer than 14 days were found — Discord doesn't allow bulk-deleting older messages.";
        }
        await interaction.editReply({ content: reason });
        return;
      }

      // Create transcript before deletion
      const transcript = generateTranscript(
        collectedMessages,
        interaction.guild,
        targetChannels.length === 1 ? targetChannels[0] : null,
      );

      // Group messages by channel and bulk-delete
      let totalDeleted = 0;
      const messagesByChannel = new Map<string, any[]>();

      for (const msg of collectedMessages) {
        const chId = msg.channelId;
        if (!messagesByChannel.has(chId)) {
          messagesByChannel.set(chId, []);
        }
        messagesByChannel.get(chId)!.push(msg);
      }

      for (const [chId, msgs] of messagesByChannel) {
        const channel = await interaction.guild.channels.fetch(chId);
        if (channel && channel.isTextBased()) {
          const deleted = await (channel as any).bulkDelete(msgs, true);
          totalDeleted += deleted.size;
        }
      }

      await interaction.editReply({
        content: `✅ Deleted ${totalDeleted} messages across ${messagesByChannel.size} channel(s).`,
      });

      // Create and upload transcript file
      const transcriptBuffer = Buffer.from(transcript);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const transcriptFileName = `purge_${interaction.guild.id}_${timestamp}.txt`;
      const transcriptAttachment = new AttachmentBuilder(transcriptBuffer, {
        name: transcriptFileName,
      });

      // Send logging embed with transcript
      const loggingChannel = await interaction.guild.channels.fetch(
        LOGGING_CHANNELS.purges,
      );
      if (loggingChannel && loggingChannel.isTextBased()) {
        const scopeLabel = channelId
          ? `Specific channel`
          : userIdentifier
            ? `All channels (${messagesByChannel.size})`
            : `Current channel`;

        const embed = new EmbedBuilder()
          .setColor(0x9400d3)
          .setTitle("🗑️ Messages Purged")
          .addFields(
            { name: "Scope", value: scopeLabel, inline: true },
            {
              name: "Messages Deleted",
              value: totalDeleted.toString(),
              inline: true,
            },
            {
              name: "Moderator",
              value: `${interaction.user.tag}`,
              inline: true,
            },
            { name: "Range", value: range.toString(), inline: true },
            ...(userIdentifier
              ? [{ name: "User Filter", value: userIdentifier, inline: true }]
              : []),
          )
          .setTimestamp();

        await loggingChannel.send({
          embeds: [embed],
          files: [transcriptAttachment],
        });
      }

      logger.info(
        `${totalDeleted} messages purged in guild ${interaction.guild.id} by ${interaction.user.id} across ${messagesByChannel.size} channels`,
      );
    } catch (error) {
      logger.error("Error purging messages:", error);
      await interaction.editReply({
        content: "An error occurred while purging messages.",
      });
    }
  },
};

/**
 * Generates a text transcript of messages
 * @param messages Array of messages to transcribe
 * @param guild The guild the messages are from
 * @param singleChannel Optional single channel if operation was channel-specific
 * @returns Formatted transcript string
 */
function generateTranscript(messages: any, guild: any, singleChannel: any = null): string {
  const sortedMessages = messages.sort(
    (a: any, b: any) => a.createdTimestamp - b.createdTimestamp
  );

  let transcript = `=== MESSAGE PURGE TRANSCRIPT ===\n`;
  if (singleChannel) {
    transcript += `Channel: ${singleChannel.name} (#${singleChannel.id})\n`;
  } else {
    transcript += `Channels: Multiple\n`;
  }
  transcript += `Guild: ${guild.name}\n`;
  transcript += `Purged: ${new Date().toISOString()}\n`;
  transcript += `Total Messages: ${sortedMessages.length}\n`;
  transcript += `${"=".repeat(50)}\n\n`;

  for (const message of sortedMessages) {
    const timestamp = new Date(message.createdTimestamp).toISOString();
    const author = message.author.tag;
    const content = message.content || "(No text content)";
    const channelName = message.channel?.name || `#${message.channelId}`;

    transcript += `[${timestamp}] ${author} (${channelName}):\n`;
    transcript += `${content}\n`;

    // Include attachment info
    if (message.attachments.size > 0) {
      transcript += `Attachments:\n`;
      message.attachments.forEach((attachment: any) => {
        transcript += `  - ${attachment.name} (${formatFileSize(attachment.size)})\n`;
        if (attachment.url) {
          transcript += `    URL: ${attachment.url}\n`;
        }
      });
    }

    // Include embedded content info
    if (message.embeds.length > 0) {
      transcript += `Embeds: ${message.embeds.length} embedded message(s)\n`;
    }

    // Include reactions info
    if (message.reactions.cache.size > 0) {
      const reactions = message.reactions.cache
        .map((reaction: any) => `${reaction.emoji.name} (${reaction.count})`)
        .join(", ");
      transcript += `Reactions: ${reactions}\n`;
    }

    transcript += `\n`;
  }

  transcript += `${"=".repeat(50)}\n`;
  transcript += `End of transcript`;

  return transcript;
}

/**
 * Formats file size in human-readable format
 * @param bytes File size in bytes
 * @returns Formatted file size string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export default command;
