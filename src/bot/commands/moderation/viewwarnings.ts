import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { BotCommand } from "../../client";
import { Warning } from "../../../database/models/Warning";
import { logger } from "../../../utils/logger";
import { resolveUser } from "../../../utils/moderation";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("viewwarnings")
    .setDescription("View warnings for a user or all warnings on the server")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription(
          "User ID or username to view warnings for (leave empty for all)",
        )
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        ephemeral: true,
      });
      return;
    }

    const userIdentifier = interaction.options.getString("user");

    try {
      // Defer the reply to avoid timeout issues with database queries
      await interaction.deferReply({ ephemeral: true });

      // If a user identifier is provided, show warnings for that specific user
      if (userIdentifier) {
        await showUserWarningsDeferred(interaction, userIdentifier);
      } else {
        // Otherwise, show all warnings for the server
        await showAllServerWarningsDeferred(interaction);
      }
    } catch (error) {
      logger.error("Error viewing warnings:", error);
      // Use editReply since we deferred the response
      await interaction
        .editReply({
          content: "An error occurred while viewing warnings.",
        })
        .catch(() => null);
    }
  },
};

async function showUserWarningsDeferred(
  interaction: ChatInputCommandInteraction,
  userIdentifier: string,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.editReply({
      content: "This command can only be used in a server!",
    });
    return;
  }

  const targetUser = await resolveUser(interaction.guild, userIdentifier);
  if (!targetUser) {
    await interaction.editReply({
      content: "Could not find that user!",
    });
    return;
  }

  const warnings = await Warning.find({
    userId: targetUser.id,
    guildId: interaction.guild.id,
  }).sort({ timestamp: -1 });

  if (warnings.length === 0) {
    await interaction.editReply({
      content: `${targetUser.tag} has no warnings.`,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Warnings for ${targetUser.tag}`)
    .setColor(0xffa500)
    .setFooter({ text: `Total warnings: ${warnings.length}` });

  warnings.forEach((warning, index) => {
    embed.addFields({
      name: `Warning #${index + 1}`,
      value: `**Moderator:** <@${warning.moderatorId}>\n**Reason:** ${warning.reason}\n**Date:** <t:${Math.floor(warning.timestamp.getTime() / 1000)}:f>`,
      inline: false,
    });
  });

  await interaction.editReply({
    embeds: [embed],
  });

  logger.info(
    `Warnings viewed for user ${targetUser.id} by ${interaction.user.id} in guild ${interaction.guild.id}`,
  );
}

async function showAllServerWarningsDeferred(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.editReply({
      content: "This command can only be used in a server!",
    });
    return;
  }

  const allWarnings = await Warning.find({
    guildId: interaction.guild.id,
  }).sort({ timestamp: -1 });

  if (allWarnings.length === 0) {
    await interaction.editReply({
      content: "There are no warnings on this server.",
    });
    return;
  }

  // Group warnings by user for better organization
  const warningsByUser = new Map<string, typeof allWarnings>();
  allWarnings.forEach((warning) => {
    const userId = warning.userId;
    if (!warningsByUser.has(userId)) {
      warningsByUser.set(userId, []);
    }
    warningsByUser.get(userId)!.push(warning);
  });

  // Create embeds (Discord has a limit of 10 fields per embed, so we may need multiple)
  const embeds: EmbedBuilder[] = [];
  let currentEmbed = new EmbedBuilder()
    .setTitle("All Server Warnings")
    .setColor(0xffa500)
    .setFooter({ text: `Total warnings: ${allWarnings.length}` });

  let fieldCount = 0;
  const maxFieldsPerEmbed = 10;

  warningsByUser.forEach((userWarnings, userId) => {
    const warningCount = userWarnings.length;

    // Create a field for each warning for this user
    userWarnings.forEach((warning, warningIndex) => {
      const fieldValue = `**User:** <@${userId}>\n**Moderator:** <@${warning.moderatorId}>\n**Reason:** ${warning.reason}\n**Date:** <t:${Math.floor(warning.timestamp.getTime() / 1000)}:f>`;

      if (fieldCount >= maxFieldsPerEmbed) {
        // Create a new embed if we've hit the field limit
        embeds.push(currentEmbed);
        currentEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setFooter({ text: `Continued...` });
        fieldCount = 0;
      }

      currentEmbed.addFields({
        name: `Warning #${allWarnings.indexOf(warning) + 1}`,
        value: fieldValue,
        inline: false,
      });

      fieldCount++;
    });
  });

  if (fieldCount > 0) {
    embeds.push(currentEmbed);
  }

  await interaction.editReply({
    embeds: embeds,
  });

  logger.info(
    `All server warnings viewed by ${interaction.user.id} in guild ${interaction.guild.id}`,
  );
}

export default command;
