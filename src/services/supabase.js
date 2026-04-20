// LikeTalent Supabase Service
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || '';

async function saveCVAnalysis(data) {
  const payload = {
    email: data.email || null,
    name: data.name || null,
    phone: data.phone || null,
    location: data.location || null,
    linkedin: data.linkedin || null,
    github: data.github || null,
    portfolio: data.portfolio || null,
    current_position: data.current_position || null,
    company: data.company || null,
    experience_years: data.experience_years || 0,
    overall_score: data.overall_score || 0,
    ats_score: data.ats_score || 0,
    estimated_level: data.estimated_level || null,
    summary: data.summary || null,
    web3_relevance: data.web3_relevance || 'low',
    skills: data.skills ? JSON.stringify(data.skills) : null,
    certifications: data.certifications ? JSON.stringify(data.certifications) : null,
    education: data.education ? JSON.stringify(data.education) : null,
    languages: data.languages ? JSON.stringify(data.languages) : null,
    raw_response: JSON.stringify(data),
    created_at: new Date().toISOString()
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/cv_analyses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Supabase error:', error);
    return { success: false, error };
  }

  console.log('✅ CV saved to Supabase');
  return { success: true };
}

async function getCVAnalyses(email) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/cv_analyses?email=eq.${encodeURIComponent(email)}&order=created_at.desc`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  if (!response.ok) return [];
  return response.json();
}

async function getCertificatesByWallet(wallet) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/certificates?wallet=eq.${encodeURIComponent(wallet)}&order=created_at.desc`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );
  if (!response.ok) return [];
  return response.json();
}

export { saveCVAnalysis, getCVAnalyses, getCertificatesByWallet };
