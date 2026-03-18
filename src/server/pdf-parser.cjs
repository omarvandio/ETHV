// PDF Parser using pdf.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Set worker path
pdfjs.GlobalWorkerOptions.workerSrc = path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Extract text from PDF using pdf.js
async function extractTextFromPDF(pdfBuffer) {
  try {
    console.log('Loading PDF...');
    const loadingTask = pdfjs.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;
    
    const numPages = pdf.numPages;
    console.log(`PDF has ${numPages} pages`);
    
    let fullText = '';
    
    // Process up to 10 pages
    const maxPages = Math.min(numPages, 10);
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ');
        
        fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
        
        console.log(`Extracted page ${pageNum}/${maxPages}`);
      } catch (pageError) {
        console.log(`Error on page ${pageNum}:`, pageError.message);
      }
    }
    
    return {
      success: true,
      text: fullText.trim(),
      pages: numPages,
      method: 'pdfjs-dist'
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    return { success: false, error: error.message };
  }
}

// API endpoint
app.post('/api/extract-pdf', async (req, res) => {
  try {
    if (!req.body.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    let pdfBuffer;
    try {
      pdfBuffer = Buffer.from(req.body.file, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid base64 file' });
    }
    
    console.log('Processing PDF, size:', pdfBuffer.length);
    
    const result = await extractTextFromPDF(pdfBuffer);
    
    // Limit text length
    if (result.success && result.text && result.text.length > 15000) {
      result.text = result.text.substring(0, 15000) + '\n\n[... truncated ...]';
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', parser: 'ready' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`📄 PDF Parser running on http://localhost:${PORT}`);
  console.log(`📡 POST /api/extract-pdf { "file": "base64..." }`);
});
