// PDF Text Extraction API
import express from 'express';
import multer from 'multer';
import { extractText } from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import fs from 'fs';

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// PDF extraction endpoint
app.post('/api/extract-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    let text = '';

    if (fileType === 'application/pdf') {
      const data = await extractText(fileBuffer);
      text = data.text;
    } else if (fileType === 'application/msword' || 
               fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      text = result.value;
    } else if (fileType === 'text/plain') {
      text = fileBuffer.toString('utf-8');
    } else if (fileType === 'text/markdown') {
      text = fileBuffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const maxLength = 10000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '\n\n[... content truncated ...]';
    }

    res.json({ 
      success: true, 
      text,
      filename: req.file.originalname,
      length: text.length
    });

  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`📄 Text Extraction API running on http://localhost:${PORT}`);
});
