// LikeTalent OpenClaw Service

function log(level, message, data) {
  console.log('[LikeTalent]', JSON.stringify({level, message, data}));
}

log('INFO', 'Service loaded - Using OCR Backend');

// OpenClaw API function
async function sendToAgent(message) {
  const token = import.meta.env.VITE_OPENCLAW_TOKEN;
  const model = import.meta.env.VITE_OPENCLAW_MODEL || 'MiniMax-M2.5';
  const url = import.meta.env.VITE_OPENCLAW_URL || '/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: message }],
      max_tokens: 2000
    })
  });

  if (!response.ok) throw new Error('API Error: ' + response.status);
  return response.json();
}

// Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================
// SCORING & ANALYSIS FUNCTIONS
// ============================================

function calculateOverallScore(data) {
  let score = 0;
  if (data.name) score += 3;
  if (data.email) score += 3;
  if (data.phone) score += 2;
  if (data.location) score += 2;
  if (data.linkedin) score += 3;
  if (data.github || data.portfolio) score += 2;
  if (data.summary && data.summary.length > 50) score += 10;
  if (data.experience_years) {
    if (data.experience_years >= 1) score += 5;
    if (data.experience_years >= 3) score += 5;
    if (data.experience_years >= 5) score += 5;
    if (data.experience_years >= 10) score += 5;
  }
  if (data.current_position) score += 10;
  if (data.skills) {
    if (data.skills.length >= 3) score += 5;
    if (data.skills.length >= 5) score += 5;
    if (data.skills.length >= 10) score += 5;
    if (data.skills.length >= 15) score += 5;
  }
  if (data.education && data.education.length > 0) score += 10;
  if (data.certifications && data.certifications.length > 0) score += 5;
  return Math.min(100, score);
}

function calculateATSScore(data) {
  let score = 40;
  const hasContact = data.name && data.email;
  const hasSummary = data.summary && data.summary.length > 30;
  const hasExperience = data.experience_years && data.experience_years > 0;
  const hasSkills = data.skills && data.skills.length > 0;
  const hasEducation = data.education && data.education.length > 0;
  if (hasContact) score += 8;
  if (hasSummary) score += 8;
  if (hasExperience) score += 10;
  if (hasSkills) score += 12;
  if (hasEducation) score += 8;
  if (!data.name) score -= 10;
  if (!data.email) score -= 10;
  if (!hasSkills) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function calculateDimensions(data) {
  const summary = data.summary || '';
  const hasContact = data.name && data.email;
  
  let ats = calculateATSScore(data);
  let enfoque = 50;
  if (data.current_position) enfoque += 15;
  if (data.summary && summary.length > 30) enfoque += 15;
  if (data.experience_years) {
    if (data.experience_years >= 3) enfoque += 10;
    if (data.experience_years >= 5) enfoque += 10;
  }
  
  let impacto = 40;
  const hasImpactWords = summary.toLowerCase().includes('achieved') || 
                         summary.toLowerCase().includes('managed') ||
                         summary.toLowerCase().includes('increased') ||
                         summary.toLowerCase().includes('reduced') ||
                         summary.toLowerCase().includes('led');
  if (hasImpactWords) impacto += 20;
  if (data.certifications && data.certifications.length > 0) impacto += 15;
  if ((data.skills || []).length >= 5) impacto += 15;
  
  let claridad = 60;
  if (summary.length > 20 && summary.length < 300) claridad += 20;
  if (hasContact) claridad += 10;
  if (data.current_position) claridad += 10;
  
  let contacto = 20;
  if (data.name) contacto += 15;
  if (data.email) contacto += 15;
  if (data.phone) contacto += 15;
  if (data.location) contacto += 10;
  if (data.linkedin) contacto += 10;
  if (data.github || data.portfolio) contacto += 15;
  
  let legibilidad = 70;
  const hasGoodLength = summary.length > 20 && summary.length < 500;
  if (hasGoodLength) legibilidad += 15;
  if (data.education && data.education.length > 0) legibilidad += 10;
  if (data.languages && data.languages.length > 0) legibilidad += 5;
  
  return {
    ats: Math.min(100, ats),
    enfoque: Math.min(100, enfoque),
    impacto: Math.min(100, impacto),
    claridad: Math.min(100, claridad),
    contacto: Math.min(100, contacto),
    legibilidad: Math.min(100, legibilidad)
  };
}

function suggestRoles(data) {
  const skills = (data.skills || []).map(s => s.toLowerCase());
  const position = (data.current_position || '').toLowerCase();
  const summary = (data.summary || '').toLowerCase();
  
  const roleTemplates = [
    { title: 'Blockchain Developer', keywords: ['solidity', 'web3', 'ethereum', 'defi', 'smart contract', 'nft'] },
    { title: 'Frontend Developer', keywords: ['react', 'javascript', 'typescript', 'css', 'html', 'vue', 'angular'] },
    { title: 'Backend Developer', keywords: ['nodejs', 'python', 'api', 'database', 'sql', 'aws', 'docker'] },
    { title: 'Full Stack Developer', keywords: ['react', 'nodejs', 'typescript', 'javascript', 'full stack'] },
    { title: 'Data Analyst', keywords: ['python', 'data', 'analytics', 'visualization', 'sql', 'tableau'] },
    { title: 'Product Manager', keywords: ['product', 'agile', 'scrum', 'roadmap', 'stakeholder'] },
    { title: 'DevOps Engineer', keywords: ['devops', 'aws', 'docker', 'kubernetes', 'ci/cd', 'terraform'] },
    { title: 'Technical Writer', keywords: ['documentation', 'writing', 'api', 'markdown', 'technical'] },
    { title: 'Consultant', keywords: ['consulting', 'strategy', 'analysis', 'business'] },
    { title: 'Project Manager', keywords: ['project', 'agile', 'scrum', 'management', 'lead'] }
  ];
  
  const roles = [];
  for (const role of roleTemplates) {
    const matchedKeywords = role.keywords.filter(k => 
      skills.includes(k) || position.includes(k) || summary.includes(k)
    );
    const matchPercentage = Math.round((matchedKeywords.length / role.keywords.length) * 100);
    if (matchPercentage > 0) {
      const missingSkills = role.keywords.filter(k => !matchedKeywords.includes(k));
      roles.push({
        title: role.title,
        match_percentage: matchPercentage,
        required_skills: role.keywords,
        missing_skills: missingSkills.slice(0, 3)
      });
    }
  }
  return roles.sort((a, b) => b.match_percentage - a.match_percentage).slice(0, 3);
}

function calculateStats(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  const commonTypos = ['teh', 'thier', 'recieve', 'occured', 'seperate'];
  const hasTypos = commonTypos.some(typo => text.toLowerCase().includes(typo));
  return {
    word_count: wordCount,
    reading_time_minutes: readingTime,
    spelling_score: hasTypos ? 85 : 100,
    section_count: (text.match(/\n/g) || []).length + 1
  };
}

function generateStrengths(data) {
  const strengths = [];
  if (data.skills && data.skills.length >= 5) strengths.push('Strong skill set with ' + data.skills.length + ' identified skills');
  if (data.certifications && data.certifications.length > 0) strengths.push(data.certifications.length + ' certifications documented');
  if (data.experience_years && data.experience_years >= 3) strengths.push('Solid experience with ' + data.experience_years + ' years in the field');
  if (data.linkedin) strengths.push('LinkedIn profile linked');
  if (data.github) strengths.push('GitHub portfolio available');
  if (data.summary && data.summary.length > 100) strengths.push('Comprehensive professional summary');
  if (data.education && data.education.length > 0) strengths.push('Educational background documented');
  if (data.languages && data.languages.length > 1) strengths.push('Multilingual with ' + data.languages.length + ' languages');
  return strengths;
}

function generateImprovements(data) {
  const improvements = [];
  if (!data.name) improvements.push('Add your full name');
  if (!data.email) improvements.push('Include a contact email');
  if (!data.phone) improvements.push('Add phone number');
  if (!data.linkedin) improvements.push('Include LinkedIn profile URL');
  if (!data.github && !data.portfolio) improvements.push('Add portfolio or GitHub link');
  if (!data.summary) improvements.push('Write a professional summary');
  if (!data.certifications || data.certifications.length === 0) improvements.push('Consider adding relevant certifications');
  if (!data.languages || data.languages.length === 0) improvements.push('Add languages you speak');
  if (data.skills && data.skills.length < 5) improvements.push('Add more relevant skills');
  return improvements;
}

function estimateLevel(data) {
  const exp = data.experience_years || 0;
  const skills = data.skills ? data.skills.length : 0;
  if (exp >= 8 && skills >= 10) return 'Senior';
  if (exp >= 5 && skills >= 7) return 'Mid-Level';
  if (exp >= 2 && skills >= 4) return 'Junior';
  return 'Entry-Level';
}

function generateCoverLetter(data, jobTitle, company) {
  const name = data.name || 'Candidate';
  const position = data.current_position || 'professional';
  const skillsList = data.skills ? data.skills.slice(0, 5).join(', ') : 'relevant skills';
  const targetCompany = company || '[Company Name]';
  const targetRole = jobTitle || '[Position]';
  
  return 'Dear Hiring Manager at ' + targetCompany + ',\n\nI am writing to express my strong interest in the ' + targetRole + ' position at ' + targetCompany + '. With my background as a ' + position + ' and expertise in ' + skillsList + ', I am confident in my ability to contribute meaningfully to your team.\n\nThroughout my career, I have developed a passion for delivering results and continuously improving my craft. My experience has equipped me with the skills necessary to excel in this role, and I am eager to bring my dedication and expertise to ' + targetCompany + '.\n\nI would welcome the opportunity to discuss how my background aligns with your needs. Thank you for considering my application.\n\nBest regards,\n' + name;
}

function generateInterviewPrep(data) {
  const position = data.current_position || 'this role';
  return {
    common_questions: [
      'Tell me about your experience as a ' + position,
      'What are your greatest strengths and weaknesses?',
      'Where do you see yourself in 5 years?',
      'Why are you interested in this position?',
      'Describe a challenging project you worked on',
      'How do you handle tight deadlines?',
      'Tell me about a time you had a conflict with a coworker',
      'What are your salary expectations?'
    ],
    star_method_examples: [
      'Situation: In my previous role, we faced a critical deadline. Task: I needed to deliver the project on time. Action: I organized daily standups and prioritized tasks. Result: We delivered 2 days early with all requirements met.',
      'Situation: Team communication was breaking down. Task: Improve collaboration. Action: I implemented weekly syncs and a shared documentation system. Result: Team efficiency improved by 30%.',
      'Situation: A client was unhappy with deliverables. Task: Turn the situation around. Action: I scheduled a call to understand concerns and revised the approach. Result: Client was satisfied and renewed their contract.'
    ],
    tips: [
      'Research the company before the interview',
      'Practice your STAR method responses',
      'Prepare questions to ask the interviewer',
      'Dress professionally even for virtual interviews',
      'Test your technology before the interview',
      'Have your CV and references ready',
      'Follow up with a thank you email'
    ]
  };
}

function analyzeJobOffer(data, offer) {
  const skills = (data.skills || []).map(function(s) { return s.toLowerCase(); });
  const offerSkills = (offer.required_skills || []).map(function(s) { return s.toLowerCase(); });
  
  var matchedRequired = offerSkills.filter(function(s) { return skills.includes(s); });
  var roleMatch = Math.round(((matchedRequired.length / offerSkills.length) * 100) || 0);
  
  var skillScore = roleMatch;
  var expMatch = data.experience_years && offer.experience_required 
    ? Math.min(100, (data.experience_years / offer.experience_required) * 100)
    : 50;
  var certScore = (data.certifications ? data.certifications.length : 0) > 0 ? 80 : 40;
  
  var overallMatch = Math.round((skillScore * 0.5) + (expMatch * 0.3) + (certScore * 0.2));
  var skillGaps = offerSkills.filter(function(s) { return !skills.includes(s); });
  
  return {
    overall_match: overallMatch,
    role_match: roleMatch,
    salary_adequacy: offer.salary ? 'Requires more data for analysis' : 'Salary not specified',
    skill_gaps: skillGaps.slice(0, 5),
    strengths: matchedRequired.map(function(s) { return 'Strong ' + s + ' skills'; }),
    recommendations: skillGaps.slice(0, 3).map(function(s) { return 'Consider learning ' + s; }).concat([
      overallMatch >= 70 ? 'Good match - proceed with application' : 'Consider upskilling before applying',
      'Negotiate salary if offer is below market rate'
    ])
  };
}

// Main CV analysis - delega OCR + AI + Supabase al backend
async function analyzeCV(file) {
  log('INFO', 'analyzeCV called', {fileName: file.name, fileSize: file.size});

  const base64 = await fileToBase64(file);
  log('INFO', 'Enviando al backend /api/analyze-cv...');

  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
  const res = await fetch(`${apiBase}/analyze-cv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: base64, filename: file.name })
  });

  if (!res.ok) {
    const err = await res.text();
    log('ERROR', 'Backend error', { status: res.status, err });
    throw new Error('CV analysis failed (' + res.status + '): ' + err);
  }

  const result = await res.json();
  log('INFO', 'Análisis completo', { score: result.score, skills: result.skills?.length });
  return result;
}

// Analyze LinkedIn URL - scrapes and analyzes
async function analyzeLinkedInUrl(url) {
  log('INFO', 'analyzeLinkedInUrl called', {url});
  
  // Step 1: Scrape the LinkedIn profile using our backend scraper
  let scrapedContent = '';
  let scrapeMethod = 'ai-fallback';
  
  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    const scrapeRes = await fetch(`${apiBase}/linkedin-scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    if (scrapeRes.ok) {
      const scrapeData = await scrapeRes.json();
      if (scrapeData.success && scrapeData.text) {
        scrapedContent = scrapeData.text;
        scrapeMethod = scrapeData.method || 'jina-ai';
        log('INFO', 'Scraped successfully', { method: scrapeMethod, length: scrapedContent.length });
      }
    } else {
      log('WARN', 'Scraper failed, using AI fallback', { status: scrapeRes.status });
    }
  } catch (e) {
    log('WARN', 'Scraper unavailable, using AI fallback', { error: e.message });
  }
  
  // Step 2: Analyze the content with AI
  let analysisData = {};
  
  if (scrapedContent) {
    const prompt = 'You are LikeTalent, a Web3 talent validation agent. Extract JSON from this LinkedIn profile content with ALL fields: {name: "", headline: "", email: "", phone: "", location: "", linkedin: "", skills: [], experience_years: 0, current_position: "", company: "", education: [], certifications: [], languages: [], summary: "", web3_relevance: "low"} Profile Content: ' + scrapedContent.slice(0, 6000);
    const result = await sendToAgent(prompt);
    const acontent = result.choices ? result.choices[0].message.content : '';
    try {
      const match = acontent.match(/\{[\s\S]*\}/);
      if (match) analysisData = JSON.parse(match[0]);
    } catch (e) { log('ERROR', 'JSON parse failed', { error: e.message }); }
  } else {
    const prompt = 'You are LikeTalent, a Web3 talent validation agent. A user wants to analyze their LinkedIn profile. URL: ' + url + '. Extract JSON with: {linkedin_url: "' + url + '", scrape_method: "ai-extraction", message: "Limited analysis from URL. For full analysis, use paste text mode.", skills: [], summary: "", web3_relevance: "low"}';
    const result = await sendToAgent(prompt);
    const acontent = result.choices ? result.choices[0].message.content : '';
    try {
      const match = acontent.match(/\{[\s\S]*\}/);
      if (match) analysisData = JSON.parse(match[0]);
    } catch (e) {}
  }
  
  return { ...analysisData, scrape_method: scrapeMethod, analyzed_at: new Date().toISOString() };
}

// Analyze profile content
// Analyze profile content (text/LinkedIn)
async function analyzeProfileContent(content) {
  log('INFO', 'analyzeProfileContent called', {length: content.length});
  
  const prompt = 'You are LikeTalent, a Web3 talent validation agent. Extract JSON from this LinkedIn/profile content with ALL fields: {name: "", headline: "", email: "", phone: "", location: "", linkedin: "", skills: [], experience_years: 0, current_position: "", company: "", education: [], certifications: [], languages: [], summary: "", web3_relevance: "low"} Profile Content: ' + content.slice(0, 6000);

  const result = await sendToAgent(prompt);
  const text = result.choices ? result.choices[0].message.content : '';
  
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    log('ERROR', 'JSON parse failed', {error: e.message});
  }
  
  return { summary: text, skills: [], web3_relevance: 'low' };
}

// Verificar conexión al backend
async function checkConnection() {
  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
    const res = await fetch(`${apiBase}/health`);
    return res.ok;
  } catch { return false; }
}

function clearLogs() {
  console.log('[LikeTalent] Logs cleared');
}

function getLogs() {
  return [];
}

// Export additional helper functions
export { sendToAgent, analyzeCV, analyzeLinkedInUrl, analyzeProfileContent, checkConnection, log, clearLogs, getLogs, generateCoverLetter, generateInterviewPrep, analyzeJobOffer };


