/**
 * Parser de mensagens do Telegram
 * Extrai campos estruturados das mensagens COP REDE INFORMA e Novos Alertas
 */

const {
  MESSAGE_TITLES,
  GRUPO_PARA_AREA,
  STATUS_PROCESSAMENTO
} = require('./config');

/**
 * Normaliza string removendo acentos e convertendo para lowercase
 * @param {string} str - String a ser normalizada
 * @returns {string} String normalizada
 */
function normalizar(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Identifica o tipo de mensagem pelo título (primeira linha)
 * @param {string} texto - Texto completo da mensagem
 * @returns {string|null} Tipo da mensagem ou null se não reconhecida
 */
function identificarTipoMensagem(texto) {
  if (!texto) return null;

  const primeiraLinha = texto.split('\n')[0].trim();

  if (primeiraLinha === MESSAGE_TITLES.COP_REDE_INFORMA) {
    return 'COP_REDE_INFORMA';
  }

  if (primeiraLinha === MESSAGE_TITLES.NOVO_EVENTO) {
    return 'NOVO_EVENTO';
  }

  return null;
}

/**
 * Extrai valor de um campo no formato "CHAVE: valor"
 * @param {string} texto - Texto completo da mensagem
 * @param {string} chave - Nome da chave a buscar
 * @returns {string|null} Valor encontrado ou null
 */
function extrairCampo(texto, chave) {
  if (!texto || !chave) return null;

  // Regex flexível para encontrar padrão "CHAVE: valor" ou "CHAVE : valor"
  // Aceita variações de espaço e é case-insensitive
  const regex = new RegExp(`^\\s*${chave}\\s*:\\s*(.+)$`, 'im');
  const match = texto.match(regex);

  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}

/**
 * Extrai data de uma string no formato dd/mm ou dd/mm/aaaa
 * @param {string} texto - Texto contendo a data
 * @returns {string|null} Data no formato dd/mm/aaaa ou null
 */
function extrairData(texto) {
  if (!texto) return null;

  // Padrão dd/mm/aaaa
  let match = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const dia = match[1].padStart(2, '0');
    const mes = match[2].padStart(2, '0');
    const ano = match[3];
    return `${dia}/${mes}/${ano}`;
  }

  // Padrão dd/mm (assume ano atual)
  match = texto.match(/(\d{1,2})\/(\d{1,2})/);
  if (match) {
    const dia = match[1].padStart(2, '0');
    const mes = match[2].padStart(2, '0');
    const ano = new Date().getFullYear();
    return `${dia}/${mes}/${ano}`;
  }

  return null;
}

/**
 * Extrai valor numérico (volume)
 * @param {string} texto - Texto contendo o número
 * @returns {number|null} Número extraído ou null
 */
function extrairVolume(texto) {
  if (!texto) return null;

  // Remove caracteres não numéricos exceto ponto e vírgula
  const limpo = texto.replace(/[^\d.,]/g, '').replace(',', '.');
  const numero = parseFloat(limpo);

  return isNaN(numero) ? null : numero;
}

/**
 * Mapeia o GRUPO da mensagem para a área do painel
 * @param {string} grupo - Nome do grupo da mensagem
 * @returns {object} { areaPainel, status }
 */
function mapearGrupoParaArea(grupo) {
  if (!grupo) {
    return {
      areaPainel: null,
      status: STATUS_PROCESSAMENTO.GRUPO_DESCONHECIDO
    };
  }

  const grupoNormalizado = normalizar(grupo);

  // Busca exata
  if (GRUPO_PARA_AREA[grupoNormalizado]) {
    return {
      areaPainel: GRUPO_PARA_AREA[grupoNormalizado],
      status: STATUS_PROCESSAMENTO.SUCESSO
    };
  }

  // Busca parcial (se o grupo contém alguma das chaves)
  for (const [chave, valor] of Object.entries(GRUPO_PARA_AREA)) {
    if (grupoNormalizado.includes(chave) || chave.includes(grupoNormalizado)) {
      return {
        areaPainel: valor,
        status: STATUS_PROCESSAMENTO.SUCESSO
      };
    }
  }

  // Não encontrado
  return {
    areaPainel: null,
    status: STATUS_PROCESSAMENTO.GRUPO_DESCONHECIDO
  };
}

/**
 * Faz parsing completo de uma mensagem COP REDE INFORMA
 * @param {string} texto - Texto completo da mensagem
 * @param {Date} dataMensagem - Data/hora da mensagem no Telegram
 * @param {number} messageId - ID da mensagem no Telegram
 * @returns {object} Objeto com campos extraídos
 */
function parseCopRedeInforma(texto, dataMensagem, messageId) {
  const tipo = extrairCampo(texto, 'TIPO');
  const grupo = extrairCampo(texto, 'GRUPO');
  const diaTexto = extrairCampo(texto, 'DIA') || extrairCampo(texto, 'DATA');
  const responsavel = extrairCampo(texto, 'RESPONSAVEL') || extrairCampo(texto, 'RESPONSÁVEL');
  const volumeTexto = extrairCampo(texto, 'VOLUME');

  const dia = extrairData(diaTexto) || formatarData(dataMensagem);
  const volume = extrairVolume(volumeTexto) || 1;
  const { areaPainel, status } = mapearGrupoParaArea(grupo);

  return {
    id: `cop_${messageId}_${Date.now()}`,
    messageId,
    dataMensagem: dataMensagem.toISOString(),
    dia,
    tipo: tipo || 'N/A',
    grupoOriginal: grupo || 'N/A',
    areaPainel: areaPainel || 'DESCONHECIDO',
    responsavel: responsavel || 'N/A',
    volume,
    textoCompleto: texto,
    origem: 'COP_REDE_INFORMA',
    status,
    processadoEm: new Date().toISOString()
  };
}

/**
 * Faz parsing completo de uma mensagem de Novo Evento/Alerta
 * @param {string} texto - Texto completo da mensagem
 * @param {Date} dataMensagem - Data/hora da mensagem no Telegram
 * @param {number} messageId - ID da mensagem no Telegram
 * @returns {object} Objeto com campos extraídos
 */
function parseNovoEvento(texto, dataMensagem, messageId) {
  const tipo = extrairCampo(texto, 'TIPO');
  const grupo = extrairCampo(texto, 'GRUPO');
  const diaTexto = extrairCampo(texto, 'DIA') || extrairCampo(texto, 'DATA');
  const responsavel = extrairCampo(texto, 'RESPONSAVEL') || extrairCampo(texto, 'RESPONSÁVEL');
  const detalhes = extrairCampo(texto, 'DETALHES') || extrairCampo(texto, 'DESCRICAO') || extrairCampo(texto, 'DESCRIÇÃO');
  const volumeTexto = extrairCampo(texto, 'VOLUME');

  const dia = extrairData(diaTexto) || formatarData(dataMensagem);
  const volume = extrairVolume(volumeTexto) || 1;
  const { areaPainel, status } = mapearGrupoParaArea(grupo);

  // Extrair título da primeira linha
  const titulo = texto.split('\n')[0].trim();

  return {
    id: `alerta_${messageId}_${Date.now()}`,
    messageId,
    dataMensagem: dataMensagem.toISOString(),
    dia,
    tipo: tipo || 'N/A',
    grupoOriginal: grupo || 'N/A',
    areaPainel: areaPainel || 'DESCONHECIDO',
    responsavel: responsavel || 'N/A',
    detalhes: detalhes || extrairDetalhesDoTexto(texto),
    volume,
    titulo,
    textoCompleto: texto,
    origem: 'NOVO_EVENTO_DETECTADO',
    statusAlerta: 'novo',
    status,
    processadoEm: new Date().toISOString()
  };
}

/**
 * Extrai detalhes do texto quando não há campo DETALHES explícito
 * @param {string} texto - Texto completo
 * @returns {string} Detalhes extraídos
 */
function extrairDetalhesDoTexto(texto) {
  if (!texto) return '';

  const linhas = texto.split('\n');
  // Remove primeira linha (título) e linhas que são campos conhecidos
  const camposConhecidos = ['TIPO:', 'GRUPO:', 'DIA:', 'DATA:', 'RESPONSAVEL:', 'RESPONSÁVEL:', 'VOLUME:', 'DETALHES:', 'DESCRICAO:', 'DESCRIÇÃO:'];

  const detalhes = linhas
    .slice(1) // Remove título
    .filter(linha => {
      const linhaUpper = linha.toUpperCase().trim();
      return !camposConhecidos.some(campo => linhaUpper.startsWith(campo));
    })
    .join('\n')
    .trim();

  return detalhes || 'Sem detalhes adicionais';
}

/**
 * Formata data para string dd/mm/aaaa
 * @param {Date} data - Objeto Date
 * @returns {string} Data formatada
 */
function formatarData(data) {
  if (!data) return null;
  const d = new Date(data);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Processa uma mensagem do Telegram e retorna dados estruturados
 * @param {object} message - Objeto de mensagem do Telegram
 * @returns {object|null} Dados processados ou null se mensagem não for relevante
 */
function processarMensagem(message) {
  if (!message || !message.text) {
    return null;
  }

  const texto = message.text;
  const tipoMensagem = identificarTipoMensagem(texto);

  if (!tipoMensagem) {
    return null; // Mensagem não é relevante
  }

  const dataMensagem = new Date(message.date * 1000); // Telegram usa timestamp Unix
  const messageId = message.message_id;

  try {
    if (tipoMensagem === 'COP_REDE_INFORMA') {
      return {
        tipo: 'COP_REDE_INFORMA',
        dados: parseCopRedeInforma(texto, dataMensagem, messageId)
      };
    }

    if (tipoMensagem === 'NOVO_EVENTO') {
      return {
        tipo: 'NOVO_EVENTO',
        dados: parseNovoEvento(texto, dataMensagem, messageId)
      };
    }
  } catch (error) {
    console.error('[Parser] Erro ao processar mensagem:', error);
    return {
      tipo: tipoMensagem,
      dados: {
        id: `erro_${messageId}_${Date.now()}`,
        messageId,
        dataMensagem: dataMensagem.toISOString(),
        textoCompleto: texto,
        status: STATUS_PROCESSAMENTO.ERRO_PARSING,
        erro: error.message,
        processadoEm: new Date().toISOString()
      }
    };
  }

  return null;
}

module.exports = {
  normalizar,
  identificarTipoMensagem,
  extrairCampo,
  extrairData,
  extrairVolume,
  mapearGrupoParaArea,
  parseCopRedeInforma,
  parseNovoEvento,
  processarMensagem,
  formatarData
};
