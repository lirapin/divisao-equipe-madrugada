/**
 * Configurações do sistema COP REDE INFORMA
 * Centralize aqui todas as constantes e mapeamentos
 */

require('dotenv').config();

// Configurações do Telegram
const TELEGRAM_CONFIG = {
  BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '8450919829:AAFbu6mgwWSj_SCSryS0e-6FHRGQvkHrVRM',
  GROUP_ID: process.env.TELEGRAM_GROUP_ID || '-1003217044000', // Grupos têm ID negativo
  POLLING_INTERVAL: parseInt(process.env.POLLING_INTERVAL) || 5000
};

// Configurações do JSONBin.io (mesmas do projeto principal)
const JSONBIN_CONFIG = {
  API_URL: 'https://api.jsonbin.io/v3/b',
  MASTER_KEY: process.env.JSONBIN_MASTER_KEY || '$2a$10$dQyAV006kSDh2CvPh8cBCu2yspqnkCb4Dpm.A7wby6q.tZAKQHNce',
  ACCESS_KEY: process.env.JSONBIN_ACCESS_KEY || '$2a$10$oo.QiJ4MvOeVCqfzC19p7OcJgzUVEU7eWINJO1EZefPScNpfBIRKC',
  // Bin específico para mensagens do Telegram (será criado automaticamente se não existir)
  TELEGRAM_BIN_ID: process.env.TELEGRAM_BIN_ID || null
};

// Títulos de mensagens que serão processadas
const MESSAGE_TITLES = {
  COP_REDE_INFORMA: 'COP REDE INFORMA',
  NOVO_EVENTO: '🚨 Novo Evento Detectado!',
  NOVO_EVENTO_ALT: 'Novo Evento Detectado'
};

// Mapeamento de GRUPO do Telegram para Área do Painel
// Chaves normalizadas (lowercase, sem acentos)
const GRUPO_PARA_AREA = {
  'rio / espirito santo': 'RIO A / RIO B',
  'rio/espirito santo': 'RIO A / RIO B',
  'rio / espírito santo': 'RIO A / RIO B',
  'rio/espírito santo': 'RIO A / RIO B',
  'bahia / sergipe': 'NE/BA',
  'bahia/sergipe': 'NE/BA',
  'centro oeste': 'CO/NO',
  'centro-oeste': 'CO/NO',
  'centrooeste': 'CO/NO',
  'norte': 'CO/NO',
  'minas gerais': 'MG',
  'minas': 'MG',
  'mg': 'MG',
  'nordeste': 'CO/NO',
  'ne': 'CO/NO'
};

// Campos esperados nas mensagens
const CAMPOS_MENSAGEM = {
  COP_REDE_INFORMA: ['TIPO', 'GRUPO', 'DIA', 'RESPONSAVEL', 'VOLUME'],
  NOVO_EVENTO: ['GRUPO', 'DIA', 'RESPONSAVEL', 'DETALHES', 'VOLUME']
};

// Status possíveis para alertas
const STATUS_ALERTA = {
  NOVO: 'novo',
  EM_ANALISE: 'em_analise',
  TRATADO: 'tratado'
};

// Status de processamento
const STATUS_PROCESSAMENTO = {
  SUCESSO: 'sucesso',
  GRUPO_DESCONHECIDO: 'grupo_desconhecido',
  ERRO_PARSING: 'erro_parsing'
};

// Configurações do servidor
const SERVER_CONFIG = {
  PORT: process.env.PORT || 3001,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
};

module.exports = {
  TELEGRAM_CONFIG,
  JSONBIN_CONFIG,
  MESSAGE_TITLES,
  GRUPO_PARA_AREA,
  CAMPOS_MENSAGEM,
  STATUS_ALERTA,
  STATUS_PROCESSAMENTO,
  SERVER_CONFIG
};
