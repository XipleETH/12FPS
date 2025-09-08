import React, { useEffect, useMemo, useState } from 'react';
import { Vote, TrendingUp, Users, Brush, Droplet, Wind, Sparkles } from 'lucide-react';

interface PaletteVotingProps {}

export const PaletteVoting: React.FC<PaletteVotingProps> = () => {
  type SubPage = 'palettes' | 'themes' | 'modes';
  const [subPage, setSubPage] = useState<SubPage>('palettes');

  // Hash routing for subpages: #/voting/palettes | themes | modes
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
  interface PaletteProposal { id: number; name: string; colors: string[]; votes: number; proposedBy: string }
  interface ThemeProposal { id: number; title: string; votes: number; proposedBy: string }
  interface ModesProposal { id: number; label: string; modes: Mode[]; votes: number; proposedBy: string }

  const [paletteProposals, setPaletteProposals] = useState<PaletteProposal[]>([
    { id: 1, name: 'Ocean Depths', colors: ['#0077BE', '#00A8CC', '#87CEEB', '#4682B4', '#20B2AA', '#008B8B'], votes: 234, proposedBy: 'ArtistMarina' },
    { id: 2, name: 'Autumn Warmth', colors: ['#D2691E', '#CD853F', '#DEB887', '#F4A460', '#DAA520', '#B8860B'], votes: 187, proposedBy: 'AutumnLover' },
    { id: 3, name: 'Neon Dreams', colors: ['#FF1493', '#00FFFF', '#ADFF2F', '#FF69B4', '#00FF00', '#FF4500'], votes: 156, proposedBy: 'NeonArtist' },
    { id: 4, name: 'Earth Tones', colors: ['#8B4513', '#A0522D', '#CD853F', '#DEB887', '#F5DEB3', '#D2B48C'], votes: 143, proposedBy: 'EarthyVibes' }
  ]);
  const [themeProposals, setThemeProposals] = useState<ThemeProposal[]>([
    { id: 1, title: 'Space Odyssey', votes: 98, proposedBy: 'CosmoArt' },
    { id: 2, title: 'City Nights', votes: 76, proposedBy: 'UrbanInk' },
    { id: 3, title: 'Fantastic Creatures', votes: 88, proposedBy: 'MythSketch' }
  ]);
  const [modesProposals, setModesProposals] = useState<ModesProposal[]>([
    { id: 1, label: 'Anime Kit', modes: ['solid','soft','spray'], votes: 120, proposedBy: 'CelStudio' },
    { id: 2, label: 'Comic Kit', modes: ['solid','fade'], votes: 102, proposedBy: 'Inker' },
    { id: 3, label: 'Pixel Art Kit', modes: ['solid'], votes: 77, proposedBy: 'PixelPunk' },
    { id: 4, label: 'Watercolor Kit', modes: ['soft','fade','spray'], votes: 64, proposedBy: 'Aquarelle' },
    { id: 5, label: 'Graffiti Kit', modes: ['spray','solid'], votes: 58, proposedBy: 'WallTag' },
    { id: 6, label: 'Stop‑Motion Kit', modes: ['solid','soft'], votes: 41, proposedBy: 'FrameForge' }
  ]);

  // Track user’s toggled votes per category
  const [userVotes, setUserVotes] = useState<Record<string, boolean>>({});

  const toggleVote = (kind: 'palette' | 'theme' | 'modes', id: number) => {
    const key = `${kind}-${id}`;
    setUserVotes(prev => {
      const on = !prev[key];
      // reflect in counts
      if (kind === 'palette') {
        setPaletteProposals(ps => ps.map(p => p.id === id ? { ...p, votes: p.votes + (on ? 1 : -1) } : p));
      } else if (kind === 'theme') {
        setThemeProposals(ts => ts.map(t => t.id === id ? { ...t, votes: t.votes + (on ? 1 : -1) } : t));
      } else {
        setModesProposals(ms => ms.map(m => m.id === id ? { ...m, votes: m.votes + (on ? 1 : -1) } : m));
      }
      return { ...prev, [key]: on };
    });
  };

  // Proposal forms state
  const [newPaletteName, setNewPaletteName] = useState('');
  const [newPaletteColors, setNewPaletteColors] = useState<string[]>(['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD']);
  const [newThemeTitle, setNewThemeTitle] = useState('');
  const [newModes, setNewModes] = useState<Mode[]>(['solid']);

  const isHex = (s: string) => /^#([0-9a-fA-F]{6})$/.test(s);
  const canSubmitPalette = useMemo(() => newPaletteName.trim().length > 0 && newPaletteColors.length === 6 && newPaletteColors.every(isHex), [newPaletteName, newPaletteColors]);
  const canSubmitTheme = useMemo(() => newThemeTitle.trim().length >= 3, [newThemeTitle]);
  const canSubmitModes = useMemo(() => newModes.length >= 1 && newModes.length <= 4, [newModes]);

  const submitPalette = () => {
    if (!canSubmitPalette) return;
    const id = Date.now();
    setPaletteProposals(prev => [{ id, name: newPaletteName.trim(), colors: [...newPaletteColors], votes: 0, proposedBy: 'You' }, ...prev]);
    setNewPaletteName('');
    setNewPaletteColors(['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD']);
  };
  const submitTheme = () => {
    if (!canSubmitTheme) return;
    const id = Date.now();
    setThemeProposals(prev => [{ id, title: newThemeTitle.trim(), votes: 0, proposedBy: 'You' }, ...prev]);
    setNewThemeTitle('');
  };
  const submitModes = () => {
    if (!canSubmitModes) return;
    const id = Date.now();
    const label = newModes.map(m => ({solid:'Solid',soft:'Soft',fade:'Fade',spray:'Spray'}[m])).join(' + ');
    setModesProposals(prev => [{ id, label, modes: [...newModes], votes: 0, proposedBy: 'You' }, ...prev]);
    setNewModes(['solid']);
  };

  const ModeBadge: React.FC<{ m: Mode }> = ({ m }) => {
    const map: Record<Mode, {icon: React.ReactNode; label: string}> = {
      solid: { icon: <Brush className="w-3.5 h-3.5" />, label: 'Solid' },
      soft: { icon: <Droplet className="w-3.5 h-3.5" />, label: 'Soft' },
      fade: { icon: <Wind className="w-3.5 h-3.5" />, label: 'Fade' },
      spray: { icon: <Sparkles className="w-3.5 h-3.5" />, label: 'Spray' }
    };
    const v = map[m];
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-[10px]">{v.icon}{v.label}</span>;
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-white mb-2">Weekly Voting</h2>
  <p className="text-white/70 text-sm md:text-base">Vote on the 6-color palette, allowed brushes, and the theme.</p>
      </div>

      {/* Subpage tabs */}
      <div className="flex items-center justify-center gap-2 md:gap-3">
        {([
          {key:'palettes', label:'Palettes'},
          {key:'themes', label:'Themes'},
          {key:'modes', label:'Brush Kits'}
        ] as Array<{key: SubPage; label: string}>).map(t => (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${subPage===t.key? 'bg-white/30 text-white border-white/60':'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'}`}
          >{t.label}</button>
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
            <input value={newPaletteName} onChange={e=>setNewPaletteName(e.target.value)} placeholder="Palette name" className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40" />
          </div>
          <div className="md:col-span-2 flex items-center gap-2">
            {newPaletteColors.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <input type="color" value={c} onChange={e=>{
                  const arr=[...newPaletteColors]; arr[i]=e.target.value.toUpperCase(); setNewPaletteColors(arr);
                }} className="w-10 h-10 rounded-md border border-white/30 cursor-pointer" />
                <input value={c} onChange={e=>{
                  const v=e.target.value.toUpperCase(); const arr=[...newPaletteColors]; arr[i]=v; setNewPaletteColors(arr);
                }} className="w-20 text-xs px-2 py-1 rounded bg-white/10 border border-white/20 text-white placeholder-white/40" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <button disabled={!canSubmitPalette} onClick={submitPalette} className={`px-4 py-2 rounded-lg font-semibold ${canSubmitPalette? 'bg-emerald-500 hover:bg-emerald-600 text-white':'bg-white/10 text-white/50 cursor-not-allowed'}`}>Submit</button>
        </div>
      </section>
      <section>
        <h3 className="text-xl font-bold text-white mb-3">Proposed palettes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
          {paletteProposals.map(palette => {
            const voted = userVotes[`palette-${palette.id}`];
            return (
              <div key={palette.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1">{palette.name}</h4>
                    <div className="flex items-center space-x-2 text-white/70 text-sm"><Users className="w-3 h-3" /><span>by {palette.proposedBy}</span></div>
                  </div>
                  <div className="flex items-center space-x-2"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-white font-semibold">{palette.votes}</span></div>
                </div>
                <div className="grid grid-cols-6 gap-2 mb-4">
                  {palette.colors.map((color, i) => (
                    <div key={i} className="aspect-square rounded-lg border border-white/20" style={{backgroundColor: color}} title={color} />
                  ))}
                </div>
                <button onClick={() => toggleVote('palette', palette.id)} className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${voted? 'bg-green-500 hover:bg-green-600 text-white':'bg-white/10 hover:bg-white/20 text-white border border-white/20'}`}>
                  <Vote className="w-4 h-4" />
                  <span className="font-semibold">{voted? 'Voted!':'Vote for this palette'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
  </>
      )}

      {/* Themes page */}
  {subPage === 'themes' && (
  <>
  <section className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 md:p-6 border border-white/20">
        <h3 className="text-xl font-bold text-white mb-4">Propose theme</h3>
        <div className="flex gap-2">
          <input value={newThemeTitle} onChange={e=>setNewThemeTitle(e.target.value)} placeholder="e.g., Retro Future" className="flex-1 px-3 py-2 rounded-md bg-white/10 border border-white/20 text-white placeholder-white/40" />
          <button disabled={!canSubmitTheme} onClick={submitTheme} className={`px-4 py-2 rounded-lg font-semibold ${canSubmitTheme? 'bg-emerald-500 hover:bg-emerald-600 text-white':'bg-white/10 text-white/50 cursor-not-allowed'}`}>Submit</button>
        </div>
      </section>
      <section>
        <h3 className="text-xl font-bold text-white mb-3">Proposed themes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
          {themeProposals.map(theme => {
            const voted = userVotes[`theme-${theme.id}`];
            return (
              <div key={theme.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1">{theme.title}</h4>
                    <div className="flex items-center space-x-2 text-white/70 text-sm"><Users className="w-3 h-3" /><span>by {theme.proposedBy}</span></div>
                  </div>
                  <div className="flex items-center space-x-2"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-white font-semibold">{theme.votes}</span></div>
                </div>
                <button onClick={() => toggleVote('theme', theme.id)} className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${voted? 'bg-green-500 hover:bg-green-600 text-white':'bg-white/10 hover:bg-white/20 text-white border border-white/20'}`}>
                  <Vote className="w-4 h-4" />
                  <span className="font-semibold">{voted? 'Voted!':'Vote for this theme'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
  </>
      )}

      {/* Modes page */}
  {subPage === 'modes' && (
  <>
  <section className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 md:p-6 border border-white/20">
  <h3 className="text-xl font-bold text-white mb-4">Propose brush kit</h3>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {(['solid','soft','fade','spray'] as Mode[]).map(m => {
            const checked = newModes.includes(m);
            return (
              <label key={m} className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${checked? 'bg-white/20 border-white/50 text-white':'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'}`}>
                <input type="checkbox" className="accent-white" checked={checked} onChange={() => setNewModes(prev => checked? prev.filter(x=>x!==m):[...prev,m])} />
                <ModeBadge m={m} />
              </label>
            );
          })}
        </div>
        <button disabled={!canSubmitModes} onClick={submitModes} className={`px-4 py-2 rounded-lg font-semibold ${canSubmitModes? 'bg-emerald-500 hover:bg-emerald-600 text-white':'bg-white/10 text-white/50 cursor-not-allowed'}`}>Submit</button>
      </section>
      <section>
  <h3 className="text-xl font-bold text-white mb-3">Proposed brush kits</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
          {modesProposals.map(mp => {
            const voted = userVotes[`modes-${mp.id}`];
            return (
              <div key={mp.id} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-white mb-1">{mp.label}</h4>
                    <div className="flex items-center gap-1 flex-wrap mb-1">
                      {mp.modes.map(m => <ModeBadge key={m} m={m} />)}
                    </div>
                    <div className="flex items-center space-x-2 text-white/70 text-sm"><Users className="w-3 h-3" /><span>by {mp.proposedBy}</span></div>
                  </div>
                  <div className="flex items-center space-x-2"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-white font-semibold">{mp.votes}</span></div>
                </div>
                <button onClick={() => toggleVote('modes', mp.id)} className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg transition-all ${voted? 'bg-green-500 hover:bg-green-600 text-white':'bg-white/10 hover:bg-white/20 text-white border border-white/20'}`}>
                  <Vote className="w-4 h-4" />
                  <span className="font-semibold">{voted? 'Voted!':'Vote for this set'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
  </>
      )}

  {/* Voting Stats */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
        <h3 className="text-xl font-bold text-white mb-4">Voting Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">720</div>
            <div className="text-white/70">Total Votes Cast</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400">156</div>
            <div className="text-white/70">Active Voters</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-400">2d 15h</div>
            <div className="text-white/70">Time Remaining</div>
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
      </div>
    </div>
  );
};