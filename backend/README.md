# COP REDE INFORMA - Backend

Backend Node.js para integração com Telegram Bot API.

## Requisitos

- Node.js 16+
- NPM ou Yarn

## Instalação

```bash
cd backend
npm install
```

## Configuração

1. Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

2. Configure as variáveis (os valores padrão já estão no arquivo):
   - `TELEGRAM_BOT_TOKEN` - Token do bot Copinforma_bot
   - `TELEGRAM_GROUP_ID` - ID do grupo do Telegram
   - `TELEGRAM_BIN_ID` - Será criado automaticamente na primeira execução

## Execução

### Desenvolvimento

```bash
npm run dev
```

### Produção

```bash
npm start
```

## Hospedagem

### Railway

1. Crie conta em [railway.app](https://railway.app)
2. Conecte seu repositório GitHub
3. Configure as variáveis de ambiente
4. Deploy automático!

### Heroku

```bash
heroku create cop-rede-informa
heroku config:set TELEGRAM_BOT_TOKEN=...
git push heroku main
```

### Render

1. Crie conta em [render.com](https://render.com)
2. New > Web Service
3. Conecte o repositório
4. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/api/estatisticas` | Estatísticas gerais |
| GET | `/api/telegram/status` | Status da conexão Telegram |
| POST | `/api/telegram/iniciar` | Iniciar polling |
| POST | `/api/telegram/parar` | Parar polling |
| POST | `/api/telegram/sincronizar` | Sincronizar mensagens |
| GET | `/api/cop-rede-informa` | Listar mensagens COP |
| GET | `/api/cop-rede-informa/:id` | Detalhe de mensagem |
| GET | `/api/cop-rede-informa/resumo/areas` | Resumo por área |
| GET | `/api/alertas` | Listar alertas |
| GET | `/api/alertas/:id` | Detalhe do alerta |
| PUT | `/api/alertas/:id/status` | Atualizar status |
| GET | `/api/alertas/resumo/status` | Resumo por status |

## Filtros

### COP REDE INFORMA

```
GET /api/cop-rede-informa?dataInicio=2024-12-01&dataFim=2024-12-31&areaPainel=MG
```

### Alertas

```
GET /api/alertas?statusAlerta=novo&areaPainel=CO/NO
```

## Testes

```bash
npm test
```
