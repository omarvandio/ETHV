const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { Client, GatewayIntentBits } = require('discord.js');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;
const OPENCLAW_HOST = process.env.OPENCLAW_HOST ;
const OPENCLAW_PORT = process.env.OPENCLAW_PORT ;
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN ;
const JINA_URL = process.env.JINA_URL ;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================
// SWAGGER
// ============================================

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ETHV Backend API',
      version: '1.0.0',
      description: 'API del agente ETHV — análisis de talento Web3, scraping LinkedIn y certificación de habilidades on-chain.',
    },
    servers: [
      { url: 'https://ethv.onrender.com', description: 'Producción (Render)' },
      { url: 'http://localhost:3003', description: 'Local' },
    ],
    tags: [
      { name: 'Health', description: 'Estado del servidor' },
      { name: 'AI', description: 'Proxy hacia OpenClaw (MiniMax-M2.5)' },
      { name: 'LinkedIn', description: 'Scraping y análisis de perfiles' },
    ],
    components: {
      schemas: {
        LinkedInScrapeResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            method: { type: 'string', example: 'jina-ai' },
            url: { type: 'string' },
            skills: { type: 'array', items: { type: 'string' } },
            web3_relevance: { type: 'string', enum: ['high', 'medium', 'low'] },
            experience_years: { type: 'integer' },
            raw: { type: 'string' },
            scrapedAt: { type: 'string', format: 'date-time' },
          },
        },
        ProfileAnalysisResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            skills: { type: 'array', items: { type: 'string' } },
            experience_years: { type: 'integer' },
            education: { type: 'array', items: { type: 'string' } },
            certifications: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' },
            headline: { type: 'string' },
            location: { type: 'string' },
            web3_relevance: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
  apis: [],
});

// Rutas documentadas inline
swaggerSpec.paths = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Healthcheck',
      responses: {
        200: {
          description: 'Servidor activo',
          content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, timestamp: { type: 'string', format: 'date-time' } } } } },
        },
      },
    },
  },
  '/v1/chat/completions': {
    post: {
      tags: ['AI'],
      summary: 'Proxy a OpenClaw AI',
      description: 'Pasa el request directamente a OpenClaw (MiniMax-M2.5). Compatible con el formato OpenAI.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                model: { type: 'string', example: 'MiniMax-M2.5' },
                messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string', enum: ['user', 'assistant', 'system'] }, content: { type: 'string' } } } },
                max_tokens: { type: 'integer', example: 2000 },
                temperature: { type: 'number', example: 0.3 },
              },
              required: ['model', 'messages'],
            },
          },
        },
      },
      responses: {
        200: { description: 'Respuesta de OpenClaw AI' },
        500: { description: 'Error de proxy', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/linkedin-scrape': {
    post: {
      tags: ['LinkedIn'],
      summary: 'Scraping de perfil LinkedIn',
      description: 'Obtiene el contenido del perfil usando Jina AI y extrae skills y relevancia Web3.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['url'],
              properties: {
                url: { type: 'string', example: 'https://linkedin.com/in/usuario' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Perfil scrapeado', content: { 'application/json': { schema: { $ref: '#/components/schemas/LinkedInScrapeResponse' } } } },
        400: { description: 'URL inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Error del servidor', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/analyze-profile': {
    post: {
      tags: ['LinkedIn'],
      summary: 'Análisis de perfil con IA',
      description: 'Analiza texto crudo de un perfil usando OpenClaw AI y devuelve estructura JSON con skills, experiencia y relevancia Web3.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string', description: 'Texto del perfil de LinkedIn', example: 'Full Stack Developer con 5 años de experiencia en React y Web3...' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Perfil analizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileAnalysisResponse' } } } },
        400: { description: 'Contenido demasiado corto', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        500: { description: 'Error del servidor', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/analyze-linkedin': {
    post: {
      tags: ['LinkedIn'],
      summary: 'Análisis legacy (sin IA)',
      description: 'Versión anterior. Calcula score local a partir de datos estructurados. Mantenido por compatibilidad.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                profileUrl: { type: 'string' },
                profileData: {
                  type: 'object',
                  properties: {
                    skills: { type: 'array', items: { type: 'string' } },
                    experience: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Análisis completado', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, analysis: { type: 'object' } } } } } },
      },
    },
  },
};

app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'ETHV API Docs',
  customCss: '.swagger-ui .topbar { background-color: #0f172a; }',
}));
app.get('/swagger.json', (req, res) => res.json(swaggerSpec));

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const body = JSON.stringify(req.body);
    const options = {
      hostname: OPENCLAW_HOST,
      port: OPENCLAW_PORT,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': req.headers.authorization || ''
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode || 200);
        res.setHeader('Content-Type', 'application/json');
        try { res.json(JSON.parse(data)); } catch (e) { res.send(data); }
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

// Helper function for HTTP requests
function httpGet(url) {
  return new Promise(function(resolve, reject) {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve(data); });
    });
    req.on('error', reject);
  });
}

// LinkedIn scraper using Jina AI
async function scrapeWithJina(url) {
  try {
    const text = await httpGet(JINA_URL + encodeURIComponent(url));
    return { success: true, text: text, url: url };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Extract structured data from raw text
function extractLinkedInData(text) {
  const data = { raw: text.substring(0, 5000) };
  
  const skillKeywords = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'React', 'React Native', 'Vue', 'Angular', 'Node.js', 'Express', 'Next.js', 'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Machine Learning', 'AI', 'Data Science', 'TensorFlow', 'PyTorch', 'HTML', 'CSS', 'Tailwind', 'GraphQL', 'REST', 'API', 'Git', 'CI/CD', 'DevOps', 'Web3', 'Blockchain', 'Ethereum', 'Solidity', 'DeFi', 'NFT'];
  
  const foundSkills = [];
  const lowerText = text.toLowerCase();
  skillKeywords.forEach(function(skill) {
    if (lowerText.includes(skill.toLowerCase())) foundSkills.push(skill);
  });
  data.skills = [...new Set(foundSkills)];
  
  const web3Keywords = ['web3', 'blockchain', 'ethereum', 'solidity', 'defi', 'crypto', 'nft', 'dao', 'smart contract'];
  const web3Count = web3Keywords.filter(function(kw) { return lowerText.includes(kw); }).length;
  data.web3_relevance = web3Count > 3 ? 'high' : web3Count > 0 ? 'medium' : 'low';
  data.experience_years = Math.max(1, Math.min(20, Math.floor(text.length / 3000)));
  
  return data;
}

// LinkedIn Scraper Endpoint
app.post('/api/linkedin-scrape', async (req, res) => {
  try {
    const url = req.body.url;
    if (!url || !url.includes('linkedin.com')) {
      return res.status(400).json({ error: 'Invalid LinkedIn URL' });
    }
    console.log('[LinkedIn Scraper] Scraping:', url);
    const result = await scrapeWithJina(url);
    if (result.success) {
      const parsed = extractLinkedInData(result.text);
      return res.json({ success: true, method: 'jina-ai', url: url, ...parsed, scrapedAt: new Date().toISOString() });
    }
    res.json({ success: false, error: result.error, suggestion: 'Try using paste text mode' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Profile Analysis Endpoint - Uses OpenClaw AI
app.post('/api/analyze-profile', async (req, res) => {
  try {
    const content = req.body.content;
    if (!content || content.trim().length < 10) {
      return res.status(400).json({ error: 'Profile content too short' });
    }
    console.log('[LinkedIn Analyzer] Analyzing profile, length:', content.length);
    
    const prompt = 'Eres ETHV. Analiza este perfil y devuelve JSON con: skills (array), experience_years (number), education (array), certifications (array), summary (string), headline (string), location (string), web3_relevance (high/medium/low). Perfil: ' + content.slice(0, 10000) + '. Responde SOLO JSON.';
    
    const requestBody = JSON.stringify({
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
        'Content-Length': Buffer.byteLength(requestBody),
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`
      }
    };

    const proxyReq = http.request(options, function(proxyRes) {
      let data = '';
      proxyRes.on('data', function(chunk) { data += chunk; });
      proxyRes.on('end', function() {
        try {
          const parsed = JSON.parse(data);
          const msgContent = parsed.choices ? parsed.choices[0].message.content : '';
          const jsonMatch = msgContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            res.json({ success: true, ...result });
          } else {
            res.json({ success: true, summary: msgContent.slice(0, 200) });
          }
        } catch (e) {
          res.json({ success: true, error: 'Parse error' });
        }
      });
    });
    
    proxyReq.on('error', function(err) { 
      res.status(500).json({ error: 'AI failed', details: err.message }); 
    });
    
    proxyReq.write(requestBody);
    proxyReq.end();
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy endpoint
app.post('/api/analyze-linkedin', async (req, res) => {
  try {
    const profileUrl = req.body.profileUrl;
    const profileData = req.body.profileData;
    
    const analysis = {
      profileUrl: profileUrl || 'provided',
      skills: profileData ? profileData.skills : [],
      experience: profileData ? profileData.experience : [],
      recommendations: [],
      score: 0
    };
    
    if (profileData && profileData.skills) {
      analysis.score += profileData.skills.length * 10;
    }
    if (profileData && profileData.experience) {
      analysis.score += profileData.experience.length * 15;
    }
    
    if (analysis.score < 30) {
      analysis.recommendations.push('Consider adding more skills to your profile');
    }
    if (!profileData || !profileData.experience || profileData.experience.length < 2) {
      analysis.recommendations.push('Add more work experience to increase visibility');
    }
    
    res.json({ success: true, analysis: analysis });
  } catch (error) {
    console.error('Error analyzing LinkedIn profile:', error);
    res.status(500).json({ success: false, error: 'Failed to analyze profile' });
  }
});

const server = app.listen(PORT, function() {
  console.log('ETHV Backend server running on port ' + PORT);
  console.log('Health endpoint: http://localhost:' + PORT + '/health');
  console.log('Chat completions: http://localhost:' + PORT + '/v1/chat/completions');
  console.log('LinkedIn scraper: http://localhost:' + PORT + '/api/linkedin-scrape');
  console.log('LinkedIn analyze: http://localhost:' + PORT + '/api/analyze-profile');
  console.log('LinkedIn analyze (legacy): http://localhost:' + PORT + '/api/analyze-linkedin');
});

process.on('SIGTERM', function() {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(function() {
    discordClient.destroy();
    process.exit(0);
  });
});

module.exports = app;
