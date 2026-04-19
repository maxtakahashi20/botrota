const { SlashCommandBuilder } = require('discord.js');
const { upsertTicketPanel, hasStaff } = require('../handlers/ticketService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel-ticket')
    .setDescription('Envia o painel de tickets no canal configurado (ROTA).')
    .setDMPermission(false),
  /** @param {import('discord.js').ChatInputCommandInteraction} interaction */
  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'Use este comando no servidor.', ephemeral: true });
      return;
    }
    if (!hasStaff(interaction.member)) {
      await interaction.reply({ content: 'Apenas membros da equipe podem usar este comando.', ephemeral: true });
      return;
    }

    const ok = await upsertTicketPanel(interaction.client);
    await interaction.reply({
      content: ok
        ? 'Painel de tickets atualizado no canal configurado.'
        : 'Não foi possível publicar o painel. Verifique `PAINEL_CHANNEL_ID` e permissões do bot.',
      ephemeral: true,
    });
  },
};
