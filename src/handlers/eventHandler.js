const fs = require('fs');
const path = require('path');

/**
 * @param {import('discord.js').Client} client
 */
function loadEvents(client) {
  const dir = path.join(__dirname, '../events');
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const event = require(path.join(dir, file));
    if (!event?.name || typeof event.execute !== 'function') continue;
    if (event.once) client.once(event.name, (...args) => event.execute(...args));
    else client.on(event.name, (...args) => event.execute(...args));
  }
}

module.exports = { loadEvents };
