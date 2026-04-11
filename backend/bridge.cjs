require('dotenv').config();
const { SuperDappAgent } = require('@superdapp/agents');
const axios = require('axios');
const express = require('express');

const API_TOKEN = process.env.SUPERDAPP_TOKEN || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const BACKEND_URL = process.env.BACKEND_URL || 'https://ethv.onrender.com';
const PORT = process.env.BRIDGE_PORT || 3004;

console.log('[ETHV] TOKEN:', API_TOKEN ? 'OK' : 'FALTA');
console.log('[ETHV] GROQ:', GROQ_API_KEY ? 'OK' : 'FALTA');
console.log('[ETHV] BACKEND:', BACKEND_URL);

const agent = new SuperDappAgent({ apiToken: API_TOKEN, baseUrl: 'https://api.superdapp.ai' });
const app = express();
app.use(express.json());

const sessions = new Map();

function extractLink(text) {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function convertDriveLink(url) {
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return 'https://drive.google.com/uc?export=download&id=' + match[1];
  return url;
}

async function downloadFile(url) {
  const directUrl = convertDriveLink(url);
  const response = await axios.get(directUrl, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const buffer = Buffer.from(response.data);
  const filename = url.includes('drive.google') ? 'cv.pdf' : (url.split('/').pop().split('?')[0] || 'cv.pdf');
  return { file: buffer.toString('base64'), filename };
}

async function callBackend(endpoint, body) {
  const response = await axios.post(BACKEND_URL + endpoint, body, { timeout: 30000 });
  return response.data;
}

function formatAnalysis(data) {
  const skills = data.skills ? data.skills.slice(0, 6).join(', ') : '—';
  const score = data.overall_score != null ? data.overall_score : '—';
  const level = data.level || '—';
  const roles = data.suggested_roles ? data.suggested_roles.map(function(r) { return r.title || r; }).slice(0, 3).join(', ') : '—';
  return '📄 Análisis de CV completado\n\n👤 ' + (data.name || 'Nombre no detectado') + '\n📍 ' + (data.location || '—') + '\n💼 ' + (data.current_position || '—') + ' @ ' + (data.company || '—') + '\n\n⭐ Score: ' + score + '/100 — Nivel: ' + level + '\n🎯 Roles: ' + roles + '\n🛠 Skills: ' + skills + '\n\n---\nEscribe /optimizar para CV optimizado ATS\nEscribe /coverletter para carta de presentación';
}

function formatOptimized(data) {
  const score = data.ats_score != null ? data.ats_score : '—';
  const summary = data.professional_summary || data.summary || '—';
  return '📝 CV Optimizado ATS generado\n\n📊 ATS Score: ' + score + '/100\n\n📋 Resumen:\n' + summary.substring(0, 300) + '...\n\n✅ Visita https://ethv-1.onrender.com para descargarlo.';
}

function formatCoverLetter(data) {
  const letter = data.cover_letter || data.content || JSON.stringify(data);
  return '✉️ Carta de Presentación generada\n\n' + letter.substring(0, 600) + '...\n\n✅ Completa en https://ethv-1.onrender.com';
}

async function askGroq(message) {
  try {
    const r = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Eres ETHV, asistente de validacion de talento Web3. Ayudas a mejorar CVs, validar skills y encontrar oportunidades. Responde en espanol, breve y util.' },
          { role: 'user', content: message }
        ],
        max_tokens: 400
      },
      { headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' } }
    );
    return r.data.choices[0].message.content;
  } catch(e) {
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

agent.addCommand('/start', async function(ctx) {
  const roomId = ctx.roomId;
  const isChannel = ctx.message && ctx.message.__typename === 'ChannelMessage';
  const texto = 'Hola! Soy ETHV, tu asistente de validacion de talento Web3.\n\nPuedo hacer:\n📄 Analizar tu CV — manda el link (PDF/DOCX)\n📝 /optimizar — CV optimizado ATS\n✉️ /coverletter — carta de presentacion\n\nMandame el link de tu CV para empezar!';
  if (isChannel) await agent.sendChannelMessage(roomId, texto);
  else await agent.sendConnectionMessage(roomId, texto);
});

agent.addCommand('/hola', async function(ctx) {
  const roomId = ctx.roomId;
  const isChannel = ctx.message && ctx.message.__typename === 'ChannelMessage';
  const texto = 'Hola! Soy ETHV. Mandame el link de tu CV y lo analizo al instante.\n\nEscribe /start para ver todo lo que puedo hacer.';
  if (isChannel) await agent.sendChannelMessage(roomId, texto);
  else await agent.sendConnectionMessage(roomId, texto);
});

agent.addCommand('/optimizar', async function(ctx) {
  const roomId = ctx.roomId;
  const session = sessions.get(roomId);
  if (!session || !session.cvData) {
    await agent.sendConnectionMessage(roomId, 'Primero analiza tu CV. Mandame el link de tu CV (PDF/DOCX).');
    return;
  }
  await agent.sendConnectionMessage(roomId, 'Generando CV optimizado ATS...');
  try {
    const result = await callBackend('/api/improve-cv', { cvData: session.cvData, lang: 'es' });
    await agent.sendConnectionMessage(roomId, formatOptimized(result));
  } catch(e) {
    await agent.sendConnectionMessage(roomId, 'Error al optimizar. Intenta de nuevo.');
  }
});

agent.addCommand('/coverletter', async function(ctx) {
  const roomId = ctx.roomId;
  const session = sessions.get(roomId);
  if (!session || !session.cvData) {
    await agent.sendConnectionMessage(roomId, 'Primero analiza tu CV. Mandame el link de tu CV (PDF/DOCX).');
    return;
  }
  await agent.sendConnectionMessage(roomId, 'Generando carta de presentacion...');
  try {
    const result = await callBackend('/api/improve-cv', { cvData: session.cvData, lang: 'es', mode: 'cover_letter' });
    await agent.sendConnectionMessage(roomId, formatCoverLetter(result));
  } catch(e) {
    await agent.sendConnectionMessage(roomId, 'Error al generar carta. Intenta de nuevo.');
  }
});

app.post('/webhook', async function(req, res) {
  res.status(200).send('OK');
  try {
    const payload = req.body;
    if (payload && payload.challenge) return;

    const text = extractText(payload);
    const isBot = payload && payload.isBot;
    const isChannel = payload && payload.__typename === 'ChannelMessage';
    const roomId = payload && payload.roomId;

    console.log('[ETHV] msg:', text ? text.substring(0, 80) : '', '| channel:', isChannel, '| room:', roomId);

    if (!text || isBot) return;

    const send = async function(msg) {
      if (isChannel) await agent.sendChannelMessage(roomId, msg);
      else await agent.sendConnectionMessage(payload.chatId || roomId, msg);
    };

    if (text.startsWith('/')) {
      await agent.processRequest(payload);
      return;
    }

    const link = extractLink(text);
    const looksLikeCV = link && (
      link.includes('.pdf') ||
      link.includes('.docx') ||
      link.includes('drive.google') ||
      link.includes('dropbox') ||
      text.toLowerCase().includes('cv') ||
      text.toLowerCase().includes('curriculum') ||
      text.toLowerCase().includes('analiz')
    );

    if (looksLikeCV) {
      await send('Descargando y analizando tu CV... espera un momento.');
      try {
        const dl = await downloadFile(link);
        const result = await callBackend('/api/analyze-cv', { file: dl.file, filename: dl.filename });
        sessions.set(roomId, { cvData: result, timestamp: Date.now() });
        await send(formatAnalysis(result));
      } catch(e) {
        console.error('[ETHV] CV error:', e.message);
        await send('No pude analizar ese archivo. Asegurate que el link sea publico y directo al archivo (PDF, DOCX o TXT).');
      }
      return;
    }

    const reply = await askGroq(text);
    await send(reply);

  } catch(e) {
    console.error('[ETHV] Webhook error:', e.message);
  }
});

app.get('/health', function(req, res) { res.json({ status: 'ok', version: 'cv-v3', sessions: sessions.size }); });
app.listen(PORT, function() { console.log('[ETHV] Puerto', PORT, 'listo'); });
