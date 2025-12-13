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
let tentativasRecuperacao = 0;
let ultimaTentativaRecuperacao = 0;
const MAX_TENTATIVAS_RECUPERACAO = 3;
const COOLDOWN_RECUPERACAO = 60000; // 1 minuto entre tentativas

let estatisticas = {
  mensagensRecebidas: 0,
  mensagensProcessadas: 0,
  erros: 0,
  iniciadoEm: null
};

/**
 * Limpa webhooks e conexões anteriores do bot
 * Isso resolve o erro 409 Conflict
 */
async function limparConexoesAnteriores() {
  console.log('[Telegram] Limpando conexões anteriores...');

  try {
    const tempBot = new TelegramBot(TELEGRAM_CONFIG.BOT_TOKEN, { polling: false });

    // Remove webhook se houver
    await tempBot.deleteWebHook({ drop_pending_updates: true });
    console.log('[Telegram] Webhook removido e updates pendentes descartados');

    // Aguardar um momento para o Telegram liberar
    await new Promise(resolve => setTimeout(resolve, 1000));

    return true;
  } catch (error) {
    console.error('[Telegram] Erro ao limpar conexões:', error.message);
    return false;
  }
}

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
    // Limpar conexões anteriores antes de iniciar
    await limparConexoesAnteriores();

    // Criar instância do bot
    bot = new TelegramBot(TELEGRAM_CONFIG.BOT_TOKEN, {
      polling: polling ? {
        interval: TELEGRAM_CONFIG.POLLING_INTERVAL || 3000,
        autoStart: false,
        params: {
          timeout: 30,
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

      // Tentar iniciar polling com retry
      let tentativas = 0;
      const maxTentativas = 3;

      while (tentativas < maxTentativas) {
        try {
          await bot.startPolling();
          isRunning = true;
          estatisticas.iniciadoEm = new Date().toISOString();
          console.log('[Telegram] Polling iniciado com sucesso!');
          break;
        } catch (pollingError) {
          tentativas++;
          console.error(`[Telegram] Tentativa ${tentativas}/${maxTentativas} falhou:`, pollingError.message);

          if (tentativas < maxTentativas) {
            // Esperar antes de tentar novamente
            const espera = tentativas * 2000;
            console.log(`[Telegram] Aguardando ${espera}ms antes de tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, espera));

            // Limpar novamente
            await limparConexoesAnteriores();
          } else {
            console.error('[Telegram] Todas as tentativas falharam. Polling não iniciado.');
            isRunning = false;
          }
        }
      }
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
        console.log('[Telegram] ⚠️ MENSAGEM NÃO RECONHECIDA - Título não corresponde aos padrões esperados');
        console.log('[Telegram] Primeira linha:', msg.text.split('\n')[0]);
        console.log('[Telegram] Texto completo:\n', msg.text);
        console.log('[Telegram] Padrões esperados:');
        console.log('  - "COP REDE INFORMA" (ou que contenha essa frase)');
        console.log('  - "🚨 Novo Evento Detectado!" (ou "Novo Evento Detectado" ou que contenha 🚨)');
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
  bot.on('polling_error', async (error) => {
    estatisticas.erros++;
    console.error('[Telegram] Erro de polling:', error.message);

    // Se for erro 409 Conflict, tentar recuperar COM CONTROLE
    if (error.message && error.message.includes('409')) {
      const agora = Date.now();

      // Verificar cooldown
      if (agora - ultimaTentativaRecuperacao < COOLDOWN_RECUPERACAO) {
        console.log('[Telegram] 409 detectado, mas ainda em cooldown. Aguardando...');
        return;
      }

      // Verificar limite de tentativas
      if (tentativasRecuperacao >= MAX_TENTATIVAS_RECUPERACAO) {
        console.log('[Telegram] Limite de tentativas de recuperação atingido. Parando polling.');
        console.log('[Telegram] IMPORTANTE: Reinicie o serviço manualmente no Render.');
        try {
          await bot.stopPolling();
          isRunning = false;
        } catch (e) {}
        return;
      }

      tentativasRecuperacao++;
      ultimaTentativaRecuperacao = agora;

      console.log(`[Telegram] Tentativa de recuperação ${tentativasRecuperacao}/${MAX_TENTATIVAS_RECUPERACAO}...`);

      try {
        // Parar polling atual
        await bot.stopPolling();
        isRunning = false;

        // Aguardar tempo maior (10-30 segundos baseado na tentativa)
        const tempoEspera = 10000 + (tentativasRecuperacao * 10000);
        console.log(`[Telegram] Aguardando ${tempoEspera/1000}s antes de recuperar...`);
        await new Promise(resolve => setTimeout(resolve, tempoEspera));

        // Limpar conexões
        await limparConexoesAnteriores();
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Reiniciar polling
        await bot.startPolling();
        isRunning = true;
        tentativasRecuperacao = 0; // Reset se sucesso
        console.log('[Telegram] Polling reiniciado com sucesso!');

      } catch (recoverError) {
        console.error('[Telegram] Falha na recuperação:', recoverError.message);
      }
    }
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
  console.log('[Telegram] Parando bot...');

  try {
    if (bot && isRunning) {
      await bot.stopPolling();
    }
    isRunning = false;

    // Resetar contadores de recuperação
    tentativasRecuperacao = 0;
    ultimaTentativaRecuperacao = 0;

    // Limpar conexões
    await limparConexoesAnteriores();

    console.log('[Telegram] Bot parado e contadores resetados');
  } catch (error) {
    console.error('[Telegram] Erro ao parar bot:', error);
    isRunning = false;
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
