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
    .setName("purge")
    .setDescription("Purge messages")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to purge messages from (optional)")
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("range")
        .setDescription("Number of messages to delete (1-1000)")
        .setMinValue(1)
        .setMaxValue(1000)
        .setRequired(true),
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
      let targetChannel = interaction.channel;

      if (channelId) {
        const channel = await interaction.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          await interaction.reply({
            content: "Invalid channel!",
            ephemeral: true,
          });
          return;
        }
        targetChannel = channel;
      }

      if (!targetChannel.isTextBased()) {
        await interaction.reply({
          content: "This channel is not text-based!",
          ephemeral: true,
        });
        return;
      }

      let messages = await targetChannel.messages.fetch({ limit: range });

      if (userIdentifier) {
        // Filter by user if specified
        messages = messages.filter(
          (msg) =>
            msg.author.id === userIdentifier ||
            msg.author.username
              .toLowerCase()
              .includes(userIdentifier.toLowerCase()),
        );
      }

      // Create transcript before deletion
      const transcript = generateTranscript(messages, targetChannel);

      const deleted = await (targetChannel as any).bulkDelete(messages, true);

      await interaction.reply({
        content: `✅ Deleted ${deleted.size} messages.`,
        ephemeral: true,
      });

      // Create and upload transcript file
      const transcriptBuffer = Buffer.from(transcript);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const transcriptFileName = `purge_${targetChannel.id}_${timestamp}.txt`;
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
              name: "Channel",
              value: `${(targetChannel as any).name} (${targetChannel.id})`,
              inline: true,
            },
            {
              name: "Messages Deleted",
              value: deleted.size.toString(),
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
        `${deleted.size} messages purged in guild ${interaction.guild.id} by ${interaction.user.id}`,
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
 * @param messages Collection of messages to transcribe
 * @param channel The channel the messages are from
 * @returns Formatted transcript string
 */
function generateTranscript(messages: any, channel: any): string {
  const sortedMessages = Array.from(messages.values()).reverse();

  let transcript = `=== MESSAGE PURGE TRANSCRIPT ===\n`;
  transcript += `Channel: ${channel.name} (#${channel.id})\n`;
  transcript += `Guild: ${channel.guild.name}\n`;
  transcript += `Purged: ${new Date().toISOString()}\n`;
  transcript += `Total Messages: ${sortedMessages.length}\n`;
  transcript += `${"=".repeat(50)}\n\n`;

  for (const message of sortedMessages) {
    const timestamp = new Date(message.createdTimestamp).toISOString();
    const author = message.author.tag;
    const content = message.content || "(No text content)";

    transcript += `[${timestamp}] ${author}:\n`;
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
