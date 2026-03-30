// ETHV Backend Server
require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const OPENCLAW_HOST = '127.0.0.1';
const OPENCLAW_PORT = 18789;
const OPENCLAW_TOKEN = 'bd1177ff2d28a2c4ceew1e08fee975fc9';

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
  res.json({ status: 'ok', service: 'ethv-backend' });
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
// SUPABASE
// ============================================

async function saveToSupabase(data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[Supabase] Not configured, skipping save');
    return { success: false, reason: 'not configured' };
  }

  const payload = {
    email: data.email || null,
    name: data.name || null,
    phone: data.phone || null,
    location: data.location || null,
    linkedin: data.linkedin || null,
    github: data.github || null,
    portfolio: data.portfolio || null,
    current_position: data.current_position || null,
    company: data.company || null,
    experience_years: data.experience_years || 0,
    overall_score: data.score || 0,
    ats_score: data.ats_score || 0,
    estimated_level: data.level || null,
    summary: data.summary || null,
    web3_relevance: data.web3_relevance || 'low',
    skills: data.skills ? JSON.stringify(data.skills) : null,
    certifications: data.certifications ? JSON.stringify(data.certifications) : null,
    education: data.education ? JSON.stringify(data.education) : null,
    languages: data.languages ? JSON.stringify(data.languages) : null,
    raw_response: JSON.stringify(data),
    created_at: new Date().toISOString()
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/cv_analyses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Supabase] Error:', error);
      return { success: false, error };
    }

    console.log('[Supabase] CV guardado OK');
    return { success: true };
  } catch (err) {
    console.error('[Supabase] Exception:', err.message);
    return { success: false, error: err.message };
  }
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
    // Extracción de texto con pdfjs-dist
    try {
      const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) });
      const pdfDoc = await loadingTask.promise;
      let fullText = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
      }
      if (fullText.trim().length > 50) {
        console.log('[OCR] pdfjs-dist extrajo', fullText.length, 'chars');
        return fullText;
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
// ANÁLISIS CON OPENCLAW
// ============================================

function callOpenClaw(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'MiniMax-M2.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3
    });

    const options = {
      hostname: OPENCLAW_HOST,
      port: OPENCLAW_PORT,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + OPENCLAW_TOKEN,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('OpenClaw parse error: ' + e.message)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
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

    if (!file) return res.status(400).json({ error: 'No file provided' });

    const fileBuffer = Buffer.from(file, 'base64');

    // 1. Extraer texto
    console.log('[CV] Extrayendo texto de:', filename);
    const extractedText = await extractTextFromFile(fileBuffer, filename);
    console.log('[CV] Texto extraído:', extractedText.length, 'chars');

    // 2. Construir prompt y llamar a OpenClaw
    const prompt = `Eres ETHV, agente de validación de talento Web3. Analiza este CV y extrae SOLO un JSON con estos campos exactos:
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
      console.log('[CV] Enviando a OpenClaw...');
      const aiResult = await callOpenClaw(prompt);
      const content = aiResult?.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cvData = JSON.parse(jsonMatch[0]);
        console.log('[CV] JSON extraído correctamente');
      } else {
        console.log('[CV] No se encontró JSON en respuesta de OpenClaw');
      }
    } catch (e) {
      console.error('[CV] OpenClaw error:', e.message);
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
      analyzed_at: new Date().toISOString()
    };

    // 4. Guardar en Supabase (sin bloquear la respuesta)
    saveToSupabase(fullResult).then(r => console.log('[Supabase] Resultado:', JSON.stringify(r))).catch(e => console.error('[Supabase] Error async:', e.message));

    // 5. Responder al frontend
    res.json(fullResult);

  } catch (error) {
    console.error('[CV] Error general:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PROXY OPENCLAW (mantener compatibilidad)
// ============================================

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const body = JSON.stringify(req.body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    };

    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    const options = {
      hostname: OPENCLAW_HOST,
      port: OPENCLAW_PORT,
      path: '/v1/chat/completions',
      method: 'POST',
      headers
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode || 200);
        res.setHeader('Content-Type', 'application/json');
        try { res.json(JSON.parse(data)); } catch { res.send(data); }
      });
    });

    proxyReq.on('error', (err) => {
      res.status(500).json({ error: 'Failed to proxy to OpenClaw', details: err.message });
    });

    proxyReq.write(body);
    proxyReq.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    const text = await httpGet('https://r.jina.ai/' + encodeURIComponent(url));
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
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze-profile', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: 'Profile content too short' });
    }

    const prompt = 'Eres ETHV. Analiza este perfil y devuelve JSON con: skills (array), experience_years (number), education (array), certifications (array), summary (string), headline (string), location (string), web3_relevance (high/medium/low). Perfil: ' + content.slice(0, 10000) + '. Responde SOLO JSON.';

    return new Promise((resolve) => {
      const body = JSON.stringify({
        model: 'MiniMax-M2.5',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.3
      });

      const options = {
        hostname: OPENCLAW_HOST,
        port: OPENCLAW_PORT,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + OPENCLAW_TOKEN,
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const proxyReq = http.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const msgContent = parsed?.choices?.[0]?.message?.content || '';
            const jsonMatch = msgContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              res.json({ success: true, ...JSON.parse(jsonMatch[0]) });
            } else {
              res.json({ success: true, summary: msgContent.slice(0, 500) });
            }
          } catch (e) {
            res.json({ success: true, error: 'Parse error', raw: data });
          }
          resolve();
        });
      });

      proxyReq.on('error', (err) => { res.status(500).json({ error: 'AI failed', details: err.message }); resolve(); });
      proxyReq.write(body);
      proxyReq.end();
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('ETHV Backend running on http://localhost:' + PORT);
  console.log('Supabase URL:', SUPABASE_URL || 'NO configurado');
});

module.exports = app;
