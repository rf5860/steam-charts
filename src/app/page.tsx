'use client';

import React, { useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { Search, X, Activity, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

// --- Types ---
type Game = {
  id: number;
  name: string;
  tiny_image: string;
};

type HistoricalPoint = {
  date: number;
  count: number;
};

type SelectedGame = Game & {
  color: string;
  data: HistoricalPoint[];
};

// Colors for different lines
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function SteamCompareApp() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Game[]>([]);
  const [selectedGames, setSelectedGames] = useState<SelectedGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Search Logic
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`/api/search?term=${encodeURIComponent(query)}`);
      const json = await res.json();
      setSearchResults(json.items || []);
    } catch {
      setError('Search failed.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Add Game & Fetch History
  const addGame = async (game: Game) => {
    if (selectedGames.find(g => g.id === game.id)) return;
    setLoading(true);
    setSearchResults([]);
    setQuery('');

    try {
      const res = await fetch(`/api/history?appid=${game.id}`);
      const json = await res.json();

      if (json.error) throw new Error(json.error);

      const newGame: SelectedGame = {
        ...game,
        color: COLORS[selectedGames.length % COLORS.length],
        data: json.data // Real historical data
      };

      setSelectedGames(prev => [...prev, newGame]);
    } catch {
      setError(`Could not load data for ${game.name}. It might not be tracked publicly.`);
    } finally {
      setLoading(false);
    }
  };

  const removeGame = (id: number) => {
    setSelectedGames(prev => prev.filter(g => g.id !== id));
  };

  // 3. Process Data for Recharts
  // We need to merge all games into a single array of objects based on timestamp
  const processChartData = () => {
    if (selectedGames.length === 0) return [];

    // Create a map of all unique dates across all games
    const dateMap = new Map<number, any>();

    selectedGames.forEach(game => {
      game.data.forEach(point => {
        // Round timestamps to nearest day to align data points roughly
        // (Optional: remove this if you want exact hourly precision, but it makes the chart heavy)
        const dateKey = point.date; 
        
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { date: dateKey });
        }
        // Add this game's count to the date object
        dateMap.get(dateKey)[game.name] = point.count;
      });
    });

    // Convert map to array and sort by date
    return Array.from(dateMap.values()).sort((a, b) => a.date - b.date);
  };

  const chartData = processChartData();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Search */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
              <Activity className="text-blue-500" /> Steam History Compare
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Visualize real player count history (sourced from SteamCharts).
            </p>
          </div>

          <div className="relative w-full md:w-96 z-50">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search games..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 focus:outline-none text-white"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            </form>

            {/* Dropdown Results */}
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {searchResults.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => addGame(game)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-800 flex items-center gap-3 transition-colors border-b border-slate-800 last:border-0"
                  >
                    <img src={game.tiny_image} alt="" className="w-8 h-8 rounded" />
                    <span className="truncate text-sm font-medium">{game.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Selected Games List */}
        <div className="flex flex-wrap gap-3">
          {selectedGames.map((game) => (
            <div 
              key={game.id} 
              className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-4 py-2 shadow-sm"
              style={{ borderLeft: `4px solid ${game.color}` }}
            >
              <img src={game.tiny_image} alt="" className="w-6 h-6 rounded" />
              <span className="text-sm font-medium text-white">{game.name}</span>
              <button 
                onClick={() => removeGame(game.id)}
                className="ml-2 text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* The Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-2xl h-[500px]">
          {selectedGames.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  {selectedGames.map(game => (
                    <linearGradient key={game.id} id={`color-${game.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={game.color} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={game.color} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#94a3b8" 
                  fontSize={12}
                  tickFormatter={(unix) => format(new Date(unix), 'MMM yyyy')}
                  minTickGap={50}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={12}
                  tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                  labelFormatter={(unix) => format(new Date(unix), 'PPpp')}
                />
                <Legend iconType="circle" />
                {selectedGames.map((game) => (
                  <Area
                    key={game.id}
                    type="monotone"
                    dataKey={game.name}
                    stroke={game.color}
                    fill={`url(#color-${game.id})`}
                    strokeWidth={2}
                    animationDuration={1000}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-600">
              <Activity className="w-16 h-16 mb-4 opacity-20" />
              <p>Add a game to view its lifetime player history</p>
            </div>
          )}
        </div>
        
        {loading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
            <div className="bg-slate-900 p-6 rounded-lg text-white font-medium shadow-xl border border-slate-700">
              Loading Data...
            </div>
          </div>
        )}

      </div>
    </div>
  );
}