require('dotenv').config();

function requireEnv(name) {
  const v = process.env[name];
  if (!v || String(v).trim() === '') {
    console.warn(`[config] Variável ausente: ${name}`);
  }
  return v;
}

/** Discord snowflake: 17–19 dígitos (às vezes com texto/comentário no .env). */
function snowflakeEnv(name) {
  const raw = requireEnv(name);
  const s = String(raw ?? '').trim();
  const m = s.match(/\d{17,20}/);
  if (m && m[0] !== s.replace(/\s+/g, '')) {
    console.warn(`[config] ${name}: valor tinha texto extra; usando só o ID: ${m[0]}`);
  }
  return m ? m[0] : s;
}

module.exports = {
  token: requireEnv('TOKEN'),
  clientId: snowflakeEnv('CLIENT_ID'),
  guildId: snowflakeEnv('GUILD_ID'),
  painelChannelId: snowflakeEnv('PAINEL_CHANNEL_ID'),
  ticketCategoryId: snowflakeEnv('TICKET_CATEGORY_ID'),
  staffRoleId: snowflakeEnv('STAFF_ROLE_ID'),
  logChannelId: snowflakeEnv('LOG_CHANNEL_ID'),
  embedImageUrl: process.env.EMBED_IMAGE_URL || '',
  /** URL pública para banner dos embeds de log; se vazio, usa `assets/log-ticket-banner.png` no projeto. */
  logEmbedImageUrl: (process.env.LOG_EMBED_IMAGE_URL || '').trim(),
  ticketCooldownSeconds: Number(process.env.TICKET_COOLDOWN_SECONDS) || 60,

  embedColor: '#ffffff',

  ticketTypes: {
    recrutamento: {
      label: '📄 Concurso',
      slug: 'recrutamento',
      menuLabel: 'Concurso',
      menuEmoji: '📄',
      summary:
        'Canal para candidaturas e etapas de ingresso na ROTA. Explique sua motivação e aguarde orientação da equipe.',
    },
    duvidas: {
      label: '📌 Dúvidas',
      slug: 'duvidas',
      menuLabel: 'Dúvidas',
      menuEmoji: '📌',
      summary:
        'Canal para perguntas sobre regras, procedimentos e dúvidas gerais da ROTA. Seja objetivo na sua dúvida.',
    },
  },
};
