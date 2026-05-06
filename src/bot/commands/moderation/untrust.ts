import {
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
    .setName("untrust")
    .setDescription("Untrust a user")
    .addStringOption((option) =>
      option
        .setName("user")
        .setDescription("User ID or username to untrust")
        .setRequired(true),
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

    const targetUser = await resolveUser(interaction.guild, userIdentifier);
    if (!targetUser) {
      await interaction.reply({
        content: "Could not find that user!",
        ephemeral: true,
      });
      return;
    }

    try {
      const member = await interaction.guild.members.fetch(targetUser.id);

      if (!member.roles.cache.has(TRUSTED_ROLE_ID)) {
        await interaction.reply({
          content: `${targetUser.tag} is not trusted!`,
          ephemeral: true,
        });
        return;
      }

      await member.roles.remove(TRUSTED_ROLE_ID);

      await interaction.reply({
        content: `✅ User ${targetUser.tag} is no longer trusted.`,
        ephemeral: true,
      });

      logger.info(
        `User ${targetUser.id} untrusted by ${interaction.user.id} in guild ${interaction.guild.id}`,
      );
    } catch (error) {
      logger.error("Error untrusting user:", error);
      await interaction.reply({
        content: "An error occurred while untrusting the user.",
        ephemeral: true,
      });
    }
  },
};

export default command;
