require('dotenv').config();
const { SuperDappAgent } = require('@superdapp/agents');
const express = require('express');
const axios = require('axios');

const API_TOKEN = process.env.SUPERDAPP_TOKEN || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const PORT = process.env.BRIDGE_PORT || 3004;

console.log('[ETHV] TOKEN:', API_TOKEN ? 'OK' : 'FALTA');
console.log('[ETHV] GROQ:', GROQ_API_KEY ? 'OK' : 'FALTA');

const agent = new SuperDappAgent({ apiToken: API_TOKEN, baseUrl: 'https://api.superdapp.ai' });
const app = express();
app.use(express.json());

async function askGroq(message) {
  try {
    const r = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: 'Eres ETHV, asistente de validacion de talento. Responde en espanol, breve.' }, { role: 'user', content: message }], max_tokens: 500 },
      { headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' } }
    );
    return r.data.choices[0].message.content;
  } catch(e) { console.error('[ETHV] Groq error:', e.message); return 'Error al procesar.'; }
}

function extractText(payload) {
  try {
    const p = JSON.parse(payload.body);
    const i = JSON.parse(decodeURIComponent(p.m));
    return i.body || '';
  } catch(e) { return ''; }
}

agent.addCommand('/start', async ({ roomId }) => {
  await agent.sendConnectionMessage(roomId, 'Hola! Soy ETHV tu asistente de talento.');
});

agent.addCommand('/hola', async ({ roomId }) => {
  await agent.sendConnectionMessage(roomId, 'Hola! Soy ETHV, listo para ayudarte.');
});

app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');
  try {
    const payload = req.body;
    if (payload?.challenge) return;

    const text = extractText(payload);
    const isBot = payload?.isBot || false;
    const isChannel = payload?.__typename === 'ChannelMessage';
    const roomId = payload?.roomId;

    console.log('[ETHV] msg:', text, 'channel:', isChannel, 'room:', roomId);

    if (!text || isBot) return;

    if (text.startsWith('/')) {
      await agent.processRequest(payload);
      return;
    }

    const reply = await askGroq(text);

    if (isChannel) {
      await agent.sendChannelMessage(roomId, reply);
      console.log('[ETHV] Canal respondido');
    } else {
      await agent.sendConnectionMessage(roomId, reply);
      console.log('[ETHV] DM respondido');
    }

  } catch(e) {
    console.error('[ETHV] Error:', e.message);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(PORT, () => console.log('[ETHV] Puerto', PORT, 'listo'));
