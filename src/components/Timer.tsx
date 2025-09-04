import React from 'react';
import { Clock, Play } from 'lucide-react';

interface TimerProps {
  timeLeft: number;
  isActive: boolean;
  onStart: () => void;
}

export const Timer: React.FC<TimerProps> = ({ timeLeft, isActive, onStart }) => {
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    return ((7200 - timeLeft) / 7200) * 100;
  };

  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <Clock className="w-5 h-5 text-white" />
        <span className={`text-xl font-mono font-bold ${timeLeft < 300 && isActive ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {formatTime(timeLeft)}
        </span>
      </div>
      
      {!isActive && timeLeft > 0 && (
        <button
          onClick={onStart}
          className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Play className="w-4 h-4" />
          <span>Start Session</span>
        </button>
      )}
      
      {isActive && (
        <div className="w-32 bg-white/20 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-green-400 to-blue-500 h-2 rounded-full transition-all duration-1000"
            style={{ width: `${getProgressPercentage()}%` }}
          />
        </div>
      )}
      
      {timeLeft === 0 && (
        <span className="text-red-400 font-semibold">Session Ended</span>
      )}
    </div>
  );
};