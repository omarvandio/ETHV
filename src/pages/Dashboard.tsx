import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../services/apiClient';
import { useWallet } from '../hooks/useWallet';
import { CheckCircle2, Clock, AlertCircle, TrendingUp, Award, Loader2, Download, ExternalLink } from 'lucide-react';
import { Skill } from '../types';

type MintState = 'idle' | 'loading' | 'done' | 'error';

export default function Dashboard() {
  const { address } = useWallet();
  const [mintState, setMintState] = useState<MintState>('idle');
  const [mintResult, setMintResult] = useState<any>(null);
  const [mintError, setMintError] = useState('');
  const [testSkill, setTestSkill] = useState('Solidity');
  const [testLevel, setTestLevel] = useState('junior');
  const [testScore, setTestScore] = useState(85);

  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';

  const effectiveAddress = address || (import.meta.env.VITE_WALLET_BYPASS === 'true' ? import.meta.env.VITE_TEST_WALLET || null : null);

  const mintTestCertificate = async () => {
    if (!effectiveAddress) { setMintError('Conecta tu wallet primero'); return; }
    setMintState('loading');
    setMintError('');
    setMintResult(null);
    try {
      const res = await fetch(`${apiBase}/mint-certificate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: effectiveAddress, skill: testSkill, score: testScore, level: testLevel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setMintResult(data);
      setMintState('done');
    } catch (e: any) {
      setMintError(e.message || 'Error al generar certificado');
      setMintState('error');
    }
  };

  const downloadPDF = () => {
    if (!mintResult?.pdfBase64) return;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${mintResult.pdfBase64}`;
    link.download = `certificado-prueba-${testSkill}-${testLevel}.pdf`;
    link.click();
  };

  const { data: skills, isLoading } = useQuery<Skill[]>({
    queryKey: ['skills'],
    queryFn: async () => {
      // In a real app, this would be:
      // const response = await apiClient.get('/user/skills');
      // return response.data;
      
      // Mock data for demo
      return [
        { id: '1', name: 'Solidity', level: 'expert', isValidated: true },
        { id: '2', name: 'React', level: 'intermediate', isValidated: true },
        { id: '3', name: 'TypeScript', level: 'intermediate', isValidated: false },
        { id: '4', name: 'Rust', level: 'beginner', isValidated: false },
      ] as Skill[];
    },
  });

  const stats = [
    { label: 'Validated Skills', value: skills?.filter(s => s.isValidated).length || 0, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Pending Validation', value: skills?.filter(s => !s.isValidated).length || 0, icon: Clock, color: 'text-amber-500' },
    { label: 'Profile Score', value: '850', icon: TrendingUp, color: 'text-blue-500' },
    { label: 'Open Opportunities', value: '12', icon: AlertCircle, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Talent Dashboard</h1>
        <p className="text-zinc-500 mt-1">Welcome back, <span className="font-mono text-zinc-300">{address}</span></p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <stat.icon className={stat.color} size={24} />
              <span className="text-zinc-600 text-xs font-medium uppercase tracking-wider">Stat</span>
            </div>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-zinc-500 text-sm mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Skills List */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-900 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Your Skills</h2>
              <button className="text-emerald-500 text-sm font-medium hover:underline">Add New</button>
            </div>
            <div className="divide-y divide-zinc-900">
              {isLoading ? (
                <div className="p-8 text-center text-zinc-500">Loading skills...</div>
              ) : (
                skills?.map((skill) => (
                  <div key={skill.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-900/50 transition-colors">
                    <div>
                      <h3 className="text-white font-medium">{skill.name}</h3>
                      <span className="text-zinc-500 text-xs capitalize">{skill.level}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {skill.isValidated ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                          <CheckCircle2 size={12} />
                          Validated
                        </span>
                      ) : (
                        <button className="text-xs font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full hover:border-zinc-700 transition-colors">
                          Validate Now
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <section className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-3 rounded-xl transition-all">
                Upload New CV
              </button>
              <button className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl border border-zinc-800 transition-all">
                Take Skill Test
              </button>
              <button className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl border border-zinc-800 transition-all">
                Browse Jobs
              </button>
            </div>
          </section>

          <section className="bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-2">Pro Tip</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Validating your core skills increases your visibility to top-tier Web3 projects by 400%.
            </p>
          </section>

          {/* ── Test Certificate ─────────────────────────────── */}
          <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Award size={18} className="text-emerald-500" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Certificado de Prueba</h2>
            </div>

            <div className="space-y-2">
              <input
                value={testSkill}
                onChange={e => setTestSkill(e.target.value)}
                placeholder="Skill (ej: Solidity)"
                className="w-full bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-emerald-500 transition-colors placeholder-zinc-600"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={testLevel}
                  onChange={e => setTestLevel(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-emerald-500 transition-colors"
                >
                  <option value="junior">Junior</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                </select>
                <input
                  type="number"
                  min={70} max={100}
                  value={testScore}
                  onChange={e => setTestScore(Number(e.target.value))}
                  className="bg-zinc-900 border border-zinc-800 text-white text-sm rounded-xl px-3 py-2 outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <button
              onClick={mintTestCertificate}
              disabled={mintState === 'loading'}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
            >
              {mintState === 'loading'
                ? <><Loader2 size={15} className="animate-spin" /> Generando…</>
                : <><Award size={15} /> GENERAR CERTI - DE PRUEBA</>}
            </button>

            {mintError && (
              <p className="text-red-400 text-xs">{mintError}</p>
            )}

            {mintState === 'done' && mintResult && (
              <div className="space-y-2 pt-1">
                <p className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 size={13} /> Certificado generado
                </p>
                <p className="text-zinc-600 text-xs font-mono break-all">SHA-256: {mintResult.pdfHash}</p>
                {mintResult.txHash && (
                  <p className="text-zinc-500 text-xs font-mono break-all">TX: {mintResult.txHash}</p>
                )}
                {mintResult.mintError && (
                  <p className="text-amber-400 text-xs">Mint: {mintResult.mintError}</p>
                )}
                <div className="flex gap-2">
                  <button onClick={downloadPDF}
                    className="flex-1 flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold px-3 py-2 rounded-lg transition-all">
                    <Download size={12} /> PDF
                  </button>
                  {mintResult.explorerUrl && (
                    <a href={mintResult.explorerUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all">
                      <ExternalLink size={12} /> Explorer
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
