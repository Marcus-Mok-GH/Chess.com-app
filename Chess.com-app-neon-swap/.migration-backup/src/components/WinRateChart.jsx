import React, { Suspense, lazy } from 'react';

const LazyWinRateChart = lazy(() => import('./WinRateChartImpl'));

const WinRateChart = (props) => (
  <Suspense fallback={<div className="chart-loading">Loading Win Rate Chart...</div>}>
    <LazyWinRateChart {...props} />
  </Suspense>
);

export default WinRateChart;
