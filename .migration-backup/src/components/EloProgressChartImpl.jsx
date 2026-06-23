import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts';
import './EloProgressChart.css';

const EloProgressChart = ({ history = [], currentElo }) => {
  const chartData = useMemo(() => {
    // Always start with initial ELO of 1200
    const data = [
      {
        game: 0,
        elo: 1200,
        change: 0,
        result: 'start',
        date: new Date().toISOString(),
        opponentElo: null,
      },
    ];

    // Sort history by date ascending
    const sortedHistory = [...history].sort((a, b) =>
      new Date(a.created_at) - new Date(b.created_at)
    );

    sortedHistory.forEach((entry, index) => {
      data.push({
        game: index + 1,
        elo: entry.elo,
        change: entry.change,
        result: entry.result,
        date: entry.created_at,
        opponentElo: entry.opponent_elo,
        gameCode: entry.game_code,
      });
    });

    // If current ELO is different from last entry, add it
    if (data.length > 1 && currentElo !== undefined && data[data.length - 1].elo !== currentElo) {
      data.push({
        game: data.length - 1,
        elo: currentElo,
        change: currentElo - data[data.length - 1].elo,
        result: 'current',
        date: new Date().toISOString(),
        opponentElo: null,
      });
    }

    return data;
  }, [history, currentElo]);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="elo-chart-container">
        <div className="elo-chart-placeholder">
          <p>No ELO history available</p>
          <p className="hint">Play ranked games to track your progress</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getResultColor = (result) => {
    switch (result) {
      case 'win': return '#81b64c';
      case 'loss': return '#e57373';
      case 'draw': return '#9e9b98';
      case 'start': return '#81b64c';
      case 'current': return '#fff';
      default: return '#81b64c';
    }
  };

  const getCustomDot = (props) => {
    const { cx, cy, payload } = props;
    const color = getResultColor(payload.result);
    const size = payload.result === 'start' || payload.result === 'current' ? 6 : 4;
    const stroke = payload.result === 'current' ? '#fff' : 'none';
    const strokeWidth = payload.result === 'current' ? 2 : 0;

    return (
      <Dot
        {...props}
        cx={cx}
        cy={cy}
        r={size}
        fill={color}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) {
      return null;
    }

    const data = payload[0].payload;

    return (
      <div className="elo-tooltip">
        <div className="tooltip-header">
          <span className="tooltip-elo">{data.elo}</span>
          {data.change !== 0 && (
            <span className={`tooltip-change ${data.change > 0 ? 'positive' : 'negative'}`}>
              {data.change > 0 ? '+' : ''}{data.change}
            </span>
          )}
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

  const eloMin = Math.min(...chartData.map(d => d.elo)) - 50;
  const eloMax = Math.max(...chartData.map(d => d.elo)) + 50;

  return (
    <div className="elo-chart-container">
      <div className="elo-chart-header">
        <h2 className="elo-chart-title">ELO Progress</h2>
        <div className="elo-chart-legend">
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
            domain={[eloMin, eloMax]}
            tick={{ fill: '#b8b8b8' }}
            tickLine={{ stroke: '#3a3937' }}
            axisLine={{ stroke: '#3a3937' }}
            label={{ value: 'ELO', angle: -90, position: 'insideLeft', fill: '#9a9a9a' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="elo"
            stroke="#81b64c"
            strokeWidth={2}
            dot={getCustomDot}
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default EloProgressChart;
