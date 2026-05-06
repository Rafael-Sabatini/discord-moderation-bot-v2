import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  Interaction,
} from "discord.js";
import { BotCommand } from "../../client";
import { BlockedWord } from "../../../database/models/BlockedWord";
import { logger } from "../../../utils/logger";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("filterconfig")
    .setDescription("Configure individual filter rules")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        ephemeral: true,
      });
      return;
    }

    try {
      // Fetch all filter rules for this guild
      const rules = await BlockedWord.find({
        guildId: interaction.guild.id,
      });

      if (rules.length === 0) {
        await interaction.reply({
          content: "No filter rules configured for this server.",
          ephemeral: true,
        });
        return;
      }

      // Create embed showing all rules
      const embed = new EmbedBuilder()
        .setTitle("📋 Filter Rules Configuration")
        .setDescription("Select a rule to modify or delete")
        .setColor(0x0099ff)
        .addFields(
          rules.map((rule, idx) => ({
            name: `${idx + 1}. ${rule.ruleName}`,
            value: `Severity: **${rule.severity}**\nPattern: \`${rule.pattern}\``,
            inline: false,
          }))
        )
        .setTimestamp();

      // Create select menu for rule selection
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("filter_select")
        .setPlaceholder("Select a rule to configure")
        .addOptions(
          rules.map((rule) => ({
            label: rule.ruleName,
            value: rule._id!.toString(),
            description: `Pattern: ${rule.pattern.substring(0, 50)}${rule.pattern.length > 50 ? "..." : ""}`,
          }))
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        selectMenu
      );

      const message = await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true,
        fetchReply: true,
      });

      // Set up collector for interactions
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 15 * 60 * 1000, // 15 minutes
      });

      collector.on("collect", async (selectInteraction: Interaction) => {
        if (!selectInteraction.isStringSelectMenu()) return;

        const selectedRuleId = selectInteraction.values[0];
        const selectedRule = rules.find(
          (r) => r._id!.toString() === selectedRuleId
        );

        if (!selectedRule) {
          await selectInteraction.reply({
            content: "Rule not found!",
            ephemeral: true,
          });
          return;
        }

        // Create action buttons
        const actionButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("change_severity")
            .setLabel("Change Severity")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("delete_rule")
            .setLabel("Delete Rule")
            .setStyle(ButtonStyle.Danger)
        );

        const ruleEmbed = new EmbedBuilder()
          .setTitle("🔧 Configure Rule")
          .setColor(0x0099ff)
          .addFields(
            { name: "Pattern", value: `\`\`\`${selectedRule.pattern}\`\`\``, inline: false },
            {
              name: "Current Severity",
              value: selectedRule.severity === "critical" ? "🔴 Critical" : "🟡 Non-Critical",
              inline: true,
            },
            { name: "Created By", value: `<@${selectedRule.createdBy}>`, inline: true }
          )
          .setTimestamp();

        await selectInteraction.reply({
          embeds: [ruleEmbed],
          components: [actionButtons],
          ephemeral: true,
        });

        // Handle action buttons
        const actionCollector = message.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 10 * 60 * 1000, // 10 minutes
        });

        actionCollector.on("collect", async (buttonInteraction: Interaction) => {
          if (!buttonInteraction.isButton()) return;

          if (buttonInteraction.customId === "change_severity") {
            // Show severity options
            const severityButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("severity_critical")
                .setLabel("Critical")
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId("severity_noncritical")
                .setLabel("Non-Critical")
                .setStyle(ButtonStyle.Secondary)
            );

            const severityEmbed = new EmbedBuilder()
              .setTitle("Severity Level")
              .setDescription("Select the severity level for this rule")
              .setColor(0x0099ff);

            await buttonInteraction.reply({
              embeds: [severityEmbed],
              components: [severityButtons],
              ephemeral: true,
            });

            const severityCollector = message.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 5 * 60 * 1000,
            });

            severityCollector.on("collect", async (sevButtonInteraction: Interaction) => {
              if (!sevButtonInteraction.isButton()) return;

              if (sevButtonInteraction.customId === "severity_critical") {
                await BlockedWord.updateOne(
                  { _id: selectedRule._id },
                  { severity: "critical" }
                );

                const confirmEmbed = new EmbedBuilder()
                  .setTitle("✅ Severity Updated")
                  .setDescription("Rule severity changed to **Critical**")
                  .setColor(0x00ff00);

                await sevButtonInteraction.reply({
                  embeds: [confirmEmbed],
                  ephemeral: true,
                });

                logger.info(
                  `Filter rule severity changed to critical in guild ${interaction.guild!.id}`
                );
              } else if (sevButtonInteraction.customId === "severity_noncritical") {
                await BlockedWord.updateOne(
                  { _id: selectedRule._id },
                  { severity: "non-critical" }
                );

                const confirmEmbed = new EmbedBuilder()
                  .setTitle("✅ Severity Updated")
                  .setDescription("Rule severity changed to **Non-Critical**")
                  .setColor(0x00ff00);

                await sevButtonInteraction.reply({
                  embeds: [confirmEmbed],
                  ephemeral: true,
                });

                logger.info(
                  `Filter rule severity changed to non-critical in guild ${interaction.guild!.id}`
                );
              }
            });
          } else if (buttonInteraction.customId === "delete_rule") {
            // Confirm deletion
            const confirmButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("confirm_delete")
                .setLabel("Confirm Delete")
                .setStyle(ButtonStyle.Danger),
              new ButtonBuilder()
                .setCustomId("cancel_delete")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
            );

            const confirmEmbed = new EmbedBuilder()
              .setTitle("⚠️ Confirm Deletion")
              .setDescription(`Are you sure you want to delete this rule?\n\nPattern: \`${selectedRule.pattern}\``)
              .setColor(0xff0000);

            await buttonInteraction.reply({
              embeds: [confirmEmbed],
              components: [confirmButtons],
              ephemeral: true,
            });

            const deleteCollector = message.createMessageComponentCollector({
              componentType: ComponentType.Button,
              time: 5 * 60 * 1000,
            });

            deleteCollector.on("collect", async (deleteButtonInteraction: Interaction) => {
              if (!deleteButtonInteraction.isButton()) return;

              if (deleteButtonInteraction.customId === "confirm_delete") {
                await BlockedWord.deleteOne({ _id: selectedRule._id });

                const deletedEmbed = new EmbedBuilder()
                  .setTitle("✅ Rule Deleted")
                  .setDescription("The filter rule has been successfully deleted")
                  .setColor(0x00ff00);

                await deleteButtonInteraction.reply({
                  embeds: [deletedEmbed],
                  ephemeral: true,
                });

                logger.info(
                  `Filter rule deleted from guild ${interaction.guild!.id}`
                );
              } else if (deleteButtonInteraction.customId === "cancel_delete") {
                const cancelEmbed = new EmbedBuilder()
                  .setTitle("❌ Deletion Cancelled")
                  .setColor(0xff9900);

                await deleteButtonInteraction.reply({
                  embeds: [cancelEmbed],
                  ephemeral: true,
                });
              }

              deleteCollector.stop();
            });
          }
        });
      });

      collector.on("end", () => {
        logger.info(
          `Filter configuration session ended for guild ${interaction.guild!.id}`
        );
      });
    } catch (error) {
      logger.error("Error opening filter configuration:", error);
      await interaction.reply({
        content: "An error occurred while opening the filter configuration.",
        ephemeral: true,
      });
    }
  },
};

export default command;
