const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');

const config = require('../config');

const APPROVE_PREFIX = 'rota_interview_approve:';
const REJECT_PREFIX = 'rota_interview_reject:';

const INTERVIEW_TYPE_KEY = 'recrutamento';
const ANSWER_TIMEOUT_MS = 120000;
const MAX_FIELD_LENGTH = 1024;
const CLOSE_DELAY_MS = 5000;

const AVISO = [
  '🚨 **ATENÇÃO — PROCESSO SELETIVO ROTA**',
  '',
  'Para participar do processo, **mantenha sua DM aberta**.',
  'Caso esteja fechada, você **NÃO receberá** a mensagem de aprovação ou reprovação.',
  '',
  'Isso pode resultar na **perda da sua vaga**.',
  '',
  `Responda as perguntas abaixo com atenção. Você terá **${Math.floor(ANSWER_TIMEOUT_MS / 1000)} segundos** para responder cada uma.`,
].join('\n');

const PERGUNTAS = [
  '📌 **1.** Apresente-se brevemente e descreva sua trajetória dentro da corporação, destacando experiências relevantes para o ingresso no oficialato da ROTA.',
  '📌 **2.** Quais são, na sua visão, os principais valores que um oficial da ROTA deve possuir? Explique como você aplica esses valores no seu dia a dia.',
  '📌 **3.** Descreva uma situação de alta pressão que você enfrentou em serviço. Como foi sua tomada de decisão e qual foi o desfecho da ocorrência?',
  '📌 **4.** O que te motiva a ingressar especificamente na ROTA e não em outra unidade operacional?',
  '📌 **5.** Explique qual é o papel de um oficial dentro de uma equipe da ROTA durante uma ocorrência crítica.',
  '📌 **6.** Como você lidaria com uma equipe sob seu comando em um cenário onde há risco iminente e necessidade de resposta rápida?',
  '📌 **7.** Na sua opinião, qual a importância da hierarquia e disciplina dentro da ROTA e como isso impacta o resultado operacional?',
  '📌 **8.** Descreva como deve ser a conduta de um oficial fora de serviço, representando a imagem do batalhão.',
  '📌 **9.** Você se considera preparado física e psicologicamente para atuar em ocorrências de alto risco? Justifique sua resposta.',
  '📌 **10.** Em uma situação onde um subordinado descumpre uma ordem direta em operação, qual seria sua atitude como oficial?',
  '📌 **11.** Caso seja aprovado, o que você pretende agregar ao batalhão e de que forma pretende evoluir dentro da ROTA?',
  '📌 **12.** Qual sua disponibilidade semanal ? ',
  '📌 **13.** Qual sua disponibilidade final de semana ? ',
  '📌 **14.** Voce ja foi  do ilegal em alguma cidade ? , se sim descreva brevemente ',
];

/** @type {Map<string, 'running' | 'submitted' | 'decided'>} channelId -> state */
const interviewState = new Map();

function buildAvisoEmbed(user) {
  return new EmbedBuilder()
    .setTitle('🚨 Atenção — Entrevista ROTA')
    .setDescription(AVISO)
    .setColor(0xff0000)
    .addFields([{ name: 'Candidato', value: `${user} (\`${user.id}\`)` }])
    .setFooter({ text: 'Mantenha a DM aberta para receber o resultado.' })
    .setTimestamp();
}

function buildPerguntaEmbed(user, index, total, pergunta) {
  const timeoutS = Math.floor(ANSWER_TIMEOUT_MS / 1000);
  return new EmbedBuilder()
    .setTitle(`📋 Entrevista ROTA — Pergunta ${index + 1}/${total}`)
    .setDescription(pergunta)
    .setColor(0xffffff)
    .addFields([
      { name: 'Candidato', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: 'Tempo para responder', value: `**${timeoutS}s**`, inline: true },
    ])
    .setFooter({ text: 'Responda neste canal com uma mensagem.' })
    .setTimestamp();
}

function buildTimeoutEmbed(user, answered, total) {
  return new EmbedBuilder()
    .setTitle('⏰ Tempo esgotado')
    .setDescription(
      `A entrevista foi cancelada por falta de resposta.\n\n**Progresso:** ${answered}/${total} perguntas respondidas.`
    )
    .setColor(0xe67e22)
    .addFields([{ name: 'Candidato', value: `${user} (\`${user.id}\`)` }])
    .setTimestamp();
}

function buildSubmittedEmbed(user) {
  return new EmbedBuilder()
    .setTitle('✅ Respostas enviadas para análise')
    .setDescription('Suas respostas foram encaminhadas para a equipe. Aguarde o retorno por DM.')
    .setColor(0x2ecc71)
    .addFields([{ name: 'Candidato', value: `${user} (\`${user.id}\`)` }])
    .setTimestamp();
}

function buildAprovacaoDM(username) {
  return [
    '📢 **APROVAÇÃO — ESTÁGIO ROTA**',
    '',
    `Prezado **${username}**,`,
    '',
    'Após análise do seu processo seletivo e entrevista realizada pelo setor de **Recursos P1**, informamos que **Vossa Senhoria foi APROVADO para o Estágio da ROTA** — *Rondas Ostensivas Tobias de Aguiar*. 🚔',
    '',
    'Sua aprovação se dá com base em sua experiência prévia na unidade, conhecimento da doutrina e postura apresentada durante a entrevista.',
    '',
    '📌 **Orientações:**',
    '• Dirigir-se até a **canaleta de Carteira Funcional**',
    '• Solicitar o **SET da ROTA**',
    '• Aguardar orientações do comando ou instrutores responsáveis pelo estágio',
    '',
    '⚠️ **Observação:**',
    'O período de estágio será utilizado para avaliação de desempenho, disciplina, adaptação operacional e conduta dentro da corporação.',
    '',
    'Seja bem-vindo novamente ao processo de formação da **ROTA**. Boa sorte em sua jornada.',
    '',
    '👮‍♂️ **1º Sargento Max Takahashi**',
    '📂 **Recursos P1**',
    '🚔 **Rondas Ostensivas Tobias de Aguiar**',
  ].join('\n');
}

function buildReprovacaoDM(username) {
  return [
    '📢 **RESULTADO — PROCESSO ROTA**',
    '',
    `Prezado **${username}**,`,
    '',
    'Após análise criteriosa do seu processo seletivo e entrevista realizada pelo setor de **Recursos P1**, informamos que neste momento **Vossa Senhoria NÃO foi aprovado** para o Estágio da ROTA — *Rondas Ostensivas Tobias de Aguiar*.',
    '',
    'Agradecemos seu interesse e o tempo dedicado ao processo. Recomendamos que continue desenvolvendo seu RP e participe de **futuras seleções** da corporação.',
    '',
    '📂 **Recursos P1**',
    '🚔 **Rondas Ostensivas Tobias de Aguiar**',
  ].join('\n');
}

function isInterviewType(typeKey) {
  return typeKey === INTERVIEW_TYPE_KEY;
}

function isInterviewButtonId(customId) {
  return (
    typeof customId === 'string' &&
    (customId.startsWith(APPROVE_PREFIX) || customId.startsWith(REJECT_PREFIX))
  );
}

/**
 * Conduz a entrevista no canal do ticket. Retorna o array de respostas
 * (uma por pergunta) ou `null` em caso de timeout/erro.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {import('discord.js').User} user
 */
async function runInterview(channel, user) {
  if (interviewState.get(channel.id)) return null;
  interviewState.set(channel.id, 'running');

  try {
    await channel.send({ embeds: [buildAvisoEmbed(user)] });
  } catch (e) {
    console.error('[interview] Falha ao enviar aviso:', e);
    interviewState.delete(channel.id);
    return null;
  }

  const respostas = [];

  for (let i = 0; i < PERGUNTAS.length; i += 1) {
    const pergunta = PERGUNTAS[i];
    try {
      await channel.send({ embeds: [buildPerguntaEmbed(user, i, PERGUNTAS.length, pergunta)] });
    } catch (e) {
      console.error('[interview] Falha ao enviar pergunta:', e);
      interviewState.delete(channel.id);
      return null;
    }

    const collected = await channel
      .awaitMessages({
        filter: (m) => m.author.id === user.id && !m.author.bot,
        max: 1,
        time: ANSWER_TIMEOUT_MS,
      })
      .catch(() => null);

    if (!collected || !collected.size) {
      await channel
        .send({ embeds: [buildTimeoutEmbed(user, i, PERGUNTAS.length)] })
        .catch(() => null);
      interviewState.delete(channel.id);
      return null;
    }

    const text = (collected.first().content || '').trim() || '—';
    respostas.push(text.slice(0, MAX_FIELD_LENGTH));
  }

  interviewState.set(channel.id, 'submitted');
  return respostas;
}

/**
 * @param {import('discord.js').User} user
 * @param {import('discord.js').TextChannel} ticketChannel
 * @param {string[]} respostas
 */
function buildReviewEmbed(user, ticketChannel, respostas) {
  const fields = respostas.map((value, i) => ({
    name: PERGUNTAS[i].replace(/\*\*/g, '').slice(0, 256),
    value: value || '—',
  }));

  fields.push({
    name: 'Canal do ticket',
    value: `${ticketChannel} (\`${ticketChannel.id}\`)`,
  });

  return new EmbedBuilder()
    .setTitle('📄 Nova Entrevista — Processo ROTA')
    .setDescription(`Candidato: ${user} (\`${user.id}\`)`)
    .setColor(0xff0000)
    .addFields(fields)
    .setFooter({ text: `${user.tag} • ${user.id}` })
    .setTimestamp();
}

function buildReviewButtons(userId, channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPROVE_PREFIX}${userId}:${channelId}`)
      .setLabel('Aprovar')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${REJECT_PREFIX}${userId}:${channelId}`)
      .setLabel('Reprovar')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').User} user
 * @param {import('discord.js').TextChannel} ticketChannel
 * @param {string[]} respostas
 */
async function sendForReview(client, user, ticketChannel, respostas) {
  const logId = config.logChannelId;
  if (!logId) {
    console.warn('[interview] LOG_CHANNEL_ID não configurado.');
    return false;
  }

  const ch = await client.channels.fetch(logId).catch(() => null);
  if (!ch || !ch.isTextBased()) {
    console.warn('[interview] LOG_CHANNEL_ID inválido ou inacessível.');
    return false;
  }

  const embed = buildReviewEmbed(user, ticketChannel, respostas);
  const row = buildReviewButtons(user.id, ticketChannel.id);

  await ch.send({
    content: `📥 Nova entrevista pendente — <@&${config.staffRoleId}>`,
    embeds: [embed],
    components: [row],
  });

  return true;
}

/**
 * Inicia a entrevista (executa em background; deve ser chamada com
 * `.catch()` por quem dispara para evitar unhandled rejections).
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').TextChannel} ticketChannel
 * @param {import('discord.js').User} user
 */
async function startRecruitmentInterview(client, ticketChannel, user) {
  const respostas = await runInterview(ticketChannel, user);
  if (!respostas) return;

  try {
    await ticketChannel.send({ embeds: [buildSubmittedEmbed(user)] });
  } catch {
    // ignore
  }

  try {
    await sendForReview(client, user, ticketChannel, respostas);
  } catch (e) {
    console.error('[interview] Falha ao enviar para análise:', e);
  }
}

function staffMember(member) {
  if (!member) return false;
  if (typeof member.permissions?.has === 'function' && member.permissions.has(PermissionFlagsBits.Administrator)) {
    return true;
  }
  return Boolean(member.roles?.cache?.has?.(config.staffRoleId));
}

/**
 * Trata clique nos botões Aprovar/Reprovar do canal de log.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleInterviewDecision(interaction) {
  const id = interaction.customId;
  const isApprove = id.startsWith(APPROVE_PREFIX);
  const isReject = id.startsWith(REJECT_PREFIX);
  if (!isApprove && !isReject) return;

  if (!staffMember(interaction.member)) {
    await interaction.reply({
      content: 'Apenas a equipe pode aprovar ou reprovar candidatos.',
      ephemeral: true,
    });
    return;
  }

  const payload = id.slice((isApprove ? APPROVE_PREFIX : REJECT_PREFIX).length);
  const [userId, channelId] = payload.split(':');
  if (!userId) {
    await interaction.reply({ content: 'Identificador inválido.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const user = await interaction.client.users.fetch(userId).catch(() => null);
  if (!user) {
    await interaction.editReply({ content: 'Não foi possível encontrar o usuário.' });
    return;
  }

  const dmText = isApprove ? buildAprovacaoDM(user.username) : buildReprovacaoDM(user.username);
  let dmOk = true;
  try {
    await user.send(dmText);
  } catch {
    dmOk = false;
  }

  try {
    const original = interaction.message;
    if (original?.embeds?.[0]) {
      const decisionLabel = isApprove ? 'APROVADO' : 'REPROVADO';
      const newEmbed = EmbedBuilder.from(original.embeds[0])
        .setColor(isApprove ? 0x2ecc71 : 0xe74c3c)
        .setFooter({
          text: `${decisionLabel} por ${interaction.user.tag}${dmOk ? '' : ' • DM falhou'}`,
        })
        .setTimestamp(new Date());
      await original.edit({ embeds: [newEmbed], components: [] });
    }
  } catch (e) {
    console.error('[interview] Falha ao atualizar mensagem de análise:', e);
  }

  let ticketChannel = null;
  if (channelId) {
    ticketChannel =
      interaction.guild?.channels?.cache.get(channelId) ||
      (await interaction.client.channels.fetch(channelId).catch(() => null));
  }

  if (ticketChannel) {
    interviewState.set(ticketChannel.id, 'decided');

    const closingMsg = isApprove
      ? `✅ Candidatura **APROVADA** por ${interaction.user}. Este ticket será fechado em ${Math.floor(CLOSE_DELAY_MS / 1000)}s.${dmOk ? '' : ' (DM não foi entregue ao usuário)'}`
      : `❌ Candidatura **REPROVADA** por ${interaction.user}. Este ticket será fechado em ${Math.floor(CLOSE_DELAY_MS / 1000)}s.${dmOk ? '' : ' (DM não foi entregue ao usuário)'}`;

    try {
      await ticketChannel.send(closingMsg);
    } catch {
      // ignore
    }

    setTimeout(() => {
      ticketChannel
        .delete('Ticket fechado por decisão da entrevista de recrutamento')
        .catch((e) => console.error('[interview] Falha ao deletar canal:', e));
    }, CLOSE_DELAY_MS);
  }

  await interaction.editReply({
    content: dmOk
      ? `Candidato ${isApprove ? 'aprovado' : 'reprovado'} e notificado por DM. Ticket será fechado.`
      : `Decisão registrada, mas **não foi possível enviar DM** ao usuário (DMs fechadas?). O ticket será fechado mesmo assim.`,
  });
}

module.exports = {
  startRecruitmentInterview,
  handleInterviewDecision,
  isInterviewButtonId,
  isInterviewType,
  INTERVIEW_TYPE_KEY,
};
