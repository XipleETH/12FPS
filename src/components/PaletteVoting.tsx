import React, { useState } from 'react';
import { Vote, TrendingUp, Users } from 'lucide-react';

interface PaletteVotingProps {
  weeklyPalettes: string[][];
  currentWeek: number;
}

export const PaletteVoting: React.FC<PaletteVotingProps> = ({ weeklyPalettes, currentWeek }) => {
  const [userVotes, setUserVotes] = useState<{ [key: number]: boolean }>({});

  const proposedPalettes = [
    {
      id: 1,
      name: "Ocean Depths",
      colors: ['#0077BE', '#00A8CC', '#87CEEB', '#4682B4', '#20B2AA', '#008B8B', '#5F9EA0'],
      votes: 234,
      proposedBy: "ArtistMarina"
    },
    {
      id: 2,
      name: "Autumn Warmth",
      colors: ['#D2691E', '#CD853F', '#DEB887', '#F4A460', '#DAA520', '#B8860B', '#FF8C00'],
      votes: 187,
      proposedBy: "AutumnLover"
    },
    {
      id: 3,
      name: "Neon Dreams",
      colors: ['#FF1493', '#00FFFF', '#ADFF2F', '#FF69B4', '#00FF00', '#FF4500', '#9400D3'],
      votes: 156,
      proposedBy: "NeonArtist"
    },
    {
      id: 4,
      name: "Earth Tones",
      colors: ['#8B4513', '#A0522D', '#CD853F', '#DEB887', '#F5DEB3', '#D2B48C', '#BC8F8F'],
      votes: 143,
      proposedBy: "EarthyVibes"
    }
  ];

  const handleVote = (paletteId: number) => {
    setUserVotes(prev => ({
      ...prev,
      [paletteId]: !prev[paletteId]
    }));
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-white mb-4">Vote for Next Week's Palette</h2>
        <p className="text-white/70 text-lg">
          Help choose the colors that will inspire next week's creations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {proposedPalettes.map((palette) => (
          <div
            key={palette.id}
            className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">{palette.name}</h3>
                <div className="flex items-center space-x-2 text-white/70 text-sm">
                  <Users className="w-3 h-3" />
                  <span>by {palette.proposedBy}</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-white font-semibold">{palette.votes}</span>
              </div>
            </div>

            {/* Color Palette Preview */}
            <div className="grid grid-cols-7 gap-2 mb-4">
              {palette.colors.map((color, index) => (
                <div
                  key={index}
                  className="aspect-square rounded-lg border border-white/20"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>

            {/* Vote Button */}
            <button
              onClick={() => handleVote(palette.id)}
              className={`w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-lg transition-all ${
                userVotes[palette.id]
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
              }`}
            >
              <Vote className="w-4 h-4" />
              <span className="font-semibold">
                {userVotes[palette.id] ? 'Voted!' : 'Vote for this palette'}
              </span>
            </button>
          </div>
        ))}
      </div>

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