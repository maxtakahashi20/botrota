const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const LOG_BANNER_PATH = path.join(__dirname, '../../assets/log-ticket-banner.png');
const LOG_BANNER_FILENAME = 'log-ticket-banner.png';

const PANEL_BUTTON_PREFIX = 'rota_ticket_open:';
const MODAL_PREFIX = 'rota_ticket_modal:';
const MODAL_INPUT_ASSUNTO = 'rota_ticket_assunto';
const ASSUNTO_MIN_LEN = 3;
const ASSUNTO_MAX_LEN = 2000;
const config = require('../config');
const { startRecruitmentInterview, isInterviewType } = require('./interviewService');

/** @type {Map<string, number>} userId -> expiry timestamp */
const cooldownUntil = new Map();

/** @type {Map<string, { userId: string, typeKey: string, openedAt: number }>} channelId */
const ticketMeta = new Map();

/** @type {Set<string>} */
const deleteInProgress = new Set();

function sanitizeChannelPart(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '')
    .slice(0, 80) || 'user';
}

function channelNameForTicket(typeSlug, member) {
  const userPart = sanitizeChannelPart(member.user.username);
  const base = `${typeSlug}-${userPart}`.slice(0, 100);
  return base;
}

function hasStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.has(config.staffRoleId);
}

function isOnCooldown(userId) {
  const until = cooldownUntil.get(userId);
  if (!until) return 0;
  if (Date.now() >= until) {
    cooldownUntil.delete(userId);
    return 0;
  }
  return Math.ceil((until - Date.now()) / 1000);
}

function setCooldown(userId) {
  const ms = Math.max(1, config.ticketCooldownSeconds) * 1000;
  cooldownUntil.set(userId, Date.now() + ms);
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 */
async function userHasOpenTicket(guild, userId) {
  const catId = config.ticketCategoryId;
  const channels = guild.channels.cache.filter((c) => {
    if (c.parentId !== catId || c.type !== ChannelType.GuildText) return false;
    const meta = ensureTicketMeta(c);
    return meta && meta.userId === userId && !meta.closed;
  });
  return channels.size > 0;
}

function buildPanelEmbed() {
  const e = new EmbedBuilder()
    .setTitle('🎫 CENTRAL DE TICKETS | 2ª CIA ROTA')
    .setDescription(
      [
        'Bem-vindo à nossa Central de Atendimento. Escolha a categoria referente ao seu assunto:',
        '',
        '## **1. CONCURSO E INGRESSO**',
        '• **Edital:** Verifique se as vagas estão **ABERTAS** no canal de anúncios.',
        '• **Dúvidas:** Utilize este ticket para questões sobre formulários ou fases do processo seletivo da 2ª Companhia.',
        '',
        '## **2. DÚVIDAS E SUPORTE**',
        '• Informações gerais, suporte administrativo ou questões operacionais em Salve RP.',
        '',
        '## **INSTRUÇÕES:**',
        '1. Descreva brevemente o seu assunto abaixo.',
        '2. Um membro da nossa equipe de atendimento irá responder em breve.',
        '',
        '> *"ROTA - Reservado aos poucos."*',
      ].join('\n')
    )
    .setColor(config.embedColor);

  if (config.embedImageUrl) e.setImage(config.embedImageUrl);
  return e;
}

function buildPanelButtonRows() {
  const buttons = Object.entries(config.ticketTypes).map(([value, t]) =>
    new ButtonBuilder()
      .setCustomId(`${PANEL_BUTTON_PREFIX}${value}`)
      .setLabel(t.menuLabel.slice(0, 80))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(t.menuEmoji)
  );
  return [new ActionRowBuilder().addComponents(buttons)];
}

/**
 * @param {import('discord.js').GuildMember} member
 * @param {{ label: string; summary?: string }} typeDef
 * @param {string} subject
 */
function buildTicketWelcomeEmbed(member, typeDef, subject) {
  const summary = typeDef.summary?.trim() || 'Descreva seu pedido com clareza para agilizar o atendimento.';
  const assunto = String(subject || '').trim() || '—';
  const body = [
    `Olá ${member}`,
    '',
    '**Sobre este ticket**',
    summary,
    '',
    'Você pode complementar pelo chat se precisar.',
    'Aguarde um membro da equipe.',
  ].join('\n');

  const fieldRows = [];
  for (let i = 0; i < assunto.length && fieldRows.length < 25; i += 1024) {
    const chunk = assunto.slice(i, i + 1024);
    fieldRows.push({
      name: i === 0 ? '📌 Assunto' : '\u200b',
      value: chunk || '—',
    });
  }
  if (fieldRows.length === 0) fieldRows.push({ name: '📌 Assunto', value: '—' });

  return new EmbedBuilder()
    .setTitle('Atendimento ROTA iniciado')
    .setDescription(body.slice(0, 3500))
    .setColor(config.embedColor)
    .addFields(fieldRows)
    .setFooter({ text: `Tipo: ${typeDef.label}` })
    .setTimestamp();
}

function buildControlRow() {
  return new ActionRowBuilder().addComponents(
    // new ButtonBuilder()
    //   .setCustomId('rota_ticket_close')
    //   .setLabel('Fechar Ticket')
    //   .setStyle(ButtonStyle.Primary)
    //   .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId('rota_ticket_delete')
      .setLabel('Deletar Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
  );
}

function panelPayload() {
  return { embeds: [buildPanelEmbed()], components: buildPanelButtonRows() };
}

/**
 * Envia o painel (mensagem nova).
 * @param {import('discord.js').TextBasedChannel} channel
 */
async function sendTicketPanel(channel) {
  await channel.send(panelPayload());
}

/**
 * Atualiza mensagem existente do painel (mesmo título) ou envia uma nova.
 * @param {import('discord.js').Client} client
 * @returns {Promise<boolean>}
 */
async function upsertTicketPanel(client) {
  try {
    const ch = await client.channels.fetch(config.painelChannelId).catch(() => null);
    if (!ch || !ch.isTextBased()) {
      console.warn('[ROTA] PAINEL_CHANNEL_ID inválido ou inacessível; painel não foi publicado.');
      return false;
    }

    const botId = client.user?.id;
    if (!botId) return false;

    const messages = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) {
      await ch.send(panelPayload());
      console.log('[ROTA] Painel de tickets enviado (sem histórico para atualizar).');
      return true;
    }

    const match = messages
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .find((m) => {
        if (m.author?.id !== botId) return false;
        if (m.embeds?.[0]?.title?.includes('Sistema Ticket | ROTA')) return true;
        return m.components?.some((row) =>
          row.components?.some((c) => 'customId' in c && c.customId?.startsWith(PANEL_BUTTON_PREFIX))
        );
      });

    const payload = panelPayload();
    if (match) {
      await match.edit(payload);
      console.log('[ROTA] Painel de tickets atualizado no canal configurado.');
    } else {
      await ch.send(payload);
      console.log('[ROTA] Painel de tickets enviado no canal configurado.');
    }
    return true;
  } catch (e) {
    console.error('[ROTA] Falha ao publicar painel de tickets:', e);
    return false;
  }
}

/**
 * Botão do painel:
 * - Para recrutamento/concurso: cria o ticket automaticamente (sem modal).
 * - Para os demais: abre modal para o usuário informar o assunto.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} typeKey
 */
async function openTicketModalFromButton(interaction, typeKey) {
  const typeDef = config.ticketTypes[typeKey];
  if (!typeDef) {
    await interaction.reply({ content: 'Tipo inválido.', ephemeral: true });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: 'Use o painel dentro do servidor.', ephemeral: true });
    return;
  }

  const cd = isOnCooldown(interaction.user.id);
  if (cd > 0) {
    await interaction.reply({
      content: `Aguarde **${cd}s** antes de abrir outro ticket.`,
      ephemeral: true,
    });
    return;
  }

  if (await userHasOpenTicket(interaction.guild, interaction.user.id)) {
    await interaction.reply({
      content: 'Você já possui um ticket aberto. Finalize-o antes de abrir outro.',
      ephemeral: true,
    });
    return;
  }

  if (isInterviewType(typeKey)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const categoryId = config.ticketCategoryId;
    const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.editReply({ content: 'Categoria de tickets inválida (config).' });
      return;
    }

    const name = channelNameForTicket(typeDef.slug, interaction.member);
    const staffRoleId = config.staffRoleId;
    const everyoneId = interaction.guild.roles.everyone.id;
    const botId = interaction.client.user.id;
    const subject = 'Entrevista — Concurso/Ingresso (automático)';

    /** @type {import('discord.js').TextChannel | null} */
    let ticketChannel = null;

    try {
      ticketChannel = await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: categoryId,
        topic: `ROTA_TICKET|user:${interaction.user.id}|type:${typeKey}|closed:0`,
        permissionOverwrites: [
          { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: botId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
            ],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
            ],
          },
          {
            id: staffRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
            ],
          },
        ],
      });

      ticketMeta.set(ticketChannel.id, {
        userId: interaction.user.id,
        typeKey,
        subject,
        openedAt: Date.now(),
        closed: false,
      });

      // Sem card/boas-vindas para recrutamento: a entrevista já manda embeds.
      // (mantemos o canal “limpo” para o fluxo de whitelist)
    } catch (e) {
      console.error(e);
      if (ticketChannel) {
        ticketMeta.delete(ticketChannel.id);
        await ticketChannel
          .delete('Ticket incompleto — erro ao criar ou iniciar entrevista')
          .catch(() => null);
      }
      const code = e?.code;
      let msg =
        'Falha ao configurar o ticket. Verifique permissões do bot na categoria e os IDs no `.env`.';
      if (code === 50001) {
        msg =
          'O bot ficou sem acesso ao canal do ticket (erro 50001). Isso costumava ocorrer quando o bot não tinha overwrite próprio; atualize o bot. Se o canal órfão ainda existir, apague manualmente.';
      } else if (code === 50013) {
        msg = 'O bot não tem permissão suficiente para criar canais nesta categoria (50013).';
      }
      await interaction.editReply({ content: msg });
      return;
    }

    const logFields = [
      { name: 'Usuário', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
      { name: 'Tipo', value: typeDef.label, inline: true },
      { name: 'Canal', value: `${ticketChannel}`, inline: true },
      { name: 'Assunto', value: subject, inline: false },
    ];

    try {
      await interaction.editReply({ content: `Ticket criado: ${ticketChannel}` });
      await sendLog(interaction.client, {
        title: '📂 Ticket aberto',
        fields: logFields,
        color: config.embedColor,
      });
    } catch (e) {
      console.error('[ticket] Pós-abertura (log/reply):', e);
    }

    if (ticketChannel) {
      setTimeout(() => {
        startRecruitmentInterview(interaction.client, ticketChannel, interaction.user).catch((e) =>
          console.error('[interview] startRecruitmentInterview', e)
        );
      }, 800);
    }

    return;
  }

  const modalTitle = `Ticket — ${typeDef.menuLabel}`.slice(0, 45);
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${typeKey}`)
    .setTitle(modalTitle);

  const assuntoInput = new TextInputBuilder()
    .setCustomId(MODAL_INPUT_ASSUNTO)
    .setLabel('Qual é o assunto do atendimento?')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(ASSUNTO_MIN_LEN)
    .setMaxLength(ASSUNTO_MAX_LEN)
    .setPlaceholder('Descreva com clareza o que você precisa.')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(assuntoInput));
  await interaction.showModal(modal);
}

/**
 * Após enviar o modal: cria o canal do ticket com o assunto no embed.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleTicketModalSubmit(interaction) {
  if (!interaction.guild || !interaction.member) {
    await interaction.reply({ content: 'Use o ticket dentro do servidor.', ephemeral: true });
    return;
  }

  const typeKey = interaction.customId.slice(MODAL_PREFIX.length);
  const typeDef = config.ticketTypes[typeKey];
  if (!typeDef) {
    await interaction.reply({ content: 'Tipo de ticket inválido.', ephemeral: true });
    return;
  }

  const subject = interaction.fields.getTextInputValue(MODAL_INPUT_ASSUNTO)?.trim() ?? '';
  if (subject.length < ASSUNTO_MIN_LEN) {
    await interaction.reply({
      content: `O assunto deve ter pelo menos ${ASSUNTO_MIN_LEN} caracteres.`,
      ephemeral: true,
    });
    return;
  }

  const cd = isOnCooldown(interaction.user.id);
  if (cd > 0) {
    await interaction.reply({
      content: `Aguarde **${cd}s** antes de abrir outro ticket.`,
      ephemeral: true,
    });
    return;
  }

  if (await userHasOpenTicket(interaction.guild, interaction.user.id)) {
    await interaction.reply({
      content: 'Você já possui um ticket aberto. Finalize-o antes de abrir outro.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const categoryId = config.ticketCategoryId;
  const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    await interaction.editReply({ content: 'Categoria de tickets inválida (config).' });
    return;
  }

  const name = channelNameForTicket(typeDef.slug, interaction.member);
  const staffRoleId = config.staffRoleId;
  const everyoneId = interaction.guild.roles.everyone.id;
  const botId = interaction.client.user.id;

  /** @type {import('discord.js').TextChannel | null} */
  let ticketChannel = null;

  try {
    ticketChannel = await interaction.guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `ROTA_TICKET|user:${interaction.user.id}|type:${typeKey}|closed:0`,
      permissionOverwrites: [
        { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: botId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        {
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ],
    });

    ticketMeta.set(ticketChannel.id, {
      userId: interaction.user.id,
      typeKey,
      subject,
      openedAt: Date.now(),
      closed: false,
    });

    const welcome = buildTicketWelcomeEmbed(interaction.member, typeDef, subject);
    const controls = buildControlRow();
    await ticketChannel.send({
      content: `${interaction.user} | <@&${staffRoleId}>`,
      embeds: [welcome],
      components: [controls],
    });
  } catch (e) {
    console.error(e);
    if (ticketChannel) {
      ticketMeta.delete(ticketChannel.id);
      await ticketChannel.delete('Ticket incompleto — erro ao criar ou enviar mensagem inicial').catch(() => null);
    }
    const code = e?.code;
    let msg =
      'Falha ao configurar o ticket. Verifique permissões do bot na categoria e os IDs no `.env`.';
    if (code === 50001) {
      msg =
        'O bot ficou sem acesso ao canal do ticket (erro 50001). Isso costumava ocorrer quando o bot não tinha overwrite próprio; atualize o bot. Se o canal órfão ainda existir, apague manualmente.';
    } else if (code === 50013) {
      msg = 'O bot não tem permissão suficiente para criar canais nesta categoria (50013).';
    }
    await interaction.editReply({ content: msg });
    return;
  }

  const logFields = [
    { name: 'Usuário', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
    { name: 'Tipo', value: typeDef.label, inline: true },
    { name: 'Canal', value: `${ticketChannel}`, inline: true },
    { name: 'Assunto', value: subject.slice(0, 1024) || '—', inline: false },
  ];
  if (subject.length > 1024) {
    logFields.push({ name: 'Assunto (cont.)', value: subject.slice(1024, 2048), inline: false });
  }

  try {
    await interaction.editReply({ content: `Ticket criado: ${ticketChannel}` });
    await sendLog(interaction.client, {
      title: '📂 Ticket aberto',
      fields: logFields,
      color: config.embedColor,
    });
  } catch (e) {
    console.error('[ticket] Pós-abertura (log/reply):', e);
  }

  if (isInterviewType(typeKey) && ticketChannel) {
    // Pequeno delay para o usuário ler o embed de boas-vindas antes do bot
    // começar a sequência de perguntas. Fire-and-forget.
    setTimeout(() => {
      startRecruitmentInterview(interaction.client, ticketChannel, interaction.user).catch(
        (e) => console.error('[interview] startRecruitmentInterview', e)
      );
    }, 1500);
  }
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleCloseTicket(interaction) {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'Canal inválido.', ephemeral: true });
    return;
  }

  if (!hasStaff(interaction.member)) {
    await interaction.reply({ content: 'Apenas a equipe pode fechar tickets.', ephemeral: true });
    return;
  }

  const meta = ensureTicketMeta(interaction.channel);
  if (!meta) {
    await interaction.reply({ content: 'Este canal não está registrado como ticket.', ephemeral: true });
    return;
  }
  if (meta.closed) {
    await interaction.reply({ content: 'Este ticket já está fechado.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  meta.closed = true;
  meta.closedAt = Date.now();
  meta.closedById = interaction.user.id;
  ticketMeta.set(interaction.channel.id, meta);

  try {
    await interaction.channel.setTopic(
      `ROTA_TICKET|user:${meta.userId}|type:${meta.typeKey}|closed:1`
    );
  } catch {
    // ignore
  }

  await interaction.channel.send({
    content: 'Ticket fechado pelo staff.',
  });

  await interaction.channel.permissionOverwrites.edit(meta.userId, {
    SendMessages: false,
    AddReactions: false,
    AttachFiles: false,
    EmbedLinks: false,
  });

  const typeDef = config.ticketTypes[meta.typeKey];
  const closeFields = [
    { name: 'Usuário', value: `<@${meta.userId}> (\`${meta.userId}\`)`, inline: true },
    { name: 'Staff', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
    { name: 'Tipo', value: typeDef ? typeDef.label : meta.typeKey, inline: true },
    { name: 'Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    { name: 'Canal', value: `${interaction.channel}`, inline: true },
  ];
  if (meta.subject) {
    closeFields.push({
      name: 'Assunto',
      value: String(meta.subject).slice(0, 1024) || '—',
      inline: false,
    });
  }
  await sendLog(interaction.client, {
    title: '🔒 Ticket fechado',
    fields: closeFields,
    color: config.embedColor,
  });

  try {
    await interaction.message.edit({ components: [] });
  } catch {
    // ignore
  }
}

async function fetchAllMessages(channel) {
  /** @type {import('discord.js').Message[]} */
  const all = [];
  let lastId;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId });
    if (batch.size === 0) break;
    all.push(...batch.values());
    lastId = batch.lastKey();
    if (batch.size < 100) break;
  }
  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return all;
}

function buildTranscriptHtml(channel, messages, meta) {
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const lines = messages.map((m) => {
    const t = m.createdAt.toISOString();
    const author = esc(m.author.tag);
    const content = esc(m.content || '(sem texto)');
    const att =
      m.attachments.size > 0
        ? `<br/><small>Anexos: ${[...m.attachments.values()].map((a) => esc(a.url)).join(', ')}</small>`
        : '';
    return `<div class="msg"><span class="ts">${esc(t)}</span> <b>${author}</b>: ${content}${att}</div>`;
  });
  const typeDef = meta && config.ticketTypes[meta.typeKey];
  const assuntoBlock = meta?.subject
    ? `<p><b>Assunto:</b> ${esc(meta.subject)}</p>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Transcript ${esc(channel.name)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;background:#111;color:#ffffff;padding:16px;} .msg{border-bottom:1px solid #333;padding:8px 0;} .ts{color:#888;font-size:12px;}</style></head><body>
<h1>Transcript — ${esc(channel.name)}</h1>
<p>Canal: ${esc(channel.id)} | Gerado: ${esc(new Date().toISOString())}</p>
<p>Tipo: ${esc(typeDef ? typeDef.label : meta?.typeKey || '—')}</p>
${assuntoBlock}
<hr/>
${lines.join('\n')}
</body></html>`;
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleDeleteTicket(interaction) {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'Canal inválido.', ephemeral: true });
    return;
  }

  if (!hasStaff(interaction.member)) {
    await interaction.reply({ content: 'Apenas a equipe pode deletar tickets.', ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  if (deleteInProgress.has(channel.id)) {
    await interaction.reply({ content: 'Este ticket já está sendo apagado.', ephemeral: true });
    return;
  }

  const meta = ensureTicketMeta(channel);

  await interaction.deferReply({ ephemeral: true });
  deleteInProgress.add(channel.id);

  try {
    let transcriptPath = null;
    try {
      const msgs = await fetchAllMessages(channel);
      const html = buildTranscriptHtml(channel, msgs, meta);
      const dir = path.join(os.tmpdir(), 'rota-tickets');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      transcriptPath = path.join(dir, `transcript-${channel.id}-${Date.now()}.html`);
      fs.writeFileSync(transcriptPath, html, 'utf8');
    } catch (e) {
      console.error('Transcript error', e);
    }

    const typeDef = meta && config.ticketTypes[meta.typeKey];
    const files = transcriptPath
      ? [new AttachmentBuilder(transcriptPath, { name: `transcript-${channel.name}.html` })]
      : [];

    const delFields = [
      { name: 'Usuário', value: meta ? `<@${meta.userId}> (\`${meta.userId}\`)` : '—', inline: true },
      { name: 'Staff', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
      { name: 'Tipo', value: typeDef ? typeDef.label : meta?.typeKey || '—', inline: true },
      { name: 'Data', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
      { name: 'Canal', value: `\`${channel.name}\` (\`${channel.id}\`)`, inline: false },
    ];
    if (meta?.subject) {
      delFields.push({
        name: 'Assunto',
        value: String(meta.subject).slice(0, 1024) || '—',
        inline: false,
      });
    }
    await sendLog(interaction.client, {
      title: '🗑️ Ticket deletado',
      fields: delFields,
      color: config.embedColor,
      files,
    });

    if (meta?.userId) setCooldown(meta.userId);

    await interaction.editReply({ content: 'Canal será apagado em **5 segundos**.' });

    setTimeout(async () => {
      try {
        ticketMeta.delete(channel.id);
        await channel.delete('Ticket deletado pela equipe');
      } catch (e) {
        console.error(e);
      } finally {
        deleteInProgress.delete(channel.id);
      }
      if (transcriptPath) {
        try {
          fs.unlinkSync(transcriptPath);
        } catch {
          // ignore
        }
      }
    }, 5000);
  } catch (e) {
    deleteInProgress.delete(channel.id);
    console.error('[delete ticket]', e);
    await interaction.editReply({ content: 'Erro ao preparar exclusão do ticket.' }).catch(() => null);
  }
}

/**
 * @param {import('discord.js').Client} client
 * @param {object} opts
 */
async function sendLog(client, opts) {
  const logId = config.logChannelId;
  if (!logId) return;
  const ch = await client.channels.fetch(logId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setTitle(opts.title)
    .setColor(opts.color ?? config.embedColor)
    .setTimestamp();
  if (opts.fields) embed.addFields(opts.fields);

  const files = [...(opts.files || [])];
  if (config.logEmbedImageUrl) {
    embed.setImage(config.logEmbedImageUrl);
  } else if (fs.existsSync(LOG_BANNER_PATH)) {
    files.unshift(new AttachmentBuilder(LOG_BANNER_PATH, { name: LOG_BANNER_FILENAME }));
    embed.setImage(`attachment://${LOG_BANNER_FILENAME}`);
  }

  await ch.send({ embeds: [embed], files }).catch(() => null);
}

const TOPIC_RE = /^ROTA_TICKET\|user:(\d+)\|type:([\w-]+)(?:\|closed:([01]))?$/;

/**
 * @param {import('discord.js').BaseGuildTextChannel} channel
 */
function ensureTicketMeta(channel) {
  if (!channel) return null;
  const existing = ticketMeta.get(channel.id);
  if (existing) return existing;
  const topic = channel.topic || '';
  if (!topic) return null;
  const m = topic.match(TOPIC_RE);
  if (!m) return null;
  const [, userId, typeKey, closedFlag] = m;
  const meta = {
    userId,
    typeKey,
    openedAt: 0,
    closed: closedFlag === '1',
  };
  ticketMeta.set(channel.id, meta);
  return meta;
}

/**
 * Restaura metadados de tickets após restart (anti-duplicado consistente).
 * @param {import('discord.js').Guild} guild
 */
async function hydrateTicketsFromGuild(guild) {
  const catId = config.ticketCategoryId;
  if (!catId) return;
  await guild.channels.fetch().catch(() => null);
  guild.channels.cache.forEach((ch) => {
    if (ch.parentId !== catId || ch.type !== ChannelType.GuildText) return;
    const topic = ch.topic || '';
    const m = topic.match(TOPIC_RE);
    if (!m) return;
    const [, userId, typeKey, closedFlag] = m;
    ticketMeta.set(ch.id, {
      userId,
      typeKey,
      openedAt: 0,
      closed: closedFlag === '1',
    });
  });
}

module.exports = {
  sendTicketPanel,
  upsertTicketPanel,
  openTicketModalFromButton,
  handleTicketModalSubmit,
  handleCloseTicket,
  handleDeleteTicket,
  hasStaff,
  ticketMeta,
  hydrateTicketsFromGuild,
};
