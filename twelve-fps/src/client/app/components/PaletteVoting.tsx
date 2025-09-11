import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Vote, TrendingUp, Users, Brush, Droplet, Wind, Sparkles, Loader2, AlertCircle, RefreshCcw } from 'lucide-react';

// Real Reddit-integrated proposals voting component
// Uses server endpoints implemented in devvit server:
//  GET /api/proposals
//  POST /api/proposals { type, title, data }
//  POST /api/proposals/:id/vote
//  GET /api/voting-stats
//  GET /api/user

export const PaletteVoting: React.FC = () => {
  type SubPage = 'palettes' | 'themes' | 'modes';
  const [subPage, setSubPage] = useState<SubPage>('palettes');
  useEffect(() => {
    const parse = () => {
      const h = window.location.hash.toLowerCase();
      if (h.includes('/voting/themes')) setSubPage('themes');
      else if (h.includes('/voting/modes')) setSubPage('modes');
      else setSubPage('palettes');
    };
    parse();
    const onHash = () => parse();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (sp: SubPage) => {
    const path = sp === 'palettes' ? '#/voting/palettes' : sp === 'themes' ? '#/voting/themes' : '#/voting/modes';
    window.location.hash = path;
    setSubPage(sp);
  };

  type Mode = 'solid' | 'soft' | 'fade' | 'spray';

  interface RawProposal {
    id: string;
    type: string; // palette | theme | brushKit
    title: string;
    data: any;
    proposedBy: string;
    proposedAt: number;
    votes: number;
    voters: string[];
  }

  interface VotingStats { totalVotes: number; activeVoters: number; totalProposals: number }

  const [proposals, setProposals] = useState<RawProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<VotingStats | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Form state
  const [newPaletteName, setNewPaletteName] = useState('');
  const [newPaletteColors, setNewPaletteColors] = useState<string[]>(['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD']);
  const [newThemeTitle, setNewThemeTitle] = useState('');
  const [newModes, setNewModes] = useState<Mode[]>(['solid']);

  // Derived collections
  const paletteProposals = proposals.filter(p => p.type === 'palette');
  const themeProposals = proposals.filter(p => p.type === 'theme');
  const modesProposals = proposals.filter(p => p.type === 'brushKit');

  const isHex = (s: string) => /^#([0-9a-fA-F]{6})$/.test(s);
  const canSubmitPalette = useMemo(() => newPaletteName.trim().length > 0 && newPaletteColors.length === 6 && newPaletteColors.every(isHex), [newPaletteName, newPaletteColors]);
  const canSubmitTheme = useMemo(() => newThemeTitle.trim().length >= 3, [newThemeTitle]);
  const canSubmitModes = useMemo(() => newModes.length >= 1 && newModes.length <= 4, [newModes]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, sRes, uRes] = await Promise.all([
        fetch('/api/proposals'),
        fetch('/api/voting-stats'),
        fetch('/api/user'),
      ]);
      if (!pRes.ok) throw new Error('Failed to load proposals');
      const pJson = await pRes.json();
      setProposals(Array.isArray(pJson.proposals) ? pJson.proposals : []);
      if (sRes.ok) setStats(await sRes.json());
      if (uRes.ok) {
        const u = await uRes.json();
        setUsername(u.username || null);
      }
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll, refreshTick]);

  // Auto refresh every 15s
  useEffect(() => {
    const id = setInterval(() => setRefreshTick(t => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const optimisticUpdateVotes = (proposalId: string, voted: boolean) => {
    setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, votes: p.votes + (voted ? 1 : -1), voters: voted ? [...p.voters, username!].filter((v,i,a)=>a.indexOf(v)===i) : p.voters.filter(v => v !== username) } : p));
  };

  const vote = async (proposal: RawProposal) => {
    if (!username) {
      setError('You must be logged in on Reddit to vote.');
      return;
    }
    const already = proposal.voters.includes(username);
    // Optimistic
    optimisticUpdateVotes(proposal.id, !already);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/vote`, { method: 'POST' });
      if (!res.ok) throw new Error('Vote failed');
      const j = await res.json();
      setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, votes: j.votes, voters: p.voters.includes(username) !== j.voted ? (j.voted ? [...p.voters, username] : p.voters.filter(v => v !== username)) : p.voters } : p));
      // refresh stats lazily
      setRefreshTick(t => t + 1);
    } catch (e: any) {
      // revert optimistic by toggling back
      optimisticUpdateVotes(proposal.id, already);
      setError(e.message || 'Vote error');
    }
  };

  const submitPalette = async () => {
    if (!canSubmitPalette) return;
    try {
      const body = { type: 'palette', title: newPaletteName.trim(), data: { colors: newPaletteColors } };
      const res = await fetch('/api/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Submit failed');
      const j = await res.json();
      setProposals(prev => [j.proposal, ...prev]);
      setNewPaletteName('');
      setNewPaletteColors(['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD']);
      setRefreshTick(t => t + 1);
    } catch (e: any) { setError(e.message || 'Submit error'); }
  };
  const submitTheme = async () => {
    if (!canSubmitTheme) return;
    try {
      const body = { type: 'theme', title: newThemeTitle.trim(), data: {} };
      const res = await fetch('/api/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Submit failed');
      const j = await res.json();
      setProposals(prev => [j.proposal, ...prev]);
      setNewThemeTitle('');
      setRefreshTick(t => t + 1);
    } catch (e: any) { setError(e.message || 'Submit error'); }
  };
  const submitModes = async () => {
    if (!canSubmitModes) return;
    try {
      const label = newModes.map(m => ({solid:'Solid',soft:'Soft',fade:'Fade',spray:'Spray'}[m])).join(' + ');
      const body = { type: 'brushKit', title: label, data: { modes: newModes } };
      const res = await fetch('/api/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Submit failed');
      const j = await res.json();
      setProposals(prev => [j.proposal, ...prev]);
      setNewModes(['solid']);
      setRefreshTick(t => t + 1);
    } catch (e: any) { setError(e.message || 'Submit error'); }
  };

  const ModeBadge: React.FC<{ m: Mode }> = ({ m }) => {
    const map: Record<Mode, {icon: React.ReactNode; label: string}> = {
      solid: { icon: <Brush className="w-3.5 h-3.5" />, label: 'Solid' },
      soft: { icon: <Droplet className="w-3.5 h-3.5" />, label: 'Soft' },
      fade: { icon: <Wind className="w-3.5 h-3.5" />, label: 'Fade' },
      spray: { icon: <Sparkles className="w-3.5 h-3.5" />, label: 'Spray' },
    };
    const v = map[m];
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-[10px]">{v.icon}{v.label}</span>;
  };

  const sectionHeader = (title: string) => <h3 className="text-xl font-bold text-white mb-4">{title}</h3>;

  const isVotedByUser = (p: RawProposal) => username ? p.voters.includes(username) : false;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-white mb-2">Weekly Voting</h2>
        <p className="text-white/70 text-sm md:text-base">Propose and vote: palette of 6 colors, theme, and brush kit. Real Reddit users & votes.</p>
      </div>

      <div className="flex items-center justify-center gap-2 md:gap-3">
        {([
          { key: 'palettes', label: 'Palettes' },
          { key: 'themes', label: 'Themes' },
          { key: 'modes', label: 'Brush Kits' },
        ] as Array<{ key: SubPage; label: string }>).map(t => (
          <button key={t.key} onClick={() => go(t.key)} className={`px-3 py-1.5 rounded-full text-sm border transition ${subPage === t.key ? 'bg-white/30 text-white border-white/60' : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`}>{t.label}</button>
        ))}
        <button onClick={() => fetchAll()} className="ml-2 p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20" title="Refresh now">
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/20 border border-red-400/40 text-red-200 px-4 py-2 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
          <button onClick={() => { setError(null); fetchAll(); }} className="underline underline-offset-2">retry</button>
        </div>
      )}

      {loading && proposals.length === 0 && (
        <div className="flex items-center justify-center gap-2 text-white/70 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading proposals...</div>
      )}

      {/* Palettes */}
      {subPage === 'palettes' && (
        <>
          <section className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 md:p-6 border border-white/20">
            {sectionHeader('Propose palette (6 colors)')}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1 flex flex-col gap-2">
                <label className="text-white/80 text-sm">Name</label>
                <input value={newPaletteName} onChange={e => setNewPaletteName(e.target.value)} placeholder="Palette name" className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40" />
              </div>
              <div className="md:col-span-2 flex items-center gap-2 overflow-x-auto">
                {newPaletteColors.map((c, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <input type="color" value={c} onChange={e => { const arr = [...newPaletteColors]; arr[i] = e.target.value.toUpperCase(); setNewPaletteColors(arr); }} className="w-10 h-10 rounded-md border border-white/30 cursor-pointer" />
                    <input value={c} onChange={e => { const v = e.target.value.toUpperCase(); const arr = [...newPaletteColors]; arr[i] = v; setNewPaletteColors(arr); }} className="w-20 text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-white placeholder-white/40" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button disabled={!canSubmitPalette || !username} onClick={submitPalette} className={`px-4 py-2 rounded-lg font-semibold ${canSubmitPalette && username ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-white/10 text-white/50 cursor-not-allowed'}`}>{username ? 'Submit' : 'Login required'}</button>
              <button onClick={() => setNewPaletteColors(['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD'])} className="px-3 py-2 text-xs rounded-md bg-white/5 border border-white/10 text-white/60 hover:bg-white/10">Reset</button>
            </div>
          </section>
          <section>
            <h3 className="text-xl font-bold text-white mb-3">Proposed palettes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
              {paletteProposals.map(palette => {
                const voted = isVotedByUser(palette);
                const colors: string[] = (palette.data?.colors || []);
                return (
                  <div key={palette.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-white mb-1">{palette.title}</h4>
                        <div className="flex items-center space-x-2 text-white/70 text-sm"><Users className="w-3 h-3" /><span>by {palette.proposedBy}</span></div>
                      </div>
                      <div className="flex items-center space-x-2"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-white font-semibold">{palette.votes}</span></div>
                    </div>
                    <div className="grid grid-cols-6 gap-2 mb-4">
                      {colors.map((color, i) => (<div key={i} className="aspect-square rounded-lg border border-white/20" style={{ backgroundColor: color }} title={color} />))}
                    </div>
                    <button disabled={!username} onClick={() => vote(palette)} className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${voted ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'} ${!username ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <Vote className="w-4 h-4" />
                      <span className="font-semibold">{!username ? 'Login required' : voted ? 'Voted!' : 'Vote for this palette'}</span>
                    </button>
                  </div>
                );
              })}
              {paletteProposals.length === 0 && !loading && (
                <div className="col-span-full text-center text-white/50 text-sm">No palette proposals yet. Be first!</div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Themes */}
      {subPage === 'themes' && (
        <>
          <section className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 md:p-6 border border-white/20">
            {sectionHeader('Propose theme')}
            <div className="flex gap-2">
              <input value={newThemeTitle} onChange={e => setNewThemeTitle(e.target.value)} placeholder="e.g., Retro Future" className="flex-1 px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40" />
              <button disabled={!canSubmitTheme || !username} onClick={submitTheme} className={`px-4 py-2 rounded-lg font-semibold ${canSubmitTheme && username ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-white/10 text-white/50 cursor-not-allowed'}`}>{username ? 'Submit' : 'Login required'}</button>
            </div>
          </section>
          <section>
            <h3 className="text-xl font-bold text-white mb-3">Proposed themes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
              {themeProposals.map(theme => {
                const voted = isVotedByUser(theme);
                return (
                  <div key={theme.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-white mb-1">{theme.title}</h4>
                        <div className="flex items-center space-x-2 text-white/70 text-sm"><Users className="w-3 h-3" /><span>by {theme.proposedBy}</span></div>
                      </div>
                      <div className="flex items-center space-x-2"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-white font-semibold">{theme.votes}</span></div>
                    </div>
                    <button disabled={!username} onClick={() => vote(theme)} className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${voted ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'} ${!username ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <Vote className="w-4 h-4" />
                      <span className="font-semibold">{!username ? 'Login required' : voted ? 'Voted!' : 'Vote for this theme'}</span>
                    </button>
                  </div>
                );
              })}
              {themeProposals.length === 0 && !loading && (
                <div className="col-span-full text-center text-white/50 text-sm">No theme proposals yet.</div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Brush Kits */}
      {subPage === 'modes' && (
        <>
          <section className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 md:p-6 border border-white/20">
            {sectionHeader('Propose brush kit')}
            <div className="flex flex-wrap items-center gap-3 mb-3">
              {(['solid','soft','fade','spray'] as Mode[]).map(m => {
                const checked = newModes.includes(m);
                return (
                  <label key={m} className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${checked ? 'bg-white/20 border-white/50 text-white' : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'}`}>
                    <input type="checkbox" className="accent-white" checked={checked} onChange={() => setNewModes(prev => checked ? prev.filter(x => x !== m) : [...prev, m])} />
                    <ModeBadge m={m} />
                  </label>
                );
              })}
            </div>
            <button disabled={!canSubmitModes || !username} onClick={submitModes} className={`px-4 py-2 rounded-lg font-semibold ${canSubmitModes && username ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-white/10 text-white/50 cursor-not-allowed'}`}>{username ? 'Submit' : 'Login required'}</button>
          </section>
          <section>
            <h3 className="text-xl font-bold text-white mb-3">Proposed brush kits</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
              {modesProposals.map(mp => {
                const voted = isVotedByUser(mp);
                const modes: Mode[] = (mp.data?.modes || []);
                return (
                  <div key={mp.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-white mb-1">{mp.title}</h4>
                        <div className="flex items-center gap-1 flex-wrap mb-1">{modes.map(m => <ModeBadge key={m} m={m} />)}</div>
                        <div className="flex items-center space-x-2 text-white/70 text-sm"><Users className="w-3 h-3" /><span>by {mp.proposedBy}</span></div>
                      </div>
                      <div className="flex items-center space-x-2"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-white font-semibold">{mp.votes}</span></div>
                    </div>
                    <button disabled={!username} onClick={() => vote(mp)} className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${voted ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'} ${!username ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <Vote className="w-4 h-4" />
                      <span className="font-semibold">{!username ? 'Login required' : voted ? 'Voted!' : 'Vote for this set'}</span>
                    </button>
                  </div>
                );
              })}
              {modesProposals.length === 0 && !loading && (
                <div className="col-span-full text-center text-white/50 text-sm">No brush kit proposals yet.</div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Stats */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <h3 className="text-xl font-bold text-white mb-4">Voting Statistics</h3>
        {stats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center"><div className="text-3xl font-bold text-blue-400">{stats.totalVotes}</div><div className="text-white/70">Total Votes</div></div>
            <div className="text-center"><div className="text-3xl font-bold text-green-400">{stats.activeVoters}</div><div className="text-white/70">Active Voters</div></div>
            <div className="text-center"><div className="text-3xl font-bold text-purple-400">{stats.totalProposals}</div><div className="text-white/70">Total Proposals</div></div>
          </div>
        ) : (
          <div className="text-white/50 text-sm">Stats unavailable</div>
        )}
      </div>

      <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <h3 className="text-xl font-bold text-white mb-2">Community Guidelines</h3>
        <p className="text-white/80">Vote for palettes, themes, and brush kits that enhance collaboration and visual harmony. Consider accessibility, stylistic flexibility, and creative potential. Your participation shapes the direction of the project.</p>
        <p className="text-white/40 text-xs mt-2">Logged in as: {username ? `u/${username}` : 'anonymous / not logged in'}</p>
      </div>
    </div>
  );
};
