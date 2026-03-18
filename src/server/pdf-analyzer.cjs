// PDF Analyzer - sends PDF to OpenClaw for AI analysis
const express = require('express');
const fs = require('fs');
const http = require('http');

const app = express();
app.use(express.json({ limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Send PDF to OpenClaw for analysis
async function analyzeWithOpenClaw(pdfBase64, filename) {
  const token = 'bd1177ff2d28a2c4ceew1e08fee975fc9';
  
  const prompt = `You are ETHV, a talent validation agent. Analyze this PDF CV/resume and extract:

1. Name
2. Skills (technical skills, tools, languages, frameworks)
3. Years of experience
4. Education (degrees, universities)
5. Certifications
6. Work experience summary
7. Web3 relevance (high/medium/low)

Provide JSON response:
{
  "name": "...",
  "skills": [...],
  "experience_years": 0,
  "education": [...],
  "certifications": [...],
  "summary": "...",
  "web3_relevance": "high/medium/low"
}`;

  const pdfText = `[PDF File: ${filename}]\n\nPlease analyze this PDF and extract the information requested above.`;

  const postData = JSON.stringify({
    model: 'MiniMax-M2.5',
    messages: [
      { role: 'user', content: prompt },
      { role: 'user', content: pdfText }
    ],
    max_tokens: 3000
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 18789,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// API endpoint
app.post('/api/analyze-pdf', async (req, res) => {
  try {
    const { file, filename } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    console.log('Analyzing PDF with OpenClaw...');
    
    const result = await analyzeWithOpenClaw(file, filename || 'document.pdf');
    
    const content = result?.choices?.[0]?.message?.content || '';
    
    // Try to parse JSON from response
    let parsed = null;
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    } catch (e) {
      console.log('Could not parse JSON from response');
    }

    res.json({
      success: true,
      raw: content,
      parsed: parsed,
      analyzedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', analyzer: 'ready' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🤖 PDF Analyzer running on http://localhost:${PORT}`);
  console.log(`📡 POST /api/analyze-pdf { "file": "base64...", "filename": "resume.pdf" }`);
});
