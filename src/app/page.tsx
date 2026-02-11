'use client';

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Search, X, Users, Activity } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Types ---
type Game = {
  id: number;
  name: string;
  tiny_image: string;
};

type PlayerData = {
  name: string;
  [key: string]: string | number;
};

type SelectedGame = Game & {
  color: string;
  currentPlayers: number;
  history: number[]; // Simulated history for demo
};

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Distinct colors for the chart lines
const CHART_COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#d97706', // Amber
  '#9333ea', // Purple
  '#db2777', // Pink
];

export default function SteamChartApp() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Game[]>([]);
  const [selectedGames, setSelectedGames] = useState<SelectedGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<PlayerData[]>([]);

  // Search Steam Store via our Proxy
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/search?term=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.items) {
        setSearchResults(data.items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Add a game to the comparison list
  const addGame = async (game: Game) => {
    // Prevent duplicates
    if (selectedGames.find((g) => g.id === game.id)) return;

    // Get Current Player Count via Proxy
    const res = await fetch(`/api/players?appid=${game.id}`);
    const data = await res.json();
    const currentCount = data.player_count || 0;

    // --- HISTORICAL DATA SIMULATION ---
    // Since Steam does not provide historical APIs, we generate a mock curve 
    // based on the current live count to demonstrate how the chart works.
    // In a real production app, you would replace this with a database fetch.
    const historyPoints = [];
    let base = currentCount;
    for (let i = 0; i < 24; i++) {
        // Create a random fluctuation around the current count
        const fluctuation = Math.floor(Math.random() * (base * 0.1)) - (base * 0.05);
        historyPoints.unshift(Math.floor(base + fluctuation));
    }
    // ----------------------------------

    const newGame: SelectedGame = {
      ...game,
      color: CHART_COLORS[selectedGames.length % CHART_COLORS.length],
      currentPlayers: currentCount,
      history: historyPoints
    };

    const newSelection = [...selectedGames, newGame];
    setSelectedGames(newSelection);
    setSearchResults([]); // Clear search
    setQuery('');
    updateChartData(newSelection);
  };

  const removeGame = (id: number) => {
    const newSelection = selectedGames.filter((g) => g.id !== id);
    setSelectedGames(newSelection);
    updateChartData(newSelection);
  };

  // Transform game data into Recharts format
  const updateChartData = (games: SelectedGame[]) => {
    if (games.length === 0) {
      setChartData([]);
      return;
    }

    // We assume 24 data points (e.g., last 24 hours)
    const data: PlayerData[] = Array.from({ length: 24 }).map((_, i) => {
        const hour = i;
        const point: PlayerData = { name: `${24 - hour}h ago` };
        
        games.forEach(game => {
            // Map the history array to the chart object
            if (game.history[i] !== undefined) {
                point[game.name] = game.history[i];
            }
        });
        return point;
    });

    setChartData(data);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 md:p-12 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <Activity className="text-blue-500" /> Steam Compare
            </h1>
            <p className="text-slate-400 mt-1">
              Search and compare concurrent player counts.
            </p>
          </div>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative w-full md:w-96">
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search games (e.g. Apex Legends)..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 focus:outline-none text-white"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            </div>
            
            {/* Search Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                {searchResults.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => addGame(game)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-800 flex items-center gap-3 transition-colors"
                  >
                    <img src={game.tiny_image} alt="" className="w-8 h-8 rounded object-cover" />
                    <span className="truncate text-sm font-medium">{game.name}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Selected Games Badges */}
        <div className="flex flex-wrap gap-3">
          {selectedGames.length === 0 && (
            <div className="text-slate-500 italic text-sm py-2">No games selected. Search to add.</div>
          )}
          {selectedGames.map((game) => (
            <div 
              key={game.id} 
              className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg pl-2 pr-4 py-2"
              style={{ borderLeft: `4px solid ${game.color}` }}
            >
              <img src={game.tiny_image} alt="" className="w-8 h-8 rounded" />
              <div>
                <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Current</div>
                <div className="font-mono text-lg font-bold text-white">
                  {game.currentPlayers.toLocaleString()}
                </div>
              </div>
              <div className="text-sm font-medium ml-2">{game.name}</div>
              <button 
                onClick={() => removeGame(game.id)}
                className="ml-2 hover:bg-slate-800 p-1 rounded-full text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Chart Area */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          <div className="h-[400px] w-full">
             {selectedGames.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis 
                      stroke="#94a3b8" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(value) => `${value / 1000}k`} 
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend />
                    {selectedGames.map((game) => (
                      <Line
                        key={game.id}
                        type="monotone"
                        dataKey={game.name}
                        stroke={game.color}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6 }}
                        animationDuration={1500}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
             ) : (
               <div className="h-full flex flex-col items-center justify-center text-slate-600">
                  <Activity className="w-16 h-16 mb-4 opacity-20" />
                  <p>Select games to generate comparison chart</p>
               </div>
             )}
          </div>
          <div className="mt-4 text-center text-xs text-slate-500">
            * Historical data simulated for demonstration. Current count fetched live from Steam API.
          </div>
        </div>

      </div>
    </div>
  );
}