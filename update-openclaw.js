const fs = require('fs');
const content = 
// LikeTalent OpenClaw Service
const EXTRACTOR_URL = import.meta?.env?.VITE_EXTRACTOR_URL || 'http://localhost:3010';

const log = (level, message, data = null) => {
  const entry = { time: new Date().toISOString(), level, message, data };
  console.log('[LikeTalent]', JSON.stringify(entry));
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
  log('INFO', 'extractTextFromFile called', { name: file.name, type: file.type });
  const validation = validateFile(file);
  if (!validation.valid) throw new Error(validation.error);
  try {
    const reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result;
        const base64String = result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
    });
    reader.readAsDataURL(file);
    const response = await fetch(EXTRACTOR_URL + '/api/analyze-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: base64, filename: file.name })
    });
    if (!response.ok) throw new Error('Extraction failed: ' + response.status);
    const result = await response.json();
    return result.extracted?.summary || result.rawText || 'Could not extract text';
  } catch (error) {
    log('ERROR', 'Extraction error', { error: error.message });
    return 'File: ' + file.name + ' - Note: OCR failed, please paste text manually';
  }
}

async function sendToAgent(message) {
  log('INFO', 'sendToAgent called', { msgLen: message?.length });
  const token = import.meta?.env?.VITE_OPENCLAW_TOKEN || '';
  const response = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'MiniMax-M2.5', messages: [{ role: 'user', content: message }], max_tokens: 2000 })
  });
  if (!response.ok) throw new Error('API Error: ' + response.status);
  return response.json();
}

async function analyzeCV(file) {
  log('INFO', 'analyzeCV called', { fileName: file.name });
  const cvText = await extractTextFromFile(file);
  const prompt = 'You are LikeTalent, a Web3 talent validation agent. Analyze this CV/resume and extract JSON: {\" skills\\\: [], \\\experience_years\\\: 0, \\\education\\\: [], \\\certifications\\\: [], \\\summary\\\: \\\\\\, \\\web3_relevance\\\: \\\low\\\} CV: ' + cvText.slice(0, 5000);
 const result = await sendToAgent(prompt);
 const content = result?.choices?.[0]?.message?.content || '';
 try { const match = content.match(/\\{[\\s\\S]*\\}/); if (match) return JSON.parse(match[0]); } catch {}
 return { skills: [], experience_years: 0, summary: 'Parse error' };
}

async function checkConnection() { try { const res = await fetch('/health'); return res.ok; } catch { return false; } }
const getLogs = () => { try { return JSON.parse(localStorage.getItem('ethv_logs') || '[]'); } catch { return []; } };
const clearLogs = () => localStorage.removeItem('ethv_logs');

async function analyzeProfileContent(content) {
 try {
 const prompt = 'You are LikeTalent, a Web3 talent validation agent. Extract JSON from this LinkedIn profile: {\\\skills\\\: [], \\\experience_years\\\: 0, \\\education\\\: [], \\\certifications\\\: [], \\\summary\\\: \\\\\\, \\\web3_relevance\\\: \\\low\\\, \\\headline\\\: \\\\\\} Profile Content: ' + content.slice(0, 5000);
 const response = await fetch('/v1/chat/completions', {
 method: 'POST',
 headers: { 'Authorization': 'Bearer bd1177ff2d28a2c4ceew1e08fee975fc9', 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: 'MiniMax-M2.5', messages: [{ role: 'user', content: prompt }], max_tokens: 2000 })
 });
 if (response.ok) {
 const result = await response.json();
 const text = result?.choices?.[0]?.message?.content || '';
 try { const match = text.match(/\\{[\\s\\S]*\\}/); if (match) return JSON.parse(match[0]); } catch {}
 return { summary: text, skills: [], web3_relevance: 'low' };
 }
 } catch (error) { log('WARN', 'AI analysis failed, using fallback', { error: error.message }); }
 
 try {
 const linkedInUrl = content.includes('linkedin.com') ? content.match(/https?:\\/\\/linkedin\\.com\\/in\\/[^\\s]+/)?.[0] : null;
 const commonSkills = ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'Go', 'Rust', 'Solidity', 'Web3', 'DeFi', 'NFT', 'Blockchain', 'SQL', 'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes'];
 const foundSkills = commonSkills.filter(skill => content.toLowerCase().includes(skill.toLowerCase()));
 const response = await fetch('/api/analyze-linkedin', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ profileUrl: linkedInUrl || 'manual-input', profileData: { skills: foundSkills.length > 0 ? foundSkills : ['General'], experience: [] } })
 });
 if (response.ok) {
 const result = await response.json();
 if (result.success && result.analysis) {
 return {
 skills: result.analysis.skills || [],
 summary: 'Analyzed profile from LinkedIn. Score: ' + result.analysis.score + '/100. ' + (result.analysis.recommendations?.join(' ') || ''),
 web3_relevance: result.analysis.score > 50 ? 'medium' : 'low',
 recommendations: result.analysis.recommendations || []
 };
 }
 }
 } catch (error) { log('ERROR', 'Fallback failed', { error: error.message }); }
 return { summary: 'Analysis completed with limited data', skills: [], web3_relevance: 'low' };
}

export { sendToAgent, analyzeCV, checkConnection, getLogs, clearLogs, log, analyzeProfileContent };
;
fs.writeFileSync('src/services/openclaw.js', content);
console.log('Done');