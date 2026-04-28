// LikeTalent Backend Server
require('dotenv').config();

// Evitar que errores no capturados maten el proceso
process.on('uncaughtException',  (e) => console.error('[UNCAUGHT EXCEPTION]', e.message, e.stack));
process.on('unhandledRejection', (e) => console.error('[UNHANDLED REJECTION]', e?.message || e));
const express = require('express');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { callAI, callAIMessages, parseJSON } = require('./ai.cjs');

// ── OAuth config ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const LINKEDIN_CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID     || '';
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || '';
const GITHUB_CLIENT_ID     = process.env.GITHUB_CLIENT_ID     || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:3003';

// In-memory OAuth session store  { token → { name, email, picture, provider } }
const oauthSessions = new Map();
// In-memory OAuth state store (CSRF protection) { state → timestamp }
const oauthStates = new Map();
// Purge OAuth states older than 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, ts] of oauthStates) if (ts < cutoff) oauthStates.delete(k);
}, 5 * 60 * 1000);

const app = express();
const PORT = process.env.PORT || 3003;

// Auto-detecta la URL base pública en el primer request (funciona en cualquier hosting)
let _detectedBaseUrl = null;
function getBaseUrl() {
  return _detectedBaseUrl || BACKEND_URL;
}
app.use((req, res, next) => {
  if (!_detectedBaseUrl) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    _detectedBaseUrl = `${proto}://${req.headers.host}`;
  }
  next();
});

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://192.168.56.1:3000',
  ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(',').map(o => o.trim()) : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, same-origin)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin not allowed — ${origin}`));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-token'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
app.use('/api/analyze-cv', apiLimiter);
app.use('/api/improve-cv', apiLimiter);
app.use('/api/tailor-cv', apiLimiter);
app.use('/api/linkedin-scrape', apiLimiter);
app.use('/auth/google', authLimiter);
app.use('/auth/linkedin', authLimiter);
app.use('/auth/github', authLimiter);

// ============================================
// SWAGGER
// ============================================
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LikeTalent API',
      version: '1.0.0',
      description: 'API de análisis de talento Web3 — CV, LinkedIn y certificación on-chain.',
    },
    servers: [
      { url: 'https://liketalent.onrender.com', description: 'Producción' },
      { url: 'http://localhost:3003', description: 'Local' },
    ],
  },
  apis: [],
});

swaggerSpec.paths = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Healthcheck',
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, timestamp: { type: 'string' } } } } } } },
    },
  },
  '/api/analyze-cv': {
    post: {
      tags: ['CV'],
      summary: 'Analizar CV',
      description: 'Recibe archivo en base64, extrae texto y analiza con OpenClaw AI. Soporta PDF, DOCX, TXT, MD.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['file', 'filename'],
              properties: {
                file: { type: 'string', description: 'Archivo en base64' },
                filename: { type: 'string', example: 'cv.pdf' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Análisis completo del CV',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  location: { type: 'string' },
                  linkedin: { type: 'string' },
                  github: { type: 'string' },
                  skills: { type: 'array', items: { type: 'string' } },
                  experience_years: { type: 'integer' },
                  score: { type: 'integer', description: '0-100' },
                  ats_score: { type: 'integer', description: '0-100' },
                  level: { type: 'string', enum: ['Entry-Level', 'Junior', 'Mid-Level', 'Senior'] },
                  web3_relevance: { type: 'string', enum: ['high', 'medium', 'low'] },
                  dimensions: { type: 'object', properties: { ats: { type: 'integer' }, enfoque: { type: 'integer' }, impacto: { type: 'integer' }, claridad: { type: 'integer' }, contacto: { type: 'integer' }, legibilidad: { type: 'integer' } } },
                  suggested_roles: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, match_percentage: { type: 'integer' } } } },
                  strengths: { type: 'array', items: { type: 'string' } },
                  improvements: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        400: { description: 'No se proporcionó archivo' },
        500: { description: 'Error del servidor' },
      },
    },
  },
  '/api/linkedin-scrape': {
    post: {
      tags: ['LinkedIn'],
      summary: 'Scraping de perfil LinkedIn',
      description: 'Obtiene el perfil vía Jina AI y extrae skills y relevancia Web3.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['url'], properties: { url: { type: 'string', example: 'https://linkedin.com/in/usuario' } } },
          },
        },
      },
      responses: {
        200: { description: 'Perfil scrapeado con skills y web3_relevance' },
        400: { description: 'URL inválida' },
      },
    },
  },
  '/api/analyze-profile': {
    post: {
      tags: ['LinkedIn'],
      summary: 'Análisis de perfil con IA',
      description: 'Analiza texto de un perfil con OpenClaw AI.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['content'], properties: { content: { type: 'string', description: 'Texto crudo del perfil' } } },
          },
        },
      },
      responses: {
        200: { description: 'JSON con skills, experiencia, educación y web3_relevance' },
        400: { description: 'Contenido demasiado corto' },
      },
    },
  },
  '/webhook': {
    post: {
      tags: ['SuperDapp'],
      summary: 'SuperDapp Agent Webhook',
      description: 'Recibe mensajes de SuperDapp y los procesa con el agente LikeTalent. El agente usa tool calling (Groq) para analizar CVs, generar quizzes, emitir certificados en blockchain y más. Requiere SUPERDAPP_TOKEN y GROQ_API_KEY en .env.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                roomId:     { type: 'string', description: 'ID del room/chat' },
                chatId:     { type: 'string', description: 'ID del chat directo' },
                isBot:      { type: 'boolean', description: 'Si el mensaje es de un bot (se ignora)' },
                __typename: { type: 'string', example: 'ChannelMessage', description: 'Tipo de mensaje' },
                body:       { type: 'string', description: 'Payload codificado del mensaje' },
                challenge:  { type: 'string', description: 'Challenge de verificación de SuperDapp' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'OK — el agente procesa el mensaje de forma asíncrona' },
      },
    },
  },
  '/api/download': {
    post: {
      tags: ['Descargas'],
      summary: 'Descargar CV u certificado',
      description: 'Descarga un archivo (CV .docx o certificado .pdf) usando el código recibido por chat/bot. El DNI del usuario es la contraseña si el archivo está protegido.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: {
                code: { type: 'string', example: 'A3F9K2BM', description: 'Código de 8 caracteres recibido por el bot/chat' },
                dni: { type: 'string', example: '12345678', description: 'DNI/cédula del usuario (requerido si el archivo está protegido)' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Archivo descargado (.docx o .pdf)' },
        401: { description: 'DNI requerido' },
        403: { description: 'DNI incorrecto' },
        404: { description: 'Código no encontrado' },
        410: { description: 'Código expirado' },
      },
    },
  },
  '/api/download-info/{code}': {
    get: {
      tags: ['Descargas'],
      summary: 'Info del archivo por código',
      description: 'Retorna tipo, nombre y si requiere DNI, sin descargar el archivo.',
      parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Metadata del archivo' }, 404: { description: 'Código no encontrado' } },
    },
  },
  '/v1/chat/completions': {
    post: {
      tags: ['AI'],
      summary: 'Proxy a OpenClaw AI',
      description: 'Pasa el request a OpenClaw (MiniMax-M2.5). Formato compatible con OpenAI.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['model', 'messages'],
              properties: {
                model: { type: 'string', example: 'MiniMax-M2.5' },
                messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string', enum: ['user', 'assistant', 'system'] }, content: { type: 'string' } } } },
                max_tokens: { type: 'integer', example: 2000 },
                temperature: { type: 'number', example: 0.3 },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Respuesta de OpenClaw AI' } },
    },
  },
};

app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'LikeTalent API Docs',
  customCss: '.swagger-ui .topbar { background-color: #0f172a; }',
}));
app.get('/swagger.json', (req, res) => res.json(swaggerSpec));

const JINA_URL = process.env.JINA_URL || 'https://r.jina.ai/';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

app.use((req, res, next) => {
  console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + req.path);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'liketalent-backend' });
});

// ============================================
// SCORING FUNCTIONS
// ============================================

function calculateOverallScore(data) {
  let score = 0;
  if (data.name) score += 3;
  if (data.email) score += 3;
  if (data.phone) score += 2;
  if (data.location) score += 2;
  if (data.linkedin) score += 3;
  if (data.github || data.portfolio) score += 2;
  if (data.summary && data.summary.length > 50) score += 10;
  if (data.experience_years) {
    if (data.experience_years >= 1) score += 5;
    if (data.experience_years >= 3) score += 5;
    if (data.experience_years >= 5) score += 5;
    if (data.experience_years >= 10) score += 5;
  }
  if (data.current_position) score += 10;
  if (data.skills) {
    if (data.skills.length >= 3) score += 5;
    if (data.skills.length >= 5) score += 5;
    if (data.skills.length >= 10) score += 5;
    if (data.skills.length >= 15) score += 5;
  }
  if (data.education && data.education.length > 0) score += 10;
  if (data.certifications && data.certifications.length > 0) score += 5;
  return Math.min(100, score);
}

function calculateATSScore(data) {
  let score = 40;
  if (data.name && data.email) score += 8;
  if (data.summary && data.summary.length > 30) score += 8;
  if (data.experience_years && data.experience_years > 0) score += 10;
  if (data.skills && data.skills.length > 0) score += 12;
  if (data.education && data.education.length > 0) score += 8;
  if (!data.name) score -= 10;
  if (!data.email) score -= 10;
  if (!data.skills || data.skills.length === 0) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function calculateDimensions(data) {
  const summary = data.summary || '';
  const hasContact = data.name && data.email;
  const ats = calculateATSScore(data);

  let enfoque = 50;
  if (data.current_position) enfoque += 15;
  if (summary.length > 30) enfoque += 15;
  if (data.experience_years >= 3) enfoque += 10;
  if (data.experience_years >= 5) enfoque += 10;

  let impacto = 40;
  const hasImpactWords = ['achieved', 'managed', 'increased', 'reduced', 'led'].some(w => summary.toLowerCase().includes(w));
  if (hasImpactWords) impacto += 20;
  if (data.certifications && data.certifications.length > 0) impacto += 15;
  if ((data.skills || []).length >= 5) impacto += 15;

  let claridad = 60;
  if (summary.length > 20 && summary.length < 300) claridad += 20;
  if (hasContact) claridad += 10;
  if (data.current_position) claridad += 10;

  let contacto = 20;
  if (data.name) contacto += 15;
  if (data.email) contacto += 15;
  if (data.phone) contacto += 15;
  if (data.location) contacto += 10;
  if (data.linkedin) contacto += 10;
  if (data.github || data.portfolio) contacto += 15;

  let legibilidad = 70;
  if (summary.length > 20 && summary.length < 500) legibilidad += 15;
  if (data.education && data.education.length > 0) legibilidad += 10;
  if (data.languages && data.languages.length > 0) legibilidad += 5;

  return {
    ats: Math.min(100, ats),
    enfoque: Math.min(100, enfoque),
    impacto: Math.min(100, impacto),
    claridad: Math.min(100, claridad),
    contacto: Math.min(100, contacto),
    legibilidad: Math.min(100, legibilidad)
  };
}

function suggestRoles(data) {
  const skills = (data.skills || []).map(s => s.toLowerCase());
  const position = (data.current_position || '').toLowerCase();
  const summary = (data.summary || '').toLowerCase();

  const roleTemplates = [
    { title: 'Blockchain Developer', keywords: ['solidity', 'web3', 'ethereum', 'defi', 'smart contract', 'nft'] },
    { title: 'Frontend Developer', keywords: ['react', 'javascript', 'typescript', 'css', 'html', 'vue', 'angular'] },
    { title: 'Backend Developer', keywords: ['nodejs', 'python', 'api', 'database', 'sql', 'aws', 'docker'] },
    { title: 'Full Stack Developer', keywords: ['react', 'nodejs', 'typescript', 'javascript', 'full stack'] },
    { title: 'Data Analyst', keywords: ['python', 'data', 'analytics', 'visualization', 'sql', 'tableau'] },
    { title: 'Product Manager', keywords: ['product', 'agile', 'scrum', 'roadmap', 'stakeholder'] },
    { title: 'DevOps Engineer', keywords: ['devops', 'aws', 'docker', 'kubernetes', 'ci/cd', 'terraform'] }
  ];

  return roleTemplates
    .map(role => {
      const matched = role.keywords.filter(k => skills.includes(k) || position.includes(k) || summary.includes(k));
      return {
        title: role.title,
        match_percentage: Math.round((matched.length / role.keywords.length) * 100),
        missing_skills: role.keywords.filter(k => !matched.includes(k)).slice(0, 3)
      };
    })
    .filter(r => r.match_percentage > 0)
    .sort((a, b) => b.match_percentage - a.match_percentage)
    .slice(0, 3);
}

function calculateStats(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const commonTypos = ['teh', 'thier', 'recieve', 'occured', 'seperate'];
  return {
    word_count: words.length,
    reading_time_minutes: Math.max(1, Math.ceil(words.length / 200)),
    spelling_score: commonTypos.some(t => text.toLowerCase().includes(t)) ? 85 : 100
  };
}

function generateStrengths(data) {
  const s = [];
  if (data.skills && data.skills.length >= 5) s.push(`Strong skill set with ${data.skills.length} identified skills`);
  if (data.certifications && data.certifications.length > 0) s.push(`${data.certifications.length} certifications documented`);
  if (data.experience_years >= 3) s.push(`Solid experience with ${data.experience_years} years in the field`);
  if (data.linkedin) s.push('LinkedIn profile linked');
  if (data.github) s.push('GitHub portfolio available');
  if (data.summary && data.summary.length > 100) s.push('Comprehensive professional summary');
  if (data.education && data.education.length > 0) s.push('Educational background documented');
  return s;
}

function generateImprovements(data) {
  const i = [];
  if (!data.name) i.push('Add your full name');
  if (!data.email) i.push('Include a contact email');
  if (!data.phone) i.push('Add phone number');
  if (!data.linkedin) i.push('Include LinkedIn profile URL');
  if (!data.github && !data.portfolio) i.push('Add portfolio or GitHub link');
  if (!data.summary) i.push('Write a professional summary');
  if (!data.certifications || data.certifications.length === 0) i.push('Consider adding relevant certifications');
  if (data.skills && data.skills.length < 5) i.push('Add more relevant skills');
  return i;
}

function estimateLevel(data) {
  const exp = data.experience_years || 0;
  const skills = data.skills ? data.skills.length : 0;
  if (exp >= 8 && skills >= 10) return 'Senior';
  if (exp >= 5 && skills >= 7) return 'Mid-Level';
  if (exp >= 2 && skills >= 4) return 'Junior';
  return 'Entry-Level';
}

// ============================================
// ENHANCV-INSPIRED QUALITY ANALYSIS
// ============================================

const CLICHES = [
  'results-driven', 'results driven', 'passionate about', 'team player',
  'hard worker', 'hard-working', 'go-getter', 'synergy', 'synergies',
  'dynamic', 'proactive', 'self-starter', 'think outside the box',
  'leverage', 'innovative', 'cutting-edge', 'cutting edge', 'best practices',
  'detail-oriented', 'detail oriented', 'fast learner', 'highly motivated',
  'proven track record', 'strong work ethic', 'excellent communication',
  'communication skills', 'interpersonal skills', 'multitasker',
  'thought leader', 'visionary', 'guru', 'ninja', 'rockstar', 'wizard',
  'game changer', 'game-changer', 'passionate', 'responsible for',
  'duties included', 'low-hanging fruit', 'move the needle', 'deep dive',
  'value add', 'bandwidth', 'circle back'
];

const PASSIVE_PHRASES = [
  'was responsible for', 'were responsible for', 'was involved in',
  'duties included', 'responsibilities included', 'helped with',
  'assisted with', 'was part of', 'were part of', 'participated in',
  'was assigned', 'was tasked with', 'was asked to'
];

const IMPACT_VERBS = [
  'led', 'launched', 'built', 'created', 'designed', 'implemented',
  'developed', 'managed', 'directed', 'spearheaded', 'drove', 'achieved',
  'delivered', 'increased', 'reduced', 'improved', 'generated', 'saved',
  'optimized', 'automated', 'transformed', 'negotiated', 'established',
  'founded', 'grew', 'expanded', 'streamlined', 'accelerated', 'exceeded',
  'surpassed', 'deployed', 'architected', 'migrated', 'scaled'
];

function analyzeClichesAndBuzzwords(text) {
  const lower = text.toLowerCase();
  const found = CLICHES.filter(c => lower.includes(c));
  return {
    found,
    count: found.length,
    score: Math.max(0, 100 - found.length * 12),
  };
}

function analyzeVoice(text) {
  const lower = text.toLowerCase();
  const passiveFound = PASSIVE_PHRASES.filter(p => lower.includes(p));
  const impactFound = IMPACT_VERBS.filter(v => new RegExp(`\\b${v}\\b`, 'i').test(lower));
  const score = Math.max(0, Math.min(100, 50 + impactFound.length * 4 - passiveFound.length * 10));
  return {
    passive_phrases: passiveFound,
    impact_verbs: impactFound,
    score,
  };
}

function analyzeQuantification(text) {
  const metricPatterns = [
    /\d+\s*%/g,
    /\$\s*[\d,.]+/g,
    /\d+\s*[kKmMbB]\b/g,
    /\d+x\b/g,
    /\d+\+?\s*(users|clients|customers|employees|members|projects|apps|teams)/gi,
  ];
  const metrics = [];
  for (const pattern of metricPatterns) {
    const found = text.match(pattern);
    if (found) metrics.push(...found);
  }
  const uniqueMetrics = [...new Set(metrics)].slice(0, 10);

  const sentences = text.split(/[\n•·▸\-]/).map(s => s.trim()).filter(s => s.length > 10);
  const achievementSentences = sentences.filter(s => {
    const sl = s.toLowerCase();
    return IMPACT_VERBS.some(v => new RegExp(`\\b${v}\\b`).test(sl));
  });
  const quantified = achievementSentences.filter(s => /\d/.test(s));
  const rate = achievementSentences.length > 0
    ? Math.round((quantified.length / achievementSentences.length) * 100)
    : 0;

  return {
    metrics_found: uniqueMetrics,
    achievement_sentences: achievementSentences.length,
    quantified_achievements: quantified.length,
    quantification_rate: rate,
    score: Math.min(100, 40 + rate * 0.5 + Math.min(uniqueMetrics.length, 8) * 4),
  };
}

function analyzeKeywordDensity(data, text) {
  const keywordSets = {
    leadership:  ['led', 'managed', 'directed', 'supervised', 'mentored', 'coordinated'],
    technical:   ['implemented', 'developed', 'deployed', 'architected', 'automated', 'optimized'],
    impact:      ['increased', 'reduced', 'improved', 'generated', 'saved', 'delivered'],
    agile:       ['agile', 'scrum', 'sprint', 'kanban', 'jira', 'roadmap'],
    cloud:       ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform'],
    web3:        ['blockchain', 'solidity', 'ethereum', 'web3', 'defi', 'smart contract'],
  };
  const lower = text.toLowerCase();
  const result = {};
  let totalFound = 0, totalPossible = 0;
  for (const [cat, words] of Object.entries(keywordSets)) {
    const found = words.filter(w => new RegExp(`\\b${w}\\b`).test(lower));
    result[cat] = { found, count: found.length, total: words.length };
    totalFound += found.length;
    totalPossible += words.length;
  }
  return {
    by_category: result,
    score: Math.min(100, 20 + Math.round((totalFound / totalPossible) * 80)),
  };
}

function analyzeQuality(data, text) {
  const cliches = analyzeClichesAndBuzzwords(text);
  const voice = analyzeVoice(text);
  const quantification = analyzeQuantification(text);
  const keywords = analyzeKeywordDensity(data, text);
  // Overall quality score: weighted average
  const overall = Math.round(
    cliches.score * 0.20 +
    voice.score   * 0.30 +
    quantification.score * 0.30 +
    keywords.score * 0.20
  );
  return { cliches, voice, quantification, keywords, overall };
}

// ============================================
// SUPABASE — helpers
// ============================================

function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Prefer': 'return=minimal',
  };
}

async function sbInsert(table, payload) {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY === 'your_supabase_key_here') {
    return { success: false, reason: 'not configured' };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[Supabase] ${table} error:`, err);
      return { success: false, error: err };
    }
    console.log(`[Supabase] ${table} guardado OK`);
    return { success: true };
  } catch (err) {
    console.error(`[Supabase] ${table} exception:`, err.message);
    return { success: false, error: err.message };
  }
}

async function sbFetch(table, filters) {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY === 'your_supabase_key_here') return null;
  const qs = Object.entries(filters).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}&limit=1`, {
      headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data[0] || null) : null;
  } catch (err) {
    console.error(`[Supabase] ${table} fetch error:`, err.message);
    return null;
  }
}

// ── Download helpers ──────────────────────────────────────────────────────────

function generateDownloadCode() {
  // 8 chars sin letras ambiguas (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[crypto.randomInt(chars.length)]).join('');
}

function hashDNI(dni) {
  return crypto.createHash('sha256').update(String(dni).trim().toUpperCase()).digest('hex');
}

async function saveDownload({ type, fileBase64, filename, dni }) {
  const code = generateDownloadCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 días
  const result = await sbInsert('downloads', {
    code,
    type,
    file_base64: fileBase64,
    filename: filename || (type === 'cv' ? 'CV_ATS_Optimizado.docx' : 'Certificado_LikeTalent.pdf'),
    dni_hash: dni ? hashDNI(dni) : null,
    expires_at: expiresAt,
  });
  if (result.success) {
    console.log(`[Download] Guardado en Supabase | code: ${code} | type: ${type} | dni_protegido: ${!!dni}`);
  } else {
    console.warn('[Download] No se pudo guardar en Supabase (¿tabla downloads creada?):', result.error || result.reason);
  }
  return code;
}

// Guardar análisis de CV
async function saveToSupabase(data) {
  return sbInsert('cv_analyses', {
    name:             data.name             || null,
    email:            data.email            || null,
    phone:            data.phone            || null,
    location:         data.location         || null,
    linkedin:         data.linkedin         || null,
    github:           data.github           || null,
    portfolio:        data.portfolio        || null,
    current_position: data.current_position || null,
    company:          data.company          || null,
    experience_years: data.experience_years || 0,
    overall_score:    data.score            || 0,
    ats_score:        data.ats_score        || 0,
    estimated_level:  data.level            || null,
    summary:          data.summary          || null,
    web3_relevance:   data.web3_relevance   || 'low',
    skills:           data.skills           || null,
    certifications:   data.certifications   || null,
    education:        data.education        || null,
    languages:        data.languages        || null,
    raw_response:     data,
  });
}

// Guardar sesión OAuth
async function saveAuthSession({ provider, email, name, picture, identifier }) {
  return sbInsert('auth_sessions', { provider, email: email || null, name: name || null, picture: picture || null, identifier: identifier || null });
}

// Guardar mejora/generación de CV
async function saveCVImprovement({ mode, candidateName, result, jobDescription }) {
  return sbInsert('cv_improvements', {
    mode,
    candidate_name:       candidateName || null,
    ats_score:            result.ats_score   || result.match_score || 0,
    match_score:          result.match_score || null,
    job_description:      jobDescription    || null,
    professional_summary: result.professional_summary || null,
    contact:              result.contact    || null,
    experience:           result.experience || null,
    skills:               result.skills     || null,
    education:            result.education  || null,
    tips:                 result.tips       || null,
  });
}

// ============================================
// OCR / TEXT EXTRACTION
// ============================================

async function extractTextFromFile(fileBuffer, filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();

  // Archivos de texto plano
  if (ext === 'txt' || ext === 'md') {
    return fileBuffer.toString('utf-8');
  }

  // DOCX con mammoth
  if (ext === 'docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      if (result.value && result.value.trim().length > 50) {
        console.log('[OCR] Texto extraído con mammoth, chars:', result.value.length);
        return result.value;
      }
    } catch (e) {
      console.log('[OCR] mammoth falló:', e.message);
    }
  }

  // PDF: extraer texto con pdf-parse (CJS nativo, sin worker threads)
  if (ext === 'pdf') {
    try {
      const { PDFParse, VerbosityLevel } = require('pdf-parse');
      const parser = new PDFParse({ data: fileBuffer, verbosity: VerbosityLevel ? VerbosityLevel.ERRORS : 0 });
      await parser.load();
      const result = await parser.getText();
      const text = result.text || '';
      if (text.trim().length > 20) {
        console.log('[OCR] pdf-parse extrajo', text.length, 'chars,', result.total, 'páginas');
        return text;
      }
    } catch (e) {
      console.log('[OCR] pdf-parse falló:', e.message);
    }

    console.log('[OCR] No se pudo extraer texto del PDF');
    return '';
  }

  // Para PDF/DOCX sin texto extraíble — no usar Tesseract (descarga archivos y reinicia --watch)
  // Solo retornar vacío; el análisis continuará con lo que tenga
  console.log('[OCR] Formato no soportado para OCR:', ext);
  return '';
}

// ============================================
// EXTRACCIÓN POR REGEX (fallback sin IA)
// ============================================

function extractContactByRegex(text) {
  const result = {};

  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0];

  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/);
  if (phoneMatch) result.phone = phoneMatch[0].trim();

  const linkedinMatch = text.match(/(?:linkedin\.com\/in\/)([\w-]+)/i);
  if (linkedinMatch) result.linkedin = 'https://linkedin.com/in/' + linkedinMatch[1];

  const githubMatch = text.match(/(?:github\.com\/)([\w-]+)/i);
  if (githubMatch) result.github = 'https://github.com/' + githubMatch[1];

  const portfolioMatch = text.match(/https?:\/\/(?!linkedin|github)[\w.-]+\.[a-zA-Z]{2,}(?:\/[\w./-]*)?/i);
  if (portfolioMatch) result.portfolio = portfolioMatch[0];

  // Nombre: primera línea que parezca nombre (Title Case o ALL CAPS, 2-4 palabras, solo letras)
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (const line of lines.slice(0, 15)) {
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-ZÁÉÍÓÚÜÑ]/.test(line) && !/[@:|\/\d]/.test(line)) {
      const allCaps = words.every(w => w === w.toUpperCase() && w.length >= 2);
      const titleCase = words.every(w => /^[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]+$/.test(w));
      if (allCaps || titleCase) {
        result.name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        break;
      }
    }
  }

  return result;
}

// ============================================
// ENDPOINT PRINCIPAL: ANALIZAR CV
// ============================================

app.post('/api/analyze-cv', async (req, res) => {
  try {
    const { file, filename } = req.body;

    if (!file || !filename) return res.status(400).json({ error: 'No file provided' });

    // Validate extension
    const allowedExt = ['.pdf', '.docx', '.txt', '.md'];
    const ext = require('path').extname(filename).toLowerCase();
    if (!allowedExt.includes(ext)) return res.status(400).json({ error: 'Unsupported file type' });

    // Validate size (base64 is ~4/3 of binary — 7MB base64 ≈ 5MB file)
    if (file.length > 7 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 5MB)' });

    const fileBuffer = Buffer.from(file, 'base64');

    // 1. Extraer texto
    console.log('[CV] Extrayendo texto de:', filename);
    const extractedText = await extractTextFromFile(fileBuffer, filename);
    console.log('[CV] Texto extraído:', extractedText.length, 'chars');

    // 2. Construir prompt y llamar a OpenClaw
    const prompt = `Eres LikeTalent, agente de validación de talento Web3. Analiza este CV y extrae SOLO un JSON con estos campos exactos:
{
  "name": "",
  "email": "",
  "phone": "",
  "location": "",
  "linkedin": "",
  "github": "",
  "portfolio": "",
  "current_position": "",
  "company": "",
  "experience_years": 0,
  "skills": [],
  "certifications": [],
  "languages": [],
  "education": [],
  "summary": "",
  "web3_relevance": "low"
}

Texto del CV:
${extractedText.substring(0, 6000)}

Responde SOLO el JSON, sin texto adicional.`;

    let cvData = { skills: [], experience_years: 0, web3_relevance: 'low' };

    try {
      console.log('[CV] Sending to AI...');
      const raw = await callAI(prompt, { maxTokens: 2048, prefill: '{' });
      const parsed = parseJSON(raw);
      if (parsed) {
        cvData = parsed;
        console.log('[CV] JSON extracted, skills:', cvData.skills?.length);
      } else {
        console.log('[CV] No JSON found. Preview:', raw.slice(0, 200));
      }
    } catch (e) {
      console.error('[CV] AI error:', e.message);
    }

    // Fallback regex: rellenar campos de contacto que la IA no extrajo
    const regexData = extractContactByRegex(extractedText);
    if (!cvData.email && regexData.email) cvData.email = regexData.email;
    if (!cvData.phone && regexData.phone) cvData.phone = regexData.phone;
    if (!cvData.linkedin && regexData.linkedin) cvData.linkedin = regexData.linkedin;
    if (!cvData.github && regexData.github) cvData.github = regexData.github;
    if (!cvData.portfolio && regexData.portfolio) cvData.portfolio = regexData.portfolio;
    if (!cvData.name && regexData.name) cvData.name = regexData.name;
    console.log('[CV] Contacto extraído:', { name: cvData.name, email: cvData.email, phone: cvData.phone });

    // 3. Calcular scores y enriquecer resultado
    const fullResult = {
      ...cvData,
      score: calculateOverallScore(cvData),
      ats_score: calculateATSScore(cvData),
      level: estimateLevel(cvData),
      dimensions: calculateDimensions(cvData),
      suggested_roles: suggestRoles(cvData),
      strengths: generateStrengths(cvData),
      improvements: generateImprovements(cvData),
      stats: calculateStats(extractedText),
      quality: analyzeQuality(cvData, extractedText),
      analyzed_at: new Date().toISOString()
    };

    // 4. Guardar en Supabase (sin bloquear la respuesta)
    saveToSupabase(fullResult).then(r => console.log('[Supabase] Resultado:', JSON.stringify(r))).catch(e => console.error('[Supabase] Error async:', e.message));

    // 5. Responder al frontend
    res.json(fullResult);

  } catch (error) {
    console.error('[CV] Error general:', error.message);
    res.status(500).json({ error: 'Error processing CV' });
  }
});

// ============================================
// PROXY MINIMAX (compatibilidad OpenAI → Anthropic)
// ============================================

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, max_tokens } = req.body;
    const lastUser = messages?.findLast?.(m => m.role === 'user')?.content || '';
    const text = await callAI(lastUser, { maxTokens: max_tokens || 2000 });
    res.json({ choices: [{ message: { role: 'assistant', content: text } }] });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// LINKEDIN
// ============================================

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function scrapeWithJina(url) {
  try {
    const text = await httpGet(JINA_URL + encodeURIComponent(url));
    return { success: true, text, url };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function extractLinkedInData(text) {
  const data = { raw: text.substring(0, 5000) };

  const namePatterns = [/^([A-Z][a-z]+ [A-Z][a-z]+)/m, /<h1[^>]*>([^<]+)<\/h1>/];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match) { data.name = match[1] || match[0]; break; }
  }

  const skillKeywords = ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'React', 'Node.js', 'AWS', 'Docker', 'Kubernetes', 'SQL', 'PostgreSQL', 'MongoDB', 'Web3', 'Blockchain', 'Ethereum', 'Solidity', 'DeFi'];
  const lowerText = text.toLowerCase();
  data.skills = [...new Set(skillKeywords.filter(s => lowerText.includes(s.toLowerCase())))];

  const web3Keywords = ['web3', 'blockchain', 'ethereum', 'solidity', 'defi', 'crypto', 'nft', 'dao', 'smart contract'];
  const web3Count = web3Keywords.filter(kw => lowerText.includes(kw)).length;
  data.web3_relevance = web3Count > 3 ? 'high' : web3Count > 0 ? 'medium' : 'low';
  data.experience_years = Math.max(1, Math.min(20, Math.floor(text.length / 3000)));

  return data;
}

app.post('/api/linkedin-scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.includes('linkedin.com')) {
      return res.status(400).json({ error: 'Invalid LinkedIn URL' });
    }
    console.log('Scraping:', url);
    const result = await scrapeWithJina(url);
    if (result.success) {
      const parsed = extractLinkedInData(result.text);
      return res.json({ success: true, method: 'jina-ai', url, ...parsed, scrapedAt: new Date().toISOString() });
    }
    res.json({ success: false, error: result.error });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/analyze-profile', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: 'Profile content too short' });
    }

    const prompt = 'Eres LikeTalent. Analiza este perfil y devuelve JSON con: skills (array), experience_years (number), education (array), certifications (array), summary (string), headline (string), location (string), web3_relevance (high/medium/low). Perfil: ' + content.slice(0, 10000) + '. Responde SOLO JSON.';

    try {
      const raw = await callAI(prompt, { maxTokens: 2048, prefill: '{' });
      const parsed = parseJSON(raw);
      if (parsed) return res.json({ success: true, ...parsed });
      return res.json({ success: true, summary: raw.slice(0, 500) });
    } catch (e) {
      return res.status(500).json({ error: 'AI failed', details: e.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// GENERATE QUIZ WITH AI
// ============================================

// ── Quiz sessions ─────────────────────────────────────────────────────────────
// quizId → { skill, level, lang, total, messages[], questions[], pending, nextIndex, expiresAt }
const quizSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of quizSessions) if (s.expiresAt < now) quizSessions.delete(id);
}, 10 * 60 * 1000);

const QUIZ_TOTAL = 2;
const QUIZ_TYPES_WEB = ['multiple_choice', 'code_trace', 'multiple_choice', 'multiple_choice', 'code_trace'];
const QUIZ_TYPES_BOT = ['multiple_choice', 'multiple_choice', 'multiple_choice', 'multiple_choice', 'multiple_choice'];

const QUIZ_SYSTEM = `You are LikeTalent, a technical quiz generator. Each response must be ONLY a valid JSON object — no markdown, no prose, no extra text outside the JSON. Never repeat a question theme already used in this session.`;

function sanitizeQuestion(q) {
  return { type: q.type, question: q.question, code: q.code || null, options: q.options || null };
}

async function generateOneQuestion(session, n, attempt = 1) {
  const { skill, level, lang, total } = session;
  const quizTypes = session.mode === 'bot' ? QUIZ_TYPES_BOT : QUIZ_TYPES_WEB;
  const type = quizTypes[(n - 1) % quizTypes.length];
  const langNote = lang === 'es' ? 'Escribe TODO en español.' : 'Write everything in English.';

  const usedTypes = session.questions.map(q => q.type).join(', ') || 'none';

  const difficultyNote = level === 'junior'
    ? 'VERY EASY — basic definitions, beginner concepts only. Someone with 1 month of study should answer correctly.'
    : level === 'mid'
    ? 'MEDIUM — practical knowledge, real-world scenarios.'
    : 'HARD — advanced, edge cases, deep understanding required.';

  const botRules = session.mode === 'bot'
    ? '- ONLY text-based questions — NO code snippets, NO "according to this code" references\n- Conceptual, definition-based, or plain scenario questions only'
    : '- For code_trace: include a real code snippet in the "code" field\n- For multiple_choice: conceptual or scenario-based';

  const userContent = n === 1
    ? `Generate question ${n} of ${total} to validate proficiency in "${skill}" at ${level} level. ${langNote}

Difficulty: ${difficultyNote}
Use type: ${type}. Rules:
${botRules}
- For junior: extremely simple, basic definitions only
- 4 options (A, B, C, D), exactly one correct

Return ONLY this JSON:
{"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}
{"type":"code_trace","question":"...","code":"// snippet","options":["A","B","C","D"],"correct":0,"explanation":"..."}`
    : `Generate question ${n} of ${total} for "${skill}" at ${level} level. ${langNote}
Difficulty: ${difficultyNote}
Use type: ${type}. ${session.mode === 'bot' ? 'Text-only, no code snippets.' : ''} Types used so far: ${usedTypes}. Avoid repeating themes.
Return ONLY a valid JSON object with fields: type, question, options (array of 4), correct (index 0-3), explanation.`;

  // Keep only last 2 messages (1 Q&A) to avoid context overflow on long sessions
  const recentMessages = session.messages.slice(-2);
  const newMessages = [...recentMessages, { role: 'user', content: userContent }];

  const t0 = Date.now();
  const raw = await callAIMessages(newMessages, { maxTokens: 1500, prefill: '{', system: QUIZ_SYSTEM });
  console.log(`[Quiz] Q${n} AI: ${Date.now() - t0}ms | len=${raw.length}`);

  const question = parseJSON(raw);
  if (!question || !question.type || !question.question) {
    console.error(`[Quiz] Q${n} parse failed | raw:`, raw.slice(0, 300));
    if (attempt < 2) {
      console.log(`[Quiz] Q${n} retrying (attempt ${attempt + 1})...`);
      return generateOneQuestion(session, n, attempt + 1);
    }
    throw new Error(`Invalid question format for Q${n}`);
  }

  // Store only the last Q&A pair for context (keeps messages short)
  session.messages = [
    { role: 'user', content: userContent },
    { role: 'assistant', content: raw }
  ];
  session.questions.push(question);
  return question;
}

app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { skill, level = 'mid', lang = 'en', mode = 'web' } = req.body;
    if (!skill) return res.status(400).json({ error: 'skill required' });

    const t0 = Date.now();
    const quizId = require('crypto').randomUUID();
    const session = {
      skill, level, lang, mode, total: QUIZ_TOTAL,
      messages: [], questions: [],
      pending: null, nextIndex: 2,
      expiresAt: Date.now() + 30 * 60 * 1000
    };
    quizSessions.set(quizId, session);
    console.log(`[Quiz] START quizId=${quizId} skill="${skill}" level=${level} lang=${lang}`);

    // Generate Q1 synchronously so we can respond immediately
    const q1 = await generateOneQuestion(session, 1);
    console.log(`[Quiz] Q1 ready in ${Date.now() - t0}ms — launching Q2 in background`);

    // Q2 starts in background while user reads Q1
    session.pending = generateOneQuestion(session, 2).catch(e => {
      console.error('[Quiz] Background Q2 error:', e.message);
    });

    res.json({ quizId, skill, level, lang, total: QUIZ_TOTAL, questionNumber: 1, question: sanitizeQuestion(q1) });

  } catch (error) {
    console.error('[Quiz] generate-quiz error:', error.message);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// Called by frontend when user clicks "Next"
app.post('/api/quiz-next', async (req, res) => {
  try {
    const { quizId } = req.body;
    if (!quizId) return res.status(400).json({ error: 'quizId required' });

    const session = quizSessions.get(quizId);
    if (!session) return res.status(404).json({ error: 'Quiz session not found or expired' });

    const n = session.nextIndex;
    if (n > session.total) return res.json({ done: true, total: session.total });

    const t0 = Date.now();
    console.log(`[Quiz] quiz-next: awaiting Q${n}...`);

    // Await the background-generated question
    if (session.pending) { await session.pending; session.pending = null; }

    const question = session.questions[n - 1];
    if (!question) return res.status(500).json({ error: `Q${n} generation failed` });

    console.log(`[Quiz] Q${n} served (waited ${Date.now() - t0}ms)`);

    // Pre-generate next question in background
    session.nextIndex = n + 1;
    if (n < session.total) {
      session.pending = generateOneQuestion(session, n + 1).catch(e => {
        console.error(`[Quiz] Background Q${n + 1} error:`, e.message);
      });
    }

    res.json({ quizId, questionNumber: n, total: session.total, question: sanitizeQuestion(question), done: false });

  } catch (error) {
    console.error('[Quiz] quiz-next error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Evaluate a single open answer with AI
async function evaluateOpenAnswer(question, modelAnswer, userAnswer, lang) {
  const prompt = `You are a strict technical evaluator. Evaluate this quiz answer.
Question: "${question}"
Expected answer covers: "${modelAnswer}"
Candidate's answer: "${userAnswer}"

Evaluate on: accuracy, completeness, practical understanding.
Ignore grammar/spelling. A passing score is 60+.
Respond ONLY with JSON: {"score": 75, "feedback": "one sentence feedback in ${lang === 'es' ? 'Spanish' : 'English'}"}`;

  try {
    const raw = await callAI(prompt, { maxTokens: 512, prefill: '{' });
    const parsed = parseJSON(raw);
    if (parsed) return { score: parsed.score || 0, feedback: parsed.feedback || '' };
  } catch (e) {
    console.error('[Quiz] Open eval error:', e.message);
  }
  return { score: 0, feedback: 'Could not evaluate answer' };
}

// Submit answers — backend validates (MC instantly, open questions via AI)
app.post('/api/submit-quiz', async (req, res) => {
  try {
    const { quizId, answers } = req.body;
    if (!quizId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'quizId and answers required' });
    }

    const session = quizSessions.get(quizId);
    if (!session) {
      return res.status(404).json({ error: 'Quiz session not found or expired' });
    }

    const { questions, skill, level, lang } = session;

    // Evaluate each question
    const results = await Promise.all(questions.map(async (q, i) => {
      const userAnswer = answers[i];

      if (q.type === 'open') {
        const { score, feedback } = await evaluateOpenAnswer(
          q.question, q.model_answer, userAnswer || '', lang
        );
        return {
          type: 'open',
          question: q.question,
          yourAnswer: userAnswer || '',
          isCorrect: score >= 60,
          openScore: score,
          feedback,
          explanation: q.explanation
        };
      }

      // multiple_choice or code_trace
      // Usuario puede responder con número 1-based ("1","2") o índice 0-based (0,1)
      const answerNum = parseInt(userAnswer);
      const answerIdx = !isNaN(answerNum) && answerNum >= 1 ? answerNum - 1 : answerNum;
      const isCorrect = answerIdx === q.correct || userAnswer === q.options?.[q.correct];
      return {
        type: q.type || 'multiple_choice',
        question: q.question,
        code: q.code || null,
        options: q.options,
        yourAnswer: userAnswer ?? -1,
        correct: q.correct,
        isCorrect,
        explanation: q.explanation
      };
    }));

    const correctCount = results.filter(r => r.isCorrect).length;
    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= 70;

    quizSessions.delete(quizId);
    console.log('[Quiz] Submit:', skill, '| score:', score, '| passed:', passed);

    res.json({ skill, level, lang, score, passed, correctCount, total: questions.length, results });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// CV IMPROVEMENT WITH AI
// ============================================

app.post('/api/improve-cv', async (req, res) => {
  try {
    const { cvData, lang = 'en' } = req.body;
    if (!cvData) return res.status(400).json({ error: 'cvData required' });

    const isEs = lang === 'es';
    const prompt = `You are a senior ATS-certified CV writer and career coach. ${isEs ? 'All text fields must be written in Spanish.' : 'All text fields must be written in English.'}

You will receive raw CV data and must produce a COMPLETE, ATS-optimized CV rewrite.

RAW CV DATA:
${JSON.stringify(cvData, null, 2)}

ATS RULES TO FOLLOW:
- Use standard section headings (Summary, Experience, Skills, Education, Certifications, Languages)
- Start every achievement bullet with a strong action verb (Led, Built, Reduced, Increased, Designed, Implemented...)
- Quantify results wherever possible (%, $, X times, team size, etc.)
- Remove vague phrases like "responsible for" or "helped with"
- Keep summary to 3-4 sentences max, value-proposition first
- Skills must be keyword-rich for recruiters and ATS scanners
- Group skills by category for readability

Return ONLY a valid JSON object with EXACTLY this structure:
{
  "ats_score": <number 0-100 representing how ATS-friendly the IMPROVED version is>,
  "ats_improvements": [<list of specific changes made to improve ATS score>],
  "contact": {
    "name": "${cvData.name || ''}",
    "title": "<improved professional title/headline>",
    "email": "${cvData.email || ''}",
    "phone": "${cvData.phone || ''}",
    "location": "${cvData.location || ''}",
    "linkedin": "${cvData.linkedin || ''}",
    "github": "${cvData.github || ''}"
  },
  "professional_summary": "<Rewritten 3-4 sentence summary. Start with a value proposition. Include years of experience, core skills, and key impact.>",
  "experience": [
    {
      "title": "<job title>",
      "company": "<company name>",
      "period": "<e.g. Jan 2022 – Present>",
      "location": "<city or Remote>",
      "achievements": [
        "<Action verb + what you did + measurable result>",
        "<Action verb + what you did + measurable result>"
      ]
    }
  ],
  "skills": {
    "${isEs ? 'Técnicas' : 'Technical'}": [<list of technical skills>],
    "${isEs ? 'Herramientas' : 'Tools & Platforms'}": [<list of tools, frameworks, platforms>],
    "${isEs ? 'Blandas' : 'Soft Skills'}": [<list of soft skills>]
  },
  "education": [
    {
      "degree": "<degree name>",
      "school": "<institution name>",
      "year": "<graduation year or period>",
      "details": "<optional: GPA, honors, relevant coursework>"
    }
  ],
  "certifications": [<list of certification strings, e.g. "AWS Certified Developer – Associate (2023)">],
  "languages": [<list of language strings, e.g. "Spanish (Native)", "English (Professional)">],
  "tips": [<3-5 specific, actionable tips to further improve this CV>],
  "missing_sections": [<sections that are missing and why they matter for this profile>]
}`;

    console.log('[CV Improve] Calling AI for:', cvData.name || 'unknown');
    const raw = await callAI(prompt, { maxTokens: 6000, prefill: '{' });
    const improved = parseJSON(raw);
    if (!improved) {
      console.error('[CV Improve] Parse failed. Preview:', raw.slice(0, 300));
      return res.status(500).json({ error: 'AI did not return valid response' });
    }

    console.log('[CV Improve] Done for:', cvData.name, '| ATS score:', improved.ats_score);
    saveCVImprovement({ mode: 'improve', candidateName: cvData.name, result: improved }).catch(() => {});
    res.json({ success: true, ...improved });

  } catch (error) {
    console.error('[CV Improve] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// DOWNLOAD CV AS WORD (.docx)
// ============================================

app.post('/api/download-cv-docx', async (req, res) => {
  try {
    const { cvData, improved } = req.body;
    if (!cvData && !improved) return res.status(400).json({ error: 'cvData required' });

    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel,
      AlignmentType, BorderStyle
    } = require('docx');

    // Use improved ATS structure if available, else raw cvData
    const imp = improved || {};
    const raw = cvData || {};

    const contact    = imp.contact || {};
    const name       = contact.name || raw.name || 'CV';
    const jobTitle   = contact.title || raw.current_position || '';
    const email      = contact.email || raw.email || '';
    const phone      = contact.phone || raw.phone || '';
    const location   = contact.location || raw.location || '';
    const linkedin   = contact.linkedin || raw.linkedin || '';
    const github     = contact.github || raw.github || '';
    const summary    = imp.professional_summary || raw.summary || '';
    const experience = imp.experience || [];
    const skillsCat  = imp.skills || null;
    const rawSkills  = raw.skills || [];
    const education  = imp.education || raw.education || [];
    const certs      = imp.certifications || raw.certifications || [];
    const langs      = imp.languages || raw.languages || [];

    const hr = () => new Paragraph({
      border: { bottom: { color: '1e3a5f', space: 1, style: BorderStyle.SINGLE, size: 4 } },
      spacing: { before: 100, after: 160 }
    });

    const sectionHeading = (text) => new Paragraph({
      children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 24, color: '1e3a5f', characterSpacing: 40 })],
      spacing: { before: 280, after: 60 }
    });

    const bullet = (text) => new Paragraph({
      bullet: { level: 0 },
      children: [new TextRun({ text: String(text), size: 20 })],
      spacing: { after: 40 }
    });

    const children = [
      // ── NAME ──
      new Paragraph({
        children: [new TextRun({ text: name, bold: true, size: 56, color: '111827' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 }
      }),

      // ── JOB TITLE ──
      ...(jobTitle ? [new Paragraph({
        children: [new TextRun({ text: jobTitle, size: 26, color: '4b5563', italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 }
      })] : []),

      // ── CONTACT LINE ──
      new Paragraph({
        children: [new TextRun({
          text: [email, phone, location, linkedin && `in: ${linkedin}`, github && `gh: ${github}`]
            .filter(Boolean).join('   |   '),
          size: 19, color: '6b7280'
        })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 }
      }),

      hr(),

      // ── PROFESSIONAL SUMMARY ──
      ...(summary ? [
        sectionHeading('Professional Summary'),
        hr(),
        new Paragraph({ children: [new TextRun({ text: summary, size: 21 })], spacing: { after: 200 } })
      ] : []),

      // ── EXPERIENCE ──
      ...(experience.length > 0 ? [
        sectionHeading('Experience'),
        hr(),
        ...experience.flatMap(exp => [
          new Paragraph({
            children: [
              new TextRun({ text: exp.title || '', bold: true, size: 23 }),
              new TextRun({ text: exp.company ? `  —  ${exp.company}` : '', size: 23, color: '374151' }),
              new TextRun({ text: exp.period ? `   (${exp.period})` : '', size: 20, color: '9ca3af' }),
            ],
            spacing: { before: 160, after: 40 }
          }),
          ...(exp.location ? [new Paragraph({
            children: [new TextRun({ text: exp.location, size: 19, color: '9ca3af', italics: true })],
            spacing: { after: 60 }
          })] : []),
          ...(exp.achievements || []).map(a => bullet(a)),
          new Paragraph({ spacing: { after: 60 } })
        ])
      ] : []),

      // ── SKILLS ──
      ...(skillsCat ? [
        sectionHeading('Skills'),
        hr(),
        ...Object.entries(skillsCat).flatMap(([cat, list]) =>
          Array.isArray(list) && list.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({ text: cat + ':  ', bold: true, size: 21, color: '374151' }),
                new TextRun({ text: list.join('  ·  '), size: 21 })
              ],
              spacing: { after: 80 }
            })
          ] : []
        )
      ] : rawSkills.length > 0 ? [
        sectionHeading('Skills'),
        hr(),
        new Paragraph({ children: [new TextRun({ text: rawSkills.join('  ·  '), size: 21 })], spacing: { after: 200 } })
      ] : []),

      // ── EDUCATION ──
      ...(education.length > 0 ? [
        sectionHeading('Education'),
        hr(),
        ...education.map(e => {
          const text = typeof e === 'string' ? e
            : [e.degree, e.school && `@ ${e.school}`, e.year, e.details].filter(Boolean).join('  —  ');
          return new Paragraph({
            children: [new TextRun({ text, size: 21 })],
            spacing: { after: 80 }
          });
        })
      ] : []),

      // ── CERTIFICATIONS ──
      ...(certs.length > 0 ? [
        sectionHeading('Certifications'),
        hr(),
        ...certs.map(c => bullet(typeof c === 'string' ? c : c.name || JSON.stringify(c)))
      ] : []),

      // ── LANGUAGES ──
      ...(langs.length > 0 ? [
        sectionHeading('Languages'),
        hr(),
        new Paragraph({
          children: [new TextRun({ text: langs.join('   |   '), size: 21 })],
          spacing: { after: 200 }
        })
      ] : []),

      // ── FOOTER ──
      new Paragraph({ spacing: { after: 200 } }),
      new Paragraph({
        children: [new TextRun({ text: 'Generated by LikeTalent · liketalent.io', size: 17, color: 'a1a1aa', italics: true })],
        alignment: AlignmentType.CENTER
      })
    ];

    const doc = new Document({ sections: [{ properties: {}, children }] });
    const buffer = await Packer.toBuffer(doc);
    const filename = `${name.replace(/\s+/g, '_')}_ATS_CV.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

    console.log('[CV Download] DOCX sent:', filename);

  } catch (error) {
    console.error('[CV Download] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// TAILOR CV TO JOB DESCRIPTION
// ============================================

app.post('/api/tailor-cv', async (req, res) => {
  try {
    const { cvData, jobDescription, lang = 'en' } = req.body;
    if (!cvData || !jobDescription) return res.status(400).json({ error: 'cvData and jobDescription required' });

    const isEs = lang === 'es';
    const prompt = `You are a senior ATS-certified CV writer. ${isEs ? 'All text fields must be written in Spanish.' : 'All text fields must be written in English.'}

Your task: rewrite the candidate's CV specifically tailored for the following job description.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE'S CV DATA:
${JSON.stringify(cvData, null, 2)}

RULES:
- Prioritize and highlight skills/experience that directly match the job description
- Mirror keywords from the job description (ATS matching)
- Rewrite achievements to emphasize relevance to this specific role
- Adjust the professional summary to speak directly to this job
- Add a "match_score" reflecting how well the candidate fits (0-100)
- If the candidate has gaps, suggest what to address in "missing_match"

Return ONLY a valid JSON object:
{
  "match_score": <number 0-100>,
  "match_summary": "<why this candidate is a good/poor fit — 2 sentences>",
  "missing_match": [<skills or experience gaps vs the job>],
  "contact": {
    "name": "...", "title": "<job-targeted headline>",
    "email": "...", "phone": "...", "location": "...", "linkedin": "...", "github": "..."
  },
  "professional_summary": "<tailored 3-4 sentence summary referencing the job role>",
  "experience": [
    {
      "title": "...", "company": "...", "period": "...", "location": "...",
      "achievements": ["<rewritten with job-relevant keywords>", "..."]
    }
  ],
  "skills": {
    "${isEs ? 'Técnicas' : 'Technical'}": [],
    "${isEs ? 'Herramientas' : 'Tools & Platforms'}": [],
    "${isEs ? 'Blandas' : 'Soft Skills'}": []
  },
  "education": [{ "degree": "...", "school": "...", "year": "...", "details": "..." }],
  "certifications": [],
  "languages": [],
  "tips": [<specific tips to improve match for this job>]
}`;

    console.log('[CV Tailor] Calling AI for:', cvData.name || 'unknown');
    const raw = await callAI(prompt, { maxTokens: 6000, prefill: '{' });
    const tailored = parseJSON(raw);
    if (!tailored) {
      console.error('[CV Tailor] Parse failed. Preview:', raw.slice(0, 300));
      return res.status(500).json({ error: 'AI did not return valid response' });
    }

    console.log('[CV Tailor] Done. Match score:', tailored.match_score);
    saveCVImprovement({ mode: 'tailor', candidateName: cvData.name, result: tailored, jobDescription }).catch(() => {});
    res.json({ success: true, ...tailored });

  } catch (error) {
    console.error('[CV Tailor] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// OAUTH — GOOGLE
// ============================================

app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google OAuth not configured' });
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, Date.now());
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  `${BACKEND_URL}/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    prompt:        'select_account',
    state,
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error, state } = req.query;
  if (error || !code) return res.redirect(`${FRONTEND_URL}/?auth_error=google_denied`);
  if (!state || !oauthStates.has(state)) return res.redirect(`${FRONTEND_URL}/?auth_error=invalid_state`);
  oauthStates.delete(state);

  try {
    // Exchange code for tokens
    const tokenBody = new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${BACKEND_URL}/auth/google/callback`, grant_type: 'authorization_code',
    }).toString();

    const tokenRes = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody) }
      }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ status: r.statusCode, body: d })); });
      req2.on('error', reject); req2.write(tokenBody); req2.end();
    });

    const tokens = JSON.parse(tokenRes.body);
    if (!tokens.access_token) throw new Error('No access_token from Google');

    // Get user info
    const userRes = await new Promise((resolve, reject) => {
      const req3 = https.request({
        hostname: 'www.googleapis.com', path: '/oauth2/v2/userinfo', method: 'GET',
        headers: { 'Authorization': 'Bearer ' + tokens.access_token }
      }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ body: d })); });
      req3.on('error', reject); req3.end();
    });

    const user = JSON.parse(userRes.body);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    oauthSessions.set(sessionToken, {
      name: user.name || user.email, email: user.email,
      picture: user.picture || '', provider: 'google'
    });

    console.log('[Auth] Google login:', user.email);
    saveAuthSession({ provider: 'google', email: user.email, name: user.name, picture: user.picture }).catch(() => {});
    const params = new URLSearchParams({ token: sessionToken, name: encodeURIComponent(user.name || ''), provider: 'google' });
    res.redirect(`${FRONTEND_URL}/auth/callback?` + params.toString());

  } catch (e) {
    console.error('[Auth] Google callback error:', e.message);
    res.redirect(`${FRONTEND_URL}/?auth_error=google_failed`);
  }
});

// ============================================
// OAUTH — LINKEDIN
// ============================================

app.get('/auth/linkedin', (req, res) => {
  if (!LINKEDIN_CLIENT_ID) return res.status(503).json({ error: 'LinkedIn OAuth not configured' });
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, Date.now());
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     LINKEDIN_CLIENT_ID,
    redirect_uri:  `${BACKEND_URL}/auth/linkedin/callback`,
    scope:         'openid profile email',
    state,
  });
  res.redirect('https://www.linkedin.com/oauth/v2/authorization?' + params.toString());
});

app.get('/auth/linkedin/callback', async (req, res) => {
  const { code, error, state } = req.query;
  if (error || !code) return res.redirect(`${FRONTEND_URL}/?auth_error=linkedin_denied`);
  if (!state || !oauthStates.has(state)) return res.redirect(`${FRONTEND_URL}/?auth_error=invalid_state`);
  oauthStates.delete(state);

  try {
    // Exchange code for access token
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code', code,
      client_id: LINKEDIN_CLIENT_ID, client_secret: LINKEDIN_CLIENT_SECRET,
      redirect_uri: `${BACKEND_URL}/auth/linkedin/callback`,
    }).toString();

    const tokenRes = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'www.linkedin.com', path: '/oauth/v2/accessToken', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenBody) }
      }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ status: r.statusCode, body: d })); });
      req2.on('error', reject); req2.write(tokenBody); req2.end();
    });

    const tokens = JSON.parse(tokenRes.body);
    if (!tokens.access_token) throw new Error('No access_token from LinkedIn');

    // Get user info (OpenID Connect userinfo endpoint)
    const userRes = await new Promise((resolve, reject) => {
      const req3 = https.request({
        hostname: 'api.linkedin.com', path: '/v2/userinfo', method: 'GET',
        headers: { 'Authorization': 'Bearer ' + tokens.access_token }
      }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ body: d })); });
      req3.on('error', reject); req3.end();
    });

    const user = JSON.parse(userRes.body);
    const name = `${user.given_name || ''} ${user.family_name || ''}`.trim() || user.email;
    const sessionToken = crypto.randomBytes(32).toString('hex');
    oauthSessions.set(sessionToken, {
      name, email: user.email || '', picture: user.picture || '', provider: 'linkedin'
    });

    console.log('[Auth] LinkedIn login:', user.email);
    saveAuthSession({ provider: 'linkedin', email: user.email, name, picture: user.picture }).catch(() => {});
    const params = new URLSearchParams({ token: sessionToken, name: encodeURIComponent(name), provider: 'linkedin' });
    res.redirect(`${FRONTEND_URL}/auth/callback?` + params.toString());

  } catch (e) {
    console.error('[Auth] LinkedIn callback error:', e.message);
    res.redirect(`${FRONTEND_URL}/?auth_error=linkedin_failed`);
  }
});

// ── Validate OAuth session token ──────────────────────────────────────────────
app.get('/auth/session', (req, res) => {
  const token = req.headers['x-session-token'] || req.query.token;
  const session = oauthSessions.get(token);
  if (!session) return res.status(401).json({ valid: false });
  res.json({ valid: true, ...session });
});

// ============================================
// OAUTH — GITHUB
// ============================================

app.get('/auth/github', (req, res) => {
  if (!GITHUB_CLIENT_ID) return res.status(503).json({ error: 'GitHub OAuth not configured' });
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, Date.now());
  const params = new URLSearchParams({
    client_id:    GITHUB_CLIENT_ID,
    redirect_uri: `${BACKEND_URL}/auth/github/callback`,
    scope:        'user:email',
    state,
  });
  res.redirect('https://github.com/login/oauth/authorize?' + params.toString());
});

app.get('/auth/github/callback', async (req, res) => {
  const { code, error, state } = req.query;
  if (error || !code) return res.redirect(`${FRONTEND_URL}/?auth_error=github_denied`);
  if (!state || !oauthStates.has(state)) return res.redirect(`${FRONTEND_URL}/?auth_error=invalid_state`);
  oauthStates.delete(state);

  try {
    // Exchange code for access token
    const tokenBody = JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${BACKEND_URL}/auth/github/callback`,
    });

    const tokenRes = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'github.com', path: '/login/oauth/access_token', method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(tokenBody),
        },
      }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ status: r.statusCode, body: d })); });
      req2.on('error', reject); req2.write(tokenBody); req2.end();
    });

    const tokens = JSON.parse(tokenRes.body);
    if (!tokens.access_token) throw new Error('No access_token from GitHub');

    // Get user profile
    const userRes = await new Promise((resolve, reject) => {
      const req3 = https.request({
        hostname: 'api.github.com', path: '/user', method: 'GET',
        headers: { 'Authorization': 'Bearer ' + tokens.access_token, 'User-Agent': 'liketalent-app' },
      }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ body: d })); });
      req3.on('error', reject); req3.end();
    });

    const user = JSON.parse(userRes.body);

    // Email may be null if private — fetch from /user/emails
    let email = user.email || '';
    if (!email) {
      try {
        const emailsRes = await new Promise((resolve, reject) => {
          const req4 = https.request({
            hostname: 'api.github.com', path: '/user/emails', method: 'GET',
            headers: { 'Authorization': 'Bearer ' + tokens.access_token, 'User-Agent': 'liketalent-app' },
          }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve({ body: d })); });
          req4.on('error', reject); req4.end();
        });
        const emails = JSON.parse(emailsRes.body);
        const primary = emails.find(e => e.primary) || emails[0];
        if (primary) email = primary.email;
      } catch {}
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    oauthSessions.set(sessionToken, {
      name: user.name || user.login, email,
      picture: user.avatar_url || '', provider: 'github',
    });

    console.log('[Auth] GitHub login:', user.login, email);
    saveAuthSession({ provider: 'github', email, name: user.name || user.login, picture: user.avatar_url, identifier: user.login }).catch(() => {});
    const params = new URLSearchParams({
      token: sessionToken,
      name: encodeURIComponent(user.name || user.login || ''),
      provider: 'github',
    });
    res.redirect(`${FRONTEND_URL}/auth/callback?` + params.toString());

  } catch (e) {
    console.error('[Auth] GitHub callback error:', e.message);
    res.redirect(`${FRONTEND_URL}/?auth_error=github_failed`);
  }
});

// ============================================
// SUPABASE STATUS — diagnóstico de conexión
// ============================================

app.get('/api/supabase-status', async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_KEY === 'your_supabase_key_here') {
    return res.json({ configured: false, message: 'SUPABASE_KEY no configurada en .env' });
  }

  const tables = ['cv_analyses', 'auth_sessions', 'cv_improvements'];
  const results = {};

  for (const table of tables) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count&limit=1`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      });
      if (r.status === 200) {
        results[table] = { ok: true };
      } else if (r.status === 404 || r.status === 400) {
        const body = await r.text();
        results[table] = { ok: false, error: 'Tabla no existe — ejecuta supabase-schema.sql', detail: body };
      } else {
        results[table] = { ok: false, error: `HTTP ${r.status}` };
      }
    } catch (e) {
      results[table] = { ok: false, error: e.message };
    }
  }

  const allOk = Object.values(results).every(t => t.ok);
  res.json({ configured: true, connected: allOk, tables: results, supabase_url: SUPABASE_URL });
});

// ============================================
// CERTIFICATE: Generate PDF + save hash to Supabase + mint NFT
// ============================================

const PDFDocument = require('pdfkit');
const { ethers }  = require('ethers');
const { Wallet, Provider } = require('zksync-ethers');

const ZKSYS_RPC        = process.env.ZKSYS_RPC_URL       || 'https://rpc-zk.tanenbaum.io/';
const CONTRACT_ADDRESS = process.env.ZKSYS_CONTRACT_ADDRESS || '0x8786996dA2Ed941FA4a0Aa7F0226fe50976C1539';
const CONTRACT_ABI     = [
  'function mintCertificate(address to, string skillName, uint8 score, string level, string uri, bytes32 cvHash) external returns (uint256)',
  'function totalCertificates() external view returns (uint256)'
];

// Build a PDF certificate and return its Buffer
function formatCertificateTitle(skill) {
  // Mapeo de skills comunes a nombres profesionales
  const titleMap = {
    'gcp': 'Google Cloud Platform',
    'aws': 'Amazon Web Services',
    'azure': 'Microsoft Azure',
    'react': 'React.js Development',
    'node': 'Node.js Development',
    'node.js': 'Node.js Development',
    'nodejs': 'Node.js Development',
    'solidity': 'Solidity Smart Contracts',
    'python': 'Python Programming',
    'java': 'Java Development',
    'javascript': 'JavaScript Development',
    'typescript': 'TypeScript Development',
    'docker': 'Docker & Containerization',
    'kubernetes': 'Kubernetes Orchestration',
    'k8s': 'Kubernetes Orchestration',
    'sql': 'SQL & Database Management',
    'mongodb': 'MongoDB & NoSQL',
    'git': 'Git Version Control',
    'linux': 'Linux System Administration',
    'figma': 'Figma UI/UX Design',
    'jira': 'Jira Project Management',
    'scrum': 'Scrum Methodology',
    'agile': 'Agile Methodology',
    'rust': 'Rust Programming',
    'go': 'Go Programming',
    'golang': 'Go Programming',
    'c#': 'C# Development',
    'c++': 'C++ Development',
    'swift': 'Swift Development',
    'kotlin': 'Kotlin Development',
    'flutter': 'Flutter Development',
    'angular': 'Angular Development',
    'vue': 'Vue.js Development',
    'vue.js': 'Vue.js Development',
    'next': 'Next.js Development',
    'next.js': 'Next.js Development',
    'graphql': 'GraphQL API Design',
    'terraform': 'Terraform Infrastructure',
    'ci/cd': 'CI/CD Pipeline Engineering',
    'devops': 'DevOps Engineering',
    'web3': 'Web3 Development',
    'blockchain': 'Blockchain Technology',
    'defi': 'DeFi Protocol Development',
    'solidworks': 'SolidWorks Engineering',
    'autocad': 'AutoCAD Design',
    'excel': 'Microsoft Excel Advanced',
    'power bi': 'Power BI Analytics',
    'tableau': 'Tableau Data Visualization',
    'machine learning': 'Machine Learning Engineering',
    'ml': 'Machine Learning Engineering',
    'ai': 'Artificial Intelligence',
    'data science': 'Data Science & Analytics',
    'cybersecurity': 'Cybersecurity',
    'php': 'PHP Development',
    'ruby': 'Ruby Development',
    'rails': 'Ruby on Rails Development',
    'django': 'Django Development',
    'spring': 'Spring Framework',
    'html': 'HTML & Web Standards',
    'css': 'CSS & Styling',
  };
  const key = skill.toLowerCase().trim();
  if (titleMap[key]) return titleMap[key];
  // Si no está en el mapa, capitalizar profesionalmente
  return skill.trim().split(/\s+/).map(w => {
    if (['de', 'en', 'y', 'the', 'and', 'of', 'in', 'for'].includes(w.toLowerCase())) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

async function buildCertificatePDF({ skill, score, level, wallet, issuedAt, contentHash, explorerUrl }) {
  const QRCode = require('qrcode');
  const certTitle = formatCertificateTitle(skill);

  const verifyUrl = explorerUrl || `https://explorer-zk.tanenbaum.io/address/${CONTRACT_ADDRESS}`;

  // Generate QR as PNG buffer
  const qrBuffer = await QRCode.toBuffer(verifyUrl, {
    type: 'png',
    width: 110,
    margin: 1,
    color: { dark: '#10b981', light: '#0a0a0a' }
  });

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const chunks = [];
    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;   // 841.89
    const H = doc.page.height;  // 595.28

    // ── Background ───────────────────────────────────────────────────────────
    doc.rect(0, 0, W, H).fill('#0a0a0a');

    // Outer border
    doc.rect(20, 20, W - 40, H - 40).lineWidth(1.5).stroke('#10b981');
    // Inner accent border
    doc.rect(26, 26, W - 52, H - 52).lineWidth(0.4).stroke('#064e3b');

    // ── Header ───────────────────────────────────────────────────────────────
    doc.fillColor('#10b981').fontSize(10).font('Helvetica')
       .text('LIKETALENT PLATFORM', 0, 46, { align: 'center', characterSpacing: 5 });

    doc.fillColor('#ffffff').fontSize(34).font('Helvetica-Bold')
       .text('SKILL CERTIFICATE', 0, 66, { align: 'center' });

    // Divider
    doc.moveTo(W / 2 - 140, 114).lineTo(W / 2 + 140, 114).lineWidth(0.8).stroke('#10b981');

    // ── Middle row: text left | QR right ─────────────────────────────────────
    const midY = 128;
    const qrSize = 110;
    const qrX   = W - 80 - qrSize;   // right side
    const qrY   = midY;
    const textW  = qrX - 60;          // text column width

    // "This certifies that the holder"
    doc.fillColor('#a1a1aa').fontSize(12).font('Helvetica')
       .text('This certifies that the holder', 60, midY, { width: textW });

    // Verify transaction label + URL (clickable)
    doc.fillColor('#10b981').fontSize(8.5).font('Helvetica-Bold')
       .text('Verify transaction', 60, midY + 22, { width: textW });

    doc.fillColor('#10b981').fontSize(7.5).font('Helvetica')
       .text(verifyUrl, 60, midY + 36, {
         width: textW,
         link: verifyUrl,
         underline: true,
       });

    // QR code
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    // QR label
    doc.fillColor('#3f3f46').fontSize(7).font('Helvetica')
       .text('Scan to verify', qrX, qrY + qrSize + 3, { width: qrSize, align: 'center' });

    // "has successfully validated the skill"
    doc.fillColor('#a1a1aa').fontSize(12).font('Helvetica')
       .text('has successfully validated the skill', 60, midY + 60, { width: textW });

    // ── Skill name (título profesional) ─────────────────────────────────────
    const titleSize = certTitle.length > 25 ? 36 : certTitle.length > 18 ? 42 : 48;
    doc.fillColor('#10b981').fontSize(titleSize).font('Helvetica-Bold')
       .text(certTitle, 0, midY + 86, { align: 'center' });

    // ── Score + Level boxes ───────────────────────────────────────────────────
    const boxY  = midY + 152;
    const boxW  = 130;
    const boxH  = 68;
    const scoreX = W / 2 - boxW - 10;
    const levelX = W / 2 + 10;

    doc.rect(scoreX, boxY, boxW, boxH).fill('#052e16');
    doc.fillColor('#10b981').fontSize(8).font('Helvetica')
       .text('SCORE', scoreX, boxY + 10, { width: boxW, align: 'center', characterSpacing: 2 });
    doc.fillColor('#ffffff').fontSize(34).font('Helvetica-Bold')
       .text(`${score}%`, scoreX, boxY + 24, { width: boxW, align: 'center' });

    doc.rect(levelX, boxY, boxW, boxH).fill('#052e16');
    doc.fillColor('#10b981').fontSize(8).font('Helvetica')
       .text('LEVEL', levelX, boxY + 10, { width: boxW, align: 'center', characterSpacing: 2 });
    doc.fillColor('#ffffff').fontSize(26).font('Helvetica-Bold')
       .text(level.toUpperCase(), levelX, boxY + 28, { width: boxW, align: 'center' });

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerTop = H - 90;

    doc.moveTo(60, footerTop).lineTo(W - 60, footerTop).lineWidth(0.4).stroke('#1f1f1f');

    doc.fillColor('#52525b').fontSize(9).font('Helvetica')
       .text(`Issued: ${issuedAt}`, 0, footerTop + 8, { align: 'center' });

    doc.fillColor('#10b981').fontSize(8).font('Helvetica')
       .text('Blockchain: zkSYS Testnet · Chain ID: 57057', 0, footerTop + 22, { align: 'center', characterSpacing: 1 });

    doc.fillColor('#3f3f46').fontSize(7.5).font('Helvetica')
       .text(`Contract: ${CONTRACT_ADDRESS}`, 0, footerTop + 36, { align: 'center' });

    doc.fillColor('#3f3f46').fontSize(7).font('Helvetica')
       .text(`SHA-256: ${contentHash}`, 0, footerTop + 49, { align: 'center' });

    doc.end();
  });
}

app.post('/api/mint-certificate', async (req, res) => {
  try {
    const { wallet, skill, score, level } = req.body;

    if (!wallet || !skill || score === undefined || !level) {
      return res.status(400).json({ error: 'wallet, skill, score and level are required' });
    }
    if (score < 70) {
      return res.status(400).json({ error: 'Score must be >= 70 to claim a certificate' });
    }

    const issuedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // 1. Compute deterministic content hash (wallet:skill:level:score:date)
    const crypto = require('crypto');
    const contentHash = crypto.createHash('sha256')
      .update(`${wallet}:${skill}:${level}:${score}:${issuedAt}`)
      .digest('hex');
    const cvHashHex = '0x' + contentHash;

    let tokenId  = null;
    let txHash   = null;
    let mintError = null;

    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

    // 2. Mint NFT on zkSYS (optional — requires PRIVATE_KEY in env)
    const PRIVATE_KEY = process.env.ZKSYS_PRIVATE_KEY || process.env.PRIVATE_KEY || '';
    if (PRIVATE_KEY) {
      try {
        const provider = new Provider(ZKSYS_RPC);
        const signer   = new Wallet(PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        const tokenURI = `data:application/json;base64,${Buffer.from(JSON.stringify({
          name: `${skill} Certificate`,
          description: `Validated skill certificate for ${skill} — score ${score}% (${level})`,
          attributes: [
            { trait_type: 'Skill',  value: skill  },
            { trait_type: 'Score',  value: score  },
            { trait_type: 'Level',  value: level  },
          ]
        })).toString('base64')}`;

        const tx = await contract.mintCertificate(wallet, skill, score, level, tokenURI, cvHashHex);
        const receipt = await tx.wait();
        txHash = receipt.hash;

        const total = await contract.totalCertificates();
        tokenId = Number(total) - 1;

        console.log(`[Mint] ✅ tokenId=${tokenId} tx=${txHash}`);
      } catch (e) {
        mintError = e.message;
        console.error('[Mint] NFT mint failed:', e.message);
      }
    }

    const explorerUrl = txHash ? `https://explorer-zk.tanenbaum.io/tx/${txHash}` : null;

    // 3. Build PDF with contentHash + explorerUrl already known
    const pdfBuffer = await buildCertificatePDF({ skill, score, level, wallet, issuedAt, contentHash, explorerUrl });
    const pdfHash   = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // 4. Save to Supabase
    if (SUPABASE_URL && SUPABASE_KEY) {
      await fetch(`${SUPABASE_URL}/rest/v1/certificates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ wallet, skill, score, level, pdf_hash: pdfHash, content_hash: contentHash, tx_hash: txHash, token_id: tokenId })
      });
    }

    res.json({
      success: true,
      pdfBase64: pdfBuffer.toString('base64'),
      pdfHash: contentHash,   // expose the content hash (deterministic & verifiable)
      tokenId,
      txHash,
      mintError,
      explorerUrl
    });

  } catch (error) {
    console.error('[mint-certificate]', error);
    res.status(500).json({ error: 'Failed to generate certificate' });
  }
});

// ============================================
// SUPERDAPP AGENT
// ============================================
const axios = require('axios');

const GROQ_API_KEY    = process.env.GROQ_API_KEY    || '';
const SUPERDAPP_TOKEN = process.env.SUPERDAPP_TOKEN  || '';
const MINTER_KEY      = process.env.ZKSYS_PRIVATE_KEY || process.env.PRIVATE_KEY || '';
const PASS_SCORE      = 70;
const MAX_TOOL_ROUNDS = 5;
const EXPLORER_URL    = process.env.ZKSYS_EXPLORER_URL   || 'https://explorer-zk.tanenbaum.io';

console.log('[SuperDapp] TOKEN:',   SUPERDAPP_TOKEN ? 'OK' : 'FALTA');
console.log('[SuperDapp] GROQ:',    GROQ_API_KEY    ? 'OK — tool calling activo' : 'FALTA — usando MiniMax como fallback');
console.log('[SuperDapp] DISCORD:', process.env.DISCORD_TOKEN ? 'OK' : 'FALTA');
console.log('[SuperDapp] TELEGRAM:', process.env.TELEGRAM_BOT_TOKEN ? 'OK' : 'FALTA');

const { SuperDappAgent } = require('@superdapp/agents');
const sdAgent = SUPERDAPP_TOKEN
  ? new SuperDappAgent({ apiToken: SUPERDAPP_TOKEN, baseUrl: 'https://api.superdapp.ai' })
  : null;
if (sdAgent) {
  console.log('[SuperDapp] Agente inicializado');
  // Fix: el dist compilado del SDK no tiene el fallback a rm.roomId que sí tiene
  // el TypeScript source. Para canales/supergrupos el webhook trae roomId (UUID)
  // pero no senderId, por lo que getRoomId devuelve `memberId-undefined` → 403.
  // Patch alineado con el source: https://github.com/SuperDappAI/superdapp-js
  Object.getPrototypeOf(sdAgent).getRoomId = function(message) {
    const rm = message.rawMessage;
    if (rm?.senderId && rm?.memberId) return `${rm.memberId}-${rm.senderId}`;
    if (rm?.roomId)    return rm.roomId;
    if (rm?.channelId) return rm.channelId;
    if (rm?.memberId)  return rm.memberId;
    return '';
  };
  console.log('[SuperDapp] getRoomId patch aplicado (soporte canales/supergrupos)');

  // Fix 2: formatBody del dist siempre usa t:'chat'. Para canales/supergrupos
  // debe ser t:'channel' — el frontend usa ese campo para el push en tiempo real
  // (WebSocket). Sin este fix los mensajes llegan pero no se muestran hasta F5.
  const proto = Object.getPrototypeOf(sdAgent);
  const origSendChannel = proto.sendChannelMessage;
  proto.sendChannelMessage = async function(channelId, message, options) {
    const msgObj    = { body: message };
    const jsonStr   = JSON.stringify(msgObj);
    const msgBody   = { body: JSON.stringify({ m: encodeURIComponent(jsonStr), t: 'channel' }) };
    return this.client.sendChannelMessage(channelId, {
      message: msgBody,
      isSilent: options?.isSilent || false,
    });
  };
  console.log('[SuperDapp] sendChannelMessage patch aplicado (t:channel para tiempo real)');
}

// ── Registrar handlers usando la API oficial del SDK ──────────────────────────
// Lazy: se llama en el primer webhook porque handleMessage se define más abajo.
let sdHandlersRegistered = false;
function sdRegisterHandlers() {
  if (!sdAgent || sdHandlersRegistered) return;
  sdHandlersRegistered = true;

  // ── Helpers de UI ─────────────────────────────────────────────────────────

  async function sdSendMainMenu(roomId) {
    await sdAgent.sendReplyMarkupMessage('buttons', roomId,
      '¿Qué deseas hacer?', [
        [
          { text: '📄 Analizar CV',          callback_data: 'ACTION:ANALYZE_CV' },
          { text: '🎯 Validar Skill',         callback_data: 'ACTION:START_QUIZ' },
        ],
        [
          { text: '📝 Carta de presentación', callback_data: 'ACTION:COVER_LETTER' },
          { text: '⚡ Optimizar CV',          callback_data: 'ACTION:OPTIMIZE_CV' },
        ],
        [
          { text: '🆘 Ayuda',                callback_data: 'ACTION:HELP' },
        ],
      ]
    );
  }

  async function sdSendSkillMenu(roomId, sessionKey) {
    const sess     = getSdSession(sessionKey);
    const cvSkills = (sess.cvData?.skills || []).slice(0, 6);
    const defaults = ['Solidity', 'React', 'Node.js', 'TypeScript', 'Python', 'Smart Contracts'];
    const skills   = cvSkills.length > 0 ? cvSkills : defaults;
    const rows     = [];
    for (let i = 0; i < Math.min(skills.length, 6); i += 2) {
      const row = [{ text: skills[i], callback_data: 'SKILL:' + skills[i] }];
      if (skills[i + 1]) row.push({ text: skills[i + 1], callback_data: 'SKILL:' + skills[i + 1] });
      rows.push(row);
    }
    rows.push([{ text: '✏️ Otro (escríbelo)', callback_data: 'SKILL:__CUSTOM__' }]);
    await sdAgent.sendReplyMarkupMessage('buttons', roomId, '🎯 **¿Qué skill quieres validar?**', rows);
  }

  // ── /start ────────────────────────────────────────────────────────────────
  sdAgent.addCommand('/start', async ({ roomId }) => {
    await sdAgent.sendConnectionMessage(roomId,
      '¡Bienvenido a **LikeTalent**! 🚀\n\n' +
      'Soy tu agente de validación de talento Web3.\n' +
      'Analizo CVs, valido skills y emito certificados on-chain en zkSYS Testnet.'
    );
    await sdSendMainMenu(roomId);
  });

  // ── /menu ─────────────────────────────────────────────────────────────────
  sdAgent.addCommand('/menu', async ({ roomId }) => {
    await sdSendMainMenu(roomId);
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  sdAgent.addCommand('/help', async ({ roomId }) => {
    await sdAgent.sendConnectionMessage(roomId,
      '**LikeTalent — Ayuda** 🆘\n\n' +
      '📄 **Analizar CV** — Envía el link de tu CV (PDF/DOCX)\n' +
      '🎯 **Validar Skill** — Quiz de habilidades + certificado on-chain\n' +
      '📝 **Carta** — Generación automática de carta de presentación\n' +
      '⚡ **Optimizar CV** — Mejora tu CV para superar filtros ATS\n\n' +
      'Comandos: /start · /menu · /help\n\n' +
      'O escribe directamente lo que necesitas.'
    );
    await sdSendMainMenu(roomId);
  });

  // ── message ───────────────────────────────────────────────────────────────
  sdAgent.addCommand('message', async ({ message, roomId }) => {
    // Preservar case original desde body.m.body (SDK ya decodificó URL-encoding)
    const m    = message.body && message.body.m;
    const text = (typeof m === 'object' && typeof m.body === 'string' ? m.body : message.data) || '';
    if (!text || (message.rawMessage && message.rawMessage.isBot)) return;

    const isChannel  = message.rawMessage && message.rawMessage.__typename === 'ChannelMessage';
    const sessionKey = 'sd_' + roomId;
    const sendFn = async (msg) => {
      if (isChannel) await sdAgent.sendChannelMessage(roomId, msg);
      else           await sdAgent.sendConnectionMessage(roomId, msg);
    };
    await handleMessage(text, sessionKey, sendFn, 'SuperDapp');
  });

  // ── callback_query ────────────────────────────────────────────────────────
  // SDK parsea: callback_data "CMD:value" → message.callback_command="CMD", message.data="value"
  sdAgent.addCommand('callback_query', async ({ message, roomId }) => {
    const cmd        = message.callback_command || '';
    const data       = message.data             || '';
    const sessionKey = 'sd_' + roomId;
    const session    = getSdSession(sessionKey);

    const sendFn = async (msg) => {
      await sdAgent.sendConnectionMessage(roomId, msg);
    };

    console.log('[SD] callback_query | cmd:', cmd, '| data:', data);

    // ── ACTION: menú principal ─────────────────────────────────────────────
    if (cmd === 'ACTION') {
      switch (data) {
        case 'ANALYZE_CV':
          await sdAgent.sendConnectionMessage(roomId,
            '📄 **Analizar CV**\n\n' +
            'Envía el link de tu CV (Google Drive, Dropbox, URL directa a PDF/DOCX).'
          );
          return;

        case 'START_QUIZ':
          await sdSendSkillMenu(roomId, sessionKey);
          return;

        case 'COVER_LETTER':
          if (!session.cvData) {
            await sdAgent.sendConnectionMessage(roomId,
              '📝 Primero necesito analizar tu CV.\n\nEnvía el link de tu CV para comenzar.'
            );
          } else {
            await sdAgent.sendConnectionMessage(roomId,
              '📝 **Carta de presentación**\n\n' +
              'Escribe el puesto y empresa. Ejemplo:\n"carta para Developer en Empresa XYZ"'
            );
          }
          return;

        case 'OPTIMIZE_CV':
          if (!session.cvData) {
            await sdAgent.sendConnectionMessage(roomId,
              '⚡ Primero necesito analizar tu CV.\n\nEnvía el link de tu CV para comenzar.'
            );
          } else {
            await sdAgent.sendReplyMarkupMessage('buttons', roomId,
              '⚡ **Optimizar CV** — ¿En qué idioma?', [
                [
                  { text: '🇪🇸 Español', callback_data: 'OPTIMIZE:es' },
                  { text: '🇺🇸 English', callback_data: 'OPTIMIZE:en' },
                ],
              ]
            );
          }
          return;

        case 'HELP':
          await sdAgent.sendConnectionMessage(roomId,
            '**LikeTalent — Ayuda** 🆘\n\n' +
            '📄 **Analizar CV** — Envía el link de tu CV (PDF/DOCX)\n' +
            '🎯 **Validar Skill** — Quiz de habilidades + certificado\n' +
            '📝 **Carta** — Carta de presentación automática\n' +
            '⚡ **Optimizar CV** — Mejora para filtros ATS\n\n' +
            'Comandos: /start · /menu · /help'
          );
          await sdSendMainMenu(roomId);
          return;
      }
    }

    // ── SKILL: selección de skill para quiz ───────────────────────────────
    if (cmd === 'SKILL') {
      if (data === '__CUSTOM__') {
        session.pendingQuizIntent = true;
        await sdAgent.sendConnectionMessage(roomId,
          '✏️ Escribe el nombre del skill que quieres validar:'
        );
      } else {
        // Guardar skill en sesión → mostrar menú de nivel
        session.pendingSkill = data;
        await sdAgent.sendReplyMarkupMessage('buttons', roomId,
          '🎯 Skill: **' + data + '** — ¿Qué nivel quieres evaluar?', [
            [
              { text: '🟢 Junior', callback_data: 'LEVEL:junior' },
              { text: '🟡 Mid',    callback_data: 'LEVEL:mid'    },
              { text: '🔴 Senior', callback_data: 'LEVEL:senior' },
            ],
          ]
        );
      }
      return;
    }

    // ── LEVEL: nivel del quiz ─────────────────────────────────────────────
    if (cmd === 'LEVEL') {
      // data = 'junior' | 'mid' | 'senior'
      // skill guardado en session.pendingSkill por el callback SKILL anterior
      const skill = session.pendingSkill || 'Solidity';
      session.pendingSkill = null;
      await sendFn('Iniciando quiz de **' + skill + '** — nivel ' + data + '...');
      await handleMessage('validar ' + skill + ' ' + data, sessionKey, sendFn, 'SuperDapp');
      return;
    }

    // ── OPTIMIZE: idioma de optimización ─────────────────────────────────
    if (cmd === 'OPTIMIZE') {
      const lang = data === 'en' ? 'inglés' : 'español';
      await handleMessage('optimizar cv en ' + lang, sessionKey, sendFn, 'SuperDapp');
      return;
    }
  });

  console.log('[SuperDapp] Handlers registrados: /start /menu /help + message + callback_query');
}

// ── Sesiones ──────────────────────────────────────────────────────────────────
const sdSessions = new Map();

function getSdSession(roomId) {
  if (!sdSessions.has(roomId)) {
    sdSessions.set(roomId, { cvData: null, userData: null, history: [], quizState: null, pendingCertificate: null, pendingQuiz: null, pendingQuizIntent: false, pendingSkill: null, collectingUserData: null, lastActivity: Date.now() });
  }
  const s = sdSessions.get(roomId);
  s.lastActivity = Date.now();
  return s;
}

// Limpiar sesiones inactivas hace más de 24h
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, s] of sdSessions) if (s.lastActivity < cutoff) sdSessions.delete(id);
}, 60 * 60 * 1000);

// ── Tools del agente ──────────────────────────────────────────────────────────
const SD_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'analyze_cv',
      description: 'Descarga y analiza un CV desde una URL (Google Drive, Dropbox, PDF/DOCX). Devuelve nombre, skills, score, roles sugeridos, fortalezas y mejoras.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'URL del CV (PDF o DOCX)' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'optimize_cv',
      description: 'Genera un CV optimizado para ATS y crea un enlace de descarga protegido. IMPORTANTE: antes de llamar esta función, pide al usuario su número de DNI/cédula para proteger la descarga.',
      parameters: {
        type: 'object',
        properties: {
          lang: { type: 'string', enum: ['es', 'en'] },
          dni: { type: 'string', description: 'Número de DNI, cédula o documento de identidad del usuario (requerido para proteger el archivo)' }
        },
        required: ['dni']
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
          job_title: { type: 'string' },
          company:   { type: 'string' }
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
          level: { type: 'string', enum: ['junior', 'mid', 'senior'] }
        },
        required: ['skill']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mint_certificate',
      description: 'Emite certificado soulbound en blockchain (zkSYS). Solo cuando el usuario aprobó el quiz (score >= 70) y dio su wallet address.',
      parameters: {
        type: 'object',
        properties: {
          wallet_address: { type: 'string' },
          skill:          { type: 'string' },
          score:          { type: 'number' },
          level:          { type: 'string' }
        },
        required: ['wallet_address', 'skill', 'score', 'level']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description: 'Obtiene el CV del usuario si fue analizado previamente.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

// ── Helpers internos ──────────────────────────────────────────────────────────
function sdConvertDriveLink(url) {
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return 'https://drive.google.com/uc?export=download&confirm=t&id=' + match[1];
  return url;
}

async function sdDownloadFile(url) {
  console.log('[SD-DOWNLOAD] Descargando:', url.substring(0, 80));
  const directUrl = sdConvertDriveLink(url);
  const response  = await axios.get(directUrl, {
    responseType: 'arraybuffer', timeout: 20000, maxRedirects: 5,
    maxContentLength: 50 * 1024 * 1024,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const buffer   = Buffer.from(response.data);
  const filename = url.includes('drive.google') ? 'cv.pdf' : (url.split('/').pop().split('?')[0] || 'cv.pdf');
  console.log('[SD-DOWNLOAD] OK | archivo:', filename, '| tamaño:', buffer.length, 'bytes');
  return { file: buffer.toString('base64'), filename };
}

async function sdCallBackend(endpoint, body) {
  console.log('[SD-BACKEND] POST', endpoint);
  const response = await axios.post('http://localhost:' + PORT + endpoint, body, { timeout: 90000 });
  console.log('[SD-BACKEND] OK', endpoint, '| status:', response.status);
  return response.data;
}

async function sdMintOnChain(walletAddress, skill, score, level, cvData) {
  if (!MINTER_KEY) throw new Error('MINTER_PRIVATE_KEY no configurado');
  const provider = new Provider(ZKSYS_RPC);
  const signer   = new Wallet(MINTER_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  const metadata = {
    name:        'LikeTalent Skill Certificate — ' + skill,
    description: 'Certificado validado por IA. Skill: ' + skill + ' | Score: ' + score + '/100 | Nivel: ' + level,
    image:       process.env.CERTIFICATE_BADGE_URL || `${BACKEND_URL}/certificate-badge.png`,
    attributes: [
      { trait_type: 'Skill',    value: skill },
      { trait_type: 'Score',    value: score },
      { trait_type: 'Level',    value: level },
      { trait_type: 'Issued',   value: new Date().toISOString().split('T')[0] },
      { trait_type: 'Platform', value: 'LikeTalent' }
    ]
  };
  const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(metadata)).toString('base64');

  let cvHash = ethers.ZeroHash;
  if (cvData && cvData.name) {
    cvHash = ethers.keccak256(ethers.toUtf8Bytes(cvData.name + (cvData.skills || []).join(',')));
  }

  const tx      = await contract.mintCertificate(walletAddress, skill, score, level, uri, cvHash);
  const receipt = await tx.wait();

  let tokenId = null;
  for (const log of (receipt.logs || [])) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'CertificateMinted') { tokenId = parsed.args.tokenId.toString(); break; }
    } catch(e) {}
  }
  return { txHash: tx.hash, tokenId, explorerTx: EXPLORER_URL + '/tx/' + tx.hash };
}

// ── Llamada LLM con fallback automático Groq → MiniMax ───────────────────────
async function sdCallLLM(messages, { tools, maxTokens = 800, temperature = 0.7 } = {}) {
  // Intenta Groq si hay key
  if (GROQ_API_KEY) {
    try {
      const body = { model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens, temperature };
      if (tools) { body.tools = tools; body.tool_choice = 'auto'; }
      const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', body,
        { headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      console.log('[SD-LLM] Groq OK');
      return { provider: 'groq', data: r.data };
    } catch(e) {
      console.warn('[SD-LLM] Groq falló (' + (e.response?.status || e.message) + '), usando MiniMax...');
    }
  } else {
    console.log('[SD-LLM] Sin GROQ_API_KEY, usando MiniMax');
  }

  // Fallback: MiniMax via callAIMessages
  // MiniMax no soporta role:tool — filtrar y convertir solo a user/assistant
  const cleanMessages = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') continue; // se inyectó como user message antes
    if (m.role === 'user' || m.role === 'assistant') cleanMessages.push({ role: m.role, content: m.content || '' });
  }
  const baseSystem = messages.find(m => m.role === 'system')?.content || '';
  const minimaxSystem = baseSystem + '\n\nSi necesitas analizar un CV, optimizar un CV, generar carta o hacer quiz, responde con XML así:\n<minimax:tool_call>\n<invoke name="TOOL_NAME">\n<parameter name="PARAM">VALUE</parameter>\n</invoke>\n</minimax:tool_call>\n\nHerramientas disponibles: analyze_cv(url), optimize_cv(lang), generate_cover_letter(job_title,company), start_skill_quiz(skill,level). NUNCA pidas wallet address ni menciones NFT o blockchain por tu cuenta.';
  const text = await callAIMessages(cleanMessages, { maxTokens, system: minimaxSystem });
  return { provider: 'minimax', data: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }] } };
}

async function sdExecuteTool(toolName, args, session) {
  console.log('[SD-TOOL]', toolName);

  if (toolName === 'analyze_cv') {
    const dl     = await sdDownloadFile(args.url);
    const result = await sdCallBackend('/api/analyze-cv', { file: dl.file, filename: dl.filename });
    session.cvData = result;
    return JSON.stringify({ name: result.name, location: result.location, current_position: result.current_position,
      skills: result.skills, experience_years: result.experience_years, score: result.overall_score,
      level: result.level, suggested_roles: result.suggested_roles, strengths: result.strengths,
      improvements: result.improvements, web3_relevance: result.web3_relevance });
  }

  if (toolName === 'optimize_cv') {
    if (!session.cvData) return JSON.stringify({ error: 'No hay CV analizado. Primero analiza tu CV.' });
    const result = await sdCallBackend('/api/improve-cv', { cvData: session.cvData, lang: args.lang || 'es' });
    // Generar DOCX y guardar en Supabase con código de descarga
    let downloadCode = null;
    const dni = args.dni || session.userData?.id || null;
    try {
      const docxRes = await axios.post('http://localhost:' + PORT + '/api/download-cv-docx',
        { cvData: session.cvData, improved: result },
        { timeout: 90000, responseType: 'arraybuffer' }
      );
      const fileBase64 = Buffer.from(docxRes.data).toString('base64');
      downloadCode = await saveDownload({ type: 'cv', fileBase64, filename: 'CV_ATS_Optimizado.docx', dni });
    } catch (e) {
      console.error('[optimize_cv] Error guardando descarga:', e.message);
    }
    return JSON.stringify({
      ats_score: result.ats_score,
      professional_summary: result.professional_summary || result.summary,
      download_code: downloadCode,
    });
  }

  if (toolName === 'generate_cover_letter') {
    if (!session.cvData) return JSON.stringify({ error: 'No hay CV analizado. Primero analiza tu CV.' });
    const cv     = session.cvData;
    const target = (args.job_title ? ' para el puesto de ' + args.job_title : '') + (args.company ? ' en ' + args.company : '');
    const prompt = 'Genera una carta de presentacion profesional en español' + target + ' para ' + (cv.name || 'el candidato') +
      ', ' + (cv.current_position || 'profesional') + ' con skills en ' + (cv.skills || []).slice(0, 5).join(', ') +
      '. Formal, 3 párrafos, lista para enviar. Solo devuelve la carta, sin título ni encabezado adicional.';
    let letter = '';
    // Intentar Groq primero, fallback a callAI
    if (GROQ_API_KEY) {
      try {
        const r = await axios.post('https://api.groq.com/openai/v1/chat/completions',
          { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 600 },
          { headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' }, timeout: 20000 }
        );
        letter = r.data.choices[0].message.content;
      } catch(e) {
        console.warn('[generate_cover_letter] Groq falló:', e.message, '— usando MiniMax');
      }
    }
    if (!letter) {
      letter = await callAI(prompt, { maxTokens: 600 });
    }
    return JSON.stringify({ cover_letter: letter });
  }

  if (toolName === 'start_skill_quiz') {
    // Requiere CV cargado o datos mínimos del usuario
    if (!session.cvData && !session.userData) {
      session.pendingQuiz = { skill: args.skill, level: args.level || 'mid' };
      session.collectingUserData = { step: 'name' };
      return JSON.stringify({ error: 'need_user_data', message: 'Para generar tu certificado necesito algunos datos. ¿Cuál es tu nombre completo?' });
    }
    const result = await sdCallBackend('/api/generate-quiz', { skill: args.skill, level: args.level || 'mid', lang: 'es', mode: 'bot' });
    if (!result.quizId || !result.question) return JSON.stringify({ error: 'No se pudo generar el quiz.' });
    const q = result.question;
    session.quizState = {
      skill: args.skill, quizId: result.quizId,
      total: result.total, current: 1, answers: [],
      currentQuestion: q
    };
    return JSON.stringify({
      quiz_started: true, skill: args.skill,
      total_questions: result.total, question_number: 1,
      question: q.question, options: q.options || null, type: q.type
    });
  }

  if (toolName === 'mint_certificate') {
    if (!ethers.isAddress(args.wallet_address)) return JSON.stringify({ error: 'Wallet address inválida.' });
    const result = await sdMintOnChain(args.wallet_address, args.skill, args.score, args.level, session.cvData);
    return JSON.stringify(result);
  }

  if (toolName === 'get_user_profile') {
    if (!session.cvData) return JSON.stringify({ error: 'No hay CV analizado aún.' });
    return JSON.stringify(session.cvData);
  }

  return JSON.stringify({ error: 'Tool desconocida: ' + toolName });
}

async function sdRunAgent(userMessage, session) {
  session.history.push({ role: 'user', content: userMessage });
  if (session.history.length > 20) session.history = session.history.slice(-20);

  const cvContext = session.cvData ? `CV cargado: ${session.cvData.name || 'candidato'}, ${session.cvData.current_position || ''}, skills: ${(session.cvData.skills||[]).join(', ') || 'pendiente'}.` : '';
  const systemPrompt = `Tu nombre es LikeTalent. Eres un agente de validacion de talento Web3. ${cvContext}
Herramientas: analyze_cv(url), optimize_cv(lang), generate_cover_letter(job_title,company), start_skill_quiz(skill,level).
Si ya hay CV cargado, usalo directamente. NUNCA pidas wallet ni menciones blockchain salvo que el usuario envíe 0x.
Responde en español, breve y útil.`;

  const messages = [{ role: 'system', content: systemPrompt }, ...session.history];

  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    let result;
    try {
      // sdCallLLM decide automáticamente: Groq (con tools) o MiniMax (sin tools)
      result = await sdCallLLM(messages, { tools: SD_TOOLS });
    } catch(e) {
      console.error('[SD-AGENT] LLM error:', e.message);
      return 'No tengo conexión con el servicio de IA en este momento. Intenta de nuevo en unos minutos.';
    }

    const choice       = result.data.choices[0];
    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    // MiniMax devuelve tool calls como XML en el contenido — parsear y ejecutar
    if (result.provider === 'minimax') {
      const content = assistantMsg.content || '';
      const toolCallMatch = content.match(/<minimax:tool_call>[\s\S]*?<invoke name="(\w+)">([\s\S]*?)<\/invoke>[\s\S]*?<\/minimax:tool_call>/);
      if (toolCallMatch) {
        const toolName = toolCallMatch[1];
        const paramsXml = toolCallMatch[2];
        const args = {};
        const paramRegex = /<parameter name="(\w+)">([\s\S]*?)<\/parameter>/g;
        let m;
        while ((m = paramRegex.exec(paramsXml)) !== null) args[m[1]] = m[2].trim();
        console.log('[SD-AGENT] MiniMax tool call detectado:', toolName, args);
        let toolResult;
        try { toolResult = await sdExecuteTool(toolName, args, session); }
        catch(e) { toolResult = JSON.stringify({ error: e.message }); }
        // start_skill_quiz → formatear pregunta directamente sin revelar la respuesta
        if (toolName === 'start_skill_quiz') {
          const d = JSON.parse(toolResult);
          if (d.error === 'need_user_data') {
            session.history.push({ role: 'assistant', content: d.message });
            return d.message;
          }
          if (d.quiz_started) {
            let msg = `**Quiz: ${d.skill}** — Pregunta 1/${d.total_questions}\n\n${d.question}`;
            if (d.options) msg += '\n\n' + d.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
            session.history.push({ role: 'assistant', content: msg });
            console.log('[SD-REPLY] (minimax+quiz):', msg.substring(0, 100));
            return msg;
          }
        }
        // Segunda llamada a MiniMax con el resultado de la herramienta
        messages.push({ role: 'assistant', content: content });
        messages.push({ role: 'user', content: 'Resultado de ' + toolName + ': ' + toolResult + '\n\nResponde al usuario con los resultados en español, de forma clara y útil.' });
        const result2 = await sdCallLLM(messages, {});
        const finalText = result2.data.choices[0].message.content || 'Listo!';
        session.history.push({ role: 'assistant', content: finalText });
        console.log('[SD-REPLY] (minimax+tool):', finalText.substring(0, 200));
        return finalText;
      }
      const finalText = content || 'Listo!';
      session.history.push({ role: 'assistant', content: finalText });
      console.log('[SD-REPLY] (' + result.provider + '):', finalText.substring(0, 200));
      return finalText;
    }

    // Groq: finish_reason === 'tool_calls'
    if (choice.finish_reason !== 'tool_calls' || !assistantMsg.tool_calls) {
      const finalText = assistantMsg.content || 'Listo!';
      session.history.push({ role: 'assistant', content: finalText });
      console.log('[SD-REPLY] (groq):', finalText.substring(0, 200));
      return finalText;
    }

    for (const toolCall of assistantMsg.tool_calls) {
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments); } catch(e) {}
      let toolResult;
      try { toolResult = await sdExecuteTool(toolCall.function.name, args, session); }
      catch(e) { console.error('[SD-TOOL ERROR]', toolCall.function.name, e.message); toolResult = JSON.stringify({ error: e.message }); }

      // start_skill_quiz → devolver pregunta directamente sin re-pasar por el LLM
      if (toolCall.function.name === 'start_skill_quiz') {
        const d = JSON.parse(toolResult);
        if (d.error === 'need_user_data') {
          session.history.push({ role: 'assistant', content: d.message });
          return d.message;
        }
        if (d.quiz_started) {
          let msg = `**Quiz: ${d.skill}** — Pregunta 1/${d.total_questions}\n\n${d.question}`;
          if (d.options) msg += '\n\n' + d.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
          session.history.push({ role: 'assistant', content: msg });
          return msg;
        }
      }

      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });
    }
  }
  return 'No pude completar la acción. Intenta de nuevo.';
}

// sdExtractText eliminado — el SDK (@superdapp/agents) decodifica el payload
// internamente via processRequest / parseMessage.

function sdIsWallet(text) {
  return /^0x[a-fA-F0-9]{40}$/.test(text.trim());
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER GENÉRICO — mismo agente para SuperDapp, Discord y Telegram
// sendFn: async (text) → envía el mensaje al canal correspondiente
// ═══════════════════════════════════════════════════════════════════════════
async function handleMessage(text, sessionKey, sendFn, platform) {
  const session = getSdSession(sessionKey);
  console.log('[' + platform + '] msg:', text.substring(0, 80), '| session:', sessionKey);
  console.log('[' + platform + '] quizState:', session.quizState ? `activo skill=${session.quizState.skill} current=${session.quizState.current}/${session.quizState.total} answers=${session.quizState.answers.length}` : 'null');
  console.log('[' + platform + '] pendingCert:', session.pendingCertificate ? session.pendingCertificate.skill : 'null');

  // 0. Comandos especiales
  if (text.startsWith('/generate-test-certificate') || text.startsWith('/generar-certificado-prueba')) {
    const skills = ['Solidity', 'React', 'Node.js', 'Smart Contracts', 'Web3.js', 'TypeScript'];
    const levels = ['Junior', 'Mid', 'Senior'];
    const skill  = skills[Math.floor(Math.random() * skills.length)];
    const level  = levels[Math.floor(Math.random() * levels.length)];
    const score  = Math.floor(Math.random() * 30) + 70; // 70-100
    await sendFn(`Generando certificado de prueba: **${skill}** — ${level} (${score}/100)...`);
    try {
      console.log('[TEST-CERT] Generando PDF | skill:', skill, '| level:', level, '| score:', score);
      const pdfBuffer = await buildCertificatePDF({
        skill, score, level,
        wallet: 'LikeTalent-Test',
        issuedAt: new Date().toISOString(),
        contentHash: null, explorerUrl: null
      });
      console.log('[TEST-CERT] PDF generado | tamaño:', pdfBuffer.length, 'bytes');
      await sendFn('🎓 Certificado de prueba generado:', { buffer: pdfBuffer, name: `test-certificado-${skill.replace(/\s+/g,'-')}.pdf` });
    } catch(e) {
      console.error('[TEST-CERT] Error:', e.message, e.stack);
      await sendFn('Error generando certificado: ' + e.message);
    }
    return;
  }

  // 0b. Recopilando datos del usuario antes del quiz
  if (session.collectingUserData && !text.startsWith('/')) {
    const step = session.collectingUserData.step;
    if (step === 'name') {
      session.collectingUserData = { step: 'id', name: text.trim() };
      await sendFn(`Gracias **${text.trim()}**. Ahora indícame tu número de identificación (cédula, pasaporte, etc.):`);
      return;
    }
    if (step === 'id') {
      session.userData = { name: session.collectingUserData.name, id: text.trim() };
      session.collectingUserData = null;
      console.log('[QUIZ] Datos recopilados:', session.userData);
      // Iniciar el quiz pendiente
      if (session.pendingQuiz) {
        const { skill, level } = session.pendingQuiz;
        session.pendingQuiz = null;
        await sendFn(`Perfecto. Iniciando quiz de **${skill}** (${level})...`);
        const result = await sdCallBackend('/api/generate-quiz', { skill, level, lang: 'es', mode: 'bot' });
        if (!result.quizId || !result.question) { await sendFn('Error al generar el quiz. Intenta de nuevo.'); return; }
        const q = result.question;
        session.quizState = { skill, quizId: result.quizId, total: result.total, current: 1, answers: [], currentQuestion: q };
        let msg = `**Quiz: ${skill}** — Pregunta 1/${result.total}\n\n${q.question}`;
        if (q.options) msg += '\n\n' + q.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
        await sendFn(msg);
        return;
      }
    }
    return;
  }

  // 1. Quiz activo — colectar respuesta
  if (session.quizState && !text.startsWith('/')) {
    const quiz = session.quizState;
    quiz.answers.push(text.trim());

    if (quiz.current < quiz.total) {
      // Pedir siguiente pregunta al backend
      try {
        const next = await sdCallBackend('/api/quiz-next', { quizId: quiz.quizId });
        quiz.current++;
        quiz.currentQuestion = next.question;
        const q = next.question;
        let msg = `**Quiz: ${quiz.skill}** — Pregunta ${quiz.current}/${quiz.total}\n\n${q.question}`;
        if (q.options) msg += '\n\n' + q.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
        await sendFn(msg);
      } catch(e) {
        await sendFn('Error obteniendo siguiente pregunta. Intenta de nuevo.');
      }
    } else {
      await sendFn('Evaluando tus respuestas...');
      const savedQuiz = { ...quiz };
      session.quizState = null;
      console.log('[QUIZ] Submitting | quizId:', savedQuiz.quizId, '| answers:', savedQuiz.answers);

      // Evaluar con las preguntas acumuladas y respuestas
      let result;
      try {
        const evalResult = await sdCallBackend('/api/submit-quiz', { quizId: savedQuiz.quizId, answers: savedQuiz.answers });
        result = evalResult;
        console.log('[QUIZ] Submit result | score:', result.score, '| passed:', result.passed);
      } catch(e) {
        console.error('[QUIZ] Submit error:', e.message);
        await sendFn('Error al evaluar. Intenta de nuevo.'); return;
      }

      const passed = result.passed || result.score >= PASS_SCORE;
      const level  = result.level || (result.score >= 80 ? 'Senior' : result.score >= 60 ? 'Mid' : 'Junior');
      let msg = `**Quiz de ${savedQuiz.skill} completado!**\n\nScore: **${result.score}/100** — Nivel: ${level}\n`;

      // Mostrar revisión de respuestas
      if (result.results && result.results.length) {
        msg += '\n**Revisión:**\n';
        result.results.forEach((r, i) => {
          const icon = r.isCorrect ? '✅' : '❌';
          const correctOption = r.options ? r.options[r.correct] : r.model_answer || '';
          msg += `\n${icon} P${i + 1}: ${r.question.substring(0, 60)}...\n`;
          if (!r.isCorrect) msg += `   Respuesta correcta: **${correctOption}**\n`;
        });
      }

      if (passed) {
        msg += '\n✅ Aprobaste!';
        await sendFn(msg);
        // Generar PDF automáticamente
        try {
          console.log('[QUIZ] Generando PDF certificado...');
          const holderName = session.cvData?.name || session.userData?.name || 'Participante';
          const holderId   = session.userData?.id || null;
          const pdfBuffer = await buildCertificatePDF({
            skill: savedQuiz.skill, score: result.score, level,
            wallet: holderId ? `ID: ${holderId}` : holderName,
            issuedAt: new Date().toISOString(),
            contentHash: null, explorerUrl: null
          });
          console.log('[QUIZ] PDF generado | tamaño:', pdfBuffer.length, 'bytes');
          // Guardar certificado en Supabase y enviar código de descarga
          const certDni = session.userData?.id || null;
          let certCode = null;
          try {
            certCode = await saveDownload({
              type: 'cert',
              fileBase64: pdfBuffer.toString('base64'),
              filename: `certificado-${savedQuiz.skill.replace(/\s+/g, '-')}.pdf`,
              dni: certDni,
            });
          } catch(saveErr) {
            console.error('[QUIZ] Error guardando certificado en Supabase:', saveErr.message);
          }
          if (certCode) {
            if (certDni) {
              // Con DNI: requiere POST, enviar código + instrucciones
              await sendFn(`🎓 ¡Tu certificado está listo!\n\n📥 Código: \`${certCode}\`\n🔐 Contraseña: tu número de documento (${certDni.slice(0,3)}***)\n\nDescárgalo en: ${getBaseUrl()}/api/download\n_(válido por 7 días)_`);
            } else {
              // Sin DNI: link directo clickeable
              await sendFn(`🎓 ¡Tu certificado está listo!\n\n👇 Descarga directa (válido 7 días):\n${getBaseUrl()}/api/download/${certCode}`);
            }
          } else {
            // Fallback: enviar adjunto si Supabase no está configurado
            await sendFn('🎓 Tu certificado está listo:', { buffer: pdfBuffer, name: `certificado-${savedQuiz.skill.replace(/\s+/g,'-')}.pdf` });
          }
        } catch(e) {
          console.error('[QUIZ] Error generando PDF:', e.message, e.stack?.split('\n')[1]);
          await sendFn('Hubo un error generando el PDF. Contacta al soporte.');
        }
        // Guardar para mint opcional pero NO mencionarlo — solo si el usuario manda 0x
        session.pendingCertificate = { skill: savedQuiz.skill, score: result.score, level };
        return;
      } else {
        msg += '\n\nNecesitas ' + PASS_SCORE + '/100 para aprobar. Puedes intentarlo de nuevo.';
      }
      await sendFn(msg);
    }
    return;
  }

  // 2. Certificado pendiente
  if (session.pendingCertificate && !sdIsWallet(text)) {
    // No es wallet — limpiar y dejar que el agente responda normalmente
    session.pendingCertificate = null;
  }
  if (session.pendingCertificate && sdIsWallet(text)) {
    const cert = { ...session.pendingCertificate };
    session.pendingCertificate = null;
    await sendFn('Emitiendo certificado en blockchain... puede tardar 15-30 segundos.');
    try {
      const result = await sdMintOnChain(text.trim(), cert.skill, cert.score, cert.level, session.cvData);
      await sendFn('Certificado emitido en zkSYS Testnet!\n\nSkill: ' + cert.skill + '\nScore: ' + cert.score + '/100 — ' + cert.level +
        '\nToken ID: #' + result.tokenId + '\nTx: ' + result.explorerTx + '\n\nTu certificado es Soulbound (no transferible).');
    } catch(e) {
      console.error('[' + platform + '] Mint error:', e.message);
      await sendFn('Error al emitir certificado. Intenta de nuevo más tarde.');
    }
    return;
  }

  // 3. Detección de intención del agente — ejecutar herramientas directamente sin depender del LLM
  const lower = text.toLowerCase();

  // 3a. Quiz / validar skill: el agente inicia el quiz real con herramienta
  const quizGeneric = ['un skill', 'una skill', 'skill', 'skil', 'skills', 'una habilidad', 'un conocimiento',
    'mis skills', 'mis habilidades', 'habilidad', 'conocimiento', 'algo', 'cualquiera', 'lo que sea'];
  const quizMatch = lower.match(/(?:validar|quiz|evaluar|certificar|examen|test)\s+(?:de\s+|en\s+|mi\s+|un\s+|una\s+)?([\w\s.#+áéíóúñ��]+)/i);
  // También capturar "validar" o "quiero validar" sin skill especificado
  const quizBare = !quizMatch && /^(?:validar|quiz|evaluar|certificar|examen|quiero\s+validar|hacer\s+quiz)\s*$/i.test(lower.trim());
  if ((quizMatch || quizBare) && !session.quizState) {
    const rawSkill = quizMatch ? quizMatch[1].trim() : '';
    // Si el skill es genérico o muy corto, preguntar cuál
    if (!rawSkill || quizGeneric.includes(rawSkill.toLowerCase()) || rawSkill.length < 3) {
      // Sugerir skills del CV si está cargado
      const cvSkills = session.cvData?.skills;
      const suggestions = cvSkills && cvSkills.length > 0
        ? cvSkills.slice(0, 6).map(s => `**${s}**`).join(', ')
        : '**React**, **Python**, **GCP**, **Jira**, **Solidity**...';
      const askMsg = `¿Qué skill quieres validar?\n\nOpciones: ${suggestions}\n\nTambién puedes indicar el nivel: básico, intermedio o avanzado.`;
      session.history.push({ role: 'user', content: text });
      session.history.push({ role: 'assistant', content: askMsg });
      session.pendingQuizIntent = true;
      await sendFn(askMsg);
      return;
    }
    const level = lower.includes('senior') ? 'senior' : lower.includes('junior') ? 'junior' : 'mid';
    console.log('[AGENT] Intención detectada: start_skill_quiz | skill:', rawSkill, '| level:', level);
    try {
      const result = await sdExecuteTool('start_skill_quiz', { skill: rawSkill, level }, session);
      const data = JSON.parse(result);
      if (data.error === 'need_user_data') {
        session.history.push({ role: 'user', content: text });
        session.history.push({ role: 'assistant', content: data.message });
        await sendFn(data.message);
      } else if (data.quiz_started) {
        let msg = `**Quiz: ${data.skill}** — Pregunta 1/${data.total_questions}\n\n${data.question}`;
        if (data.options) msg += '\n\n' + data.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
        session.history.push({ role: 'user', content: text });
        session.history.push({ role: 'assistant', content: msg });
        await sendFn(msg);
      } else {
        await sendFn(data.error || 'No se pudo generar el quiz. Intenta de nuevo.');
      }
    } catch(e) {
      console.error('[AGENT] Error quiz:', e.message);
      await sendFn('Error iniciando quiz: ' + e.message);
    }
    return;
  }

  // 3a-bis. Respuesta pendiente de quiz: el usuario indica el skill después de que se le preguntó
  if (session.pendingQuizIntent && !session.quizState) {
    session.pendingQuizIntent = false;
    const level = lower.includes('senior') ? 'senior' : lower.includes('junior') ? 'junior' : 'mid';
    const skill = text.replace(/\b(junior|mid|senior|nivel)\b/gi, '').trim();
    if (skill.length < 2) {
      await sendFn('Indica el nombre del skill. Ejemplo: **React**, **Python**, **GCP**.');
      session.pendingQuizIntent = true;
      return;
    }
    console.log('[AGENT] Quiz pendiente resuelto | skill:', skill, '| level:', level);
    try {
      const result = await sdExecuteTool('start_skill_quiz', { skill, level }, session);
      const data = JSON.parse(result);
      if (data.error === 'need_user_data') {
        session.history.push({ role: 'user', content: text });
        session.history.push({ role: 'assistant', content: data.message });
        await sendFn(data.message);
      } else if (data.quiz_started) {
        let msg = `**Quiz: ${data.skill}** — Pregunta 1/${data.total_questions}\n\n${data.question}`;
        if (data.options) msg += '\n\n' + data.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
        session.history.push({ role: 'user', content: text });
        session.history.push({ role: 'assistant', content: msg });
        await sendFn(msg);
      } else {
        await sendFn(data.error || 'No se pudo generar el quiz. Intenta de nuevo.');
      }
    } catch(e) {
      console.error('[AGENT] Error quiz:', e.message);
      await sendFn('Error iniciando quiz: ' + e.message);
    }
    return;
  }

  // 3b. Carta de presentación: el agente detecta y ejecuta
  if (session.cvData) {
    if (lower.includes('carta') && lower.includes('presentaci')) {
      const parts = text.match(/(?:de|como|puesto)?\s*([\w\s]+?)(?:\s+(?:en|para|at|empresa)\s+)([\w\s]+)/i);
      const jobTitle = parts ? parts[1].trim() : '';
      const company = parts ? parts[2].trim() : '';
      if (jobTitle && company) {
        console.log('[AGENT] Intención detectada: generate_cover_letter | job:', jobTitle, '| company:', company);
        await sendFn('Generando carta de presentación...');
        try {
          const result = await sdExecuteTool('generate_cover_letter', { job_title: jobTitle, company }, session);
          const data = JSON.parse(result);
          if (data.cover_letter) {
            session.history.push({ role: 'user', content: text });
            session.history.push({ role: 'assistant', content: data.cover_letter });
            await sendFn(data.cover_letter);
          } else {
            await sendFn('No pude generar la carta. Intenta de nuevo.');
          }
        } catch(e) {
          console.error('[AGENT] Error cover letter:', e.message);
          await sendFn('Error generando la carta: ' + e.message);
        }
        return;
      }
    }

    // 3c. Optimizar CV: el agente detecta y ejecuta
    if (lower.includes('optimiz') && (lower.includes('cv') || lower.includes('currículum') || lower.includes('curriculum'))) {
      const lang = lower.includes('english') || lower.includes('inglés') || lower.includes('ingles') ? 'en' : 'es';
      console.log('[AGENT] Intención detectada: optimize_cv | lang:', lang);
      await sendFn('Optimizando tu CV...');
      try {
        const result = await sdExecuteTool('optimize_cv', { lang }, session);
        const data = JSON.parse(result);
        const reply = data.error
          ? data.error
          : `**CV Optimizado** ✅\n\nATS Score: **${data.ats_score || 'N/A'}**\n\n${data.professional_summary || ''}${data.download_code ? `\n\n📥 **Código de descarga:** \`${data.download_code}\`\n🔐 Contraseña: tu DNI/cédula\n_(válido 7 días — descarga en ${BACKEND_URL}/api/download)_` : ''}`;
        session.history.push({ role: 'user', content: text });
        session.history.push({ role: 'assistant', content: reply });
        await sendFn(reply);
      } catch(e) {
        console.error('[AGENT] Error optimize:', e.message);
        await sendFn('Error optimizando: ' + e.message);
      }
      return;
    }
  }

  // 4. Agente LLM con tool calling (fallback general)
  const reply = await sdRunAgent(text, session);
  await sendFn(reply);

}

// ── SuperDapp Webhook ─────────────────────────────────────────────────────────
// Usa agent.processRequest(body) según la documentación oficial del SDK:
// https://github.com/SuperDappAI/superdapp-js/blob/master/docs/README.md
app.post('/webhook', async function(req, res) {
  res.status(200).send('OK');
  if (!sdAgent) return;
  try {
    const payload = req.body;
    // Responder al challenge de verificación de SuperDapp
    if (payload && payload.challenge) return;

    // Registrar los handlers la primera vez que llega un mensaje
    sdRegisterHandlers();

    console.log('[SD] payload raw:', JSON.stringify(payload));

    // Delegar toda la lógica de parsing y routing al SDK oficial
    await sdAgent.processRequest(payload);
  } catch(e) {
    console.error('[SD] Webhook error:', e.message);
  }
});

// ── Telegram Webhook ──────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

async function tgSend(chatId, text) {
  // Telegram limita mensajes a 4096 chars — dividir si es necesario
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (const chunk of chunks) {
    await axios.post('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', {
      chat_id: chatId, text: chunk, parse_mode: 'Markdown'
    }).catch(() =>
      axios.post('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage', {
        chat_id: chatId, text: chunk
      })
    );
  }
}

async function tgSendDocument(chatId, buffer, filename, caption) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', buffer, { filename: filename || 'documento.pdf', contentType: 'application/pdf' });
  if (caption) form.append('caption', caption);
  await axios.post('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendDocument', form, {
    headers: form.getHeaders(), timeout: 30000
  });
}

if (TELEGRAM_TOKEN) {
  console.log('[Telegram] Bot configurado');
} else {
  console.log('[Telegram] TELEGRAM_BOT_TOKEN no configurado');
}

app.post('/telegram', async function(req, res) {
  res.status(200).send('OK');
  if (!TELEGRAM_TOKEN) return;
  try {
    const update  = req.body;
    const message = update.message || update.channel_post;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const text   = message.text.trim();
    const isBot  = message.from && message.from.is_bot;
    if (isBot) return;

    const sendFn = async (msg, file) => {
      if (file) {
        if (msg) await tgSend(chatId, msg);
        await tgSendDocument(chatId, file.buffer, file.name);
      } else {
        await tgSend(chatId, msg);
      }
    };
    await handleMessage(text, 'tg_' + chatId, sendFn, 'Telegram');
  } catch(e) {
    console.error('[Telegram] Error:', e.message);
  }
});

// Endpoint para registrar el webhook de Telegram automáticamente
app.get('/telegram/setup', async function(req, res) {
  if (!TELEGRAM_TOKEN) return res.json({ error: 'TELEGRAM_BOT_TOKEN no configurado' });
  const webhookUrl = BACKEND_URL + '/telegram';
  try {
    const r = await axios.post('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/setWebhook', { url: webhookUrl });
    res.json({ ok: true, webhookUrl, result: r.data });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ── Discord Bot ───────────────────────────────────────────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || '';
const DISCORD_GENERAL_CHANNEL = process.env.DISCORD_GENERAL_CHANNEL || '1495864406662316096';

if (DISCORD_TOKEN) {
  try {
    const { Client, GatewayIntentBits, Partials } = require('discord.js');
    const dcClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
      ],
      partials: [Partials.Channel, Partials.Message]
    });

    dcClient.once('ready', () => {
      console.log('[Discord] Bot conectado como', dcClient.user.tag);
      // Enviar saludo al canal general al conectarse
      const generalChannel = dcClient.channels.cache.get(DISCORD_GENERAL_CHANNEL);
      if (generalChannel) generalChannel.send('Agente LikeTalent conectado y listo.');
    });

    dcClient.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      let text = message.content.trim();
      const hasAttachment = message.attachments.size > 0;

      console.log(`[Discord] messageCreate | usuario: ${message.author.username} | texto: "${text.substring(0, 80)}" | adjuntos: ${message.attachments.size}`);

      if (!text && !hasAttachment) {
        console.log('[Discord] Mensaje vacío sin adjuntos, ignorando');
        return;
      }

      // Siempre responder en #general si el mensaje viene de ese servidor
      const targetChannel = message.guildId
        ? (dcClient.channels.cache.get(DISCORD_GENERAL_CHANNEL) || message.channel)
        : message.channel;

      const sessionKey = 'dc_' + (message.guildId ? DISCORD_GENERAL_CHANNEL + '_' + message.author.id : message.author.id);
      const sendFn = async (msg, file) => {
        console.log(`[Discord] ENVIANDO → "${(msg||'').substring(0, 120)}"`);
        if (file) {
          await targetChannel.send({ content: msg || '', files: [{ attachment: file.buffer, name: file.name }] });
        } else {
          for (let i = 0; i < msg.length; i += 1900) {
            await targetChannel.send(msg.slice(i, i + 1900));
          }
        }
      };

      try {
        // Archivo adjunto → llamar analyze_cv directamente sin pasar por el LLM
        if (hasAttachment) {
          const attachment = message.attachments.first();
          const ext = (attachment.name || '').split('.').pop().toLowerCase();
          console.log(`[Discord] ATTACHMENT | archivo: ${attachment.name} | ext: ${ext} | url: ${attachment.url.substring(0, 80)}`);
          if (['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
            await sendFn('Analizando tu CV... un momento ⏳');
            const session = getSdSession(sessionKey);
            console.log('[Discord] → sdExecuteTool analyze_cv START');
            const result = await sdExecuteTool('analyze_cv', { url: attachment.url }, session);
            console.log('[Discord] → sdExecuteTool analyze_cv END');
            const data = JSON.parse(result);
            const score = data.score || data.overall_score || session.cvData?.overall_score || 0;
            const reply = `**Análisis de CV completado** ✅\n\n` +
              `👤 **${data.name || 'Sin nombre'}** — ${data.current_position || ''}\n` +
              `📊 Score: **${score}/100** | Web3: ${data.web3_relevance || 'N/A'}\n` +
              `🛠 Skills: ${(data.skills || []).slice(0, 6).join(', ')}\n` +
              `💡 Mejoras: ${(data.improvements || []).slice(0, 2).join(' | ')}\n\n` +
              `Puedes pedirme: **optimizar CV**, **carta de presentación** o **validar un skill**.`;
            await sendFn(reply);
            // Guardar en historial para que el agente sepa que ya tiene CV
            const cvSummary = `[CV CARGADO] Analicé el CV de ${data.name || 'usuario'}. Posición: ${data.current_position || 'no especificada'}. Skills: ${(data.skills||[]).join(', ') || 'pendiente de análisis'}. Score: ${score}/100. El CV ya está en mi memoria, puedo optimizarlo, generar carta de presentación o hacer quiz sin pedirlo de nuevo.`;
            getSdSession(sessionKey).history.push({ role: 'assistant', content: cvSummary });
          } else {
            console.log('[Discord] Adjunto no es CV, ignorando ext:', ext);
            await sendFn('Solo acepto archivos PDF, DOCX o TXT.');
          }
          return;
        }

        console.log(`[Discord] RECIBIDO texto | usuario: ${message.author.username} | msg: "${text.substring(0, 120)}"`);
        await handleMessage(text, sessionKey, sendFn, 'Discord');
      } catch(e) {
        console.error('[Discord] ERROR:', e.message, e.stack?.split('\n')[1]);
        await sendFn('Ocurrió un error procesando tu solicitud. Intenta de nuevo.');
      }
    });

    dcClient.login(DISCORD_TOKEN);
  } catch(e) {
    console.error('[Discord] Error al inicializar:', e.message);
  }
} else {
  console.log('[Discord] DISCORD_TOKEN no configurado');
}

// ============================================
// DESCARGA DE ARCHIVOS — código + DNI
// ============================================

// GET /api/download-info/:code — devuelve metadata del archivo (sin el archivo)
app.get('/api/download-info/:code', async (req, res) => {
  const code = req.params.code?.trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Código requerido' });
  const entry = await sbFetch('downloads', { code });
  if (!entry) return res.status(404).json({ error: 'Código no encontrado' });
  if (new Date(entry.expires_at) < new Date()) return res.status(410).json({ error: 'Código expirado' });
  res.json({
    type: entry.type,
    filename: entry.filename,
    requires_dni: !!entry.dni_hash,
    expires_at: entry.expires_at,
  });
});

// POST /api/download — descarga el archivo con código + DNI
app.post('/api/download', async (req, res) => {
  const { code, dni } = req.body;
  if (!code) return res.status(400).json({ error: 'El código de descarga es requerido' });

  const entry = await sbFetch('downloads', { code: code.trim().toUpperCase() });
  if (!entry) return res.status(404).json({ error: 'Código no encontrado o ya utilizado' });

  if (new Date(entry.expires_at) < new Date()) {
    return res.status(410).json({ error: 'El código ha expirado (válido 7 días)' });
  }

  // Validar DNI si el archivo tiene protección
  if (entry.dni_hash) {
    if (!dni) return res.status(401).json({ error: 'Se requiere el DNI para descargar este archivo' });
    if (hashDNI(dni) !== entry.dni_hash) {
      return res.status(403).json({ error: 'DNI incorrecto' });
    }
  }

  const fileBuffer = Buffer.from(entry.file_base64, 'base64');
  const isDocx = entry.filename?.endsWith('.docx');
  const contentType = isDocx
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf';

  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename || 'descarga'}"`);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', fileBuffer.length);
  console.log(`[Download] Descargado | code: ${code} | type: ${entry.type} | size: ${fileBuffer.length} bytes`);
  res.send(fileBuffer);
});

// GET /api/download/:code — link directo para SuperDapp (sin DNI, solo certs no protegidos)
app.get('/api/download/:code', async (req, res) => {
  const code = req.params.code?.trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Código requerido' });

  const entry = await sbFetch('downloads', { code });
  if (!entry) return res.status(404).send('Código no encontrado o expirado.');

  if (new Date(entry.expires_at) < new Date()) {
    return res.status(410).send('Este link ha expirado.');
  }

  if (entry.dni_hash) {
    return res.status(403).send('Este archivo requiere contraseña. Usa POST /api/download con tu DNI.');
  }

  const fileBuffer = Buffer.from(entry.file_base64, 'base64');
  const isDocx = entry.filename?.endsWith('.docx');
  const contentType = isDocx
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf';

  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename || 'certificado.pdf'}"`);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', fileBuffer.length);
  console.log(`[Download-GET] Descargado | code: ${code} | type: ${entry.type} | size: ${fileBuffer.length} bytes`);
  res.send(fileBuffer);
});

app.listen(PORT, () => {
  console.log('LikeTalent Backend running on http://localhost:' + PORT);
  console.log('Supabase URL:', SUPABASE_URL || 'NO configurado');
});

module.exports = app;
