# ETHV Backend — Discord Bot + API Server

Servidor independiente que corre el bot de Discord de ETHV y expone endpoints de análisis de talento Web3. Funciona separado del frontend principal.

## Stack

- **Runtime:** Node.js
- **Framework:** Express
- **Bot:** Discord.js v14
- **AI:** OpenClaw (MiniMax-M2.5) vía proxy HTTP
- **Scraping:** Jina AI (`r.jina.ai`)

---

## Estructura

```
backend/
├── server.js          # Entry point: Express + Discord bot
├── commands.js        # Lógica de comandos del bot (/start, /validar, etc.)
├── session-manager.js # Estado de sesiones de usuarios + tests de habilidades
├── survival-rules.js  # Motor de reglas del agente (peg, liquidez, oracle, APY)
├── server.new.js      # WIP — borrador de refactor (incompleto)
└── package.json
```

---

## Variables de entorno

Crear un `.env` en esta carpeta:

```env
PORT=3003
OPENCLAW_HOST=127.0.0.1
OPENCLAW_PORT=18789
OPENCLAW_TOKEN=tu_token_aqui
JINA_URL=https://r.jina.ai/
DISCORD_TOKEN=tu_discord_bot_token

# Survival rules (opcionales, tienen defaults)
PEG_MIN=0.985
SLIPPAGE_MAX=0.02
ORACLE_STALE_MS=300000
GAS_RATIO_MIN=0.15
APY_FLOOR=0.03
```

---

## Instalación y uso

```bash
cd backend
npm install
npm start
```

El servidor corre en `http://localhost:{PORT}`.

---

## API Endpoints

### `GET /health`
Healthcheck básico.

**Response:**
```json
{ "status": "ok", "timestamp": "2026-03-30T..." }
```

---

### `POST /v1/chat/completions`
Proxy transparente hacia OpenClaw AI. Pasa el body y Authorization header sin modificar.

**Body:** OpenAI-compatible chat completions request.

---

### `POST /api/linkedin-scrape`
Scraping de perfil LinkedIn usando Jina AI.

**Body:**
```json
{ "url": "https://linkedin.com/in/usuario" }
```

**Response:**
```json
{
  "success": true,
  "method": "jina-ai",
  "url": "...",
  "skills": ["React", "Web3", "..."],
  "web3_relevance": "high|medium|low",
  "experience_years": 4,
  "raw": "texto crudo del perfil...",
  "scrapedAt": "2026-03-30T..."
}
```

---

### `POST /api/analyze-profile`
Análisis de perfil con OpenClaw AI. Acepta texto crudo del perfil.

**Body:**
```json
{ "content": "texto del perfil de LinkedIn..." }
```

**Response:**
```json
{
  "success": true,
  "skills": [],
  "experience_years": 0,
  "education": [],
  "certifications": [],
  "summary": "...",
  "headline": "...",
  "location": "...",
  "web3_relevance": "high|medium|low"
}
```

---

### `POST /api/analyze-linkedin` *(legacy)*
Versión antigua de análisis. Acepta `profileUrl` + `profileData` estructurado. No usa IA — calcula score local. Mantenido por compatibilidad.

---

## Discord Bot

El bot se conecta con los intents `Guilds`, `GuildMessages`, `MessageContent`.

### Comandos disponibles

| Comando | Descripción |
|---|---|
| `/start` | Mensaje de bienvenida |
| `/validar [skill]` | Inicia certificación de habilidad |
| `/oportunidades` | Muestra vacantes activas en Moolbook |
| `/estado` | Estado actual del agente (ACTIVE / ALERT / HIBERNATE) |
| `/help` | Lista todos los comandos |
| `/cancelar` | Cancela el proceso activo |

### Skills certificables

| Slug | Nombre | Puntaje mínimo |
|---|---|---|
| `logica` | Lógica y Resolución de Problemas | 70/100 |
| `digitacion` | Velocidad de Digitación | 60/100 |
| `python` | Python Fundamentals | 75/100 |

### Flujo de certificación

```
/validar <skill>
  → solicita wallet EVM (0x...)
  → presenta preguntas del test
  → calcula puntaje
  → si aprueba: solicita CONFIRMAR para emitir sello en Rollux
  → si no aprueba: sugiere reintentar en 30 días
```

Las sesiones se guardan en memoria (Map). Al reiniciar el servidor se pierden.

---

## Motor de Survival Rules (`survival-rules.js`)

Evalúa condiciones de mercado para determinar si el agente debe operar normalmente, alertar, o hibernar.

### Estados del agente

| Estado | Condición |
|---|---|
| `ACTIVE` | Sin reglas críticas/high ni múltiples medias |
| `ALERT` | 1 regla HIGH o 2+ reglas MEDIUM |
| `HIBERNATE` | 2+ reglas HIGH/CRITICAL |

### Reglas evaluadas

| Regla | Severidad | Condición |
|---|---|---|
| `PEG_CONFIDENCE` | HIGH | USDC o USDT < 0.985 |
| `LIQUIDITY` | MEDIUM | Slippage estimado > 2% |
| `ORACLE` | HIGH | Oráculo pausado o sin actualizar en 5min |
| `GAS_RATIO` | MEDIUM | Gas > 15% del ingreso en 24h |
| `APY` | CRITICAL | APY actual < 3% |

En modo `HIBERNATE`, el bot responde a `/estado` y `/help` pero ignora el resto de mensajes.

---

## Deploy en Render

1. Conectar este directorio como servicio Web en Render
2. **Build Command:** `npm install`
3. **Start Command:** `npm start`
4. Agregar las variables de entorno en el panel de Render
5. El `PORT` lo asigna Render automáticamente vía `process.env.PORT`
