import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { BotCommand } from "../../client";
import { Servermute } from "../../../database/models/Servermute";
import {
  sendLoggingEmbed,
  resolveUser,
  parseDuration,
  LOGGING_CHANNELS,
} from "../../../utils/moderation";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("servermute")
    .setDescription("Server mute a user")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to server mute")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the server mute")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription(
          "Duration (e.g., 10m, 2h, 1d) - leave empty for permanent",
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

    const userIdentifier = interaction.options.getString("user", true);
    const reason = interaction.options.getString("reason") || "No reason provided";
    const durationStr = interaction.options.getString("duration");

    const targetUser = await resolveUser(interaction.guild, userIdentifier);
    if (!targetUser) {
      await interaction.reply({
        content: "Could not find that user!",
        ephemeral: true,
      });
      return;
    }

    try {
      let expiryDate: Date | null = null;
      let isPermanent = true;
      let durationDisplay = "Permanent";

      if (durationStr) {
        const durationMs = parseDuration(durationStr);
        if (durationMs === 0) {
          await interaction.reply({
            content: "Invalid duration format! Use: 10s, 5m, 2h, or 1d",
            ephemeral: true,
          });
          return;
        }
        expiryDate = new Date(Date.now() + durationMs);
        isPermanent = false;
        durationDisplay = durationStr;
      }

      const existingServermute = await Servermute.findOne({
        userId: targetUser.id,
        guildId: interaction.guild.id,
        isActive: true,
      });

      if (existingServermute) {
        await interaction.reply({
          content: `${targetUser.tag} is already server muted!`,
          ephemeral: true,
        });
        return;
      }

      const servermute = new Servermute({
        userId: targetUser.id,
        guildId: interaction.guild.id,
        expiryDate,
        isPermanent,
      });
      await servermute.save();

      await interaction.reply({
        content: `✅ User ${targetUser.tag} has been server muted (${durationDisplay}).\nReason: ${reason}`,
        ephemeral: true,
      });

      await sendLoggingEmbed(
        interaction.guild,
        LOGGING_CHANNELS.servermutes,
        "🔇 User Server Muted",
        [
          {
            name: "User",
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: true,
          },
          { name: "Duration", value: durationDisplay, inline: true },
          { name: "Moderator", value: `${interaction.user.tag}`, inline: true },
          { name: "Reason", value: reason, inline: false },
        ],
        0xffa500,
      );

      logger.info(
        `User ${targetUser.id} server muted by ${interaction.user.id} (${durationDisplay}) in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error server muting user:", error);
      await interaction.reply({
        content: "An error occurred while server muting the user.",
        ephemeral: true,
      });
    }
  },
};

export default command;
