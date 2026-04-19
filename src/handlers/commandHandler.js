const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

/**
 * @param {import('discord.js').Client} client
 */
function loadCommands(client) {
  client.commands = new Collection();
  const dir = path.join(__dirname, '../commands');
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const cmd = require(path.join(dir, file));
    if (cmd?.data?.name) client.commands.set(cmd.data.name, cmd);
  }
}

module.exports = { loadCommands };
