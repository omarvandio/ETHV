const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const OPENCLAW_HOST = '127.0.0.1';
const OPENCLAW_PORT = 18789;

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
    const text = await httpGet('https://r.jina.ai/' + encodeURIComponent(url));
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
        'Authorization': 'Bearer bd1177ff2d28a2c4ceew1e08fee975fc9'
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
