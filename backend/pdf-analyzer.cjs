// PDF Analyzer with Tesseract.js OCR - Simple Version
const express = require('express');
const fs = require('fs');
const { createWorker } = require('tesseract.js');

const app = express();
app.use(express.json({ limit: '100mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Extract text from file using Tesseract OCR
async function extractWithOCR(fileBuffer, mimeType) {
  console.log('Starting OCR with Tesseract.js...');
  
  const worker = await createWorker('spa+eng');
  
  try {
    let result;
    
    if (mimeType === 'application/pdf') {
      // For PDF, Tesseract can handle it directly in newer versions
      result = await worker.recognize(fileBuffer);
    } else if (mimeType.startsWith('image/')) {
      // For images
      result = await worker.recognize(fileBuffer);
    } else if (mimeType === 'text/plain') {
      // For text files, just return the content
      return fileBuffer.toString('utf-8');
    }
    
    await worker.terminate();
    
    return result.data.text;
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}

// Analyze PDF with OpenClaw
app.post('/api/analyze-pdf', async (req, res) => {
  try {
    const { file, filename } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    const fileBuffer = Buffer.from(file, 'base64');
    const mimeType = filename?.endsWith('.pdf') ? 'application/pdf' : 
                     filename?.endsWith('.png') ? 'image/png' :
                     filename?.endsWith('.jpg') || filename?.endsWith('.jpeg') ? 'image/jpeg' :
                     'application/octet-stream';
    
    console.log('Analyzing PDF with Tesseract OCR...');
    
    // Use Tesseract to extract text
    let extractedText;
    try {
      extractedText = await extractWithOCR(fileBuffer, mimeType);
      console.log('OCR extracted text length:', extractedText.length);
    } catch (ocrError) {
      console.log('OCR error:', ocrError.message);
      extractedText = 'OCR failed: ' + ocrError.message;
    }
    
    // Send to OpenClaw for analysis
    const token = 'bd1177ff2d28a2c4ceew1e08fee975fc9';
    
    const prompt = `You are ETHV, a talent validation agent. Analyze this resume/CV and extract:
{
  "name": "...",
  "skills": [...],
  "experience_years": 0,
  "education": [...],
  "certifications": [...],
  "summary": "...",
  "web3_relevance": "high/medium/low"
}

Resume/CV text:
${extractedText.substring(0, 8000)}`;

    const postData = JSON.stringify({
      model: 'MiniMax-M2.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000
    });

    console.log('Sending to OpenClaw...');

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

      const request = require('http').request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const content = parsed?.choices?.[0]?.message?.content || '';
            
            let extracted = null;
            try {
              const match = content.match(/\{[\s\S]*\}/);
              if (match) extracted = JSON.parse(match[0]);
            } catch {}
            
            resolve(res.json({
              success: true,
              extracted: extracted,
              rawText: extractedText.substring(0, 2000),
              method: 'tesseract-ocr',
              analyzedAt: new Date().toISOString()
            }));
          } catch (e) {
            reject(e);
          }
        });
      });

      request.on('error', reject);
      request.write(postData);
      request.end();
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extract text only
app.post('/api/extract-text', async (req, res) => {
  try {
    const { file, filename } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    const fileBuffer = Buffer.from(file, 'base64');
    const mimeType = filename?.endsWith('.pdf') ? 'application/pdf' : 
                     filename?.endsWith('.png') ? 'image/png' :
                     filename?.endsWith('.jpg') || filename?.endsWith('.jpeg') ? 'image/jpeg' :
                     'text/plain';
    
    console.log('Extracting text with OCR...');
    
    const text = await extractWithOCR(fileBuffer, mimeType);
    
    res.json({
      success: true,
      text: text,
      method: 'tesseract-ocr'
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', parser: 'tesseract-ready' });
});

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => {
  console.log(`📄 PDF Analyzer with Tesseract.js OCR running on http://localhost:${PORT}`);
  console.log(`📡 POST /api/analyze-pdf { "file": "base64...", "filename": "resume.pdf" }`);
});
