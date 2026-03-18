import React, { useState } from 'react';
import { Link2, Send, Loader2, Check, AlertCircle, Globe, FileText, Copy, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { analyzeProfileContent } from '../services/openclaw';

export default function LinkedInAnalyzer() {
  const [inputMode, setInputMode] = useState<'url' | 'text'>('url');
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [profileText, setProfileText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const isValidLinkedInUrl = (url: string) => url.toLowerCase().includes('linkedin.com');

  const handleAnalyze = async () => {
    const content = inputMode === 'url' ? linkedInUrl : profileText;
    
    if (!content.trim()) {
      setError(inputMode === 'url' ? 'Please enter a LinkedIn URL' : 'Please paste profile content');
      setStatus('error');
      return;
    }

    if (inputMode === 'url' && !isValidLinkedInUrl(content)) {
      setError('Please enter a valid LinkedIn URL');
      setStatus('error');
      return;
    }

    setIsAnalyzing(true);
    setStatus('idle');
    setError('');
    setResult(null);

    try {
      let profileContent = content;
      
      // If URL mode, add context that LinkedIn is blocked
      if (inputMode === 'url') {
        profileContent = `LinkedIn Profile URL: ${content}\n\nNote: LinkedIn blocks automated access. Please paste the profile content manually for analysis, or provide any information you have about this person.`;
      }

      console.log('[LinkedInAnalyzer] Calling analyzeProfileContent...');
      const analysisResult = await analyzeProfileContent(profileContent);
      
      console.log('[LinkedInAnalyzer] Analysis result:', analysisResult);
      setResult(analysisResult);
      setStatus('success');
      
    } catch (err: any) {
      console.error('[LinkedInAnalyzer] Error:', err);
      setError(err.message || 'Analysis failed. Please try again.');
      setStatus('error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="relative inline-block">
          <Globe className="w-12 h-12 mx-auto mb-4 text-emerald-500" />
          <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-yellow-400 animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">LinkedIn Analyzer</h2>
        <p className="text-zinc-400">Extract skills and validate talent from LinkedIn profiles</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex justify-center mb-6">
        <div className="bg-zinc-900 p-1 rounded-xl flex gap-1">
          <button
            onClick={() => { setInputMode('url'); setStatus('idle'); setError(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${inputMode === 'url' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            <Link2 className="inline w-4 h-4 mr-1" />
            URL
          </button>
          <button
            onClick={() => { setInputMode('text'); setStatus('idle'); setError(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${inputMode === 'text' ? 'bg-emerald-500 text-black' : 'text-zinc-400 hover:text-white'}`}
          >
            <FileText className="inline w-4 h-4 mr-1" />
            Paste Text
          </button>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6">
        {inputMode === 'url' ? (
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">LinkedIn Profile URL</label>
            <input
              type="url"
              value={linkedInUrl}
              onChange={(e) => { setLinkedInUrl(e.target.value); setStatus('idle'); setError(''); }}
              placeholder="https://linkedin.com/in/yourprofile"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-xs text-zinc-500">
              💡 LinkedIn blocks automated access. For best results, use "Paste Text" mode below.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Paste LinkedIn Profile Content</label>
            <textarea
              value={profileText}
              onChange={(e) => { setProfileText(e.target.value); setStatus('idle'); setError(''); }}
              placeholder="Paste the profile text here... (name, headline, about, experience, skills, education)"
              rows={8}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
            <p className="text-xs text-zinc-500">
              💡 Copy and paste the profile content manually for best results
            </p>
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="w-full mt-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {isAnalyzing ? <Loader2 className="animate-spin" /> : <Send />}
          {isAnalyzing ? 'Analyzing with AI...' : 'Analyze Profile'}
        </button>

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {status === 'success' && result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-500">
              <Check size={20} />
              <span className="font-bold">Analysis Complete</span>
            </div>

            {result.summary && (
              <div className="bg-zinc-900/50 p-4 rounded-xl border-l-4 border-emerald-500">
                <div className="flex justify-between items-start">
                  <p className="text-white">{result.summary}</p>
                  <button onClick={() => copyToClipboard(result.summary)} className="text-zinc-500 hover:text-white">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {result.headline && (
              <div className="bg-zinc-900/50 p-4 rounded-xl">
                <h4 className="text-zinc-400 text-sm mb-1">Headline</h4>
                <p className="text-white font-medium">{result.headline}</p>
              </div>
            )}

            {result.skills?.length > 0 && (
              <div>
                <h4 className="text-zinc-400 text-sm mb-2 flex items-center gap-2">
                  Skills ({result.skills.length})
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Verified</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.skills.map((s: string, i: number) => (
                    <span key={i} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg text-sm">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.experience_years > 0 && (
              <div className="bg-zinc-900/50 p-4 rounded-xl">
                <h4 className="text-zinc-400 text-sm">Experience</h4>
                <p className="text-white font-bold text-lg">{result.experience_years} years</p>
              </div>
            )}

            {result.education?.length > 0 && (
              <div>
                <h4 className="text-zinc-400 text-sm mb-2">Education</h4>
                {result.education.map((e: string, i: number) => (
                  <p key={i} className="text-white text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    {e}
                  </p>
                ))}
              </div>
            )}

            {result.certifications?.length > 0 && (
              <div>
                <h4 className="text-zinc-400 text-sm mb-2">Certifications</h4>
                <div className="flex flex-wrap gap-2">
                  {result.certifications.map((c: string, i: number) => (
                    <span key={i} className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-3 py-1 rounded-lg text-sm">
                      🏆 {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button className="w-full bg-emerald-500 text-black font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors">
              Proceed to Validation
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
