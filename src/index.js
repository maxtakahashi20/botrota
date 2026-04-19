
const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot ROTA Online 🚔");
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});





const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.GuildMember],
});

loadCommands(client);
loadEvents(client);

client.login(config.token).catch((e) => {
  console.error('[ROTA] Falha no login. Verifique TOKEN no .env:', e.message);
  process.exit(1);
});
