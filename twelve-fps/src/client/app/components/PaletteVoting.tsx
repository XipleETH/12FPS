import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Vote, TrendingUp, Users, RefreshCw, Clock } from 'lucide-react';
import { allBrushPresets } from '../brushes';

interface PaletteVotingProps {}

interface Proposal {
  id: string;
  type: 'palette' | 'theme' | 'brushKit';
  title: string;
  data: any; // colors array for palette, description for theme, modes array for brushKit
  proposedBy: string;
  proposedAt: number;
  votes: number;
  voters: string[];
}

interface VotingStats {
  totalVotes: number;
  activeVoters: number;
  totalProposals: number;
}

export const PaletteVoting: React.FC<PaletteVotingProps> = () => {
  type SubPage = 'palettes' | 'themes' | 'brushes';
  const [subPage, setSubPage] = useState<SubPage>('palettes');
  
  // Real data from Reddit/Devvit
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [votingStats, setVotingStats] = useState<VotingStats>({ totalVotes: 0, activeVoters: 0, totalProposals: 0 });
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<number>(1);

  useEffect(()=>{ let cancel=false; (async()=>{ try { const r= await fetch('/api/week'); if(r.ok){ const j= await r.json(); if(!cancel) setCurrentWeek(j.week); } } catch{} })(); return ()=>{cancel=true}; },[]);

  // Load data from Reddit/Devvit endpoints
  const loadData = useCallback(async () => {
    try {
      const [proposalsRes, statsRes, userRes] = await Promise.all([
        fetch(`/api/proposals?week=${currentWeek}`),
        fetch(`/api/voting-stats?week=${currentWeek}`),
        fetch('/api/user')
      ]);
      
      if (proposalsRes.ok) {
        const proposalsData = await proposalsRes.json();
        setProposals(proposalsData.proposals || []);
      }
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setVotingStats(statsData);
      }
      
      if (userRes.ok) {
        const userData = await userRes.json();
        setCurrentUser(userData.username);
      }
    } catch (e) {
      console.error('[PaletteVoting] error loading data', e);
    } finally {
      setLoading(false);
    }
  }, [currentWeek]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData, currentWeek]);

  // Hash routing for subpages
  useEffect(() => {
    const parse = () => {
      const h = window.location.hash.toLowerCase();
  if (h.includes('/voting/themes')) setSubPage('themes');
  else if (h.includes('/voting/brushes')) setSubPage('brushes');
      else setSubPage('palettes');
    };
    parse();
    const onHash = () => parse();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (sp: SubPage) => {
  const path = sp === 'palettes' ? '#/voting/palettes' : sp === 'themes' ? '#/voting/themes' : '#/voting/brushes';
    window.location.hash = path;
    setSubPage(sp);
  };

  // Filter proposals by type
  const paletteProposals = proposals.filter(p => p.type === 'palette');
  const themeProposals = proposals.filter(p => p.type === 'theme');
  const brushSetProposals = proposals.filter(p => p.type === 'brushKit');

  // Vote on a proposal
  const vote = useCallback(async (proposalId: string) => {
    try {
      const response = await fetch(`/api/proposals/${proposalId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update proposal locally
        setProposals(prev => prev.map(p => 
          p.id === proposalId 
            ? { 
                ...p, 
                votes: data.votes,
                voters: data.voted 
                  ? [...p.voters, currentUser!].filter(Boolean)
                  : p.voters.filter(v => v !== currentUser)
              }
            : p
        ));
        // Refresh stats
        loadData();
      }
    } catch (e) {
      console.error('[PaletteVoting] error voting', e);
    }
  }, [currentUser, loadData]);

  // Submit new proposal
  const submitProposal = useCallback(async (type: 'palette' | 'theme' | 'brushKit', title: string, data: any) => {
    if (submitting) return false;
    setSubmitting(true);
    
    try {
      const response = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, data })
      });
      
      if (response.ok) {
        const result = await response.json();
        // Add to local state
        setProposals(prev => [result.proposal, ...prev]);
        // Refresh data
        await loadData();
        return true;
      }
    } catch (e) {
      console.error('[PaletteVoting] error submitting proposal', e);
    } finally {
      setSubmitting(false);
    }
    return false;
  }, [submitting, loadData]);

  // Form states
  const [newPaletteName, setNewPaletteName] = useState('');
  const [newPaletteColors, setNewPaletteColors] = useState<string[]>(['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD']);
  const [newThemeTitle, setNewThemeTitle] = useState('');
  // (legacy) modes removed; we now propose concrete brush presets (max 4)

  const isHex = (s: string) => /^#([0-9a-fA-F]{6})$/.test(s);
  const canSubmitPalette = useMemo(() => 
    newPaletteName.trim().length > 0 && 
    newPaletteColors.length === 6 && 
    newPaletteColors.every(isHex), 
    [newPaletteName, newPaletteColors]
  );
  const canSubmitTheme = useMemo(() => newThemeTitle.trim().length >= 3, [newThemeTitle]);
  // no modes page/state

  // Submit handlers
  const handleSubmitPalette = async () => {
    if (!canSubmitPalette) return;
    // normalize palette data to { colors: string[] }
    const success = await submitProposal('palette', newPaletteName.trim(), { colors: newPaletteColors });
    if (success) {
      setNewPaletteName('');
      setNewPaletteColors(['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD']);
    }
  };

  const handleSubmitTheme = async () => {
    if (!canSubmitTheme) return;
    const success = await submitProposal('theme', newThemeTitle.trim(), { description: newThemeTitle.trim() });
    if (success) {
      setNewThemeTitle('');
    }
  };

  // Brush proposals (choose up to 4 existing brushes)
  const [selectedBrushIds, setSelectedBrushIds] = useState<string[]>([]);
  const canSubmitBrushes = useMemo(() => selectedBrushIds.length > 0 && selectedBrushIds.length <= 4, [selectedBrushIds]);
  const handleToggleBrush = (id: string) => {
    setSelectedBrushIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length < 4 ? [...prev, id] : prev));
  };
  const handleSubmitBrushes = async () => {
    if (!canSubmitBrushes) return;
    const names = allBrushPresets.filter(b => selectedBrushIds.includes(b.id)).map(b => b.name);
    const title = names.join(' + ');
  const ok = await submitProposal('brushKit', title, { ids: selectedBrushIds, names });
    if (ok) setSelectedBrushIds([]);
  };

  // no mode badge

  // Check if user has voted
  const hasUserVoted = (proposal: Proposal) => {
    return currentUser ? proposal.voters.includes(currentUser) : false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-white mb-2">Weekly Voting</h2>
        <p className="text-white/70 text-sm md:text-base">Vote on the 6-color palette, allowed brushes, and the theme.</p>
        {currentUser && (
          <p className="text-white/60 text-sm mt-1">Logged in as <span className="font-semibold text-white/80">u/{currentUser}</span></p>
        )}
      </div>

      {/* Subpage tabs */}
      <div className="flex items-center justify-center gap-2 md:gap-3">
        {([
          {key:'palettes', label:'Palettes', count: paletteProposals.length},
          {key:'themes', label:'Themes', count: themeProposals.length},
          {key:'brushes', label:'Brushes', count: brushSetProposals.length}
        ] as Array<{key: SubPage; label: string; count: number}>).map(t => (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm border transition flex items-center gap-2 ${subPage===t.key? 'bg-white/30 text-white border-white/60':'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs font-semibold">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Palettes page */}
      {subPage === 'palettes' && (
        <>
          <section className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 md:p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">Propose palette (6 colors)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1 flex flex-col gap-2">
                <label className="text-white/80 text-sm">Name</label>
                <input 
                  value={newPaletteName} 
                  onChange={e => setNewPaletteName(e.target.value)} 
                  placeholder="Palette name" 
                  className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40" 
                />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                {newPaletteColors.map((c, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <input 
                      type="color" 
                      value={c} 
                      onChange={e => {
                        const arr=[...newPaletteColors]; 
                        arr[i]=e.target.value.toUpperCase(); 
                        setNewPaletteColors(arr);
                      }} 
                      className="w-10 h-10 rounded-md border border-white/30 cursor-pointer" 
                    />
                    <input 
                      value={c} 
                      onChange={e => {
                        const v=e.target.value.toUpperCase(); 
                        const arr=[...newPaletteColors]; 
                        arr[i]=v; 
                        setNewPaletteColors(arr);
                      }} 
                      className="w-20 text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-white placeholder-white/40" 
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <button 
                disabled={!canSubmitPalette || submitting} 
                onClick={handleSubmitPalette} 
                className={`px-4 py-2 rounded-lg font-semibold ${canSubmitPalette && !submitting ? 'bg-emerald-500 hover:bg-emerald-600 text-white':'bg-white/10 text-white/50 cursor-not-allowed'}`}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </section>
          
          <section>
            <h3 className="text-xl font-bold text-white mb-3">Proposed palettes</h3>
            {paletteProposals.length === 0 ? (
              <div className="text-center py-8 text-white/60">
                <p>No palette proposals yet. Be the first to propose one!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
                {paletteProposals.map(palette => {
                  const voted = hasUserVoted(palette);
                  return (
                    <div key={palette.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-lg font-bold text-white mb-1">{palette.title}</h4>
                          <div className="flex items-center space-x-2 text-white/70 text-sm">
                            <Users className="w-3 h-3" />
                            <span>by u/{palette.proposedBy}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <TrendingUp className="w-4 h-4 text-green-400" />
                          <span className="text-white font-semibold">{palette.votes}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-6 gap-2 mb-4">
                        {(Array.isArray(palette.data) ? palette.data : (palette.data?.colors || [])).map((color: string, i: number) => (
                          <div key={i} className="aspect-square rounded-lg border border-white/20" style={{backgroundColor: color}} title={color} />
                        ))}
                      </div>
                      <button 
                        onClick={() => vote(palette.id)} 
                        disabled={!currentUser}
                        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${voted ? 'bg-green-500 hover:bg-green-600 text-white':'bg-white/10 hover:bg-white/20 text-white border border-white/20'} ${!currentUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Vote className="w-4 h-4" />
                        <span className="font-semibold">{voted ? 'Voted!' : 'Vote for this palette'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Themes page */}
      {subPage === 'themes' && (
        <>
          <section className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 md:p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">Propose theme</h3>
            <div className="flex gap-2">
              <input 
                value={newThemeTitle} 
                onChange={e => setNewThemeTitle(e.target.value)} 
                placeholder="e.g., Retro Future" 
                className="flex-1 px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40" 
              />
              <button 
                disabled={!canSubmitTheme || submitting} 
                onClick={handleSubmitTheme} 
                className={`px-4 py-2 rounded-lg font-semibold ${canSubmitTheme && !submitting ? 'bg-emerald-500 hover:bg-emerald-600 text-white':'bg-white/10 text-white/50 cursor-not-allowed'}`}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </section>
          
          <section>
            <h3 className="text-xl font-bold text-white mb-3">Proposed themes</h3>
            {themeProposals.length === 0 ? (
              <div className="text-center py-8 text-white/60">
                <p>No theme proposals yet. Be the first to propose one!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
                {themeProposals.map(theme => {
                  const voted = hasUserVoted(theme);
                  return (
                    <div key={theme.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="text-lg font-bold text-white mb-1">{theme.title}</h4>
                          <div className="flex items-center space-x-2 text-white/70 text-sm">
                            <Users className="w-3 h-3" />
                            <span>by u/{theme.proposedBy}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <TrendingUp className="w-4 h-4 text-green-400" />
                          <span className="text-white font-semibold">{theme.votes}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => vote(theme.id)} 
                        disabled={!currentUser}
                        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${voted ? 'bg-green-500 hover:bg-green-600 text-white':'bg-white/10 hover:bg-white/20 text-white border border-white/20'} ${!currentUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Vote className="w-4 h-4" />
                        <span className="font-semibold">{voted ? 'Voted!' : 'Vote for this theme'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Brushes page */}
      {subPage === 'brushes' && (
        <>
          <section className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 md:p-6 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">Propose brushes (max 4)</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {allBrushPresets.map(b => {
                const checked = selectedBrushIds.includes(b.id);
                const disabledChoice = !checked && selectedBrushIds.length >= 4;
                return (
                  <label key={b.id} className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${checked ? 'bg-white/20 border-white/50 text-white' : disabledChoice ? 'bg-white/5 border-white/10 text-white/30' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'}`}>
                    <input type="checkbox" className="accent-white" checked={checked} onChange={() => handleToggleBrush(b.id)} disabled={disabledChoice} />
                    <span className="text-xs">{b.name}</span>
                  </label>
                );
              })}
            </div>
            <button 
              disabled={!canSubmitBrushes || submitting} 
              onClick={handleSubmitBrushes} 
              className={`px-4 py-2 rounded-lg font-semibold ${canSubmitBrushes && !submitting ? 'bg-emerald-500 hover:bg-emerald-600 text-white':'bg-white/10 text-white/50 cursor-not-allowed'}`}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </section>
          <section>
            <h3 className="text-xl font-bold text-white mb-3">Proposed brush sets</h3>
            {brushSetProposals.length === 0 ? (
              <div className="text-center py-8 text-white/60">
                <p>No brush proposals yet. Be the first to propose a set!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
                {brushSetProposals.map(setp => {
                  const voted = hasUserVoted(setp);
                  const ids: string[] = Array.isArray(setp.data) ? setp.data : (setp.data?.ids || []);
                  const names: string[] = (setp.data?.names || ids.map(id => allBrushPresets.find(b=>b.id===id)?.name || id));
                  return (
                    <div key={setp.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="text-lg font-bold text-white mb-1">{setp.title}</h4>
                          <div className="flex items-center space-x-2 text-white/70 text-sm"><Users className="w-3 h-3" /><span>by u/{setp.proposedBy}</span></div>
                        </div>
                        <div className="flex items-center space-x-2"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-white font-semibold">{setp.votes}</span></div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {names.map((n, i)=> (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-[10px]">{n}</span>
                        ))}
                      </div>
                      <button 
                        onClick={() => vote(setp.id)} 
                        disabled={!currentUser}
                        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${voted ? 'bg-green-500 hover:bg-green-600 text-white':'bg-white/10 hover:bg-white/20 text-white border border-white/20'} ${!currentUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <Vote className="w-4 h-4" />
                        <span className="font-semibold">{voted ? 'Voted!' : 'Vote for this set'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Voting Stats */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Voting Statistics</h3>
          <button 
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">{votingStats.totalProposals}</div>
            <div className="text-white/70">Total Proposals</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400">{votingStats.totalVotes}</div>
            <div className="text-white/70">Total Votes Cast</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-400">{votingStats.activeVoters}</div>
            <div className="text-white/70">Active Voters</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-400 flex items-center justify-center gap-2">
              <Clock className="w-6 h-6" />
              Live
            </div>
            <div className="text-white/70">Real-time Updates</div>
          </div>
        </div>
      </div>

      {/* Community Message */}
      <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <h3 className="text-xl font-bold text-white mb-2">Community Guidelines</h3>
        <p className="text-white/80">
          Vote for palettes that inspire creativity and work well together. Consider color harmony, 
          accessibility, and how the palette will look across different artistic styles. Your vote 
          helps shape the creative direction of our collaborative masterpiece!
        </p>
        {!currentUser && (
          <div className="mt-4 p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-200 text-sm">
              ⚠️ You need to be logged in to Reddit to vote and submit proposals.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
