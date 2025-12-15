/**
 * Servidor Express para API do COP REDE INFORMA
 * Expõe endpoints REST para o frontend do painel ADM
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { SERVER_CONFIG } = require('./config');
const telegram = require('./telegram');
const storage = require('./storage');

const app = express();

// Middlewares
app.use(cors({
  origin: SERVER_CONFIG.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// ============================================
// ROTAS DE STATUS E HEALTH
// ============================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    telegram: telegram.obterEstatisticas()
  });
});

// Alias para /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    telegram: telegram.obterEstatisticas()
  });
});

/**
 * Estatísticas gerais
 */
app.get('/api/estatisticas', async (req, res) => {
  try {
    const stats = await storage.obterEstatisticas();
    const telegramStats = telegram.obterEstatisticas();

    res.json({
      sucesso: true,
      dados: {
        ...stats,
        telegram: telegramStats
      }
    });
  } catch (error) {
    console.error('[API] Erro ao obter estatísticas:', error);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// ============================================
// ROTAS DO TELEGRAM
// ============================================

/**
 * Testar conexão com Telegram
 */
app.get('/api/telegram/status', async (req, res) => {
  try {
    const resultado = await telegram.testarConexao();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Iniciar polling do Telegram
 */
app.post('/api/telegram/iniciar', async (req, res) => {
  try {
    await telegram.inicializar(true);
    res.json({ sucesso: true, mensagem: 'Polling iniciado' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Parar polling do Telegram
 */
app.post('/api/telegram/parar', async (req, res) => {
  try {
    await telegram.parar();
    res.json({ sucesso: true, mensagem: 'Polling parado' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Forçar reinício do Telegram (reseta contadores e reinicia)
 */
app.post('/api/telegram/reiniciar', async (req, res) => {
  try {
    console.log('[API] Forçando reinício do Telegram...');

    // Parar se estiver rodando
    await telegram.parar();

    // Aguardar
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Reiniciar
    await telegram.inicializar(true);

    res.json({
      sucesso: true,
      mensagem: 'Telegram reiniciado',
      stats: telegram.obterEstatisticas()
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Sincronizar mensagens manualmente
 */
app.post('/api/telegram/sincronizar', async (req, res) => {
  try {
    const mensagens = await telegram.buscarMensagensRecentes(100);
    res.json({
      sucesso: true,
      mensagensProcessadas: mensagens.length,
      dados: mensagens
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Diagnóstico do bot - Verifica configurações e problemas de Privacy Mode
 */
app.get('/api/telegram/diagnostico', async (req, res) => {
  try {
    const resultado = await telegram.diagnosticar();
    res.json(resultado);
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// ============================================
// ROTAS COP REDE INFORMA
// ============================================

/**
 * Listar mensagens COP REDE INFORMA
 * Query params: dataInicio, dataFim, areaPainel, grupo, responsavel, tipo, refresh
 */
app.get('/api/cop-rede-informa', async (req, res) => {
  try {
    const filtros = {
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      areaPainel: req.query.areaPainel,
      grupo: req.query.grupo,
      responsavel: req.query.responsavel,
      tipo: req.query.tipo
    };

    // Remover filtros vazios
    Object.keys(filtros).forEach(key => {
      if (!filtros[key]) delete filtros[key];
    });

    // Forçar atualização do cache se refresh=true
    const forcarAtualizacao = req.query.refresh === 'true';

    const mensagens = await storage.obterCopRedeInforma(filtros, forcarAtualizacao);

    res.json({
      sucesso: true,
      total: mensagens.length,
      dados: mensagens,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] Erro ao listar COP REDE INFORMA:', error);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Obter uma mensagem COP REDE INFORMA por ID
 */
app.get('/api/cop-rede-informa/:id', async (req, res) => {
  try {
    const mensagens = await storage.obterCopRedeInforma({});
    const mensagem = mensagens.find(m => m.id === req.params.id);

    if (!mensagem) {
      return res.status(404).json({ sucesso: false, erro: 'Mensagem não encontrada' });
    }

    res.json({ sucesso: true, dados: mensagem });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Resumo por área (volume por área no período)
 */
app.get('/api/cop-rede-informa/resumo/areas', async (req, res) => {
  try {
    const filtros = {
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim
    };

    const mensagens = await storage.obterCopRedeInforma(filtros);

    // Agrupar por área
    const resumo = {};
    mensagens.forEach(m => {
      if (!resumo[m.areaPainel]) {
        resumo[m.areaPainel] = {
          area: m.areaPainel,
          quantidade: 0,
          volumeTotal: 0
        };
      }
      resumo[m.areaPainel].quantidade++;
      resumo[m.areaPainel].volumeTotal += m.volume || 1;
    });

    res.json({
      sucesso: true,
      dados: Object.values(resumo)
    });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// ============================================
// ROTAS DE ALERTAS
// ============================================

/**
 * Listar alertas
 * Query params: dataInicio, dataFim, areaPainel, statusAlerta, grupo
 */
app.get('/api/alertas', async (req, res) => {
  try {
    const filtros = {
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      areaPainel: req.query.areaPainel,
      statusAlerta: req.query.statusAlerta,
      grupo: req.query.grupo
    };

    // Remover filtros vazios
    Object.keys(filtros).forEach(key => {
      if (!filtros[key]) delete filtros[key];
    });

    const alertas = await storage.obterAlertas(filtros);

    res.json({
      sucesso: true,
      total: alertas.length,
      dados: alertas
    });
  } catch (error) {
    console.error('[API] Erro ao listar alertas:', error);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Obter um alerta por ID
 */
app.get('/api/alertas/:id', async (req, res) => {
  try {
    const alertas = await storage.obterAlertas({});
    const alerta = alertas.find(a => a.id === req.params.id);

    if (!alerta) {
      return res.status(404).json({ sucesso: false, erro: 'Alerta não encontrado' });
    }

    res.json({ sucesso: true, dados: alerta });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Atualizar status de um alerta
 */
app.put('/api/alertas/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['novo', 'em_analise', 'tratado'].includes(status)) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Status inválido. Use: novo, em_analise ou tratado'
      });
    }

    const sucesso = await storage.atualizarStatusAlerta(req.params.id, status);

    if (!sucesso) {
      return res.status(404).json({ sucesso: false, erro: 'Alerta não encontrado' });
    }

    res.json({ sucesso: true, mensagem: 'Status atualizado' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Excluir um alerta
 */
app.delete('/api/alertas/:id', async (req, res) => {
  try {
    const sucesso = await storage.excluirAlerta(req.params.id);

    if (!sucesso) {
      return res.status(404).json({ sucesso: false, erro: 'Alerta não encontrado' });
    }

    res.json({ sucesso: true, mensagem: 'Alerta excluído com sucesso' });
  } catch (error) {
    console.error('[API] Erro ao excluir alerta:', error);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Resumo de alertas por status
 */
app.get('/api/alertas/resumo/status', async (req, res) => {
  try {
    const alertas = await storage.obterAlertas({});

    const resumo = {
      novo: alertas.filter(a => a.statusAlerta === 'novo').length,
      em_analise: alertas.filter(a => a.statusAlerta === 'em_analise').length,
      tratado: alertas.filter(a => a.statusAlerta === 'tratado').length,
      total: alertas.length
    };

    res.json({ sucesso: true, dados: resumo });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// ============================================
// ROTA DE CONFIGURAÇÃO
// ============================================

/**
 * Configurar Bin ID do Telegram (para persistência)
 */
app.post('/api/config/bin-id', async (req, res) => {
  try {
    const { binId } = req.body;

    if (!binId) {
      return res.status(400).json({ sucesso: false, erro: 'binId é obrigatório' });
    }

    storage.setBinId(binId);

    res.json({ sucesso: true, mensagem: 'Bin ID configurado' });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

/**
 * Criar novo bin para armazenamento
 */
app.post('/api/config/criar-bin', async (req, res) => {
  try {
    const binId = await storage.criarBin();
    res.json({ sucesso: true, binId });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================

app.listen(SERVER_CONFIG.PORT, async () => {
  console.log('============================================');
  console.log('   COP REDE INFORMA - Backend');
  console.log('============================================');
  console.log(`Servidor rodando na porta ${SERVER_CONFIG.PORT}`);
  console.log(`CORS permitido: ${SERVER_CONFIG.CORS_ORIGIN}`);
  console.log('');

  // Iniciar bot do Telegram diretamente (sem testar antes para evitar conflito)
  console.log('Iniciando bot do Telegram...');
  try {
    await telegram.inicializar(true);
    console.log('✅ Bot Telegram ativo e recebendo mensagens');
  } catch (error) {
    console.error('❌ Erro ao iniciar bot:', error.message);
  }

  console.log('');
  console.log('Endpoints disponíveis:');
  console.log('  GET  /health');
  console.log('  GET  /api/estatisticas');
  console.log('  GET  /api/telegram/status');
  console.log('  GET  /api/telegram/diagnostico');
  console.log('  POST /api/telegram/iniciar');
  console.log('  POST /api/telegram/parar');
  console.log('  POST /api/telegram/reiniciar');
  console.log('  POST /api/telegram/sincronizar');
  console.log('  GET  /api/cop-rede-informa');
  console.log('  GET  /api/alertas');
  console.log('============================================');
});

module.exports = app;
