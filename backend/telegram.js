/**
 * Módulo de integração com Telegram Bot API
 * Conecta ao bot Copinforma_bot e processa mensagens do grupo
 */

const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_CONFIG } = require('./config');
const { processarMensagem } = require('./parser');
const { adicionarCopRedeInforma, adicionarAlerta } = require('./storage');

let bot = null;
let isRunning = false;
let ultimoUpdateProcessado = 0;
let estatisticas = {
  mensagensRecebidas: 0,
  mensagensProcessadas: 0,
  erros: 0,
  iniciadoEm: null
};

/**
 * Inicializa o bot do Telegram
 * @param {boolean} polling - Se deve usar polling (true) ou apenas API (false)
 * @returns {Promise<object>} Instância do bot
 */
async function inicializar(polling = true) {
  if (bot && isRunning) {
    console.log('[Telegram] Bot já está rodando');
    return bot;
  }

  console.log('[Telegram] Inicializando bot...');
  console.log('[Telegram] Group ID:', TELEGRAM_CONFIG.GROUP_ID);

  try {
    // Criar instância do bot
    bot = new TelegramBot(TELEGRAM_CONFIG.BOT_TOKEN, {
      polling: polling ? {
        interval: TELEGRAM_CONFIG.POLLING_INTERVAL,
        autoStart: false,
        params: {
          timeout: 10,
          allowed_updates: ['message']
        }
      } : false
    });

    // Verificar conexão
    const me = await bot.getMe();
    console.log('[Telegram] Conectado como:', me.username);

    // Configurar handlers
    if (polling) {
      configurarHandlers();
      await bot.startPolling();
      isRunning = true;
      estatisticas.iniciadoEm = new Date().toISOString();
      console.log('[Telegram] Polling iniciado');
    }

    return bot;

  } catch (error) {
    console.error('[Telegram] Erro ao inicializar bot:', error.message);
    throw error;
  }
}

/**
 * Configura os handlers de mensagens
 */
function configurarHandlers() {
  // Handler para todas as mensagens
  bot.on('message', async (msg) => {
    estatisticas.mensagensRecebidas++;

    try {
      // Verificar se é do grupo correto
      const chatId = String(msg.chat.id);
      const groupId = TELEGRAM_CONFIG.GROUP_ID;

      console.log('[Telegram] Mensagem recebida do chat:', chatId);

      // Aceitar tanto o ID com ou sem prefixo -100
      if (chatId !== groupId && chatId !== groupId.replace('-100', '-') && `-100${chatId.replace('-', '')}` !== groupId) {
        console.log('[Telegram] Ignorando mensagem de outro chat');
        return;
      }

      // Ignorar mensagens sem texto
      if (!msg.text) {
        console.log('[Telegram] Ignorando mensagem sem texto');
        return;
      }

      console.log('[Telegram] Processando mensagem:', msg.message_id);
      console.log('[Telegram] Texto (primeiros 100 chars):', msg.text.substring(0, 100));

      // Processar mensagem
      const resultado = processarMensagem(msg);

      if (!resultado) {
        console.log('[Telegram] Mensagem não é relevante (título não reconhecido)');
        return;
      }

      console.log('[Telegram] Tipo de mensagem:', resultado.tipo);

      // Salvar no storage
      if (resultado.tipo === 'COP_REDE_INFORMA') {
        const sucesso = await adicionarCopRedeInforma(resultado.dados);
        if (sucesso) {
          estatisticas.mensagensProcessadas++;
          console.log('[Telegram] COP REDE INFORMA salvo com sucesso');
        }
      } else if (resultado.tipo === 'NOVO_EVENTO') {
        const sucesso = await adicionarAlerta(resultado.dados);
        if (sucesso) {
          estatisticas.mensagensProcessadas++;
          console.log('[Telegram] Alerta salvo com sucesso');
        }
      }

    } catch (error) {
      estatisticas.erros++;
      console.error('[Telegram] Erro ao processar mensagem:', error);
    }
  });

  // Handler para erros de polling
  bot.on('polling_error', (error) => {
    estatisticas.erros++;
    console.error('[Telegram] Erro de polling:', error.message);
  });

  // Handler para erros gerais
  bot.on('error', (error) => {
    estatisticas.erros++;
    console.error('[Telegram] Erro geral:', error.message);
  });

  console.log('[Telegram] Handlers configurados');
}

/**
 * Para o bot
 */
async function parar() {
  if (!bot || !isRunning) {
    console.log('[Telegram] Bot não está rodando');
    return;
  }

  try {
    await bot.stopPolling();
    isRunning = false;
    console.log('[Telegram] Bot parado');
  } catch (error) {
    console.error('[Telegram] Erro ao parar bot:', error);
  }
}

/**
 * Busca mensagens recentes do grupo manualmente
 * Útil para sincronização inicial ou quando polling não está ativo
 * @param {number} limite - Número máximo de mensagens
 * @returns {Promise<array>} Lista de mensagens processadas
 */
async function buscarMensagensRecentes(limite = 100) {
  console.log('[Telegram] Buscando mensagens recentes...');

  try {
    if (!bot) {
      await inicializar(false);
    }

    // Telegram Bot API não permite buscar histórico diretamente
    // Precisamos usar getUpdates para pegar mensagens pendentes
    const updates = await bot.getUpdates({
      offset: ultimoUpdateProcessado + 1,
      limit: limite,
      timeout: 0,
      allowed_updates: ['message']
    });

    console.log('[Telegram] Updates recebidos:', updates.length);

    const mensagensProcessadas = [];

    for (const update of updates) {
      if (update.message) {
        // Atualizar offset
        ultimoUpdateProcessado = Math.max(ultimoUpdateProcessado, update.update_id);

        // Verificar se é do grupo correto
        const chatId = String(update.message.chat.id);
        const groupId = TELEGRAM_CONFIG.GROUP_ID;

        if (chatId === groupId || chatId === groupId.replace('-100', '-') || `-100${chatId.replace('-', '')}` === groupId) {
          const resultado = processarMensagem(update.message);

          if (resultado) {
            // Salvar no storage
            if (resultado.tipo === 'COP_REDE_INFORMA') {
              await adicionarCopRedeInforma(resultado.dados);
            } else if (resultado.tipo === 'NOVO_EVENTO') {
              await adicionarAlerta(resultado.dados);
            }

            mensagensProcessadas.push(resultado);
          }
        }
      }
    }

    console.log('[Telegram] Mensagens processadas:', mensagensProcessadas.length);
    return mensagensProcessadas;

  } catch (error) {
    console.error('[Telegram] Erro ao buscar mensagens:', error);
    throw error;
  }
}

/**
 * Obtém estatísticas do bot
 * @returns {object} Estatísticas
 */
function obterEstatisticas() {
  return {
    ...estatisticas,
    isRunning,
    ultimoUpdateProcessado
  };
}

/**
 * Testa a conexão com o Telegram
 * @returns {Promise<object>} Informações do bot
 */
async function testarConexao() {
  try {
    if (!bot) {
      bot = new TelegramBot(TELEGRAM_CONFIG.BOT_TOKEN, { polling: false });
    }

    const me = await bot.getMe();
    console.log('[Telegram] Conexão OK:', me.username);

    return {
      sucesso: true,
      bot: {
        id: me.id,
        username: me.username,
        first_name: me.first_name
      }
    };

  } catch (error) {
    console.error('[Telegram] Erro ao testar conexão:', error.message);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

/**
 * Envia uma mensagem de teste para o grupo
 * @param {string} texto - Texto da mensagem
 * @returns {Promise<object>} Resultado do envio
 */
async function enviarMensagemTeste(texto = '🤖 Bot COP REDE INFORMA está ativo!') {
  try {
    if (!bot) {
      bot = new TelegramBot(TELEGRAM_CONFIG.BOT_TOKEN, { polling: false });
    }

    const resultado = await bot.sendMessage(TELEGRAM_CONFIG.GROUP_ID, texto);
    console.log('[Telegram] Mensagem de teste enviada');

    return {
      sucesso: true,
      messageId: resultado.message_id
    };

  } catch (error) {
    console.error('[Telegram] Erro ao enviar mensagem:', error.message);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

module.exports = {
  inicializar,
  parar,
  buscarMensagensRecentes,
  obterEstatisticas,
  testarConexao,
  enviarMensagemTeste
};
