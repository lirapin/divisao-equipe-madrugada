/**
 * Módulo de integração com Telegram Bot API
 * Conecta ao bot e processa mensagens do grupo
 * VERSÃO SIMPLIFICADA - Uma única instância do bot
 */

const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_CONFIG } = require('./config');
const { processarMensagem } = require('./parser');
const { adicionarCopRedeInforma, adicionarAlerta } = require('./storage');

// ÚNICA instância do bot - compartilhada por todas as funções
let bot = null;
let isRunning = false;

let estatisticas = {
  mensagensRecebidas: 0,
  mensagensProcessadas: 0,
  erros: 0,
  iniciadoEm: null
};

/**
 * Obtém ou cria a instância do bot (SEM polling)
 */
function obterBot() {
  if (!bot) {
    bot = new TelegramBot(TELEGRAM_CONFIG.BOT_TOKEN, { polling: false });
  }
  return bot;
}

/**
 * Inicializa o bot do Telegram
 * @param {boolean} polling - Se deve usar polling (true) ou apenas API (false)
 */
async function inicializar(polling = true) {
  if (isRunning) {
    console.log('[Telegram] ⚠️ Bot já está rodando');
    return bot;
  }

  console.log('[Telegram] ====================================');
  console.log('[Telegram] 🤖 INICIALIZANDO BOT TELEGRAM');
  console.log('[Telegram] ====================================');
  console.log('[Telegram] Group ID:', TELEGRAM_CONFIG.GROUP_ID);

  try {
    // ETAPA 1: Criar instância única do bot (sem polling ainda)
    console.log('[Telegram] Etapa 1/4: Criando instância do bot...');
    bot = new TelegramBot(TELEGRAM_CONFIG.BOT_TOKEN, { polling: false });

    // ETAPA 2: Verificar conexão
    console.log('[Telegram] Etapa 2/4: Verificando conexão...');
    const me = await bot.getMe();
    console.log('[Telegram] ✅ Conectado como:', me.username);
    console.log('[Telegram] Bot ID:', me.id);

    // ETAPA 3: Limpar webhook e processar mensagens pendentes
    console.log('[Telegram] Etapa 3/4: Processando mensagens pendentes...');
    await bot.deleteWebHook({ drop_pending_updates: false });

    // Buscar e processar mensagens pendentes
    const updates = await bot.getUpdates({ offset: 0, limit: 100, timeout: 0 });
    console.log(`[Telegram] 📥 ${updates.length} updates pendentes encontrados`);

    let processadas = 0;
    let ultimoUpdateId = 0;

    for (const update of updates) {
      ultimoUpdateId = Math.max(ultimoUpdateId, update.update_id);

      if (!update.message || !update.message.text) continue;

      const msg = update.message;
      const chatId = String(msg.chat.id);
      const groupId = TELEGRAM_CONFIG.GROUP_ID;

      // Verificar se é do grupo correto
      if (chatId !== groupId &&
          chatId !== groupId.replace('-100', '-') &&
          `-100${chatId.replace('-', '')}` !== groupId) {
        continue;
      }

      const remetente = msg.from || {};
      const username = remetente.username || 'desconhecido';
      const isBot = remetente.is_bot === true;

      console.log(`[Telegram] 📥 Pendente de: ${username} ${isBot ? '(BOT)' : '(USER)'}`);

      const resultado = processarMensagem(msg);
      if (resultado) {
        if (resultado.tipo === 'COP_REDE_INFORMA') {
          await adicionarCopRedeInforma(resultado.dados);
          processadas++;
        } else if (resultado.tipo === 'NOVO_EVENTO') {
          await adicionarAlerta(resultado.dados);
          processadas++;
        }
      }
    }

    // Marcar como lidos
    if (ultimoUpdateId > 0) {
      await bot.getUpdates({ offset: ultimoUpdateId + 1, limit: 1, timeout: 0 });
    }

    if (processadas > 0) {
      console.log(`[Telegram] ✅ ${processadas} mensagens pendentes processadas!`);
    }

    // Aguardar antes de iniciar polling
    console.log('[Telegram] Aguardando 2s antes do polling...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ETAPA 4: Iniciar polling
    if (polling) {
      console.log('[Telegram] Etapa 4/4: Iniciando polling...');

      // Recriar bot COM polling habilitado
      bot = new TelegramBot(TELEGRAM_CONFIG.BOT_TOKEN, {
        polling: {
          interval: 3000,
          autoStart: false,
          params: {
            timeout: 30,
            allowed_updates: ['message']
          }
        }
      });

      // Configurar handlers
      configurarHandlers();

      // Iniciar polling
      await bot.startPolling();
      isRunning = true;
      estatisticas.iniciadoEm = new Date().toISOString();

      console.log('[Telegram] ====================================');
      console.log('[Telegram] ✅ POLLING INICIADO COM SUCESSO!');
      console.log('[Telegram] ✅ Bot está ATIVO e recebendo mensagens');
      console.log('[Telegram] ====================================');
    }

    return bot;

  } catch (error) {
    console.error('[Telegram] ❌ Erro ao inicializar:', error.message);
    throw error;
  }
}

/**
 * Configura os handlers de mensagens
 */
function configurarHandlers() {
  bot.on('message', async (msg) => {
    estatisticas.mensagensRecebidas++;

    try {
      const remetente = msg.from || {};
      const isBot = remetente.is_bot === true;
      const username = remetente.username || 'desconhecido';

      console.log('[Telegram] =====================================');
      console.log('[Telegram] 📨 NOVA MENSAGEM RECEBIDA');
      console.log('[Telegram] De:', username, isBot ? '(BOT)' : '(USER)');
      console.log('[Telegram] Chat ID:', msg.chat.id);

      // Verificar grupo correto
      const chatId = String(msg.chat.id);
      const groupId = TELEGRAM_CONFIG.GROUP_ID;

      if (chatId !== groupId &&
          chatId !== groupId.replace('-100', '-') &&
          `-100${chatId.replace('-', '')}` !== groupId) {
        console.log('[Telegram] ⚠️ Ignorando - outro chat');
        return;
      }

      if (!msg.text) {
        console.log('[Telegram] ⚠️ Ignorando - sem texto');
        return;
      }

      console.log('[Telegram] Texto:', msg.text.substring(0, 100));

      const resultado = processarMensagem(msg);

      if (!resultado) {
        console.log('[Telegram] ⚠️ Mensagem não reconhecida');
        console.log('[Telegram] Primeira linha:', msg.text.split('\n')[0]);
        return;
      }

      console.log('[Telegram] ✅ Tipo:', resultado.tipo);

      if (resultado.tipo === 'COP_REDE_INFORMA') {
        const sucesso = await adicionarCopRedeInforma(resultado.dados);
        if (sucesso) {
          estatisticas.mensagensProcessadas++;
          console.log('[Telegram] 💾 COP REDE INFORMA salvo!');
        }
      } else if (resultado.tipo === 'NOVO_EVENTO') {
        const sucesso = await adicionarAlerta(resultado.dados);
        if (sucesso) {
          estatisticas.mensagensProcessadas++;
          console.log('[Telegram] 💾 Alerta salvo!');
        }
      }

      console.log('[Telegram] =====================================');

    } catch (error) {
      estatisticas.erros++;
      console.error('[Telegram] ❌ Erro:', error.message);
    }
  });

  bot.on('polling_error', (error) => {
    estatisticas.erros++;
    console.error('[Telegram] ❌ Erro polling:', error.message);
  });

  bot.on('error', (error) => {
    estatisticas.erros++;
    console.error('[Telegram] ❌ Erro:', error.message);
  });
}

/**
 * Para o bot
 */
async function parar() {
  console.log('[Telegram] Parando bot...');
  try {
    if (bot && isRunning) {
      await bot.stopPolling();
    }
    isRunning = false;
    console.log('[Telegram] Bot parado');
  } catch (error) {
    console.error('[Telegram] Erro ao parar:', error.message);
    isRunning = false;
  }
}

/**
 * Busca mensagens recentes manualmente
 */
async function buscarMensagensRecentes(limite = 100) {
  console.log('[Telegram] Buscando mensagens recentes...');

  try {
    const b = obterBot();
    const updates = await b.getUpdates({ offset: 0, limit: limite, timeout: 0 });

    console.log('[Telegram] Updates:', updates.length);

    const mensagens = [];
    let ultimoId = 0;

    for (const update of updates) {
      ultimoId = Math.max(ultimoId, update.update_id);

      if (!update.message?.text) continue;

      const chatId = String(update.message.chat.id);
      const groupId = TELEGRAM_CONFIG.GROUP_ID;

      if (chatId === groupId ||
          chatId === groupId.replace('-100', '-') ||
          `-100${chatId.replace('-', '')}` === groupId) {

        const resultado = processarMensagem(update.message);
        if (resultado) {
          if (resultado.tipo === 'COP_REDE_INFORMA') {
            await adicionarCopRedeInforma(resultado.dados);
          } else if (resultado.tipo === 'NOVO_EVENTO') {
            await adicionarAlerta(resultado.dados);
          }
          mensagens.push(resultado);
        }
      }
    }

    if (ultimoId > 0) {
      await b.getUpdates({ offset: ultimoId + 1, limit: 1, timeout: 0 });
    }

    console.log('[Telegram] Processadas:', mensagens.length);
    return mensagens;

  } catch (error) {
    console.error('[Telegram] Erro:', error.message);
    throw error;
  }
}

/**
 * Estatísticas
 */
function obterEstatisticas() {
  return { ...estatisticas, isRunning };
}

/**
 * Testa conexão
 */
async function testarConexao() {
  try {
    const b = obterBot();
    const me = await b.getMe();
    console.log('[Telegram] Conexão OK:', me.username);
    return {
      sucesso: true,
      bot: { id: me.id, username: me.username, first_name: me.first_name }
    };
  } catch (error) {
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Diagnóstico
 */
async function diagnosticar() {
  try {
    const b = obterBot();
    const me = await b.getMe();

    let isAdmin = false;
    let adminError = null;

    try {
      const member = await b.getChatMember(TELEGRAM_CONFIG.GROUP_ID, me.id);
      isAdmin = ['administrator', 'creator'].includes(member.status);
    } catch (e) {
      adminError = e.message;
    }

    return {
      sucesso: true,
      bot: {
        id: me.id,
        username: me.username,
        first_name: me.first_name,
        can_join_groups: me.can_join_groups,
        can_read_all_group_messages: me.can_read_all_group_messages,
        supports_inline_queries: me.supports_inline_queries
      },
      grupo: {
        id: TELEGRAM_CONFIG.GROUP_ID,
        botIsAdmin: isAdmin,
        adminCheckError: adminError
      },
      recomendacoes: []
    };
  } catch (error) {
    return { sucesso: false, erro: error.message };
  }
}

/**
 * Envia mensagem de teste
 */
async function enviarMensagemTeste(texto = '🤖 Bot ativo!') {
  try {
    const b = obterBot();
    const resultado = await b.sendMessage(TELEGRAM_CONFIG.GROUP_ID, texto);
    return { sucesso: true, messageId: resultado.message_id };
  } catch (error) {
    return { sucesso: false, erro: error.message };
  }
}

module.exports = {
  inicializar,
  parar,
  buscarMensagensRecentes,
  obterEstatisticas,
  testarConexao,
  diagnosticar,
  enviarMensagemTeste
};
