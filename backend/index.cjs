// LikeTalent Backend Server
require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { callAI, parseJSON } = require('./ai.cjs');

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

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:5173',
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

  // PDF: extraer texto con pdfjs-dist
  if (ext === 'pdf') {
    try {
      const path = require('path');
      const { pathToFileURL } = require('url');
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const workerSrc = pathToFileURL(path.resolve(__dirname, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs')).href;
      GlobalWorkerOptions.workerSrc = workerSrc;

      const data = new Uint8Array(fileBuffer);
      const pdf = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        text += tc.items.map(item => item.str).join(' ') + '\n';
      }
      if (text.trim().length > 20) {
        console.log('[OCR] pdfjs-dist extrajo', text.length, 'chars,', pdf.numPages, 'páginas');
        return text;
      }
    } catch (e) {
      console.log('[OCR] pdfjs-dist falló:', e.message);
    }

    console.log('[OCR] No se pudo extraer texto del PDF');
    return '';
  }

  // Fallback: Tesseract OCR (solo para imágenes, NO para PDFs)
  try {
    const { createWorker } = require('tesseract.js');
    console.log('[OCR] Iniciando Tesseract...');
    const worker = await createWorker('spa+eng');
    const { data: { text } } = await worker.recognize(fileBuffer);
    await worker.terminate();
    console.log('[OCR] Tesseract extrajo', text.length, 'chars');
    return text;
  } catch (e) {
    console.log('[OCR] Tesseract falló:', e.message);
    return '';
  }
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

// In-memory quiz sessions: quizId → { questions (full), expiresAt }
const quizSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of quizSessions) {
    if (session.expiresAt < now) quizSessions.delete(id);
  }
}, 10 * 60 * 1000);

app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { skill, level = 'mid', lang = 'en' } = req.body;
    if (!skill) return res.status(400).json({ error: 'skill required' });

    const langLabel = lang === 'es' ? 'Spanish' : 'English';
    const langNote  = lang === 'es' ? 'Escribe TODO en español.' : 'Write everything in English.';

    console.log('[Quiz] Generating for:', skill, level, lang);

    const prompt = `You are LikeTalent, a talent validator. Generate a quiz with 8 questions to validate REAL proficiency in "${skill}" at ${level} level. ${langNote}

Mix these types (distribute them across the 8 questions):
- "multiple_choice": 4 options, one correct. Good for concepts and best-practices.
- "code_trace": show a short code snippet, ask what it outputs or what is wrong. Use "multiple_choice" format with options.
- "open": a practical/logical reasoning question. No options. The candidate writes a free-text answer.

Anti-AI rules:
- Avoid questions that can be answered by simply googling a definition.
- Prefer "given this real situation, what would you do and why?" scenarios.
- For code_trace, use non-trivial logic (closures, async, edge cases, type coercion, etc.).
- Open questions must require reasoning, not just reciting facts.

Respond ONLY with a valid JSON array, no markdown:
[
  {
    "type": "multiple_choice",
    "question": "...",
    "options": ["A","B","C","D"],
    "correct": 0,
    "explanation": "..."
  },
  {
    "type": "code_trace",
    "question": "What does this code output?",
    "code": "// short snippet here",
    "options": ["A","B","C","D"],
    "correct": 2,
    "explanation": "..."
  },
  {
    "type": "open",
    "question": "Practical/logical question here...",
    "model_answer": "A strong answer should mention: ...",
    "explanation": "..."
  }
]`;

    const raw = await callAI(prompt, { maxTokens: 8000, prefill: '[' });
    console.log('[Quiz] Raw length:', raw.length, '| preview:', raw.slice(0, 80));

    const questions = parseJSON(raw);
    if (!Array.isArray(questions) || questions.length === 0) {
      console.error('[Quiz] Parse failed. Last 300:', raw.slice(-300));
      return res.status(500).json({ error: 'AI did not return valid quiz format' });
    }

    const quizId = require('crypto').randomUUID();
    quizSessions.set(quizId, {
      skill, level, lang, questions,
      expiresAt: Date.now() + 30 * 60 * 1000
    });

    console.log('[Quiz] Generated', questions.length, 'questions |', quizId);

    // Send sanitized — no correct index or model_answer
    const sanitized = questions.map(q => ({
      type: q.type,
      question: q.question,
      code: q.code || null,
      options: q.options || null
    }));

    res.json({ quizId, skill, level, lang, questions: sanitized });

  } catch (error) {
    console.error('[Quiz] Error:', error.message);
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
      const isCorrect = userAnswer === q.correct;
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

app.listen(PORT, () => {
  console.log('LikeTalent Backend running on http://localhost:' + PORT);
  console.log('Supabase URL:', SUPABASE_URL || 'NO configurado');
});

module.exports = app;
