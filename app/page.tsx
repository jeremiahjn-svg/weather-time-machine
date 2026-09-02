'use client';

import React, { useState } from 'react';
import { format, subYears, addDays, subDays } from 'date-fns';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  LabelList,
} from 'recharts';

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
  dateStr: string;
  dateLabel: string;
  primaryVal: number;
  histVal: number;
}

interface SingleDayHistoryPoint {
  year: number;
  temp: number;
  isCurrent?: boolean;
}

export default function WeatherTimeMachine() {
  const [query, setQuery] = useState<string>('');
  const [location, setLocation] = useState<LocationInfo | null>(null);

  const [timeframe, setTimeframe] = useState<'forecast' | 'past2weeks'>('forecast');
  const [compareMode, setCompareMode] = useState<'single' | 'avg'>('avg');
  const [yearsAgo, setYearsAgo] = useState<number>(1);
  const [avgSpan, setAvgSpan] = useState<number>(10);

  const [primaryDailyData, setPrimaryDailyData] = useState<PrimaryData | null>(null);
  const [chartData, setChartData] = useState<MergedChartPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [tempDiff, setTempDiff] = useState<string | null>(null);

  // Drill-down 30-Year Bar Chart State (Controlled by Line Chart)
  const [selectedDayDate, setSelectedDayDate] = useState<string>('');
  const [selectedDayLabel, setSelectedDayLabel] = useState<string>('');
  const [selectedDayPrimaryTemp, setSelectedDayPrimaryTemp] = useState<number | null>(null);
  const [barData, setBarData] = useState<SingleDayHistoryPoint[]>([]);
  const [loadingBar, setLoadingBar] = useState<boolean>(false);

  const currentYear = new Date().getFullYear();
  const dateFormat = 'yyyy-MM-dd';

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
        endDate: addDays(today, 9),
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
        endDate: pastEnd,
      };
    }
  };

  const load30YearBarHistory = async (lat: number, lon: number, dateString: string, primaryTemp: number) => {
    setLoadingBar(true);
    setSelectedDayDate(dateString);
    setSelectedDayPrimaryTemp(primaryTemp);

    try {
      const targetDate = new Date(dateString);
      setSelectedDayLabel(format(targetDate, 'MMM d'));
      const offsets = Array.from({ length: 30 }, (_, i) => 30 - i);

      const historyPoints = await Promise.all(
        offsets.map(async (offset) => {
          const pastDate = subYears(targetDate, offset);
          const temps = await fetchHistoricalRange(lat, lon, pastDate, pastDate);
          return {
            year: pastDate.getFullYear(),
            temp: temps.length > 0 ? Math.round(temps[0]) : 0,
            isCurrent: false,
          };
        })
      );

      historyPoints.push({
        year: currentYear,
        temp: Math.round(primaryTemp),
        isCurrent: true,
      });

      setBarData(historyPoints.filter((p) => p.temp !== 0));
    } catch {
      // Keep existing data on failure
    } finally {
      setLoadingBar(false);
    }
  };

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
        dateStr,
        dateLabel: format(currentDate, 'MMM d'),
        primaryVal: Math.round(primaryVal),
        histVal: Math.round(histVal),
      };
    });

    const avgDiff = (totalPrimary - totalHist) / merged.length;
    setTempDiff(avgDiff.toFixed(1));
    setChartData(merged);

    // Default to the first day for drill-down view
    if (merged.length > 0) {
      load30YearBarHistory(lat, lon, merged[0].dateStr, merged[0].primaryVal);
    }
  };

  const handleSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query) return;

    setLoading(true);
    setError('');
    setChartData([]);
    setBarData([]);
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
        name: `${name}${admin1 ? `, ${admin1}` : ''} (${country})`,
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

  // Robust Selection Logic
  const handlePointSelect = (point: MergedChartPoint) => {
    if (!location) return;
    load30YearBarHistory(location.lat, location.lon, point.dateStr, point.primaryVal);
  };

  const handleLineChartClick = (state: any) => {
    if (!state || !location || chartData.length === 0) return;

    if (state.activePayload && state.activePayload.length > 0) {
      const clickedData = state.activePayload[0].payload as MergedChartPoint;
      handlePointSelect(clickedData);
      return;
    }

    if (typeof state.activeTooltipIndex === 'number' && chartData[state.activeTooltipIndex]) {
      handlePointSelect(chartData[state.activeTooltipIndex]);
      return;
    }

    if (state.activeLabel) {
      const matched = chartData.find((d) => d.dateLabel === state.activeLabel);
      if (matched) handlePointSelect(matched);
    }
  };

  const comparisonLabel =
    compareMode === 'single'
      ? `${currentYear - yearsAgo} (${yearsAgo}y ago)`
      : `Past ${avgSpan}-Yr Avg`;

  const primaryLabel = timeframe === 'forecast' ? '10-Day Forecast High' : 'Past 2-Week Actual High';

  // Stats calculation for the selected day's 30-year bar chart
  const historicalOnly = barData.filter((b) => !b.isCurrent);

  const barMax =
    historicalOnly.length > 0
      ? historicalOnly.reduce((prev, curr) => (curr.temp > prev.temp ? curr : prev), historicalOnly[0])
      : null;

  const barMin =
    historicalOnly.length > 0
      ? historicalOnly.reduce((prev, curr) => (curr.temp < prev.temp ? curr : prev), historicalOnly[0])
      : null;

  const barHistoricalAvg =
    historicalOnly.length > 0
      ? Math.round(historicalOnly.reduce((acc, cur) => acc + cur.temp, 0) / historicalOnly.length)
      : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">
            Temp Trends ⏳
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto">
            Analyze upcoming forecasts and recent temperatures against 30-year historical climate baselines.
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 justify-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter City or Zip (e.g. 92120, Austin, Chicago)"
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
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl max-w-3xl mx-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Timeframe Selector */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                1. Timeframe
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTimeframeChange('forecast')}
                  className={`py-2 px-3 text-xs md:text-sm font-semibold rounded-xl border transition-all cursor-pointer ${
                    timeframe === 'forecast'
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-md'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  10-Day Forecast 🔮
                </button>
                <button
                  type="button"
                  onClick={() => handleTimeframeChange('past2weeks')}
                  className={`py-2 px-3 text-xs md:text-sm font-semibold rounded-xl border transition-all cursor-pointer ${
                    timeframe === 'past2weeks'
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-md'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  Past 2 Weeks 📅
                </button>
              </div>
            </div>

            {/* Baseline Presets */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <span>2. Multi-Year Baseline</span>
                {compareMode === 'avg' && <span className="text-sky-400 text-xs">active</span>}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 20, 30].map((span) => (
                  <button
                    key={span}
                    type="button"
                    onClick={() => handleAvgSpanChange(span)}
                    className={`py-2 px-1 text-xs md:text-sm font-semibold rounded-xl border transition-all cursor-pointer ${
                      compareMode === 'avg' && avgSpan === span
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300 shadow-md'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {span}-Yr
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Stepper for single year */}
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <span>Or compare against a single year:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSingleYearChange(Math.max(1, yearsAgo - 1))}
                disabled={yearsAgo <= 1}
                className="px-2 py-1 bg-slate-800 rounded border border-slate-700 disabled:opacity-30"
              >
                ◀
              </button>
              <span className="font-bold text-sky-300 px-2">{currentYear - yearsAgo} ({yearsAgo}y ago)</span>
              <button
                type="button"
                onClick={() => handleSingleYearChange(Math.min(30, yearsAgo + 1))}
                disabled={yearsAgo >= 30}
                className="px-2 py-1 bg-slate-800 rounded border border-slate-700 disabled:opacity-30"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-200 p-4 rounded-xl text-center">
            {error}
          </div>
        )}

        {/* PRIMARY CONTROLLER (TOP): Multi-Day Range Line Chart */}
        {chartData.length > 0 && location && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">{location.name} Overview</h2>
                <p className="text-xs text-slate-400">
                  {primaryLabel} vs. {comparisonLabel} (°F) — <span className="text-sky-400 font-medium">Click any point to drill down into 30-year history</span>
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
                  {Number(tempDiff) >= 0 ? `+${tempDiff}°F warmer` : `${tempDiff}°F cooler`} than baseline
                </div>
              )}
            </div>

            <div className="h-72 w-full cursor-pointer select-none">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 20, bottom: 5, left: -20 }}
                  onClick={handleLineChartClick}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="dateLabel" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} domain={['auto', 'auto']} unit="°" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderColor: '#1e293b',
                      borderRadius: '0.75rem',
                      color: '#fff',
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '8px' }} />

                  {/* Vertical cursor line highlighting the currently selected date */}
                  {selectedDayLabel && (
                    <ReferenceLine
                      x={selectedDayLabel}
                      stroke="#f43f5e"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                    />
                  )}

                  <Line
                    type="monotone"
                    dataKey="primaryVal"
                    name={`${primaryLabel} (°F)`}
                    stroke="#f43f5e"
                    strokeWidth={3}
                    dot={(dotProps: any) => {
                      const { cx, cy, payload } = dotProps;
                      const isSelected = selectedDayDate === payload.dateStr;
                      return (
                        <circle
                          key={`dot-${payload.dateStr}`}
                          cx={cx}
                          cy={cy}
                          r={isSelected ? 7 : 4}
                          fill={isSelected ? '#f43f5e' : '#fb7185'}
                          stroke="#ffffff"
                          strokeWidth={isSelected ? 2 : 1}
                          className="cursor-pointer transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePointSelect(payload);
                          }}
                        />
                      );
                    }}
                    activeDot={{
                      r: 8,
                      cursor: 'pointer',
                      onClick: (_: any, event: any) => {
                        event?.stopPropagation?.();
                        if (event?.payload) handlePointSelect(event.payload);
                      },
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="histVal"
                    name={`Historical Baseline (°F)`}
                    stroke="#38bdf8"
                    strokeWidth={3}
                    strokeDasharray="4 4"
                    dot={{ r: 3, cursor: 'pointer' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* SECONDARY DRILL-DOWN (BOTTOM): 30-Year History Bar Chart & Stats */}
        {chartData.length > 0 && location && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  30-Year History: {selectedDayDate ? format(new Date(selectedDayDate), 'MMMM d') : ''}
                </h3>
                <p className="text-xs text-slate-400">
                  Daily high temperatures across every year from {currentYear - 30} to {currentYear}.
                </p>
              </div>
              <div className="text-xs bg-slate-800/80 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg">
                Showing data for <span className="font-bold text-rose-400">{selectedDayLabel}</span>
              </div>
            </div>

            {/* SUMMARY STATS BAR */}
            {barData.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                    {timeframe === 'forecast' ? 'Forecast' : 'Current Actual'}
                  </div>
                  <div className="text-xl font-extrabold text-rose-400">
                    {selectedDayPrimaryTemp !== null ? `${Math.round(selectedDayPrimaryTemp)}°F` : '--'}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                    30-Yr Max
                  </div>
                  <div className="text-xl font-extrabold text-orange-400 flex items-baseline gap-1.5">
                    {barMax ? `${barMax.temp}°F` : '--'}
                    {barMax && <span className="text-xs font-normal text-slate-500">({barMax.year})</span>}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                    30-Yr Min
                  </div>
                  <div className="text-xl font-extrabold text-cyan-400 flex items-baseline gap-1.5">
                    {barMin ? `${barMin.temp}°F` : '--'}
                    {barMin && <span className="text-xs font-normal text-slate-500">({barMin.year})</span>}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                    30-Yr Mean (Avg)
                  </div>
                  <div className="text-xl font-extrabold text-sky-400">
                    {barHistoricalAvg !== null ? `${barHistoricalAvg}°F` : '--'}
                  </div>
                </div>
              </div>
            )}

            {loadingBar ? (
              <div className="h-72 flex items-center justify-center text-slate-400 text-sm animate-pulse">
                Fetching 30 years of daily readings for {selectedDayDate}...
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 25, right: 10, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="year"
                      stroke="#94a3b8"
                      fontSize={11}
                      interval={2}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={['auto', 'auto']} unit="°" />
                    <Tooltip
                      formatter={(val: any) => [`${val}°F`, 'High Temp']}
                      labelFormatter={(label) => `Year: ${label}`}
                      contentStyle={{
                        backgroundColor: '#020617',
                        borderColor: '#1e293b',
                        borderRadius: '0.75rem',
                        color: '#fff',
                      }}
                    />
                    {barHistoricalAvg && (
                      <ReferenceLine
                        y={barHistoricalAvg}
                        stroke="#38bdf8"
                        strokeDasharray="3 3"
                        label={{
                          value: `Mean: ${barHistoricalAvg}°`,
                          fill: '#38bdf8',
                          fontSize: 10,
                          position: 'top',
                        }}
                      />
                    )}
                    <Bar dataKey="temp" radius={[4, 4, 0, 0]}>
                      <LabelList
                        dataKey="temp"
                        position="top"
                        fill="#cbd5e1"
                        fontSize={10}
                        formatter={(val: any) => `${val}°`}
                      />
                      {barData.map((entry) => (
                        <Cell
                          key={`cell-${entry.year}`}
                          fill={entry.isCurrent ? '#f43f5e' : '#38bdf8'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-rose-500 rounded-sm inline-block"></span>
                  {currentYear} Current / Forecasted
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-sky-400 rounded-sm inline-block"></span>
                  Past Years ({currentYear - 30}–{currentYear - 1})
                </span>
              </div>
              <span>Open-Meteo Historical ERA5 Archive</span>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}