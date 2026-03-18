// ETHV OpenClaw Service - With PDF Text Extraction & LinkedIn/Profile Analysis
const OPENCLAW_URL = '';
const OPENCLAW_TOKEN = 'bd1177ff2d28a2c4ceew1e08fee975fc9';
const EXTRACTOR_URL = 'http://localhost:3001';

const log = (level, message, data = null) => {
  const entry = { time: new Date().toISOString(), level, message, data };
  console.log('[ETHV]', JSON.stringify(entry));
  try {
    const logs = JSON.parse(localStorage.getItem('ethv_logs') || '[]');
    logs.push(entry);
    if (logs.length > 50) logs.shift();
    localStorage.setItem('ethv_logs', JSON.stringify(logs));
  } catch (e) {}
};

log('INFO', 'OpenClaw Service loaded');

const validateFile = (file) => {
  const maxSize = 5 * 1024 * 1024;
  const allowed = ['application/pdf', 'application/msword', 'text/plain', 'text/markdown'];
  
  if (file.size > maxSize) return { valid: false, error: 'File too large (max 5MB)' };
  if (!allowed.includes(file.type)) return { valid: false, error: 'Invalid type. Allowed: PDF, DOCX, TXT, MD' };
  return { valid: true };
};

async function extractTextFromFile(file) {
  log('INFO', 'extractTextFromFile called', { name: file.name, type: file.type, size: file.size });
  
  const validation = validateFile(file);
  if (!validation.valid) {
    log('ERROR', 'File validation failed', validation);
    throw new Error(validation.error);
  }

  try {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(EXTRACTOR_URL + '/api/extract-text', { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Extraction failed: ' + response.status);
    const result = await response.json();
    return result.text;
  } catch (error) {
    return 'File: ' + file.name + '\nType: ' + file.type + '\nSize: ' + file.size + ' bytes';
  }
}

async function sendToAgent(message) {
  log('INFO', 'sendToAgent called', { msgLen: message.length });
  
  const requestBody = { model: 'MiniMax-M2.5', messages: [{ role: 'user', content: message }], max_tokens: 2000 };
  const res = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENCLAW_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  
  if (!res.ok) throw new Error('API Error: ' + res.status);
  return res.json();
}

async function analyzeCV(file) {
  log('INFO', 'analyzeCV called', { fileName: file.name });
  const cvText = await extractTextFromFile(file);
  
  const prompt = 'Eres ETHV. Analiza el CV y extrae: skills, experience_years, certifications, summary en JSON. CV: ' + cvText.slice(0, 8000);
  const result = await sendToAgent(prompt);
  const content = result?.choices?.[0]?.message?.content || '';
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}
  return { skills: [], experience_years: 0, certifications: [], summary: 'Error parsing' };
}

async function analyzeLinkedIn(linkedInUrl) {
  log('INFO', 'analyzeLinkedIn called', { url: linkedInUrl });
  if (!linkedInUrl) throw new Error('LinkedIn URL is required');
  
  const urlPattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/;
  const pubPattern = /^https?:\/\/(www\.)?linkedin\.com\/pub\/[a-zA-Z0-9_-]+\/?$/;
  if (!urlPattern.test(linkedInUrl) && !pubPattern.test(linkedInUrl)) {
    throw new Error('Please enter a valid LinkedIn profile URL');
  }
  
  // Since LinkedIn blocks direct access, we inform the user
  const prompt = `Eres ETHV. El usuario quiere analizar un perfil de LinkedIn, pero LinkedIn bloquea el acceso automatizado. 
Extrae la información proporcionada y devuelve en JSON: skills, experience_years, education, certifications, summary, headline, location.
Si solo tienes la URL y no contenido, devuelve un objeto con los campos vacíos y un mensaje en summary indicando que el acceso fue bloqueado.

URL recibida: ${linkedInUrl}`;
  const result = await sendToAgent(prompt);
  const content = result?.choices?.[0]?.message?.content || '';
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}
  return { skills: [], experience_years: 0, education: [], certifications: [], summary: 'LinkedIn access blocked. Try pasting profile content instead.', headline: '', location: '' };
}

async function analyzeProfileContent(content) {
  log('INFO', 'analyzeProfileContent called', { contentLen: content.length });
  if (!content || content.trim().length < 10) {
    throw new Error('Profile content is too short or empty');
  }
  
  const prompt = `Eres ETHV. Analiza este contenido de perfil profesional (puede ser de LinkedIn, CV, u otra fuente) y extrae en JSON:
- skills: array de habilidades técnicas y blandas
- experience_years: número de años de experiencia估算
- education: array de formaciones académicas
- certifications: array de certificaciones
- summary: resumen profesional breve
- headline: titular/perfil (primera línea si existe)
- location: ubicación si está mencionada

Contenido del perfil:
${content.slice(0, 10000)}`;

  const result = await sendToAgent(prompt);
  const responseContent = result?.choices?.[0]?.message?.content || '';
  
  try {
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      log('INFO', 'Profile analysis successful', { skillsCount: parsed.skills?.length || 0 });
      return parsed;
    }
  } catch (e) {
    log('ERROR', 'JSON parsing failed', { error: e.message });
  }
  
  // Fallback: try to extract basic info
  return { 
    skills: [], 
    experience_years: 0, 
    education: [], 
    certifications: [], 
    summary: responseContent.slice(0, 200) || 'Analysis complete', 
    headline: '', 
    location: '' 
  };
}

async function checkConnection() {
  try { const res = await fetch('/health'); return res.ok; } 
  catch { return false; }
}

const getLogs = () => { try { return JSON.parse(localStorage.getItem('ethv_logs') || '[]'); } catch { return []; } };
const clearLogs = () => localStorage.removeItem('ethv_logs');

export { sendToAgent, analyzeCV, analyzeLinkedIn, analyzeProfileContent, extractTextFromFile, checkConnection, validateFile, getLogs, clearLogs, log };