// ETHV Backend Server
const express = require('express');
const https = require('https');
const http = require('http');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const OPENCLAW_HOST = '127.0.0.1';
const OPENCLAW_PORT = 18789;

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

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data);
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
  
  const skillKeywords = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'React', 'React Native', 'Vue', 'Angular', 'Node.js', 'Express', 'Next.js', 'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Machine Learning', 'AI', 'Data Science', 'TensorFlow', 'PyTorch', 'HTML', 'CSS', 'Tailwind', 'GraphQL', 'REST', 'API', 'Git', 'CI/CD', 'DevOps', 'Web3', 'Blockchain', 'Ethereum', 'Solidity', 'DeFi', 'NFT'];
  
  const foundSkills = [];
  const lowerText = text.toLowerCase();
  skillKeywords.forEach(skill => {
    if (lowerText.includes(skill.toLowerCase())) foundSkills.push(skill);
  });
  data.skills = [...new Set(foundSkills)];
  
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
    console.log('Analyzing profile, length:', content.length);
    
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
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(requestBody) }
    };

    return new Promise((resolve) => {
      const req = http.request(options, (proxyRes) => {
        let data = '';
        proxyRes.on('data', chunk => data += chunk);
        proxyRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const msgContent = parsed?.choices?.[0]?.message?.content || '';
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
          resolve();
        });
      });
      req.on('error', (err) => { res.status(500).json({ error: 'AI failed', details: err.message }); resolve(); });
      req.write(requestBody);
      req.end();
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('ETHV Backend running on http://localhost:' + PORT);
});

module.exports = app;
