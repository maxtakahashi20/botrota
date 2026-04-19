const { REST, Routes, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { hydrateTicketsFromGuild, upsertTicketPanel } = require('../handlers/ticketService');

module.exports = {
  name: Events.ClientReady,
  once: true,
  /** @param {import('discord.js').Client} client */
  async execute(client) {
    console.log(`[ROTA] Online como ${client.user?.tag}`);

    const guild = await client.guilds.fetch(config.guildId).catch(() => null);
    if (guild) await hydrateTicketsFromGuild(guild);

    const body = [];
    const cmdDir = path.join(__dirname, '../commands');
    for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js'))) {
      const cmd = require(path.join(cmdDir, file));
      if (cmd?.data?.toJSON) body.push(cmd.data.toJSON());
    }

    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body,
      });
      console.log('[ROTA] Slash commands registrados no servidor.');
    } catch (e) {
      console.error('[ROTA] Falha ao registrar comandos:', e);
    }

    await upsertTicketPanel(client);
  },
};
