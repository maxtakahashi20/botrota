const { Events, MessageFlags } = require('discord.js');
const ticketService = require('../handlers/ticketService');

module.exports = {
  name: Events.InteractionCreate,
  /** @param {import('discord.js').Interaction} interaction */
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = interaction.client.commands?.get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith('rota_ticket_modal:')) {
        await ticketService.handleTicketModalSubmit(interaction);
        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId.startsWith('rota_ticket_open:')) {
          const typeKey = interaction.customId.slice('rota_ticket_open:'.length);
          await ticketService.openTicketModalFromButton(interaction, typeKey);
          return;
        }
        if (interaction.customId === 'rota_ticket_close') {
          await ticketService.handleCloseTicket(interaction);
          return;
        }
        if (interaction.customId === 'rota_ticket_delete') {
          await ticketService.handleDeleteTicket(interaction);
          return;
        }
      }
    } catch (err) {
      console.error('[interaction]', err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Ocorreu um erro ao processar esta ação.', flags: MessageFlags.Ephemeral }).catch(() => null);
      } else if (interaction.deferred) {
        await interaction.editReply({ content: 'Ocorreu um erro ao processar esta ação.' }).catch(() => null);
      }
    }
  },
};
