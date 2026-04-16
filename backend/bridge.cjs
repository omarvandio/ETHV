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
  if (match) return 'https://drive.google.com/uc?export=download&confirm=t&id=' + match[1];
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

async function wakeBackend() {
  try {
    await axios.get(BACKEND_URL + '/health', { timeout: 30000 });
    await new Promise(function(r) { setTimeout(r, 2000); });
  } catch(e) {
    await new Promise(function(r) { setTimeout(r, 3000); });
  }
}

async function callBackend(endpoint, body) {
  const response = await axios.post(BACKEND_URL + endpoint, body, { timeout: 90000 });
  return response.data;
}

function formatAnalysis(data) {
  const skills = data.skills ? data.skills.slice(0, 6).join(', ') : '-';
  const score = data.overall_score != null ? data.overall_score : '-';
  const level = data.level || '-';
  const roles = data.suggested_roles ? data.suggested_roles.map(function(r) { return r.title || r; }).slice(0, 3).join(', ') : '-';
  const strengths = data.strengths ? data.strengths.slice(0, 2).join(' / ') : '-';
  const improvements = data.improvements ? data.improvements.slice(0, 2).join(' / ') : '-';
  return 'Analisis de CV completado\n\nNombre: ' + (data.name || 'No detectado') + '\nUbicacion: ' + (data.location || '-') + '\nPuesto: ' + (data.current_position || '-') + ' @ ' + (data.company || '-') + '\n\nScore: ' + score + '/100 - Nivel: ' + level + '\nRoles sugeridos: ' + roles + '\nSkills: ' + skills + '\n\nFortalezas: ' + strengths + '\nMejoras: ' + improvements + '\n\n---\nEscribe /optimizar para CV optimizado ATS\nEscribe /coverletter para carta de presentacion';
}

function formatOptimized(data) {
  const score = data.ats_score != null ? data.ats_score : '-';
  const summary = data.professional_summary || data.summary || '-';
  return 'CV Optimizado ATS generado\n\nATS Score: ' + score + '/100\n\nResumen:\n' + summary.substring(0, 300) + '...\n\nVisita https://ethv-1.onrender.com para descargarlo.';
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

async function send(agent, isChannel, roomId, chatId, msg) {
  if (isChannel) {
    await agent.sendChannelMessage(roomId, msg);
  } else {
    await agent.sendConnectionMessage(chatId || roomId, msg);
  }
}

app.post('/webhook', async function(req, res) {
  res.status(200).send('OK');
  try {
    const payload = req.body;
    if (payload && payload.challenge) return;

    const text = extractText(payload);
    const isBot = payload && payload.isBot;
    const isChannel = payload && payload.__typename === 'ChannelMessage';
    const roomId = payload && payload.roomId;
    const chatId = payload && payload.chatId;

    if (payload.fileKey) console.log('[ETHV] FILE:', JSON.stringify({fileKey: payload.fileKey, fileMime: payload.fileMime}));
    console.log('[ETHV] msg:', text ? text.substring(0, 80) : '', '| channel:', isChannel, '| room:', roomId);

    if (!text || isBot) return;

    if (payload.fileKey && payload.fileMime === 'application/pdf') {
      await send(agent, isChannel, roomId, chatId, 'Archivo recibido. Por ahora usa el link de Google Drive para analizar tu CV.');
      return;
    }

    if (text === '/start' || text === '/hola') {
      const texto = 'Hola! Soy ETHV, tu asistente de validacion de talento Web3.\n\nPuedo hacer:\n- Analizar tu CV: manda el link de Google Drive (PDF/DOCX)\n- /optimizar: CV optimizado ATS\n- /coverletter: carta de presentacion\n\nMandame el link de tu CV para empezar!';
      await send(agent, isChannel, roomId, chatId, texto);
      return;
    }

    if (text === '/optimizar') {
      const session = sessions.get(roomId);
      if (!session || !session.cvData) {
        await send(agent, isChannel, roomId, chatId, 'Primero analiza tu CV. Mandame el link de tu CV (PDF/DOCX).');
        return;
      }
      await send(agent, isChannel, roomId, chatId, 'Generando CV optimizado ATS...');
      try {
        const result = await callBackend('/api/improve-cv', { cvData: session.cvData, lang: 'es' });
        await send(agent, isChannel, roomId, chatId, formatOptimized(result));
      } catch(e) {
        await send(agent, isChannel, roomId, chatId, 'Error al optimizar. Intenta de nuevo en unos segundos.');
      }
      return;
    }

    if (text === '/coverletter') {
      const session = sessions.get(roomId);
      if (!session || !session.cvData) {
        await send(agent, isChannel, roomId, chatId, 'Primero analiza tu CV. Mandame el link de tu CV (PDF/DOCX).');
        return;
      }
      await send(agent, isChannel, roomId, chatId, 'Generando carta de presentacion...');
      try {
        const cv = session.cvData;
        const prompt = 'Genera una carta de presentacion profesional en espanol para ' + (cv.name || 'el candidato') + ', que trabaja como ' + (cv.current_position || 'profesional') + ' con skills en ' + (cv.skills || []).slice(0,5).join(', ') + '. Ubicacion: ' + (cv.location || 'Peru') + '. La carta debe ser formal, de 3 parrafos, lista para enviar a un reclutador.';
        const carta = await askGroq(prompt);
        await send(agent, isChannel, roomId, chatId, 'Carta de Presentacion:\n\n' + carta);
      } catch(e) {
        await send(agent, isChannel, roomId, chatId, 'Error al generar carta. Intenta de nuevo.');
      }
      return;
    }
    const quizSession = sessions.get(roomId + '_quiz');
    if (quizSession && !text.startsWith('/')) {
      const answer = text.trim();
      quizSession.answers.push(answer);
      quizSession.current++;
      
      if (quizSession.current < quizSession.questions.length) {
        const q = quizSession.questions[quizSession.current];
        let msg = 'Pregunta ' + (quizSession.current + 1) + '/' + quizSession.questions.length + '\n\n' + q.question;
        if (q.options) {
          msg += '\n\n' + q.options.map(function(o, i) { return (i+1) + '. ' + o; }).join('\n');
        }
        await send(agent, isChannel, roomId, chatId, msg);
      } else {
        sessions.delete(roomId + '_quiz');
        const prompt = 'El usuario respondio un quiz de ' + quizSession.skill + ' con estas respuestas: ' + JSON.stringify(quizSession.answers) + '. Las preguntas fueron: ' + JSON.stringify(quizSession.questions.map(function(q) { return q.question; })) + '. Da una evaluacion breve en espanol: nivel detectado, que sabes bien y que mejorar.';
        const eval_ = await askGroq(prompt);
        await send(agent, isChannel, roomId, chatId, 'Quiz completado!\n\n' + eval_);
      }
      return;
    }
if (text.startsWith('/skills')) {
      const skill = text.replace('/skills', '').trim();
      if (!skill) {
        await send(agent, isChannel, roomId, chatId, 'Escribe el skill que quieres validar.\nEjemplo: /skills SolidWorks');
        return;
      }
      await send(agent, isChannel, roomId, chatId, 'Generando quiz de ' + skill + '... espera un momento.');
      try {
        const result = await callBackend('/api/generate-quiz', { skill: skill, level: 'mid', lang: 'es' });
        const questions = result.questions || [];
        if (!questions.length) {
          await send(agent, isChannel, roomId, chatId, 'No pude generar el quiz. Intenta de nuevo.');
          return;
        }
        sessions.set(roomId + '_quiz', { skill, questions, current: 0, answers: [] });
        const q = questions[0];
        let msg = 'Quiz de ' + skill + ' - Pregunta 1/' + questions.length + '\n\n' + q.question;
        if (q.options) {
          msg += '\n\n' + q.options.map(function(o, i) { return (i+1) + '. ' + o; }).join('\n');
        }
        await send(agent, isChannel, roomId, chatId, msg);
      } catch(e) {
        await send(agent, isChannel, roomId, chatId, 'Error al generar quiz. Intenta de nuevo.');
      }
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
      await send(agent, isChannel, roomId, chatId, 'Descargando y analizando tu CV... puede tardar hasta 60 segundos.');
      try {
        await wakeBackend();
        const dl = await downloadFile(link);
        const result = await callBackend('/api/analyze-cv', { file: dl.file, filename: dl.filename });
        if (!result || !result.name) {
          await send(agent, isChannel, roomId, chatId, 'El backend esta iniciando. Intenta de nuevo en 30 segundos.');
          return;
        }
        sessions.set(roomId, { cvData: result, timestamp: Date.now() });
        await send(agent, isChannel, roomId, chatId, formatAnalysis(result));
      } catch(e) {
        console.error('[ETHV] CV error:', e.message);
        await send(agent, isChannel, roomId, chatId, 'No pude analizar el CV. El servidor puede estar iniciando, intenta de nuevo en 30 segundos.');
      }
      return;
    }

    const reply = await askGroq(text);
    await send(agent, isChannel, roomId, chatId, reply);

  } catch(e) {
    console.error('[ETHV] Webhook error:', e.message);
  }
});

app.get('/health', function(req, res) { res.json({ status: 'ok', version: 'cv-v5', sessions: sessions.size }); });
app.listen(PORT, function() { console.log('[ETHV] Puerto', PORT, 'listo'); });