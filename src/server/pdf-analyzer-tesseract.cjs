// PDF Analyzer with Tesseract.js OCR
const express = require('express');
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const pdf = require('pdfjs-dist/legacy/builds/pdf.node');

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

// Convert PDF page to image using pdf.js
async function pdfPageToImage(pdfBuffer, pageNum) {
  const pdfDoc = await pdf.getDocument({ data: pdfBuffer }).promise;
  const page = await pdfDoc.getPage(pageNum);
  
  const viewport = page.getViewport({ scale: 2.0 });
  
  // Create canvas
  const canvas = require('canvas');
  const canvasObj = canvas.createCanvas(viewport.width, viewport.height);
  const ctx = canvasObj.getContext('2d');
  
  await page.render({
    canvasContext: ctx,
    viewport: viewport
  }).promise;
  
  return canvasObj.toDataURL('image/png');
}

// Extract text using Tesseract OCR
async function extractWithOCR(imageBuffer) {
  const worker = await createWorker('spa+eng');
  
  try {
    const { data: { text } } = await worker.recognize(imageBuffer);
    return text;
  } finally {
    await worker.terminate();
  }
}

// Extract text from PDF using pdf.js (text-based PDFs)
async function extractTextFromPDF(pdfBuffer) {
  try {
    const pdfDoc = await pdf.getDocument({ data: pdfBuffer }).promise;
    const numPages = pdfDoc.getPageCount();
    
    let fullText = '';
    
    for (let i = 1; i <= Math.min(numPages, 10); i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map(item => item.str)
        .join(' ');
      
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    
    return { success: true, text: fullText, pages: numPages, method: 'pdfjs-text' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// API endpoint - Extract text from PDF
app.post('/api/extract-text', async (req, res) => {
  try {
    const { file, useOCR = false } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    const pdfBuffer = Buffer.from(file, 'base64');
    console.log('Processing PDF, size:', pdfBuffer.length);
    
    // First try text extraction
    const textResult = await extractTextFromPDF(pdfBuffer);
    
    // If no text found or useOCR is true, use Tesseract
    if (!textResult.success || textResult.text.trim().length < 50 || useOCR) {
      console.log('Using OCR (Tesseract.js)...');
      
      try {
        // Convert first page to image and OCR
        const imageData = await pdfPageToImage(pdfBuffer, 1);
        const ocrText = await extractWithOCR(imageData);
        
        return res.json({
          success: true,
          text: ocrText,
          pages: textResult.pages || 1,
          method: 'tesseract-ocr'
        });
      } catch (ocrError) {
        console.log('OCR failed:', ocrError.message);
        return res.json(textResult);
      }
    }
    
    res.json(textResult);
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Analyze PDF with OpenClaw
app.post('/api/analyze-pdf', async (req, res) => {
  try {
    const { file, filename } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    const pdfBuffer = Buffer.from(file, 'base64');
    console.log('Analyzing PDF with OpenClaw...');
    
    // Extract text first
    const textResult = await extractTextFromPDF(pdfBuffer);
    
    const extractedText = textResult.success ? textResult.text : 'Could not extract text';
    
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

Resume text:
${extractedText.substring(0, 8000)}`;

    const postData = JSON.stringify({
      model: 'MiniMax-M2.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000
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

      const request = http.request(options, (response) => {
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
              method: textResult.method,
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', parser: 'tesseract-ready' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`📄 PDF Analyzer with Tesseract.js running on http://localhost:${PORT}`);
  console.log(`📡 POST /api/analyze-pdf { "file": "base64...", "filename": "..." }`);
  console.log(`📡 POST /api/extract-text { "file": "base64..." }`);
});
