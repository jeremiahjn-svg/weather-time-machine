'use client';

import React, { useState } from 'react';
import { format, subYears, addDays, subDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface LocationInfo {
  lat: number;
  lon: number;
  name: string;
}

interface PrimaryData {
  times: string[];
  temps: number[];
  startDate: Date;
  endDate: Date;
}

interface MergedChartPoint {
  dateLabel: string;
  primaryVal: number;
  histVal: number;
}

export default function WeatherTimeMachine() {
  const [query, setQuery] = useState<string>('');
  const [location, setLocation] = useState<LocationInfo | null>(null);
  
  // timeframe: 'forecast' (next 10 days) | 'past2weeks' (previous 14 days)
  const [timeframe, setTimeframe] = useState<'forecast' | 'past2weeks'>('forecast');

  // compareMode: 'single' | 'avg'
  const [compareMode, setCompareMode] = useState<'single' | 'avg'>('single');
  const [yearsAgo, setYearsAgo] = useState<number>(1); // 1-30 years ago
  const [avgSpan, setAvgSpan] = useState<number>(5); // 5, 10, 20, 30 years

  const [primaryDailyData, setPrimaryDailyData] = useState<PrimaryData | null>(null);
  const [chartData, setChartData] = useState<MergedChartPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [tempDiff, setTempDiff] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const dateFormat = 'yyyy-MM-dd';

  // Helper to fetch historical daily max temperatures for a specific date window
  const fetchHistoricalRange = async (
    lat: number,
    lon: number,
    startDate: Date,
    endDate: Date
  ): Promise<number[]> => {
    const res = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${format(
        startDate,
        dateFormat
      )}&end_date=${format(endDate, dateFormat)}&daily=temperature_2m_max&temperature_unit=fahrenheit&timezone=auto`
    );
    const data = await res.json();
    return data?.daily?.temperature_2m_max || [];
  };

  // Helper to get Primary Dataset (Forecast or Past 2 Weeks Actuals)
  const fetchPrimaryData = async (
    lat: number,
    lon: number,
    modeTimeframe: 'forecast' | 'past2weeks'
  ): Promise<PrimaryData> => {
    const today = new Date();

    if (modeTimeframe === 'forecast') {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max&forecast_days=10&temperature_unit=fahrenheit&timezone=auto`
      );
      const data = await res.json();
      if (!data.daily?.time) throw new Error('Could not retrieve forecast records.');
      return {
        times: data.daily.time,
        temps: data.daily.temperature_2m_max,
        startDate: today,
        endDate: addDays(today, 9)
      };
    } else {
      const pastStart = subDays(today, 14);
      const pastEnd = subDays(today, 1);
      const res = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${format(
          pastStart,
          dateFormat
        )}&end_date=${format(pastEnd, dateFormat)}&daily=temperature_2m_max&temperature_unit=fahrenheit&timezone=auto`
      );
      const data = await res.json();
      if (!data.daily?.time) throw new Error('Could not retrieve past 2 weeks actuals.');
      return {
        times: data.daily.time,
        temps: data.daily.temperature_2m_max,
        startDate: pastStart,
        endDate: pastEnd
      };
    }
  };

  // Master calculation engine
  const computeComparison = async (
    lat: number,
    lon: number,
    primaryInfo: PrimaryData,
    cMode: 'single' | 'avg',
    singleOffset: number,
    spanCount: number
  ) => {
    const { times, temps, startDate, endDate } = primaryInfo;
    let historicalDailyAverages: number[] = [];

    if (cMode === 'single') {
      const histStart = subYears(startDate, singleOffset);
      const histEnd = subYears(endDate, singleOffset);
      const fetchedTemps = await fetchHistoricalRange(lat, lon, histStart, histEnd);
      if (fetchedTemps.length === 0) throw new Error(`No historical data found for ${singleOffset} years ago.`);
      historicalDailyAverages = fetchedTemps;
    } else {
      const offsets = Array.from({ length: spanCount }, (_, i) => i + 1);
      const allYears = await Promise.all(
        offsets.map((offset) => {
          const histStart = subYears(startDate, offset);
          const histEnd = subYears(endDate, offset);
          return fetchHistoricalRange(lat, lon, histStart, histEnd);
        })
      );

      historicalDailyAverages = times.map((_, dayIndex: number) => {
        let sum = 0;
        let count = 0;
        allYears.forEach((yearArray) => {
          if (yearArray[dayIndex] !== undefined) {
            sum += yearArray[dayIndex];
            count++;
          }
        });
        return count > 0 ? sum / count : temps[dayIndex];
      });
    }

    let totalPrimary = 0;
    let totalHist = 0;

    const merged: MergedChartPoint[] = times.map((dateStr: string, index: number) => {
      const currentDate = new Date(dateStr);
      const primaryVal = temps[index];
      const histVal = historicalDailyAverages[index] ?? primaryVal;

      totalPrimary += primaryVal;
      totalHist += histVal;

      return {
        dateLabel: format(currentDate, 'MMM d'),
        primaryVal: Math.round(primaryVal),
        histVal: Math.round(histVal)
      };
    });

    const avgDiff = (totalPrimary - totalHist) / merged.length;
    setTempDiff(avgDiff.toFixed(1));
    setChartData(merged);
  };

  // Primary Search Submission
  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query) return;

    setLoading(true);
    setError('');
    setChartData([]);
    setTempDiff(null);

    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`
      );
      const geoData = await geoRes.json();

      if (!geoData.results || geoData.results.length === 0) {
        throw new Error('Location or zip code not found.');
      }

      const { latitude, longitude, name, admin1, country } = geoData.results[0];
      const locObj: LocationInfo = {
        lat: latitude,
        lon: longitude,
        name: `${name}${admin1 ? `, ${admin1}` : ''} (${country})`
      };
      setLocation(locObj);

      const primary = await fetchPrimaryData(latitude, longitude, timeframe);
      setPrimaryDailyData(primary);

      await computeComparison(latitude, longitude, primary, compareMode, yearsAgo, avgSpan);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong fetching data.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Timeframe change (Forecast vs Past 2 Weeks)
  const handleTimeframeChange = async (newTimeframe: 'forecast' | 'past2weeks') => {
    setTimeframe(newTimeframe);
    if (location) {
      setLoading(true);
      setError('');
      try {
        const primary = await fetchPrimaryData(location.lat, location.lon, newTimeframe);
        setPrimaryDailyData(primary);
        await computeComparison(location.lat, location.lon, primary, compareMode, yearsAgo, avgSpan);
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Switch single year offset
  const handleSingleYearChange = async (newYears: number) => {
    setCompareMode('single');
    setYearsAgo(newYears);
    if (location && primaryDailyData) {
      setLoading(true);
      try {
        await computeComparison(location.lat, location.lon, primaryDailyData, 'single', newYears, avgSpan);
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Switch average span
  const handleAvgSpanChange = async (span: number) => {
    setCompareMode('avg');
    setAvgSpan(span);
    if (location && primaryDailyData) {
      setLoading(true);
      try {
        await computeComparison(location.lat, location.lon, primaryDailyData, 'avg', yearsAgo, span);
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const comparisonLabel =
    compareMode === 'single'
      ? `${currentYear - yearsAgo} (${yearsAgo} ${yearsAgo === 1 ? 'Year' : 'Years'} Ago)`
      : `Past ${avgSpan}-Yr Avg (${currentYear - avgSpan}–${currentYear - 1})`;

  const primaryLabel = timeframe === 'forecast' ? '10-Day Forecast High' : 'Past 2-Week Actual High';

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">
            Weather Time Machine ⏳
          </h1>
          <p className="text-slate-400 text-sm md:text-base">
            Compare upcoming forecasts or recent 2-week actuals against historical records & multi-year averages.
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 justify-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter US Zip Code or City (e.g. 90210, Austin, London)"
            className="bg-slate-900 border border-slate-700 focus:border-sky-500 focus:outline-none px-4 py-3 rounded-xl w-full sm:w-96 text-white placeholder-slate-500 shadow-inner"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-sky-600 hover:bg-sky-500 active:bg-sky-700 transition-colors text-white font-semibold px-6 py-3 rounded-xl shadow-lg disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Crunching...' : 'Compare History'}
          </button>
        </form>

        {/* Controls Panel */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-2xl mx-auto space-y-6">
          
          {/* Target Timeframe Selector */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              1. Select Timeframe
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTimeframeChange('forecast')}
                className={`py-2.5 px-3 text-xs md:text-sm font-semibold rounded-xl border transition-all cursor-pointer ${
                  timeframe === 'forecast'
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-md'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                Upcoming 10-Day Forecast 🔮
              </button>
              <button
                type="button"
                onClick={() => handleTimeframeChange('past2weeks')}
                className={`py-2.5 px-3 text-xs md:text-sm font-semibold rounded-xl border transition-all cursor-pointer ${
                  timeframe === 'past2weeks'
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-md'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                Previous 2 Weeks (Actuals) 📅
              </button>
            </div>
          </div>

          {/* Historical Average Presets */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <span>2. Multi-Year Historical Baseline</span>
              {compareMode === 'avg' && (
                <span className="text-sky-400 lowercase normal-case text-xs">active</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 20, 30].map((span) => (
                <button
                  key={span}
                  type="button"
                  onClick={() => handleAvgSpanChange(span)}
                  className={`py-2 px-2 text-xs md:text-sm font-semibold rounded-xl border transition-all cursor-pointer ${
                    compareMode === 'avg' && avgSpan === span
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-md shadow-sky-950'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {span}-Yr Avg
                </button>
              ))}
            </div>
          </div>

          {/* 1-Year Slider with Steppers */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                OR Single Year Stepper
              </span>
              <span
                className={`text-sm font-bold px-3 py-1 rounded-lg border ${
                  compareMode === 'single'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {currentYear - yearsAgo} ({yearsAgo}y ago)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSingleYearChange(Math.max(1, yearsAgo - 1))}
                disabled={yearsAgo <= 1}
                className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white rounded-xl border border-slate-700 font-bold transition-colors cursor-pointer"
                title="1 Year Forward"
              >
                ◀
              </button>

              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={yearsAgo}
                onChange={(e) => handleSingleYearChange(parseInt(e.target.value))}
                className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 border border-slate-700"
              />

              <button
                type="button"
                onClick={() => handleSingleYearChange(Math.min(30, yearsAgo + 1))}
                disabled={yearsAgo >= 30}
                className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white rounded-xl border border-slate-700 font-bold transition-colors cursor-pointer"
                title="1 Year Back"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-200 p-4 rounded-xl text-center">
            {error}
          </div>
        )}

        {/* Chart Visualization */}
        {chartData.length > 0 && location && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">{location.name}</h2>
                <p className="text-xs text-slate-400">
                  {primaryLabel} vs. {comparisonLabel} (°F)
                </p>
              </div>
              {tempDiff !== null && (
                <div
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    Number(tempDiff) >= 0
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  {Number(tempDiff) >= 0
                    ? `+${tempDiff}°F warmer`
                    : `${tempDiff}°F cooler`}{' '}
                  than historical norm
                </div>
              )}
            </div>

            <div className="h-80 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="dateLabel" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} domain={['auto', 'auto']} unit="°" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderColor: '#1e293b',
                      borderRadius: '0.75rem',
                      color: '#fff'
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px' }} />
                  <Line
                    type="monotone"
                    dataKey="primaryVal"
                    name={`${primaryLabel} (°F)`}
                    stroke="#f43f5e"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="histVal"
                    name={`Historical High (°F) [${comparisonLabel}]`}
                    stroke="#38bdf8"
                    strokeWidth={3}
                    strokeDasharray="4 4"
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="text-center text-xs text-slate-500 pt-2">
              Historical weather calculated via Open-Meteo ERA5 Reanalysis Archive.
            </div>
          </div>
        )}

      </div>
    </main>
  );
}