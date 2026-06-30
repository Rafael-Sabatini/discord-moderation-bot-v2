import {
  MessageFlags,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { BotCommand } from "../../client";
import { logger } from "../../../utils/logger";
import { resolveUser } from "../../../utils/moderation";

const TRUSTED_ROLE_ID = "1289792051172610049";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("trust")
    .setDescription("Trust a user")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to trust")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userIdentifier = interaction.options.getString("user", true);

    const targetUser = await resolveUser(interaction.guild, userIdentifier);
    if (!targetUser) {
      await interaction.reply({
        content: "Could not find that user!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const member = await interaction.guild.members.fetch(targetUser.id);

      if (member.roles.cache.has(TRUSTED_ROLE_ID)) {
        await interaction.reply({
          content: `${targetUser.tag} is already trusted!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await member.roles.add(TRUSTED_ROLE_ID);

      await interaction.reply({
        content: `✅ User ${targetUser.tag} is now trusted.`,
        flags: MessageFlags.Ephemeral,
      });

      logger.info(
        `User ${targetUser.id} trusted by ${interaction.user.id} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error trusting user:", error);
      await interaction.reply({
        content: "An error occurred while trusting the user.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export default command;
