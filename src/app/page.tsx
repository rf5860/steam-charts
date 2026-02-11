'use client';

import React, { useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea 
} from 'recharts';
import { Search, X, Activity, AlertCircle, RotateCcw } from 'lucide-react';
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

// Utility function to aggregate data points by time interval with outlier preservation
const aggregateData = (data: HistoricalPoint[], intervalMs: number): HistoricalPoint[] => {
  if (data.length === 0) return [];
  
  // Group data points into buckets
  const buckets = new Map<number, HistoricalPoint[]>();
  
  data.forEach(point => {
    // Round down to the nearest interval
    const bucketKey = Math.floor(point.date / intervalMs) * intervalMs;
    
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    
    buckets.get(bucketKey)!.push(point);
  });
  
  // Process each bucket to detect and preserve outliers
  const result: HistoricalPoint[] = [];
  
  buckets.forEach((points, bucketDate) => {
    if (points.length === 1) {
      // Single point - use it at the bucket timestamp for consistency
      result.push({ date: bucketDate, count: points[0].count });
      return;
    }
    
    // Calculate mean and median
    const mean = points.reduce((sum, p) => sum + p.count, 0) / points.length;
    const sortedCounts = points.map(p => p.count).sort((a, b) => a - b);
    const median = sortedCounts[Math.floor(sortedCounts.length / 2)];
    
    // Calculate standard deviation
    const variance = points.reduce((sum, p) => sum + Math.pow(p.count - mean, 2), 0) / points.length;
    const stdDev = Math.sqrt(variance);
    
    // Identify outliers - only preserve UPWARD spikes (values significantly above mean)
    // Using 1.5 standard deviations as threshold, or 50% deviation for low stdDev cases
    const threshold = Math.max(stdDev * 1.5, mean * 0.5);
    
    const upwardOutliers: HistoricalPoint[] = [];
    const normalPoints: HistoricalPoint[] = [];
    
    points.forEach(point => {
      // Only treat as outlier if it's significantly ABOVE the mean (spike)
      if (point.count > mean && (point.count - mean) > threshold) {
        upwardOutliers.push(point);
      } else {
        normalPoints.push(point);
      }
    });
    
    // Always add a representative point at the bucket timestamp for continuity
    if (normalPoints.length > 0) {
      // Use average of normal points
      const normalAvg = Math.round(
        normalPoints.reduce((sum, p) => sum + p.count, 0) / normalPoints.length
      );
      result.push({ date: bucketDate, count: normalAvg });
    } else {
      // All points are outliers - use median for the bucket timestamp
      result.push({ date: bucketDate, count: Math.round(median) });
    }
    
    // Add upward outliers with their actual timestamps
    if (upwardOutliers.length > 0) {
      upwardOutliers.forEach(outlier => result.push(outlier));
    }
  });
  
  return result.sort((a, b) => a.date - b.date);
};

// Determine appropriate interval based on time range
const getAggregationInterval = (startDate: number, endDate: number): number => {
  const rangeMs = endDate - startDate;
  const DAY = 24 * 60 * 60 * 1000;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  
  if (rangeMs <= 7 * DAY) {
    // Less than 7 days: hourly (or keep all data)
    return 60 * 60 * 1000; // 1 hour
  } else if (rangeMs <= 3 * MONTH) {
    // 7 days to 3 months: daily
    return DAY;
  } else if (rangeMs <= 12 * MONTH) {
    // 3 months to 1 year: weekly
    return WEEK;
  } else {
    // More than 1 year: monthly
    return MONTH;
  }
};

// Get appropriate date format based on time range
const getDateFormat = (startDate: number, endDate: number): string => {
  const rangeMs = endDate - startDate;
  const DAY = 24 * 60 * 60 * 1000;
  const MONTH = 30 * DAY;
  
  if (rangeMs <= 7 * DAY) {
    return 'MMM d, HH:mm';
  } else if (rangeMs <= 3 * MONTH) {
    return 'MMM d';
  } else if (rangeMs <= 12 * MONTH) {
    return 'MMM d, yyyy';
  } else {
    return 'MMM yyyy';
  }
};

export default function SteamCompareApp() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Game[]>([]);
  const [selectedGames, setSelectedGames] = useState<SelectedGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usedColors, setUsedColors] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState<number | null>(null);
  const [endDate, setEndDate] = useState<number | null>(null);
  
  // State for drag-to-zoom
  const [refAreaLeft, setRefAreaLeft] = useState<string | number>('');
  const [refAreaRight, setRefAreaRight] = useState<string | number>('');
  const [isSelecting, setIsSelecting] = useState(false);

  // Get next available color
  const getNextAvailableColor = (): string => {
    for (const color of COLORS) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    // If all colors are used, cycle through them
    return COLORS[selectedGames.length % COLORS.length];
  };

  // Calculate smart default date range when games change
  useEffect(() => {
    if (selectedGames.length === 0) {
      setStartDate(null);
      setEndDate(null);
      return;
    }

    // Find the intersection of all games' date ranges
    let maxStart = -Infinity;
    let minEnd = Infinity;

    selectedGames.forEach(game => {
      if (game.data.length > 0) {
        const gameStart = game.data[0].date;
        const gameEnd = game.data[game.data.length - 1].date;
        maxStart = Math.max(maxStart, gameStart);
        minEnd = Math.min(minEnd, gameEnd);
      }
    });

    // If there's an intersection, use it
    if (maxStart <= minEnd && maxStart !== -Infinity) {
      setStartDate(maxStart);
      setEndDate(minEnd);
    } else {
      // No intersection - default to most recent 12 months
      const now = Date.now();
      const twelveMonthsAgo = now - (365 * 24 * 60 * 60 * 1000);
      setStartDate(twelveMonthsAgo);
      setEndDate(now);
    }
  }, [selectedGames]);

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

      const color = getNextAvailableColor();
      const newGame: SelectedGame = {
        ...game,
        color,
        data: json.data // Real historical data
      };

      setUsedColors(prev => new Set([...prev, color]));
      setSelectedGames(prev => [...prev, newGame]);
    } catch {
      setError(`Could not load data for ${game.name}. It might not be tracked publicly.`);
    } finally {
      setLoading(false);
    }
  };

  const removeGame = (id: number) => {
    const gameToRemove = selectedGames.find(g => g.id === id);
    if (gameToRemove) {
      setUsedColors(prev => {
        const newSet = new Set(prev);
        newSet.delete(gameToRemove.color);
        return newSet;
      });
    }
    setSelectedGames(prev => prev.filter(g => g.id !== id));
  };

  // 3. Process Data for Recharts with aggregation
  const processChartData = () => {
    if (selectedGames.length === 0 || startDate === null || endDate === null) return [];

    // Determine aggregation interval based on date range
    const intervalMs = getAggregationInterval(startDate, endDate);

    // Aggregate each game's data first
    const aggregatedGames = selectedGames.map(game => {
      // Filter data to date range first
      const filteredData = game.data.filter(point => point.date >= startDate && point.date <= endDate);
      
      // Aggregate the filtered data
      const aggregated = aggregateData(filteredData, intervalMs);
      
      return {
        ...game,
        aggregatedData: aggregated
      };
    });

    // Create a map of all unique dates across all aggregated games
    const dateMap = new Map<number, any>();

    aggregatedGames.forEach(game => {
      game.aggregatedData.forEach(point => {
        const dateKey = point.date;
        
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { date: dateKey });
        }
        // Add this game's count to the date object
        dateMap.get(dateKey)[game.name] = point.count;
      });
    });

    // Convert map to array and sort by date
    const data = Array.from(dateMap.values()).sort((a, b) => a.date - b.date);

    return data;
  };

  const chartData = processChartData();
  
  // Get dynamic date format based on current range
  const dateFormat = startDate !== null && endDate !== null 
    ? getDateFormat(startDate, endDate) 
    : 'MMM yyyy';

  // Reset zoom to default
  const resetZoom = () => {
    if (selectedGames.length === 0) return;

    // Recalculate default range
    let maxStart = -Infinity;
    let minEnd = Infinity;

    selectedGames.forEach(game => {
      if (game.data.length > 0) {
        const gameStart = game.data[0].date;
        const gameEnd = game.data[game.data.length - 1].date;
        maxStart = Math.max(maxStart, gameStart);
        minEnd = Math.min(minEnd, gameEnd);
      }
    });

    if (maxStart <= minEnd && maxStart !== -Infinity) {
      setStartDate(maxStart);
      setEndDate(minEnd);
    } else {
      const now = Date.now();
      const twelveMonthsAgo = now - (365 * 24 * 60 * 60 * 1000);
      setStartDate(twelveMonthsAgo);
      setEndDate(now);
    }
  };

  // Drag-to-zoom handlers
  const handleMouseDown = (e: any) => {
    if (e && e.activeLabel) {
      setRefAreaLeft(e.activeLabel);
      setIsSelecting(true);
    }
  };

  const handleMouseMove = (e: any) => {
    if (isSelecting && e && e.activeLabel) {
      setRefAreaRight(e.activeLabel);
    }
  };

  const handleMouseUp = () => {
    if (!isSelecting) return;
    
    setIsSelecting(false);
    
    if (refAreaLeft === refAreaRight || refAreaRight === '') {
      setRefAreaLeft('');
      setRefAreaRight('');
      return;
    }

    // Zoom into the selected area
    let left = typeof refAreaLeft === 'number' ? refAreaLeft : parseInt(refAreaLeft);
    let right = typeof refAreaRight === 'number' ? refAreaRight : parseInt(refAreaRight);

    if (left > right) {
      [left, right] = [right, left];
    }

    setStartDate(left);
    setEndDate(right);
    setRefAreaLeft('');
    setRefAreaRight('');
  };

  // Handle date input changes
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = new Date(e.target.value).getTime();
    if (!isNaN(newStart)) {
      setStartDate(newStart);
    }
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = new Date(e.target.value).getTime();
    if (!isNaN(newEnd)) {
      setEndDate(newEnd);
    }
  };

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

        {/* Date Range Controls */}
        {selectedGames.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-400">Start Date:</label>
              <input
                type="date"
                value={startDate ? format(new Date(startDate), 'yyyy-MM-dd') : ''}
                onChange={handleStartDateChange}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-1 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-400">End Date:</label>
              <input
                type="date"
                value={endDate ? format(new Date(endDate), 'yyyy-MM-dd') : ''}
                onChange={handleEndDateChange}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-1 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <button
              onClick={resetZoom}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-3 py-1 text-sm text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Zoom
            </button>
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
              <AreaChart 
                data={chartData}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
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
                  tickFormatter={(unix) => format(new Date(unix), dateFormat)}
                  minTickGap={50}
                  domain={['dataMin', 'dataMax']}
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
                    connectNulls={true}
                  />
                ))}
                {refAreaLeft && refAreaRight && (
                  <ReferenceArea
                    x1={refAreaLeft}
                    x2={refAreaRight}
                    strokeOpacity={0.3}
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-600">
              <Activity className="w-16 h-16 mb-4 opacity-20" />
              <p>Add a game to view its lifetime player history</p>
              <p className="text-sm mt-2 text-slate-700">Tip: Click and drag on the chart to zoom into a time range</p>
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
