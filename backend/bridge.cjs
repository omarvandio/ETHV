require('dotenv').config();
const { SuperDappAgent } = require('@superdapp/agents');
const axios = require('axios');
const express = require('express');
const { Provider, Wallet, Contract } = require('zksync-ethers');
const { ethers } = require('ethers');

const API_TOKEN       = process.env.SUPERDAPP_TOKEN   || '';
const GROQ_API_KEY    = process.env.GROQ_API_KEY      || '';
const BACKEND_URL     = process.env.BACKEND_URL        || 'https://ethv.onrender.com';
const MINTER_KEY      = process.env.MINTER_PRIVATE_KEY || process.env.ZKSYS_PRIVATE_KEY || process.env.PRIVATE_KEY || '';
const PORT            = process.env.BRIDGE_PORT        || 3004;
const MAX_TOOL_ROUNDS = 5;
const PASS_SCORE      = 70; // Mínimo para aprobar y emitir certificado

const CONTRACT_ADDRESS = '0x8786996dA2Ed941FA4a0Aa7F0226fe50976C1539';
const ZKSYS_RPC        = 'https://rpc-zk.tanenbaum.io/';
const EXPLORER_URL     = 'https://explorer-zk.tanenbaum.io';

// ABI mínima del contrato SkillCertificate
const CERT_ABI = [
  'function mintCertificate(address to, string skillName, uint8 score, string level, string uri, bytes32 cvHash) external returns (uint256)',
  'function totalCertificates() external view returns (uint256)'
];

console.log('[ETHV] TOKEN:',   API_TOKEN   ? 'OK' : 'FALTA');
console.log('[ETHV] GROQ:',    GROQ_API_KEY ? 'OK' : 'FALTA');
console.log('[ETHV] MINTER:',  MINTER_KEY   ? 'OK' : 'FALTA - no se podrán emitir certificados');

const agent = new SuperDappAgent({ apiToken: API_TOKEN, baseUrl: 'https://api.superdapp.ai' });
const app = express();
app.use(express.json());

// ─── Sesiones ────────────────────────────────────────────────────────────────
// sessions[roomId] = { cvData, history, quizState, pendingCertificate }
const sessions = new Map();

function getSession(roomId) {
  if (!sessions.has(roomId)) {
    sessions.set(roomId, { cvData: null, history: [], quizState: null, pendingCertificate: null });
  }
  return sessions.get(roomId);
}

// ─── Tools del agente ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'analyze_cv',
      description: 'Descarga y analiza un CV desde una URL (Google Drive, Dropbox, link directo a PDF/DOCX). Devuelve nombre, skills, score, roles sugeridos, fortalezas y mejoras.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL del archivo CV (PDF o DOCX)' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'optimize_cv',
      description: 'Genera un CV optimizado para ATS basado en el CV previamente analizado del usuario.',
      parameters: {
        type: 'object',
        properties: {
          lang: { type: 'string', description: 'Idioma: es o en', enum: ['es', 'en'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_cover_letter',
      description: 'Genera una carta de presentación profesional basada en el CV del usuario.',
      parameters: {
        type: 'object',
        properties: {
          job_title: { type: 'string', description: 'Puesto al que aplica (opcional)' },
          company:   { type: 'string', description: 'Empresa destino (opcional)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_skill_quiz',
      description: 'Inicia un quiz de validación de un skill técnico específico.',
      parameters: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: 'Skill a evaluar (ej: SolidWorks, Solidity, React)' },
          level: { type: 'string', description: 'Nivel del quiz', enum: ['junior', 'mid', 'senior'], default: 'mid' }
        },
        required: ['skill']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mint_certificate',
      description: 'Emite un certificado de skill validado en la blockchain (zkSYS Testnet). Solo usar cuando el usuario aprobó el quiz con score >= 70 y proporcionó su wallet address.',
      parameters: {
        type: 'object',
        properties: {
          wallet_address: { type: 'string', description: 'Dirección Ethereum del usuario (0x...)' },
          skill:          { type: 'string', description: 'Nombre del skill validado' },
          score:          { type: 'number', description: 'Score obtenido (0-100)' },
          level:          { type: 'string', description: 'Nivel: Junior, Mid o Senior' }
        },
        required: ['wallet_address', 'skill', 'score', 'level']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description: 'Obtiene el perfil del CV del usuario si fue analizado previamente.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// ─── Blockchain: mint certificado ─────────────────────────────────────────────
async function mintOnChain(walletAddress, skill, score, level, cvData) {
  if (!MINTER_KEY) throw new Error('MINTER_PRIVATE_KEY no configurado en .env');

  const provider = new Provider(ZKSYS_RPC);
  const signer   = new Wallet(MINTER_KEY, provider);
  const contract = new Contract(CONTRACT_ADDRESS, CERT_ABI, signer);

  // Metadata inline (base64) — sin necesidad de IPFS
  const metadata = {
    name:        'ETHV Skill Certificate — ' + skill,
    description: 'Certificado de skill validado por IA en ETHV. Skill: ' + skill + ' | Score: ' + score + '/100 | Nivel: ' + level,
    image:       'https://ethv-1.onrender.com/certificate-badge.png',
    attributes: [
      { trait_type: 'Skill',      value: skill },
      { trait_type: 'Score',      value: score },
      { trait_type: 'Level',      value: level },
      { trait_type: 'Issued',     value: new Date().toISOString().split('T')[0] },
      { trait_type: 'Platform',   value: 'ETHV' },
      { trait_type: 'Network',    value: 'zkSYS Testnet' }
    ]
  };
  const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(metadata)).toString('base64');

  // cvHash: keccak256 del nombre+skills del usuario (o ceros si no hay CV)
  let cvHash = ethers.ZeroHash;
  if (cvData && cvData.name) {
    const raw = cvData.name + (cvData.skills || []).join(',');
    cvHash = ethers.keccak256(ethers.toUtf8Bytes(raw));
  }

  const tx = await contract.mintCertificate(walletAddress, skill, score, level, uri, cvHash);
  const receipt = await tx.wait();

  // Extraer tokenId del event CertificateMinted
  let tokenId = null;
  if (receipt && receipt.logs) {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === 'CertificateMinted') {
          tokenId = parsed.args.tokenId.toString();
          break;
        }
      } catch(e) {}
    }
  }

  return { txHash: tx.hash, tokenId, explorerTx: EXPLORER_URL + '/tx/' + tx.hash };
}

// ─── Evaluación del quiz (devuelve JSON estructurado) ─────────────────────────
async function evaluateQuiz(skill, questions, answers) {
  const prompt = 'Eres un evaluador técnico experto. El usuario respondió un quiz de "' + skill + '".\n\nPreguntas y respuestas:\n' +
    questions.map(function(q, i) {
      return (i + 1) + '. ' + q.question + '\n   Respuesta del usuario: ' + (answers[i] || '(sin respuesta)');
    }).join('\n') +
    '\n\nDevuelve EXACTAMENTE este JSON (sin markdown, sin explicación extra):\n{"score":85,"level":"Mid","passed":true,"evaluation":"Texto de evaluación breve en español de 2-3 oraciones con lo que sabe bien y qué mejorar."}';

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.2
    },
    { headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' } }
  );

  const text = response.data.choices[0].message.content.trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Respuesta del evaluador inválida');
  return JSON.parse(match[0]);
}

// ─── Implementación de las tools ──────────────────────────────────────────────
async function convertDriveLink(url) {
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return 'https://drive.google.com/uc?export=download&confirm=t&id=' + match[1];
  return url;
}

async function downloadFile(url) {
  const directUrl = await convertDriveLink(url);
  const response = await axios.get(directUrl, {
    responseType: 'arraybuffer', timeout: 20000, maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const buffer   = Buffer.from(response.data);
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

async function executeTool(toolName, args, session) {
  console.log('[TOOL]', toolName, JSON.stringify(args));

  if (toolName === 'analyze_cv') {
    await wakeBackend();
    const dl     = await downloadFile(args.url);
    const result = await callBackend('/api/analyze-cv', { file: dl.file, filename: dl.filename });
    session.cvData = result;
    return JSON.stringify({
      name: result.name, location: result.location, current_position: result.current_position,
      company: result.company, skills: result.skills, experience_years: result.experience_years,
      score: result.overall_score, level: result.level, suggested_roles: result.suggested_roles,
      strengths: result.strengths, improvements: result.improvements, web3_relevance: result.web3_relevance
    });
  }

  if (toolName === 'optimize_cv') {
    if (!session.cvData) return JSON.stringify({ error: 'No hay CV analizado. Primero analiza tu CV.' });
    const result = await callBackend('/api/improve-cv', { cvData: session.cvData, lang: args.lang || 'es' });
    return JSON.stringify({
      ats_score: result.ats_score,
      professional_summary: result.professional_summary || result.summary,
      optimized_skills: result.skills
    });
  }

  if (toolName === 'generate_cover_letter') {
    if (!session.cvData) return JSON.stringify({ error: 'No hay CV analizado. Primero analiza tu CV.' });
    const cv      = session.cvData;
    const target  = args.job_title ? ' para el puesto de ' + args.job_title : '';
    const company = args.company   ? ' en ' + args.company : '';
    const prompt  = 'Genera una carta de presentacion profesional en espanol' + target + company + ' para ' + (cv.name || 'el candidato') + ', ' + (cv.current_position || 'profesional') + ' con skills en ' + (cv.skills || []).slice(0, 5).join(', ') + '. La carta debe ser formal, 3 parrafos, lista para enviar. Solo devuelve la carta.';
    const r = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 600 },
      { headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' } }
    );
    return JSON.stringify({ cover_letter: r.data.choices[0].message.content });
  }

  if (toolName === 'start_skill_quiz') {
    const result    = await callBackend('/api/generate-quiz', { skill: args.skill, level: args.level || 'mid', lang: 'es' });
    const questions = result.questions || [];
    if (!questions.length) return JSON.stringify({ error: 'No se pudo generar el quiz.' });
    session.quizState = { skill: args.skill, questions, current: 0, answers: [] };
    const q = questions[0];
    return JSON.stringify({
      quiz_started:     true,
      skill:            args.skill,
      total_questions:  questions.length,
      first_question:   q.question,
      options:          q.options || null
    });
  }

  if (toolName === 'mint_certificate') {
    if (!ethers.isAddress(args.wallet_address)) {
      return JSON.stringify({ error: 'Wallet address inválida.' });
    }
    const result = await mintOnChain(args.wallet_address, args.skill, args.score, args.level, session.cvData);
    return JSON.stringify(result);
  }

  if (toolName === 'get_user_profile') {
    if (!session.cvData) return JSON.stringify({ error: 'No hay CV analizado aún.' });
    return JSON.stringify(session.cvData);
  }

  return JSON.stringify({ error: 'Tool desconocida: ' + toolName });
}

// ─── Loop del agente (ReAct) ─────────────────────────────────────────────────
async function runAgent(userMessage, session) {
  session.history.push({ role: 'user', content: userMessage });
  if (session.history.length > 20) session.history = session.history.slice(-20);

  const systemPrompt = 'Eres ETHV, un agente inteligente de validacion de talento Web3.\n\nTienes acceso a herramientas reales. Usa las herramientas cuando el usuario lo necesite.\n\nReglas:\n- Link que parece CV (Google Drive, PDF, DOCX) → llama analyze_cv.\n- Pide optimizar CV → llama optimize_cv.\n- Pide carta de presentacion → llama generate_cover_letter.\n- Quiere validar un skill → llama start_skill_quiz.\n- Si el usuario da una wallet address (0x...) y tiene un certificado pendiente → llama mint_certificate con los datos del certificado pendiente.\n- Responde siempre en español, breve y util.';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...session.history
  ];

  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model: 'llama-3.3-70b-versatile', messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 800 },
      { headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' } }
    );

    const choice       = response.data.choices[0];
    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    if (choice.finish_reason !== 'tool_calls' || !assistantMsg.tool_calls) {
      const finalText = assistantMsg.content || 'Listo!';
      session.history.push({ role: 'assistant', content: finalText });
      return finalText;
    }

    for (const toolCall of assistantMsg.tool_calls) {
      const toolName = toolCall.function.name;
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments); } catch(e) {}

      let toolResult;
      try {
        toolResult = await executeTool(toolName, args, session);
      } catch(e) {
        console.error('[TOOL ERROR]', toolName, e.message);
        toolResult = JSON.stringify({ error: e.message });
      }

      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });
    }
  }

  return 'No pude completar la acción. Intenta de nuevo.';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractText(payload) {
  try {
    const p = JSON.parse(payload.body);
    const i = JSON.parse(decodeURIComponent(p.m));
    return i.body || '';
  } catch(e) { return ''; }
}

function isWalletAddress(text) {
  return /^0x[a-fA-F0-9]{40}$/.test(text.trim());
}

async function send(isChannel, roomId, chatId, msg) {
  if (isChannel) {
    await agent.sendChannelMessage(roomId, msg);
  } else {
    await agent.sendConnectionMessage(chatId || roomId, msg);
  }
}

// ─── Webhook ──────────────────────────────────────────────────────────────────
app.post('/webhook', async function(req, res) {
  res.status(200).send('OK');
  try {
    const payload   = req.body;
    if (payload && payload.challenge) return;

    const text      = extractText(payload);
    const isBot     = payload && payload.isBot;
    const isChannel = payload && payload.__typename === 'ChannelMessage';
    const roomId    = payload && payload.roomId;
    const chatId    = payload && payload.chatId;

    console.log('[ETHV] msg:', text ? text.substring(0, 80) : '', '| room:', roomId);
    if (!text || isBot) return;

    const session = getSession(roomId);

    // ── 1. Quiz activo: colectar respuesta ────────────────────────────────────
    if (session.quizState && !text.startsWith('/')) {
      const quiz = session.quizState;
      quiz.answers.push(text.trim());
      quiz.current++;

      if (quiz.current < quiz.questions.length) {
        // Siguiente pregunta
        const q   = quiz.questions[quiz.current];
        let msg   = 'Pregunta ' + (quiz.current + 1) + '/' + quiz.questions.length + '\n\n' + q.question;
        if (q.options) msg += '\n\n' + q.options.map(function(o, i) { return (i + 1) + '. ' + o; }).join('\n');
        await send(isChannel, roomId, chatId, msg);
      } else {
        // Quiz terminado — evaluar
        await send(isChannel, roomId, chatId, 'Evaluando tus respuestas...');
        session.quizState = null;

        let result;
        try {
          result = await evaluateQuiz(quiz.skill, quiz.questions, quiz.answers);
        } catch(e) {
          await send(isChannel, roomId, chatId, 'Error al evaluar. Intenta de nuevo.');
          return;
        }

        const passed = result.score >= PASS_SCORE;
        let msg = 'Quiz de ' + quiz.skill + ' completado!\n\n' +
          'Score: ' + result.score + '/100 — Nivel: ' + result.level + '\n\n' +
          result.evaluation;

        if (passed) {
          // Guardar para emitir certificado
          session.pendingCertificate = { skill: quiz.skill, score: result.score, level: result.level };
          msg += '\n\n Aprobaste! Para emitir tu certificado en la blockchain (zkSYS Testnet), envía tu wallet address (0x...).';
        } else {
          msg += '\n\nNecesitas ' + PASS_SCORE + '/100 para aprobar. Sigue practicando y vuelve a intentarlo con /skills ' + quiz.skill;
        }

        await send(isChannel, roomId, chatId, msg);
      }
      return;
    }

    // ── 2. Certificado pendiente + wallet recibida ─────────────────────────────
    if (session.pendingCertificate && isWalletAddress(text)) {
      const cert = session.pendingCertificate;
      session.pendingCertificate = null;

      await send(isChannel, roomId, chatId, 'Emitiendo certificado en blockchain... puede tardar 15-30 segundos.');
      try {
        const result = await mintOnChain(text.trim(), cert.skill, cert.score, cert.level, session.cvData);
        const msg = 'Certificado emitido en zkSYS Testnet!\n\n' +
          'Skill: ' + cert.skill + '\n' +
          'Score: ' + cert.score + '/100 — ' + cert.level + '\n' +
          'Token ID: #' + result.tokenId + '\n' +
          'Tx: ' + result.explorerTx + '\n\n' +
          'Tu certificado es Soulbound (no transferible). Verifica tu wallet en el explorer.';
        await send(isChannel, roomId, chatId, msg);
      } catch(e) {
        console.error('[ETHV] Mint error:', e.message);
        await send(isChannel, roomId, chatId, 'Error al emitir certificado: ' + e.message + '\n\nAsegúrate de que el servidor tenga MINTER_PRIVATE_KEY configurado.');
      }
      return;
    }

    // ── 3. Agente general (tool calling) ──────────────────────────────────────
    const reply = await runAgent(text, session);
    await send(isChannel, roomId, chatId, reply);

    // Si el agente inició un quiz, enviar la primera pregunta
    if (session.quizState && session.quizState.current === 0) {
      const q   = session.quizState.questions[0];
      let msg   = 'Pregunta 1/' + session.quizState.questions.length + '\n\n' + q.question;
      if (q.options) msg += '\n\n' + q.options.map(function(o, i) { return (i + 1) + '. ' + o; }).join('\n');
      await send(isChannel, roomId, chatId, msg);
    }

  } catch(e) {
    console.error('[ETHV] Webhook error:', e.message);
  }
});

app.get('/health', function(req, res) {
  res.json({ status: 'ok', version: 'agent-v2-cert', sessions: sessions.size, minter: !!MINTER_KEY });
});

// Keep-alive del backend en Render
setInterval(function() {
  axios.get(BACKEND_URL + '/health').catch(function() {});
}, 14 * 60 * 1000);

app.listen(PORT, function() { console.log('[ETHV] Agente listo en puerto', PORT); });
