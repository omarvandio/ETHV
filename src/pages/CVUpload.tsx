import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../store/LangContext';
import {
  Upload, FileText, Check, AlertCircle, Loader2, Wifi, WifiOff,
  Mail, Phone, MapPin, Linkedin, Github, Globe, FileDown,
  Briefcase, ChevronDown, ChevronUp, Sparkles, Wand2,
  Star, TrendingUp, Award, BookOpen, Languages, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeCV, checkConnection, generateCoverLetter, generateInterviewPrep, analyzeJobOffer } from '../services/openclaw';
import CVPreview from '../components/CVPreview';

// ── i18n ─────────────────────────────────────────────────────────────────────
const T = {
  es: {
    title: 'Analiza tu CV',
    subtitle: 'Nuestra IA extraerá tus habilidades y experiencia para validarlas en blockchain.',
    langLabel: 'Idioma del CV',
    dropTitle: 'Haz clic o arrastra tu CV aquí',
    dropSub: 'PDF, DOCX, TXT, MD (máx. 5MB)',
    analyzeBtn: 'Analizar CV',
    analyzing: 'Analizando con IA...',
    connected: 'Conectado',
    disconnected: 'Sin conexión',
    analysisComplete: 'Análisis Completo',
    overallScore: 'Puntuación General',
    level: 'Nivel',
    suggestedRoles: 'Roles Sugeridos',
    dimensions: 'Dimensiones del CV',
    strengths: 'Fortalezas',
    improvements: 'Mejoras',
    contact: 'Información de Contacto',
    currentRole: 'Rol Actual',
    profileSummary: 'Resumen del Perfil',
    experience: 'Experiencia',
    years: 'años',
    skills: 'Habilidades Encontradas',
    certifications: 'Certificaciones',
    langs: 'Idiomas',
    web3: 'Relevancia Web3',
    stats: 'Estadísticas del CV',
    words: 'Palabras',
    readMin: 'Min. lectura',
    spelling: 'Ortografía',
    coverLetter: 'Carta de Presentación',
    interviewPrep: 'Preparación para Entrevista',
    jobAnalysis: 'Análisis de Oferta Laboral',
    jobTitle: 'Título del puesto',
    jobCompany: 'Empresa',
    jobSkills: 'Habilidades requeridas (separadas por coma)',
    jobExp: 'Años de experiencia requeridos',
    analyzeMatch: 'Analizar Compatibilidad',
    overallMatch: 'Compatibilidad General',
    skillGaps: 'Habilidades Faltantes',
    recommendations: 'Recomendaciones',
    skillsFound: 'Excelente! Encontramos',
    skillsFoundEnd: 'habilidades. Procede a validarlas y ganar tus credenciales on-chain.',
    proceedValidation: 'Ir a Validación de Habilidades →',
    // CV Assistant
    assistantTitle: 'Asistente de CV con IA',
    assistantSub: 'Genera un CV optimizado para ATS y descárgalo en Word o PDF',
    improveBtn: 'Generar CV ATS Optimizado',
    redraftBtn: 'Regenerar CV',
    improving: 'Generando CV ATS...',
    tailorBtn: 'Adaptar CV a Oferta de Trabajo',
    tailorPlaceholder: 'Pega aquí la descripción completa de la oferta de trabajo...',
    tailorLabel: 'Adaptar a Oferta',
    tailoring: 'Adaptando CV...',
    matchScore: 'Compatibilidad con la Oferta',
    matchSummary: 'Análisis de Compatibilidad',
    missingMatch: 'Brechas vs la Oferta',
    previewTitle: 'Previsualización del CV ATS',
    atsScore: 'Puntuación ATS',
    atsImprovements: 'Mejoras ATS Aplicadas',
    summarySection: 'Resumen Profesional',
    experienceSection: 'Experiencia',
    skillsSection: 'Habilidades',
    educationSection: 'Educación',
    certificationsSection: 'Certificaciones',
    languagesSection: 'Idiomas',
    aiTips: 'Recomendaciones de IA',
    missingSections: 'Secciones Faltantes',
    downloadTitle: 'Descargar CV ATS',
    downloadWord: 'Word (.docx)',
    downloadPDF: 'PDF',
    improved: '— ATS',
    original: '— Original',
    commonQuestions: 'Preguntas Frecuentes',
    starMethod: 'Método STAR',
    tips: 'Consejos',
    qualityTitle: 'Calidad del Contenido',
    clichesLabel: 'Clichés detectados',
    clichesNone: 'Sin clichés detectados',
    voiceLabel: 'Lenguaje activo',
    impactVerbsLabel: 'Verbos de impacto',
    passiveLabel: 'Frases pasivas',
    quantLabel: 'Logros cuantificados',
    quantRate: 'tasa de cuantificación',
    keywordsLabel: 'Keywords ATS',
    qualityScore: 'Puntuación de Calidad',
  },
  en: {
    title: 'Analyze your CV',
    subtitle: 'Our AI will extract your skills and experience to validate them on blockchain.',
    langLabel: 'CV Language',
    dropTitle: 'Click or drag your CV here',
    dropSub: 'PDF, DOCX, TXT, MD (max 5MB)',
    analyzeBtn: 'Analyze CV',
    analyzing: 'Analyzing with AI...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    analysisComplete: 'Analysis Complete',
    overallScore: 'Overall Score',
    level: 'Level',
    suggestedRoles: 'Suggested Roles',
    dimensions: 'CV Dimensions',
    strengths: 'Strengths',
    improvements: 'Improvements',
    contact: 'Contact Information',
    currentRole: 'Current Role',
    profileSummary: 'Profile Summary',
    experience: 'Experience',
    years: 'years',
    skills: 'Extracted Skills',
    certifications: 'Certifications',
    langs: 'Languages',
    web3: 'Web3 Relevance',
    stats: 'CV Statistics',
    words: 'Words',
    readMin: 'Min read',
    spelling: 'Spelling',
    coverLetter: 'Cover Letter',
    interviewPrep: 'Interview Preparation',
    jobAnalysis: 'Job Offer Analysis',
    jobTitle: 'Job Title',
    jobCompany: 'Company',
    jobSkills: 'Required Skills (comma separated)',
    jobExp: 'Years of experience required',
    analyzeMatch: 'Analyze Match',
    overallMatch: 'Overall Match',
    skillGaps: 'Skill Gaps',
    recommendations: 'Recommendations',
    skillsFound: "Great! We've found",
    skillsFoundEnd: 'skills. Proceed to validate them and earn your on-chain credentials.',
    proceedValidation: 'Go to Skill Validation →',
    assistantTitle: 'AI CV Assistant',
    assistantSub: 'Generate an ATS-optimized CV and download it as Word or PDF',
    improveBtn: 'Generate ATS-Optimized CV',
    redraftBtn: 'Regenerate CV',
    improving: 'Generating ATS CV...',
    tailorBtn: 'Tailor CV to Job Description',
    tailorPlaceholder: 'Paste the full job description here...',
    tailorLabel: 'Tailor to Job',
    tailoring: 'Tailoring CV...',
    matchScore: 'Job Match Score',
    matchSummary: 'Match Analysis',
    missingMatch: 'Gaps vs Job Requirements',
    previewTitle: 'ATS CV Preview',
    atsScore: 'ATS Score',
    atsImprovements: 'ATS Improvements Applied',
    summarySection: 'Professional Summary',
    experienceSection: 'Experience',
    skillsSection: 'Skills',
    educationSection: 'Education',
    certificationsSection: 'Certifications',
    languagesSection: 'Languages',
    aiTips: 'AI Recommendations',
    missingSections: 'Missing Sections',
    downloadTitle: 'Download ATS CV',
    downloadWord: 'Word (.docx)',
    downloadPDF: 'PDF',
    improved: '— ATS',
    original: '— Original',
    commonQuestions: 'Common Questions',
    starMethod: 'STAR Method',
    tips: 'Tips',
    qualityTitle: 'Content Quality',
    clichesLabel: 'Clichés detected',
    clichesNone: 'No clichés detected',
    voiceLabel: 'Active language',
    impactVerbsLabel: 'Impact verbs',
    passiveLabel: 'Passive phrases',
    quantLabel: 'Quantified achievements',
    quantRate: 'quantification rate',
    keywordsLabel: 'ATS Keywords',
    qualityScore: 'Quality Score',
  }
};

interface ContactInfo {
  name: string; email: string; phone: string; location: string;
  linkedin: string; github: string; portfolio: string;
}

export default function CVUpload() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const t = T[lang];

  // File & status
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  // CV data
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: ''
  });
  const [currentPosition, setCurrentPosition] = useState('');
  const [company, setCompany] = useState('');
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState(0);
  const [certifications, setCertifications] = useState<any[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [education, setEducation] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [web3Relevance, setWeb3Relevance] = useState('low');
  const [overallScore, setOverallScore] = useState(0);
  const [dimensions, setDimensions] = useState<any>({});
  const [suggestedRoles, setSuggestedRoles] = useState<any[]>([]);
  const [estimatedLevel, setEstimatedLevel] = useState('');
  const [strengths, setStrengths] = useState<string[]>([]);
  const [improvements, setImprovements] = useState<string[]>([]);
  const [cvStats, setCvStats] = useState<any>(null);
  const [cvQuality, setCvQuality] = useState<any>(null);

  // Extras
  const [coverLetter, setCoverLetter] = useState('');
  const [interviewPrep, setInterviewPrep] = useState<any>(null);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showInterviewPrep, setShowInterviewPrep] = useState(false);
  const [showJobAnalysis, setShowJobAnalysis] = useState(false);
  const [jobOfferInput, setJobOfferInput] = useState({ title: '', company: '', required_skills: '', experience_required: 0 });
  const [jobAnalysisResult, setJobAnalysisResult] = useState<any>(null);

  // CV Assistant
  const [improvedCV, setImprovedCV] = useState<any>(null);
  const [tailoredCV, setTailoredCV] = useState<any>(null);
  const [jobDescInput, setJobDescInput] = useState('');
  const [isTailoring, setIsTailoring] = useState(false);
  const [assistantMode, setAssistantMode] = useState<'improve' | 'tailor'>('improve');
  const [isImproving, setIsImproving] = useState(false);
  const [showImproved, setShowImproved] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    checkConnection().then(setIsConnected).catch(() => setIsConnected(false));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { setFile(e.target.files[0]); setUploadStatus('idle'); setErrorMessage(''); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) { setFile(f); setUploadStatus('idle'); setErrorMessage(''); }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true); setUploadStatus('idle'); setErrorMessage('');
    try {
      const result = await analyzeCV(file);
      if (result.name)      setContactInfo(p => ({ ...p, name: result.name }));
      if (result.email)     setContactInfo(p => ({ ...p, email: result.email }));
      if (result.phone)     setContactInfo(p => ({ ...p, phone: result.phone }));
      if (result.location)  setContactInfo(p => ({ ...p, location: result.location }));
      if (result.linkedin)  setContactInfo(p => ({ ...p, linkedin: result.linkedin }));
      if (result.github)    setContactInfo(p => ({ ...p, github: result.github }));
      if (result.portfolio) setContactInfo(p => ({ ...p, portfolio: result.portfolio }));
      if (result.current_position) setCurrentPosition(result.current_position);
      if (result.company) setCompany(result.company);
      if (result.skills) { setExtractedSkills(result.skills); localStorage.setItem('ethv_cv_skills', JSON.stringify(result.skills)); }
      if (result.experience_years) setExperienceYears(result.experience_years);
      if (result.certifications) setCertifications(result.certifications);
      if (result.languages)  setLanguages(result.languages);
      if (result.education)  setEducation(result.education);
      if (result.summary)    setSummary(result.summary);
      if (result.web3_relevance) setWeb3Relevance(result.web3_relevance);
      setOverallScore(result.score || 0);
      setEstimatedLevel(result.level || '');
      setDimensions(result.dimensions || {});
      setSuggestedRoles(result.suggested_roles || []);
      setStrengths(result.strengths || []);
      setImprovements(result.improvements || []);
      setCvStats(result.stats || null);
      setCvQuality(result.quality || null);
      setUploadStatus('success');
      try {
        setCoverLetter(generateCoverLetter(result, result.current_position || 'Developer', 'Company'));
        setInterviewPrep(generateInterviewPrep(result));
      } catch {}
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al analizar el CV');
      setUploadStatus('error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleImproveCV = async () => {
    setIsImproving(true); setImprovedCV(null); setShowImproved(false);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const cvData = {
        name: contactInfo.name, email: contactInfo.email, phone: contactInfo.phone,
        location: contactInfo.location, linkedin: contactInfo.linkedin,
        github: contactInfo.github, portfolio: contactInfo.portfolio,
        current_position: currentPosition, company, skills: extractedSkills,
        experience_years: experienceYears, certifications, languages, education,
        summary, web3_relevance: web3Relevance
      };
      const res = await fetch(`${apiBase}/improve-cv`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvData, lang })
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setImprovedCV(data); setShowImproved(true);
    } catch (e: any) { setErrorMessage(e.message || 'Error al mejorar el CV'); }
    finally { setIsImproving(false); }
  };

  const handleTailorCV = async () => {
    if (!jobDescInput.trim()) return;
    setIsTailoring(true); setTailoredCV(null);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const cvData = {
        name: contactInfo.name, email: contactInfo.email, phone: contactInfo.phone,
        location: contactInfo.location, linkedin: contactInfo.linkedin,
        github: contactInfo.github, current_position: currentPosition, company,
        skills: extractedSkills, experience_years: experienceYears,
        certifications, languages, education, summary
      };
      const res = await fetch(`${apiBase}/tailor-cv`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvData, jobDescription: jobDescInput, lang })
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setTailoredCV(data);
    } catch (e: any) { setErrorMessage(e.message || 'Error al adaptar el CV'); }
    finally { setIsTailoring(false); }
  };

  const handleDownloadDocx = async (useImproved: boolean) => {
    setIsDownloading(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const cvData = {
        name: contactInfo.name, email: contactInfo.email, phone: contactInfo.phone,
        location: contactInfo.location, linkedin: contactInfo.linkedin,
        github: contactInfo.github, current_position: currentPosition, company,
        skills: extractedSkills, experience_years: experienceYears,
        certifications, education, summary, improvements
      };
      const res = await fetch(`${apiBase}/download-cv-docx`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvData, improved: useImproved ? (tailoredCV || improvedCV) : null })
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${contactInfo.name || 'CV'}_CV.docx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setErrorMessage(e.message || 'Error al descargar'); }
    finally { setIsDownloading(false); }
  };

  const scoreColor = (s: number) => s >= 70 ? 'text-emerald-400' : s >= 50 ? 'text-yellow-400' : 'text-red-400';
  const barColor   = (s: number) => s >= 70 ? 'bg-emerald-500' : s >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const getCertName = (c: any) => typeof c === 'string' ? c : c?.name || c?.issuer || '';
  const getLangName = (l: any) => typeof l === 'string' ? l : l?.language ? l.language + (l.level ? ` (${l.level})` : '') : '';
  const getEduName  = (e: any) => typeof e === 'string' ? e : e?.degree ? `${e.degree}${e.school ? ' — ' + e.school : ''}` : '';

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">

      {/* ── Header ── */}
      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">{t.title}</h1>
        <p className="text-zinc-500 text-sm max-w-md mx-auto">{t.subtitle}</p>

        {/* Status */}
        <div className="mt-4 flex items-center justify-center gap-4 flex-wrap">
          {isConnected === null ? (
            <span className="text-zinc-600 text-xs flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Verificando...</span>
          ) : isConnected ? (
            <span className="text-emerald-500 text-xs flex items-center gap-1"><Wifi size={12} /> {t.connected}</span>
          ) : (
            <span className="text-red-500 text-xs flex items-center gap-1"><WifiOff size={12} /> {t.disconnected}</span>
          )}
        </div>
      </header>

      {/* ── Upload box ── */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-6 md:p-8 space-y-5">

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            file ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 hover:border-emerald-500/40 hover:bg-zinc-900/50'
          }`}
          onClick={() => document.getElementById('cv-input')?.click()}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
        >
          <input id="cv-input" type="file" accept=".pdf,.docx,.md,.txt" className="hidden" onChange={handleFileChange} />
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${file ? 'bg-emerald-500/15' : 'bg-zinc-900'}`}>
            {file ? <FileText className="text-emerald-500" size={28} /> : <Upload className="text-zinc-500" size={28} />}
          </div>
          {file ? (
            <div>
              <p className="text-white font-semibold">{file.name}</p>
              <p className="text-zinc-500 text-xs mt-1">{(file.size / 1024).toFixed(0)} KB — {lang === 'es' ? 'listo para analizar' : 'ready to analyze'}</p>
            </div>
          ) : (
            <>
              <p className="text-white font-medium">{t.dropTitle}</p>
              <p className="text-zinc-500 text-sm mt-1">{t.dropSub}</p>
            </>
          )}
        </div>

        {/* Analyze button */}
        <button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
        >
          {isUploading
            ? <><Loader2 className="animate-spin" size={18} /> {t.analyzing}</>
            : <><Sparkles size={18} /> {t.analyzeBtn}</>}
        </button>

        {/* Error */}
        {uploadStatus === 'error' && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl">
            <AlertCircle size={16} /> {errorMessage || 'Error al analizar el CV'}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <AnimatePresence>
        {uploadStatus === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="mt-6 space-y-4"
          >
            {/* Success badge */}
            <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm">
              <Check size={18} /> {t.analysisComplete}
            </div>

            {/* Score card */}
            {overallScore > 0 && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm"><Star size={15} /> {t.overallScore}</div>
                  <span className={`text-3xl font-black ${scoreColor(overallScore)}`}>{overallScore}<span className="text-lg text-zinc-600">/100</span></span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <motion.div className={`h-2 rounded-full ${barColor(overallScore)}`}
                    initial={{ width: 0 }} animate={{ width: overallScore + '%' }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                </div>
                {estimatedLevel && <p className="text-zinc-500 text-xs mt-2">{t.level}: <span className="text-zinc-300 font-medium">{estimatedLevel}</span></p>}
              </div>
            )}

            {/* Suggested roles */}
            {suggestedRoles.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3"><Briefcase size={15} /> {t.suggestedRoles}</div>
                <div className="space-y-2">
                  {suggestedRoles.map((role, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-white text-sm">{role.title}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className={`h-1.5 rounded-full ${barColor(role.match_percentage || role.match)}`}
                            style={{ width: (role.match_percentage || role.match) + '%' }} />
                        </div>
                        <span className={`text-xs font-bold w-8 text-right ${scoreColor(role.match_percentage || role.match)}`}>
                          {role.match_percentage || role.match}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dimensions */}
            {dimensions.ats > 0 && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3"><TrendingUp size={15} /> {t.dimensions}</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {Object.entries(dimensions).map(([k, v]: any) => (
                    <div key={k}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-zinc-500 capitalize">{k}</span>
                        <span className={`font-medium ${scoreColor(v)}`}>{v}%</span>
                      </div>
                      <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                        <div className={`h-1 rounded-full ${barColor(v)}`} style={{ width: v + '%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Strengths & Improvements side by side */}
            {(strengths.length > 0 || improvements.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-3">
                {strengths.length > 0 && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
                      <Check size={13} /> {t.strengths}
                    </div>
                    <ul className="space-y-1">{strengths.map((s, i) => <li key={i} className="text-zinc-300 text-xs flex gap-1.5"><span className="text-emerald-500 mt-0.5">•</span>{s}</li>)}</ul>
                  </div>
                )}
                {improvements.length > 0 && (
                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-4">
                    <div className="flex items-center gap-1.5 text-yellow-400 text-xs font-bold uppercase tracking-wider mb-2">
                      <TrendingUp size={13} /> {t.improvements}
                    </div>
                    <ul className="space-y-1">{improvements.map((s, i) => <li key={i} className="text-zinc-300 text-xs flex gap-1.5"><span className="text-yellow-500 mt-0.5">→</span>{s}</li>)}</ul>
                  </div>
                )}
              </div>
            )}

            {/* Quality Analysis */}
            {cvQuality && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm"><Sparkles size={15} /> {t.qualityTitle}</div>
                  <span className={`text-xl font-black ${scoreColor(cvQuality.overall)}`}>{cvQuality.overall}<span className="text-xs text-zinc-600">/100</span></span>
                </div>

                {/* Clichés */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-zinc-500 text-xs">{t.clichesLabel}</span>
                    <span className={`text-xs font-bold ${cvQuality.cliches.count === 0 ? 'text-emerald-400' : cvQuality.cliches.count <= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {cvQuality.cliches.count === 0 ? '✓' : cvQuality.cliches.count}
                    </span>
                  </div>
                  {cvQuality.cliches.count === 0
                    ? <p className="text-emerald-500 text-xs">{t.clichesNone}</p>
                    : <div className="flex flex-wrap gap-1">{cvQuality.cliches.found.map((c: string, i: number) => (
                        <span key={i} className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-md">"{c}"</span>
                      ))}</div>
                  }
                </div>

                {/* Voice */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-zinc-500 text-xs">{t.voiceLabel}</span>
                    <span className={`text-xs font-bold ${scoreColor(cvQuality.voice.score)}`}>{cvQuality.voice.score}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mb-2">
                    <div className={`h-1 rounded-full ${barColor(cvQuality.voice.score)}`} style={{ width: cvQuality.voice.score + '%' }} />
                  </div>
                  {cvQuality.voice.impact_verbs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {cvQuality.voice.impact_verbs.slice(0, 8).map((v: string, i: number) => (
                        <span key={i} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-md">{v}</span>
                      ))}
                    </div>
                  )}
                  {cvQuality.voice.passive_phrases.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cvQuality.voice.passive_phrases.slice(0, 4).map((p: string, i: number) => (
                        <span key={i} className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-md">"{p}"</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quantification */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-zinc-500 text-xs">{t.quantLabel}</span>
                    <span className={`text-xs font-bold ${scoreColor(cvQuality.quantification.score)}`}>
                      {cvQuality.quantification.quantified_achievements}/{cvQuality.quantification.achievement_sentences} ({cvQuality.quantification.quantification_rate}%)
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden mb-2">
                    <div className={`h-1 rounded-full ${barColor(cvQuality.quantification.score)}`} style={{ width: cvQuality.quantification.score + '%' }} />
                  </div>
                  {cvQuality.quantification.metrics_found.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cvQuality.quantification.metrics_found.map((m: string, i: number) => (
                        <span key={i} className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-md font-mono">{m}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* ATS Keywords */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-500 text-xs">{t.keywordsLabel}</span>
                    <span className={`text-xs font-bold ${scoreColor(cvQuality.keywords.score)}`}>{cvQuality.keywords.score}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(cvQuality.keywords.by_category).map(([cat, data]: any) => (
                      data.count > 0 && (
                        <div key={cat} className="bg-zinc-900 rounded-lg px-2.5 py-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-400 text-xs capitalize">{cat}</span>
                            <span className="text-emerald-400 text-xs font-bold">{data.count}/{data.total}</span>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Contact */}
            {(contactInfo.name || contactInfo.email || contactInfo.phone) && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3"><User size={15} /> {t.contact}</div>
                {contactInfo.name && <p className="text-white font-bold text-lg mb-2">{contactInfo.name}</p>}
                <div className="flex flex-wrap gap-3">
                  {contactInfo.email    && <a href={`mailto:${contactInfo.email}`} className="flex items-center gap-1 text-zinc-400 hover:text-emerald-400 text-xs transition-colors"><Mail size={12} />{contactInfo.email}</a>}
                  {contactInfo.phone    && <span className="flex items-center gap-1 text-zinc-400 text-xs"><Phone size={12} />{contactInfo.phone}</span>}
                  {contactInfo.location && <span className="flex items-center gap-1 text-zinc-400 text-xs"><MapPin size={12} />{contactInfo.location}</span>}
                  {contactInfo.linkedin && <a href={contactInfo.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-zinc-400 hover:text-emerald-400 text-xs transition-colors"><Linkedin size={12} />LinkedIn</a>}
                  {contactInfo.github   && <a href={contactInfo.github}   target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-zinc-400 hover:text-emerald-400 text-xs transition-colors"><Github size={12} />GitHub</a>}
                  {contactInfo.portfolio && <a href={contactInfo.portfolio} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-zinc-400 hover:text-emerald-400 text-xs transition-colors"><Globe size={12} />Portfolio</a>}
                </div>
              </div>
            )}

            {/* Current role + Summary */}
            {(currentPosition || summary) && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 space-y-3">
                {currentPosition && (
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">{t.currentRole}</p>
                    <p className="text-white font-bold">{currentPosition}{company && <span className="text-zinc-400 font-normal"> @ {company}</span>}</p>
                    {experienceYears > 0 && <p className="text-zinc-500 text-xs mt-1">{experienceYears} {t.years}</p>}
                  </div>
                )}
                {summary && (
                  <div>
                    <p className="text-zinc-500 text-xs mb-1">{t.profileSummary}</p>
                    <p className="text-zinc-300 text-sm leading-relaxed">{summary}</p>
                  </div>
                )}
              </div>
            )}

            {/* Skills */}
            {extractedSkills.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm"><Award size={15} /> {t.skills}</div>
                  <span className="bg-emerald-500/15 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full">{extractedSkills.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {extractedSkills.map((s, i) => (
                    <span key={i} className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-lg text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {certifications.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3"><Award size={15} /> {t.certifications}</div>
                <div className="flex flex-wrap gap-2">
                  {certifications.map((c, i) => <span key={i} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg text-xs">{getCertName(c)}</span>)}
                </div>
              </div>
            )}

            {/* Languages */}
            {languages.length > 0 && (
              <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-zinc-400 text-sm mb-3"><Languages size={15} /> {t.langs}</div>
                <div className="flex flex-wrap gap-2">
                  {languages.map((l: any, i) => <span key={i} className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1 rounded-lg text-xs">{getLangName(l)}</span>)}
                </div>
              </div>
            )}

            {/* Web3 relevance */}
            <div className={`rounded-2xl border p-4 flex items-center justify-between ${
              web3Relevance === 'high' ? 'bg-emerald-500/10 border-emerald-500/20' :
              web3Relevance === 'medium' ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-zinc-950 border-zinc-900'
            }`}>
              <span className="text-zinc-400 text-sm">{t.web3}</span>
              <span className={`font-bold capitalize text-sm px-3 py-1 rounded-full ${
                web3Relevance === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                web3Relevance === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-zinc-800 text-zinc-500'
              }`}>{web3Relevance}</span>
            </div>

            {/* Stats */}
            {cvStats && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: t.words, value: cvStats.word_count || 0, color: 'text-white' },
                  { label: t.readMin, value: cvStats.reading_time_minutes || 1, color: 'text-white' },
                  { label: t.spelling, value: (cvStats.spelling_score || 100) + '%', color: 'text-emerald-400' },
                ].map((s, i) => (
                  <div key={i} className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-zinc-600 text-xs mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Collapsibles */}
            {[
              { show: showCoverLetter,  setShow: setShowCoverLetter,  label: t.coverLetter,
                content: coverLetter ? <pre className="text-zinc-300 text-xs whitespace-pre-wrap font-sans leading-relaxed">{coverLetter}</pre> : null },
              { show: showInterviewPrep, setShow: setShowInterviewPrep, label: t.interviewPrep,
                content: interviewPrep ? (
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-zinc-400 font-semibold mb-2">{t.commonQuestions}</p>
                      <ul className="space-y-1">{interviewPrep.common_questions?.slice(0,5).map((q: string, i: number) => <li key={i} className="text-zinc-400 text-xs flex gap-2"><span className="text-emerald-500">•</span>{q}</li>)}</ul>
                    </div>
                    <div>
                      <p className="text-zinc-400 font-semibold mb-2">{t.tips}</p>
                      <ul className="space-y-1">{interviewPrep.tips?.slice(0,4).map((tip: string, i: number) => <li key={i} className="text-zinc-400 text-xs flex gap-2"><span className="text-yellow-500">→</span>{tip}</li>)}</ul>
                    </div>
                  </div>
                ) : null
              },
            ].map(({ show, setShow, label, content }) => content && (
              <div key={label} className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
                <button onClick={() => setShow(!show)} className="w-full flex items-center justify-between p-4 hover:bg-zinc-900/50 transition-colors">
                  <span className="text-zinc-400 text-sm font-medium">{label}</span>
                  {show ? <ChevronUp size={16} className="text-zinc-600" /> : <ChevronDown size={16} className="text-zinc-600" />}
                </button>
                {show && <div className="px-4 pb-4">{content}</div>}
              </div>
            ))}

            {/* Job Analysis */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
              <button onClick={() => setShowJobAnalysis(!showJobAnalysis)} className="w-full flex items-center justify-between p-4 hover:bg-zinc-900/50 transition-colors">
                <span className="text-zinc-400 text-sm font-medium">{t.jobAnalysis}</span>
                {showJobAnalysis ? <ChevronUp size={16} className="text-zinc-600" /> : <ChevronDown size={16} className="text-zinc-600" />}
              </button>
              {showJobAnalysis && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder={t.jobTitle} value={jobOfferInput.title}
                      onChange={e => setJobOfferInput(p => ({...p, title: e.target.value}))}
                      className="bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-xl text-xs outline-none focus:border-emerald-500 transition-colors" />
                    <input type="text" placeholder={t.jobCompany} value={jobOfferInput.company}
                      onChange={e => setJobOfferInput(p => ({...p, company: e.target.value}))}
                      className="bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-xl text-xs outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <input type="text" placeholder={t.jobSkills} value={jobOfferInput.required_skills}
                    onChange={e => setJobOfferInput(p => ({...p, required_skills: e.target.value}))}
                    className="w-full bg-zinc-900 border border-zinc-800 text-white px-3 py-2 rounded-xl text-xs outline-none focus:border-emerald-500 transition-colors" />
                  <button onClick={() => {
                    const r = analyzeJobOffer({ skills: extractedSkills, experience_years: experienceYears, certifications }, { ...jobOfferInput, required_skills: jobOfferInput.required_skills.split(',').map(s => s.trim()) });
                    setJobAnalysisResult(r);
                  }} className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-2 rounded-xl text-xs transition-all">
                    {t.analyzeMatch}
                  </button>
                  {jobAnalysisResult && (
                    <div className="bg-zinc-900 rounded-xl p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-400 text-xs">{t.overallMatch}</span>
                        <span className={`font-bold text-lg ${scoreColor(jobAnalysisResult.overall_match)}`}>{jobAnalysisResult.overall_match}%</span>
                      </div>
                      {jobAnalysisResult.skill_gaps?.length > 0 && (
                        <div>
                          <p className="text-zinc-500 text-xs mb-1">{t.skillGaps}</p>
                          <div className="flex flex-wrap gap-1">
                            {jobAnalysisResult.skill_gaps.slice(0,5).map((s: string, i: number) => <span key={i} className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs">{s}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── CV ASSISTANT ── */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-zinc-900 flex items-center gap-2">
                <Wand2 size={16} className="text-emerald-500" />
                <div>
                  <p className="text-white font-bold text-sm">{t.assistantTitle}</p>
                  <p className="text-zinc-500 text-xs">{t.assistantSub}</p>
                </div>
              </div>

              {/* Mode tabs */}
              <div className="flex border-b border-zinc-900">
                <button
                  onClick={() => setAssistantMode('improve')}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors ${assistantMode === 'improve' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Sparkles size={12} className="inline mr-1" />{t.improveBtn}
                </button>
                <button
                  onClick={() => setAssistantMode('tailor')}
                  className={`flex-1 py-2.5 text-xs font-bold transition-colors ${assistantMode === 'tailor' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Briefcase size={12} className="inline mr-1" />{t.tailorLabel}
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* IMPROVE MODE */}
                {assistantMode === 'improve' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button onClick={handleImproveCV} disabled={isImproving}
                      className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold py-3 rounded-xl text-sm transition-all">
                      {isImproving ? <><Loader2 size={15} className="animate-spin" />{t.improving}</> : <><Sparkles size={15} />{t.improveBtn}</>}
                    </button>
                    <button onClick={() => { setImprovedCV(null); handleImproveCV(); }} disabled={isImproving}
                      className="flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-40">
                      <BookOpen size={15} /> {t.redraftBtn}
                    </button>
                  </div>
                )}

                {/* TAILOR MODE */}
                {assistantMode === 'tailor' && (
                  <div className="space-y-3">
                    <textarea
                      value={jobDescInput}
                      onChange={e => setJobDescInput(e.target.value)}
                      placeholder={t.tailorPlaceholder}
                      rows={6}
                      className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs px-3 py-2.5 rounded-xl outline-none focus:border-emerald-500 transition-colors resize-none placeholder-zinc-600"
                    />
                    <button onClick={handleTailorCV} disabled={isTailoring || !jobDescInput.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold py-3 rounded-xl text-sm transition-all">
                      {isTailoring ? <><Loader2 size={15} className="animate-spin" />{t.tailoring}</> : <><Briefcase size={15} />{t.tailorBtn}</>}
                    </button>

                    {/* Tailored CV match info */}
                    {tailoredCV && (
                      <div className="space-y-2">
                        <div className="bg-zinc-900 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-emerald-400 text-xs font-bold uppercase tracking-wider">{t.matchScore}</span>
                            <span className={`text-xl font-black ${scoreColor(tailoredCV.match_score)}`}>{tailoredCV.match_score}<span className="text-sm text-zinc-600">/100</span></span>
                          </div>
                          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mb-2">
                            <motion.div className={`h-1.5 rounded-full ${barColor(tailoredCV.match_score)}`}
                              initial={{ width: 0 }} animate={{ width: tailoredCV.match_score + '%' }} transition={{ duration: 0.8 }} />
                          </div>
                          {tailoredCV.match_summary && <p className="text-zinc-400 text-xs italic">{tailoredCV.match_summary}</p>}
                        </div>
                        {tailoredCV.missing_match?.length > 0 && (
                          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                            <p className="text-red-400 text-xs font-bold uppercase tracking-wider mb-1.5">⚠ {t.missingMatch}</p>
                            <ul className="space-y-1">{tailoredCV.missing_match.map((m: string, i: number) => <li key={i} className="text-zinc-400 text-xs flex gap-2"><span className="text-red-400 flex-shrink-0">•</span>{m}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ATS CV Preview — shared for both improve and tailor modes */}
              <CVPreview
                cv={assistantMode === 'tailor' ? tailoredCV : (showImproved ? improvedCV : null)}
                scoreLabel={assistantMode === 'tailor' ? t.matchScore : t.atsScore}
                t={t}
                scoreColor={scoreColor}
                barColor={barColor}
              />

              {/* Download */}
              {(improvedCV || tailoredCV) && (
                <div className="p-4 border-t border-zinc-900">
                  <p className="text-zinc-600 text-xs uppercase tracking-wider mb-2">{t.downloadTitle}</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleDownloadDocx(true)} disabled={isDownloading}
                      className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50">
                      {isDownloading ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
                      {t.downloadWord} {t.improved}
                    </button>
                    <button onClick={() => window.print()}
                      className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2 rounded-xl text-xs font-bold transition-all">
                      <FileDown size={12} /> {t.downloadPDF}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Proceed */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-emerald-400 text-sm">
              {t.skillsFound} <strong>{extractedSkills.length}</strong> {t.skillsFoundEnd}
            </div>
            <button onClick={() => navigate('/validation')}
              className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-4 rounded-xl transition-all text-sm">
              {t.proceedValidation}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
