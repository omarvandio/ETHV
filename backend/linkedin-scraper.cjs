// LinkedIn Scraper - Simple version using Jina AI (CommonJS)
const express = require('express');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// OpenClaw gateway proxy for AI chat completions
const OPENCLAW_HOST = '127.0.0.1';
const OPENCLAW_PORT = 18789;

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
        res.status(proxyRes.statusCode);
        res.setHeader('Content-Type', 'application/json');
        try {
          res.json(JSON.parse(data));
        } catch {
          res.send(data);
        }
      });
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.status(500).json({ error: 'Failed to proxy request to OpenClaw gateway' });
    });

    proxyReq.write(body);
    proxyReq.end();

  } catch (error) {
    console.error('Error in /v1/chat/completions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Simple GET request
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Simple scraper using jina.ai (free, no auth needed)
async function scrapeWithJina(url) {
  try {
    const text = await httpGet(`https://r.jina.ai/${encodeURIComponent(url)}`);
    return { success: true, text, url };
  } catch (error) {
    return { error: error.message };
  }
}

// Extract LinkedIn data from text
function extractLinkedInData(text) {
  const data = { raw: text };
  
  // Extract name
  const nameMatch = text.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/m);
  if (nameMatch) data.name = nameMatch[1];
  
  // Skills
  const skillKeywords = [
    'JavaScript', 'TypeScript', 'Python', 'React', 'Node.js', 'Vue', 'Angular',
    'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'SQL', 'MongoDB', 'PostgreSQL',
    'Java', 'C++', 'Go', 'Rust', 'Solidity', 'Web3', 'Ethereum', 'Blockchain',
    'Machine Learning', 'AI', 'Data Science', 'TensorFlow', 'PyTorch',
    'HTML', 'CSS', 'Tailwind', 'Next.js', 'GraphQL', 'REST', 'API',
    'Git', 'CI/CD', 'DevOps', 'Agile', 'Scrum'
  ];
  
  const foundSkills = [];
  skillKeywords.forEach(skill => {
    if (text.toLowerCase().includes(skill.toLowerCase())) {
      foundSkills.push(skill);
    }
  });
  data.skills = foundSkills;
  
  // Web3 relevance
  const web3Keywords = ['web3', 'blockchain', 'ethereum', 'solidity', 'defi', 'crypto', 'nft', 'dao'];
  const web3Count = web3Keywords.filter(kw => text.toLowerCase().includes(kw)).length;
  data.web3_relevance = web3Count > 2 ? 'high' : web3Count > 0 ? 'medium' : 'low';
  
  // Estimate experience
  data.experience_years = Math.max(1, Math.floor(text.length / 5000) * 2);
  
  return data;
}

// API endpoint
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
      
      return res.json({
        success: true,
        method: 'jina-ai',
        url,
        ...parsed,
        scrapedAt: new Date().toISOString()
      });
    }
    
    res.json({ error: result.error || 'Scraping failed' });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`🔍 LinkedIn Scraper running on http://localhost:${PORT}`);
  console.log(`📡 POST /api/linkedin-scrape { "url": "..." }`);
  console.log(`🤖 POST /v1/chat/completions (AI proxy)`);
});
