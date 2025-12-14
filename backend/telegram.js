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
    console.log('[Telegram] ⚠️ Bot já está rodando');
    return bot;
  }

  console.log('[Telegram] ====================================');
  console.log('[Telegram] 🤖 INICIALIZANDO BOT TELEGRAM');
  console.log('[Telegram] ====================================');
  console.log('[Telegram] Group ID:', TELEGRAM_CONFIG.GROUP_ID);
  console.log('[Telegram] Polling interval:', TELEGRAM_CONFIG.POLLING_INTERVAL, 'ms');

  try {
    // ETAPA 1: Limpar conexões anteriores AGRESSIVAMENTE
    console.log('[Telegram] Etapa 1/4: Limpando conexões anteriores...');
    await limparConexoesAnteriores();

    // Aguardar mais tempo para garantir que tudo foi limpo
    console.log('[Telegram] Aguardando 3s para garantir limpeza completa...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ETAPA 2: Criar instância do bot
    console.log('[Telegram] Etapa 2/4: Criando instância do bot...');
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

    // ETAPA 3: Verificar conexão
    console.log('[Telegram] Etapa 3/4: Verificando conexão com Telegram...');
    const me = await bot.getMe();
    console.log('[Telegram] ✅ Conectado como:', me.username);
    console.log('[Telegram] Bot ID:', me.id);

    // ETAPA 4: Configurar handlers e iniciar polling
    if (polling) {
      console.log('[Telegram] Etapa 4/4: Configurando handlers...');
      configurarHandlers();

      // Tentar iniciar polling com retry AGRESSIVO
      let tentativas = 0;
      const maxTentativas = 5; // Aumentado de 3 para 5

      console.log('[Telegram] Iniciando polling com retry (máx. 5 tentativas)...');

      while (tentativas < maxTentativas) {
        try {
          tentativas++;
          console.log(`[Telegram] 🔄 Tentativa ${tentativas}/${maxTentativas} de iniciar polling...`);

          await bot.startPolling();
          isRunning = true;
          estatisticas.iniciadoEm = new Date().toISOString();

          // Resetar contadores de recuperação ao iniciar com sucesso
          tentativasRecuperacao = 0;
          ultimaTentativaRecuperacao = 0;

          console.log('[Telegram] ====================================');
          console.log('[Telegram] ✅ POLLING INICIADO COM SUCESSO!');
          console.log('[Telegram] ✅ Bot está ATIVO e recebendo mensagens');
          console.log('[Telegram] ====================================');
          break;
        } catch (pollingError) {
          console.error(`[Telegram] ❌ Tentativa ${tentativas}/${maxTentativas} falhou:`, pollingError.message);

          if (pollingError.message && pollingError.message.includes('409')) {
            console.log('[Telegram] ⚠️ ERRO 409: Outra instância detectada!');
            console.log('[Telegram] Aguardando 10s para a outra instância liberar...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          }

          if (tentativas < maxTentativas) {
            // Esperar tempo progressivo antes de tentar novamente
            const espera = tentativas * 5000; // 5s, 10s, 15s, 20s
            console.log(`[Telegram] Aguardando ${espera/1000}s antes de tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, espera));

            // Limpar novamente AGRESSIVAMENTE
            console.log('[Telegram] Limpando conexões novamente...');
            await limparConexoesAnteriores();
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            console.log('[Telegram] ====================================');
            console.error('[Telegram] ❌ TODAS AS TENTATIVAS FALHARAM!');
            console.log('[Telegram] ⚠️ POLLING NÃO INICIADO');
            console.log('[Telegram] 🔧 Verifique se há outra instância rodando:');
            console.log('[Telegram]    - Servidor local');
            console.log('[Telegram]    - Múltiplas instâncias no Render');
            console.log('[Telegram]    - Deploy duplicado');
            console.log('[Telegram] 🔧 Use POST /api/telegram/reiniciar para tentar novamente');
            console.log('[Telegram] ====================================');
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
      // === DEBUG: Log detalhado do remetente ===
      const remetente = msg.from || {};
      const isBot = remetente.is_bot === true;
      const username = remetente.username || 'desconhecido';
      const userId = remetente.id || 'N/A';

      console.log('[Telegram] =====================================');
      console.log('[Telegram] 📨 NOVA MENSAGEM RECEBIDA');
      console.log('[Telegram] De:', username, `(ID: ${userId})`);
      console.log('[Telegram] É bot?:', isBot ? '🤖 SIM' : '👤 NÃO');
      console.log('[Telegram] Chat ID:', msg.chat.id);
      console.log('[Telegram] Message ID:', msg.message_id);

      // Log especial para mensagens de bots
      if (isBot) {
        console.log('[Telegram] ✅ MENSAGEM DE BOT DETECTADA - Processando normalmente');
        console.log('[Telegram] Bot username:', username);
      }
      // === FIM DEBUG ===

      // Verificar se é do grupo correto
      const chatId = String(msg.chat.id);
      const groupId = TELEGRAM_CONFIG.GROUP_ID;

      // Aceitar tanto o ID com ou sem prefixo -100
      if (chatId !== groupId && chatId !== groupId.replace('-100', '-') && `-100${chatId.replace('-', '')}` !== groupId) {
        console.log('[Telegram] ⚠️ Ignorando mensagem de outro chat');
        return;
      }

      // Ignorar mensagens sem texto
      if (!msg.text) {
        console.log('[Telegram] ⚠️ Ignorando mensagem sem texto (pode ser foto, sticker, etc)');
        return;
      }

      console.log('[Telegram] Texto (primeiros 150 chars):', msg.text.substring(0, 150));

      // Processar mensagem
      const resultado = processarMensagem(msg);

      if (!resultado) {
        console.log('[Telegram] ⚠️ MENSAGEM NÃO RECONHECIDA - Título não corresponde aos padrões esperados');
        console.log('[Telegram] Remetente:', username, isBot ? '(BOT)' : '(USUÁRIO)');
        console.log('[Telegram] Primeira linha:', msg.text.split('\n')[0]);
        console.log('[Telegram] Primeira linha (hex):', Buffer.from(msg.text.split('\n')[0]).toString('hex'));
        console.log('[Telegram] Padrões esperados:');
        console.log('  - "COP REDE INFORMA" (ou que contenha essa frase)');
        console.log('  - "🚨 Novo Evento Detectado!" (ou "Novo Evento Detectado" ou que contenha 🚨)');
        console.log('[Telegram] =====================================');
        return;
      }

      console.log('[Telegram] ✅ Tipo de mensagem identificado:', resultado.tipo);
      console.log('[Telegram] Remetente:', username, isBot ? '(BOT)' : '(USUÁRIO)');

      // Salvar no storage
      if (resultado.tipo === 'COP_REDE_INFORMA') {
        const sucesso = await adicionarCopRedeInforma(resultado.dados);
        if (sucesso) {
          estatisticas.mensagensProcessadas++;
          console.log('[Telegram] 💾 COP REDE INFORMA salvo com sucesso');
          console.log('[Telegram] =====================================');
        }
      } else if (resultado.tipo === 'NOVO_EVENTO') {
        const sucesso = await adicionarAlerta(resultado.dados);
        if (sucesso) {
          estatisticas.mensagensProcessadas++;
          console.log('[Telegram] 💾 Alerta NOVO_EVENTO salvo com sucesso');
          console.log('[Telegram] =====================================');
        }
      }

    } catch (error) {
      estatisticas.erros++;
      console.error('[Telegram] ❌ Erro ao processar mensagem:', error);
      console.log('[Telegram] =====================================');
    }
  });

  // Handler para erros de polling
  bot.on('polling_error', async (error) => {
    estatisticas.erros++;
    console.error('[Telegram] ❌ ERRO DE POLLING:', error.message);

    // Se for erro 409 Conflict, tentar recuperar COM CONTROLE AGRESSIVO
    if (error.message && error.message.includes('409')) {
      console.log('[Telegram] ⚠️ ERRO 409 CONFLICT DETECTADO!');
      console.log('[Telegram] Isso significa que há OUTRA instância do bot rodando!');
      console.log('[Telegram] Possíveis causas:');
      console.log('[Telegram]   1. Servidor local rodando ao mesmo tempo');
      console.log('[Telegram]   2. Múltiplas instâncias no Render');
      console.log('[Telegram]   3. Deploy duplicado com mesmo BOT_TOKEN');

      const agora = Date.now();

      // Verificar cooldown
      if (agora - ultimaTentativaRecuperacao < COOLDOWN_RECUPERACAO) {
        console.log('[Telegram] 💤 Ainda em cooldown. Aguardando...');
        return;
      }

      // Verificar limite de tentativas
      if (tentativasRecuperacao >= MAX_TENTATIVAS_RECUPERACAO) {
        console.log('[Telegram] 🛑 LIMITE DE TENTATIVAS ATINGIDO!');
        console.log('[Telegram] ⚠️ BOT PARADO - É NECESSÁRIO REINÍCIO MANUAL');
        console.log('[Telegram] 🔧 Use a rota POST /api/telegram/reiniciar para reiniciar');
        console.log('[Telegram] 🔧 Ou reinicie o serviço no Render');
        try {
          await bot.stopPolling();
          isRunning = false;
        } catch (e) {}
        return;
      }

      tentativasRecuperacao++;
      ultimaTentativaRecuperacao = agora;

      console.log(`[Telegram] 🔄 Tentativa de recuperação ${tentativasRecuperacao}/${MAX_TENTATIVAS_RECUPERACAO}...`);

      try {
        // Parar polling atual IMEDIATAMENTE
        console.log('[Telegram] 1/5 Parando polling...');
        await bot.stopPolling();
        isRunning = false;

        // Aguardar tempo MUITO maior para garantir que a outra instância libere
        const tempoEspera = 20000 + (tentativasRecuperacao * 15000); // 20s, 35s, 50s
        console.log(`[Telegram] 2/5 Aguardando ${tempoEspera/1000}s para outras instâncias liberarem...`);
        await new Promise(resolve => setTimeout(resolve, tempoEspera));

        // Limpar webhooks e conexões
        console.log('[Telegram] 3/5 Limpando webhooks e conexões antigas...');
        await limparConexoesAnteriores();
        await new Promise(resolve => setTimeout(resolve, 5000)); // Espera adicional

        // Tentar reiniciar
        console.log('[Telegram] 4/5 Reiniciando polling...');
        await bot.startPolling();

        // Aguardar estabilização
        await new Promise(resolve => setTimeout(resolve, 2000));

        isRunning = true;
        tentativasRecuperacao = 0; // Reset se sucesso
        console.log('[Telegram] 5/5 ✅ POLLING REINICIADO COM SUCESSO!');
        console.log('[Telegram] ✅ Bot voltou a funcionar normalmente');

      } catch (recoverError) {
        console.error('[Telegram] ❌ FALHA NA RECUPERAÇÃO:', recoverError.message);
        console.log('[Telegram] ⚠️ Será necessário reinício manual via /api/telegram/reiniciar');
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
 * Verifica informações de diagnóstico do bot
 * Útil para identificar problemas de Privacy Mode
 * @returns {Promise<object>} Informações de diagnóstico
 */
async function diagnosticar() {
  try {
    if (!bot) {
      bot = new TelegramBot(TELEGRAM_CONFIG.BOT_TOKEN, { polling: false });
    }

    const me = await bot.getMe();
    console.log('[Telegram] 🔍 DIAGNÓSTICO DO BOT');
    console.log('[Telegram] Bot:', me.username);
    console.log('[Telegram] Bot ID:', me.id);

    // Tentar verificar se é admin do grupo
    let isAdmin = false;
    let adminError = null;

    try {
      const chatMember = await bot.getChatMember(TELEGRAM_CONFIG.GROUP_ID, me.id);
      isAdmin = ['administrator', 'creator'].includes(chatMember.status);
      console.log('[Telegram] Status no grupo:', chatMember.status);
      console.log('[Telegram] É admin?:', isAdmin ? '✅ SIM' : '❌ NÃO');

      if (!isAdmin) {
        console.log('[Telegram] ⚠️ ATENÇÃO: Bot NÃO é admin do grupo!');
        console.log('[Telegram] ⚠️ Isso pode impedir de ver mensagens de outros bots.');
        console.log('[Telegram] ⚠️ Soluções:');
        console.log('[Telegram]    1. Tornar o bot admin do grupo');
        console.log('[Telegram]    2. Desabilitar Privacy Mode no BotFather');
      }
    } catch (e) {
      adminError = e.message;
      console.log('[Telegram] ⚠️ Não foi possível verificar status de admin:', e.message);
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
      recomendacoes: isAdmin ? [] : [
        'Tornar o bot administrador do grupo para ver mensagens de outros bots',
        'Ou desabilitar Privacy Mode via /setprivacy no BotFather'
      ]
    };

  } catch (error) {
    console.error('[Telegram] Erro no diagnóstico:', error.message);
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
  diagnosticar,
  enviarMensagemTeste
};
