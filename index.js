const path = require('path');
const fs = require('fs');

// Carrega variáveis de ambiente antes de qualquer import de config/handlers.
// Prioridade: `src/.env` (como no seu projeto) e fallback para `.env` na raiz.
const envCandidates = [
  path.resolve(__dirname, 'src', '.env'),
  path.resolve(__dirname, '.env'),
];

const envPath = envCandidates.find((p) => fs.existsSync(p));
require('dotenv').config(envPath ? { path: envPath } : undefined);

const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot ROTA Online 🚔");
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

console.log("TOKEN:", process.env.TOKEN ? "OK" : "NÃO ENCONTRADO");


const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./src/config');
const { loadCommands } = require('./src/handlers/commandHandler');
const { loadEvents } = require('./src/handlers/eventHandler');

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

client.once("ready", () => {
  console.log(`🚔 Bot online como ${client.user.tag}`);
});

client.login(config.token).catch((e) => {
  console.error('[ROTA] Falha no login. Verifique TOKEN no .env:', e.message);
  process.exit(1);
});