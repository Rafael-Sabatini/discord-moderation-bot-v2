import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { BotCommand } from "../../client";
import { sendLoggingEmbed, LOGGING_CHANNELS } from "../../../utils/moderation";
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
        ephemeral: true,
      });
      return;
    }

    const userIdentifier = interaction.options.getString("user");
    const range = interaction.options.getInteger("range") || 50;
    const channelId = interaction.options.getString("channel");

    try {
      let targetChannels: any[] = [];
      let messages: any[] = [];

      // If channel is specified, only target that channel
      if (channelId) {
        const channel = await interaction.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          await interaction.reply({
            content: "Invalid channel!",
            ephemeral: true,
          });
          return;
        }
        targetChannels = [channel];
      } else {
        // If no channel specified, fetch all text channels
        const allChannels = await interaction.guild.channels.fetch();
        targetChannels = allChannels
          .filter((ch: any) => ch && ch.isTextBased())
          .map((ch: any) => ch) as any[];
      }

      // Collect messages from all target channels
      // When filtering by user, we need to fetch more messages to get enough from that user
      const fetchMultiplier = userIdentifier ? 10 : 1; // Fetch more when filtering by user
      let messagesRemaining = range * fetchMultiplier;

      for (const channel of targetChannels) {
        if (userIdentifier && messages.length >= range) break; // Have enough for user filter
        if (!userIdentifier && messagesRemaining <= 0) break;

        const fetchLimit = Math.min(messagesRemaining || 100, 100); // Discord has a max fetch of 100
        const channelMessages = await channel.messages.fetch({
          limit: fetchLimit,
        });

        if (channelMessages.size === 0) continue;

        channelMessages.forEach((msg: any) => {
          messages.push(msg);
          if (!userIdentifier) {
            messagesRemaining--;
          }
        });
      }

      // Filter by user if specified
      if (userIdentifier) {
        messages = messages.filter(
          (msg) =>
            msg.author.id === userIdentifier ||
            msg.author.username
              .toLowerCase()
              .includes(userIdentifier.toLowerCase()),
        );
        // Trim to range if we have more than needed
        messages = messages.slice(0, range);
      }

      if (messages.length === 0) {
        await interaction.reply({
          content: "No messages found to delete.",
          ephemeral: true,
        });
        return;
      }

      // Create transcript before deletion
      const transcript = generateTranscript(messages, interaction.guild, channelId ? targetChannels[0] : null);

      // Group messages by channel and delete
      let totalDeleted = 0;
      const messagesByChannel = new Map<string, any[]>();

      for (const msg of messages) {
        const chId = msg.channelId;
        if (!messagesByChannel.has(chId)) {
          messagesByChannel.set(chId, []);
        }
        messagesByChannel.get(chId)!.push(msg);
      }

      // Delete messages from each channel
      for (const [chId, msgs] of messagesByChannel) {
        const channel = await interaction.guild.channels.fetch(chId);
        if (channel && channel.isTextBased()) {
          const deleted = await (channel as any).bulkDelete(msgs, true);
          totalDeleted += deleted.size;
        }
      }

      await interaction.reply({
        content: `✅ Deleted ${totalDeleted} messages across ${messagesByChannel.size} channel(s).`,
        ephemeral: true,
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
        const embed = new EmbedBuilder()
          .setColor(0x9400d3)
          .setTitle("🗑️ Messages Purged")
          .addFields(
            {
              name: "Scope",
              value: channelId ? `Specific channel` : `All channels (${messagesByChannel.size})`,
              inline: true,
            },
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
      await interaction.reply({
        content: "An error occurred while purging messages.",
        ephemeral: true,
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
