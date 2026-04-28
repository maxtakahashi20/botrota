# botrota

## Visão geral

Este projeto é um **bot de tickets para Discord** (ROTA) com:

- **Painel de tickets** com botões por categoria
- **Tickets automáticos** para **Concurso/Recrutamento** (sem modal/assunto)
- **Entrevista automática em embeds** (perguntas sequenciais + timeout)
- **Envio para análise** no canal de logs com botões **Aprovar/Reprovar**
- **DM automática** para o candidato e **fechamento do ticket**

## Estrutura do projeto (raiz = `src`)

```text
.
├── assets/
│   └── log-ticket-banner.png
├── commands/
│   └── painelTicket.js
├── config/
│   └── index.js
├── events/
│   ├── interactionCreate.js
│   └── ready.js
├── handlers/
│   ├── commandHandler.js
│   ├── eventHandler.js
│   ├── ticketService.js
│   └── interviewService.js
├── .gitignore
├── .npmrc
├── discloud.config
├── Dockerfile
├── index.js
├── package-lock.json
├── package.json
└── README.md
```

| Pasta / ficheiro | Função |
|------------------|--------|
| `assets/` | Imagens e recursos estáticos |
| `commands/` | Comandos slash do Discord |
| `config/` | Configuração carregada pelo bot |
| `events/` | Handlers de eventos (`ready`, `interactionCreate`, …) |
| `handlers/` | Carregamento de comandos/eventos e lógica de tickets |
| `index.js` | Entrada: Express + cliente Discord |
| `Dockerfile` | Build no Discloud (corrige `npm install` como utilizador `node`) |
| `discloud.config` | Configuração Discloud (se usares esse host) |

## Configuração (`src/.env`)

As variáveis de ambiente são lidas de **`src/.env`** (prioritário).

Não commite o `.env` em repositórios públicos.

### Variáveis obrigatórias

- **`TOKEN`**: token do bot (Discord Developer Portal)
- **`CLIENT_ID`**: Application ID
- **`GUILD_ID`**: ID do servidor
- **`PAINEL_CHANNEL_ID`**: canal onde o painel é publicado/atualizado
- **`TICKET_CATEGORY_ID`**: categoria onde os tickets serão criados
- **`STAFF_ROLE_ID`**: cargo que pode ver/gerenciar tickets e aprovar/reprovar
- **`LOG_CHANNEL_ID`**: canal onde as entrevistas/tickets são registrados para análise

### Variáveis opcionais

- **`PORT`**: porta do Express (padrão: `3000`)
- **`EMBED_IMAGE_URL`**: imagem do embed do painel
- **`LOG_EMBED_IMAGE_URL`**: banner do embed de logs (se vazio, usa `assets/log-ticket-banner.png` se existir)
- **`TICKET_COOLDOWN_SECONDS`**: cooldown (padrão: `60`)

## Como rodar

```bash
npm install
npm start
```

Se aparecer `EADDRINUSE: 3000`, significa que já existe algo rodando na porta 3000. Você pode:

- Encerrar o processo que está usando a porta, ou
- Rodar em outra porta:

```powershell
$env:PORT=3001; npm start
```

## Fluxo: Concurso/Recrutamento

Quando o usuário clica em **Concurso** no painel:

- O bot **cria o ticket automaticamente** (**sem modal** e **sem pedir assunto**)
- O bot **não envia o card/boas-vindas** padrão do ticket
- O bot inicia a **entrevista automática em embeds** (perguntas configuradas em `src/handlers/interviewService.js`)
- Ao finalizar, envia as respostas para o **canal de análise** (`LOG_CHANNEL_ID`) com botões:
  - **✅ Aprovar**
  - **❌ Reprovar**
- Ao decidir:
  - O bot envia **DM** para o candidato
  - O bot **fecha o ticket** (deleta o canal após alguns segundos)

## Permissões

- O bot precisa de permissão para **criar canais** na categoria de tickets e **gerenciar canais**.
- Para entrevista por mensagens funcionar, habilite no Developer Portal:
  - **Message Content Intent** (se necessário no seu caso de uso)
