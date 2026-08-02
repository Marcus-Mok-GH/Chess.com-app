import React, { Suspense, lazy } from 'react';

const LazyEloProgressChart = lazy(() => import('./EloProgressChartImpl'));

const EloProgressChart = (props) => (
  <Suspense fallback={<div className="chart-loading">Loading Elo Chart...</div>}>
    <LazyEloProgressChart {...props} />
  </Suspense>
);

export default EloProgressChart;
