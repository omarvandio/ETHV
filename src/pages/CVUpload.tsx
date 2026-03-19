import React, { useState, useEffect } from 'react';
import { Upload, FileText, Check, AlertCircle, Loader2, Wifi, WifiOff, Terminal, Mail, Phone, MapPin, Linkedin, Github, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeCV, checkConnection, getLogs, clearLogs } from '../services/openclaw';

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
      
      setUploadStatus('success');
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

  const getEducationName = (edu: any): string => {
    if (typeof edu === 'string') return edu;
    if (edu?.degree) return edu.degree + (edu?.school ? ` at ${edu.school}` : '');
    return JSON.stringify(edu);
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
