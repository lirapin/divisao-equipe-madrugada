/**
 * CONFIGURAÇÕES DO SISTEMA - ESCALA EQUIPE MADRUGADA
 *
 * Este arquivo contém as configurações principais do sistema.
 * Para atualizar o BIN_ID, edite apenas este arquivo e faça commit.
 */

const CONFIG = {
  // ============================================
  // JSONBIN.IO - ARMAZENAMENTO NA NUVEM
  // ============================================

  /**
   * BIN_ID - Identificador do bin onde os dados são armazenados
   *
   * INSTRUÇÕES:
   * 1. Se este valor for null, o admin criará um novo bin automaticamente
   * 2. Após criar, o sistema exibirá o novo ID
   * 3. Atualize este valor e faça commit para que todos acessem
   *
   * Exemplo: BIN_ID: "67acf6e1ad19ca34f89c1234"
   */
  BIN_ID: "693a8a43ae596e708f923822",

  /**
   * Credenciais JSONBin.io
   * ATENÇÃO: Estas chaves são públicas no código. Use apenas para dados não-sensíveis.
   */
  JSONBIN: {
    API_URL: 'https://api.jsonbin.io/v3/b',
    MASTER_KEY: '$2a$10$dQyAV006kSDh2CvPh8cBCu2yspqnkCb4Dpm.A7wby6q.tZAKQHNce',
    ACCESS_KEY: '$2a$10$oo.QiJ4MvOeVCqfzC19p7OcJgzUVEU7eWINJO1EZefPScNpfBIRKC'
  },

  // ============================================
  // AUTENTICAÇÃO
  // ============================================

  /**
   * PIN de administrador
   * Usado para acessar funcionalidades de upload e gerenciamento
   */
  ADMIN_PIN: 'home.2025',

  /**
   * Duração da sessão em horas
   */
  SESSION_DURATION_HOURS: 24,

  // ============================================
  // REGRAS DE PRIORIDADE
  // ============================================

  PRIORIDADES: {
    3: {
      'CO/NO/NE': ['CRISTIANE HERMOGENES DA SILVA', 'MARISTELLA MARCIA DOS SANTOS', 'RAISSA LIMA DE OLIVEIRA'],
      'BA/MG/ES': ['LEONARDO FERREIRA LIMA DE ALMEIDA', 'RAISSA LIMA DE OLIVEIRA', 'MARISTELLA MARCIA DOS SANTOS'],
      'RIO': ['THIAGO PEREIRA DA SILVA', 'ALAN MARINHO DIAS', 'MARISTELLA MARCIA DOS SANTOS', 'RAISSA LIMA DE OLIVEIRA']
    },
    4: {
      'CO/NO': ['CRISTIANE HERMOGENES DA SILVA', 'MARISTELLA MARCIA DOS SANTOS', 'RAISSA LIMA DE OLIVEIRA', 'THIAGO PEREIRA DA SILVA', 'ALAN MARINHO DIAS', 'LEONARDO FERREIRA LIMA DE ALMEIDA'],
      'NE/BA': ['RAISSA LIMA DE OLIVEIRA', 'MARISTELLA MARCIA DOS SANTOS', 'CRISTIANE HERMOGENES DA SILVA', 'THIAGO PEREIRA DA SILVA', 'LEONARDO FERREIRA LIMA DE ALMEIDA', 'ALAN MARINHO DIAS'],
      'MG/ES': ['LEONARDO FERREIRA LIMA DE ALMEIDA', 'RAISSA LIMA DE OLIVEIRA', 'ALAN MARINHO DIAS', 'CRISTIANE HERMOGENES DA SILVA', 'MARISTELLA MARCIA DOS SANTOS', 'THIAGO PEREIRA DA SILVA'],
      'RIO': ['ALAN MARINHO DIAS', 'THIAGO PEREIRA DA SILVA', 'MARISTELLA MARCIA DOS SANTOS', 'RAISSA LIMA DE OLIVEIRA', 'LEONARDO FERREIRA LIMA DE ALMEIDA', 'CRISTIANE HERMOGENES DA SILVA']
    },
    5: {
      'CO/NO': ['CRISTIANE HERMOGENES DA SILVA', 'MARISTELLA MARCIA DOS SANTOS'],
      'NE/BA': ['RAISSA LIMA DE OLIVEIRA', 'MARISTELLA MARCIA DOS SANTOS'],
      'MG': ['LEONARDO FERREIRA LIMA DE ALMEIDA', 'RAISSA LIMA DE OLIVEIRA'],
      'RIO A': ['ALAN MARINHO DIAS', 'MARISTELLA MARCIA DOS SANTOS'],
      'RIO B': ['THIAGO PEREIRA DA SILVA', 'MARISTELLA MARCIA DOS SANTOS']
    }
  },

  // ============================================
  // CONSTANTES DO SISTEMA
  // ============================================

  DIAS_SEMANA: ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'],

  MESES: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ],

  // ============================================
  // CHAVES DE LOCALSTORAGE
  // ============================================

  STORAGE_KEYS: {
    BIN_ID: 'escala_bin_id',
    AUTH: 'escala_auth',
    AUTH_EXPIRY: 'escala_auth_expiry',
    BACKUP: 'escala_backup',
    LAST_SAVE: 'escala_ultimo_salvamento'
  }
};

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
