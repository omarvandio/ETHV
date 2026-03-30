import React, { useState, useEffect } from 'react';
import { Upload, FileText, Check, AlertCircle, Loader2, Wifi, WifiOff, Terminal, Mail, Phone, MapPin, Linkedin, Github, Globe, FileDown, Briefcase, Clock, X, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeCV, checkConnection, getLogs, clearLogs, generateCoverLetter, generateInterviewPrep, analyzeJobOffer } from '../services/openclaw';

interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export default function CVUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // Contact info
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: ''
  });
  
  // Professional info
  const [currentPosition, setCurrentPosition] = useState<string>('');
  const [company, setCompany] = useState<string>('');
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [experienceYears, setExperienceYears] = useState<number>(0);
  const [certifications, setCertifications] = useState<any[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [education, setEducation] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [web3Relevance, setWeb3Relevance] = useState<string>('low');
  const [overallScore, setOverallScore] = useState<number>(0);
  const [atsScore, setAtsScore] = useState<number>(0);
  const [dimensions, setDimensions] = useState<any>({});
  const [suggestedRoles, setSuggestedRoles] = useState<any[]>([]);
  const [estimatedLevel, setEstimatedLevel] = useState<string>('');
  const [strengths, setStrengths] = useState<string[]>([]);
  const [improvements, setImprovements] = useState<string[]>([]);
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [interviewPrep, setInterviewPrep] = useState<any>(null);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [showInterviewPrep, setShowInterviewPrep] = useState(false);
  const [showJobAnalysis, setShowJobAnalysis] = useState(false);
  const [jobOfferInput, setJobOfferInput] = useState({ title: '', company: '', required_skills: '', experience_required: 0 });
  const [jobAnalysisResult, setJobAnalysisResult] = useState<any>(null);
  const [cvStats, setCvStats] = useState<any>(null);
  
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    checkConnection()
      .then(setIsConnected)
      .catch(() => setIsConnected(false));
  }, []);

  useEffect(() => {
    if (showLogs) {
      const interval = setInterval(() => {
        setLogs(getLogs());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [showLogs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadStatus('idle');
      setErrorMessage('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadStatus('idle');
    setErrorMessage('');

    try {
      const result = await analyzeCV(file);
      
      // Contact info
      if (result.name) setContactInfo(prev => ({ ...prev, name: result.name }));
      if (result.email) setContactInfo(prev => ({ ...prev, email: result.email }));
      if (result.phone) setContactInfo(prev => ({ ...prev, phone: result.phone }));
      if (result.location) setContactInfo(prev => ({ ...prev, location: result.location }));
      if (result.linkedin) setContactInfo(prev => ({ ...prev, linkedin: result.linkedin }));
      if (result.github) setContactInfo(prev => ({ ...prev, github: result.github }));
      if (result.portfolio) setContactInfo(prev => ({ ...prev, portfolio: result.portfolio }));
      
      // Professional info
      if (result.current_position) setCurrentPosition(result.current_position);
      if (result.company) setCompany(result.company);
      if (result.skills) setExtractedSkills(result.skills);
      if (result.experience_years) setExperienceYears(result.experience_years);
      if (result.certifications) setCertifications(result.certifications);
      if (result.languages) setLanguages(result.languages);
      if (result.education) setEducation(result.education);
      if (result.summary) setSummary(result.summary);
      if (result.web3_relevance) setWeb3Relevance(result.web3_relevance);
      
      // Use scores from backend analysis (proper implementation)
      setOverallScore(result.score || 0);
      setAtsScore(result.ats_score || 0);
      setEstimatedLevel(result.level || '');
      setDimensions(result.dimensions || {});
      setSuggestedRoles(result.suggested_roles || []);
      setStrengths(result.strengths || []);
      setImprovements(result.improvements || []);
      setCvStats(result.stats || null);
      
      setUploadStatus('success');

      try {
        setCoverLetter(generateCoverLetter(result, result.current_position || 'Developer', 'Company'));
        setInterviewPrep(generateInterviewPrep(result));
      } catch(e) {}
    } catch (error: any) {
      console.error('Upload failed:', error);
      setErrorMessage(error.message || 'Failed to analyze CV');
      setUploadStatus('error');
    } finally {
      setIsUploading(false);
    }
  };

  const getCertName = (cert: any): string => {
    if (typeof cert === 'string') return cert;
    if (cert?.name) return cert.name;
    if (cert?.issuer) return cert.issuer;
    return JSON.stringify(cert);
  };

  const getLanguageName = (lang: any): string => {
    if (typeof lang === 'string') return lang;
    if (lang?.language) return lang.language + (lang?.level ? ` (${lang.level})` : '');
    return JSON.stringify(lang);
  };

  const handleJobAnalysis = async () => {
    try {
      const resultData = analyzeJobOffer(
        { skills: extractedSkills, experience_years: experienceYears, certifications },
        jobOfferInput
      );
      setJobAnalysisResult(resultData);
    } catch (e) {
      console.error('Job analysis error:', e);
    }
  };

  const getEducationName = (edu: any): string => {
    if (typeof edu === 'string') return edu;
    if (edu?.degree) return edu.degree + (edu?.school ? ` at ${edu.school}` : '');
    return JSON.stringify(edu);
  };

  // Helper to get score color class
  const getScoreColorClass = (score: number) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Helper to get progress bar color class
  const getProgressBarColorClass = (score: number) => {
    if (score >= 70) return 'bg-emerald-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="max-w-3xl mx-auto py-12">
      <header className="text-center mb-12">
        <h1 className="text-3xl font-bold text-white mb-4">Upload Your CV</h1>
        <p className="text-zinc-500">Our AI will analyze your experience and extract relevant Web3 skills for validation.</p>
        
        <div className="mt-4 flex justify-center items-center gap-4">
          {isConnected === null ? (
            <span className="text-zinc-500 text-sm">Checking connection...</span>
          ) : isConnected ? (
            <span className="flex items-center gap-1 text-emerald-500 text-sm">
              <Wifi size={14} /> Connected to ETHV
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-500 text-sm">
              <WifiOff size={14} /> Not connected
            </span>
          )}
          
          <button 
            onClick={() => { setShowLogs(!showLogs); if(!showLogs) setLogs(getLogs()); }}
            className="flex items-center gap-1 text-zinc-500 text-sm hover:text-white"
          >
            <Terminal size={14} /> {showLogs ? 'Hide' : 'Show'} Logs
          </button>
        </div>
      </header>

      {showLogs && (
        <div className="mb-6 bg-zinc-900 rounded-xl p-4 max-h-64 overflow-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="text-zinc-400 text-sm font-bold">Debug Logs</span>
            <button onClick={clearLogs} className="text-zinc-500 text-xs hover:text-white">Clear</button>
          </div>
          {logs.length === 0 ? (
            <p className="text-zinc-600 text-sm">No logs yet...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="text-xs font-mono mb-1">
                <span className="text-zinc-500">[{log.time?.slice(11,19)}]</span>{' '}
                <span className={
                  log.level === 'ERROR' ? 'text-red-400' : 
                  log.level === 'WARN' ? 'text-yellow-400' : 'text-zinc-400'
                }>{log.level}</span>{' '}
                <span className="text-zinc-300">{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="bg-zinc-950 border border-zinc-900 rounded-3xl p-8 md:p-12">
        <div 
          className="border-2 border-dashed border-zinc-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-emerald-500/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById('cv-input')?.click()}
        >
          <input 
            id="cv-input"
            type="file" 
            accept=".pdf,.docx,.md,.txt" 
            className="hidden" 
            onChange={handleFileChange}
          />
          <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
            <Upload className="text-emerald-500" size={32} />
          </div>
          {file ? (
            <div className="flex items-center gap-2 text-white font-medium">
              <FileText size={20} className="text-zinc-400" />
              {file.name}
            </div>
          ) : (
            <>
              <p className="text-white font-medium mb-1">Click to upload or drag and drop</p>
              <p className="text-zinc-500 text-sm">PDF, DOCX, MD, TXT (max. 5MB)</p>
            </>
          )}
        </div>

        <div className="mt-8">
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Analyzing with ETHV Agent...
              </>
            ) : (
              'Start Analysis'
            )}
          </button>
        </div>

        <AnimatePresence>
          {uploadStatus === 'success' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-12 space-y-6"
            >
              <div className="flex items-center gap-2 text-emerald-500 font-bold">
                <Check size={20} />
                Analysis Complete
              </div>
              
              {overallScore > 0 && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-zinc-400">Overall Score</span>
                    <span className={`text-2xl font-bold ${getScoreColorClass(overallScore)}`}>{overallScore}/100</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2 rounded-full">
                    <div className={`h-2 rounded-full ${getProgressBarColorClass(overallScore)}`} style={{width: overallScore+'%'}}></div>
                  </div>
                  {estimatedLevel && <p className="text-zinc-400 text-sm mt-2">Level: {estimatedLevel}</p>}
                </div>
              )}
              
              {suggestedRoles.length > 0 && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <h4 className="text-zinc-400 text-sm mb-3">Suggested Roles</h4>
                  <div className="space-y-2">
                    {suggestedRoles.map((role, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-white">{role.title}</span>
                        <span className={`text-sm font-bold ${(role.match_percentage || role.match) >= 80 ? 'text-emerald-400' : 'text-yellow-400'}`}>{(role.match_percentage || role.match)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {dimensions.ats > 0 && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <h4 className="text-zinc-400 text-sm mb-3">Dimensions Analysis</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between items-center"><span className="text-zinc-500">ATS</span><span className="text-white font-medium">{dimensions.ats}%</span></div>
                    <div className="flex justify-between items-center"><span className="text-zinc-500">Enfoque</span><span className="text-white font-medium">{dimensions.enfoque}%</span></div>
                    <div className="flex justify-between items-center"><span className="text-zinc-500">Impacto</span><span className="text-white font-medium">{dimensions.impacto}%</span></div>
                    <div className="flex justify-between items-center"><span className="text-zinc-500">Claridad</span><span className="text-white font-medium">{dimensions.claridad}%</span></div>
                    <div className="flex justify-between items-center"><span className="text-zinc-500">Contacto</span><span className="text-white font-medium">{dimensions.contacto}%</span></div>
                    <div className="flex justify-between items-center"><span className="text-zinc-500">Legibilidad</span><span className="text-white font-medium">{dimensions.legibilidad}%</span></div>
                  </div>
                </div>
              )}
              
              {strengths.length > 0 && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <h4 className="text-emerald-400 text-sm mb-2">✓ Strengths</h4>
                  <ul className="text-zinc-300 text-sm space-y-1">
                    {strengths.map((s,i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              )}
              
              {improvements.length > 0 && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <h4 className="text-yellow-400 text-sm mb-2">→ Improvements</h4>
                  <ul className="text-zinc-300 text-sm space-y-1">
                    {improvements.map((s,i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              )}
              
              {/* Contact Information */}
              {(contactInfo.name || contactInfo.email || contactInfo.phone) && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <h4 className="text-zinc-400 text-sm mb-3">Contact Information</h4>
                  <div className="space-y-2">
                    {contactInfo.name && (
                      <div className="flex items-center gap-2 text-white">
                        <span className="font-bold">{contactInfo.name}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-4">
                      {contactInfo.email && (
                        <a href={'mailto:' + contactInfo.email} className="flex items-center gap-1 text-zinc-300 hover:text-emerald-400 text-sm">
                          <Mail size={14} /> {contactInfo.email}
                        </a>
                      )}
                      {contactInfo.phone && (
                        <a href={'tel:' + contactInfo.phone} className="flex items-center gap-1 text-zinc-300 hover:text-emerald-400 text-sm">
                          <Phone size={14} /> {contactInfo.phone}
                        </a>
                      )}
                      {contactInfo.location && (
                        <span className="flex items-center gap-1 text-zinc-300 text-sm">
                          <MapPin size={14} /> {contactInfo.location}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {contactInfo.linkedin && (
                        <a href={contactInfo.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-zinc-300 hover:text-emerald-400 text-sm">
                          <Linkedin size={14} /> LinkedIn
                        </a>
                      )}
                      {contactInfo.github && (
                        <a href={contactInfo.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-zinc-300 hover:text-emerald-400 text-sm">
                          <Github size={14} /> GitHub
                        </a>
                      )}
                      {contactInfo.portfolio && (
                        <a href={contactInfo.portfolio} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-zinc-300 hover:text-emerald-400 text-sm">
                          <Globe size={14} /> Portfolio
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Current Position */}
              {(currentPosition || company) && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <h4 className="text-zinc-400 text-sm mb-1">Current Role</h4>
                  <p className="text-white font-bold text-lg">
                    {currentPosition} {company && <span className="text-zinc-400 font-normal">at {company}</span>}
                  </p>
                </div>
              )}
              
              {summary && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <h4 className="text-zinc-400 text-sm mb-2">Profile Summary</h4>
                  <p className="text-white">{summary}</p>
                </div>
              )}
              
              {experienceYears > 0 && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <h4 className="text-zinc-400 text-sm mb-1">Experience</h4>
                  <p className="text-white font-bold text-lg">{experienceYears} years</p>
                </div>
              )}
              
              {/* Skills */}
              <div>
                <h3 className="text-white font-bold mb-4">Extracted Skills ({extractedSkills.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {extractedSkills.map((skill, idx) => (
                    <span key={idx} className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg text-sm">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Certifications */}
              {certifications.length > 0 && (
                <div>
                  <h3 className="text-white font-bold mb-4">Certifications</h3>
                  <div className="flex flex-wrap gap-2">
                    {certifications.map((cert, idx) => (
                      <span key={idx} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-lg text-sm">
                        {getCertName(cert)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Languages */}
              {languages.length > 0 && (
                <div>
                  <h3 className="text-white font-bold mb-4">Languages</h3>
                  <div className="flex flex-wrap gap-2">
                    {languages.map((lang: any, idx: number) => (
                      <span key={idx} className="bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg text-sm">
                        {getLanguageName(lang)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Web3 Relevance */}
              <div className={`p-4 rounded-xl border ${
                web3Relevance === 'high' ? 'bg-emerald-500/10 border-emerald-500/20' :
                web3Relevance === 'medium' ? 'bg-yellow-500/10 border-yellow-500/20' :
                'bg-zinc-900 border-zinc-800'
              }`}>
                <h4 className="text-zinc-400 text-sm mb-1">Web3 Relevance</h4>
                <p className={`font-bold text-lg capitalize ${
                  web3Relevance === 'high' ? 'text-emerald-400' :
                  web3Relevance === 'medium' ? 'text-yellow-400' :
                  'text-zinc-400'
                }`}>
                  {web3Relevance}
                </p>
              </div>
              
                            {/* CV Stats */}
              {cvStats && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <h4 className="text-zinc-400 text-sm mb-3">CV Statistics</h4>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-white">{cvStats.word_count || 0}</p>
                      <p className="text-zinc-500 text-xs">Words</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-white">{cvStats.reading_time_minutes || 1}</p>
                      <p className="text-zinc-500 text-xs">Min read</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-emerald-400">{cvStats.spelling_score || 100}%</p>
                      <p className="text-zinc-500 text-xs">Spelling</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Cover Letter Section */}
              {coverLetter && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <button 
                    onClick={() => setShowCoverLetter(!showCoverLetter)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <h4 className="text-zinc-400 text-sm">Cover Letter Generator</h4>
                    {showCoverLetter ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                  </button>
                  {showCoverLetter && (
                    <div className="mt-4">
                      <pre className="text-zinc-300 text-sm whitespace-pre-wrap font-sans">{coverLetter}</pre>
                      <button className="mt-4 flex items-center gap-2 text-emerald-400 text-sm hover:text-emerald-300">
                        <FileDown size={16} /> Download as TXT
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {/* Interview Preparation Section */}
              {interviewPrep && (
                <div className="bg-zinc-900/50 p-4 rounded-xl">
                  <button 
                    onClick={() => setShowInterviewPrep(!showInterviewPrep)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <h4 className="text-zinc-400 text-sm">Interview Preparation</h4>
                    {showInterviewPrep ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                  </button>
                  {showInterviewPrep && (
                    <div className="mt-4 space-y-4">
                      <div>
                        <h5 className="text-white text-sm font-bold mb-2">Common Questions</h5>
                        <ul className="text-zinc-300 text-sm space-y-1">
                          {interviewPrep.common_questions?.map((q: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-emerald-400">•</span>
                              {q}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h5 className="text-white text-sm font-bold mb-2">STAR Method Examples</h5>
                        <div className="space-y-2">
                          {interviewPrep.star_method_examples?.slice(0, 2).map((ex: string, i: number) => (
                            <p key={i} className="text-zinc-400 text-xs italic border-l-2 border-emerald-500 pl-2">{ex}</p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h5 className="text-white text-sm font-bold mb-2">Tips</h5>
                        <ul className="text-zinc-300 text-sm space-y-1">
                          {interviewPrep.tips?.slice(0, 4).map((tip: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-yellow-400">→</span>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Job Offer Analysis Section */}
              <div className="bg-zinc-900/50 p-4 rounded-xl">
                <button 
                  onClick={() => setShowJobAnalysis(!showJobAnalysis)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <h4 className="text-zinc-400 text-sm">Job Offer Analysis</h4>
                  {showJobAnalysis ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                </button>
                {showJobAnalysis && (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Job Title"
                        value={jobOfferInput.title}
                        onChange={(e) => setJobOfferInput({...jobOfferInput, title: e.target.value})}
                        className="bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Company"
                        value={jobOfferInput.company}
                        onChange={(e) => setJobOfferInput({...jobOfferInput, company: e.target.value})}
                        className="bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-lg text-sm"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Required Skills (comma separated)"
                      value={jobOfferInput.required_skills}
                      onChange={(e) => setJobOfferInput({...jobOfferInput, required_skills: e.target.value})}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Years of Experience Required"
                      value={jobOfferInput.experience_required || ''}
                      onChange={(e) => setJobOfferInput({...jobOfferInput, experience_required: parseInt(e.target.value) || 0})}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-lg text-sm"
                    />
                    <button 
                      onClick={handleJobAnalysis}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2"
                    >
                      <Briefcase size={16} /> Analyze Match
                    </button>
                    
                    {jobAnalysisResult && (
                      <div className="mt-4 p-3 bg-zinc-800 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-zinc-400 text-sm">Overall Match</span>
                          <span className={`text-2xl font-bold ${jobAnalysisResult.overall_match >= 70 ? 'text-emerald-400' : 'text-yellow-400'}`}>{jobAnalysisResult.overall_match}%</span>
                        </div>
                        {jobAnalysisResult.skill_gaps?.length > 0 && (
                          <div className="mb-3">
                            <p className="text-zinc-500 text-xs mb-1">Skill Gaps:</p>
                            <div className="flex flex-wrap gap-1">
                              {jobAnalysisResult.skill_gaps.slice(0, 3).map((skill: string, i: number) => (
                                <span key={i} className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs">{skill}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {jobAnalysisResult.recommendations && (
                          <div>
                            <p className="text-zinc-500 text-xs mb-1">Recommendations:</p>
                            <p className="text-zinc-300 text-xs">{jobAnalysisResult.recommendations[0]}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-emerald-400 text-sm">
                Great! We've found {extractedSkills.length} skills. You can now proceed to validate them to earn your on-chain credentials.
              </div>
              <button className="w-full bg-zinc-100 hover:bg-white text-black font-bold py-3 rounded-xl transition-all">
                Proceed to Validation
              </button>
            </motion.div>
          )}

          {uploadStatus === 'error' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 text-sm flex items-center gap-2"
            >
              <AlertCircle size={20} />
              {errorMessage || 'Failed to analyze CV. Please try again.'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
