require('dotenv').config();
const { SuperDappAgent } = require('@superdapp/agents');
const axios = require('axios');
const express = require('express');

const API_TOKEN = process.env.SUPERDAPP_TOKEN || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const BACKEND_URL = process.env.BACKEND_URL || 'https://ethv-1.onrender.com';
const PORT = process.env.BRIDGE_PORT || 3004;

console.log('[ETHV] TOKEN:', API_TOKEN ? 'OK' : 'FALTA');
console.log('[ETHV] GROQ:', GROQ_API_KEY ? 'OK' : 'FALTA');
console.log('[ETHV] BACKEND:', BACKEND_URL);

const agent = new SuperDappAgent({ apiToken: API_TOKEN, baseUrl: 'https://api.superdapp.ai' });
const app = express();
app.use(express.json());

// Memoria por roomId: guarda cvData después del análisis
const sessions = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractLink(text) {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function convertDriveLink(url) {
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  return url;
}

async function downloadFile(url) {
  const directUrl = convertDriveLink(url);
  const response = await axios.get(directUrl, { 
    responseType: 'arraybuffer', 
    timeout: 15000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const buffer = Buffer.from(response.data);
  const filename = url.includes('drive.google') ? 'cv.pdf' : (url.split('/').pop().split('?')[0] || 'cv.pdf');
  return { file: buffer.toString('base64'), filename };
}

async function callBackend(endpoint, body) {
  const response = await axios.post(`${BACKEND_URL}${endpoint}`, body, { timeout: 30000 });
  return response.data;
}

function formatAnalysis(data) {
  const skills = data.skills?.slice(0, 6).join(', ') || '—';
  const score = data.overall_score ?? '—';
  const level = data.level || '—';
  const roles = data.suggested_roles?.map(r => r.title || r).slice(0, 3).join(', ') || '—';
  const strengths = data.strengths?.slice(0, 2).join('\n✅ ') || '—';
  const improvements = data.improvements?.slice(0, 2).join('\n→ ') || '—';

  return `📄 *Análisis de CV completado*

👤 ${data.name || 'Nombre no detectado'}
📍 ${data.location || '—'}
💼 ${data.current_position || '—'} @ ${data.company || '—'}

⭐ Score: ${score}/100 — Nivel: ${level}
🎯 Roles sugeridos: ${roles}
🛠 Skills: ${skills}

✅ Fortalezas:
✅ ${strengths}

→ Mejoras sugeridas:
→ ${improvements}

---
Escribe /optimizar para generar tu CV optimizado ATS
Escribe /coverletter para generar tu carta de presentación`;
}

function formatOptimized(data) {
  const score = data.ats_score ?? '—';
  const summary = data.professional_summary || data.summary || '—';
  return `📝 *CV Optimizado ATS generado*

📊 ATS Score: ${score}/100

📋 Resumen profesional:
${summary.substring(0, 300)}...

✅ Tu CV optimizado está listo.
Visita https://ethv-1.onrender.com para descargarlo en PDF o Word.`;
}

function formatCoverLetter(data) {
  const letter = data.cover_letter || data.content || JSON.stringify(data);
  return `✉️ *Carta de Presentación generada*

${letter.substring(0, 600)}...

✅ Carta completa disponible en https://ethv-1.onrender.com`;
}

async function askGroq(message) {
  try {
    const r = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Eres ETHV, asistente de validación de talento Web3. Ayudas a profesionales a mejorar su CV, validar skills y encontrar oportunidades. Responde en español, breve y útil. Si alguien pregunta qué puedes hacer, menciona: analizar CV (manda el link), optimizar CV para ATS, y generar carta de presentación.' },
          { role: 'user', content: message }
        ],
        max_tokens: 400
      },
      { headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' } }
    );
    return r.data.choices[0].message.content;
  } catch(e) {
    console.error('[ETHV] Groq error:', e.message);
    return 'Error al procesar. Intenta de nuevo.';
  }
}

function extractText(payload) {
  try {
    const p = JSON.parse(payload.body);
    const i = JSON.parse(decodeURIComponent(p.m));
    return i.body || '';
  } catch(e) { return ''; }
}

// ── Comandos ─────────────────────────────────────────────────────────────────
const isChannel = message?.__typename === 'ChannelMessage';
const channelRoomId = message?.roomId || roomId;
agent.addCommand('/start', async ({ roomId, message }) => {?.includes
  ('"t":"channel"');
  const texto = `👋 Hola! Soy *ETHV*, tu asistente de validación de talento Web3.

📄 *Analizar CV* — mándame el link de tu CV (PDF/DOCX)
📝 *Optimizar ATS* — escribe /optimizar después del análisis  
✉️ *Cover Letter* — escribe /coverletter después del análisis

¿Empezamos? Mándame el link de tu CV 👆`;
if (isChannel) await agent.sendChannelMessage(channelRoomId, texto);
else await agent.sendConnectionMessage(channelRoomId, texto);
});

agent.addCommand('/optimizar', async ({ roomId }) => {
  const session = sessions.get(roomId);
  if (!session?.cvData) {
    await agent.sendConnectionMessage(roomId,
      '⚠️ Primero necesito analizar tu CV.\n\nMándame el link público de tu CV (PDF/DOCX) y empezamos.'
    );
    return;
  }
  await agent.sendConnectionMessage(roomId, '⏳ Generando tu CV optimizado para ATS...');
  try {
    const result = await callBackend('/api/improve-cv', { cvData: session.cvData, lang: 'es' });
    await agent.sendConnectionMessage(roomId, formatOptimized(result));
  } catch(e) {
    console.error('[ETHV] optimizar error:', e.message);
    await agent.sendConnectionMessage(roomId, '❌ Error al optimizar. Intenta de nuevo.');
  }
});

agent.addCommand('/coverletter', async ({ roomId }) => {
  const session = sessions.get(roomId);
  if (!session?.cvData) {
    await agent.sendConnectionMessage(roomId,
      '⚠️ Primero necesito analizar tu CV.\n\nMándame el link público de tu CV (PDF/DOCX) y empezamos.'
    );
    return;
  }
  await agent.sendConnectionMessage(roomId, '⏳ Generando tu carta de presentación...');
  try {
    const result = await callBackend('/api/improve-cv', { cvData: session.cvData, lang: 'es', mode: 'cover_letter' });
    await agent.sendConnectionMessage(roomId, formatCoverLetter(result));
  } catch(e) {
    console.error('[ETHV] coverletter error:', e.message);
    await agent.sendConnectionMessage(roomId, '❌ Error al generar carta. Intenta de nuevo.');
  }
});

// ── Webhook ───────────────────────────────────────────────────────────────────
app.post('/webhook-debug', (req, res) => {
  console.log('[DEBUG] body:', JSON.stringify(req.body));
  res.status(200).send('OK');
});
app.post('/webhook', async (req, res) => {
  res.status(200).send('OK');
  console.log('[ETHV] RAW FULL:', JSON.stringify(req.body));
  try {
    const payload = req.body;
    if (payload?.challenge) return;

    const text = extractText(payload);
    const isBot = payload?.isBot || false;
    const isChannel = payload?.__typename === 'ChannelMessage';
    const roomId = payload?.roomId;

    console.log('[ETHV] msg:', text?.substring(0, 80), '| channel:', isChannel, '| room:', roomId);

    if (!text || isBot) return;

    const send = async (msg) => {
  if (isChannel) await agent.sendChannelMessage(payload.roomId, msg);
  else await agent.sendConnectionMessage(payload.chatId || payload.roomId, msg);
};

    if (text.startsWith('/')) {
      await agent.processRequest(payload);
      return;
    }

    // Detecta link de CV
    const link = extractLink(text);
    const looksLikeCV = link && (
      link.includes('.pdf') ||
      link.includes('.docx') ||
      link.includes('drive.google') ||
      link.includes('dropbox') ||
      link.includes('docs.google') ||
      text.toLowerCase().includes('cv') ||
      text.toLowerCase().includes('curriculum') ||
      text.toLowerCase().includes('analiz')
    );

    if (looksLikeCV) {
      await send('⏳ Descargando y analizando tu CV... espera un momento.');
      try {
        const { file, filename } = await downloadFile(link);
        const result = await callBackend('/api/analyze-cv', { file, filename });
        // Guardar sesión
        sessions.set(roomId, { cvData: result, timestamp: Date.now() });
        await send(formatAnalysis(result));
      } catch(e) {
        console.error('[ETHV] CV error:', e.message);
        await send('❌ No pude analizar ese archivo. Asegúrate que el link sea público y directo al archivo (PDF, DOCX o TXT).');
      }
      return;
    }

    // Respuesta general
    const reply = await askGroq(text);
    await send(reply);

  } catch(e) {
    console.error('[ETHV] Webhook error:', e.message);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', version: 'cv-analysis-v2', sessions: sessions.size }));
app.listen(PORT, () => console.log('[ETHV] Puerto', PORT, 'listo'));
