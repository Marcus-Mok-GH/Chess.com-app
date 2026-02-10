import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import './WinRateChart.css';

export default function WinRateChart({ history = [] }) {
  const chartData = useMemo(() => {
    if (!history || history.length === 0) {
      return [];
    }

    // Sort history by date ascending to track progress over time
    const sortedHistory = [...history].sort((a, b) => 
      new Date(a.created_at) - new Date(b.created_at)
    );

    const data = [];
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalGames = 0;

    // Add initial point at 0 games
    data.push({
      game: 0,
      winRate: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
      result: 'start'
    });

    sortedHistory.forEach((entry, index) => {
      if (entry.result === 'win') {
        wins++;
      } else if (entry.result === 'loss') {
        losses++;
      } else if (entry.result === 'draw') {
        draws++;
      }
      totalGames++;

      // Calculate win rate as percentage
      const winRate = totalGames > 0 ? ((wins / totalGames) * 100) : 0;

      data.push({
        game: totalGames,
        winRate: Number(winRate.toFixed(1)),
        wins,
        losses,
        draws,
        totalGames,
        result: entry.result,
        gameCode: entry.game_code,
        opponentElo: entry.opponent_elo,
        date: entry.created_at
      });
    });

    return data;
  }, [history]);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="winrate-chart-container">
        <div className="winrate-chart-placeholder">
          <p>No game history available</p>
          <p className="hint">Play games to track your win rate</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getLineColor = (winRate) => {
    if (winRate >= 60) return '#81b64c';
    if (winRate >= 50) return '#b8b8b8';
    return '#e57373';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) {
      return null;
    }

    const data = payload[0].payload;

    return (
      <div className="winrate-tooltip">
        <div className="tooltip-header">
          <span className="tooltip-games">Game {data.game}</span>
          <span className={`tooltip-winrate ${data.winRate >= 50 ? 'positive' : 'negative'}`}>
            {data.winRate}% win rate
          </span>
        </div>
        <div className="tooltip-stats">
          <span className="stat-item win">{data.wins}W</span>
          <span className="stat-item loss">{data.losses}L</span>
          <span className="stat-item draw">{data.draws}D</span>
        </div>
        {data.gameCode && (
          <div className="tooltip-game">
            <span className="game-result">{data.result}</span>
            <span className="game-code">vs {data.opponentElo}</span>
          </div>
        )}
        <div className="tooltip-date">{formatDate(data.date)}</div>
      </div>
    );
  };

  // Calculate domain for Y-axis (0-100 for win rate percentage)
  const winRateMin = 0;
  const winRateMax = 100;

  return (
    <div className="winrate-chart-container">
      <div className="winrate-chart-header">
        <h2 className="winrate-chart-title">Win Rate Over Time</h2>
        <div className="winrate-chart-legend">
          <div className="legend-item">
            <span className="legend-dot win"></span>
            <span>Win</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot loss"></span>
            <span>Loss</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot draw"></span>
            <span>Draw</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3937" />
          <XAxis
            dataKey="game"
            tick={{ fill: '#b8b8b8' }}
            tickLine={{ stroke: '#3a3937' }}
            axisLine={{ stroke: '#3a3937' }}
            label={{ value: 'Games', position: 'insideBottom', offset: -10, fill: '#9a9a9a' }}
          />
          <YAxis
            domain={[winRateMin, winRateMax]}
            tick={{ fill: '#b8b8b8', formatter: (value) => `${value}%` }}
            tickLine={{ stroke: '#3a3937' }}
            axisLine={{ stroke: '#3a3937' }}
            label={{ value: 'Win Rate', angle: -90, position: 'insideLeft', fill: '#9a9a9a' }}
          />
          <ReferenceLine y={50} stroke="#4a4744" strokeDasharray="5 5" label={{ value: '50%', fill: '#6a6767', fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="winRate"
            stroke={getLineColor(chartData[chartData.length - 1]?.winRate || 0)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}