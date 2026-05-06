import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
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
        .setDescription("Number of messages to delete (1-100)")
        .setMinValue(1)
        .setMaxValue(100)
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
            msg.author.username.includes(userIdentifier),
        );
      }

      const deleted = await (targetChannel as any).bulkDelete(messages, true);

      await interaction.reply({
        content: `✅ Deleted ${deleted.size} messages.`,
        ephemeral: true,
      });

      await sendLoggingEmbed(
        interaction.guild,
        LOGGING_CHANNELS.purges,
        "🗑️ Messages Purged",
        [
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
          { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
          { name: "Range", value: range.toString(), inline: true },
          ...(userIdentifier
            ? [{ name: "User Filter", value: userIdentifier, inline: true }]
            : []),
        ],
        0x9400d3,
      );

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

export default command;
